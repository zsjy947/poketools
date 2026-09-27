"""生成 data/curated/z_moves.json：Ｚ招式泛用/专属表（52poke「Ｚ招式」页）。

泛用：18 属性 → {type, z_move_name, crystal_name, crystal_identifier, crystal_id}
专属：{species_id, form_suffix, base_move_id, z_move_name, power, damage_class,
       crystal_name, crystal_identifier, crystal_id, note}
PokeAPI items.csv 不含 Z 纯晶道具（仅 4 个杂项 -z），纯晶由本 JSON 注入 items 表；
道具图标走 PokeAPI sprites items/{identifier}.png，缺失时 52poke Bag 图兜底。
运行：python scripts/build_z_moves.py（在 build_db.py 之前，重跑管线时自动重算）
"""
from __future__ import annotations

import json
import re
import sqlite3
import sys

import wiki_client as wc
from scrape_52poke import cell_text, wikitables

ROOT = wc.ROOT
CURATED = ROOT / "data" / "curated"
DB_PATH = ROOT / "data" / "poketools.db"

# 泛用 Z 纯晶：属性 → (PokeAPI 道具 identifier, 注入 id)。属性中文名与页面表格一致。
GENERIC_CRYSTALS = {
    "一般": ("normalium-z", 1), "格斗": ("fightinium-z", 2), "飞行": ("flyinium-z", 3),
    "毒": ("poisonium-z", 4), "地面": ("groundium-z", 5), "岩石": ("rockium-z", 6),
    "虫": ("buginium-z", 7), "幽灵": ("ghostium-z", 8), "钢": ("steelium-z", 9),
    "火": ("firium-z", 10), "水": ("waterium-z", 11), "草": ("grassium-z", 12),
    "电": ("electricium-z", 13), "超能力": ("psychium-z", 14), "冰": ("icium-z", 15),
    "龙": ("dragonium-z", 16), "恶": ("darkinium-z", 17), "妖精": ("fairium-z", 18),
}

# 专属 Z 纯晶：中文名 → (identifier, 注入 id)
EXCLUSIVE_CRYSTALS = {
    "卡比兽Ｚ": ("snorlium-z", 31), "阿罗雷Ｚ": ("aloraichium-z", 32),
    "皮卡丘Ｚ": ("pikanium-z", 33), "智皮卡Ｚ": ("pikashunium-z", 34),
    "伊布Ｚ": ("evium-z", 35), "卡璞Ｚ": ("tapunium-z", 36),
    "梦幻Ｚ": ("mewnium-z", 37), "狙射树枭Ｚ": ("decidium-z", 38),
    "炽焰咆哮虎Ｚ": ("incinium-z", 39), "西狮海壬Ｚ": ("primarium-z", 40),
    "玛夏多Ｚ": ("marshadium-z", 41), "杖尾鳞甲龙Ｚ": ("kommonium-z", 42),
    "谜拟ＱＺ": ("mimikium-z", 43), "鬃岩狼人Ｚ": ("lycanium-z", 44),
    "奈克洛兹玛Ｚ": ("ultranecrozium-z", 45), "究极奈克洛Ｚ": ("ultranecrozium-z", 45),
    "索尔迦雷欧Ｚ": ("solganium-z", 46), "露奈雅拉Ｚ": ("lunanium-z", 47),
}

# 专属表「宝可梦」列人工映射（wiki MSP 模板跨简繁/形态标记，逐条对照核实）
# (species_id, form_suffix)；卡璞Ｚ四个守护神共用 → 拆多条
POKEMON_COL_MAP = {
    "卡比兽": [(143, "")], "卡比獸": [(143, "")],
    "雷丘": [(26, "alola")],
    "皮卡丘": [(25, "")],                    # 皮卡丘Ｚ：戴帽皮卡丘不可用
    "戴着帽子的皮卡丘": [("caps", "")],        # 智皮卡Ｚ：全部帽子形态（前端按形态判定）
    "伊布": [(133, "")],
    "守護神": [(779, ""), (780, ""), (781, ""), (782, "")],   # 卡璞Ｚ四守护神
    "梦幻": [(151, "")],
    "狙射树枭": [(724, "")], "狙射樹梟": [(724, "")],
    "炽焰咆哮虎": [(727, "")], "熾焰咆哮虎": [(727, "")],
    "西狮海壬": [(730, "")], "西獅海壬": [(730, "")],
    "玛夏多": [(802, "")],
    "杖尾鳞甲龙": [(784, "")],
    "谜拟Ｑ": [(778, "")],
    "鬃岩狼人": [(745, "dusk")],              # 黄昏样子限定
    "奈克洛兹玛": [(800, "ultra")],            # 暗暮/晓之/究极爆发后（按究极形态挂靠）
    "索尔迦雷欧": [(791, "")],
    "露奈雅拉": [(792, "")],
}

# 合并单元格（；分隔 + 形态注释）专用：去括号/分号后的整串 → 多条目
COMPOUND_MAP = {
    "索尔迦雷欧奈克洛兹玛黄昏之鬃": [(791, ""), (800, "dusk")],
    "露奈雅拉奈克洛兹玛拂晓之翼": [(792, ""), (800, "dawn")],
}


