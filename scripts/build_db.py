"""Build data/poketools.db from the offline PokeAPI CSV dataset.

Source: git clone --depth 1 https://github.com/PokeAPI/pokeapi data/raw/pokeapi
CSV dir: data/raw/pokeapi/data/v2/csv

Language ids: 12 = zh-Hans, 9 = en.
Target Switch games (version group ids):
  20 sword-shield | 21 isle-of-armor | 22 crown-tundra
  24 legends-arceus
  25 scarlet-violet | 26 teal-mask | 27 indigo-disk
  30 legends-za | 32 mega-dimension
"""
from __future__ import annotations

import csv
import json
import sqlite3
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CSV_DIR = ROOT / "data" / "raw" / "pokeapi" / "data" / "v2" / "csv"
DB_PATH = ROOT / "data" / "poketools.db"

ZH, EN = 12, 9

STAT_IDS = {1: "hp", 2: "atk", 3: "def", 4: "spa", 5: "spd", 6: "spe"}
METHOD_IDS = {1: "level-up", 2: "egg", 3: "tutor", 4: "machine"}
DAMAGE_CLASS = {1: "status", 2: "physical", 3: "special"}

GAME_OF_VG = {
    20: "sword-shield", 21: "sword-shield", 22: "sword-shield",
    24: "legends-arceus",
    25: "scarlet-violet", 26: "scarlet-violet", 27: "scarlet-violet",
    30: "legends-za", 32: "legends-za",
}
TARGET_VGS = sorted(GAME_OF_VG)

GAMES = {
    "sword-shield":   {"name_zh": "剑／盾", "name_en": "Sword/Shield", "gen": 8, "has_breeding": 1, "has_tms": 1},
    "legends-arceus": {"name_zh": "传说 阿尔宙斯", "name_en": "Legends: Arceus", "gen": 8, "has_breeding": 0, "has_tms": 0},
    "scarlet-violet": {"name_zh": "朱／紫", "name_en": "Scarlet/Violet", "gen": 9, "has_breeding": 1, "has_tms": 1},
    "legends-za":     {"name_zh": "传说 Z-A", "name_en": "Legends: Z-A", "gen": 9, "has_breeding": 0, "has_tms": 1},
}

DEX_ZH = {
    "galar": "伽勒尔图鉴", "isle-of-armor": "铠岛图鉴", "crown-tundra": "王冠雪原图鉴",
    "hisui": "洗翠图鉴",
    "paldea": "帕底亚图鉴", "kitakami": "北上乡图鉴", "blueberry": "蓝莓图鉴",
    "lumiose-city": "密阿雷市图鉴", "hyperspace": "超空间图鉴",
}

FORM_SUFFIX_ZH = {
    "mega": "超级进化", "mega-x": "超级进化X", "mega-y": "超级进化Y",
    "gmax": "极巨化", "primal": "原始回归",
    "hisui": "洗翠的样子", "paldea": "帕底亚的样子", "galar": "伽勒尔的样子",
    "alola": "阿罗拉的样子", "hoenn": "丰缘的样子", "sinnoh": "神奥的样子",
    "unova": "合众的样子", "kalos": "卡洛斯的样子",
    "battle-bond": "羁绊变身", "ash": "卡璞·鸣鸣（阿ンロド）",
    "hero": "百战勇者", "hangry": "暴食形态", "gulping": "吞咽形态", "gorging": "饱腹形态",
    "ten-percent": "10%形态", "complete": "完全体形态", "ultra": "终极形态",
    "origin": "起源形态", "altered": "别种形态", "therian": "灵兽形态",
    "black": "酋雷姆（黑）", "white": "酋雷姆（白）", "ordinary": "普通形态",
    "resolute": "觉悟形态", "shield": "盾牌形态", "blade": "刀剑形态",
    "solar": "日光形态", "lunar": "月轮形态", "neutro": "中立形态",
    "core": "核心形态", "wellspring-mask": "水井面具", "hearthflame-mask": "火炉面具",
    "cornerstone-mask": "基石面具", "starter": "初始形态", "rapid-strike": "连击招式形态",
    "single-strike": "一击招式形态", "dusk-mane": "黄昏之鬃", "dawn-mane": "黎明之翼",
    "low-key": "低调的样子", "amped": "高调的样子", "noice": "低调的样子",
    "blade-forme": "刀剑形态", "shield-forme": "盾牌形态",
    "busted": "被打破的形态", "school": "结群形态", "solo": "凭形形态",
    "10-percent": "10%形态", "50-percent": "50%形态", "powerconstruct": "完全体形态",
    "active": "活性形态", "meteor": "流星形态", "core-forme": "核心形态",
    "electric": "电气形态", "fire": "火焰形态", "water": "水珠形态",
}

