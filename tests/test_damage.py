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
    opt = {"formula": "modern", "crit": crit}
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
    r = damage.calc_damage(a, d, move, {"formula": "modern"})
    assert r["effectiveness"] == 0 and r["max"] == 0


def test_levitate_ground_immune():
    a = {"types": "地面", "level": 50, "stats": {"atk": 150, "def": 100, "spa": 100, "spd": 100, "spe": 100, "hp": 100}, "item": "", "ability": "", "boosts": {}}
    d = {"types": "超能力,飞行", "level": 50, "stats": {"atk": 100, "def": 100, "spa": 100, "spd": 100, "spe": 100, "hp": 100}, "item": "", "ability": "漂浮", "boosts": {}}
    move = {"name_zh": "地震", "identifier": "earthquake", "type_zh": "地面", "damage_class": "physical", "power": 100}
    r = damage.calc_damage(a, d, move, {"formula": "modern"})
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
    r1 = damage.calc_damage(a, d_normal, move, {"formula": "modern"})
    # 极巨化 HP×2 在能力值计算层完成；直接构造上下文时手动翻倍
    d_max = {**d_normal, "is_dynamax": True, "stats": {**d_normal["stats"], "hp": 600}}
    r2 = damage.calc_damage(a, d_max, move, {"formula": "modern"})
    assert r2["hp"] == 600
    # 巨兽系对极巨化 ×2（other 链 8192/4096）
    assert (r2["min"], r2["max"]) == (r1["min"] * 2, r1["max"] * 2)


def test_pla_formula():
    a = {"types": "岩石", "level": 50, "stats": {"atk": 180, "def": 100, "spa": 100, "spd": 100, "spe": 100, "hp": 100}, "item": "", "ability": "", "boosts": {}}
    d = {"types": "火,飞行", "level": 50, "stats": {"atk": 100, "def": 120, "spa": 100, "spd": 100, "spe": 100, "hp": 160}, "item": "", "ability": "", "boosts": {}}
    move = {"name_zh": "岩崩", "identifier": "rock-slide", "type_zh": "岩石", "damage_class": "physical", "power": 75}
    r = damage.calc_damage(a, d, move, {"formula": "pla"})
    # 公式: floor(((100+A+15L)*P/(D+50)/5)) * roll * STAB1.25 * eff4，全程向下取整
    base = int((100 + 180 + 15 * 50) * 75 / (120 + 50) / 5)  # 90
    assert r["min"] == max(int(int(base * 0.85) * 1.25) * 4, 1)   # 380
    assert r["max"] == max(int(int(base * 1.00) * 1.25) * 4, 1)   # 448
