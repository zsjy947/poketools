"""宝可梦详情 / 招式学习表 API。"""
from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

from ..db import static_conn

router = APIRouter(prefix="/api")

GAME_LEARNSET_VG = {"sword-shield": 20, "legends-arceus": 24,
                    "scarlet-violet": 25, "legends-za": 32}
GAME_TM_VGS = {"sword-shield": [20], "legends-arceus": [],
               "scarlet-violet": [25, 26, 27], "legends-za": [30]}


def _clean(t: str | None) -> str:
    return (t or "").replace("\r", "").replace("\n", " ").strip()


@router.get("/pokemon/{species_id}")
def pokemon_detail(species_id: int):
    con = static_conn()
    sp = con.execute("SELECT * FROM species WHERE id=?", (species_id,)).fetchone()
    if sp is None:
        con.close()
        raise HTTPException(404, "species not found")

    forms = [dict(r) for r in con.execute(
        "SELECT * FROM forms WHERE species_id=? ORDER BY is_default DESC, id", (species_id,))]
    default = next((f for f in forms if f["is_default"]), forms[0] if forms else None)

    flavor = [dict(r) for r in con.execute(
        """SELECT game, version_label, text FROM dex_flavor
           WHERE species_id=? ORDER BY
           CASE game WHEN 'sword-shield' THEN 0 WHEN 'legends-arceus' THEN 1
                     WHEN 'scarlet-violet' THEN 2 ELSE 3 END""",
        (species_id,))]

    gm = [dict(r) for r in con.execute(
        """SELECT game, location, method, note FROM get_methods
           WHERE species_id=? ORDER BY
           CASE game WHEN 'sword-shield' THEN 0 WHEN 'legends-arceus' THEN 1
                     WHEN 'scarlet-violet' THEN 2 ELSE 3 END""",
        (species_id,))]
    games_with_gm = {r["game"] for r in gm}
    enc = []
    for r in con.execute(
            """SELECT vg, game_id, location_en, min_level, max_level
               FROM encounters WHERE species_id=? ORDER BY vg, location_en LIMIT 60""",
            (species_id,)):
        if r["game_id"] not in games_with_gm:
            enc.append(dict(r))
    for e in enc:  # 去重（同地点多槽位）
        pass
    seen = set()
    enc_dedup = []
    for e in enc:
        key = (e["game_id"], e["location_en"], e["min_level"], e["max_level"])
        if key not in seen:
            seen.add(key)
            enc_dedup.append(e)

    dex_list = [dict(r) for r in con.execute(
        """SELECT de.dex_id, de.ndex, d.name_zh AS dex_zh, d.game_id,
                  g.name_zh AS game_zh
           FROM dex_entries de
           JOIN regional_dexes d ON d.id = de.dex_id
           JOIN games g ON g.id = d.game_id
           WHERE de.species_id = ? ORDER BY d.sort""", (species_id,))]

    con.close()
    return {
        "species": dict(sp),
        "default_form": default,
        "forms": forms,
        "ev": {k: default[f"ev_{k}"] for k in ("hp", "atk", "def", "spa", "spd", "spe")} if default else {},
        "flavor": flavor,
        "get_methods": gm,
        "encounters_api": enc_dedup,
        "dex_list": dex_list,
    }


@router.get("/pokemon/{species_id}/moves")
def pokemon_moves(species_id: int, game: str = Query(...), form_id: int | None = None):
    con = static_conn()
    sp = con.execute("SELECT id, name_zh FROM species WHERE id=?", (species_id,)).fetchone()
    if sp is None:
        con.close()
        raise HTTPException(404, "species not found")
    vg = GAME_LEARNSET_VG.get(game)
    if vg is None:
        con.close()
        raise HTTPException(400, "unknown game")

    form = None
    if form_id:
        form = con.execute("SELECT * FROM forms WHERE id=? AND species_id=?",
                           (form_id, species_id)).fetchone()
    if form is None:
        form = con.execute(
            "SELECT * FROM forms WHERE species_id=? ORDER BY is_default DESC, id LIMIT 1",
            (species_id,)).fetchone()

    rows = con.execute(
        """SELECT l.method, l.level, m.id AS move_id, m.name_zh, m.type_zh,
                  m.damage_class, m.power, m.accuracy, m.pp
           FROM learnsets l JOIN moves m ON m.id = l.move_id
           WHERE l.form_id=? AND l.vg=?
           ORDER BY m.id""", (form["id"], vg)).fetchall()

    # TM 编号 + 获取方式（跨该游戏家族的版本组查）
    tm_vgs = GAME_TM_VGS.get(game, [])
    machines: dict[int, list] = {}
    if tm_vgs:
        marks = ",".join("?" * len(tm_vgs))
        for r in con.execute(
                f"""SELECT machine_number, vg, move_id FROM machines
                    WHERE vg IN ({marks}) ORDER BY vg, machine_number""", tm_vgs):
            machines.setdefault(r["move_id"], []).append((r["vg"], r["machine_number"]))
    tm_how: dict[tuple, dict] = {}
    for r in con.execute("SELECT vg, machine_number, how, materials FROM tm_how"):
        tm_how[(r["vg"], r["machine_number"])] = {
            "how": _clean(r["how"]), "materials": _clean(r["materials"])}

    def tm_info(move_id: int) -> list[dict]:
        out = []
        for vgnum, num in machines.get(move_id, []):
            h = tm_how.get((vgnum, num), {})
            out.append({"number": num, "how": h.get("how", ""), "materials": h.get("materials", "")})
        return out

    groups: dict[str, list] = {"level": [], "machine": [], "egg": [], "tutor": []}
    seen = set()
    for r in rows:
        d = dict(r)
        d["tm"] = tm_info(r["move_id"]) if r["method"] == "machine" else []
        key = (r["method"], r["move_id"], r["level"])
        if key in seen:
            continue
        seen.add(key)
        if r["method"] == "level-up":
            groups["level"].append(d)
        elif r["method"] == "machine":
            groups["machine"].append(d)
        elif r["method"] == "egg":
            groups["egg"].append(d)
        elif r["method"] == "tutor":
            groups["tutor"].append(d)
    groups["level"].sort(key=lambda d: (d["level"] or 0, d["move_id"]))
    for k in ("machine", "egg", "tutor"):
        groups[k].sort(key=lambda d: d["name_zh"])

    has_breeding = con.execute(
        "SELECT has_breeding FROM games WHERE id=?", (game,)).fetchone()["has_breeding"]
    con.close()
    return {
        "species": dict(sp), "form": dict(form), "game": game, "vg": vg,
        "has_breeding": bool(has_breeding),
        "groups": groups,
    }
