"""伤害计算器服务：现代公式（剑盾/朱紫）、传说 阿尔宙斯公式、传说 Z-A 公式。

取整语义（依据 Bulbapedia「Damage」）：
- 现代公式：基础伤害向下取整；此后每步乘法四舍五入（0.5 舍去），
  Critical 与 Type 两步向下取整；other 修正链以 4096 为基相乘（0.5 进位取整）。
- 阿尔宙斯 / Z-A：全程向下取整（Z-A 末尾 ×0.7）。
"""
from __future__ import annotations

import math

# ---------------------------------------------------------------- 属性相性（第六世代起）
TYPES = ["一般", "火", "水", "电", "草", "冰", "格斗", "毒", "地面", "飞行",
         "超能力", "虫", "岩石", "幽灵", "龙", "恶", "钢", "妖精"]

CHART: dict[str, dict[str, float]] = {t: {} for t in TYPES}


def _set(atk: str, pairs: dict[str, float]) -> None:
    CHART[atk].update(pairs)


_set("一般", {"岩石": 0.5, "钢": 0.5, "幽灵": 0})
_set("火", {"火": 0.5, "水": 0.5, "草": 2, "冰": 2, "虫": 2, "岩石": 0.5, "龙": 0.5, "钢": 2, "妖精": 0.5})
_set("水", {"火": 2, "水": 0.5, "草": 0.5, "地面": 2, "岩石": 2, "龙": 0.5})
_set("电", {"水": 2, "电": 0.5, "草": 0.5, "地面": 0, "飞行": 2, "龙": 0.5})
_set("草", {"火": 0.5, "水": 2, "草": 0.5, "毒": 0.5, "地面": 2, "飞行": 0.5, "虫": 0.5, "岩石": 2, "龙": 0.5, "钢": 0.5})
_set("冰", {"火": 0.5, "水": 0.5, "冰": 0.5, "地面": 2, "飞行": 2, "草": 2, "龙": 2, "钢": 0.5, "妖精": 0.5})
_set("格斗", {"一般": 2, "冰": 2, "毒": 0.5, "飞行": 0.5, "超能力": 0.5, "虫": 0.5, "岩石": 2, "幽灵": 0, "龙": 0.5, "恶": 2, "钢": 2, "妖精": 0.5})
_set("毒", {"草": 2, "毒": 0.5, "地面": 0.5, "岩石": 0.5, "幽灵": 0.5, "钢": 0, "妖精": 2})
_set("地面", {"火": 2, "电": 2, "草": 0.5, "毒": 2, "飞行": 0, "虫": 0.5, "岩石": 2, "钢": 2})
_set("飞行", {"电": 0.5, "草": 2, "格斗": 2, "虫": 2, "岩石": 0.5, "钢": 0.5})
_set("超能力", {"格斗": 2, "毒": 2, "超能力": 0.5, "幽灵": 0, "恶": 0, "钢": 0.5})
_set("虫", {"火": 0.5, "草": 2, "格斗": 0.5, "毒": 0.5, "飞行": 0.5, "超能力": 2, "幽灵": 0.5, "恶": 2, "钢": 0.5, "妖精": 0.5})
_set("岩石", {"火": 2, "冰": 2, "格斗": 0.5, "地面": 0.5, "飞行": 2, "虫": 2, "钢": 0.5})
_set("幽灵", {"一般": 0, "超能力": 2, "幽灵": 2, "恶": 0.5})
_set("龙", {"龙": 2, "钢": 0.5, "妖精": 0})
_set("恶", {"格斗": 0.5, "超能力": 2, "幽灵": 2, "恶": 0.5, "妖精": 0.5})
_set("钢", {"火": 0.5, "水": 0.5, "电": 0.5, "冰": 2, "岩石": 2, "钢": 0.5, "妖精": 2})
_set("妖精", {"火": 0.5, "格斗": 2, "毒": 0.5, "龙": 2, "恶": 2, "钢": 0.5})

