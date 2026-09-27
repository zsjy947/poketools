"""双引擎数值比对：自研 damage.py vs Pokémon Showdown @smogon/calc。

先运行 node harness.mjs > smogon_baseline.json 生成基准，再运行 python check.py。
改公式后必须重跑（AGENTS 铁律）。
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT))

from app.db import static_conn  # noqa: E402
from app.services import damage  # noqa: E402

SID = {"Garchomp": 445, "Snorlax": 143, "Charizard": 6, "Hariyama": 297,
       "Glaceon": 471, "Gyarados": 130, "Rotom-Wash": 10009, "Gardevoir": 282,
       "Gigalith": 526, "Dragonite": 149, "Shuckle": 213, "Chansey": 113,
       "Corviknight": 823, "Raichu-Alola": 10100}
MOVE_EN = {"Earthquake": "地震", "Flamethrower": "喷射火焰", "Hydro Pump": "水炮",
           "Close Combat": "近身战", "Fire Punch": "火焰拳", "Freeze-Dry": "冷冻干燥",
           "Psychic": "精神强念", "Draco Meteor": "流星群", "Thunderbolt": "十万伏特",
           "Energy Ball": "能量球", "Steel Wing": "钢翼", "Moonblast": "月亮之力",
           "Crunch": "咬碎", "Dragon Claw": "龙爪", "Air Slash": "空气斩",
           "Stone Edge": "尖石攻击", "Rock Blast": "岩石爆击", "Giga Impact": "终极冲击",
           "Surf": "冲浪", "Focus Blast": "真气弹"}
EV0 = {"hp": 0, "atk": 0, "def": 0, "spa": 0, "spd": 0, "spe": 0}
IV = {"hp": 31, "atk": 31, "def": 31, "spa": 31, "spd": 31, "spe": 31}

CASES = [
    # ---- 原有 10 案例 ----
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
    {"key": "helping_hand_eq",
     "atk": {"sp": "Garchomp", "level": 50, "nature": "adamant", "evs": {"atk": 252}},
     "def": {"sp": "Snorlax", "level": 50, "nature": "careful"},
     "move": "Earthquake", "helping_hand": True},
    {"key": "grassy_terrain_eq",
     "atk": {"sp": "Garchomp", "level": 50, "nature": "adamant", "evs": {"atk": 252}},
     "def": {"sp": "Snorlax", "level": 50, "nature": "careful"},
     "move": "Earthquake", "terrain": "grassy"},
    {"key": "levitate_immune",
     "atk": {"sp": "Garchomp", "level": 50, "nature": "adamant", "evs": {"atk": 252}},
     "def": {"sp": "Rotom-Wash", "level": 50, "nature": "bold", "ability": "漂浮"},
     "move": "Earthquake"},

    # ---- 五期：天气防御 ----
    {"key": "snow_ice_def",
     "atk": {"sp": "Garchomp", "level": 50, "nature": "adamant", "evs": {"atk": 252}},
     "def": {"sp": "Glaceon", "level": 50, "nature": "bold", "evs": {"def": 252}},
     "move": "Earthquake", "weather": "snow"},
    {"key": "sand_rock_spd",
     "atk": {"sp": "Charizard", "level": 50, "nature": "modest", "evs": {"spa": 252}},
     "def": {"sp": "Gigalith", "level": 50, "nature": "calm"},
     "move": "Flamethrower", "weather": "sand"},

    # ---- 五期：场地 ----
    {"key": "psychic_terrain",
     "atk": {"sp": "Gardevoir", "level": 50, "nature": "modest", "evs": {"spa": 252}},
     "def": {"sp": "Snorlax", "level": 50, "nature": "careful"},
     "move": "Psychic", "terrain": "psychic"},
    {"key": "misty_terrain_dragon",
     "atk": {"sp": "Garchomp", "level": 50, "nature": "modest", "evs": {"spa": 252}},
     "def": {"sp": "Snorlax", "level": 50, "nature": "careful"},
     "move": "Draco Meteor", "terrain": "misty"},
    {"key": "electric_terrain",
     "atk": {"sp": "Charizard", "level": 50, "nature": "modest", "evs": {"spa": 252}},
     "def": {"sp": "Snorlax", "level": 50, "nature": "careful"},
     "move": "Thunderbolt", "terrain": "electric"},
    {"key": "grassy_boost_grass",
     "atk": {"sp": "Charizard", "level": 50, "nature": "modest", "evs": {"spa": 252}},
     "def": {"sp": "Snorlax", "level": 50, "nature": "careful"},
     "move": "Energy Ball", "terrain": "grassy"},

    # ---- 五期：双打 / 友防 ----
    {"key": "doubles_spread_eq",
     "atk": {"sp": "Garchomp", "level": 50, "nature": "adamant", "evs": {"atk": 252}},
     "def": {"sp": "Snorlax", "level": 50, "nature": "careful"},
     "move": "Earthquake", "mode": "doubles"},
    {"key": "doubles_screen",
     "atk": {"sp": "Garchomp", "level": 50, "nature": "adamant", "evs": {"atk": 252}},
     "def": {"sp": "Snorlax", "level": 50, "nature": "careful"},
     "move": "Earthquake", "mode": "doubles", "screen": "reflect"},
    {"key": "friend_guard",
     "atk": {"sp": "Garchomp", "level": 50, "nature": "adamant", "evs": {"atk": 252}},
     "def": {"sp": "Snorlax", "level": 50, "nature": "careful"},
     "move": "Earthquake", "friend_guard": True},

    # ---- 五期：友方辅助 ----
    {"key": "steely_spirit",
     "atk": {"sp": "Corviknight", "level": 50, "nature": "adamant", "evs": {"atk": 252}},
     "def": {"sp": "Snorlax", "level": 50, "nature": "careful"},
     "move": "Steel Wing", "steely_spirit": True},
    {"key": "battery_special",
     "atk": {"sp": "Charizard", "level": 50, "nature": "modest", "evs": {"spa": 252}},
     "def": {"sp": "Snorlax", "level": 50, "nature": "careful"},
     "move": "Flamethrower", "battery": True},
    {"key": "power_spot",
     "atk": {"sp": "Garchomp", "level": 50, "nature": "adamant", "evs": {"atk": 252}},
     "def": {"sp": "Snorlax", "level": 50, "nature": "careful"},
     "move": "Earthquake", "power_spot": True},

    # ---- 五期：气场 ----
    {"key": "fairy_aura",
     "atk": {"sp": "Gardevoir", "level": 50, "nature": "modest", "evs": {"spa": 252}},
     "def": {"sp": "Snorlax", "level": 50, "nature": "careful"},
     "move": "Moonblast", "auras": {"fairy": True}},
    {"key": "dark_aura_break",
     "atk": {"sp": "Garchomp", "level": 50, "nature": "adamant", "evs": {"atk": 252}},
     "def": {"sp": "Snorlax", "level": 50, "nature": "careful"},
     "move": "Crunch", "auras": {"dark": True, "break": True}},

    # ---- 五期：四灾兽 ----
    {"key": "ruin_sword_def",
     "atk": {"sp": "Garchomp", "level": 50, "nature": "adamant", "evs": {"atk": 252}},
     "def": {"sp": "Snorlax", "level": 50, "nature": "careful"},
     "move": "Earthquake", "ruin": {"sword": True}},
    {"key": "ruin_beads_spd",
     "atk": {"sp": "Charizard", "level": 50, "nature": "modest", "evs": {"spa": 252}},
     "def": {"sp": "Snorlax", "level": 50, "nature": "careful"},
     "move": "Flamethrower", "ruin": {"beads": True}},
    {"key": "ruin_tablets_atk",
     "atk": {"sp": "Garchomp", "level": 50, "nature": "adamant", "evs": {"atk": 252}},
     "def": {"sp": "Snorlax", "level": 50, "nature": "careful"},
     "move": "Earthquake", "ruin": {"tablets": True}},
    {"key": "ruin_vessel_spa",
     "atk": {"sp": "Charizard", "level": 50, "nature": "modest", "evs": {"spa": 252}},
     "def": {"sp": "Snorlax", "level": 50, "nature": "careful"},
     "move": "Flamethrower", "ruin": {"vessel": True}},

    # ---- 五期：花之礼 / 多鳞片+钉子 ----
    {"key": "flower_gift_sun",
     "atk": {"sp": "Garchomp", "level": 50, "nature": "adamant", "evs": {"atk": 252}},
     "def": {"sp": "Snorlax", "level": 50, "nature": "careful"},
     "move": "Earthquake", "weather": "sun", "flower_gift": True},
    {"key": "multiscale_sr",
     "atk": {"sp": "Garchomp", "level": 50, "nature": "adamant", "evs": {"atk": 252}},
     "def": {"sp": "Dragonite", "level": 50, "nature": "careful", "ability": "多重鳞片"},
     "move": "Dragon Claw", "hazards": {"rocks": True}},
    {"key": "multiscale_full",
     "atk": {"sp": "Garchomp", "level": 50, "nature": "adamant", "evs": {"atk": 252}},
     "def": {"sp": "Dragonite", "level": 50, "nature": "careful", "ability": "多重鳞片"},
     "move": "Dragon Claw"},

    # ---- 五期：星晶 / 防守太晶 ----
    {"key": "stellar_stab_orig",
     "atk": {"sp": "Garchomp", "level": 50, "nature": "adamant", "evs": {"atk": 252},
             "tera_type": "星晶"},
     "def": {"sp": "Snorlax", "level": 50, "nature": "careful"},
     "move": "Earthquake"},
    {"key": "stellar_stab_nonorig",
     "atk": {"sp": "Garchomp", "level": 50, "nature": "adamant", "evs": {"atk": 252},
             "tera_type": "星晶"},
     "def": {"sp": "Snorlax", "level": 50, "nature": "careful"},
     "move": "Stone Edge"},
    {"key": "def_tera_weak_shift",
     "atk": {"sp": "Charizard", "level": 50, "nature": "modest", "evs": {"spa": 252}},
     "def": {"sp": "Snorlax", "level": 50, "nature": "careful", "tera_type": "格斗"},
     "move": "Air Slash"},
    {"key": "def_tera_immune_gone",
     "atk": {"sp": "Garchomp", "level": 50, "nature": "adamant", "evs": {"atk": 252}},
     "def": {"sp": "Gyarados", "level": 50, "nature": "careful", "tera_type": "龙"},
     "move": "Earthquake"},
    {"key": "def_tera_stellar_keep",
     "atk": {"sp": "Garchomp", "level": 50, "nature": "adamant", "evs": {"atk": 252}},
     "def": {"sp": "Gyarados", "level": 50, "nature": "careful", "tera_type": "星晶"},
     "move": "Earthquake"},
    {"key": "atk_tera_stab",
     "atk": {"sp": "Garchomp", "level": 50, "nature": "adamant", "evs": {"atk": 252},
             "tera_type": "龙"},
     "def": {"sp": "Snorlax", "level": 50, "nature": "careful"},
     "move": "Dragon Claw"},

    # ---- 五期：空间 / 重力 ----
    {"key": "gravity_eq_flying",
     "atk": {"sp": "Garchomp", "level": 50, "nature": "adamant", "evs": {"atk": 252}},
     "def": {"sp": "Gyarados", "level": 50, "nature": "careful"},
     "move": "Earthquake", "gravity": True},
    {"key": "wonder_room_special",
     "atk": {"sp": "Charizard", "level": 50, "nature": "modest", "evs": {"spa": 252}},
     "def": {"sp": "Shuckle", "level": 50, "nature": "bold", "evs": {"def": 252}},
     "move": "Flamethrower", "wonder_room": True},
    {"key": "magic_room_lo",
     "atk": {"sp": "Garchomp", "level": 50, "nature": "adamant", "evs": {"atk": 252}, "item": "生命宝珠"},
     "def": {"sp": "Snorlax", "level": 50, "nature": "careful"},
     "move": "Earthquake", "magic_room": True},

    # ---- 五期：背心 / 进化奇石 / 会心升降 ----
    {"key": "assault_vest",
     "atk": {"sp": "Charizard", "level": 50, "nature": "modest", "evs": {"spa": 252}},
     "def": {"sp": "Snorlax", "level": 50, "nature": "careful", "item": "突击背心"},
     "move": "Flamethrower"},
    {"key": "eviolite_chansey",
     "atk": {"sp": "Charizard", "level": 50, "nature": "modest", "evs": {"spa": 252}},
     "def": {"sp": "Chansey", "level": 50, "nature": "calm", "evs": {"hp": 252}, "item": "进化奇石"},
     "move": "Focus Blast"},
    {"key": "crit_ignores_def_boost",
     "atk": {"sp": "Garchomp", "level": 50, "nature": "adamant", "evs": {"atk": 252}},
     "def": {"sp": "Snorlax", "level": 50, "nature": "careful", "boosts": {"def": 2}},
     "move": "Earthquake", "crit": True},
    {"key": "def_boost_nocrit",
     "atk": {"sp": "Garchomp", "level": 50, "nature": "adamant", "evs": {"atk": 252}},
     "def": {"sp": "Snorlax", "level": 50, "nature": "careful", "boosts": {"def": 2}},
     "move": "Earthquake"},

    # ---- 五期：Z / 极巨 ----
    {"key": "z_generic_eq",
     "atk": {"sp": "Garchomp", "level": 50, "nature": "adamant", "evs": {"atk": 252}},
     "def": {"sp": "Snorlax", "level": 50, "nature": "careful"},
     "move": "Earthquake", "z_move": True, "z_generic_only": True},
    {"key": "z_generic_giga",
     "atk": {"sp": "Snorlax", "level": 50, "nature": "adamant", "evs": {"atk": 252}},
     "def": {"sp": "Snorlax", "level": 50, "nature": "careful"},
     "move": "Giga Impact", "z_move": True, "z_generic_only": True},
    {"key": "max_eq",
     "atk": {"sp": "Garchomp", "level": 50, "nature": "adamant", "evs": {"atk": 252},
             "is_dynamax": True},
     "def": {"sp": "Snorlax", "level": 50, "nature": "careful"},
     "move": "Earthquake", "max_move": True},
    {"key": "max_rock_blast",
     "atk": {"sp": "Garchomp", "level": 50, "nature": "adamant", "evs": {"atk": 252},
             "is_dynamax": True},
     "def": {"sp": "Snorlax", "level": 50, "nature": "careful"},
     "move": "Rock Blast", "max_move": True},
    {"key": "max_fighting",
     "atk": {"sp": "Garchomp", "level": 50, "nature": "adamant", "evs": {"atk": 252},
             "is_dynamax": True},
     "def": {"sp": "Snorlax", "level": 50, "nature": "careful"},
     "move": "Close Combat", "max_move": True},

    # ---- 五期：特性免疫 ----
    {"key": "flash_fire_immune",
     "atk": {"sp": "Charizard", "level": 50, "nature": "modest", "evs": {"spa": 252}},
     "def": {"sp": "Snorlax", "level": 50, "nature": "careful", "ability": "引火"},
     "move": "Flamethrower"},
    {"key": "water_absorb_immune",
     "atk": {"sp": "Garchomp", "level": 50, "nature": "modest", "evs": {"spa": 252}},
     "def": {"sp": "Snorlax", "level": 50, "nature": "careful", "ability": "储水"},
     "move": "Surf"},
]


def assemble(con, side, is_atk):
    sid = SID[side["sp"]]
    sp = con.execute(
        "SELECT f.*, s.id AS sid, s.name_en FROM forms f JOIN species s ON s.id=f.species_id "
        "WHERE f.id=? OR (f.species_id=? AND f.is_default=1) "
        "ORDER BY CASE WHEN f.id=? THEN 0 ELSE 1 END LIMIT 1", (sid, sid, sid)).fetchone()
    nature = con.execute("SELECT up, down FROM natures WHERE identifier=?",
                         (side["nature"],)).fetchone()
    evs = dict(EV0)
    evs.update(side.get("evs") or {})
    item = side.get("item", "")
    choice = {"讲究头带": "讲究头带", "讲究眼镜": "讲究眼镜"}.get(item, "")
    stats = damage.calc_modern_stats(sp, side["level"], dict(nature), evs, IV,
                                     choice_item=choice,
                                     dynamax=bool(side.get("is_dynamax")))
    if side.get("burn") and side.get("ability") == "毅力":
        stats["atk"] = damage.rnd_half_down(stats["atk"] * 1.5)
    return {"types": sp["types"], "level": side["level"], "stats": stats,
            "item": item, "ability": side.get("ability", ""),
            "boosts": side.get("boosts") or {},
            "tera_type": side.get("tera_type", ""),
            "form_identifier": sp["identifier"],
            "is_dynamax": bool(side.get("is_dynamax")),
            "species_id": sp["sid"],
            "can_evolve": bool(con.execute(
                "SELECT 1 FROM evolutions WHERE from_species=? LIMIT 1",
                (sp["sid"],)).fetchone())}


def main():
    raw = json.load(open(Path(__file__).parent / "smogon_baseline.json", encoding="utf-8"))
    baseline = {c["key"]: c for c in raw["cases"]}
    con = static_conn()
    all_ok = True
    for case in CASES:
        a = assemble(con, case["atk"], True)
        d = assemble(con, case["def"], False)
        mv = con.execute("SELECT * FROM moves WHERE name_zh=?",
                         (MOVE_EN[case["move"]],)).fetchone()
        opt = {k: case.get(k) for k in
               ("crit", "weather", "terrain", "helping_hand", "mode", "screen",
                "friend_guard", "steely_spirit", "battery", "power_spot", "auras",
                "ruin", "flower_gift", "hazards", "gravity", "magic_room",
                "wonder_room", "burn", "max_move", "z_move")
               if case.get(k) is not None}
        # 钉子先扣 → 多鳞片失效
        if case.get("hazards"):
            opt["defender_full_hp"] = False
        # 专属 Z 映射（(species+招式) 命中 → 固定威力/分类）；z_generic_only 强制走泛用换算
        if case.get("z_move") and not case.get("z_generic_only"):
            row = con.execute(
                "SELECT * FROM z_exclusive WHERE base_move_id=? AND species_id=?",
                (mv["id"], a["species_id"])).fetchone()
            if row is not None and row["power"] is not None:
                ok_form = (not row["form_suffix"]
                           or a["form_identifier"].endswith("-" + row["form_suffix"]))
                if ok_form:
                    opt["z_exclusive"] = {"name": row["z_move_name"], "power": row["power"]}
        r = damage.calc_damage(a, d, dict(mv), opt)
        ref = baseline[case["key"]]["damage"]
        mine = r["rolls"]
        ref_rolls = [ref] if isinstance(ref, int) else list(ref)
        ok = mine == ref_rolls
        stat_ok = (r["hp"] == baseline[case["key"]]["defHp"])
        all_ok &= ok and stat_ok
        print(f"[{'PASS' if ok and stat_ok else 'DIFF'}] {case['key']:24s} "
              f"mine={mine[0]}~{mine[-1]} ref={ref_rolls[0]}~{ref_rolls[-1]} "
              f"hp mine={r['hp']} ref={baseline[case['key']]['defHp']}")
        if not ok:
            print(f"        mine rolls: {mine}")
            print(f"        ref  rolls: {ref_rolls}")

    # ---- Z/极巨威力表对拍（smogon data.zMove/maxMove basePower vs 自研换算表） ----
    EN2ZH = {"Tackle": "撞击", "Quick Attack": "电光一闪", "Wing Attack": "翅膀攻击",
             "Body Slam": "泰山压顶", "Bite": "咬住", "Water Pulse": "水之波动",
             "Acid": "溶解液", "Mud-Slap": "掷泥", "Rock Throw": "落石",
             "Twineedle": "双针", "Lick": "舌舔", "Metal Claw": "金属爪",
             "Ember": "火花", "Water Gun": "水枪", "Vine Whip": "藤鞭",
             "Spark": "电光", "Confusion": "念力", "Powder Snow": "细雪",
             "Dragon Breath": "龙息", "Iron Head": "铁头", "Disarming Voice": "魅惑之声",
             "Hyper Beam": "破坏光线", "Giga Impact": "终极冲击", "Earthquake": "地震",
             "Flamethrower": "喷射火焰", "Surf": "冲浪", "Close Combat": "近身战",
             "Rock Blast": "岩石爆击", "Bullet Seed": "种子机关枪", "Icicle Spear": "冰锥",
             "Double Kick": "二连踢", "Bonemerang": "骨头回力镖", "Water Shuriken": "飞水手里剑",
             "Surging Strikes": "水流连打", "Triple Axel": "三旋击", "Fire Blast": "大字爆炎",
             "Draco Meteor": "流星群", "Weather Ball": "气象球", "Hex": "祸不单行",
             "Giga Drain": "终极吸取", "V-create": "Ｖ热焰"}
    print("\n--- Z/极巨威力表 ---")
    for en, info in raw["zTable"].items():
        zh = EN2ZH.get(en)
        if not zh:
            continue
        mv = con.execute("SELECT * FROM moves WHERE name_zh=?", (zh,)).fetchone()
        if mv is None:
            print(f"[MISS] {en}({zh}) 不在 moves 表")
            all_ok = False
            continue
        ok = True
        if info["z"] is not None:
            mine_z = damage.z_power(mv["power"] or 0, mv["identifier"])
            ok &= mine_z == info["z"]
            if not ok:
                print(f"[DIFF] {en}({zh}) bp={info['bp']} z mine={mine_z} ref={info['z']}")
        if info["max"] is not None:
            mine_max = damage.max_power(mv["power"] or 0, mv["type_zh"], mv["identifier"])
            ok &= mine_max == info["max"]
            if not ok:
                print(f"[DIFF] {en}({zh}) bp={info['bp']} max mine={mine_max} ref={info['max']}")
        if not ok:
            all_ok = False
    print("威力表 OK" if all_ok else "威力表 HAS DIFF")
    con.close()
    print("\nALL PASS" if all_ok else "\nHAS DIFF — 检查取整/修正链顺序")


if __name__ == "__main__":
    main()
