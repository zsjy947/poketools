"""伤害计算器服务：现代公式（第五世代起回合制，剑盾/朱紫）。

四期 P4-1 起只保留现代公式（阿尔宙斯 / Z-A 公式模式已移除，见 docs/DESIGN.md 变更历史）。

取整语义（依据 Bulbapedia「Damage」，与 @smogon/calc 逐 roll 校准，勿改顺序）：
- 基础伤害向下取整；天气以 4096 分数 pokeRound 作用于基础伤害；会心 ×1.5 向下取整；
- 随机最先 floor(base×(85+i)/100)；STAB 为 4096 分数链；
- other/finalMod 修正链以 4096 为基相乘（每步 0.5 进位取整）。
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

# ---------------------------------------------------------------- Z招式 / 极巨招式威力（Bulbapedia/52poke 换算表）
Z_SPECIAL = {  # 常见特例（其余按区间）
    "giga-drain": 120, "weather-ball": 160, "hex": 160, "v-create": 220,
    "flying-press": 170, "thousand-arrows": 180, "core-enforcer": 140,
    "multi-attack": 185, "struggle": 1,
}


def z_power(base: int, move_ident: str = "") -> int:
    if move_ident in Z_SPECIAL:
        return Z_SPECIAL[move_ident]
    if base < 60:
        return 100
    if base < 70:
        return 120
    if base < 80:
        return 140
    if base < 90:
        return 160
    if base < 100:
        return 175
    if base < 110:
        return 180
    if base < 120:
        return 185
    if base < 130:
        return 190
    if base < 140:
        return 195
    return 200


def max_power(base: int, move_type: str = "") -> int:
    fp = move_type in ("格斗", "毒")   # 格斗/毒极巨招式威力独立
    if base <= 40:
        return 70 if fp else 90
    if base < 55:
        return 75 if fp else 100
    if base <= 60:
        return 80 if fp else 110
    if base <= 70:
        return 85 if fp else 120
    if base <= 100:
        return 90 if fp else 130
    if base <= 140:
        return 95 if fp else 140
    return 100 if fp else 150


def rnd_half_down(x: float) -> int:
    f = math.floor(x)
    return f + 1 if (x - f) > 0.5 else f


# ---------------------------------------------------------------- 能力值
def stat_hp(base: int, iv: int, ev: int, level: int) -> int:
    if base == 1:
        return 1  # 脱壳忍者：HP 种族值为 1 的特例
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
                      dynamax: bool = False,
                      def_spd_mult: float = 1.0) -> dict:
    """nature: {up, down}；evs/ivs: {hp,atk,def,spa,spd,spe}。
    def_spd_mult: 防守向道具对防御/特防的乘数（突击背心/进化奇石）。"""
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
        if k in ("def", "spd") and def_spd_mult != 1.0:
            v = int(v * def_spd_mult)
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


def calc_damage_modern(a: dict, d: dict, move: dict, opt: dict) -> dict:
    """严格对齐 @smogon/calc gen5+ 机制（逐位校准，见 tools/calib 与 docs）。

    流程: 威力阶段修正(帮助/青草场地, bpMods) → Z/极巨换算
          → base(含天气/会心) → random(floor) → STAB(4096分数) → pokeRound×相性(floor)
          → 灼伤(floor/2) → finalMod(4096链, 含屏幕/特性/道具) → pokeRound, min 1
    """
    physical = move["damage_class"] == "physical"
    power = opt.get("move_power_override") or move.get("power") or 0
    if not power or move["damage_class"] == "status":
        return {"error": "status_or_no_power"}

    atk_types = [t for t in (a["types"] or "").split(",") if t]
    tera_a = a.get("tera_type") or ""
    def_types = [t for t in (d["types"] or "").split(",") if t]
    if d.get("tera_type"):
        def_types = [d["tera_type"]]
    a_abil = a.get("ability") or ""
    d_abil = d.get("ability") or ""

    # ---- 威力阶段修正（对齐 smogon bpMods，作用于基础威力，先于 Z/极巨换算） ----
    # 帮助：威力 ×1.5（6144/4096 pokeRound）
    if opt.get("helping_hand"):
        power = rnd_half_down(power * 6144 / 4096)
    # 青草场地：仅地震/跺脚，且防守方接地（非漂浮、非飞行系）时威力减半
    if (opt.get("terrain") == "grassy"
            and move.get("identifier") in ("earthquake", "bulldoze")
            and d_abil != "漂浮" and "飞行" not in def_types):
        power = rnd_half_down(power * 2048 / 4096)
    # Z招式 / 极巨招式威力换算（覆盖基础威力）
    if opt.get("z_move"):
        power = z_power(power, move.get("identifier", ""))
    elif opt.get("max_move"):
        power = max_power(power, move["type_zh"])

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
    # 天气（4096 分数 pokeRound）。大晴天/大雨与晴/雨同乘数；乱流/沙暴/雪不影响伤害数值
    w = {"harsh_sun": "sun", "harsh_rain": "rain"}.get(
        opt.get("weather", ""), opt.get("weather", ""))
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
    if tera_a == move["type_zh"]:
        # 太晶属性 STAB：与原属性一致或适应力时为 2 倍，否则 1.5 倍；保留原属性 STAB
        stab_mod = max(stab_mod, 8192 if (move["type_zh"] in atk_types
                                          or a_abil == "适应力") else 6144)
    apply_burn = opt.get("burn") and physical and a_abil != "毅力" and move.get("name_zh") != "装模作样"

    # finalMod 4096 链（顺序对齐 smogon；极光幕并入屏幕项）
    mods = []
    screen = opt.get("screen", "")
    screen_on = screen == ("reflect" if physical else "light_screen") or screen == "aurora"
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


def calc_damage(a: dict, d: dict, move: dict, opt: dict) -> dict:
    return calc_damage_modern(a, d, move, opt)
