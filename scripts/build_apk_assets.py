"""APK 资产组装（A3/A4 构建管线第一步）：前端 dist + 静态数据分片 + 精灵图 → apk/dist/。

布局约定：index.html 在包根，`data/`（JSON 分片）与 `sprites/`（精灵图/道具图标）同级，
前端绝对路径 `/sprites/...` 与相对路径 `data/...` 在 Tauri 自定义协议源根下均直达。
产物 apk/dist/ 为 gitignore 可重建物（脚本幂等，重复执行覆盖）。
"""
from __future__ import annotations

import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DIST = ROOT / "app" / "static" / "dist"
DATA = ROOT / "app" / "static" / "data"
SPRITES = ROOT / "data" / "sprites"
OUT = ROOT / "apk" / "dist"


def main() -> int:
    if not (DIST / "index.html").exists():
        print("前端 dist 缺失（app/static/dist/index.html）", file=sys.stderr)
        return 1
    if not (DATA / "manifest.json").exists():
        print("静态数据缺失：先运行 python scripts/export_static_data.py", file=sys.stderr)
        return 1
    if OUT.exists():
        shutil.rmtree(OUT)
    shutil.copytree(DIST, OUT)
    shutil.copytree(DATA, OUT / "data")
    shutil.copytree(SPRITES, OUT / "sprites")
    n = sum(1 for _ in OUT.rglob("*") if _.is_file())
    size = sum(f.stat().st_size for f in OUT.rglob("*") if f.is_file())
    print(f"组装完成：{OUT}（{n} 个文件，{size / 1048576:.1f} MB）")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
