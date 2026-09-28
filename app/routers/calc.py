"""伤害计算器 API。

五期重构（CALC-UPDATE-PLAN）：
- 机制归属：太晶化/极巨化 = 标记点亮；Z 招式 = 每招独立标记（一场战斗仅一次 Z 力量）；
  超级进化/超极巨化/原始回归 = 形态选择派生，与标记互斥。
- /api/calc/batch 一次算双方 × 4 招；compare-forms 已删除。
- 全量道具/特性从 DB 下发；招式含变化类（Z 变化标记）。
- 防守方太晶相性按太晶后属性；进场 HP 扣减先扣再算 KO。
"""
from __future__ import annotations

import sqlite3

from fastapi import APIRouter, Body, Depends, HTTPException, Query

from ..db import get_static_db
from ..services import damage

router = APIRouter(prefix="/api")

DEFAULT_EV = {"hp": 0, "atk": 0, "def": 0, "spa": 0, "spd": 0, "spe": 0}
DEFAULT_IV = {"hp": 31, "atk": 31, "def": 31, "spa": 31, "spd": 31, "spe": 31}

# 请求 opt 白名单（透传伤害引擎；z_moves 为每招独立 Z 标记数组）
FIELD_OPTS = ("mode", "weather", "terrain", "gravity", "magic_room", "wonder_room",
              "crit", "helping_hand", "friend_guard", "foresight",
              "flower_gift", "flower_gift_d", "steely_spirit", "battery", "power_spot",
              "auras", "ruin", "hazards", "defender_sash")


@router.get("/meta/species")
def meta_species(con: sqlite3.Connection = Depends(get_static_db)):
    return [dict(r) for r in con.execute(
        "SELECT id, name_zh, name_en FROM species ORDER BY id")]


@router.get("/calc/forms")
def calc_forms(species_id: int = Query(...),
               con: sqlite3.Connection = Depends(get_static_db)):
    rows = [dict(r) for r in con.execute(
        """SELECT id,
                  COALESCE(NULLIF(form_label, ''),
                           CASE WHEN is_default=1 THEN '默认形态' ELSE identifier END) AS form_label,
                  identifier, types, abilities, hidden_abilities, is_mega,
                  hp, atk, def, spa, spd, spe
           FROM forms WHERE species_id=? ORDER BY is_default DESC, id""", (species_id,))]
    for f in rows:
        hidden = {a for a in (f.pop("hidden_abilities") or "").split(",") if a}
        f["ability_list"] = [
            {"name": a, "hidden": a in hidden} for a in (f["abilities"] or "").split(",") if a]
    return rows


@router.get("/meta/items")
def meta_items(con: sqlite3.Connection = Depends(get_static_db)):
    """全量道具（DB items 表；identifier 供图标路径 /sprites/items/{identifier}.png）。"""
    return [dict(r) for r in con.execute(
        "SELECT identifier, name_zh FROM items WHERE name_zh != '' ORDER BY id")]


@router.get("/meta/abilities")
def meta_abilities(con: sqlite3.Connection = Depends(get_static_db)):
    """全量特性列表（计算器无游戏上下文，不按游戏隐藏）。"""
    rows = [dict(r) for r in con.execute(
        "SELECT name_zh FROM abilities WHERE name_zh != '' ORDER BY ability_id")]
    return [r["name_zh"] for r in rows]


@router.get("/meta/z-moves")
def meta_z_moves(con: sqlite3.Connection = Depends(get_static_db)):
    """Z 纯晶表：泛用（属性→纯晶）+ 专属（species+招式→Z 招式）。"""
    generic = [dict(r) for r in con.execute(
        """SELECT i.identifier AS crystal_identifier, i.name_zh AS crystal_name
           FROM items i WHERE i.id >= 900000 AND i.id < 900100 ORDER BY i.id""")]
    exclusive = [dict(r) for r in con.execute(
        """SELECT z.crystal_identifier, i.name_zh AS crystal_name, z.species_id,
                  z.form_suffix, z.base_move_id, z.z_move_name, z.power,
                  z.damage_class, z.note
           FROM z_exclusive z LEFT JOIN items i ON i.identifier = z.crystal_identifier
           ORDER BY z.crystal_identifier, z.species_id""")]
    return {"generic": generic, "exclusive": exclusive}


@router.get("/meta/natures")
def natures(con: sqlite3.Connection = Depends(get_static_db)):
    return [dict(r) for r in con.execute("SELECT * FROM natures ORDER BY id")]


