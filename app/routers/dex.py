"""图鉴与捕捉状态 API。"""
from __future__ import annotations

import json
import sqlite3

from fastapi import APIRouter, Body, Depends, HTTPException, Query

from ..db import get_state_db, get_static_db

router = APIRouter(prefix="/api")

TYPE_ORDER = ["一般", "火", "水", "电", "草", "冰", "格斗", "毒", "地面",
              "飞行", "超能力", "虫", "岩石", "幽灵", "龙", "恶", "钢", "妖精"]


def _type_sort(types: str) -> str:
    parts = [t for t in (types or "").split(",") if t]
    parts.sort(key=lambda t: TYPE_ORDER.index(t) if t in TYPE_ORDER else 99)
    return ",".join(parts)


@router.get("/games")
def games(con: sqlite3.Connection = Depends(get_static_db)):
    out = []
    for g in con.execute("SELECT * FROM games ORDER BY sort"):
        try:
            features = json.loads(g["features"] or "[]")
        except (TypeError, ValueError):
            features = []
        dexes = []
        for d in con.execute(
            """SELECT d.id, d.name_zh, d.name_en, COUNT(e.species_id) AS total
               FROM regional_dexes d
               LEFT JOIN dex_entries e ON e.dex_id = d.id
               WHERE d.game_id = ? GROUP BY d.id ORDER BY d.sort""", (g["id"],)):
            dexes.append(dict(d))
        out.append({**{k: v for k, v in dict(g).items() if k != "features"},
                    "features": features, "dexes": dexes})
    return out


@router.get("/dex/{dex_id}")
def dex_entries(
    dex_id: str,
    profile: int = 1,
    filter: str = Query("all", pattern="^(all|caught|uncaught)$"),
    type: str = "",
    q: str = "",
    con: sqlite3.Connection = Depends(get_static_db),
    scon: sqlite3.Connection = Depends(get_state_db),
):
    dex = con.execute(
        """SELECT d.*, g.id AS game_id, g.name_zh AS game_zh
           FROM regional_dexes d JOIN games g ON g.id = d.game_id WHERE d.id=?""",
        (dex_id,)).fetchone()
    if dex is None:
        raise HTTPException(404, "dex not found")

    # 图鉴默认展示形态：优先 dex_default_forms 覆盖（如洗翠图鉴显洗翠样子/北上乡月月熊显血月），
    # 无覆盖回退 is_default=1
    override_map = {r["species_id"]: r["form_id"] for r in con.execute(
        "SELECT species_id, form_id FROM dex_default_forms WHERE dex_id=?", (dex_id,))}
    types_map = {r["species_id"]: (r["form_id"], r["types"] or "") for r in con.execute(
        """SELECT f.species_id, f.id AS form_id, f.types
           FROM forms f JOIN dex_entries e ON e.species_id = f.species_id
           WHERE e.dex_id = ? AND f.is_default = 1""", (dex_id,)).fetchall()}
    caught_map = {}
    for r in scon.execute(
            "SELECT species_id, caught FROM caught_state WHERE profile_id=? AND dex_id=?",
            (profile, dex_id)):
        caught_map[r["species_id"]] = bool(r["caught"])

    q_lower = q.strip().lower()
    entries = []
    for r in con.execute(
            """SELECT e.ndex, e.species_id, s.name_zh, s.name_en
               FROM dex_entries e JOIN species s ON s.id = e.species_id
               WHERE e.dex_id = ? ORDER BY e.ndex""", (dex_id,)):
        fid, tp = types_map.get(r["species_id"], (0, ""))
        ofid = override_map.get(r["species_id"])
        if ofid:
            frow = con.execute("SELECT types FROM forms WHERE id=?", (ofid,)).fetchone()
            fid, tp = ofid, (frow["types"] or "") if frow else ""
        entries.append({"ndex": r["ndex"], "species_id": r["species_id"],
                        "name_zh": r["name_zh"], "name_en": r["name_en"],
                        "types": _type_sort(tp), "form_id": fid,
                        "caught": caught_map.get(r["species_id"], False)})

    if filter == "caught":
        entries = [e for e in entries if e["caught"]]
    elif filter == "uncaught":
        entries = [e for e in entries if not e["caught"]]
    if type:
        entries = [e for e in entries if type in e["types"].split(",")]
    if q_lower:
        entries = [e for e in entries if q_lower in e["name_zh"].lower()
                   or q_lower in (e["name_en"] or "").lower()
                   or q_lower == str(e["ndex"])]
    return {"id": dex["id"], "name_zh": dex["name_zh"], "name_en": dex["name_en"],
            "game_id": dex["game_id"], "game_zh": dex["game_zh"],
            "total": len(entries), "entries": entries}


