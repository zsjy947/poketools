"""Build data/poketools.db from the offline PokeAPI CSV dataset.

Source: git clone --depth 1 https://github.com/PokeAPI/pokeapi data/raw/pokeapi
CSV dir: data/raw/pokeapi/data/v2/csv

Language ids: 12 = zh-Hans, 9 = en.
Target Switch games (version group ids):
  20 sword-shield | 21 isle-of-armor | 22 crown-tundra
  23 brilliant-diamond-shining-pearl
  24 legends-arceus
  25 scarlet-violet | 26 teal-mask | 27 indigo-disk
  30 legends-za | 31 mega-dimension（Z-A 异次元 DLC）
  注意：vg32 是 Pokémon Champions 的数据（method=train），不是 Z-A，勿导入；
  Z-A 学习集由 scrape_52poke.py 补齐写入 vg30（52poke 主源 + PokemonDB 兜底）。
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


def require_rows(con: sqlite3.Connection, table: str, min_rows: int, source: str) -> None:
    """curated 装载护栏（P0-5）：curated 损坏/缺字段时 executemany 会静默写入
    少量/零行 → 应用读不到数据且构建无告警；低于下限即中止构建（fail fast）。"""
    n = con.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
    if n < min_rows:
        raise SystemExit(
            f"  !! {table} 装载后仅 {n} 行（<{min_rows}）：{source} 数据异常，中止构建")

ZH, EN = 12, 9

STAT_IDS = {1: "hp", 2: "atk", 3: "def", 4: "spa", 5: "spd", 6: "spe"}
METHOD_IDS = {1: "level-up", 2: "egg", 3: "tutor", 4: "machine"}
DAMAGE_CLASS = {1: "status", 2: "physical", 3: "special"}

GAME_OF_VG = {
    20: "sword-shield", 21: "sword-shield", 22: "sword-shield",
    23: "brilliant-diamond-shining-pearl",
    24: "legends-arceus",
    25: "scarlet-violet", 26: "scarlet-violet", 27: "scarlet-violet",
    30: "legends-za", 31: "legends-za",
}
# learnsets 只导真正有 pokemon_moves 数据的 vg（Z-A 由 scrape_52poke.py 补进 vg30）
LEARNSET_VGS = (20, 23, 24, 25, 30)
# machines：SV 的 vg26/27 与 vg25 同号同招式（重复），剑盾 DLC 无新增，只导主版本组；
# Z-A 的 vg31（异次元 DLC）= TM108-160，52poke 的 Z-A 招式表已引用这些编号，必须导入
MACHINE_VGS = (20, 23, 25, 30, 31)

GAMES = {
    "sword-shield":   {"name_zh": "剑／盾", "name_en": "Sword/Shield", "gen": 8, "has_breeding": 1, "has_tms": 1,
                       "features": ["dex", "ev", "curry"]},
    "brilliant-diamond-shining-pearl": {"name_zh": "晶灿钻石／明亮珍珠", "name_en": "Brilliant Diamond/Shining Pearl",
                       "gen": 8, "has_breeding": 1, "has_tms": 1, "features": ["dex", "ev"]},
    "legends-arceus": {"name_zh": "传说 阿尔宙斯", "name_en": "Legends: Arceus", "gen": 8, "has_breeding": 0, "has_tms": 0,
                       "features": ["dex", "ev"]},
    "scarlet-violet": {"name_zh": "朱／紫", "name_en": "Scarlet/Violet", "gen": 9, "has_breeding": 1, "has_tms": 1,
                       "features": ["dex", "ev", "sandwich"]},
    "legends-za":     {"name_zh": "传说 Z-A", "name_en": "Legends: Z-A", "gen": 9, "has_breeding": 0, "has_tms": 1,
                       "features": ["dex", "ev", "donut"]},
}

DEX_ZH = {
    "galar": "伽勒尔图鉴", "isle-of-armor": "铠岛图鉴", "crown-tundra": "王冠雪原图鉴",
    "sinnoh": "神奥图鉴",
    "hisui": "洗翠图鉴",
    "paldea": "帕底亚图鉴", "kitakami": "北上乡图鉴", "blueberry": "蓝莓图鉴",
    "lumiose-city": "密阿雷市图鉴", "hyperspace": "超空间图鉴",
}

# pokedex identifier -> our dex id（original-sinnoh=DP/BDSP 神奥图鉴 151 只）
DEX_ID_MAP = {"original-sinnoh": "sinnoh"}
# 手工指定图鉴归属游戏（覆盖 vg 推断）：BDSP 图鉴同 DP 的 151 只（白金 extended-sinnoh=210 不属于 BDSP，勿用）
DEX_GAME_OVERRIDE = {"sinnoh": "brilliant-diamond-shining-pearl"}
DEX_ORDER = ["galar", "isle-of-armor", "crown-tundra", "sinnoh", "hisui",
             "paldea", "kitakami", "blueberry", "lumiose-city", "hyperspace"]

FORM_SUFFIX_ZH = {
    "mega": "超级进化", "mega-x": "超级进化X", "mega-y": "超级进化Y",
    "gmax": "超极巨化", "primal": "原始回归",
    "hisui": "洗翠的样子", "paldea": "帕底亚的样子", "galar": "伽勒尔的样子",
    "alola": "阿罗拉的样子", "hoenn": "丰缘的样子", "sinnoh": "神奥的样子",
    "unova": "合众的样子", "kalos": "卡洛斯的样子",
    "battle-bond": "羁绊变身", "ash": "羁绊变身",
    "hero": "全能形态", "hangry": "暴食形态", "gulping": "吞咽形态", "gorging": "饱腹形态",
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

# 宝可梦体型（pokemon_species.shape_id 1-14；52poke 信息框 body 参数中文名）
SHAPE_ZH = {
    1: "球形", 2: "蛇形", 3: "鱼形", 4: "双手形", 5: "柱形", 6: "双足兽形",
    7: "双腿形", 8: "四足兽形", 9: "双翅形", 10: "触手形", 11: "组合形",
    12: "人形", 13: "多翅形", 14: "虫形",
}

# 招式目标（move_targets.csv）：双打扩散招式标记，双打伤害 ×0.75
# 9=all-other-pokemon(smogon allAdjacent，如地震/冲浪/大爆炸) / 11=all-opponents / 14=all-pokemon
SPREAD_TARGET_IDS = (9, 11, 14)


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
  has_breeding INTEGER, has_tms INTEGER, features TEXT, sort INTEGER
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
  evolves_from INTEGER,
  shape_zh TEXT
);
CREATE TABLE forms (
  id INTEGER PRIMARY KEY, species_id INTEGER, identifier TEXT,
  form_label TEXT, is_default INTEGER, is_mega INTEGER,
  types TEXT, abilities TEXT, hidden_abilities TEXT,
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
  generation INTEGER, effect_zh TEXT,
  is_spread INTEGER
);
CREATE TABLE learnsets (
  form_id INTEGER, move_id INTEGER, method TEXT, vg INTEGER, level INTEGER,
  mastery INTEGER
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
-- 以下为 52poke 抓取/人工整理数据（scrape_52poke.py 填充，build_db.py 建空表）
CREATE TABLE get_methods (
  species_id INTEGER, game TEXT, version_label TEXT,
  location TEXT, method TEXT, note TEXT,
  form TEXT
);
-- 特性（id/名称来自 PokeAPI；intro/effect/extra 由 scrape_52poke 从 52poke 抓取填充）
CREATE TABLE abilities (
  ability_id INTEGER PRIMARY KEY, name_zh TEXT,
  intro TEXT, effect TEXT, extra TEXT
);
-- 全量道具（PokeAPI items + 注入的 Z 纯晶；identifier 供图标路径）
CREATE TABLE items (
  id INTEGER PRIMARY KEY, identifier TEXT, name_zh TEXT
);
-- 地区形态分支进化链（人工 curated：evo_branches.json；family_key = 根物种 id）
CREATE TABLE evo_branches (
  family_key TEXT, species_id INTEGER, form_suffix TEXT,
  branch TEXT
);
-- 图鉴默认展示形态覆盖（dex_default_forms.json 人工增补 + 按可用性自动派生）
CREATE TABLE dex_default_forms (
  dex_id TEXT, species_id INTEGER, form_id INTEGER,
  PRIMARY KEY (dex_id, species_id)
);
-- 形态 × 游戏可用性（form_game_availability.json；未收录形态默认全游戏可见）
CREATE TABLE form_game_availability (
  form_id INTEGER, game_id TEXT,
  PRIMARY KEY (form_id, game_id)
);
-- 专属 Z 招式映射（z_moves.json curated；(species+原始招式) → 专属 Z）
CREATE TABLE z_exclusive (
  crystal_identifier TEXT, species_id INTEGER, form_suffix TEXT,
  base_move_id INTEGER, z_move_name TEXT, power INTEGER, damage_class TEXT,
  note TEXT
);
-- 泛用 Z 招式名（z_moves.json generic；属性 → Z 招式官方名 + 对应纯晶）
CREATE TABLE z_generic (
  type TEXT, z_move_name TEXT, crystal_identifier TEXT, crystal_id INTEGER
);
-- 超极巨专属招式（gmax_moves.json curated；gmax 形态 → 超极巨招式官方名，power 仅存 160 特判）
CREATE TABLE gmax_moves (
  species_id INTEGER, form_identifier TEXT, gmax_move_name TEXT,
  type_zh TEXT, power INTEGER
);
-- 二期伤害计算器数据
CREATE TABLE learnsets_all (
  form_id INTEGER, move_id INTEGER, method TEXT, vg INTEGER
);
CREATE INDEX idx_la_species ON learnsets_all (form_id, move_id);
CREATE INDEX idx_la_move ON learnsets_all (move_id);
CREATE TABLE natures (
  id INTEGER PRIMARY KEY, identifier TEXT, name_zh TEXT,
  up TEXT, down TEXT
);
CREATE TABLE vgs (
  id INTEGER PRIMARY KEY, identifier TEXT, gen INTEGER
);
CREATE TABLE dex_flavor (
  species_id INTEGER, game TEXT, version_label TEXT, text TEXT
);
CREATE TABLE form_flavor (          -- 形态独立图鉴介绍（地区形态/洛托姆换装等，默认形态走 dex_flavor）
  form_id INTEGER, game TEXT, version_label TEXT, text TEXT
);
CREATE TABLE tm_how (
  vg INTEGER, machine_number INTEGER, move_id INTEGER,
  how TEXT, materials TEXT, PRIMARY KEY (vg, machine_number)
);
CREATE TABLE sandwiches (
  no INTEGER PRIMARY KEY, name TEXT, ingredients TEXT,
  seasonings TEXT, effects TEXT, how TEXT
);
-- 三期：游戏特化功能
CREATE TABLE picnic_items (          -- 三明治食材/调味料（含获取方式）
  name TEXT PRIMARY KEY, kind TEXT, desc TEXT, how TEXT, price TEXT
);
CREATE TABLE donut_types (           -- Z-A 基础甜甜圈（按风味）
  flavor TEXT PRIMARY KEY, name TEXT, desc TEXT
);
CREATE TABLE special_donuts (        -- Z-A 特殊甜甜圈配方
  name TEXT PRIMARY KEY, desc TEXT,
  sweet INTEGER, spicy INTEGER, sour INTEGER, bitter INTEGER, fresh INTEGER,
  ingredients TEXT, power TEXT, target TEXT, rift TEXT, location TEXT
);
CREATE TABLE berries (               -- 树果（Z-A 甜甜圈效果表）
  name TEXT PRIMARY KEY,
  sweet INTEGER, spicy INTEGER, sour INTEGER, bitter INTEGER, fresh INTEGER,
  boost TEXT, energy INTEGER
);
CREATE TABLE flavor_powers (         -- 风味力量说明
  flavor TEXT, power TEXT, effect TEXT,
  lv1 TEXT, lv2 TEXT, lv3 TEXT, prefix TEXT
);
CREATE TABLE curries (               -- 咖喱图鉴
  no INTEGER PRIMARY KEY, name TEXT, key_ingredient TEXT, desc TEXT
);
CREATE TABLE evolutions (            -- 进化条件（PokeAPI pokemon_evolution）
  from_species INTEGER, to_species INTEGER, trigger TEXT,
  min_level INTEGER, item TEXT, held_item TEXT, time_of_day TEXT,
  location TEXT, known_move TEXT, min_happiness INTEGER, min_affection INTEGER,
  needs_overworld_rain INTEGER, turn_upside_down INTEGER,
  relative_physical_stats INTEGER,    -- 攻防关系 1/0/-1（小拳石系）
  party_species TEXT, party_type TEXT, trade_species TEXT, known_move_type TEXT,
  gender TEXT, region TEXT,           -- 性别限定 / 地区限定（中文，空=无）
  near_special_rock INTEGER,          -- 特殊岩石附近（1=苔藓 2=冰岩，按进化目标区分）
  min_beauty INTEGER, needs_multiplayer INTEGER,
  min_move_count INTEGER, min_steps INTEGER, min_damage_taken INTEGER,
  nature_bitmask TEXT,                -- 性格位掩码（ToStricity）
  PRIMARY KEY (from_species, to_species, trigger)
);
CREATE INDEX idx_learnsets_move ON learnsets (move_id, vg, method);
CREATE INDEX idx_learnsets_form ON learnsets (form_id, vg);
CREATE INDEX idx_enc_species ON encounters (vg, species_id);
CREATE INDEX idx_dex_species ON dex_entries (species_id);
CREATE INDEX idx_gm_species ON get_methods (species_id);
"""


