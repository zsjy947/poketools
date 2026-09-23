"""下载特化功能页配图（52poke）到 app/static/dist/assets/。

Special:FilePath 对脚本请求返回 403，改用 MediaWiki API imageinfo 拿直链再下载。
- 特殊/基础甜甜圈的道具图（Bag_*_ZA_Sprite）
- 咖喱分组「玩家食用」图（每组一张）
- 三明治 hero 图
"""
from __future__ import annotations

import re
import time
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / "data" / "raw" / "52poke-cache"
OUT = ROOT / "app" / "static" / "dist" / "assets"
API = "https://wiki.52poke.com/api.php"
UA = "poketools/0.3 (asset build)"

S = requests.Session()
S.headers["User-Agent"] = UA


def image_urls(titles: list[str]) -> dict[str, str]:
    """File:标题 -> 直链（分批查询）"""
    out: dict[str, str] = {}
    for i in range(0, len(titles), 40):
        chunk = titles[i:i + 40]
        for attempt in range(3):
            try:
                r = S.get(API, params={
                    "action": "query", "titles": "|".join(chunk),
                    "prop": "imageinfo", "iiprop": "url",
                    "format": "json", "formatversion": 2}, timeout=90)
                data = r.json()
                break
            except Exception:
                time.sleep(2 + attempt)
        else:
            continue
        for page in data.get("query", {}).get("pages", []):
            if page.get("missing"):
                continue
            ii = (page.get("imageinfo") or [{}])[0]
            if ii.get("url"):
                out[page["title"]] = ii["url"]
        time.sleep(0.5)
    return out


def download(url: str, dest: Path) -> bool:
    if dest.exists() and dest.stat().st_size > 0:
        return True
    try:
        r = S.get(url, timeout=90)
        if r.status_code == 200 and len(r.content) > 1000:
            dest.write_bytes(r.content)
            return True
        print(f"  http {r.status_code} for {url[:90]}")
    except Exception as e:
        print(f"  fail {url[:90]}: {e}")
    return False


def images_on_page(title: str) -> list[str]:
    p = CACHE / f"{title}.txt"
    if not p.exists():
        return []
    return re.findall(r"\[\[File:([^|\]]+)", p.read_text(encoding="utf-8"))


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    wanted: dict[str, Path] = {}   # File 名 -> 保存路径

    # 甜甜圈：特殊 + 基础类型道具图（各取一档星级图）
    seen = set()
    for f in images_on_page("甜甜圈"):
        m = re.match(r"Bag_(.+?)(?:_(\d))?_ZA_Sprite\.png$", f)
        if m and "甜甜圈" in m.group(1) and m.group(1) not in seen:
            seen.add(m.group(1))
            wanted[f] = OUT / f"donut_{m.group(1)}.png"

    # 咖喱：每个分组一张「玩家」图 + hero
    for f in images_on_page("咖喱饭"):
        if f.endswith("玩家 SWSH.png"):
            wanted[f] = OUT / ("curry_" + f.replace("玩家 ", "").strip())

    # 三明治 hero
    for f in images_on_page("三明治"):
        if re.match(r"^三明治.*\.(png|jpg)$", f):
            wanted[f] = OUT / "sandwich_hero.png"
            break

    print(f"targets: {len(wanted)}")
    urls = image_urls([f"File:{t}" for t in wanted])
    # API 会把标题中的下划线规范化为空格，统一键格式
    by_norm = {k.replace("_", " "): v for k, v in urls.items()}
    ok = 0
    for title, dest in wanted.items():
        url = by_norm.get(f"File:{title}".replace("_", " "))
        if not url:
            print(f"  no url: {title}")
            continue
        if download(url, dest):
            ok += 1
        time.sleep(0.25)
    print(f"done. ok={ok}/{len(wanted)} -> {OUT}")


if __name__ == "__main__":
    main()
