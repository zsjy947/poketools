"""52poke 精灵图/道具图兜底：fetch_sprites.py（PokeAPI 三级回退）与 fetch_calc_assets.py
（PokeAPI items + Bag 模板回退）之后仍缺的部分，按「52poke File 标题 → imageinfo 直链 →
Referer 下载」抓取。

- 命中映射持久化 data/curated/sprite_overrides_52poke.json（form_id / item_ident → File 标题），
  重跑幂等（已落盘的图直接跳过，映射只增不改）；
- 仍失败项写入 data/curated/TODO.json 的 sprite_52poke_failed 键（每次重跑整体覆盖），不静默丢弃；
- 同时按剩余缺口重写 data/curated/item_icons_missing.txt 台账。

运行：python scripts/fetch_sprites_52poke.py（在 fetch_sprites.py / fetch_calc_assets.py 之后）
"""
from __future__ import annotations

import json
import re
import sqlite3
import sys
import time
from pathlib import Path

import wiki_client as wc
from fetch_sprites import OUT as PKT_OUT
from fetch_sprites import shrink

ROOT = wc.ROOT
DB_PATH = ROOT / "data" / "poketools.db"
ITEMS_OUT = ROOT / "web" / "public" / "assets" / "items"
OVERRIDES = ROOT / "data" / "curated" / "sprite_overrides_52poke.json"
TODO = ROOT / "data" / "curated" / "TODO.json"
MISSING_TXT = ROOT / "data" / "curated" / "item_icons_missing.txt"

# 形态图人工映射：52poke 实际文件名与 PokeAPI identifier 无法互相推导的部分
# （Dream = 官方梦境世界绘图的透明底版本，官方绘图缺位时的最近替代）。
FORM_TITLES: dict[str, str] = {
    "koraidon-limited-build": "File:1007Koraidon-Limited Build Dream.png",
    "koraidon-swimming-build": "File:1007Koraidon-Swimming Build.png",
    "miraidon-low-power-mode": "File:1008Miraidon-Low-Power Mode Dream.png",
    "miraidon-aquatic-mode": "File:1008Miraidon-Aquatic Mode.png",
    "sinistea-antique": "File:854Sinistea-Antique Form Dream.png",
    "polteageist-antique": "File:855Polteageist-Antique Form Dream.png",
    "poltchageist-artisan": "File:1012Poltchageist-Artisan Form Dream.png",
    "sinistcha-masterpiece": "File:1013Sinistcha-Masterpiece Form Dream.png",
    "frillish-female": "File:592Frillish-Female.png",
    "jellicent-female": "File:593Jellicent-Famale.png",  # 52poke 文件名即此拼写（Famale）
    "pyroar-female": "File:668Pyroar-Female.png",
}

# 霜奶仙 62 形态：52poke 命名 869Alcremie{奶油码}{糖码}.png（与 identifier 的推导表）
ALCREMIE_CREAM = {
    "vanilla-cream": "VanillaCream",
    "ruby-cream": "RubyCream",
    "matcha-cream": "MatchaCream",
    "mint-cream": "MintCream",
    "lemon-cream": "LemonCream",
    "salted-cream": "SaltedCream",
    "ruby-swirl": "RubySwirl",
    "caramel-swirl": "CaramelSwirl",
    "rainbow-swirl": "RainbowSwirl",
}
ALCREMIE_SWEET = {
    "strawberry-sweet": "SbS",
    "berry-sweet": "BS",
    "love-sweet": "LS",
    "star-sweet": "StS",
    "clover-sweet": "CS",
    "flower-sweet": "FS",
    "ribbon-sweet": "RS",
}
_ALCREMIE_RE = re.compile(
    r"alcremie-(" + "|".join(ALCREMIE_CREAM) + r")-(" + "|".join(ALCREMIE_SWEET) + r")$"
)

# 道具图人工映射（Bag {中文名} 系列推导不出的：拼写差异/无中文名行）
ITEM_TITLES: dict[str, list[str]] = {}


def alcremie_title(identifier: str) -> str | None:
    m = _ALCREMIE_RE.match(identifier)
    if not m:
        return None
    return f"File:869Alcremie-{ALCREMIE_CREAM[m.group(1)]}{ALCREMIE_SWEET[m.group(2)]}.png"


def item_candidates(ident: str, zh: str) -> list[str]:
    """道具图候选标题：人工映射优先，其余按 Bag {中文名} {世代} Sprite 系列。"""
    if ident in ITEM_TITLES:
        return ITEM_TITLES[ident]
    if not zh:
        return []
    return [
        f"File:Bag_{zh} SV Sprite.png",
        f"File:Bag {zh} SV Sprite.png",
        f"File:Bag_{zh} Sprite.png",
        f"File:Bag {zh} Sprite.png",
    ]


