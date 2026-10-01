"""图鉴默认形态派生（P1-7 外移）：按 form_game_availability 可用性自动派生 +
curated dex_default_forms.json 人工增补覆盖 + 一致性校验（默认形态须在该游戏可用）。

由 build_db.merge_curated 阶段调用 derive(con)；输入库须已含 forms/dex_entries/
regional_dexes/form_game_availability。
"""
from __future__ import annotations

import json
import sqlite3

ROOT = __import__("pathlib").Path(__file__).resolve().parent.parent


def derive(con: sqlite3.Connection) -> None:

            # ---- 图鉴默认形态：按可用性自动派生（同图鉴成员 + 该游戏可用的形态） ----
            REGION_PREF = {"sword-shield": ["galar", "alola", "hisui", "paldea"],
                           "legends-arceus": ["hisui", "alola"],
                           "scarlet-violet": ["paldea", "galar", "alola", "hisui"],
                           "legends-za": ["galar", "hisui", "alola", "paldea"]}
            dex_region = {"galar": "galar", "isle-of-armor": "galar", "crown-tundra": "galar",
                          "hisui": "hisui", "paldea": "paldea", "kitakami": "paldea",
                          "blueberry": "paldea"}
            suffix_of = {}
            for f in con.execute("SELECT id, species_id, identifier, is_default FROM forms"):
                if f["is_default"]:
                    continue
                _, _, suf = f["identifier"].rpartition("-")
                suffix_of[f["id"]] = (f["species_id"], suf)
            avail: dict[int, set[str]] = {}
            for fid, g in con.execute("SELECT form_id, game_id FROM form_game_availability"):
                avail.setdefault(fid, set()).add(g)
            ddf_rows: list[tuple] = []
            for dex, game in con.execute("SELECT id, game_id FROM regional_dexes").fetchall():
                pref = REGION_PREF.get(game, [])
                region = dex_region.get(dex, "")
                for e in con.execute(
                        "SELECT species_id FROM dex_entries WHERE dex_id=?", (dex,)).fetchall():
                    sid = e["species_id"]
                    cands = [(fid, suf) for fid, (s2, suf) in suffix_of.items() if s2 == sid
                             and game in avail.get(fid, set())
                             and suf not in ("gmax", "mega", "primal", "mega-x", "mega-y")]
                    if not cands:
                        continue
                    pick = None
                    cand_sufs = {s for _, s in cands}
                    if region in cand_sufs:
                        pick = next(f for f, s in cands if s == region)
                    else:
                        for p in pref:
                            if p in cand_sufs:
                                pick = next(f for f, s in cands if s == p)
                                break
                    if pick is None and len(cands) == 1:
                        pick = cands[0][0]
                    if pick is not None:
                        ddf_rows.append((dex, sid, pick))
            # 人工增补/覆盖（curated dex_default_forms.json，优先生效）
            ddf_file = ROOT / "data" / "curated" / "dex_default_forms.json"
            if ddf_file.exists():
                manual = json.loads(ddf_file.read_text(encoding="utf-8"))
                manual_pairs = set()
                for dex, m in manual.items():
                    for sid_s, suffix in m.items():
                        sid = int(sid_s)
                        row = con.execute(
                            """SELECT id FROM forms WHERE species_id=? AND identifier LIKE '%-'||?
                               ORDER BY id LIMIT 1""", (sid, suffix)).fetchone()
                        if row:
                            ddf_rows.append((dex, sid, row[0]))
                            manual_pairs.add((dex, sid))
                ddf_rows = [r for r in ddf_rows if (r[0], r[1]) not in manual_pairs] + \
                           [r for r in ddf_rows if (r[0], r[1]) in manual_pairs]
            # 一致性校验：默认形态必须在该游戏可用（hidden/未配置形态不校验）
            bad = []
            seen_pk = set()
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