# 特殊相性招式（identifier → 覆盖规则）
SPECIAL_MOVES = {"freeze-dry": {"水": 2}, "flying-press": "__both__"}

# 对极巨化目标 ×2 的招式
DYNAMAX_SUPER = {"巨兽斩击", "巨兽弹击", "极巨炮"}


def rnd_half_down(x: float) -> int:
    f = math.floor(x)
    return f + 1 if (x - f) > 0.5 else f


def chain4096(acc: int, numerator: int) -> int:
    return int(acc * numerator / 4096 + 0.5)


# ---------------------------------------------------------------- 能力值
def stat_hp(base: int, iv: int, ev: int, level: int) -> int:
    if base == 1:
        return 1  # 结灵（胡帕? 脱壳忍者）特例
    return int((2 * base + iv + ev // 4) * level / 100) + level + 10


def stat_other(base: int, iv: int, ev: int, level: int, nature: float = 1.0) -> int:
    v = int((2 * base + iv + ev // 4) * level / 100) + 5
    return int(v * nature)


def stage_mult(k: int) -> tuple[int, int]:
    """能力等级 → 分数 (num, den)。"""
    if k >= 0:
        return (2 + k, 2)
    return (2, 2 - k)


NATURE_MULT = {"up": 1.1, "down": 0.9, "neutral": 1.0}

ITEMS = {
    "": None,
    "生命宝珠": 5324,
    "达人带": 4915,          # 仅属性相性 ≥2 时生效
    "属性加成道具": 4915,     # 简化：与招式属性一致时生效（由前端给具体道具名）
}
CHOICE = {"讲究头带": ("atk", 1.5), "讲究眼镜": ("spa", 1.5), "讲究围巾": ("spe", 1.5)}

EFFECTIVENESS_LABEL = {0: "无效", 0.25: "效果极差", 0.5: "效果不好", 1: "效果正常",
                       2: "效果绝佳", 4: "效果绝佳×2"}


def effectiveness(move_type: str, def_types: list[str], move_ident: str = "",
                  levitate: bool = False) -> float:
    if move_ident in SPECIAL_MOVES and SPECIAL_MOVES[move_ident] == "__both__":
        eff = 1.0
        for t in def_types:
            eff *= CHART.get("格斗", {}).get(t, 1) * CHART.get("飞行", {}).get(t, 1)
        return eff
    if levitate and move_type == "地面":
        return 0.0
    eff = 1.0
    overrides = SPECIAL_MOVES.get(move_ident)
    for t in def_types:
        if overrides and t in overrides:
            eff *= overrides[t]
        else:
            eff *= CHART.get(move_type, {}).get(t, 1)
    return eff


def calc_modern_stats(form: dict, level: int, nature: dict | None,
                      evs: dict, ivs: dict, choice_item: str = "",
                      dynamax: bool = False) -> dict:
    """nature: {up, down}；evs/ivs: {hp,atk,def,spa,spd,spe}。"""
    up = (nature or {}).get("up")
    down = (nature or {}).get("down")

    def nm(k: str) -> float:
        if up == k and down != k:
            return 1.1
        if down == k and up != k:
            return 0.9
        return 1.0

    hp = stat_hp(form["hp"], ivs.get("hp", 31), evs.get("hp", 0), level)
    if dynamax:
        hp *= 2
    out = {"hp": hp}
    for k in ("atk", "def", "spa", "spd", "spe"):
        v = stat_other(form[k], ivs.get(k, 31), evs.get(k, 0), level, nm(k))
        if CHOICE.get(choice_item, ("",))[0] == k:
            v = int(v * CHOICE[choice_item][1])
        out[k] = v
    return out


def _a_and_d(atk_stats: dict, atk_boost: int, def_stats: dict, def_boost: int,
             physical: bool) -> tuple[int, int]:
    if physical:
        n, d = stage_mult(atk_boost)
        a = int(atk_stats["atk"] * n / d)
        n, d = stage_mult(def_boost)
        dd = int(def_stats["def"] * n / d)
    else:
        n, d = stage_mult(atk_boost)
        a = int(atk_stats["spa"] * n / d)
        n, d = stage_mult(def_boost)
        dd = int(def_stats["spd"] * n / d)
    return a, dd


def _stab(move_type: str, atk_types: list[str], adaptability: bool) -> float:
    if move_type not in atk_types:
        return 1.0
    return 2.0 if adaptability else 1.5


def _weather_mult(weather: str, move_type: str, formula: str) -> float:
    if not weather:
        return 1.0
    strong, weak = (1.2, 0.8) if formula == "za" else (1.5, 0.5)
    if weather == "sun":
        if move_type == "火":
            return strong
        if move_type == "水":
            return weak
    if weather == "rain":
        if move_type == "水":
            return strong
        if move_type == "火":
            return weak
    return 1.0


def _other_chain(numerators: list[int]) -> int:
    acc = 4096
    for n in numerators:
        acc = chain4096(acc, n)
    return acc


def calc_damage_modern(a: dict, d: dict, move: dict, opt: dict) -> dict:
    """严格对齐 @smogon/calc gen5+ 机制（逐位校准，见 tools/calib 与 docs）。

    流程: base(含天气/会心) → random(floor) → STAB(4096分数) → pokeRound×相性(floor)
          → 灼伤(floor/2) → finalMod(4096链, 含屏幕/特性/道具) → pokeRound, min 1
    """
    formula = opt.get("formula", "modern")
    physical = move["damage_class"] == "physical"
    power = opt.get("move_power_override") or move.get("power") or 0
    if not power or move["damage_class"] == "status":
        return {"error": "status_or_no_power"}

    atk_types = [t for t in (a["types"] or "").split(",") if t]
    def_types = [t for t in (d["types"] or "").split(",") if t]
    a_abil = a.get("ability") or ""
    d_abil = d.get("ability") or ""

    eff = effectiveness(move["type_zh"], def_types, move.get("identifier", ""),
                        levitate=(d_abil == "漂浮"))
    if eff == 0:
        return {"min": 0, "max": 0, "effectiveness": 0, "label": EFFECTIVENESS_LABEL[0],
                "hp": d["stats"]["hp"], "pct_min": 0, "pct_max": 0, "ohko": False, "rolls": [0]}

    atk_st, def_st = a["stats"], d["stats"]
    boost_a = a.get("boosts", {}).get("atk" if physical else "spa", 0)
    boost_d = d.get("boosts", {}).get("def" if physical else "spd", 0)
    atk_v, def_v = _a_and_d(atk_st, boost_a, def_st, boost_d, physical)

    # 毅力：异常状态下攻击 ×1.5（pokeRound）
    guts = a_abil == "毅力" and opt.get("burn")
    if guts:
        atk_v = rnd_half_down(atk_v * 1.5)

    # ---- 基础伤害 ----
    base = math.floor(math.floor(math.floor(math.floor(2 * a["level"] / 5 + 2) * power) * atk_v / def_v) / 50 + 2)
    # 天气（4096 分数 pokeRound）
    w = opt.get("weather", "")
    if (w == "sun" and move["type_zh"] == "火") or (w == "rain" and move["type_zh"] == "水"):
        base = rnd_half_down(base * 6144 / 4096)
    elif (w == "sun" and move["type_zh"] == "水") or (w == "rain" and move["type_zh"] == "火"):
        base = rnd_half_down(base * 2048 / 4096)
    # 会心：基础伤害 ×1.5 向下取整
    if opt.get("crit"):
        base = math.floor(base * 1.5)

    stab_mod = 4096
    if move["type_zh"] in atk_types:
        stab_mod = 8192 if a_abil == "适应力" else 6144
    apply_burn = opt.get("burn") and physical and a_abil != "毅力" and move.get("name_zh") != "装模作样"

    # finalMod 4096 链（顺序对齐 smogon）
    mods = []
    screen_on = opt.get("screen") == ("reflect" if physical else "light_screen")
    if screen_on and not opt.get("crit"):
        mods.append(2048)
    if a_abil == "超感知" and eff > 1:
        mods.append(5120)
    elif a_abil == "狙击手" and opt.get("crit"):
        mods.append(6144)
    elif a_abil == "有色眼镜" and eff < 1:
        mods.append(8192)
    if d.get("is_dynamax") and move.get("name_zh") in DYNAMAX_SUPER:
        mods.append(8192)
    if d_abil == "多重鳞片" and opt.get("defender_full_hp", True):
        mods.append(2048)
    if d_abil == "冰鳞粉" and not physical:
        mods.append(2048)
    if d_abil in ("滤芯", "Prism装甲") and eff > 1:
        mods.append(3072)
    item = a.get("item") or ""
    if item == "达人带" and eff > 1:
        mods.append(4915)
    elif item == "生命宝珠":
        mods.append(5324)
    final_mod = 4096
    for m in mods:
        final_mod = (final_mod * m + 2048) >> 12

    rolls = []
    for i in range(16):
        dmg = math.floor(base * (85 + i) / 100)
        if stab_mod != 4096:
            dmg = dmg * stab_mod / 4096
        dmg = math.floor(rnd_half_down(dmg) * eff)
        if apply_burn:
            dmg = math.floor(dmg / 2)
        rolls.append(max(1, rnd_half_down(dmg * final_mod / 4096)))

    hp = def_st["hp"]
    pct = [math.floor(v * 1000 / hp) / 10 for v in (min(rolls), max(rolls))]
    return {
        "base": base, "rolls": rolls, "min": min(rolls), "max": max(rolls),
        "effectiveness": eff, "label": EFFECTIVENESS_LABEL.get(eff, f"×{eff}"),
        "hp": hp, "pct_min": pct[0], "pct_max": pct[1],
        "ohko": min(rolls) >= hp,
    }


def calc_damage_pla(a: dict, d: dict, move: dict, opt: dict) -> dict:
    physical = move["damage_class"] == "physical"
    power = opt.get("move_power_override") or move.get("power") or 0
    if not power or move["damage_class"] == "status":
        return {"error": "status_or_no_power"}
    def_types = [t for t in (d["types"] or "").split(",") if t]
    eff = effectiveness(move["type_zh"], def_types, move.get("identifier", ""))
    if eff == 0:
        return {"min": 0, "max": 0, "effectiveness": 0, "label": EFFECTIVENESS_LABEL[0],
                "hp": d["stats"]["hp"], "pct_min": 0, "pct_max": 0, "ohko": False, "rolls": [0]}
    atk_v = a["stats"]["atk" if physical else "spa"]
    def_v = d["stats"]["def" if physical else "spd"]
    # 风格：strong 1.5 / agile 0.66 / normal 1
    style = {"strong": 1.5, "agile": 0.66}.get(opt.get("style", ""), 1.0)
    atk_v = int(atk_v * style)
    stab = 1.25 if move["type_zh"] in a["types"].split(",") else 1.0
    rolls = []
    for r in range(85, 101):
        x = math.floor((100 + atk_v + 15 * a["level"]) * power / (def_v + 50) / 5)
        x = math.floor(x * r / 100)
        x = math.floor(x * stab)
        x = math.floor(x * eff)
        rolls.append(max(x, 1))
    hp = d["stats"]["hp"]
    pct = [math.floor(v * 1000 / hp) / 10 for v in (min(rolls), max(rolls))]
    return {"base": rolls[0], "rolls": rolls, "min": min(rolls), "max": max(rolls),
            "effectiveness": eff, "label": EFFECTIVENESS_LABEL.get(eff, f"×{eff}"),
            "hp": hp, "pct_min": pct[0], "pct_max": pct[1], "ohko": min(rolls) >= hp}


def calc_damage(a: dict, d: dict, move: dict, opt: dict) -> dict:
    formula = opt.get("formula", "modern")
    if formula == "pla":
        return calc_damage_pla(a, d, move, opt)
    return calc_damage_modern(a, d, move, opt)
