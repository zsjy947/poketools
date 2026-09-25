"""努力值筛选 / 三明治 / 甜甜圈 / 咖喱 / 生蛋链 / 自定义食谱 API。"""
from __future__ import annotations

import json
import re
from functools import lru_cache

from fastapi import APIRouter, Body, HTTPException, Query

from ..db import static_conn, state_conn
from ..services import damage
from ..services.breeding import breed_chains, GAME_LEARNSET_VG

router = APIRouter(prefix="/api")

EV_COLS = {"hp": "ev_hp", "atk": "ev_atk", "def": "ev_def",
           "spa": "ev_spa", "spd": "ev_spd", "spe": "ev_spe"}


@lru_cache(maxsize=8)
def _game_dex_species() -> dict[str, frozenset[int]]:
    """game_id -> 图鉴内物种集合（进程内缓存，避免 /api/ev 每次全表扫）"""
    con = static_conn()
    out: dict[str, set[int]] = {}
    for r in con.execute("""SELECT de.species_id AS sid, d.game_id AS game
                            FROM dex_entries de JOIN regional_dexes d ON d.id = de.dex_id"""):
        out.setdefault(r["game"], set()).add(r["sid"])
    con.close()
    return {g: frozenset(s) for g, s in out.items()}


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

    q_lower = q.strip().lower()
    out = []
    for r in rows:
        if game and r["species_id"] not in _game_dex_species().get(game, frozenset()):
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
    if game not in GAME_LEARNSET_VG:
        raise HTTPException(400, "unknown game")
    con = static_conn()
    try:
        return breed_chains(con, species_id, move_id, game)
    finally:
        con.close()


# ---------------------------------------------------------------- 三期：属性相性 / 特化功能

@router.get("/meta/typechart")
def typechart():
    return {"types": damage.TYPES,
            "chart": {atk: {dfd: mult for dfd, mult in pairs.items()}
                      for atk, pairs in damage.CHART.items()}}


@router.get("/picnic-items")
def picnic_items(kind: str = Query("", pattern="^(|食材|调味料|咖喱食材)$")):
    con = static_conn()
    if kind:
        rows = con.execute(
            "SELECT rowid AS no_rowid, * FROM picnic_items WHERE kind=? ORDER BY kind, name",
            (kind,))
    else:
        rows = con.execute("SELECT rowid AS no_rowid, * FROM picnic_items ORDER BY kind, name")
    out = [dict(r) for r in rows]
    con.close()
    return out


@router.get("/donuts")
def donuts():
    con = static_conn()
    out = {
        "types": [dict(r) for r in con.execute("SELECT * FROM donut_types")],
        "special": [dict(r) for r in con.execute("SELECT * FROM special_donuts")],
        "berries": [dict(r) for r in con.execute(
            "SELECT * FROM berries ORDER BY energy, name")],
        "flavor_powers": [dict(r) for r in con.execute("SELECT * FROM flavor_powers")],
    }
    con.close()
    return out


@router.get("/curries")
def curries(q: str = "", key_ingredient: str = ""):
    con = static_conn()
    sql = "SELECT * FROM curries WHERE 1=1"
    args: list = []
    if q:
        sql += " AND (name LIKE ? OR key_ingredient LIKE ?)"
        kw = f"%{q.strip()}%"
        args += [kw, kw]
    if key_ingredient:
        sql += " AND key_ingredient=?"
        args.append(key_ingredient)
    sql += " ORDER BY no"
    out = [dict(r) for r in con.execute(sql, args)]
    con.close()
    return out


# ---------------------------------------------------------------- 自定义食谱（userstate.db）

CUSTOM_RECIPE_GAMES = ("scarlet-violet", "legends-za")


def _recipe_items(v) -> list[str]:
    """食材/调味料字段：兼容数组（新）与顿号/逗号分隔文本（旧）。"""
    if isinstance(v, list):
        return [str(x).strip()[:40] for x in v if str(x).strip()][:20]
    s = str(v or "").strip()
    if not s:
        return []
    return [x.strip()[:40] for x in re.split("[、,，\n]", s) if x.strip()][:20]


def _parse_items(s: str):
    """读取：JSON 数组（新格式）→ list；否则按原文返回（旧文本）。"""
    s = s or ""
    try:
        v = json.loads(s)
        if isinstance(v, list):
            return v
    except (ValueError, TypeError):
        pass
    return s


@router.get("/custom-recipes")
def list_custom_recipes(profile: int = 1, game: str = ""):
    con = state_conn()
    sql = "SELECT id, game, name, effects, ingredients, seasonings, created_at " \
          "FROM custom_recipes WHERE profile_id=?"
    args: list = [profile]
    if game:
        sql += " AND game=?"
        args.append(game)
    out = [dict(r) for r in con.execute(sql + " ORDER BY id DESC", args)]
    con.close()
    for r in out:
        r["effects"] = json.loads(r["effects"] or "[]")
        r["ingredients"] = _parse_items(r["ingredients"])
        r["seasonings"] = _parse_items(r["seasonings"])
    return out


@router.post("/custom-recipes")
def add_custom_recipe(body: dict = Body(...)):
    try:
        pid = int(body.get("profile_id") or 1)
    except (TypeError, ValueError):
        raise HTTPException(400, "profile_id 无效")
    game = body.get("game") or ""
    if game not in CUSTOM_RECIPE_GAMES:
        raise HTTPException(400, "该游戏不支持自定义食谱")
    effects = body.get("effects") or []
    if not isinstance(effects, list) or not all(
            isinstance(e, dict) for e in effects):
        raise HTTPException(400, "effects 格式无效")
    effects = [{"power": str(e.get("power", ""))[:20],
                "type": str(e.get("type", ""))[:8],
                "level": int(e.get("level", 1))}
               for e in effects if e.get("power")]
    ingredients = _recipe_items(body.get("ingredients"))
    seasonings = _recipe_items(body.get("seasonings"))
    # 朱紫三明治：食材/调味料必填；Z-A 甜甜圈：树果 3~8 个（黄油固定无输入）
    if game == "legends-za":
        if not 3 <= len(ingredients) <= 8:
            raise HTTPException(400, "树果数量需为 3~8 个")
    elif not ingredients or not seasonings:
        raise HTTPException(400, "效果、食材、调味料均为必填")
    if not effects:
        raise HTTPException(400, "效果为必填")
    name = str(body.get("name") or "")[:40].strip() or "我的食谱"
    con = state_conn()
    cur = con.execute(
        """INSERT INTO custom_recipes (profile_id, game, name, effects, ingredients, seasonings)
           VALUES (?,?,?,?,?,?)""",
        (pid, game, name, json.dumps(effects, ensure_ascii=False),
         json.dumps(ingredients, ensure_ascii=False),
         json.dumps(seasonings, ensure_ascii=False)))
    con.commit()
    rid = cur.lastrowid
    row = con.execute("SELECT * FROM custom_recipes WHERE id=?", (rid,)).fetchone()
    con.close()
    d = dict(row)
    d["effects"] = json.loads(d["effects"] or "[]")
    d["ingredients"] = _parse_items(d["ingredients"])
    d["seasonings"] = _parse_items(d["seasonings"])
    return d


@router.delete("/custom-recipes/{recipe_id}")
def del_custom_recipe(recipe_id: int, profile: int = 1):
    con = state_conn()
    con.execute("DELETE FROM custom_recipes WHERE id=? AND profile_id=?", (recipe_id, profile))
    con.commit()
    con.close()
    return {"ok": True}
