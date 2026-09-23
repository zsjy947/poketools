"""宝可梦详情 / 招式学习表 API（按游戏裁剪）。"""
from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

from ..db import static_conn

router = APIRouter(prefix="/api")

# 每个游戏的招式表结构：学习集 vg、TM 机器 vg、分组 tab（key→中文标签）
GAME_MOVE_CONFIG = {
    "sword-shield": {"vg": 20, "tm_vgs": [20],
                     "tabs": [("level", "升级"), ("machine", "招式学习器"),
                              ("egg", "蛋招式"), ("tutor", "教授")]},
    "brilliant-diamond-shining-pearl": {"vg": 23, "tm_vgs": [23],
                                        "tabs": [("level", "升级"), ("machine", "招式学习器"),
                                                 ("egg", "蛋招式"), ("tutor", "教授")]},
    "legends-arceus": {"vg": 24, "tm_vgs": [],
                       "tabs": [("level", "升级"), ("tutor", "教授")]},
    "scarlet-violet": {"vg": 25, "tm_vgs": [25],
                       "tabs": [("level", "升级"), ("machine", "招式学习器"),
                                ("egg", "蛋招式"), ("tutor", "教授")]},
    "legends-za": {"vg": 30, "tm_vgs": [30],
                   "tabs": [("level", "升级"), ("machine", "招式学习器")]},
}

GAME_ORDER = ["sword-shield", "brilliant-diamond-shining-pearl", "legends-arceus",
              "scarlet-violet", "legends-za"]

TRIGGER_ZH = {
    "level-up": "等级提升", "trade": "连接交换", "use-item": "使用道具",
    "shed": "脱皮", "spin": "旋转", "tower-of-darkness": "恶之塔",
    "three-critical-hits": "3次会心", "damage-location": "特定地点受伤",
    "agile-style-move": "刚猛招式", "strong-style-move": "迅疾招式",
    "recoil-damage": "反动伤害",
}


def _clean(t: str | None) -> str:
    return (t or "").replace("\r", "").replace("\n", " ").strip()


def _abilities_of(form) -> list[dict]:
    abils = [a for a in (form["abilities"] or "").split(",") if a]
    hidden = {a for a in (form["hidden_abilities"] or "").split(",") if a}
    return [{"name": a, "hidden": a in hidden} for a in abils]


def _evo_condition(row) -> str:
    """把 evolutions 一行拼成中文条件描述。"""
    trig = row["trigger"]
    parts: list[str] = []
    if trig == "level-up":
        parts.append(f"Lv.{row['min_level']}" if row["min_level"] else "升级")
    elif trig == "use-item":
        parts.append(f"使用{row['item']}" if row["item"] else "使用道具")
    elif trig == "trade":
        parts.append("连接交换")
    else:
        parts.append(TRIGGER_ZH.get(trig, trig))
    if row["held_item"]:
        parts.append(f"携带{row['held_item']}")
    if row["min_happiness"]:
        parts.append(f"亲密度≥{row['min_happiness']}")
    if row["min_affection"]:
        parts.append(f"友好度≥{row['min_affection']}")
    if row["known_move"]:
        parts.append(f"学会{row['known_move']}")
    if row["time_of_day"]:
        parts.append({"day": "白天", "night": "夜晚", "dusk": "黄昏"}.get(
            row["time_of_day"], row["time_of_day"]))
    if row["needs_overworld_rain"]:
        parts.append("下雨时")
    if row["turn_upside_down"]:
        parts.append("倒置主机")
    if row["location"]:
        parts.append(f"在{row['location']}")
    return "，".join(p for p in parts if p)


