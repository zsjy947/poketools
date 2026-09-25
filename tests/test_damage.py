"""伤害计算器测试：以 Bulbapedia「Damage」页官方算例为基准向量。"""
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from app.services import damage  # noqa: E402


def _glaceon_garchomp_vector(crit=False):
    """75级冰伊布(攻击123) 冰牙(65物理冰,STAB) vs 163防烈咬陆鲨(龙/地) → 168~196。

    属性相性 4 倍；无其他修正；会心一击 ×1.5。
    """
    a = {"types": "冰", "level": 75, "stats": {"atk": 123, "def": 100, "spa": 200, "spd": 150, "spe": 100, "hp": 200},
         "item": "", "ability": "", "boosts": {}}
    d = {"types": "龙,地面", "level": 75, "stats": {"atk": 150, "def": 163, "spa": 100, "spd": 110, "spe": 102, "hp": 270},
         "item": "", "ability": "", "boosts": {}, "is_dynamax": False}
    move = {"name_zh": "冰牙", "identifier": "ice-fang", "type_zh": "冰",
            "damage_class": "physical", "power": 65}
    opt = {"crit": crit}
    return damage.calc_damage(a, d, move, opt)


def test_bulbapedia_official_vector():
    r = _glaceon_garchomp_vector()
    assert (r["min"], r["max"]) == (168, 196)
    assert r["effectiveness"] == 4
    assert len(r["rolls"]) == 16
    assert r["rolls"][0] == 168 and r["rolls"][-1] == 196


def test_critical_boost():
    r = _glaceon_garchomp_vector(crit=True)
    # Showdown 校准后语义: 会心作用于基础伤害(×1.5向下取整), 随机最先(floor),
    # STAB 为 4096 分数(pokeRound), 相性(floor)
    assert (r["min"], r["max"]) == (244, 292)


def test_immunity():
    a = {"types": "一般", "level": 50, "stats": {"atk": 100, "def": 100, "spa": 100, "spd": 100, "spe": 100, "hp": 100}, "item": "", "ability": "", "boosts": {}}
    d = {"types": "幽灵", "level": 50, "stats": {"atk": 100, "def": 100, "spa": 100, "spd": 100, "spe": 100, "hp": 100}, "item": "", "ability": "", "boosts": {}}
    move = {"name_zh": "破坏光线", "identifier": "hyper-beam", "type_zh": "一般", "damage_class": "special", "power": 150}
    r = damage.calc_damage(a, d, move, {})
    assert r["effectiveness"] == 0 and r["max"] == 0


def test_levitate_ground_immune():
    a = {"types": "地面", "level": 50, "stats": {"atk": 150, "def": 100, "spa": 100, "spd": 100, "spe": 100, "hp": 100}, "item": "", "ability": "", "boosts": {}}
    d = {"types": "超能力,飞行", "level": 50, "stats": {"atk": 100, "def": 100, "spa": 100, "spd": 100, "spe": 100, "hp": 100}, "item": "", "ability": "漂浮", "boosts": {}}
    move = {"name_zh": "地震", "identifier": "earthquake", "type_zh": "地面", "damage_class": "physical", "power": 100}
    r = damage.calc_damage(a, d, move, {})
    assert r["max"] == 0


def test_stat_calc():
    form = {"hp": 108, "atk": 130, "def": 95, "spa": 80, "spd": 85, "spe": 102}
    evs = {"hp": 0, "atk": 252, "def": 0, "spa": 0, "spd": 4, "spe": 252}
    ivs = {"hp": 31, "atk": 31, "def": 31, "spa": 31, "spd": 31, "spe": 31}
    nature = {"up": "atk", "down": "spa"}
    s = damage.calc_modern_stats(form, 50, nature, evs, ivs)
    # 烈咬陆鲨 50级 固执 252攻: int((int((2*130+31+63)*50/100)+5)*1.1) = 200
    assert s["hp"] == 183
    assert s["atk"] == 200
    assert s["spa"] == 90