EGG_GROUP_ZH = {
    "monster": "怪兽", "water1": "水中1", "bug": "虫", "flying": "飞行",
    "ground": "陆上", "fairy": "妖精", "plant": "植物", "humanshape": "人形",
    "water3": "水中3", "mineral": "矿物", "indeterminate": "不定形", "water2": "水中2",
    "ditto": "百变怪", "dragon": "龙", "no-eggs": "未发现",
}


def read_csv(name: str) -> list[dict]:
    path = CSV_DIR / f"{name}.csv"
    if not path.exists():
        raise SystemExit(f"missing source csv: {path}")
    with path.open(encoding="utf-8", newline="") as f:
        return list(csv.DictReader(f))


def to_int(v):
    if v is None or v == "":
        return None
    return int(float(v))


def name_map(table: str, id_col: str, name_col: str = "name") -> tuple[dict, dict]:
    """Return ({id: zh}, {id: en}) name maps for a *_names csv."""
    zh, en = {}, {}
    for row in read_csv(table):
        lang = to_int(row["local_language_id"])
        if lang == ZH:
            zh[to_int(row[id_col])] = row[name_col]
        elif lang == EN:
            en[to_int(row[id_col])] = row[name_col]
    return zh, en


SCHEMA = """
PRAGMA journal_mode=WAL;

CREATE TABLE games (
  id TEXT PRIMARY KEY, name_zh TEXT, name_en TEXT, generation INTEGER,
  has_breeding INTEGER, has_tms INTEGER, sort INTEGER
);
CREATE TABLE regional_dexes (
  id TEXT PRIMARY KEY, game_id TEXT, name_zh TEXT, name_en TEXT, sort INTEGER
);
CREATE TABLE dex_entries (
  dex_id TEXT, ndex INTEGER, species_id INTEGER,
  PRIMARY KEY (dex_id, ndex)
);
CREATE TABLE species (
  id INTEGER PRIMARY KEY, identifier TEXT,
  name_zh TEXT, name_en TEXT, genus_zh TEXT,
  generation INTEGER, egg_groups TEXT, gender_rate INTEGER,
  capture_rate INTEGER, is_legendary INTEGER, is_mythical INTEGER,
  evolves_from INTEGER
);
CREATE TABLE forms (
  id INTEGER PRIMARY KEY, species_id INTEGER, identifier TEXT,
  form_label TEXT, is_default INTEGER, is_mega INTEGER,
  types TEXT, abilities TEXT,
  hp INTEGER, atk INTEGER, def INTEGER, spa INTEGER, spd INTEGER, spe INTEGER,
  ev_hp INTEGER, ev_atk INTEGER, ev_def INTEGER,
  ev_spa INTEGER, ev_spd INTEGER, ev_spe INTEGER,
  height INTEGER, weight INTEGER
);
CREATE TABLE moves (
  id INTEGER PRIMARY KEY, identifier TEXT,
  name_zh TEXT, name_en TEXT,
  type_zh TEXT, damage_class TEXT,
  power INTEGER, accuracy INTEGER, pp INTEGER, priority INTEGER,
  generation INTEGER, effect_zh TEXT
);
CREATE TABLE learnsets (
  form_id INTEGER, move_id INTEGER, method TEXT, vg INTEGER, level INTEGER
);
CREATE TABLE machines (
  vg INTEGER, machine_number INTEGER, move_id INTEGER, item_identifier TEXT
);
CREATE TABLE encounters (
  vg INTEGER, game_id TEXT, species_id INTEGER, form_id INTEGER,
  location_identifier TEXT, location_en TEXT,
  min_level INTEGER, max_level INTEGER,
  method TEXT, slot TEXT
);
CREATE TABLE move_flavor (
  move_id INTEGER PRIMARY KEY, text TEXT, lang TEXT
);
CREATE INDEX idx_learnsets_move ON learnsets (move_id, vg, method);
CREATE INDEX idx_learnsets_form ON learnsets (form_id, vg);
CREATE INDEX idx_enc_species ON encounters (vg, species_id);
CREATE INDEX idx_dex_species ON dex_entries (species_id);
"""


