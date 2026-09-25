"""下载特化功能页配图（52poke）到 app/static/dist/assets/。

复用 scripts/wiki_client.py（imageinfo 直链 + Referer 下载）。
- 属性图标雪碧图（MST_SV.webp，50×1050 = 2x，CSS 显示 20×420）
- 8 张游戏简体中文商标图 → assets/games/*.webp（缩到 360px 宽）
- 特殊/基础甜甜圈的道具图（Bag_*_ZA_Sprite）
- 咖喱分组「玩家食用」图（每组一张）
- 三明治 hero 图
"""
from __future__ import annotations

import re
import time
from pathlib import Path

import wiki_client as wc

OUT = wc.ROOT / "app" / "static" / "dist" / "assets"

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


def images_on_page(title: str) -> list[str]:
    p = wc.CACHE / f"{title}.txt"
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
    urls = wc.image_urls([f"File:{t}" for t in wanted] + list(sprites) + list(logos))
    ok = 0
    for title, dest in wanted.items():
        url = wc.by_normalized(urls, f"File:{title}")
        if not url:
            print(f"  no url: {title}")
            continue
        if wc.download(url, dest):
            ok += 1
        time.sleep(0.25)
    for title, dest in sprites.items():
        url = wc.by_normalized(urls, title)
        if url and wc.download(url, dest):
            ok += 1
    for title, dest in logos.items():
        url = wc.by_normalized(urls, title)
        if url and wc.download_webp(url, dest):
            ok += 1
        time.sleep(0.25)
    print(f"done. ok={ok}/{len(wanted) + len(sprites) + len(logos)} -> {OUT}")


if __name__ == "__main__":
    main()
