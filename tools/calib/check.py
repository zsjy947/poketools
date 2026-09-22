"""双引擎数值比对：自研 damage.py vs Pokémon Showdown @smogon/calc。

先运行 node harness.mjs > smogon_baseline.json 生成基准，再运行 python check.py。
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT))

from app.db import static_conn  # noqa: E402
from app.services import damage  # noqa: E402

SID = {"Garchomp": 445, "Snorlax": 143, "Charizard": 6, "Hariyama": 297,
       "Glaceon": 471, "Gyarados": 130, "Rotom-Wash": 479}
MOVE_EN = {"Earthquake": "地震", "Flamethrower": "喷射火焰", "Hydro Pump": "水炮",
           "Close Combat": "近身战", "Fire Punch": "火焰拳", "Freeze-Dry": "冷冻干燥"}
EV0 = {"hp": 0, "atk": 0, "def": 0, "spa": 0, "spd": 0, "spe": 0}
IV = {"hp": 31, "atk": 31, "def": 31, "spa": 31, "spd": 31, "spe": 31}

CASES = [
    {"key": "eq_basic",
     "atk": {"sp": "Garchomp", "level": 50, "nature": "adamant", "evs": {"atk": 252}},
     "def": {"sp": "Snorlax", "level": 50, "nature": "careful"},
     "move": "Earthquake"},
    {"key": "flamethrower",
     "atk": {"sp": "Charizard", "level": 50, "nature": "modest", "evs": {"spa": 252}},
     "def": {"sp": "Garchomp", "level": 50, "nature": "careful"},
     "move": "Flamethrower"},
    {"key": "eq_crit_lo",
     "atk": {"sp": "Garchomp", "level": 50, "nature": "adamant", "evs": {"atk": 252}, "item": "生命宝珠"},
     "def": {"sp": "Snorlax", "level": 50, "nature": "careful"},
     "move": "Earthquake", "crit": True},
    {"key": "rain_hydro",
     "atk": {"sp": "Garchomp", "level": 50, "nature": "modest", "evs": {"spa": 252}},
     "def": {"sp": "Snorlax", "level": 50, "nature": "careful", "evs": {"hp": 252}},
     "move": "Hydro Pump", "weather": "rain"},
    {"key": "guts_burn_cc",
     "atk": {"sp": "Hariyama", "level": 50, "nature": "adamant", "evs": {"atk": 252},
             "ability": "毅力", "burn": True},
     "def": {"sp": "Snorlax", "level": 50, "nature": "careful"},
     "move": "Close Combat"},
    {"key": "scarf_punch_sun",
     "atk": {"sp": "Garchomp", "level": 100, "nature": "adamant", "evs": {"atk": 252}, "item": "讲究头带"},
     "def": {"sp": "Snorlax", "level": 100, "nature": "bold", "evs": {"def": 252, "hp": 252}},
     "move": "Fire Punch", "weather": "sun"},
    {"key": "freeze_dry",
     "atk": {"sp": "Glaceon", "level": 50, "nature": "modest", "evs": {"spa": 252}},
     "def": {"sp": "Gyarados", "level": 50, "nature": "careful"},
     "move": "Freeze-Dry"},
    {"key": "levitate_immune",
     "atk": {"sp": "Garchomp", "level": 50, "nature": "adamant", "evs": {"atk": 252}},
     "def": {"sp": "Rotom-Wash", "level": 50, "nature": "bold", "ability": "漂浮"},
     "move": "Earthquake"},
]


def assemble(con, side, is_atk):
    sp = con.execute(
        "SELECT f.*, s.name_en FROM forms f JOIN species s ON s.id=f.species_id "
        "WHERE f.species_id=? AND f.is_default=1", (SID[side["sp"]],)).fetchone()
    nature = con.execute("SELECT up, down FROM natures WHERE identifier=?",
                         (side["nature"],)).fetchone()
    evs = dict(EV0)
    evs.update(side.get("evs") or {})
    item = side.get("item", "")
    choice = {"讲究头带": "讲究头带", "讲究眼镜": "讲究眼镜"}.get(item, "")
    stats = damage.calc_modern_stats(sp, side["level"], dict(nature), evs, IV,
                                     choice_item=choice)
    if side.get("burn") and side.get("ability") == "毅力":
        stats["atk"] = damage.rnd_half_down(stats["atk"] * 1.5)
    return {"types": sp["types"], "level": side["level"], "stats": stats,
            "item": item, "ability": side.get("ability", ""), "boosts": {}}


def main():
    baseline = {c["key"]: c for c in json.load(
        open(Path(__file__).parent / "smogon_baseline.json", encoding="utf-8"))}
    con = static_conn()
    all_ok = True
    for case in CASES:
        a = assemble(con, case["atk"], True)
        d = assemble(con, case["def"], False)
        mv = con.execute("SELECT * FROM moves WHERE name_zh=?",
                         (MOVE_EN[case["move"]],)).fetchone()
        r = damage.calc_damage(a, d, dict(mv), {
            "formula": "modern", "crit": case.get("crit", False),
            "weather": case.get("weather", ""),
        })
        ref = baseline[case["key"]]["damage"]
        mine = r["rolls"]
        if isinstance(ref, int):  # 免疫时 smogon 返回单个数
            ref_rolls = [ref]
        else:
            ref_rolls = list(ref)
        ok = mine == ref_rolls
        all_ok &= ok
        stat_ok = (r["hp"] == baseline[case["key"]]["defHp"])
        print(f"[{'PASS' if ok and stat_ok else 'DIFF'}] {case['key']:18s} "
              f"mine={mine[0]}~{mine[-1]} ref={ref_rolls[0]}~{ref_rolls[-1]} "
              f"hp mine={r['hp']} ref={baseline[case['key']]['defHp']}")
        if not ok:
            print(f"        mine rolls: {mine}")
            print(f"        ref  rolls: {ref_rolls}")
    con.close()
    print("\nALL PASS" if all_ok else "\nHAS DIFF — 检查取整/修正链顺序")


if __name__ == "__main__":
    main()
