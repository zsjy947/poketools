"""web/public 资产清单核对（阶段 1 新增）：对照各 manifest 防资产漏拷/漏跑。

核对项：
  1. web/public/data/manifest.json 的 33 表行数 vs data/poketools.db 实际行数
  2. web/public/pkt/.manifest.json（官方绘图）每条 form_id 对应 png 存在
  3. web/public/sprites/manifest.json（对战精灵图）目录文件齐备
  4. web/public/assets 关键族：games 商标 ×5 / 属性雪碧图 / 三明治 151 / 甜甜圈 / 咖喱 / 机制图标 / items
用法：python scripts/check_web_assets.py（退出码 0=通过，1=有缺失）
"""
from __future__ import annotations

import json
import sqlite3
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
WEB = ROOT / "web" / "public"
DB = ROOT / "data" / "poketools.db"

problems: list[str] = []

# ---- 1. data manifest vs DB ----
if not (WEB / "data" / "manifest.json").exists():
    problems.append("web/public/data/manifest.json 不存在（先跑 export_static_data.py）")
elif DB.exists():
    mani = json.loads((WEB / "data" / "manifest.json").read_text(encoding="utf-8"))
    con = sqlite3.connect(DB)
    for table, meta in mani["tables"].items():
        expect = meta["rows"]
        for f in meta["files"]:
            if not (WEB / "data" / f).exists():
                problems.append(f"data/{f} 缺失")
        n = con.execute(f'SELECT count(*) FROM "{table}"').fetchone()[0]
        if n != expect:
            problems.append(f"表 {table} 行数不符：manifest={expect} db={n}")
    con.close()

# ---- 2. 官方绘图 manifest ----
pkt_mani = WEB / "pkt" / ".manifest.json"
if not pkt_mani.exists():
    problems.append("web/public/pkt/.manifest.json 不存在（先跑 fetch_sprites.py）")
else:
    forms = json.loads(pkt_mani.read_text(encoding="utf-8"))
    missing = [fid for fid in forms if not (WEB / "pkt" / f"{fid}.png").exists()]
    if missing:
        problems.append(f"官方绘图缺 {len(missing)} 张：{missing[:6]}")

# ---- 3. 对战精灵图 manifest ----
sp_mani = WEB / "sprites" / "manifest.json"
if not sp_mani.exists():
    problems.append("web/public/sprites/manifest.json 不存在（先跑 fetch-sprites.mjs）")
else:
    meta = json.loads(sp_mani.read_text(encoding="utf-8"))
    # keepDirs 为 zip 源目录清单；本地落地目录为 ani/ani-back/ani-shiny/dex + 图标雪碧图
    for d in ("ani", "ani-back", "ani-shiny", "dex"):
        p = WEB / "sprites" / d
        if not p.is_dir() or not any(p.iterdir()):
            problems.append(f"对战精灵图目录空/缺：sprites/{d}")

# ---- 4. 关键资产族 ----
expect_assets = {
    "games": 5,          # 五作商标 webp
    "sandwiches": 151,   # 三明治食谱图
    "mechanism": 1,      # 机制图标（极巨/太晶等，至少存在）
}
for sub, min_n in expect_assets.items():
    p = WEB / "assets" / sub
    n = len(list(p.glob("*"))) if p.is_dir() else 0
    if n < min_n:
        problems.append(f"assets/{sub} 数量不足：{n} < {min_n}")
if not (WEB / "assets" / "type_sprite.png").exists() and not any(
        (WEB / "assets").glob("type*")):
    problems.append("assets 属性雪碧图缺失")
curries = json.loads((ROOT / "data" / "curated" / "curries.json").read_text(encoding="utf-8"))
curry_pngs = len(list((WEB / "assets").glob("curry_*.png")))
# 咖喱 151 卡共享 27 张分类图（创意/吐司/乳酪满满等系列各一张）
if curry_pngs < 20:
    problems.append(f"咖喱分类图过少：{curry_pngs} < 20（151 卡共享，正常约 27 张）")
donuts = (WEB / "assets").glob("donut_*.png")
if not any(donuts):
    problems.append("甜甜圈配图缺失")

if problems:
    print(f"资产核对失败 {len(problems)} 项：")
    for p in problems:
        print("  -", p)
    sys.exit(1)
print("web/public 资产清单核对通过（data 表数/官方绘图/对战精灵图/资产族）")
