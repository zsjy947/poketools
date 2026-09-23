"""图鉴与捕捉状态 API。"""
from __future__ import annotations

import json

from fastapi import APIRouter, Body, HTTPException, Query

from ..db import state_conn, static_conn

router = APIRouter(prefix="/api")

TYPE_ORDER = ["一般", "火", "水", "电", "草", "冰", "格斗", "毒", "地面",
              "飞行", "超能力", "虫", "岩石", "幽灵", "龙", "恶", "钢", "妖精"]


def _type_sort(types: str) -> str:
    parts = [t for t in (types or "").split(",") if t]
    parts.sort(key=lambda t: TYPE_ORDER.index(t) if t in TYPE_ORDER else 99)
    return ",".join(parts)


@router.get("/games")
def games():
    con = static_conn()
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
        out.append({**{k: g[k] for k in g.keys() if k != "features"},
                    "features": features, "dexes": dexes})
    con.close()
    return out


@router.get("/dex/{dex_id}")
def dex_entries(
    dex_id: str,
    profile: int = 1,
    filter: str = Query("all", pattern="^(all|caught|uncaught)$"),
    type: str = "",
    q: str = "",
):
    con = static_conn()
    dex = con.execute(
        """SELECT d.*, g.id AS game_id, g.name_zh AS game_zh
           FROM regional_dexes d JOIN games g ON g.id = d.game_id WHERE d.id=?""",
        (dex_id,)).fetchone()
    if dex is None:
        con.close()
        raise HTTPException(404, "dex not found")

    form_rows = con.execute(
        """SELECT f.species_id, f.id AS form_id, f.types
           FROM forms f JOIN dex_entries e ON e.species_id = f.species_id
           WHERE e.dex_id = ? AND f.is_default = 1""", (dex_id,)).fetchall()
    types_map = {r["species_id"]: (r["form_id"], r["types"] or "") for r in form_rows}
    caught_map = {}
    scon = state_conn()
    for r in scon.execute(
            "SELECT species_id, caught FROM caught_state WHERE profile_id=? AND dex_id=?",
            (profile, dex_id)):
        caught_map[r["species_id"]] = bool(r["caught"])
    scon.close()

    q_lower = q.strip().lower()
    entries = []
    for r in con.execute(
            """SELECT e.ndex, e.species_id, s.name_zh, s.name_en
               FROM dex_entries e JOIN species s ON s.id = e.species_id
               WHERE e.dex_id = ? ORDER BY e.ndex""", (dex_id,)):
        fid, tp = types_map.get(r["species_id"], (0, ""))
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
    con.close()
    return {"id": dex["id"], "name_zh": dex["name_zh"], "name_en": dex["name_en"],
            "game_id": dex["game_id"], "game_zh": dex["game_zh"],
            "total": len(entries), "entries": entries}


@router.get("/profiles")
def profiles():
    con = state_conn()
    rows = [dict(r) for r in con.execute("SELECT id, name FROM profiles ORDER BY id")]
    con.close()
    return rows


@router.post("/profiles")
def add_profile(body: dict = Body(...)):
    name = (body.get("name") or "").strip()
    if not name:
        raise HTTPException(400, "name required")
    con = state_conn()
    try:
        cur = con.execute("INSERT INTO profiles (name) VALUES (?)", (name,))
        con.commit()
        pid = cur.lastrowid
    except Exception:
        raise HTTPException(400, "档案名已存在")
    finally:
        con.close()
    return {"id": pid, "name": name}


def _int_or_400(v, name: str) -> int:
    try:
        return int(v)
    except (TypeError, ValueError):
        raise HTTPException(400, f"{name} 无效")


@router.put("/state")
def set_state(body: dict = Body(...)):
    pid = _int_or_400(body.get("profile_id"), "profile_id")
    dex_id = body.get("dex_id") or ""
    try:
        species_id = int(body.get("species_id"))
    except (TypeError, ValueError):
        raise HTTPException(400, "species_id 无效")
    if not dex_id:
        raise HTTPException(400, "dex_id 必填")
    caught = 1 if body.get("caught") else 0
    con = state_conn()
    con.execute(
        """INSERT INTO caught_state (profile_id, dex_id, species_id, caught)
           VALUES (?,?,?,?)
           ON CONFLICT(profile_id, dex_id, species_id)
           DO UPDATE SET caught=excluded.caught, updated_at=datetime('now','localtime')""",
        (pid, dex_id, species_id, caught))
    con.commit()
    con.close()
    return {"ok": True}


@router.post("/state/bulk")
def set_state_bulk(body: dict = Body(...)):
    pid = _int_or_400(body.get("profile_id"), "profile_id")
    dex_id = body.get("dex_id") or ""
    if not dex_id:
        raise HTTPException(400, "dex_id 必填")
    caught = 1 if body.get("caught") else 0
    try:
        ids = [int(s) for s in body.get("species_ids", [])]
    except (TypeError, ValueError):
        raise HTTPException(400, "species_ids 无效")
    con = state_conn()
    con.executemany(
        """INSERT INTO caught_state (profile_id, dex_id, species_id, caught)
           VALUES (?,?,?,?)
           ON CONFLICT(profile_id, dex_id, species_id)
           DO UPDATE SET caught=excluded.caught, updated_at=datetime('now','localtime')""",
        [(pid, dex_id, s, caught) for s in ids])
    con.commit()
    con.close()
    return {"ok": True, "count": len(ids)}
