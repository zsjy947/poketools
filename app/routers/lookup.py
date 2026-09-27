"""努力值筛选 / 三明治 / 甜甜圈 / 咖喱 / 生蛋链 / 自定义食谱 API。"""
from __future__ import annotations

import json
import re
from functools import lru_cache

from fastapi import APIRouter, Body, HTTPException, Query

from ..db import state_conn, static_conn
from ..services import damage
from ..services.breeding import GAME_LEARNSET_VG, breed_chains

router = APIRouter(prefix="/api")

EV_COLS = {"hp": "ev_hp", "atk": "ev_atk", "def": "ev_def",
           "spa": "ev_spa", "spd": "ev_spd", "spe": "ev_spe"}

# 野外自然出现类 method 白名单（M3 核定：含可见/随机等捕获词；排除 团体战/定点/交换/赠送/活动/化石/不存在）
WILD_METHOD_KEYWORDS = ("可见", "隨機", "随机", "垂钓", "沖浪", "冲浪", "大量出现",
                        "时空歪曲", "宝可追踪", "涂甜甜蜜", "野生", "摇动", "四处游走")


def _is_wild_method(method: str) -> bool:
    m = method or ""
    if not m or "团体战" in m or "不存在" in m or "交换" in m or "赠送" in m or "化石" in m:
        return False
    return any(k in m for k in WILD_METHOD_KEYWORDS)


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
    # 图鉴默认形态覆盖（如洗翠图鉴的卡蒂狗显洗翠样子，EV/属性同步为该形态）
    override: dict[int, dict] = {}
    if game:
        for r in con.execute(
                """SELECT ddf.species_id, f.id AS form_id, f.types,
                          f.ev_hp, f.ev_atk, f.ev_def, f.ev_spa, f.ev_spd, f.ev_spe
                   FROM dex_default_forms ddf
                   JOIN regional_dexes d ON d.id = ddf.dex_id
                   JOIN forms f ON f.id = ddf.form_id
                   WHERE d.game_id = ?""", (game,)):
            override[r["species_id"]] = dict(r)
    # 野外地点（get_methods 野生白名单行；52poke 标记行与该物种的默认覆盖形态匹配才计）
    wild: dict[int, list] = {}
    if game:
        ov_suffix: dict[int, str] = {}
        for sid, ov in override.items():
            ident = con.execute("SELECT identifier FROM forms WHERE id=?",
                                (ov["form_id"],)).fetchone()
            s = (ident[0] or "").rpartition("-")[2] if ident and "-" in (ident[0] or "") else ""
            ov_suffix[sid] = s
        from ..routers.pokemon import FORM_MARKER_TO_SUFFIX
        for r in con.execute(
                """SELECT species_id, location, method, version_label, form
                   FROM get_methods WHERE game=? AND location != ''""", (game,)):
            if not _is_wild_method(r["method"]):
                continue
            if r["form"] and FORM_MARKER_TO_SUFFIX.get(r["form"]) != ov_suffix.get(r["species_id"], ""):
                continue
            wild.setdefault(r["species_id"], []).append(
                {"location": r["location"], "method": r["method"],
                 "version_label": r["version_label"]})
    out = []
    for r in rows:
        if game and r["species_id"] not in _game_dex_species().get(game, frozenset()):
            continue
        if q_lower and q_lower not in r["name_zh"].lower() and q_lower not in (r["name_en"] or "").lower():
            continue
        d = {**dict(r), "ev": {k: r[EV_COLS[k]] for k in EV_COLS}}
        ov = override.get(r["species_id"])
        if ov:
            for k in EV_COLS:
                d[k] = ov[EV_COLS[k]]
            d["ev"] = {k: ov[EV_COLS[k]] for k in EV_COLS}
            d["form_id"] = ov["form_id"]
            d["types"] = ov["types"]
        # 地点去重（同地点多版本行合并标签）
        locs = wild.get(r["species_id"]) or []
        merged: dict[str, dict] = {}
        for item in locs:
            m = merged.setdefault(item["location"], {"location": item["location"],
                                                     "methods": set(), "labels": set()})
            m["methods"].add(item["method"])
            m["labels"].add(item["version_label"])
        d["locations"] = [{"location": m["location"],
                           "method": "、".join(sorted(m["methods"])),
                           "version_label": "、".join(sorted(m["labels"]))}
                          for m in merged.values()]
        out.append(d)
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
        if (power or ptype or level) and not effs:
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


def _recipe_items_counted(v) -> list[dict]:
    """数量版：[{name, count}]（M7）。兼容三种输入：
    新 [{name,count}] 数组 / 旧字符串数组 / 旧顿号文本（后两者 count=1）。"""
    out: list[dict] = []
    if isinstance(v, list):
        for x in v:
            if isinstance(x, dict):
                name = str(x.get("name", "")).strip()[:40]
                if not name:
                    continue
                try:
                    count = max(1, min(99, int(x.get("count", 1) or 1)))
                except (TypeError, ValueError):
                    count = 1
                out.append({"name": name, "count": count})
            elif str(x).strip():
                out.append({"name": str(x).strip()[:40], "count": 1})
        return out[:20]
    return [{"name": n, "count": 1} for n in _recipe_items(v)]


def _parse_items(s: str):
    """读取：JSON 数组（新格式，含 {name,count}）→ list；否则按原文返回（旧文本）。"""
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
    except (TypeError, ValueError) as e:
        raise HTTPException(400, "profile_id 无效") from e
    game = body.get("game") or ""
    if game not in CUSTOM_RECIPE_GAMES:
        raise HTTPException(400, "该游戏不支持自定义食谱")
    effects = body.get("effects") or []
    if not isinstance(effects, list) or not all(
            isinstance(e, dict) for e in effects):
        raise HTTPException(400, "effects 格式无效")
    clean_effects = []
    for e in effects:
        if not e.get("power"):
            continue
        try:
            level = int(e.get("level", 1))
        except (TypeError, ValueError) as e:
            raise HTTPException(400, "effects.level 无效") from e
        clean_effects.append({"power": str(e.get("power", ""))[:20],
                              "type": str(e.get("type", ""))[:8],
                              "level": level})
    effects = clean_effects
    ingredients = _recipe_items_counted(body.get("ingredients"))
    seasonings = _recipe_items_counted(body.get("seasonings"))
    # 朱紫三明治：食材/调味料必填；Z-A 甜甜圈：树果总数 3~8 个（黄油固定无输入）
    ing_names = [i["name"] for i in ingredients]
    sea_names = [i["name"] for i in seasonings]
    if game == "legends-za":
        total = sum(i["count"] for i in ingredients)
        if not 3 <= total <= 8:
            raise HTTPException(400, "树果总数需为 3~8 个（可同种多个）")
    elif not ing_names or not sea_names:
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