def load_json(path: Path, dflt):
    if path.exists():
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except Exception:
            pass
    return dflt


def save_json(path: Path, data) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")


def fetch_forms(overrides: dict, failed: list[dict]) -> None:
    con = sqlite3.connect(DB_PATH)
    con.row_factory = sqlite3.Row
    forms = [dict(r) for r in con.execute("SELECT id, identifier, species_id FROM forms ORDER BY id")]
    con.close()
    todo = [f for f in forms if not (PKT_OUT / f"{f['id']}.png").exists()]
    print(f"form sprites missing: {len(todo)}")
    jobs: list[tuple[dict, str]] = []
    for f in todo:
        title = FORM_TITLES.get(f["identifier"]) or alcremie_title(f["identifier"])
        if title:
            jobs.append((f, title))
        else:
            failed.append({
                "kind": "form", "form_id": f["id"], "identifier": f["identifier"],
                "reason": "no 52poke title mapping",
            })
    if not jobs:
        return
    urls = wc.image_urls([t for _, t in jobs])
    got = 0
    for f, title in jobs:
        url = wc.by_normalized(urls, title)
        dest = PKT_OUT / f"{f['id']}.png"
        ok = False
        if url:
            try:
                dest.write_bytes(shrink(wc.fetch_bytes(url)))
                ok = True
                got += 1
            except Exception as e:
                failed.append({
                    "kind": "form", "form_id": f["id"], "identifier": f["identifier"],
                    "reason": f"download fail: {e}",
                })
        else:
            failed.append({
                "kind": "form", "form_id": f["id"], "identifier": f["identifier"],
                "reason": f"no imageinfo url for {title}",
            })
        if ok:
            overrides["forms"][str(f["id"])] = title
            print(f"  ok {f['id']} {f['identifier']} <- {title}")
        time.sleep(0.2)
    print(f"  52poke form fallback ok={got}/{len(jobs)}")


def fetch_items(overrides: dict, failed: list[dict]) -> None:
    con = sqlite3.connect(DB_PATH)
    con.row_factory = sqlite3.Row
    items = [dict(r) for r in con.execute(
        "SELECT identifier, name_zh FROM items WHERE identifier != '' ORDER BY identifier")]
    con.close()
    todo = [i for i in items if not (ITEMS_OUT / f"{i['identifier']}.png").exists()]
    print(f"item icons missing: {len(todo)}")
    jobs: list[tuple[dict, str]] = []
    for it in todo:
        titles = item_candidates(it["identifier"], it["name_zh"])
        if not titles:
            failed.append({
                "kind": "item", "item": it["identifier"], "reason": "no candidate titles",
            })
        for t in titles:
            jobs.append((it, t))
    if not jobs:
        return
    urls = wc.image_urls([t for _, t in jobs])
    got = 0
    seen: set[str] = set()
    for it, title in jobs:
        ident = it["identifier"]
        if ident in seen:
            continue
        url = wc.by_normalized(urls, title)
        if not url:
            continue
        try:
            (ITEMS_OUT / f"{ident}.png").write_bytes(wc.fetch_bytes(url))
            seen.add(ident)
            overrides.setdefault("items", {})[ident] = title
            got += 1
            print(f"  ok {ident} {it['name_zh']} <- {title}")
            time.sleep(0.2)
        except Exception:
            pass
    print(f"  52poke item fallback ok={got}/{len(todo)}")


def main() -> None:
    if not DB_PATH.exists():
        sys.exit("poketools.db missing — run scripts/build_db.py first")
    overrides = load_json(OVERRIDES, {})
    overrides.setdefault("forms", {})
    overrides.setdefault("items", {})
    failed: list[dict] = []

    fetch_forms(overrides, failed)
    fetch_items(overrides, failed)

    # 仍缺的形态图先并入 overrides 负空间记录再写 TODO（映射只增：人工修复后重跑可翻正）
    save_json(OVERRIDES, overrides)
    todo_json = load_json(TODO, {})
    todo_json["sprite_52poke_failed"] = failed
    save_json(TODO, todo_json)

    con = sqlite3.connect(DB_PATH)
    idents = [r[0] for r in con.execute(
        "SELECT identifier FROM items WHERE identifier != '' ORDER BY identifier")]
    con.close()
    still = [i for i in idents if not (ITEMS_OUT / f"{i}.png").exists()]
    MISSING_TXT.write_text("\n".join(still) + "\n", encoding="utf-8")
    print(f"still missing: forms={sum(1 for f in failed if f['kind'] == 'form')}, "
          f"items={len(still)} -> {MISSING_TXT.name}")


if __name__ == "__main__":
    main()