def main() -> None:
    if not CSV_DIR.exists():
        sys.exit("PokeAPI csv data not found. Run: git clone --depth 1 https://github.com/PokeAPI/pokeapi data/raw/pokeapi")

    # ---- reference tables ----
    vg_rows = {to_int(r["id"]): r for r in read_csv("version_groups")}

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
    eg_ident = {to_int(r["id"]): r["identifier"] for r in read_csv("egg_groups")}
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

    abils_of: dict[int, list[tuple[int, int]]] = {}
    for r in read_csv("pokemon_abilities"):
        abils_of.setdefault(to_int(r["pokemon_id"]), []).append(
            (to_int(r["ability_id"]), to_int(r["is_hidden"]) or 0))

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
        if vg not in LEARNSET_VGS:
            continue
        mid = to_int(r["move_id"])
        if mid not in move_rows:
            continue
        method = METHOD_IDS.get(to_int(r["pokemon_move_method_id"]))
        level = to_int(r["level"])
        # level=0 保留原语义：朱紫等「进化时学会」（强制改 1 会丢失「进化」标注）
        learn.append((to_int(r["pokemon_id"]), mid, method, vg, level, None))

    machine_rows = []
    for r in read_csv("machines"):
        vg = to_int(r["version_group_id"])
        if vg in MACHINE_VGS:
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
        pid = to_int(r["pokemon_id"])
        sid = to_int(pokemon_rows[pid]["species_id"]) if pid in pokemon_rows else pid
        enc_rows.append((
            vg, GAME_OF_VG[vg], sid, pid,
            area_ident.get(area, ""), area_prose_en.get(area, ""),
            to_int(r["min_level"]), to_int(r["max_level"]), "", ""))

    # ---- dex membership ----
    dex_rows = []
    seen_dexes: dict[str, dict] = {}
    for r in read_csv("pokemon_dex_numbers"):
        dex_id = to_int(r["pokedex_id"])
        ident = DEX_ID_MAP.get(dex_ident.get(dex_id), dex_ident.get(dex_id))
        if ident not in DEX_ZH:
            continue
        vg = dex_vgs.get(dex_id, [])
        game = DEX_GAME_OVERRIDE.get(ident)
        if game is None:
            game = next((GAME_OF_VG[v] for v in vg if v in GAME_OF_VG), None)
        if game is None:
            continue
        dex_rows.append((ident, to_int(r["pokedex_number"]), to_int(r["species_id"])))
        if ident not in seen_dexes:
            seen_dexes[ident] = {"game": game, "id": dex_id}
    dex_order = {ident: i for i, ident in enumerate(DEX_ORDER)}

    # ---- learnsets_all（全世代，供伤害计算器招式并集） ----
    learn_all: list[tuple] = []
    for r in read_csv("pokemon_moves"):
        m = METHOD_IDS.get(to_int(r["pokemon_move_method_id"]))
        if m:
            learn_all.append((to_int(r["pokemon_id"]), to_int(r["move_id"]),
                              m, to_int(r["version_group_id"])))

    # ---- natures ----
    stat_key = {1: "hp", 2: "atk", 3: "def", 4: "spa", 5: "spd", 6: "spe"}
    nature_zh = {}
    for r in read_csv("nature_names"):
        if to_int(r["local_language_id"]) == ZH:
            nature_zh[to_int(r["nature_id"])] = r["name"]
    nature_rows = []
    for r in read_csv("natures"):
        nid = to_int(r["id"])
        up = stat_key.get(to_int(r["increased_stat_id"]))
        down = stat_key.get(to_int(r["decreased_stat_id"]))
        nature_rows.append((nid, r["identifier"],
                            nature_zh.get(nid, r["identifier"]),
                            up if up != down else None,
                            down if up != down else None))

    # ---- write db ----
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    if DB_PATH.exists():
        DB_PATH.unlink()
    con = sqlite3.connect(DB_PATH)
    con.row_factory = sqlite3.Row
    con.executescript(SCHEMA)
    con.executemany("INSERT OR IGNORE INTO learnsets_all VALUES (?,?,?,?)", learn_all)
    con.executemany("INSERT OR REPLACE INTO natures VALUES (?,?,?,?,?)", nature_rows)
    con.executemany("INSERT OR REPLACE INTO vgs VALUES (?,?,?)",
                    [(to_int(r["id"]), r["identifier"], to_int(r["generation_id"]))
                     for r in vg_rows.values()])

    con.executemany("INSERT INTO games VALUES (?,?,?,?,?,?,?,?)",
                    [(gid, g["name_zh"], g["name_en"], g["gen"], g["has_breeding"],
                      g["has_tms"], json.dumps(g["features"], ensure_ascii=False), i)
                     for i, (gid, g) in enumerate(GAMES.items())])

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
            SHAPE_ZH.get(to_int(r["shape_id"]) or 0, ""),
        ))
    con.executemany("INSERT INTO species VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)", sp_rows)

    form_rows = []
    skipped_mega_z = 0
    for pid, r in pokemon_rows.items():
        sid = to_int(r["species_id"])
        meta = form_meta.get(pid, {})
        form_ident = meta.get("form_identifier", "") or ""
        # 脏数据：*-mega-z 三形态（10307/10309/10310， PokeAPI 建模错误）不入库
        if "-mega-z" in r["identifier"]:
            skipped_mega_z += 1
            continue
        label = FORM_SUFFIX_ZH.get(form_ident, form_ident)
        sp = base_stats.get(pid, {})
        ev = evs.get(pid, {})
        t_ids = types_of.get(pid, [])
        abil_list = [(ability_zh.get(a, str(a)), hidden) for a, hidden in abils_of.get(pid, [])]
        form_rows.append((
            pid, sid, r["identifier"], label,
            to_int(r["is_default"]) or 0,
            to_int(meta.get("is_mega")) or 0,
            ",".join(type_zh.get(t, type_en.get(t, str(t))) for t in t_ids),
            ",".join(n for n, _ in abil_list),
            ",".join(n for n, h in abil_list if h),
            sp.get("hp"), sp.get("atk"), sp.get("def"), sp.get("spa"), sp.get("spd"), sp.get("spe"),
            ev.get("hp", 0), ev.get("atk", 0), ev.get("def", 0),
            ev.get("spa", 0), ev.get("spd", 0), ev.get("spe", 0),
            to_int(r["height"]), to_int(r["weight"]),
        ))
    con.executemany(
        "INSERT INTO forms VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)", form_rows)
    if skipped_mega_z:
        print(f"  skipped {skipped_mega_z} dirty *-mega-z forms")

    mv_rows = []
    for mid, r in move_rows.items():
        t = to_int(r["type_id"])
        mv_rows.append((
            mid, r["identifier"], move_zh.get(mid) or move_en.get(mid, r["identifier"]),
            move_en.get(mid, r["identifier"]),
            type_zh.get(t, type_en.get(t, "")), DAMAGE_CLASS.get(to_int(r["damage_class_id"]), ""),
            to_int(r["power"]), to_int(r["accuracy"]), to_int(r["pp"]), to_int(r["priority"]),
            to_int(r["generation_id"]), flavor_zh.get(mid, ""),
            1 if to_int(r["target_id"]) in SPREAD_TARGET_IDS else 0,
        ))
    con.executemany("INSERT INTO moves VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)", mv_rows)

    # ---- 全量道具（缺中文名的条目不入库；Z 纯晶由 z_moves.json 注入） ----
    item_zh_all, _ = name_map("item_names", "item_id")
    item_rows = [(iid, ident, item_zh_all.get(iid) or "")
                 for iid, ident in item_ident.items() if item_zh_all.get(iid)]
    z_file = ROOT / "data" / "curated" / "z_moves.json"
    if z_file.exists():
        zdata = json.loads(z_file.read_text(encoding="utf-8"))
        for g in zdata.get("generic", []):
            item_rows.append((900000 + g["crystal_id"], g["crystal_identifier"], g["crystal_name"]))
        for x in zdata.get("exclusive", []):
            item_rows.append((900100 + x["crystal_id"], x["crystal_identifier"], x["crystal_name"]))
        con.executemany(
            "INSERT OR REPLACE INTO z_exclusive VALUES (?,?,?,?,?,?,?,?)",
            [(x["crystal_identifier"], x["species_id"], x.get("form_suffix", ""),
              x["base_move_id"], x["z_move_name"], x.get("power"), x.get("damage_class", ""),
              x.get("note", ""))
             for x in zdata.get("exclusive", [])])
        require_rows(con, "z_exclusive", 20, z_file.name)
        con.executemany(
            "INSERT OR REPLACE INTO z_generic VALUES (?,?,?,?)",
            [(g["type"], g["z_move_name"], g["crystal_identifier"], g["crystal_id"])
             for g in zdata.get("generic", [])])
        require_rows(con, "z_generic", 18, z_file.name)
    # 超极巨专属招式（52poke curated；forms 表 34 个 *-gmax 形态一一对应）
    gmax_file = ROOT / "data" / "curated" / "gmax_moves.json"
    if gmax_file.exists():
        gmax = json.loads(gmax_file.read_text(encoding="utf-8"))
        con.executemany(
            "INSERT OR REPLACE INTO gmax_moves VALUES (?,?,?,?,?)",
            [(m["species_id"], m["form_identifier"], m["gmax_move_name"],
              m["type_zh"], m.get("power"))
             for m in gmax.get("moves", [])])
        require_rows(con, "gmax_moves", 34, gmax_file.name)
    item_rows.sort(key=lambda r: r[0])
    con.executemany("INSERT OR REPLACE INTO items VALUES (?,?,?)", item_rows)

    # ---- 特性表（名称层；intro/effect/extra 由 scrape_52poke 抓取填充） ----
    ability_ident = {to_int(r["id"]): r["identifier"] for r in read_csv("abilities")}
    con.executemany(
        "INSERT OR IGNORE INTO abilities (ability_id, name_zh) VALUES (?,?)",
        [(aid, ability_zh.get(aid) or ability_ident.get(aid, str(aid)))
         for aid in sorted(ability_ident)])

    con.executemany("INSERT OR IGNORE INTO learnsets VALUES (?,?,?,?,?,?)", learn)
    con.executemany("INSERT OR IGNORE INTO machines VALUES (?,?,?,?)", machine_rows)
    con.executemany("INSERT OR IGNORE INTO encounters VALUES (?,?,?,?,?,?,?,?,?,?)", enc_rows)
    con.executemany("INSERT OR REPLACE INTO move_flavor VALUES (?,?,?)",
                    [(mid, t, "zh") for mid, t in flavor_zh.items()])

    # 种族图鉴描述（PokeAPI 简中仅覆盖到剑盾，新游戏由 52poke 补充）
    ver_ident = {to_int(r["id"]): r["identifier"] for r in read_csv("versions")}
    ver_label = {"sword": ("sword-shield", "剑"), "shield": ("sword-shield", "盾"),
                 "legends-arceus": ("legends-arceus", "洗翠"),
                 "scarlet": ("scarlet-violet", "朱"), "violet": ("scarlet-violet", "紫"),
                 "legends-za": ("legends-za", "Z-A")}
    for r in read_csv("pokemon_species_flavor_text"):
        if to_int(r["language_id"]) != ZH:
            continue
        lab = ver_label.get(ver_ident.get(to_int(r["version_id"])))
        if lab:
            txt = r["flavor_text"].replace("\n", " ").replace("\f", " ")
            con.execute("INSERT OR IGNORE INTO dex_flavor VALUES (?,?,?,?)",
                        (to_int(r["species_id"]), lab[0], lab[1], txt))

    # ---- evolutions（进化条件）----
    evo_trigger = {to_int(r["id"]): r["identifier"]
                   for r in read_csv("evolution_triggers")}
    item_zh, _ = name_map("item_names", "item_id")
    location_zh, _ = name_map("location_names", "location_id")
    region_zh, _ = name_map("region_names", "region_id")
    evo_rows = []
    for r in read_csv("pokemon_evolution"):
        to_sid = to_int(r["evolved_species_id"])
        frm = to_int(species_rows[to_sid]["evolves_from_species_id"]) \
            if to_sid in species_rows and species_rows[to_sid]["evolves_from_species_id"] else None
        evo_rows.append((
            frm,
            to_sid,
            evo_trigger.get(to_int(r["evolution_trigger_id"]), ""),
            to_int(r["minimum_level"]),
            item_zh.get(to_int(r["trigger_item_id"]) or 0, ""),
            item_zh.get(to_int(r["held_item_id"]) or 0, ""),
            r["time_of_day"] or "",
            location_zh.get(to_int(r["location_id"]) or 0, ""),
            move_zh.get(to_int(r["known_move_id"]) or 0, ""),
            to_int(r["minimum_happiness"]),
            to_int(r["minimum_affection"]),
            to_int(r["needs_overworld_rain"]) or 0,
            to_int(r["turn_upside_down"]) or 0,
            # 冷门条件：攻击与防御关系 / 队伍条件 / 交换对象 / 性别与地区限定等
            (None if r["relative_physical_stats"] == "" else to_int(r["relative_physical_stats"])),
            species_zh.get(to_int(r["party_species_id"]) or 0, ""),
            type_zh.get(to_int(r["party_type_id"]) or 0, ""),
            species_zh.get(to_int(r["trade_species_id"]) or 0, ""),
            type_zh.get(to_int(r["known_move_type_id"]) or 0, ""),
            {1: "雌性", 2: "雄性"}.get(to_int(r["gender_id"]) or 0, ""),
            region_zh.get(to_int(r["region_id"]) or 0, ""),
            to_int(r["near_special_rock"]) or None,
            to_int(r["minimum_beauty"]) or None,
            to_int(r["needs_multiplayer"]) or 0,
            to_int(r["minimum_move_count"]) or None,
            to_int(r["minimum_steps"]) or None,
            to_int(r["minimum_damage_taken"]) or None,
            r["nature_bitmask"] or "",
        ))
    con.executemany("INSERT OR REPLACE INTO evolutions VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)", evo_rows)

    # ---- 形态 × 游戏可用性（curated 配置：mega/gmax/primal 名单 + 地区形态逐作核实） ----
    fga_file = ROOT / "data" / "curated" / "form_game_availability.json"
    fga_rows: list[tuple] = []
    if fga_file.exists():
        fga = json.loads(fga_file.read_text(encoding="utf-8"))
        # 兜底规则：mega→名单+所属游戏（Z-A，含异次元）、gmax→剑盾、primal→Z-A、地区形态→逐作名单
        rules: list[tuple[str, list[int], list[str]]] = []   # (suffix, species_ids, games)
        mega_cfg = fga.get("mega", {})
        if mega_cfg.get("games"):
            rules.append(("mega", mega_cfg.get("species", []),
                          mega_cfg["games"] if isinstance(mega_cfg["games"], list)
                          else [mega_cfg["games"]]))
        for suffix in ("gmax", "primal"):
            games = fga.get(suffix, [])
            if games:
                all_sp = [r[0] for r in con.execute(
                    "SELECT DISTINCT species_id FROM forms WHERE identifier LIKE '%-'||?", (suffix,))]
                rules.append((suffix, all_sp, games))
        for game, by_suffix in fga.get("regional", {}).items():
            for suffix, sids in by_suffix.items():
                rules.append((suffix, sids, [game]))
        for sid_suffix, games in fga.get("special", {}).items():
            sid, suffix = sid_suffix.split(":", 1)
            row = con.execute(
                "SELECT id FROM forms WHERE species_id=? AND identifier LIKE '%-'||?",
                (int(sid), suffix)).fetchone()
            if row:
                for g in games:
                    fga_rows.append((row[0], g))
        for fid_suffix in fga.get("hidden", []):
            sid, suffix = fid_suffix.split(":", 1)
            row = con.execute(
                "SELECT id FROM forms WHERE species_id=? AND identifier LIKE '%-'||?",
                (int(sid), suffix)).fetchone()
            if row:
                # 隐藏形态：哨兵 game='-' 标记受限且无任何游戏可用
                fga_rows.append((row[0], "-"))
        for suffix, sids, games in rules:
            for sid in sids:
                if suffix == "mega":
                    q = "SELECT id FROM forms WHERE species_id=? AND (is_mega=1 OR identifier LIKE '%-mega%')"
                    args = (sid,)
                else:
                    q = "SELECT id FROM forms WHERE species_id=? AND identifier LIKE '%-'||?"
                    args = (sid, suffix)
                for f in con.execute(q, args).fetchall():
                    for g in games:
                        fga_rows.append((f[0], g))
        con.executemany("INSERT OR REPLACE INTO form_game_availability VALUES (?,?)", fga_rows)
        require_rows(con, "form_game_availability", 150, fga_file.name)

        # ---- 图鉴默认形态：按可用性自动派生（同图鉴成员 + 该游戏可用的形态） ----
        REGION_PREF = {"sword-shield": ["galar", "alola", "hisui", "paldea"],
                       "legends-arceus": ["hisui", "alola"],
                       "scarlet-violet": ["paldea", "galar", "alola", "hisui"],
                       "legends-za": ["galar", "hisui", "alola", "paldea"]}
        dex_region = {"galar": "galar", "isle-of-armor": "galar", "crown-tundra": "galar",
                      "hisui": "hisui", "paldea": "paldea", "kitakami": "paldea",
                      "blueberry": "paldea"}
        suffix_of = {}
        for f in con.execute("SELECT id, species_id, identifier, is_default FROM forms"):
            if f["is_default"]:
                continue
            _, _, suf = f["identifier"].rpartition("-")
            suffix_of[f["id"]] = (f["species_id"], suf)
        avail: dict[int, set[str]] = {}
        for fid, g in con.execute("SELECT form_id, game_id FROM form_game_availability"):
            avail.setdefault(fid, set()).add(g)
        ddf_rows: list[tuple] = []
        for dex, game in con.execute("SELECT id, game_id FROM regional_dexes").fetchall():
            pref = REGION_PREF.get(game, [])
            region = dex_region.get(dex, "")
            for e in con.execute(
                    "SELECT species_id FROM dex_entries WHERE dex_id=?", (dex,)).fetchall():
                sid = e["species_id"]
                cands = [(fid, suf) for fid, (s2, suf) in suffix_of.items() if s2 == sid
                         and game in avail.get(fid, set())
                         and suf not in ("gmax", "mega", "primal", "mega-x", "mega-y")]
                if not cands:
                    continue
                pick = None
                cand_sufs = {s for _, s in cands}
                if region in cand_sufs:
                    pick = next(f for f, s in cands if s == region)
                else:
                    for p in pref:
                        if p in cand_sufs:
                            pick = next(f for f, s in cands if s == p)
                            break
                if pick is None and len(cands) == 1:
                    pick = cands[0][0]
                if pick is not None:
                    ddf_rows.append((dex, sid, pick))
        # 人工增补/覆盖（curated dex_default_forms.json，优先生效）
        ddf_file = ROOT / "data" / "curated" / "dex_default_forms.json"
        if ddf_file.exists():
            manual = json.loads(ddf_file.read_text(encoding="utf-8"))
            manual_pairs = set()
            for dex, m in manual.items():
                for sid_s, suffix in m.items():
                    sid = int(sid_s)
                    row = con.execute(
                        """SELECT id FROM forms WHERE species_id=? AND identifier LIKE '%-'||?
                           ORDER BY id LIMIT 1""", (sid, suffix)).fetchone()
                    if row:
                        ddf_rows.append((dex, sid, row[0]))
                        manual_pairs.add((dex, sid))
            ddf_rows = [r for r in ddf_rows if (r[0], r[1]) not in manual_pairs] + \
                       [r for r in ddf_rows if (r[0], r[1]) in manual_pairs]
        # 一致性校验：默认形态必须在该游戏可用（hidden/未配置形态不校验）
        bad = []
        seen_pk = set()
        final_ddf = []
        for dex, sid, fid in ddf_rows:
            if (dex, sid) in seen_pk:
                continue
            seen_pk.add((dex, sid))
            game = con.execute("SELECT game_id FROM regional_dexes WHERE id=?", (dex,)).fetchone()
            if fid in avail and game and game[0] not in avail[fid]:
                bad.append((dex, sid, fid))
                continue
            final_ddf.append((dex, sid, fid))
        if bad:
            print(f"  !! dex_default_forms 与可用性冲突 {len(bad)} 条（已跳过）：{bad[:6]}")
        con.executemany("INSERT OR REPLACE INTO dex_default_forms VALUES (?,?,?)", final_ddf)

    # ---- 地区形态分支进化链（curated evo_branches.json） ----
    eb_file = ROOT / "data" / "curated" / "evo_branches.json"
    if eb_file.exists():
        eb = json.loads(eb_file.read_text(encoding="utf-8"))
        rows = []
        bad_branch = []
        for fam, branches in eb.items():
            if fam.startswith("_"):
                continue
            try:
                root_sid = int(fam)
            except ValueError:
                bad_branch.append((fam, fam))
                continue
            for bi, branch in enumerate(branches):
                # branch[0] = 根物种的形态后缀（''=普通形态），后续 token = 'sid[:后缀]'
                rows.append((fam, root_sid, branch[0], str(bi)))
                for tok in branch[1:]:
                    sid_s, _, suf = tok.partition(":")
                    try:
                        sid = int(sid_s)
                    except ValueError:
                        bad_branch.append((fam, tok))
                        continue
                    # 后缀空 = 默认形态；非空兼容复合形态（darmanitan-galar-standard）
                    if suf:
                        row = con.execute(
                            """SELECT id FROM forms WHERE species_id=?
                               AND (identifier LIKE '%-'||? OR identifier LIKE '%-'||?||'-%')
                               ORDER BY LENGTH(identifier) LIMIT 1""",
                            (sid, suf, suf)).fetchone()
                    else:
                        row = con.execute(
                            "SELECT id FROM forms WHERE species_id=? AND is_default=1",
                            (sid,)).fetchone()
                    if row is None:
                        bad_branch.append((fam, tok))
                    rows.append((fam, sid, suf, str(bi)))
        con.executemany("INSERT OR REPLACE INTO evo_branches VALUES (?,?,?,?)", rows)
        require_rows(con, "evo_branches", 20, eb_file.name)
        if bad_branch:
            print(f"  !! evo_branches 未匹配形态 {sorted(set(map(str, bad_branch)))[:8]}")

    con.commit()

    # ---- report ----
    for table in ("games", "regional_dexes", "dex_entries", "species", "forms",
                  "moves", "learnsets", "machines", "encounters",
                  "abilities", "items", "form_game_availability", "dex_default_forms",
                  "evo_branches", "z_exclusive", "z_generic", "gmax_moves"):
        n = con.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
        print(f"{table:24s} {n}")
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
