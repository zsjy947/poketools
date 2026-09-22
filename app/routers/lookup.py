"""努力值筛选 / 三明治 / 生蛋链查询 API。"""
from __future__ import annotations

import json

from fastapi import APIRouter, HTTPException, Query

from ..db import static_conn
from ..services.breeding import breed_chains

router = APIRouter(prefix="/api")

EV_COLS = {"hp": "ev_hp", "atk": "ev_atk", "def": "ev_def",
           "spa": "ev_spa", "spd": "ev_spd", "spe": "ev_spe"}


@router.get("/ev")
def ev_filter(
    stat: str = Query(..., pattern="^(hp|atk|def|spa|spd|spe)$"),
    value: int = Query(0, ge=0, le=3),
    game: str = "",
    q: str = "",
):
    con = static_conn()
    col = EV_COLS[stat]
    cond = f"f.{col} > 0" if value == 0 else f"f.{col} = {int(value)}"
    rows = con.execute(
        f"""SELECT s.id AS species_id, s.name_zh, s.name_en, f.id AS form_id,
                   f.types, f.ev_hp, f.ev_atk, f.ev_def,
                   f.ev_spa, f.ev_spd, f.ev_spe
            FROM forms f JOIN species s ON s.id = f.species_id
            WHERE f.is_default = 1 AND {cond}
            ORDER BY s.id""").fetchall()

    game_dexes: dict[str, set[int]] = {}
    if game:
        for r in con.execute(
                """SELECT de.species_id, d.game_id FROM dex_entries de
                   JOIN regional_dexes d ON d.id = de.dex_id"""):
            game_dexes.setdefault(r["game_id"], set()).add(r["species_id"])

    q_lower = q.strip().lower()
    out = []
    for r in rows:
        if game and r["species_id"] not in game_dexes.get(game, set()):
            continue
        if q_lower and q_lower not in r["name_zh"].lower() and q_lower not in (r["name_en"] or "").lower():
            continue
        out.append({**dict(r), "ev": {k: r[EV_COLS[k]] for k in EV_COLS}})
    con.close()
    return out


@router.get("/sandwiches")
def sandwiches(
    power: str = "",
    ptype: str = "",
    level: int = 0,
    sort: str = Query("no", pattern="^(no|power|level)$"),
    q: str = "",
):
    con = static_conn()
    rows = [dict(r) for r in con.execute("SELECT * FROM sandwiches ORDER BY no")]
    con.close()
    for r in rows:
        r["effects"] = json.loads(r["effects"] or "[]")
    out = []
    q_lower = q.strip().lower()
    for r in rows:
        if q_lower and q_lower not in r["name"].lower() and q_lower not in (r["ingredients"] + r["seasonings"]).lower():
            continue
        effs = r["effects"]
        if power:
            effs = [e for e in effs if e["power"] == power]
        if ptype:
            effs = [e for e in effs if e["type"] == ptype]
        if level:
            effs = [e for e in effs if e["level"] == level]
        if power or ptype or level:
            if not effs:
                continue
        out.append({**r, "effects": effs,
                    "_min_level": min((e["level"] for e in r["effects"]), default=9)})

    if sort == "power":
        out.sort(key=lambda r: (r["effects"][0]["power"] if r["effects"] else "", r["no"]))
    elif sort == "level":
        out.sort(key=lambda r: (-max((e["level"] for e in r["effects"]), default=0), r["no"]))
    return out


@router.get("/breed-chains")
def api_breed_chains(species_id: int = Query(...), move_id: int = Query(...),
                     game: str = Query(...)):
    con = static_conn()
    try:
        return breed_chains(con, species_id, move_id, game)
    finally:
        con.close()
