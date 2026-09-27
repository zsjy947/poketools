"""宝可梦详情 / 招式学习表 API（按游戏裁剪）。"""
from __future__ import annotations

import json

from fastapi import APIRouter, HTTPException, Query

from ..db import static_conn

router = APIRouter(prefix="/api")

# 每个游戏的招式表结构：学习集 vg、TM 机器 vg、分组 tab（key→中文标签）
# （逐游戏核对过 52poke 各作招式表列：剑盾教授=铠岛/雪原，BDSP 有教授列（tutor8 模板），
#   阿尔宙斯=训练场佐思，朱紫无教授——4 条 PokeAPI tutor 数据在 52poke 为「回忆」，
#   并入升级表以「回忆」标注；Z-A 仅 升级/学习器 两列，无回忆列）
GAME_MOVE_CONFIG = {
    "sword-shield": {"vg": 20, "tm_vgs": [20],
                     "tabs": [("level", "升级"), ("machine", "招式学习器"),
                              ("egg", "蛋招式"), ("tutor", "教授")]},
    "brilliant-diamond-shining-pearl": {"vg": 23, "tm_vgs": [23],
                                        "tabs": [("level", "升级"), ("machine", "招式学习器"),
                                                 ("egg", "蛋招式"), ("tutor", "教授")]},
    "legends-arceus": {"vg": 24, "tm_vgs": [],
                       "tabs": [("level", "升级"), ("tutor", "教授")]},
    # 朱紫：升级表中 level=0（进化时学会）与教授（=回忆，PokeAPI 标 tutor，52poke 为回忆机）
    # 单独「进化&回忆」tab
    "scarlet-violet": {"vg": 25, "tm_vgs": [25],
                       "tabs": [("level", "升级"), ("evolution-recall", "进化&回忆"),
                                ("machine", "招式学习器"), ("egg", "蛋招式")]},
    # tm_vgs 含 vg31（异次元 DLC TM108-160），与 vg30 的 TM001-107 连续编号
    "legends-za": {"vg": 30, "tm_vgs": [30, 31],
                   "tabs": [("level", "升级"), ("machine", "招式学习器")]},
}

# 「进化&回忆」独立 tab 的游戏（level=0 进化招式 + tutor 回忆行）
EVOLUTION_RECALL_GAMES = {"scarlet-violet"}

GAME_ORDER = ["sword-shield", "brilliant-diamond-shining-pearl", "legends-arceus",
              "scarlet-violet", "legends-za"]

TRIGGER_ZH = {
    "level-up": "等级提升", "trade": "连接交换", "use-item": "使用道具",
    "shed": "脱皮", "spin": "旋转", "tower-of-darkness": "恶之塔",
    "three-critical-hits": "3次会心", "damage-location": "特定地点受伤",
    "agile-style-move": "迅疾招式", "strong-style-move": "刚猛招式",
    "recoil-damage": "反动伤害",
}


def _clean(t: str | None) -> str:
    return (t or "").replace("\r", "").replace("\n", " ").strip()


def _abilities_of(con, form) -> list[dict]:
    """特性 + 52poke 文案（intro 第九世代说明 / effect 效果首段 / extra 多点补充）。"""
    abils = [a for a in (form["abilities"] or "").split(",") if a]
    hidden = {a for a in (form["hidden_abilities"] or "").split(",") if a}
    prose: dict[str, dict] = {}
    for r in con.execute("SELECT name_zh, intro, effect, extra FROM abilities"):
        prose[r["name_zh"]] = {"intro": r["intro"] or "", "effect": r["effect"] or "",
                               "extra": json.loads(r["extra"] or "[]")}
    out = []
    for a in abils:
        p = prose.get(a) or {}
        out.append({"name": a, "hidden": a in hidden,
                    "intro": p.get("intro", ""), "effect": p.get("effect", ""),
                    "extra": p.get("extra", [])})
    return out


# 52poke 获得方式模板的形态标记字母 → forms.identifier 后缀（M2 3.5 获取方式按形态过滤）
FORM_MARKER_TO_SUFFIX = {
    "A": "alola", "G": "galar", "H": "hisui", "P": "paldea",
    "W": "white-striped", "B": "blue-striped",
    "D": "dusk", "Mn": "midnight", "N": "midday", "L": "low-key",
    "F": "female", "M": "male", "GM": "gmax",
    "PA": "paldea-combat-breed", "PB": "paldea-blaze-breed", "PC": "paldea-aqua-breed",
}


