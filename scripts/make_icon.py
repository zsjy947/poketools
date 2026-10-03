"""生成应用图标（精灵球风格）到 app/static/dist/assets/。

产物：appicon.ico（多尺寸）与 appicon.png（favicon + Tauri 图标基图）+ appicon.png（favicon）。
"""
from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "web" / "public" / "assets"
SIZE = 256

RED = (237, 73, 77, 255)
DARK = (36, 41, 47, 255)
WHITE = (248, 249, 251, 255)
CREAM = (246, 195, 68, 255)


def draw_pokeball(size: int) -> Image.Image:
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    s = size / 256.0
    cx = cy = size / 2
    r = 108 * s

    # 球体
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=DARK)
    # 上红下半白
    d.pieslice([cx - r, cy - r, cx + r, cy + r], 180, 360, fill=RED)
    d.pieslice([cx - r, cy - r, cx + r, cy + r], 0, 180, fill=WHITE)
    # 中带
    band = 26 * s
    d.rectangle([cx - r, cy - band / 2, cx + r, cy + band / 2], fill=DARK)
    # 中扣
    br = 34 * s
    d.ellipse([cx - br, cy - br, cx + br, cy + br], fill=DARK)
    ir = 26 * s
    d.ellipse([cx - ir, cy - ir, cx + ir, cy + ir], fill=WHITE)
    cr = 12 * s
    d.ellipse([cx - cr, cy - cr, cx + cr, cy + cr], fill=CREAM)
    # 高光
    hl = 30 * s
    d.ellipse([cx - 70 * s, cy - 88 * s, cx - 70 * s + hl, cy - 88 * s + hl * 0.62],
              fill=(255, 255, 255, 120))
    return img


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    base = draw_pokeball(SIZE)
    base.save(OUT / "appicon.png")
    base.save(OUT / "appicon.ico",
              sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
    print(f"OK -> {OUT / 'appicon.ico'}")


if __name__ == "__main__":
    main()