def _evolution_chain(con, species_id: int) -> dict:
    """进化家族树：{root, nodes:{sid:{...}}, children:{sid:[to]}, conds:{(from,to):text}}"""
    sp = con.execute("SELECT id, evolves_from FROM species WHERE id=?", (species_id,)).fetchone()
    if sp is None:
        return {"root": None, "nodes": {}, "children": {}, "conds": {}}
    seen = {species_id}
    frontier = [species_id]
    # 向上找根
    cur = sp
    while cur["evolves_from"]:
        if cur["evolves_from"] in seen:
            break
        seen.add(cur["evolves_from"])
        frontier.append(cur["evolves_from"])
        cur = con.execute("SELECT id, evolves_from FROM species WHERE id=?",
                          (cur["evolves_from"],)).fetchone()
        if cur is None:
            break
    root = frontier[-1]
    # 收集家族全部成员（从根向下 BFS，经 evolutions 表）
    family = {root}
    queue = [root]
    while queue:
        sid = queue.pop()
        for r in con.execute("SELECT to_species FROM evolutions WHERE from_species=?", (sid,)):
            if r["to_species"] not in family:
                family.add(r["to_species"])
                queue.append(r["to_species"])
    nodes, children, conds = {}, {}, {}
    for sid in family:
        s = con.execute("SELECT id, name_zh FROM species WHERE id=?", (sid,)).fetchone()
        f = con.execute(
            """SELECT id, types FROM forms WHERE species_id=? AND is_default=1 LIMIT 1""",
            (sid,)).fetchone()
        nodes[sid] = {"species_id": sid, "name": s["name_zh"] if s else str(sid),
                      "form_id": f["id"] if f else 0, "types": (f["types"] or "") if f else ""}
    for r in con.execute("SELECT * FROM evolutions"):
        if r["from_species"] in family and r["to_species"] in family:
            children.setdefault(r["from_species"], []).append(r["to_species"])
            cond = _evo_condition(r)
            key = (r["from_species"], r["to_species"])
            if key not in conds or len(cond) > len(conds[key]):
                conds[key] = cond  # 多条件取更具体的描述
    return {"root": root, "nodes": nodes, "children": children, "conds": {
        f"{f}|{t}": v for (f, t), v in conds.items()}}


