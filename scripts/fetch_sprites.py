"""下载宝可梦图片到 data/sprites/（三级回退：官方绘图 → HOME 类3D → 像素图）。

来源 PokeAPI/sprites 仓库。官方绘图为 475px 大图，用 Pillow 统一缩到 256px 控制体积。
已下载的以 .manifest.json 记录来源，重复执行只补缺。
"""
from __future__ import annotations

import concurrent.futures as cf
import io
import json
import sqlite3
import sys
import time
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parent.parent
DB = ROOT / "data" / "poketools.db"
OUT = ROOT / "web" / "public" / "pkt"
MANIFEST = OUT / ".manifest.json"
UA = "poketools/0.3 (one-shot asset build)"

SOURCES = [
    ("art", "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork"),
    ("home", "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/home"),
    ("pixel", "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon"),
]
MAX_SIZE = 256

_ssl_warned = False


def get(url: str) -> requests.Response:
    """GET；SSL 证书校验失败（常见于公司代理 MITM）时降级为不校验并警告一次。"""
    global _ssl_warned
    try:
        return requests.get(url, timeout=30, headers={"User-Agent": UA})
    except requests.exceptions.SSLError:
        if not _ssl_warned:
            print("  !! SSL 证书校验失败，改用不校验模式下载（公共图片数据）")
            _ssl_warned = True
            try:
                import urllib3
                urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
            except Exception:
                pass
        return requests.get(url, timeout=30, headers={"User-Agent": UA}, verify=False)


def shrink(data: bytes) -> bytes:
    try:
        from PIL import Image
        with Image.open(io.BytesIO(data)) as im:
            im = im.convert("RGBA")
            if max(im.size) > MAX_SIZE:
                im.thumbnail((MAX_SIZE, MAX_SIZE), Image.LANCZOS)
            buf = io.BytesIO()
            im.save(buf, "PNG", optimize=True)
            return buf.getvalue()
    except Exception:
        return data


def download(form_id: int) -> tuple[int, str | None]:
    dest = OUT / f"{form_id}.png"
    if dest.exists() and dest.stat().st_size > 0:
        return form_id, "cached"
    # 合成外观形态行（build_db）：id = 900000 + pokemon_forms.id，精灵图源仍按后者
    src_id = form_id - 900000 if form_id >= 900000 else form_id
    for key, base in SOURCES:
        for attempt in range(3):
            try:
                r = get(f"{base}/{src_id}.png")
                if r.status_code == 404:
                    break
                if r.status_code == 200 and r.content:
                    dest.write_bytes(shrink(r.content))
                    return form_id, key
            except Exception:
                time.sleep(1 + attempt)
    return form_id, None


def main() -> None:
    if not DB.exists():
        sys.exit("poketools.db missing")
    OUT.mkdir(parents=True, exist_ok=True)
    con = sqlite3.connect(DB)
    ids = [r[0] for r in con.execute("SELECT id FROM forms ORDER BY id")]
    con.close()

    manifest = {}
    if MANIFEST.exists():
        try:
            manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
        except Exception:
            manifest = {}
    todo = [i for i in ids if not (OUT / f"{i}.png").exists()]
    print(f"forms: {len(ids)}, to download: {len(todo)}")
    ok = fail = 0
    with cf.ThreadPoolExecutor(max_workers=24) as ex:
        for fid, src in ex.map(download, todo):
            if src:
                ok += 1
                manifest[str(fid)] = src
            else:
                fail += 1
    MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False), encoding="utf-8")
    counts = {}
    for v in manifest.values():
        counts[v] = counts.get(v, 0) + 1
    print(f"done. ok={ok} missing/fail={fail} -> {OUT}")
    print(f"source stats: {counts}")
    if fail:
        missing = [i for i in ids if not (OUT / f"{i}.png").exists()]
        print(f"  missing ids (first 20): {missing[:20]}")


if __name__ == "__main__":
    main()
