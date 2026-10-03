"""下载伤害计算器素材：
- 全量道具图标：PokeAPI sprites items/{identifier}.png → data/sprites/items/
  （Z 纯晶不在 PokeAPI，回退 52poke Bag 模板图，再缺失则前端 CSS 徽章兜底）
- 机制标记图标：52poke（imageinfo 直链）→ web/public/assets/mechanism/
  极巨化标志 + 太晶 18 属性 icon + 星晶 icon（Z 标记直接用 Z 纯晶道具图标）。

运行：python scripts/fetch_calc_assets.py（在 build_db.py 之后）
"""
from __future__ import annotations

import sqlite3
import sys
import time
from concurrent.futures import ThreadPoolExecutor

import requests
import wiki_client as wc

ROOT = wc.ROOT
DB_PATH = ROOT / "data" / "poketools.db"
ITEMS_OUT = ROOT / "web" / "public" / "assets" / "items"
ASSETS = ROOT / "web" / "public" / "assets"
ITEM_BASE = "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items"

# 机制图标：52poke File 标题 → 相对 assets/mechanism/ 的文件名
MECHANISM_ICONS = {
    "File:极巨化标志 SWSH.png": "dynamax.png",
    **{f"File:太晶 {t} icon.png": f"tera_{t}.png" for t in (
        "一般", "火", "水", "电", "草", "冰", "格斗", "毒", "地面", "飞行",
        "超能力", "虫", "岩石", "幽灵", "龙", "恶", "钢", "妖精", "星晶")},
}

_ssl_warned = False


def _get(url: str):
    global _ssl_warned
    try:
        return requests.get(url, timeout=30,
                            headers={"User-Agent": "poketools/0.4 (asset build)"})
    except requests.exceptions.SSLError:
        if not _ssl_warned:
            print("  !! SSL 校验失败，降级不校验")
            _ssl_warned = True
        import urllib3
        urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
        return requests.get(url, timeout=30, verify=False)


def _tm_disc_titles(con: sqlite3.Connection, idents: set[str]) -> dict[str, str]:
    """TM/TR 编号道具 → 52poke 属性圆盘图标标题（圆盘按属性/世代着色，无逐号图标）。

    命名：File:Bag_TM_{属性}_{BDSP|SV|ZA}_Sprite.png（无后缀=泛用）、File:Bag_TR_{属性}_Sprite.png。
    同一编号跨多作时按 ZA > SV > BDSP > 泛用 取最新一盘。
    """
    move_type = {r[0]: r[1] for r in con.execute("SELECT id, type_zh FROM moves")}
    suffix_by_vg = {23: "BDSP", 25: "SV", 26: "SV", 27: "SV", 30: "ZA", 31: "ZA"}
    prio = {"ZA": 0, "SV": 1, "BDSP": 2, "": 3}
    best: dict[str, tuple[int, str]] = {}
    for vg, ident, move_id in con.execute("SELECT vg, item_identifier, move_id FROM machines"):
        if ident not in idents:
            continue
        t = move_type.get(move_id) or ""
        if not t:
            continue
        suf = suffix_by_vg.get(vg, "")
        key = "TM" if ident.startswith("tm") else "TR"
        title = f"File:Bag_{key}_{t}{'_' + suf if suf else ''}_Sprite.png"
        if ident not in best or prio[suf] < best[ident][0]:
            best[ident] = (prio[suf], title)
    return {k: v[1] for k, v in best.items()}


def fetch_item_icons() -> tuple[int, int]:
    con = sqlite3.connect(DB_PATH)
    idents = [r[0] for r in con.execute(
        "SELECT identifier FROM items WHERE identifier != '' ORDER BY identifier")]
    zh_names = {r[0]: r[1] for r in con.execute(
        "SELECT identifier, name_zh FROM items WHERE identifier != ''")}
    con.close()
    ITEMS_OUT.mkdir(parents=True, exist_ok=True)
    todo = [i for i in idents if not (ITEMS_OUT / f"{i}.png").exists()]
    print(f"item icons: total={len(idents)} todo={len(todo)}")

    def dl(ident: str) -> bool:
        r = _get(f"{ITEM_BASE}/{ident}.png")
        if r.status_code == 200 and r.content:
            (ITEMS_OUT / f"{ident}.png").write_bytes(r.content)
            return True
        return False

    ok = 0
    with ThreadPoolExecutor(max_workers=16) as ex:
        for _ident, got in zip(todo, ex.map(dl, todo), strict=False):
            if got:
                ok += 1
    missing = [i for i in todo if not (ITEMS_OUT / f"{i}.png").exists()]
    print(f"  pokeapi ok={ok} missing={len(missing)}")

    # PokeAPI 缺图 → 52poke Bag 兜底：TM/TR 走属性圆盘，其余用中文名 Bag 模板图
    # （命名不统一：Bag_X Sprite / Bag_X ZA Sprite / 空格版，全部候选都试）
    con = sqlite3.connect(DB_PATH)
    tm_titles = _tm_disc_titles(con, set(missing))
    con.close()
    fallback: list[tuple[str, list[str]]] = []
    for ident in missing:
        titles: list[str] = []
        disc = tm_titles.get(ident)
        zh = zh_names.get(ident, "")
        if disc:
            titles = [disc]
        elif zh:
            titles = [
                f"File:Bag_{zh} Sprite.png",
                f"File:Bag {zh} Sprite.png",
                f"File:Bag_{zh} ZA Sprite.png",
                f"File:Bag {zh} ZA Sprite.png",
            ]
        if titles:
            fallback.append((ident, titles))
    got52 = 0
    if fallback:
        urls = wc.image_urls([t for _, ts in fallback for t in ts])
        for ident, titles in fallback:
            url = next((wc.by_normalized(urls, t) for t in titles
                        if wc.by_normalized(urls, t)), None)
            if not url:
                continue
            try:
                # 道具雪碧图仅数百字节，不能走 wc.download 的 500B 下限
                (ITEMS_OUT / f"{ident}.png").write_bytes(wc.fetch_bytes(url))
                got52 += 1
            except Exception:
                pass
            time.sleep(0.2)
    print(f"  52poke fallback ok={got52}/{len(fallback)}")
    still = [i for i in todo if not (ITEMS_OUT / f"{i}.png").exists()]
    if still:
        report = ROOT / "data" / "curated" / "item_icons_missing.txt"
        report.write_text("\n".join(still) + "\n", encoding="utf-8")
        print(f"  still missing {len(still)} -> {report.name}")
    return ok, len(still)


def fetch_mechanism_icons() -> int:
    out_dir = ASSETS / "mechanism"
    out_dir.mkdir(parents=True, exist_ok=True)
    titles = list(MECHANISM_ICONS)
    urls = wc.image_urls(titles)
    ok = 0
    for title, rel in MECHANISM_ICONS.items():
        dest = out_dir / rel
        if dest.exists() and dest.stat().st_size > 0:
            ok += 1
            continue
        url = wc.by_normalized(urls, title)
        if url and wc.download(url, dest):
            ok += 1
        else:
            print(f"  no url: {title}")
        time.sleep(0.2)
    print(f"mechanism icons ok={ok}/{len(titles)} -> {out_dir}")
    return ok


def main() -> None:
    if not DB_PATH.exists():
        sys.exit("poketools.db missing — run scripts/build_db.py first")
    fetch_item_icons()
    fetch_mechanism_icons()


if __name__ == "__main__":
    main()
