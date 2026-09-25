"""下载特化功能页配图（52poke）到 app/static/dist/assets/。

Special:FilePath 对脚本请求返回 403，改用 MediaWiki API imageinfo 拿直链再下载
（media.52poke.com 需要 Referer + 浏览器式 UA）。
- 属性图标雪碧图（MST_SV.webp，50×1050 = 2x，CSS 显示 20×420）
- 8 张游戏简体中文商标图 → assets/games/*.webp（缩到 360px 宽）
- 特殊/基础甜甜圈的道具图（Bag_*_ZA_Sprite）
- 咖喱分组「玩家食用」图（每组一张）
- 三明治 hero 图
"""
from __future__ import annotations

import io
import re
import time
from pathlib import Path

import requests
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / "data" / "raw" / "52poke-cache"
OUT = ROOT / "app" / "static" / "dist" / "assets"
API = "https://wiki.52poke.com/api.php"
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) poketools/0.4 (asset build)"

S = requests.Session()
S.headers["User-Agent"] = UA

# 固定直链资产（File 标题 → 保存相对路径）；商标图另需缩放
TYPE_SPRITE = {"File:MST SV.webp": "type_sprite.webp"}
GAME_LOGOS = {
    "sword": "File:宝可梦 剑 商标 简体中文.png",
    "shield": "File:宝可梦 盾 商标 简体中文.png",
    "diamond": "File:宝可梦 晶灿钻石 商标 简体中文.png",
    "pearl": "File:宝可梦 明亮珍珠 商标 简体中文.png",
    "arceus": "File:宝可梦传说 阿尔宙斯 商标 简体中文.png",
    "scarlet": "File:宝可梦 朱 商标 简体中文.png",
    "violet": "File:宝可梦 紫 商标 简体中文.png",
    "za": "File:宝可梦传说 Z-A 商标 简体中文.png",
}


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
        r = S.get(url, headers={"Referer": "https://wiki.52poke.com/"}, timeout=90)
        if r.status_code == 200 and len(r.content) > 1000:
            dest.write_bytes(r.content)
            return True
        print(f"  http {r.status_code} for {url[:90]}")
    except Exception as e:
        print(f"  fail {url[:90]}: {e}")
    return False


def download_webp(url: str, dest: Path, width: int = 360, quality: int = 88) -> bool:
    """下载并等比缩放到指定宽度，存 webp。"""
    if dest.exists() and dest.stat().st_size > 0:
        return True
    try:
        r = S.get(url, headers={"Referer": "https://wiki.52poke.com/"}, timeout=90)
        if r.status_code != 200 or len(r.content) <= 500:
            print(f"  http {r.status_code} for {url[:90]}")
            return False
        im = Image.open(io.BytesIO(r.content))
        w, h = im.size
        im = im.resize((width, round(h * width / w)), Image.LANCZOS)
        im.save(dest, "WEBP", quality=quality)
        return True
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

    # 属性雪碧图 + 游戏商标图（缩放 webp）
    sprites = {title: OUT / rel for title, rel in TYPE_SPRITE.items()}
    logos = {title: OUT / "games" / (key + ".webp") for key, title in GAME_LOGOS.items()}

    print(f"targets: {len(wanted) + len(sprites) + len(logos)}")
    urls = image_urls([f"File:{t}" for t in wanted] + list(sprites) + list(logos))
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
    for title, dest in sprites.items():
        url = by_norm.get(title.replace("_", " "))
        if url and download(url, dest):
            ok += 1
    for title, dest in logos.items():
        url = by_norm.get(title.replace("_", " "))
        if url and download_webp(url, dest):
            ok += 1
        time.sleep(0.25)
    print(f"done. ok={ok}/{len(wanted) + len(sprites) + len(logos)} -> {OUT}")


if __name__ == "__main__":
    main()