def test_dynamax_hp_and_behemoth():
    a = {"types": "钢", "level": 100, "stats": {"atk": 200, "def": 150, "spa": 100, "spd": 150, "spe": 100, "hp": 100}, "item": "", "ability": "", "boosts": {}}
    d_normal = {"types": "龙", "level": 100, "stats": {"atk": 150, "def": 150, "spa": 100, "spd": 120, "spe": 100, "hp": 300}, "item": "", "ability": "", "boosts": {}}
    move = {"name_zh": "巨兽斩击", "identifier": "behemoth-blade", "type_zh": "钢", "damage_class": "physical", "power": 100}
    r1 = damage.calc_damage(a, d_normal, move, {})
    # 极巨化 HP×2 在能力值计算层完成；直接构造上下文时手动翻倍
    d_max = {**d_normal, "is_dynamax": True, "stats": {**d_normal["stats"], "hp": 600}}
    r2 = damage.calc_damage(a, d_max, move, {})
    assert r2["hp"] == 600
    # 巨兽系对极巨化 ×2（other 链 8192/4096）
    assert (r2["min"], r2["max"]) == (r1["min"] * 2, r1["max"] * 2)

def _vector(**opt_over):
    a = {"types": "火", "level": 50, "stats": {"atk": 150, "def": 100, "spa": 150, "spd": 100, "spe": 100, "hp": 160},
         "item": "", "ability": "", "boosts": {}}
    d = {"types": "钢", "level": 50, "stats": {"atk": 100, "def": 120, "spa": 100, "spd": 120, "spe": 90, "hp": 190},
         "item": "", "ability": "", "boosts": {}, "is_dynamax": False}
    move = {"name_zh": "百万吨重拳", "identifier": "mega-punch", "type_zh": "一般",
            "damage_class": "physical", "power": 80}
    opt = {}
    opt.update(opt_over)
    return damage.calc_damage(a, d, move, opt)


def test_burn_halves_physical():
    base = _vector()
    burned = _vector(burn=True)
    assert burned["max"] < base["max"]


def test_guts_burn_boost():
    base = _vector()
    guts = _vector(burn=True)
    guts_a = {"types": "火", "level": 50, "stats": {"atk": 150, "def": 100, "spa": 150, "spd": 100, "spe": 100, "hp": 160},
              "item": "", "ability": "毅力", "boosts": {}}
    d = {"types": "钢", "level": 50, "stats": {"atk": 100, "def": 120, "spa": 100, "spd": 120, "spe": 90, "hp": 190},
         "item": "", "ability": "", "boosts": {}, "is_dynamax": False}
    move = {"name_zh": "百万吨重拳", "identifier": "mega-punch", "type_zh": "一般",
            "damage_class": "physical", "power": 80}
    r = damage.calc_damage(guts_a, d, move, {"burn": True})
    assert r["max"] > base["max"]

def test_z_and_max_power_tables():
    assert damage.z_power(85) == 160 and damage.z_power(150) == 200
    assert damage.z_power(90, "hex") == 160          # 特例
    assert damage.max_power(90, "火") == 130         # 85-100 档
    assert damage.max_power(90, "格斗") == 90        # 格斗/毒独立档
    assert damage.max_power(120, "火") == 140        # 110-140 档


def test_tera_stab_and_defense():
    a = {"types": "一般", "level": 50, "stats": {"atk": 150, "def": 100, "spa": 150, "spd": 100, "spe": 100, "hp": 160},
         "item": "", "ability": "", "boosts": {}}
    d = {"types": "钢", "level": 50, "stats": {"atk": 100, "def": 120, "spa": 100, "spd": 120, "spe": 90, "hp": 190},
         "item": "", "ability": "", "boosts": {}, "is_dynamax": False}
    move = {"name_zh": "百万吨重拳", "identifier": "mega-punch", "type_zh": "一般",
            "damage_class": "physical", "power": 80}
    base = damage.calc_damage(a, d, move, {})
    tera_atk = damage.calc_damage({**a, "tera_type": "一般"}, d, move, {})
    assert tera_atk["max"] > base["max"]                    # 太晶 STAB
    tera_def = damage.calc_damage(a, {**d, "tera_type": "钢"}, move, {})
    assert tera_def["effectiveness"] == base["effectiveness"]  # 同属性太晶相性不变
    tera_def2 = damage.calc_damage(a, {**d, "tera_type": "幽灵"}, move, {})
    assert tera_def2["effectiveness"] == 0                     # 太晶幽灵免疫一般