def main() -> None:
    if not CSV_DIR.exists():
        sys.exit("PokeAPI csv data not found. Run: git clone --depth 1 https://github.com/PokeAPI/pokeapi data/raw/pokeapi")

    # ---- reference tables ----
    vg_rows = {to_int(r["id"]): r for r in read_csv("version_groups")}
    vg_gen = {i: to_int(r["generation_id"]) for i, r in vg_rows.items()}

    pokedexes = {to_int(r["id"]): r for r in read_csv("pokedexes")}
    dex_prose_zh, dex_prose_en = {}, {}
    for r in read_csv("pokedex_prose"):
        lang = to_int(r["local_language_id"])
        d = to_int(r["pokedex_id"])
        if lang == ZH:
            dex_prose_zh[d] = r["name"]
        elif lang == EN:
            dex_prose_en[d] = r["name"]
    dex_vgs: dict[int, list[int]] = {}
    for r in read_csv("pokedex_version_groups"):
        dex_vgs.setdefault(to_int(r["pokedex_id"]), []).append(to_int(r["version_group_id"]))

    type_zh, type_en = name_map("type_names", "type_id")
    ability_zh, _ = name_map("ability_names", "ability_id")
    move_zh, move_en = name_map("move_names", "move_id")
    species_zh, species_en = name_map("pokemon_species_names", "pokemon_species_id")
    genus_zh = {}
    for r in read_csv("pokemon_species_names"):
        if to_int(r["local_language_id"]) == ZH and r["genus"]:
            genus_zh[to_int(r["pokemon_species_id"])] = r["genus"]

    item_ident = {to_int(r["id"]): r["identifier"] for r in read_csv("items")}
    stat_ident = {to_int(r["id"]): r["identifier"] for r in read_csv("stats")}

    # dex id by identifier, and vg->dex list restricted to our games
    dexes_for_vg: dict[int, list[int]] = {}
    for dex_id, vgs in dex_vgs.items():
        for vg in vgs:
            if vg in GAME_OF_VG:
                dexes_for_vg.setdefault(vg, []).append(dex_id)
    dex_ident = {i: pokedexes[i]["identifier"] for i in pokedexes}
    vg_dex_ident: dict[int, list[str]] = {}
    for vg, ids in dexes_for_vg.items():
        vg_dex_ident[vg] = sorted(dex_ident[i] for i in ids)

    # ---- species ----
    species_rows = {to_int(r["id"]): r for r in read_csv("pokemon_species")}
    egg_of_species: dict[int, set[str]] = {}
    for r in read_csv("pokemon_egg_groups"):
        eg = read_csv("egg_groups")
        break
    eg_ident = {to_int(r["id"]): r["identifier"] for r in eg}
    for r in read_csv("pokemon_egg_groups"):
        egg_of_species.setdefault(to_int(r["species_id"]), set()).add(
            EGG_GROUP_ZH.get(eg_ident[to_int(r["egg_group_id"])], eg_ident[to_int(r["egg_group_id"])]))

    # ---- forms (pokemon) ----
    pokemon_rows = {to_int(r["id"]): r for r in read_csv("pokemon")}
    form_meta = {to_int(r["pokemon_id"]): r for r in read_csv("pokemon_forms")}

    base_stats: dict[int, dict] = {}
    evs: dict[int, dict] = {}
    for r in read_csv("pokemon_stats"):
        pid = to_int(r["pokemon_id"])
        key = stat_ident.get(to_int(r["stat_id"]))
        if key in ("hp", "attack", "defense", "special-attack", "special-defense", "speed"):
            key = {"hp": "hp", "attack": "atk", "defense": "def", "special-attack": "spa",
                   "special-defense": "spd", "speed": "spe"}[key]
            base_stats.setdefault(pid, {})[key] = to_int(r["base_stat"])
            if to_int(r["effort"]):
                evs.setdefault(pid, {})[key] = to_int(r["effort"])

    types_of: dict[int, list[int]] = {}
    for r in read_csv("pokemon_types"):
        types_of.setdefault(to_int(r["pokemon_id"]), []).append(to_int(r["type_id"]))

    abils_of: dict[int, list[int]] = {}
    for r in read_csv("pokemon_abilities"):
        abils_of.setdefault(to_int(r["pokemon_id"]), []).append(to_int(r["ability_id"]))

    # ---- moves ----
    move_rows = {to_int(r["id"]): r for r in read_csv("moves")}

    flavor_zh: dict[int, str] = {}
    flavor_vg: dict[int, int] = {}
    for r in read_csv("move_flavor_text"):
        if to_int(r["language_id"]) != ZH:
            continue
        mid, vg = to_int(r["move_id"]), to_int(r["version_group_id"])
        if mid not in flavor_vg or vg > flavor_vg[mid]:
            flavor_zh[mid] = r["flavor_text"].replace("\n", " ").replace("\f", " ")
            flavor_vg[mid] = vg

    # ---- learnsets / machines (target games only) ----
    learn: list[tuple] = []
    for r in read_csv("pokemon_moves"):
        vg = to_int(r["version_group_id"])
        if vg not in GAME_OF_VG:
            continue
        mid = to_int(r["move_id"])
        if mid not in move_rows:
            continue
        method = METHOD_IDS.get(to_int(r["pokemon_move_method_id"]))
        level = to_int(r["level"])
        if method == "level-up" and level in (0, None):
            level = 1
        learn.append((to_int(r["pokemon_id"]), mid, method, vg, level))

    machine_rows = []
    for r in read_csv("machines"):
        vg = to_int(r["version_group_id"])
        if vg in GAME_OF_VG:
            machine_rows.append((vg, to_int(r["machine_number"]), to_int(r["move_id"]),
                                 item_ident.get(to_int(r["item_id"]), "")))

    # ---- encounters (target games only) ----
    versions = {to_int(r["id"]): to_int(r["version_group_id"]) for r in read_csv("versions")}
    area_ident = {to_int(r["id"]): r["identifier"] for r in read_csv("location_areas")}
    area_prose_en = {}
    for r in read_csv("location_area_prose"):
        if to_int(r["local_language_id"]) == EN:
            area_prose_en[to_int(r["location_area_id"])] = r["name"]
    enc_rows = []
    for r in read_csv("encounters"):
        vg = versions.get(to_int(r["version_id"]))
        if vg not in GAME_OF_VG:
            continue
        area = to_int(r["location_area_id"])
        enc_rows.append((
            vg, GAME_OF_VG[vg], to_int(r["pokemon_id"]), to_int(r["pokemon_id"]),
            area_ident.get(area, ""), area_prose_en.get(area, ""),
            to_int(r["min_level"]), to_int(r["max_level"]), "", ""))

    # ---- dex membership ----
    dex_rows = []
    seen_dexes: dict[str, dict] = {}
    for r in read_csv("pokemon_dex_numbers"):
        dex_id = to_int(r["pokedex_id"])
        ident = dex_ident.get(dex_id)
        if ident not in DEX_ZH:
            continue
        vg = dex_vgs.get(dex_id, [])
        game = GAME_OF_VG.get(vg[0]) if vg else None
        if game is None:
            continue
        dex_rows.append((ident, to_int(r["pokedex_number"]), to_int(r["species_id"])))
        if ident not in seen_dexes:
            seen_dexes[ident] = {"game": game, "id": dex_id}
    dex_order = {ident: i for i, ident in enumerate(seen_dexes)}

    # ---- write db ----
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    if DB_PATH.exists():
        DB_PATH.unlink()
    con = sqlite3.connect(DB_PATH)
    con.executescript(SCHEMA)

    con.executemany("INSERT INTO games VALUES (?,?,?,?,?,?,?)",
                    [(gid, g["name_zh"], g["name_en"], g["gen"], g["has_breeding"],
                      g["has_tms"], i) for i, (gid, g) in enumerate(GAMES.items())])

    for ident, info in seen_dexes.items():
        did = info["id"]
        con.execute("INSERT INTO regional_dexes VALUES (?,?,?,?,?)",
                    (ident, info["game"], DEX_ZH.get(ident, dex_prose_zh.get(did) or ident),
                     dex_prose_en.get(did) or ident, dex_order[ident]))

    con.executemany("INSERT INTO dex_entries VALUES (?,?,?)", dex_rows)

    sp_rows = []
    for sid, r in species_rows.items():
        sp_rows.append((
            sid, r["identifier"], species_zh.get(sid) or species_en.get(sid, r["identifier"]),
            species_en.get(sid, r["identifier"]), genus_zh.get(sid, ""),
            to_int(r["generation_id"]),
            ",".join(sorted(egg_of_species.get(sid, set()))),
            to_int(r["gender_rate"]), to_int(r["capture_rate"]),
            to_int(r["is_legendary"]), to_int(r["is_mythical"]),
            to_int(r["evolves_from_species_id"]) if r["evolves_from_species_id"] else None,
        ))
    con.executemany("INSERT INTO species VALUES (?,?,?,?,?,?,?,?,?,?,?,?)", sp_rows)

    form_rows = []
    for pid, r in pokemon_rows.items():
        sid = to_int(r["species_id"])
        meta = form_meta.get(pid, {})
        form_ident = meta.get("form_identifier", "") or ""
        label = FORM_SUFFIX_ZH.get(form_ident, form_ident)
        sp = base_stats.get(pid, {})
        ev = evs.get(pid, {})
        t_ids = types_of.get(pid, [])
        form_rows.append((
            pid, sid, r["identifier"], label,
            to_int(r["is_default"]) or 0,
            to_int(meta.get("is_mega")) or 0,
            ",".join(type_zh.get(t, type_en.get(t, str(t))) for t in t_ids),
            ",".join(filter(None, (ability_zh.get(a) for a in abils_of.get(pid, [])))),
            sp.get("hp"), sp.get("atk"), sp.get("def"), sp.get("spa"), sp.get("spd"), sp.get("spe"),
            ev.get("hp", 0), ev.get("atk", 0), ev.get("def", 0),
            ev.get("spa", 0), ev.get("spd", 0), ev.get("spe", 0),
            to_int(r["height"]), to_int(r["weight"]),
        ))
    con.executemany(
        "INSERT INTO forms VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)", form_rows)

    mv_rows = []
    for mid, r in move_rows.items():
        t = to_int(r["type_id"])
        mv_rows.append((
            mid, r["identifier"], move_zh.get(mid) or move_en.get(mid, r["identifier"]),
            move_en.get(mid, r["identifier"]),
            type_zh.get(t, type_en.get(t, "")), DAMAGE_CLASS.get(to_int(r["damage_class_id"]), ""),
            to_int(r["power"]), to_int(r["accuracy"]), to_int(r["pp"]), to_int(r["priority"]),
            to_int(r["generation_id"]), flavor_zh.get(mid, ""),
        ))
    con.executemany("INSERT INTO moves VALUES (?,?,?,?,?,?,?,?,?,?,?,?)", mv_rows)

    con.executemany("INSERT OR IGNORE INTO learnsets VALUES (?,?,?,?,?)", learn)
    con.executemany("INSERT OR IGNORE INTO machines VALUES (?,?,?,?)", machine_rows)
    con.executemany("INSERT OR IGNORE INTO encounters VALUES (?,?,?,?,?,?,?,?,?,?)", enc_rows)
    con.executemany("INSERT OR REPLACE INTO move_flavor VALUES (?,?,?)",
                    [(mid, t, "zh") for mid, t in flavor_zh.items()])

    con.commit()

    # ---- report ----
    for table in ("games", "regional_dexes", "dex_entries", "species", "forms",
                  "moves", "learnsets", "machines", "encounters"):
        n = con.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
        print(f"{table:15s} {n}")
    print("\nlearnsets per vg:")
    for vg, n in con.execute("SELECT vg, COUNT(*) FROM learnsets GROUP BY vg ORDER BY vg"):
        print(f"  vg{vg} {GAME_OF_VG[vg]:15s} {n}")
    print("\nencounters per vg:")
    for vg, n in con.execute("SELECT vg, COUNT(*) FROM encounters GROUP BY vg ORDER BY vg"):
        print(f"  vg{vg} {GAME_OF_VG[vg]:15s} {n}")
    print("\ndexes:")
    for row in con.execute("SELECT d.id, d.game_id, d.name_zh, COUNT(e.species_id) "
                           "FROM regional_dexes d LEFT JOIN dex_entries e ON e.dex_id=d.id "
                           "GROUP BY d.id ORDER BY d.sort"):
        print(f"  {row[0]:14s} {row[1]:14s} {row[2]}  {row[3]} species")
    con.close()
    print(f"\nOK -> {DB_PATH}")


if __name__ == "__main__":
    main()