@router.get("/pokemon/{species_id}")
def pokemon_detail(species_id: int, game: str = ""):
    con = static_conn()
    sp = con.execute("SELECT * FROM species WHERE id=?", (species_id,)).fetchone()
    if sp is None:
        con.close()
        raise HTTPException(404, "species not found")

    forms = [dict(r) for r in con.execute(
        "SELECT * FROM forms WHERE species_id=? ORDER BY is_default DESC, id", (species_id,))]
    default = next((f for f in forms if f["is_default"]), forms[0] if forms else None)

    game_order = "CASE game " + " ".join(
        f"WHEN '{g}' THEN {i}" for i, g in enumerate(GAME_ORDER)) + " ELSE 99 END"

    flavor = [dict(r) for r in con.execute(
        f"""SELECT game, version_label, text FROM dex_flavor
            WHERE species_id=? ORDER BY {game_order}, version_label""",
        (species_id,))]
    gm = [dict(r) for r in con.execute(
        f"""SELECT game, version_label, location, method, note FROM get_methods
            WHERE species_id=? ORDER BY {game_order}, version_label""",
        (species_id,))]

    # 按当前入口游戏裁剪（版本图鉴介绍/获取方式只看当前游戏）
    if game:
        flavor = [f for f in flavor if f["game"] == game]
        gm = [g for g in gm if g["game"] == game]

    games_with_gm = {r["game"] for r in gm}
    enc = []
    if not game or game == "sword-shield":
        for r in con.execute(
                """SELECT vg, game_id, location_en, min_level, max_level
                   FROM encounters WHERE species_id=? AND (?='' OR game_id=?)
                   ORDER BY vg, location_en LIMIT 60""",
                (species_id, game, game)):
            if r["game_id"] not in games_with_gm:
                enc.append(dict(r))
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
           WHERE de.species_id = ?
           ORDER BY CASE WHEN d.game_id = ? THEN 0 ELSE 1 END, d.sort""",
        (species_id, game))]

    evolution = _evolution_chain(con, species_id)

    if default:
        for f in forms:
            f["ability_list"] = _abilities_of(f)

    con.close()
    return {
        "species": dict(sp),
        "default_form": default,
        "forms": forms,
        "ev": {k: default[f"ev_{k}"] for k in ("hp", "atk", "def", "spa", "spd", "spe")} if default else {},
        "base_stats": ({k: default[k] for k in ("hp", "atk", "def", "spa", "spd", "spe")}
                       if default else {}),
        "flavor": flavor,
        "get_methods": gm,
        "encounters_api": enc_dedup,
        "dex_list": dex_list,
        "evolution": evolution,
        "game": game or None,
    }


@router.get("/pokemon/{species_id}/moves")
def pokemon_moves(species_id: int, game: str = Query(...), form_id: int | None = None):
    cfg = GAME_MOVE_CONFIG.get(game)
    if cfg is None:
        raise HTTPException(400, "unknown game")
    con = static_conn()
    sp = con.execute("SELECT id, name_zh FROM species WHERE id=?", (species_id,)).fetchone()
    if sp is None:
        con.close()
        raise HTTPException(404, "species not found")
    vg = cfg["vg"]

    form = None
    if form_id:
        form = con.execute("SELECT * FROM forms WHERE id=? AND species_id=?",
                           (form_id, species_id)).fetchone()
    if form is None:
        form = con.execute(
            "SELECT * FROM forms WHERE species_id=? ORDER BY is_default DESC, id LIMIT 1",
            (species_id,)).fetchone()

    rows = con.execute(
        f"""SELECT l.method, l.level, l.mastery, m.id AS move_id, m.name_zh, m.type_zh,
                  m.damage_class, m.power, m.accuracy, m.pp, m.priority
           FROM learnsets l JOIN moves m ON m.id = l.move_id
           WHERE l.form_id=? AND l.vg=?
           ORDER BY m.id""", (form["id"], vg)).fetchall()

    # TM 编号 + 获取方式（同号跨 DLC 版本组去重，只取一次）
    machines: dict[int, dict[int, int]] = {}
    if cfg["tm_vgs"]:
        marks = ",".join("?" * len(cfg["tm_vgs"]))
        for r in con.execute(
                f"""SELECT machine_number, vg, move_id FROM machines
                    WHERE vg IN ({marks}) ORDER BY vg, machine_number""", cfg["tm_vgs"]):
            machines.setdefault(r["move_id"], {})[r["machine_number"]] = r["vg"]
    tm_how: dict[tuple, dict] = {}
    for r in con.execute("SELECT vg, machine_number, how, materials FROM tm_how"):
        tm_how[(r["vg"], r["machine_number"])] = {
            "how": _clean(r["how"]), "materials": _clean(r["materials"])}

    def tm_info(move_id: int) -> list[dict]:
        out = []
        for num in sorted(machines.get(move_id, {})):
            vgnum = machines[move_id][num]
            h = tm_how.get((vgnum, num), {})
            out.append({"number": num, "how": h.get("how", ""),
                        "materials": h.get("materials", "")})
        return out

    groups: dict[str, list] = {key: [] for key, _ in cfg["tabs"]}
    method_key = {"level-up": "level", "machine": "machine", "egg": "egg", "tutor": "tutor"}
    seen = set()
    for r in rows:
        d = dict(r)
        d["tm"] = tm_info(r["move_id"]) if r["method"] == "machine" else []
        key = (r["method"], r["move_id"], r["level"])
        mkey = method_key.get(r["method"], r["method"])
        if key in seen or mkey not in groups:
            continue
        seen.add(key)
        groups[mkey].append(d)
    groups["level"].sort(key=lambda d: (d["level"] or 0, d["move_id"]))
    for k in groups:
        if k != "level":
            groups[k].sort(key=lambda d: d["name_zh"])

    has_breeding = con.execute(
        "SELECT has_breeding FROM games WHERE id=?", (game,)).fetchone()["has_breeding"]
    con.close()
    return {
        "species": dict(sp), "form": dict(form), "game": game, "vg": vg,
        "has_breeding": bool(has_breeding),
        "tabs": [{"key": k, "label": lbl} for k, lbl in cfg["tabs"]],
        "groups": groups,
    }