def _evo_condition(row) -> str:
    """把 evolutions 一行拼成中文条件描述。"""
    trig = row["trigger"]
    parts: list[str] = []
    if trig == "level-up":
        parts.append(f"Lv.{row['min_level']}" if row["min_level"] else "升级")
    elif trig == "use-item":
        parts.append(f"使用{row['item']}" if row["item"] else "使用道具")
    elif trig == "trade":
        # 与特定宝可梦交换（盖盖虫↔小嘴蜗）优先于泛化描述
        parts.append(f"与{row['trade_species']}交换" if row["trade_species"] else "连接交换")
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
    if row["region"]:
        parts.append(f"在{row['region']}地区")
    if row["gender"]:
        parts.append(f"{row['gender']}限定")
    if row["known_move_type"]:
        parts.append(f"学会{row['known_move_type']}属性招式")
    if row["relative_physical_stats"] is not None:
        parts.append({1: "攻击>防御", 0: "攻击=防御", -1: "攻击<防御"}
                     .get(row["relative_physical_stats"], ""))
    if row["party_species"]:
        parts.append(f"队伍中有{row['party_species']}")
    if row["party_type"]:
        parts.append(f"队伍中有{row['party_type']}属性宝可梦")
    if row["near_special_rock"]:
        parts.append("在冰岩石附近" if row["to_species"] == 471 else "在苔藓岩石附近")
    if row["min_beauty"]:
        parts.append(f"美丽≥{row['min_beauty']}")
    if row["needs_multiplayer"]:
        parts.append("联机游玩时")
    if row["min_move_count"]:
        parts.append(f"特定招式累计使用{row['min_move_count']}次")
    if row["min_steps"]:
        parts.append(f"同行走{row['min_steps']}步")
    if row["min_damage_taken"]:
        parts.append(f"累计受到伤害≥{row['min_damage_taken']}")
    if row["nature_bitmask"]:
        parts.append("性格：" + "、".join(_decode_natures(row["nature_bitmask"])))
    return "，".join(p for p in parts if p)


# PokeAPI nature_bitmask：bit i-1 对应性格 id i（1勤奋…25浮躁）
_NATURE_ZH = {1: "勤奋", 2: "怕寂寞", 3: "勇敢", 4: "固执", 5: "顽皮", 6: "大胆",
              7: "坦率", 8: "悠闲", 9: "淘气", 10: "乐天", 11: "胆小", 12: "急躁",
              13: "认真", 14: "爽朗", 15: "天真", 16: "内敛", 17: "慢吞吞", 18: "冷静",
              19: "害羞", 20: "马虎", 21: "温和", 22: "温顺", 23: "自大", 24: "慎重",
              25: "浮躁"}


def _decode_natures(mask: str) -> list[str]:
    try:
        m = int(mask)
    except ValueError:
        return []
    return [_NATURE_ZH[i + 1] for i in range(25) if m & (1 << i)]


# 地区后缀 → 中文名（分支条件文本前缀）
SUFFIX_REGION_ZH = {"alola": "阿罗拉", "galar": "伽勒尔", "hisui": "洗翠", "paldea": "帕底亚"}


def _form_by_suffix(con, species_id: int, suffix: str):
    """按后缀找形态（空 = 默认形态；兼容 darmanitan-galar-standard 复合形态）。"""
    if not suffix:
        return con.execute(
            "SELECT id, identifier, types FROM forms WHERE species_id=? AND is_default=1 LIMIT 1",
            (species_id,)).fetchone()
    return con.execute(
        """SELECT id, identifier, types FROM forms WHERE species_id=?
           AND (identifier LIKE '%-'||? OR identifier LIKE '%-'||?||'-%')
           ORDER BY LENGTH(identifier) LIMIT 1""",
        (species_id, suffix, suffix)).fetchone()


