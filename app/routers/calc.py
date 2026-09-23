"""伤害计算器 API。"""
from __future__ import annotations

from fastapi import APIRouter, Body, HTTPException, Query

from ..db import static_conn
from ..services import damage

router = APIRouter(prefix="/api")

DEFAULT_EV = {"hp": 0, "atk": 0, "def": 0, "spa": 0, "spd": 0, "spe": 0}
DEFAULT_IV = {"hp": 31, "atk": 31, "def": 31, "spa": 31, "spd": 31, "spe": 31}

# 道具池（前端下拉用；伤害引擎实际只建模其中影响伤害的部分）
ITEM_POOL = [
    {"group": "输出", "items": ["讲究头带", "讲究眼镜", "讲究围巾", "生命宝珠", "达人带",
                                "属性宝石", "达人腰带"]},
    {"group": "防守", "items": ["突击背心", "进化奇石", "吃剩的东西", "气势披带", "气球",
                                "凸凹头盔", "遥控器"]},
    {"group": "其他", "items": ["讲究围巾（速度）", "驱劲能量", "厚重香炉", "幸运蛋"]},
]
# 建模了伤害修正的道具（其余仅展示，不影响计算）
MODELED_ITEMS = {"讲究头带", "讲究眼镜", "讲究围巾", "生命宝珠", "达人带",
                 "突击背心", "进化奇石"}


@router.get("/meta/species")
def meta_species():
    con = static_conn()
    rows = [dict(r) for r in con.execute(
        "SELECT id, name_zh, name_en FROM species ORDER BY id")]
    con.close()
    return rows


@router.get("/calc/forms")
def calc_forms(species_id: int = Query(...)):
    con = static_conn()
    rows = [dict(r) for r in con.execute(
        """SELECT id,
                  COALESCE(NULLIF(form_label, ''),
                           CASE WHEN is_default=1 THEN '默认形态' ELSE identifier END) AS form_label,
                  identifier, types, abilities, hidden_abilities, is_mega
           FROM forms WHERE species_id=? ORDER BY is_default DESC, id""", (species_id,))]
    con.close()
    for f in rows:
        hidden = {a for a in (f.pop("hidden_abilities") or "").split(",") if a}
        f["ability_list"] = [
            {"name": a, "hidden": a in hidden} for a in (f["abilities"] or "").split(",") if a]
    return rows


@router.get("/meta/items")
def meta_items():
    return {"pool": ITEM_POOL, "modeled": sorted(MODELED_ITEMS)}


@router.get("/meta/natures")
def natures():
    con = static_conn()
    rows = [dict(r) for r in con.execute("SELECT * FROM natures ORDER BY id")]
    con.close()
    return rows


@router.get("/calc/moves")
def calc_moves(species_id: int = Query(...)):
    """全世代招式并集（标注可学会的世代）。"""
    con = static_conn()
    rows = con.execute(
        """SELECT m.id AS move_id, m.name_zh, m.type_zh, m.damage_class,
                  m.power, m.accuracy, MIN(v.gen) AS first_gen,
                  GROUP_CONCAT(DISTINCT v.gen) AS gens
           FROM learnsets_all l
           JOIN forms f ON f.id = l.form_id
           JOIN moves m ON m.id = l.move_id
           JOIN vgs v ON v.id = l.vg
           WHERE f.species_id = ? AND m.damage_class != 'status'
           GROUP BY m.id
           ORDER BY first_gen, m.id""", (species_id,)).fetchall()
    out = []
    for r in rows:
        d = dict(r)
        d["gens"] = sorted({int(x) for x in (r["gens"] or "").split(",") if x})
        out.append(d)
    con.close()
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
    # 防守向道具：突击背心 特防×1.5；进化奇石 防御/特防×1.5（仅未完全进化的宝可梦）
    def_spd_mult = 1.0
    if item == "突击背心":
        def_spd_mult = 1.5
    elif item == "进化奇石":
        can_evolve = con.execute(
            "SELECT 1 FROM evolutions WHERE from_species=? LIMIT 1", (species_id,)).fetchone()
        if can_evolve:
            def_spd_mult = 1.5
    stats = damage.calc_modern_stats(form, level,
                                     dict(nature) if nature else None,
                                     evs, ivs, choice_item=item,
                                     dynamax=bool(side.get("is_dynamax")),
                                     def_spd_mult=def_spd_mult)
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
        "tera_type": side.get("tera_type") or "",
        "stats": stats, "_raw": {**side},
        "evs": evs, "ivs": ivs,
    }


@router.post("/calc")
def calc(body: dict = Body(...)):
    con = static_conn()
    try:
        atk = _assemble(con, body["attacker"], True)
        dfd = _assemble(con, body["defender"], False)
        mv = con.execute("SELECT * FROM moves WHERE id=?",
                         (body["move_id"],)).fetchone()
        if mv is None:
            raise HTTPException(404, "move not found")
        opt = {k: body.get(k) for k
               in ("formula", "weather", "crit", "burn", "screen", "move_power_override",
                   "item_type", "style", "defender_full_hp", "z_move", "max_move")}
        result = damage.calc_damage(atk, dfd, dict(mv), opt)
        return {"attacker": {k: atk[k] for k in ("name", "types", "level", "stats", "tera_type")},
                "defender": {k: dfd[k] for k in ("name", "types", "level", "stats", "is_dynamax", "tera_type")},
                "move": {"name": mv["name_zh"], "type": mv["type_zh"],
                         "damage_class": mv["damage_class"], "power": mv["power"]},
                "result": result}
    finally:
        con.close()


@router.post("/calc/compare-forms")
def compare_forms(body: dict = Body(...)):
    """固定一方与招式，遍历另一方的全部形态计算伤害并排序。"""
    side = body.get("side") or "attacker"
    base = body.get("base") or {}
    species_id = body.get("species_id")
    con = static_conn()
    try:
        mv = con.execute("SELECT * FROM moves WHERE id=?", (base["move_id"],)).fetchone()
        if mv is None:
            raise HTTPException(404, "move not found")
        forms = con.execute("SELECT * FROM forms WHERE species_id=? ORDER BY id",
                            (species_id,)).fetchall()
        out = []
        for f in forms:
            try:
                if side == "attacker":
                    atk = _assemble(con, {**base["attacker"], "form_id": f["id"], "species_id": species_id}, True)
                    dfd = _assemble(con, base["defender"], False)
                else:
                    atk = _assemble(con, base["attacker"], True)
                    dfd = _assemble(con, {**base["defender"], "form_id": f["id"], "species_id": species_id}, False)
                opt = {k: base.get(k) for k
                       in ("formula", "weather", "crit", "burn", "screen", "move_power_override",
                           "item_type", "style", "defender_full_hp", "z_move", "max_move")}
                r = damage.calc_damage(atk, dfd, dict(mv), opt)
                if "error" in r:
                    continue
                label = f["form_label"] or ("默认形态" if f["is_default"] else f["identifier"])
                out.append({"form_id": f["id"], "label": label,
                            "types": f["types"], "min": r["min"], "max": r["max"],
                            "pct_max": r["pct_max"], "ohko": r["ohko"]})
            except HTTPException:
                continue
        out.sort(key=lambda x: -x["max"])
        return out
    finally:
        con.close()