@router.get("/calc/moves")
def calc_moves(species_id: int = Query(...),
               con: sqlite3.Connection = Depends(get_static_db)):
    """全世代招式并集（含变化招式；标注可学会的世代）。"""
    rows = con.execute(
        """SELECT m.id AS move_id, m.name_zh, m.type_zh, m.damage_class,
                  m.power, m.accuracy, m.is_spread, MIN(v.gen) AS first_gen,
                  GROUP_CONCAT(DISTINCT v.gen) AS gens
           FROM learnsets_all l
           JOIN forms f ON f.id = l.form_id
           JOIN moves m ON m.id = l.move_id
           JOIN vgs v ON v.id = l.vg
           WHERE f.species_id = ?
           GROUP BY m.id
           ORDER BY first_gen, m.id""", (species_id,)).fetchall()
    out = []
    for r in rows:
        d = dict(r)
        d["gens"] = sorted({int(x) for x in (r["gens"] or "").split(",") if x})
        out.append(d)
    return out


def _assemble(con, side: dict, is_attacker: bool) -> dict:
    species_id = side.get("species_id")
    sp = con.execute("SELECT * FROM species WHERE id=?", (species_id,)).fetchone()
    if sp is None:
        raise HTTPException(404, f"species {species_id} not found")
    form = None
    if side.get("form_id"):
        form = con.execute("SELECT * FROM forms WHERE id=? AND species_id=?",
                           (side["form_id"], species_id)).fetchone()
    if form is None:
        form = con.execute("SELECT * FROM forms WHERE species_id=? ORDER BY is_default DESC, id LIMIT 1",
                           (species_id,)).fetchone()
    level = int(side.get("level") or 50)
    nature = con.execute("SELECT * FROM natures WHERE identifier=?",
                         (side.get("nature") or "hardy",)).fetchone()
    evs = {**DEFAULT_EV, **(side.get("evs") or {})}
    ivs = {**DEFAULT_IV, **(side.get("ivs") or {})}
    item = side.get("item") or ""
    stats = damage.calc_modern_stats(form, level,
                                     dict(nature) if nature else None,
                                     evs, ivs, choice_item=item,
                                     dynamax=bool(side.get("is_dynamax")))
    # 实际值覆盖（六项任意覆盖，覆盖后不再参与后续加成换算）
    for k, v in (side.get("stat_overrides") or {}).items():
        if k in stats and isinstance(v, (int, float)) and v >= 1:
            stats[k] = int(v)
    hidden = {a for a in (form["hidden_abilities"] or "").split(",") if a}
    return {
        "species_id": species_id, "name": sp["name_zh"],
        "form_id": form["id"], "form_label": form["form_label"],
        "types": form["types"], "level": level, "item": item,
        "ability": side.get("ability") or "",
        "ability_list": [{"name": a, "hidden": a in hidden}
                         for a in (form["abilities"] or "").split(",") if a],
        "boosts": side.get("boosts") or {},
        "is_dynamax": bool(side.get("is_dynamax")),
        # 互斥用「特殊形态」标记：mega 之外，原始回归/超极巨化在 PokeAPI 中 is_mega=0
        "is_mega": bool(form["is_mega"])
        or (form["identifier"] or "").endswith(("-primal", "-gmax")),
        "tera_type": side.get("tera_type") or "",
        "stats": stats, "_raw": {**side},
        "evs": evs, "ivs": ivs,
        # 进化奇石：仅未完全进化的宝可梦生效（防守方 dfMods 用）
        "can_evolve": bool(con.execute(
            "SELECT 1 FROM evolutions WHERE from_species=? LIMIT 1", (species_id,)).fetchone()),
    }


def _z_of(con, atk: dict, move_id: int) -> dict:
    """专属 Z 映射：(species+原始招式) 命中 → 专属 Z 招式；否则泛用（z_power 换算）。"""
    row = con.execute(
        "SELECT * FROM z_exclusive WHERE base_move_id=? AND species_id=?",
        (move_id, atk["species_id"])).fetchone()
    if row is None:
        return {"source": "generic"}
    # 形态限定（阿罗拉雷丘/黄昏鬃岩狼人/究极奈克洛兹玛等）按 identifier 后缀匹配
    suffix = row["form_suffix"] or ""
    if suffix and not self_suffix_ok(atk, suffix):
        return {"source": "generic"}
    if row["power"] is None:
        # 固定 HP 类 / 变化类专属 Z：无常规伤害，仅返回效果文案
        return {"source": "exclusive", "name": row["z_move_name"],
                "power": None, "damage_class": row["damage_class"],
                "note": row["note"], "no_damage": True}
    return {"source": "exclusive", "name": row["z_move_name"],
            "power": row["power"], "damage_class": row["damage_class"],
            "note": row["note"]}


def self_suffix_ok(atk: dict, suffix: str) -> bool:
    """攻击方当前形态 identifier 是否带指定后缀（-galar / -galar-standard 等）。"""
    ident = atk.get("form_identifier") or ""
    return bool(ident) and (ident.endswith(f"-{suffix}") or f"-{suffix}-" in ident)


