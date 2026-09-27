"""伤害计算器服务：现代公式（第五世代起回合制，剑盾/朱紫）。

四期 P4-1 起只保留现代公式（阿尔宙斯 / Z-A 公式模式已移除，见 docs/DESIGN.md 变更历史）。
五期扩展对齐 @smogon/calc gen9 修正链：双打扩散/友方辅助/气场/四灾兽/雪沙暴/
场地全集/花之礼/被识破/进场 HP 扣减/奇妙空间/魔法空间/重力/Z 纯晶(泛用+专属)/
星晶太晶(攻防两侧)/防守方太晶相性/连续招式 Z·极巨威力折算。

取整语义（依据 Bulbapedia「Damage」与 @smogon/calc 逐 roll 校准，勿改顺序）：
- 能力值阶段 floor(stat×num/den)；会心无视攻击方负向与防守方正向能力变化；
- 威力阶段修正（bpMods）以 4096 分数链 pokeRound；Z/极巨换算以「原始威力」为输入；
- 基础伤害每步向下取整；扩散(3072)与天气(6144/2048) pokeRound 作用于基础伤害；
  会心 ×1.5 向下取整；随机最先 floor(base×(85+i)/100)；
- STAB 与 finalMod 是 4096 分数链（pokeRound 半舍去）；min 1。
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

# 防守方受击免疫类特性（对齐 smogon：免疫属性 → 伤害为 0）
IMMUNE_ABILITIES = {
    "引火": ("火",), "避雷针": ("电",), "蓄电": ("电",), "马达驱动": ("电",),
    "储水": ("水",), "引水": ("水",), "干燥皮肤": ("水",), "食草": ("草",),
}

# ---------------------------------------------------------------- Z招式 / 极巨招式威力

Z_SPECIAL = {  # 常见特例（其余按区间；对齐 smogon data.zMove 逐条核对）
    "weather-ball": 160, "hex": 160, "v-create": 220,
    "flying-press": 170, "thousand-arrows": 180, "core-enforcer": 140,
    "multi-attack": 185, "struggle": 1,
}

# 多段招式（identifier → (最小段数, 最大段数)）：Z/极巨威力按官方规则折算
#  · Z：2~5 段取 3 段威力（固定 2 段/1~3 段用单段威力）
#  · 极巨：2~5 段取 3 段、固定 2 段取 2 倍、1~3 段取 3 倍（ escalating 三旋击合计 120）
#  · 水手里剑按低于 45 的 40 档计算（52poke 特例）
MULTIHIT = {
    "comet-punch": (2, 5), "double-slap": (2, 5), "fury-attack": (2, 5),
    "fury-swipes": (2, 5), "pin-missile": (2, 5), "icicle-spear": (2, 5),
    "rock-blast": (2, 5), "tail-slap": (2, 5), "bullet-seed": (2, 5),
    "spike-cannon": (2, 5), "barrage": (2, 5), "water-shuriken": (2, 5),
    "arm-thrust": (2, 5),
    "double-kick": (2, 2), "bonemerang": (2, 2), "twin-beam": (2, 2),
    "dragon-darts": (2, 2), "double-iron-bash": (2, 2), "gear-grind": (2, 2),
    "double-hit": (2, 2), "dual-chop": (2, 2), "double-shock": (2, 2),
    "twin-wingbeat": (2, 2), "twineedle": (2, 2),
    "triple-dive": (1, 3), "surging-strikes": (3, 3),
    "triple-kick": (1, 3), "triple-axel": (3, 3), "bone-rush": (2, 5),
}
# 特殊折算/直取（identifier → 极巨招式最终威力；气象球为官方特例 130）
MAX_SPECIAL = {
    "water-shuriken": 90,    # 15×3=45 但按低档 40 计 → 90
    "triple-axel": 140,      # 20+40+60 三段递增合计 120 → 140
    "weather-ball": 130,     # 官方极巨威力特例（smogon data 130）
}


def _multihit_power(base: int, ident: str, for_max: bool = False) -> int:
    """多段招式的「原始威力」折算（Z/极巨换算的输入）。"""
    mh = MULTIHIT.get(ident)
    if not mh:
        return base
    lo, hi = mh
    if hi == 5 or hi == 3:
        n = 3
    elif hi == 2:
        n = 2
    else:
        return base
    if not for_max and n == 2:
        return base          # Z：固定 2 段用单段威力
    if ident == "triple-axel" and for_max:
        return 120           # 三段递增 20+40+60
    if ident == "water-shuriken" and for_max:
        return 40            # 45 按低档 40 计
    return base * n


def z_power(base: int, move_ident: str = "") -> int:
    if move_ident in Z_SPECIAL:
        return Z_SPECIAL[move_ident]
    base = _multihit_power(base, move_ident, for_max=False)
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


def max_power(base: int, move_type: str = "", move_ident: str = "") -> int:
    if move_ident in MAX_SPECIAL:
        return MAX_SPECIAL[move_ident]
    base = _multihit_power(base, move_ident, for_max=True)
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


def poke_round_ratio(num: int, den: int = 4096) -> int:
    """4096 分数链的单步取整（smogon pokeRound：0.5 进位）。"""
    return (num + den // 2) // den


def chain_mods(mods: list[int], lower: int = 1, upper: int = 131072) -> int:
    m = 4096
    for mod in mods:
        if mod != 4096:
            m = (m * mod + 2048) >> 12
    return max(min(m, upper), lower)


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
                  levitate: bool = False, foresight: bool = False,
                  gravity: bool = False) -> float:
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
        # 被识破：一般/格斗对幽灵该格按中性；重力：地面对飞行该格按中性
        if foresight and move_type in ("一般", "格斗") and t == "幽灵":
            continue
        if gravity and move_type == "地面" and t == "飞行":
            continue
        if overrides and t in overrides:
            eff *= overrides[t]
        else:
            eff *= CHART.get(move_type, {}).get(t, 1)
    return eff


def calc_modern_stats(form: dict, level: int, nature: dict | None,
                      evs: dict, ivs: dict, choice_item: str = "",
                      dynamax: bool = False) -> dict:
    """nature: {up, down}；evs/ivs: {hp,atk,def,spa,spd,spe}。

    防守向道具（突击背心/进化奇石）的 6144/4096 修正已移至伤害引擎 dfMods 链（对齐
    smogon pokeRound 语义），此处不再翻倍。"""
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


def _grounded(p: dict, opt: dict) -> bool:
    """接地判定：重力/铁球强制接地；飞行系/漂浮/气球不接地。"""
    if opt.get("gravity"):
        return True
    types = [t for t in (p.get("types") or "").split(",") if t]
    if "飞行" in types or p.get("ability") == "漂浮" or p.get("item") == "气球":
        return False
    return True


def _modified_stat(stat: int, boost: int) -> int:
    n, d = stage_mult(boost)
    return int(stat * n / d)


# ---------------------------------------------------------------- 威力阶段 / 能力修正链

def calc_damage_modern(a: dict, d: dict, move: dict, opt: dict) -> dict:
    """严格对齐 @smogon/calc gen9 机制（逐位校准，见 tools/calib 与 docs）。

    流程: 威力阶段修正(bpMods) → Z/极巨换算（以原始威力为输入）
          → base(含扩散/天气/会心) → random(floor) → STAB(4096分数) → pokeRound×相性(floor)
          → 灼伤(floor/2) → finalMod(4096链, 含屏幕/特性/道具) → pokeRound, min 1
    """
    physical = move["damage_class"] == "physical"
    power = opt.get("move_power_override") or move.get("power") or 0
    if not power or move["damage_class"] == "status":
        return {"error": "status_or_no_power"}

    atk_types = [t for t in (a["types"] or "").split(",") if t]
    tera_a = a.get("tera_type") or ""
    def_types = [t for t in (d["types"] or "").split(",") if t]
    tera_d = d.get("tera_type") or ""
    a_abil = a.get("ability") or ""
    d_abil = d.get("ability") or ""
    # 魔法空间：双方道具修正失效
    a_item = "" if opt.get("magic_room") else (a.get("item") or "")
    d_item = "" if opt.get("magic_room") else (d.get("item") or "")
    doubles = (opt.get("mode") or "singles") != "singles"

    # 星晶爆发：太乐巴戈斯太晶化后变为星晶属性招式
    move_type = move["type_zh"]
    move_ident = move.get("identifier", "")
    stellar_move = move_ident == "tera-starstorm" and bool(tera_a)

    # ---- Z 招式 / 极巨招式威力换算（以原始威力为输入，先于 bpMods；对齐 smogon 构造期换算） ----
    z_ex = opt.get("z_exclusive") or {}
    if z_ex:
        power = z_ex.get("power") or power
        move_type = move["type_zh"]
    elif opt.get("z_move"):
        power = z_power(move.get("power") or power, move_ident)
    elif opt.get("max_move"):
        power = max_power(move.get("power") or power, move["type_zh"], move_ident)

    # ---- 威力阶段修正（bpMods 4096 分数链，顺序对齐 smogon） ----
    bp_mods: list[int] = []
    if opt.get("helping_hand"):
        bp_mods.append(6144)
    atk_grounded = _grounded(a, opt)
    if atk_grounded:
        terrain = opt.get("terrain", "")
        if ((terrain == "electric" and move_type == "电")
                or (terrain == "psychic" and move_type == "超能力")
                or (terrain == "grassy" and move_type == "草")):
            bp_mods.append(5325)   # gen9 场地威力 5325/4096
    if _grounded(d, opt):
        terrain = opt.get("terrain", "")
        if (terrain == "misty" and move_type == "龙") or (
                terrain == "grassy" and move_ident in ("earthquake", "bulldoze")):
            bp_mods.append(2048)
    # 气场（妖精/暗黑 ×5448；气场破坏反转为 ×3072）
    auras = opt.get("auras") or {}
    aura_active = ((auras.get("fairy") and move_type == "妖精")
                   or (auras.get("dark") and move_type == "恶")
                   or (a_abil == "妖精气场" and move_type == "妖精")
                   or (d_abil == "妖精气场" and move_type == "妖精")
                   or (a_abil == "暗黑气场" and move_type == "恶")
                   or (d_abil == "暗黑气场" and move_type == "恶"))
    if aura_active:
        bp_mods.append(3072 if (auras.get("break") or a_abil == "气场破坏"
                                or d_abil == "气场破坏") else 5448)
    # 友方辅助（双打语义）
    if opt.get("battery") and not physical:
        bp_mods.append(5325)
    if opt.get("power_spot"):
        bp_mods.append(5325)
    # smogon：basePower = floor(basePower × chain(bpMods) / 4096)（链内 (m*mod+2048)>>12）
    power = (power * chain_mods(bp_mods)) // 4096
    if power <= 0:
        return {"error": "status_or_no_power"}

    # ---- 属性相性（防守方太晶后属性替换；星晶保持原属性） ----
    eff_types = def_types if tera_d in ("", "星晶") else [tera_d]
    eff = effectiveness(move_type, eff_types, move_ident,
                        levitate=(d_abil == "漂浮" and not opt.get("gravity")),
                        foresight=bool(opt.get("foresight")),
                        gravity=bool(opt.get("gravity")))
    if stellar_move:
        # 星晶属性招式：对太晶化目标 ×2，其余 ×1
        eff = 2.0 if tera_d else 1.0
    if eff == 0:
        return {"min": 0, "max": 0, "effectiveness": 0, "label": EFFECTIVENESS_LABEL[0],
                "hp": d["stats"]["hp"], "pct_min": 0, "pct_max": 0, "ohko": False,
                "rolls": [0], "ko": _ko_summary([0], d["stats"]["hp"], opt)}

    # ---- 攻击 / 防御能力值（含能力升降·会心忽略方向·灾兽·雪沙暴·奇妙空间） ----
    weather = {"harsh_sun": "sun", "harsh_rain": "rain"}.get(
        opt.get("weather", ""), opt.get("weather", ""))
    atk_st = dict(a["stats"])
    def_st = dict(d["stats"])
    if opt.get("wonder_room"):
        atk_st["def"], atk_st["spd"] = atk_st["spd"], atk_st["def"]
        def_st["def"], def_st["spd"] = def_st["spd"], def_st["def"]
    crit = bool(opt.get("crit"))
    atk_key, def_key = ("atk", "def") if physical else ("spa", "spd")
    boost_a = a.get("boosts", {}).get(atk_key, 0)
    boost_d = d.get("boosts", {}).get(def_key, 0)
    # 会心：无视攻击方负向 / 防守方正向能力变化
    atk_v = atk_st[atk_key] if (crit and boost_a < 0) else _modified_stat(atk_st[atk_key], boost_a)
    def_v = def_st[def_key] if (crit and boost_d > 0) else _modified_stat(def_st[def_key], boost_d)

    at_mods: list[int] = []
    if a_abil == "毅力" and (opt.get("burn") or opt.get("status")):
        atk_v = rnd_half_down(atk_v * 1.5)
    ruin = opt.get("ruin") or {}
    if ruin.get("tablets") or a_abil == "灾祸之简":
        at_mods.append(3072)   # 灾祸之简：对方攻击 ×0.75
    if (ruin.get("vessel") or a_abil == "灾祸之鼎") and not physical:
        at_mods.append(3072)   # 灾祸之玉：对方特攻 ×0.75
    if (opt.get("flower_gift") or a_abil == "花之礼") and weather == "sun" and physical:
        at_mods.append(6144)   # 花之礼（大晴天）：友方攻击 ×1.5
    if opt.get("steely_spirit") and move_type == "钢":
        at_mods.append(6144)   # 钢之意志（友方）：钢招式 ×1.5（能力阶段）
    atk_v = max(1, poke_round_ratio(atk_v * chain_mods(at_mods)))

    df_mods: list[int] = []
    if weather == "snow" and "冰" in def_types and physical:
        def_v = rnd_half_down(def_v * 1.5)     # 雪天：冰系防御 ×1.5
    if weather == "sand" and "岩石" in def_types and not physical:
        def_v = rnd_half_down(def_v * 1.5)     # 沙暴：岩石系特防 ×1.5
    if (ruin.get("sword") or a_abil == "灾祸之剑") and physical:
        df_mods.append(3072)   # 灾祸之剑：对方防御 ×0.75
    if (ruin.get("beads") or a_abil == "灾祸之玉") and not physical:
        df_mods.append(3072)   # 灾祸之玉：对方特防 ×0.75
    if (opt.get("flower_gift_d") or d_abil == "花之礼") and weather == "sun" and not physical:
        df_mods.append(6144)   # 花之礼防守侧（大晴天）：特防 ×1.5
    if d_item == "突击背心" and not physical:
        df_mods.append(6144)
    elif d_item == "进化奇石" and d.get("can_evolve"):
        df_mods.append(6144)
    def_v = max(1, poke_round_ratio(def_v * chain_mods(df_mods)))

    # ---- 基础伤害 ----
    base = math.floor(math.floor(math.floor(math.floor(2 * a["level"] / 5 + 2) * power) * atk_v / def_v) / 50 + 2)
    # 双打扩散招式 ×0.75（3072/4096 pokeRound，作用于基础伤害）
    if doubles and move.get("is_spread"):
        base = rnd_half_down(base * 3072 / 4096)
    if (weather == "sun" and move_type == "火") or (weather == "rain" and move_type == "水"):
        base = rnd_half_down(base * 6144 / 4096)
    elif (weather == "sun" and move_type == "水") or (weather == "rain" and move_type == "火"):
        base = rnd_half_down(base * 2048 / 4096)
    if crit:
        base = math.floor(base * 1.5)

    # ---- STAB（4096 分数；星晶/太晶/适应力对齐 smogon getStabMod+getStellarStabMod） ----
    stab_mod = 4096
    if move_type in atk_types:
        stab_mod += 2048
    if tera_a and tera_a == move_type and tera_a != "星晶":
        stab_mod += 2048
    has_type = ((tera_a and tera_a != "星晶" and tera_a == move_type)
                or move_type in atk_types)
    if a_abil == "适应力" and has_type:
        stab_mod += 1024 if (tera_a and tera_a in atk_types) else 2048
    if tera_a == "星晶":
        # 星晶太晶：本属性招式额外 +2048，非本属性 4915（每属性当次视为首次）
        if move_type in atk_types:
            stab_mod += 2048
        else:
            stab_mod = 4915
    apply_burn = opt.get("burn") and physical and a_abil != "毅力" and move.get("name_zh") != "装模作样"

    # ---- finalMod 4096 链（顺序对齐 smogon；极光幕并入屏幕项） ----
    mods = []
    screen = opt.get("screen", "")
    screen_on = screen == ("reflect" if physical else "light_screen") or screen == "aurora"
    if screen_on and not crit:
        mods.append(2732 if doubles else 2048)   # 双打屏幕修正 2732/4096
    if a_abil == "超感知" and eff > 1:
        mods.append(5120)
    elif a_abil == "狙击手" and crit:
        mods.append(6144)
    elif a_abil == "有色眼镜" and eff < 1:
        mods.append(8192)
    if d.get("is_dynamax") and move.get("name_zh") in DYNAMAX_SUPER:
        mods.append(8192)
    # 多重鳞片/影甲：满血（且未被钉子削血）时 ×0.5 —— 满血判定由 API 层按进场扣减后传入
    if d_abil in ("多重鳞片", "影甲") and opt.get("defender_full_hp", True):
        mods.append(2048)
    if d_abil == "冰鳞粉" and not physical:
        mods.append(2048)
    if d_abil in ("滤芯", "Prism装甲") and eff > 1:
        mods.append(3072)
    if opt.get("friend_guard"):
        mods.append(3072)
    if a_item == "达人带" and eff > 1 and not (opt.get("z_move") or z_ex):
        mods.append(4915)
    elif a_item == "生命宝珠":
        mods.append(5324)
    final_mod = chain_mods(mods)

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
    result = {
        "base": base, "rolls": rolls, "min": min(rolls), "max": max(rolls),
        "effectiveness": eff, "label": EFFECTIVENESS_LABEL.get(eff, f"×{eff}"),
        "hp": hp, "pct_min": pct[0], "pct_max": pct[1],
        "ohko": min(rolls) >= hp,
        "ko": _ko_summary(rolls, hp, opt),
    }
    if z_ex.get("name"):
        result["z_move_name"] = z_ex["name"]
    return result


# ---------------------------------------------------------------- 进场 HP 扣减 / KO 回合

def hazard_damage(def_types: list[str], hp: int, hazards: dict, grounded: bool) -> int:
    """进场类 HP 扣减（一次性先扣；对齐官方比例，向下取整，至少 0）。

    隐形岩按防守方属性弱点合计（每格 12.5%）；撒菱 1/8·1/6·1/4（接地）；
    盐淹 1/8（水/钢 1/4）；寄生种子 1/8。剧毒/灼伤等每回合削血不进 KO 卷积。
    """
    total = 0
    if hazards.get("rocks"):
        mult = 1.0
        for t in def_types:
            mult *= CHART.get("岩石", {}).get(t, 1)
        total += math.floor(hp * 0.125 * mult)
    spikes = hazards.get("spikes", 0)
    if spikes and grounded:
        total += math.floor(hp * {1: 1 / 8, 2: 1 / 6, 3: 1 / 4}[min(3, spikes)])
    if hazards.get("salt_cure"):
        frac = 1 / 4 if any(t in ("水", "钢") for t in def_types) else 1 / 8
        total += math.floor(hp * frac)
    if hazards.get("leech_seed"):
        total += math.floor(hp / 8)
    return min(hp - 1 if hp > 1 else 0, total)


def _ko_summary(rolls: list[int], hp: int, opt: dict) -> dict:
    """KO 回合分布：n=1..4 内击倒概率（16 rolls 独立同分布精确枚举）。

    气势披带/气势头带：满血首击致死时残留 1 HP → 一回合击倒概率归零。
    """
    sash = opt.get("defender_sash")
    # 预计算分布：n 回合总伤害 ≥ hp 的概率（键为字符串，与 JSON 序列化一致）
    dist = {0: 1.0}
    probs = {}
    for n in range(1, 5):
        nxt = {}
        for s, p in dist.items():
            for r in rolls:
                nxt[s + r] = nxt.get(s + r, 0) + p / 16
        dist = nxt
        probs[str(n)] = round(sum(p for s, p in dist.items() if s >= hp) * 100, 2)
    if sash:
        # 首击致死改残留 1 HP：只要任意伤害>0，2 回合必击倒；1 回合归零
        probs["1"] = 0.0
        for n in range(2, 5):
            probs[str(n)] = 100.0 if any(r > 0 for r in rolls) else probs[str(n)]
    guaranteed = next((n for n in (1, 2, 3, 4) if probs[str(n)] >= 100.0), None)
    if guaranteed is None and probs["4"] > 0:
        guaranteed = -1   # 4 回合内不保证
    return {"guaranteed_turns": guaranteed, "probs": probs}


def calc_damage(a: dict, d: dict, move: dict, opt: dict) -> dict:
    # 防守方受击免疫类特性（引火/储水/避雷针等）：伤害为 0
    d_abil = d.get("ability") or ""
    mt = move.get("type_zh", "")
    immune = IMMUNE_ABILITIES.get(d_abil, ())
    if immune and mt in immune:
        eff0 = {"min": 0, "max": 0, "effectiveness": 0, "label": EFFECTIVENESS_LABEL[0],
                "hp": d["stats"]["hp"], "pct_min": 0, "pct_max": 0, "ohko": False,
                "rolls": [0], "ko": _ko_summary([0], d["stats"]["hp"], opt)}
        eff0["immune_by"] = d_abil
        return eff0
    return calc_damage_modern(a, d, move, opt)