def zh_hans_link(raw: str) -> str:
    """从 `-{zh-hans:…;zh-hant:…}-<br>[[link]]` 单元格取简体招式名。

    优先 zh-hans 分支的 `link=名`（动画帧文件带 S/T 后缀，File 名不可靠）。
    """
    m = re.search(r"zh-hans:(.*?);zh-hant:", raw, re.DOTALL)
    seg = m.group(1) if m else raw
    fm = re.search(r"File:([^\]|]+?)\s*(?:S|T)?\s*Sprite\.png", seg)
    if fm:
        return fm.group(1).strip()
    lm = re.search(r"link=([^\]|]+)", seg)
    if lm:
        return lm.group(1).strip()
    links = re.findall(r"\[\[([^\]|]+)(?:\|[^\]|]*)*\]\]", seg)
    if links:
        return links[-1].strip()
    return cell_text(raw).lstrip("；").strip()


def main() -> None:
    if not DB_PATH.exists():
        sys.exit("poketools.db missing — run scripts/build_db.py first")
    con = sqlite3.connect(DB_PATH)
    move_id_by_zh = {z: mid for mid, z in con.execute("SELECT id, name_zh FROM moves")}
    # 52poke 与 PokeAPI 招式译名差异（同 scrape_52poke.MOVE_NAME_ALIASES）
    alias = {"禍不單行": "祸不单行", "暗影偷盗": "影子偷袭", "縫影": "影子钩爪",
             "自然之怒": "自然之怒", "ＤＤ金勾臂": "双倍奉还"}
    sp_by_zh = {z: sid for sid, z in con.execute("SELECT id, name_zh FROM species")}

    wt = wc.fetch_wikitext("Ｚ招式")
    i = wt.find("==泛用Ｚ招式==")
    j = wt.find("==旁支系列中==")
    seg = wt[i:j]
    tables = wikitables(seg)

    generic = []
    for row in tables[0]:
        cells = [cell_text(c) for c in row]
        if len(cells) < 3:
            continue
        tname = {"電": "电"}.get(cells[1], cells[1])
        if tname not in GENERIC_CRYSTALS:
            continue
        zname = zh_hans_link(row[0])
        ident, cid = GENERIC_CRYSTALS[tname]
        generic.append({"type": tname, "z_move_name": zname,
                        "crystal_name": cells[2], "crystal_identifier": ident,
                        "crystal_id": cid})

    exclusive = []
    for t in tables:
        if not t:
            continue
        # 表头被解析成多行单格（wikitext 的 !! 行拆分行为），前 8 行内含「原始招式」即认定
        head_txt = " ".join(cell_text(c) for row in t[:8] for c in row)
        if "原始招式" not in head_txt:
            continue
        raw_tables = t
        for row in raw_tables[1:]:
            cells = [cell_text(c) for c in row]
            if len(cells) < 6:
                continue
            # 纯晶列以内容定位（空「附加效果」单元格会让列数 7↔8 漂移）
            ci = next((k for k, c in enumerate(cells) if c in EXCLUSIVE_CRYSTALS), -1)
            if ci < 0:
                continue
            crystal = cells[ci]
            ident, cid = EXCLUSIVE_CRYSTALS[crystal]
            base = cells[ci - 1].strip()
            mid = move_id_by_zh.get(base) or move_id_by_zh.get(alias.get(base, ""))
            poke_raw = cells[ci - 2]
            note = cells[4].strip() if ci >= 7 else ""   # 7 列行=无附加效果格
            zname = zh_hans_link(row[0])
            flat = re.sub(r"[（）；;]", "", poke_raw)
            mapping = COMPOUND_MAP.get(flat)
            if mapping is None:
                primary = poke_raw.split("；")[0]
                key = re.sub(r"（[^）]*）", "", primary).strip()
                mapping = POKEMON_COL_MAP.get(key)
                if mapping is None:
                    sid = sp_by_zh.get(key)
                    mapping = [(sid, "")] if sid else []
                extra = re.sub(r"^[（;；]+|[）]+$", "",
                               poke_raw.split("；", 1)[1].strip()) if "；" in poke_raw else ""
                if extra and extra not in note:
                    note = (note + "；" if note else "") + extra
            if not mapping or mid is None:
                print(f"  !! unhandled row: {zname} poke={poke_raw!r} base={base!r}")
                continue
            power = cells[2].strip()
            cls = cells[3].strip()
            for sid, suffix in mapping:
                exclusive.append({
                    "species_id": sid, "form_suffix": suffix, "base_move_id": mid,
                    "z_move_name": zname,
                    "power": int(power) if power.isdigit() else None,
                    "damage_class": {"物理": "physical", "特殊": "special",
                                     "变化": "status"}.get(cls, ""),
                    "crystal_name": crystal, "crystal_identifier": ident,
                    "crystal_id": cid,
                    "note": note + ("；需究极爆发后使用" if crystal == "究极奈克洛Ｚ" else ""),
                })

    out = {"_doc": "Ｚ招式数据（52poke「Ｚ招式」页泛用/专属表；纯晶道具注入 items 表）",
           "generic": generic, "exclusive": exclusive}
    (CURATED / "z_moves.json").write_text(
        json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"generic: {len(generic)}  exclusive rows: {len(exclusive)} -> {CURATED / 'z_moves.json'}")
    con.close()


if __name__ == "__main__":
    main()