def _validate_mechanisms(atk: dict, dfd: dict, body: dict) -> None:
    """机制互斥：超级进化/原始回归/超极巨化(形态派生) / Z招式 / 极巨化 / 太晶化 同侧只能一个。

    Z 招式为每招独立字段 z_moves[4]，但一场战斗仅一次 Z 力量 —— 多招同时点亮即拒绝。"""
    def _check(side_label: str, flags: list[str]) -> None:
        on = [f for f in flags if f]
        if len(on) > 1:
            raise HTTPException(
                400, f"{side_label}的机制互斥：超级进化/Z招式/极巨化/太晶化只能选择一个")

    atk_z = body.get("z_moves")
    if isinstance(atk_z, list):
        if sum(1 for z in atk_z if z) > 1:
            raise HTTPException(400, "一场战斗仅能使用一次 Z 力量：只能点亮一个招式的 Z 标记")
        z_on = any(atk_z)
    else:
        z_on = bool(body.get("z_move"))

    _check("攻击方", [atk["is_mega"] and "超级进化",
                     z_on and "Z招式",
                     (body.get("max_move") or atk["is_dynamax"]) and "极巨化",
                     atk["tera_type"] and "太晶化"])
    _check("防御方", [dfd["is_mega"] and "超级进化",
                     dfd["is_dynamax"] and "极巨化",
                     dfd["tera_type"] and "太晶化"])


def _hazard_hp(con, dfd: dict, opt: dict) -> int:
    """进场 HP 扣减（隐形岩/撒菱/盐淹/寄生种子）：一次性先扣，返回剩余 HP。"""
    hazards = opt.get("hazards") or {}
    if not any(hazards.values()):
        return dfd["stats"]["hp"]
    types = [t for t in (dfd["types"] or "").split(",") if t]
    hp = dfd["stats"]["hp"]
    grounded = not ("飞行" in types or dfd.get("ability") == "漂浮"
                    or dfd.get("item") == "气球" or opt.get("gravity"))
    dmg = damage.hazard_damage(types, hp, hazards, grounded)
    return max(1, hp - dmg)


@router.post("/calc")
def calc(body: dict = Body(...), con: sqlite3.Connection = Depends(get_static_db)):
    atk = _assemble(con, body["attacker"], True)
    dfd = _assemble(con, body["defender"], False)
    atk["form_identifier"] = _form_ident(con, atk)
    dfd["form_identifier"] = _form_ident(con, dfd)
    _validate_mechanisms(atk, dfd, body)
    if body.get("power_trick"):
        _swap_atk_def(atk["stats"])
    if body.get("defender_power_trick"):
        _swap_atk_def(dfd["stats"])
    mv = con.execute("SELECT * FROM moves WHERE id=?", (body["move_id"],)).fetchone()
    if mv is None:
        raise HTTPException(404, "move not found")
    opt = {k: body.get(k) for k in FIELD_OPTS}
    opt.update({k: body.get(k) for k in ("burn", "screen", "defender_full_hp",
                                         "move_power_override", "z_move", "max_move")})
    z_info = None
    if opt.get("z_move"):
        z_info = _z_of(con, atk, body["move_id"])
        if z_info["source"] == "exclusive" and not z_info.get("no_damage"):
            opt["z_exclusive"] = {"name": z_info["name"], "power": z_info["power"]}
    result = damage.calc_damage(atk, dfd, dict(mv), opt)
    hazard = _hazard_hp(con, dfd, opt)
    if hazard < dfd["stats"]["hp"] and "ko" in result:
        result["ko"] = damage.ko_summary(
            result["rolls"], hazard, {**opt, "defender_full_hp": False})
    resp = {"attacker": {k: atk[k] for k in ("name", "types", "level", "stats", "tera_type")},
            "defender": {k: dfd[k] for k in ("name", "types", "level", "stats", "is_dynamax", "tera_type")},
            "move": {"name": mv["name_zh"], "type": mv["type_zh"],
                     "damage_class": mv["damage_class"], "power": mv["power"]},
            "result": result, "hazard_hp": hazard}
    if z_info:
        resp["z_info"] = z_info
    return resp


def _form_ident(con, side: dict) -> str:
    row = con.execute("SELECT identifier FROM forms WHERE id=?", (side["form_id"],)).fetchone()
    return (row["identifier"] if row else "") or ""


def _swap_atk_def(stats: dict) -> None:
    """力量戏法：该侧攻击与防御实际值互换（静态标记语义；能力升降仍按能力名生效）。

    只动 router 装配后的 stats，不触碰 damage.py 公式与取整链。"""
    stats["atk"], stats["def"] = stats["def"], stats["atk"]


