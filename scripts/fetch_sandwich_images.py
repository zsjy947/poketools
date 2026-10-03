"""下载 52poke 朱紫三明治食谱图 → web/public/assets/sandwiches/sandwich_{no:03d}.webp

源文件是 1920×1080 游戏截图（每张 ~1.6MB，直接提交不可行），因此：
  1. 走 MediaWiki 缩略图服务（iiurlwidth=640 → 640×360，保持 16:9 原比例，**不裁剪**）；
  2. webp q85 编码；若单张 >40KB，降一档改用 512×288 缩略图（仍 16:9）；
  3. 151 张合计 ~3MB，随 dist 提交。

编号 ↔ 文件对应关系来自 data/raw/52poke-cache/三明治.txt 食谱列表表格
（每行含编号单元格与 [[File:Picnic {名字} Sprite.png]]，顺序天然对齐）。
可重复执行：已存在的文件跳过；`--force` 全部重下（规格变更时用）。
wiki 访问复用 scripts/wiki_client.py。
"""
from __future__ import annotations

import io
import re
import sys
from pathlib import Path

import wiki_client as wc
from PIL import Image

OUT = wc.ROOT / "web" / "public" / "assets" / "sandwiches"
SIZE_CAP = 40 * 1024          # 单张体积上限，超过则降档
THUMB_W = (640, 512)          # 首选 / 降档缩略图宽度（原比例 16:9）
QUALITY = 85


def parse_rows(wt: str) -> list[tuple[int, str]]:
    """食谱列表表格：每行 (编号, File 标题)。"""
    i = wt.find("== 食谱列表 ==")
    if i < 0:
        i = wt.find("==食谱列表==")
    seg = wt[i:] if i >= 0 else wt
    j = seg.find("{|")
    table = seg[j:seg.find("\n|}", j)]
    rows: list[tuple[int, str]] = []
    for chunk in re.split(r"^\|-.*$", table, flags=re.MULTILINE):
        no_m = re.search(r"^\|\s*(\d+)\s*$", chunk, flags=re.MULTILINE)
        file_m = re.search(r"\[\[(File:Picnic [^|\]]+?)(?:\|[^\]]*)?\]\]", chunk)
        if no_m and file_m:
            rows.append((int(no_m.group(1)), file_m.group(1)))
    return rows


def encode(data: bytes, dest: Path) -> int:
    im = Image.open(io.BytesIO(data)).convert("RGB")
    buf = io.BytesIO()
    im.save(buf, "WEBP", quality=QUALITY)
    dest.write_bytes(buf.getvalue())
    return buf.getbuffer().nbytes


def main() -> None:
    if "--force" in sys.argv:
        for p in OUT.glob("sandwich_*.webp"):
            p.unlink()

    wt = wc.fetch_wikitext("三明治")
    rows = parse_rows(wt)
    print(f"[1/3] 食谱表格解析: {len(rows)} 个 (编号, 文件) 对")
    missing_no = sorted({n for n in range(1, 152)} - {n for n, _ in rows})
    if missing_no:
        print(f"  缺编号: {missing_no}", file=sys.stderr)

    url_640 = wc.image_urls([t for _, t in rows], thumb_width=THUMB_W[0])

    OUT.mkdir(parents=True, exist_ok=True)
    print(f"[2/3] 下载缩略图（16:9 不裁剪）→ {OUT.relative_to(wc.ROOT)}")
    ok, failed, fallback = 0, [], []
    need_512: list[tuple[int, str]] = []
    for no, title in rows:
        dest = OUT / f"sandwich_{no:03d}.webp"
        if dest.exists():
            ok += 1
            continue
        url = url_640.get(title)
        if not url:
            failed.append((no, title, "无 thumburl"))
            continue
        try:
            data = wc.fetch_bytes(url)
            size = encode(data, dest)
            if size > SIZE_CAP:
                dest.unlink()
                need_512.append((no, title))
            else:
                ok += 1
        except Exception as e:
            failed.append((no, title, str(e)))
        if ok % 40 == 0:
            print(f"    {ok}/{len(rows)}")

    if need_512:
        url_512 = wc.image_urls([t for _, t in need_512], thumb_width=THUMB_W[1])
        for no, title in need_512:
            dest = OUT / f"sandwich_{no:03d}.webp"
            url = url_512.get(title)
            if not url:
                failed.append((no, title, "降档无 thumburl"))
                continue
            try:
                encode(wc.fetch_bytes(url), dest)
                fallback.append(no)
                ok += 1
            except Exception as e:
                failed.append((no, title, str(e)))

    print(f"[3/3] 完成: {ok}/{len(rows)} 张（其中 {len(fallback)} 张降为 512×288）")
    for no, title, why in failed:
        print(f"  失败 #{no} {title}: {why}", file=sys.stderr)
    if failed:
        sys.exit(1)


if __name__ == "__main__":
    main()
