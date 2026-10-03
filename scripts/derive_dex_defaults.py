"""图鉴默认形态派生（P1-7 外移）：按 form_game_availability 可用性自动派生 +
curated dex_default_forms.json 人工增补覆盖 + 一致性校验（默认形态须在该游戏可用）。

派生规则：仅当物种的地区形态后缀 == 图鉴自身地区（如伽勒尔图鉴→galar、
帕底亚系图鉴→paldea）且该形态在图鉴所属游戏可用时，才覆盖默认形态；
否则一律默认普通形态（不写入 ddf）。跨区兜底与「唯一候选即选中」分支已删除
（曾使帕底亚图鉴的喵喵/地鼠错选伽勒尔/阿罗拉形态——那些形态在本作仅可传送获得）。
与 52poke 实际收录不符的特例（如帕底亚图鉴肯泰罗=帕底亚形态）人工写入
data/curated/dex_default_forms.json。

由 build_db.merge_curated 阶段调用 derive(con)；输入库须已含 forms/dex_entries/
regional_dexes/form_game_availability。
"""
from __future__ import annotations

import json
import sqlite3

ROOT = __import__("pathlib").Path(__file__).resolve().parent.parent

# 图鉴 id → 自身地区（决定哪一类地区形态可成为默认；Z-A 两图鉴无本作新地区形态，走 curated）
DEX_REGION = {"galar": "galar", "isle-of-armor": "galar", "crown-tundra": "galar",
              "hisui": "hisui",
              "paldea": "paldea", "kitakami": "paldea", "blueberry": "paldea"}


def derive(con: sqlite3.Connection) -> None:
    suffix_of: dict[int, tuple[int, str]] = {}
    for f in con.execute("SELECT id, species_id, identifier, is_default FROM forms"):
        if f["is_default"]:
            continue
        _, _, suf = f["identifier"].rpartition("-")
        suffix_of[f["id"]] = (f["species_id"], suf)
    avail: dict[int, set[str]] = {}
    for fid, g in con.execute("SELECT form_id, game_id FROM form_game_availability"):
        avail.setdefault(fid, set()).add(g)

    ddf_rows: list[tuple[str, int, int]] = []
    for dex, game in con.execute("SELECT id, game_id FROM regional_dexes").fetchall():
        region = DEX_REGION.get(dex, "")
        if not region:
            continue
        for e in con.execute("SELECT species_id FROM dex_entries WHERE dex_id=?",
                             (dex,)).fetchall():
            sid = e["species_id"]
            for fid, (s2, suf) in suffix_of.items():
                if s2 == sid and suf == region and game in avail.get(fid, set()):
                    ddf_rows.append((dex, sid, fid))

    # 人工增补/覆盖（curated dex_default_forms.json，优先生效）
    ddf_file = ROOT / "data" / "curated" / "dex_default_forms.json"
    if ddf_file.exists():
        manual = json.loads(ddf_file.read_text(encoding="utf-8"))
        manual_rows: list[tuple[str, int, int]] = []
        for dex, m in manual.items():
            if dex.startswith("_") or not isinstance(m, dict):
                continue
            for sid_s, suffix in m.items():
                sid = int(sid_s)
                if suffix in ("", "base"):
                    # 显式基础形态：52poke 图鉴列表无形态标注但自动派生会误选地区形态时使用
                    # （如北上乡乌波——北上图鉴下一行是沼王，须配普通乌波而非帕底亚乌波）
                    row = con.execute(
                        "SELECT id FROM forms WHERE species_id=? AND is_default=1 ORDER BY id LIMIT 1",
                        (sid,)).fetchone()
                else:
                    row = con.execute(
                        """SELECT id FROM forms WHERE species_id=? AND identifier LIKE '%-'||?
                           ORDER BY id LIMIT 1""", (sid, suffix)).fetchone()
                if row:
                    manual_rows.append((dex, sid, row[0]))
        # 人工条目覆盖同键自动派生行（自动在前、人工在后，去重时人工保留）
        auto_only = [r for r in ddf_rows if (r[0], r[1]) not in {(x[0], x[1]) for x in manual_rows}]
        ddf_rows = auto_only + manual_rows

    # 一致性校验：默认形态必须在该游戏可用（hidden/未配置形态不校验）
    bad = []
    seen_pk: set[tuple[str, int]] = set()
    final_ddf = []
    for dex, sid, fid in ddf_rows:
        if (dex, sid) in seen_pk:
            continue
        seen_pk.add((dex, sid))
        game = con.execute("SELECT game_id FROM regional_dexes WHERE id=?", (dex,)).fetchone()
        if fid in avail and game and game[0] not in avail[fid]:
            bad.append((dex, sid, fid))
            continue
        final_ddf.append((dex, sid, fid))
    if bad:
        print(f"  !! dex_default_forms 与可用性冲突 {len(bad)} 条（已跳过）：{bad[:6]}")
    con.executemany("INSERT OR REPLACE INTO dex_default_forms VALUES (?,?,?)", final_ddf)