# 档案 API 已随四期 P3-1 下线：UI 固定默认档案（profile_id=1），
# userstate.db 的 profiles 表与历史数据保留不动（零迁移零丢失）。


def _int_or_400(v, name: str) -> int:
    try:
        return int(v)
    except (TypeError, ValueError) as e:
        raise HTTPException(400, f"{name} 无效") from e


def _same_game_dex_ids(con: sqlite3.Connection, species_id: int, game_id: str) -> list[str]:
    """同游戏内含该物种的全部图鉴（本体↔DLC 双向同步；跨游戏不同步）。

    图鉴成员在静态库，userstate 只存 caught_state。"""
    return [r["dex_id"] for r in con.execute(
        """SELECT DISTINCT e.dex_id AS dex_id
           FROM dex_entries e JOIN regional_dexes d ON d.id = e.dex_id
           WHERE e.species_id = ? AND d.game_id = ?""", (species_id, game_id))]


@router.put("/state")
def set_state(body: dict = Body(...), con: sqlite3.Connection = Depends(get_static_db),
              scon: sqlite3.Connection = Depends(get_state_db)):
    pid = _int_or_400(body.get("profile_id"), "profile_id")
    dex_id = body.get("dex_id") or ""
    try:
        species_id = int(body.get("species_id"))
    except (TypeError, ValueError) as e:
        raise HTTPException(400, "species_id 无效") from e
    if not dex_id:
        raise HTTPException(400, "dex_id 必填")
    caught = 1 if body.get("caught") else 0
    game = con.execute(
        "SELECT game_id FROM regional_dexes WHERE id=?", (dex_id,)).fetchone()
    if game is None:
        raise HTTPException(400, "dex_id 无效")
    # 同游戏双向同步：本体 / DLC 图鉴随标记操作一并对齐
    dex_ids = _same_game_dex_ids(con, species_id, game["game_id"]) or [dex_id]
    if dex_id not in dex_ids:
        dex_ids.append(dex_id)
    scon.executemany(
        """INSERT INTO caught_state (profile_id, dex_id, species_id, caught)
           VALUES (?,?,?,?)
           ON CONFLICT(profile_id, dex_id, species_id)
           DO UPDATE SET caught=excluded.caught, updated_at=datetime('now','localtime')""",
        [(pid, d, species_id, caught) for d in dex_ids])
    scon.commit()
    return {"ok": True, "synced_dexes": dex_ids}


@router.post("/state/bulk")
def set_state_bulk(body: dict = Body(...), con: sqlite3.Connection = Depends(get_static_db),
                   scon: sqlite3.Connection = Depends(get_state_db)):
    pid = _int_or_400(body.get("profile_id"), "profile_id")
    dex_id = body.get("dex_id") or ""
    if not dex_id:
        raise HTTPException(400, "dex_id 必填")
    caught = 1 if body.get("caught") else 0
    try:
        ids = [int(s) for s in body.get("species_ids", [])]
    except (TypeError, ValueError) as e:
        raise HTTPException(400, "species_ids 无效") from e
    game = con.execute(
        "SELECT game_id FROM regional_dexes WHERE id=?", (dex_id,)).fetchone()
    if game is None:
        raise HTTPException(400, "dex_id 无效")
    # 逐物种同步：同游戏内所有含该物种的图鉴一并 UPSERT（本体↔DLC 双向）
    rows = []
    for sid in ids:
        for d in _same_game_dex_ids(con, sid, game["game_id"]):
            rows.append((pid, d, sid, caught))
    scon.executemany(
        """INSERT INTO caught_state (profile_id, dex_id, species_id, caught)
           VALUES (?,?,?,?)
           ON CONFLICT(profile_id, dex_id, species_id)
           DO UPDATE SET caught=excluded.caught, updated_at=datetime('now','localtime')""",
        rows)
    scon.commit()
    return {"ok": True, "count": len(ids)}


@router.get("/state/counts")
def state_counts(profile: int = 1, scon: sqlite3.Connection = Depends(get_state_db)):
    """全部图鉴的已捕捉计数（一次返回，修复未访问 tab 计数恒 0）。"""
    rows = scon.execute(
        """SELECT c.dex_id, COUNT(*) AS caught
           FROM caught_state c WHERE c.profile_id=? AND c.caught=1
           GROUP BY c.dex_id""", (profile,)).fetchall()
    return {r["dex_id"]: r["caught"] for r in rows}
