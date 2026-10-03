"""发布归档：把 Tauri 构建产物从 src-tauri/target 拷到仓库 release/ 并重算 SHA256SUMS。

用法：python scripts/package_release.py
前置：cd web && npx tauri build（产物在 src-tauri/target/release/，Tauri 固定输出位置）。
产物映射：
  bundle/nsis/宝可梦工具助手_{ver}_x64-setup.exe  -> release/（NSIS 安装包，原名）
  poketools-app.exe                               -> release/宝可梦工具助手_{ver}_x64-portable.exe
SHA256SUMS 覆盖 release/ 下全部 宝可梦工具助手_* 文件（重跑全量重算）。
"""
from __future__ import annotations

import hashlib
import json
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TARGET = ROOT / "web" / "src-tauri" / "target" / "release"
RELEASE = ROOT / "release"


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def main() -> None:
    version = json.loads(
        (ROOT / "web" / "src-tauri" / "tauri.conf.json").read_text(encoding="utf-8")
    )["version"]
    nsis_src = TARGET / "bundle" / "nsis" / f"宝可梦工具助手_{version}_x64-setup.exe"
    portable_src = TARGET / "poketools-app.exe"
    missing = [str(p) for p in (nsis_src, portable_src) if not p.exists()]
    if missing:
        sys.exit("产物缺失（先 cd web && npx tauri build）：\n  " + "\n  ".join(missing))

    RELEASE.mkdir(exist_ok=True)
    portable_dst = RELEASE / f"宝可梦工具助手_{version}_x64-portable.exe"
    shutil.copy2(nsis_src, RELEASE / nsis_src.name)
    shutil.copy2(portable_src, portable_dst)

    lines = []
    for f in sorted(RELEASE.glob("宝可梦工具助手_*")):
        if f.is_file():
            lines.append(f"{sha256(f)}  {f.name}")
    (RELEASE / "SHA256SUMS").write_text("\n".join(lines) + "\n", encoding="utf-8")

    for line in lines:
        print(line)
    print(f"归档完成 -> {RELEASE}")


if __name__ == "__main__":
    main()