@router.post("/calc/batch")
def calc_batch(body: dict = Body(...), con: sqlite3.Connection = Depends(get_static_db)):
    """一次算双方 × 4 招（替代前端串行 8 次 POST）。

    请求：{attacker, defender, moves: {atk: [id×4], dfd: [id×4]},
           field: {mode, weather, terrain, auras, ruin, gravity, magic_room, wonder_room},
           sides: {atk: {burn,crit,helping,z_moves[4],screen,sash,friend_guard,
                         flower_gift,steely_spirit,battery,power_spot,foresight,hazards,
                         power_trick},
                   dfd: {…同结构}}}
    响应：{atk: {stats, results[4]}, dfd: {stats, results[4]}, hazard_hp: {atk, dfd}}
    """
    atk = _assemble(con, body["attacker"], True)
    dfd = _assemble(con, body["defender"], False)
    atk["form_identifier"] = _form_ident(con, atk)
    dfd["form_identifier"] = _form_ident(con, dfd)
    sides = body.get("sides") or {}
    sa, sb = sides.get("atk") or {}, sides.get("dfd") or {}
    field = body.get("field") or {}
    # 力量戏法：攻防实际值互换（hazard 只依赖 max HP 与属性相性，先后无关）
    if sa.get("power_trick"):
        _swap_atk_def(atk["stats"])
    if sb.get("power_trick"):
        _swap_atk_def(dfd["stats"])
    _validate_mechanisms(
        atk, dfd, {"z_moves": sa.get("z_moves"),
                   "max_move": atk.get("is_dynamax")})
    hazard = {
        "atk": _hazard_hp(con, atk, {**field, "hazards": sa.get("hazards")}),
        "dfd": _hazard_hp(con, dfd, {**field, "hazards": sb.get("hazards")}),
    }

    def _opts(att: dict, dfd_side: dict, att_flags: dict, dfd_flags: dict) -> dict:
        o = {k: field.get(k) for k in FIELD_OPTS}
        o.update({
            "burn": att_flags.get("burn"), "crit": att_flags.get("crit"),
            "helping_hand": att_flags.get("helping"),
            "steely_spirit": att_flags.get("steely"),
            "battery": att_flags.get("battery"), "power_spot": att_flags.get("power_spot"),
            "flower_gift": att_flags.get("flower_gift"),
            "screen": dfd_flags.get("screen"),
            "friend_guard": dfd_flags.get("friend_guard"),
            "foresight": dfd_flags.get("foresight"),
            "flower_gift_d": dfd_flags.get("flower_gift"),
            "defender_sash": dfd_flags.get("sash"),
            "defender_full_hp": True,
            "max_move": bool(att.get("is_dynamax")),
        })
        return o

    def _results(att: dict, dfd_side: dict, att_flags: dict, dfd_flags: dict,
                 move_ids: list, z_marks: list, dfd_hazard: int):
        out = []
        opts0 = _opts(att, dfd_side, att_flags, dfd_flags)
        for i, mobj in enumerate(move_ids or []):
            if not mobj:
                out.append(None)
                continue
            # 招式项可为 id 或 {id, power}（变动威力招手动输入）
            mid = mobj.get("id") if isinstance(mobj, dict) else mobj
            power_override = (mobj.get("power") if isinstance(mobj, dict) else None)
            mv = con.execute("SELECT * FROM moves WHERE id=?", (mid,)).fetchone()
            if mv is None:
                out.append({"error": "move not found"})
                continue
            opt = dict(opts0)
            if power_override:
                opt["move_power_override"] = power_override
            zi = None
            if z_marks and z_marks[i]:
                zi = _z_of(con, att, mid)
                opt["z_move"] = True
                if zi["source"] == "exclusive" and not zi.get("no_damage"):
                    opt["z_exclusive"] = {"name": zi["name"], "power": zi["power"]}
            r = damage.calc_damage(att, dfd_side, dict(mv), opt)
            eff_hp = min(dfd_hazard, dfd_side["stats"]["hp"])
            if eff_hp < dfd_side["stats"]["hp"] and "ko" in r:
                r["ko"] = damage.ko_summary(
                    r["rolls"], eff_hp, {**opt, "defender_full_hp": False})
            if zi:
                r["z_info"] = zi
            out.append(r)
        return out

    atk_results = _results(atk, dfd, sa, sb, (body.get("moves") or {}).get("atk"),
                           sa.get("z_moves") or [], hazard["dfd"])
    dfd_results = _results(dfd, atk, sb, sa, (body.get("moves") or {}).get("dfd"),
                           sb.get("z_moves") or [], hazard["atk"])
    return {
        "atk": {"name": atk["name"], "stats": atk["stats"], "results": atk_results},
        "dfd": {"name": dfd["name"], "stats": dfd["stats"], "results": dfd_results},
        "hazard_hp": hazard,
    }
