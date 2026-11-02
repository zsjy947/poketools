# -*- coding: utf-8 -*-
"""资产钩子：构建前端产物 web/dist → 安卓 WebView 资产目录 www/。

- 自动执行 `pnpm build`（与桌面同一条产物线，tsc 门禁 + vite 打包）；
- 拷贝 dist 全量到 android/app/src/main/assets/www/，但**排除** sprites 的三个
  动画 GIF 目录（ani/ani-back/ani-shiny 共 ~445MB）——安卓端对战精灵由
  battle/sprites.ts 的候选链自动回退 sprites/dex 静态像（stage.tsx onError）；
- 写 meta.js 内嵌版本号（pack.toml version_marker 守卫消费）并注入 index.html。

由 android/build_apk.py（apx 流水线）自动调用；前端源码变化后重新打包即可。
"""
import json
import shutil
import subprocess
import sys
from pathlib import Path

ANDROID = Path(__file__).resolve().parent
ROOT = ANDROID.parent
WEB = ROOT / "web"
DIST = WEB / "dist"
OUT = ANDROID / "app" / "src" / "main" / "assets" / "www"

# 安卓端不打包的对战动画精灵目录（dex 静态像回退，见 battle/sprites.ts 候选链）
EXCLUDED_SPRITE_DIRS = {"ani", "ani-back", "ani-shiny"}


def _version() -> str:
    """与 pack.toml version_ref 同一来源：web/package.json。"""
    return json.loads((WEB / "package.json").read_text(encoding="utf-8"))["version"]


def _run_frontend_build() -> None:
    proc = subprocess.run("pnpm build", cwd=WEB, shell=True,
                          capture_output=True, text=True, encoding="utf-8", errors="replace")
    if proc.returncode != 0:
        sys.stderr.write(proc.stdout[-4000:] + "\n" + proc.stderr[-4000:] + "\n")
        raise SystemExit("pnpm build 失败，禁止出包")
    if not (DIST / "index.html").is_file():
        raise SystemExit(f"构建产物异常：{DIST / 'index.html'} 不存在")


def _copy_dist() -> None:
    if OUT.exists():
        shutil.rmtree(OUT)
    OUT.mkdir(parents=True)

    def _skip_animated(dir_path: str, names: list[str]) -> list[str]:
        base = Path(dir_path)
        if base.name == "sprites" and base.parent == DIST:
            return [n for n in names if n in EXCLUDED_SPRITE_DIRS]
        return []

    for entry in DIST.iterdir():
        if entry.is_dir():
            shutil.copytree(entry, OUT / entry.name, ignore=_skip_animated)
        else:
            shutil.copy2(entry, OUT / entry.name)


def _write_version_meta(version: str) -> None:
    (OUT / "meta.js").write_text(
        f'window.__APP_VERSION__ = "{version}";\n', encoding="utf-8")
    html_path = OUT / "index.html"
    html = html_path.read_text(encoding="utf-8")
    tag = '<script src="meta.js"></script>\n  </head>'
    if "meta.js" not in html:
        if "</head>" not in html:
            raise SystemExit("dist/index.html 缺少 </head>，无法注入版本脚本")
        html = html.replace("</head>", tag, 1)
        html_path.write_text(html, encoding="utf-8")


def prepare() -> None:
    version = _version()
    print(f"==> 前端构建（v{version}）")
    _run_frontend_build()
    print("==> 组装 WebView 资产（排除对战动画 GIF）")
    _copy_dist()
    _write_version_meta(version)
    total = sum(f.stat().st_size for f in OUT.rglob("*") if f.is_file())
    print(f"[OK] www/ 就绪：{total / 1024 / 1024:.1f} MB（版本 {version}）")


if __name__ == "__main__":
    prepare()