def _vector_with(move_type="冰", power=65, identifier="test-move", **opt):
    a = {"types": "冰", "level": 75, "stats": {"atk": 123, "def": 100, "spa": 200, "spd": 150, "spe": 100, "hp": 200},
         "item": "", "ability": "", "boosts": {}}
    d = {"types": "龙,地面", "level": 75, "stats": {"atk": 150, "def": 163, "spa": 100, "spd": 110, "spe": 102, "hp": 270},
         "item": "", "ability": "", "boosts": {}, "is_dynamax": False}
    move = {"name_zh": "测试招式", "identifier": identifier, "type_zh": move_type,
            "damage_class": "physical", "power": power}
    return damage.calc_damage(a, d, move, opt)


def test_helping_hand_is_bp_mod():
    # 帮助是威力阶段修正（bpMods 6144/4096）：65×1.5=97.5，pokeRound 0.5 舍去 → 97
    base = _vector_with(power=65)
    helped = _vector_with(power=97)
    same = _vector_with(power=65, helping_hand=True)
    assert same["min"] == helped["min"] and same["max"] == helped["max"]
    assert same["max"] > base["max"]


def test_aurora_veil_like_screens():
    plain = _vector_with()
    veiled_no_crit = _vector_with(screen="aurora")
    assert veiled_no_crit["max"] < plain["max"]   # 极光幕减半（非会心）
    crit_plain = _vector_with(crit=True)
    crit_veiled = _vector_with(screen="aurora", crit=True)
    assert crit_veiled["max"] == crit_plain["max"]  # 会心无视壁


def test_grassy_terrain_only_quake_on_grounded():
    # 仅地震/跺脚、且防守方接地时威力减半（bpMods 2048/4096）
    base = _vector_with(move_type="地面", power=90, identifier="earthquake")
    grassy = _vector_with(move_type="地面", power=90, identifier="earthquake", terrain="grassy")
    expected = _vector_with(move_type="地面", power=45, identifier="earthquake")
    assert grassy["max"] == expected["max"] < base["max"]
    # 非地震/跺脚的地面招式不受影响（游戏机制仅作用此二者）
    other_move = _vector_with(move_type="地面", power=90, identifier="test-move", terrain="grassy")
    other_base = _vector_with(move_type="地面", power=90, identifier="test-move")
    assert other_move["max"] == other_base["max"]
    # 飞行系防守方接地判定：不受青草场地影响
    flying = damage.calc_damage(
        {"types": "冰", "level": 75, "stats": {"atk": 123, "def": 100, "spa": 200, "spd": 150, "spe": 100, "hp": 200},
         "item": "", "ability": "", "boosts": {}},
        {"types": "飞行", "level": 75, "stats": {"atk": 150, "def": 163, "spa": 100, "spd": 110, "spe": 102, "hp": 270},
         "item": "", "ability": "", "boosts": {}, "is_dynamax": False},
        {"name_zh": "地震", "identifier": "earthquake", "type_zh": "地面",
         "damage_class": "physical", "power": 90},
        {"terrain": "grassy"})
    flying_plain = damage.calc_damage(
        {"types": "冰", "level": 75, "stats": {"atk": 123, "def": 100, "spa": 200, "spd": 150, "spe": 100, "hp": 200},
         "item": "", "ability": "", "boosts": {}},
        {"types": "飞行", "level": 75, "stats": {"atk": 150, "def": 163, "spa": 100, "spd": 110, "spe": 102, "hp": 270},
         "item": "", "ability": "", "boosts": {}, "is_dynamax": False},
        {"name_zh": "地震", "identifier": "earthquake", "type_zh": "地面",
         "damage_class": "physical", "power": 90},
        {})
    assert flying["max"] == flying_plain["max"]


def test_harsh_weather_alias():
    sun = _vector_with(move_type="火", power=90, weather="sun")
    harsh = _vector_with(move_type="火", power=90, weather="harsh_sun")
    neutral = _vector_with(move_type="火", power=90)
    sand = _vector_with(move_type="火", power=90, weather="sand")
    assert harsh["max"] == sun["max"] > neutral["max"]
    assert sand["max"] == neutral["max"]        # 沙暴不影响伤害数值