def _evolution_chain(con, species_id: int, form_suffix: str = "") -> dict:
    """进化家族树：{root, nodes:{sid:{...}}, children:{sid:[to]}, conds:{(from,to):text}}

    地区形态分支（evo_branches curated）：只渲染选中形态所属分支，
    节点图/属性按对应 form 行取；无 curated 分支的家族走现状全量渲染。"""
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

    # ---- 地区形态分支家族（curated）：按选中形态挑分支整条渲染 ----
    branches: dict[str, list] = {}
    for r in con.execute(
            "SELECT branch, species_id, form_suffix FROM evo_branches WHERE family_key=?",
            (str(root),)):
        branches.setdefault(r["branch"], []).append((r["species_id"], r["form_suffix"]))
    if branches:
        sel = (species_id, form_suffix or "")
        chosen = None
        for bi, toks in branches.items():
            if sel in toks:
                chosen = toks
                break
        if chosen is None:   # 选中形态不在任何分支（如 mega/gmax）：回退默认分支
            for bi, toks in branches.items():
                if toks and toks[0][1] == "":
                    chosen = toks
                    break
        if chosen is not None:
            nodes, children, conds = {}, {}, {}
            names = {r["id"]: r["name_zh"] for r in con.execute(
                "SELECT id, name_zh FROM species WHERE id IN (%s)"
                % ",".join("?" * len(set(s for s, _ in chosen))),
                [s for s, _ in dict.fromkeys(chosen)])}
            prev = None
            base_suf = chosen[0][1]
            for sid, suf in chosen:
                f = _form_by_suffix(con, sid, suf)
                nodes[sid] = {"species_id": sid, "name": names.get(sid, str(sid)),
                              "form_id": f["id"] if f else 0,
                              "types": (f["types"] or "") if f else "",
                              "form_suffix": suf}
                if prev is not None:
                    children.setdefault(prev[0], []).append(sid)
                    r = con.execute(
                        "SELECT * FROM evolutions WHERE from_species=? AND to_species=?",
                        (prev[0], sid)).fetchone()
                    cond = _evo_condition(r) if r else "进化"
                    # 地区分支：目标或分支根带地区后缀且条件未含地区时补「在{地区}地区」
                    region_suf = suf if suf in SUFFIX_REGION_ZH else (
                        base_suf if base_suf in SUFFIX_REGION_ZH else "")
                    if region_suf and (not r or not r["region"]) \
                            and SUFFIX_REGION_ZH[region_suf] not in cond:
                        prefix = f"在{SUFFIX_REGION_ZH[region_suf]}地区"
                        cond = f"{prefix}，{cond}" if cond and cond != "进化" else f"{prefix}进化"
                    conds[f"{prev[0]}|{sid}"] = cond
                prev = (sid, suf)
            return {"root": chosen[0][0], "nodes": nodes, "children": children,
                    "conds": conds, "branched": True}

    # ---- 常规家族：从根向下 BFS，经 evolutions 表 ----
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
def pokemon_detail(species_id: int, game: str = "", form: str = Query("", description="选中形态 identifier 后缀，空=默认形态"),
                   dex: str = Query("", description="来源图鉴 id：默认选中形态按 dex_default_forms 覆盖")):
    con = static_conn()
    sp = con.execute("SELECT * FROM species WHERE id=?", (species_id,)).fetchone()
    if sp is None:
        con.close()
        raise HTTPException(404, "species not found")

    forms = [dict(r) for r in con.execute(
        "SELECT * FROM forms WHERE species_id=? ORDER BY is_default DESC, id", (species_id,))]
    default = next((f for f in forms if f["is_default"]), forms[0] if forms else None)

    # 图鉴默认形态覆盖（M5）：从图鉴进入时默认选中覆盖形态（如洗翠卡蒂狗）
    dex_default_suffix = ""
    if dex:
        row = con.execute(
            """SELECT f.identifier FROM dex_default_forms ddf
               JOIN forms f ON f.id = ddf.form_id
               WHERE ddf.dex_id=? AND ddf.species_id=?""", (dex, species_id)).fetchone()
        if row:
            _, _, dex_default_suffix = (row["identifier"] or "").rpartition("-")

    # 形态 × 游戏可用性：受限形态只保留当前游戏可用的（未收录形态默认可见）
    if game:
        avail: dict[int, set[str]] = {}
        for r in con.execute("SELECT form_id, game_id FROM form_game_availability"):
            avail.setdefault(r["form_id"], set()).add(r["game_id"])
        forms = [f for f in forms if f["id"] not in avail or game in avail[f["id"]]]
        if not forms:
            forms = [dict(r) for r in con.execute(
                "SELECT * FROM forms WHERE species_id=? ORDER BY is_default DESC, id",
                (species_id,))]
            default = next((f for f in forms if f["is_default"]), forms[0] if forms else None)

    game_order = "CASE game " + " ".join(
        f"WHEN '{g}' THEN {i}" for i, g in enumerate(GAME_ORDER)) + " ELSE 99 END"

    flavor = [dict(r) for r in con.execute(
        f"""SELECT game, version_label, text FROM dex_flavor
            WHERE species_id=? ORDER BY {game_order}, version_label""",
        (species_id,))]
    # 形态独立图鉴介绍（地区形态/洛托姆换装等），无条目的形态沿用默认介绍
    form_flavor: dict[int, list] = {}
    for r in con.execute(
            f"""SELECT ff.form_id, ff.game, ff.version_label, ff.text
                FROM form_flavor ff JOIN forms f ON f.id = ff.form_id
                WHERE f.species_id=? ORDER BY {game_order}, ff.version_label""",
            (species_id,)):
        form_flavor.setdefault(r["form_id"], []).append(
            {k: r[k] for k in ("game", "version_label", "text")})
    gm = [dict(r) for r in con.execute(
        f"""SELECT game, version_label, location, method, note, form FROM get_methods
            WHERE species_id=? ORDER BY {game_order}, version_label""",
        (species_id,))]

    # 按当前入口游戏裁剪（版本图鉴介绍/获取方式只看当前游戏）
    if game:
        flavor = [f for f in flavor if f["game"] == game]
        form_flavor = {fid: [r for r in rows if r["game"] == game]
                       for fid, rows in form_flavor.items()}
        form_flavor = {fid: rows for fid, rows in form_flavor.items() if rows}
        gm = [g for g in gm if g["game"] == game]

    # 获取方式按所选形态过滤：form 列为空 = 通用行恒显示；
    # 标记行（A/G/H…）映射后缀与选中形态匹配才显示（默认形态 → 只看通用行；
    # 未映射的罕见标记行一律按形态专属隐藏）。无显式 form 时用图鉴覆盖后缀。
    sel_suffix = (form or "").strip() or dex_default_suffix
    gm = [g for g in gm if not g["form"]
          or FORM_MARKER_TO_SUFFIX.get(g["form"]) == sel_suffix and g["form"] in FORM_MARKER_TO_SUFFIX]

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

    evolution = _evolution_chain(con, species_id, (form or "").strip() or dex_default_suffix)

    if default:
        for f in forms:
            f["ability_list"] = _abilities_of(con, f)

    con.close()
    return {
        "species": dict(sp),
        "default_form": default,
        "forms": forms,
        "selected_suffix": sel_suffix,
        "ev": {k: default[f"ev_{k}"] for k in ("hp", "atk", "def", "spa", "spd", "spe")} if default else {},
        "base_stats": ({k: default[k] for k in ("hp", "atk", "def", "spa", "spd", "spe")}
                       if default else {}),
        "flavor": flavor,
        "form_flavor": form_flavor,
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

    # TM 编号 + 获取方式（同号跨 DLC 版本组去重，只取一次；剑盾 100-199 为 TR）
    machines: dict[int, dict[int, tuple[int, str]]] = {}
    if cfg["tm_vgs"]:
        marks = ",".join("?" * len(cfg["tm_vgs"]))
        for r in con.execute(
                f"""SELECT machine_number, vg, move_id, item_identifier FROM machines
                    WHERE vg IN ({marks}) ORDER BY vg, machine_number""", cfg["tm_vgs"]):
            machines.setdefault(r["move_id"], {})[r["machine_number"]] = (
                r["vg"], r["item_identifier"] or "")
    tm_how: dict[tuple, dict] = {}
    for r in con.execute("SELECT vg, machine_number, how, materials FROM tm_how"):
        tm_how[(r["vg"], r["machine_number"])] = {
            "how": _clean(r["how"]), "materials": _clean(r["materials"])}

    def tm_info(move_id: int) -> list[dict]:
        out = []
        for num in sorted(machines.get(move_id, {})):
            vgnum, item_ident = machines[move_id][num]
            h = tm_how.get((vgnum, num), {})
            out.append({"number": num,
                        "kind": "TR" if item_ident.lower().startswith("tr") else "TM",
                        "how": h.get("how", ""),
                        "materials": h.get("materials", "")})
        return out

    groups: dict[str, list] = {key: [] for key, _ in cfg["tabs"]}
    method_key = {"level-up": "level", "machine": "machine", "egg": "egg", "tutor": "tutor"}
    seen = set()
    for r in rows:
        d = dict(r)
        d["tm"] = tm_info(r["move_id"]) if r["method"] == "machine" else []
        mkey = method_key.get(r["method"], r["method"])
        if game in EVOLUTION_RECALL_GAMES:
            # 朱紫：tutor（回忆机）与 level=0（进化时学会）→ 「进化&回忆」组
            if mkey == "tutor":
                mkey, d["level"], d["recall"] = "evolution-recall", None, True
            elif mkey == "level" and (d["level"] or 0) == 0:
                mkey, d["evolution"] = "evolution-recall", True
        elif mkey == "level" and (d["level"] or 0) == 0:
            # 其他游戏：level=0 保留在升级组置顶，标「进化」徽章
            d["evolution"] = True
        key = (mkey, r["move_id"])   # 以分组+招式去重
        if key in seen or mkey not in groups:
            continue
        seen.add(key)
        groups[mkey].append(d)
    groups["level"].sort(key=lambda d: (d.get("recall") is True,
                                        0 if (d.get("level") or 0) == 0 else 1,
                                        d["level"] or 0, d["move_id"]))
    for k in groups:
        if k != "level":
            groups[k].sort(key=lambda d: (0 if d.get("evolution") else 1, d["name_zh"]))

    breeding = con.execute(
        "SELECT has_breeding FROM games WHERE id=?", (game,)).fetchone()
    con.close()
    return {
        "species": dict(sp), "form": dict(form), "game": game, "vg": vg,
        "has_breeding": bool(breeding["has_breeding"]) if breeding else False,
        "tabs": [{"key": k, "label": lbl} for k, lbl in cfg["tabs"]],
        "groups": groups,
    }
