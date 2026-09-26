"""Scrape game-specific Chinese data from wiki.52poke.com and merge into poketools.db.

Outputs curated JSON to data/curated/ (committed to git) and merges into DB:
  - get_methods  : 捕捉方式（带版本标签：本体/DLC/版本独占）
  - dex_flavor   : 图鉴描述 (Swdex/Shdex/ladex/scdex/videx/zadex/bdspdex)
  - tm_how       : 招式学习器获取方式与素材 (SV loc9/item9, SwSh locswsh, BDSP locbdsp)
  - machines     : BDSP TM001-100 由 52poke 补全（PokeAPI 仅 17 条）
  - sandwiches   : 朱紫三明治食谱
  - za_learnsets : Z-A 学习集（52poke 主源，PokemonDB 兜底，写入 vg30）
  - picnic_items : 三明治食材/调味料（含获取方式）
  - donuts       : Z-A 甜甜圈（基础类型/特殊配方/树果效果/风味力量）
  - curries      : 剑盾咖喱图鉴

Run AFTER scripts/build_db.py. All pages cached to data/raw/52poke-cache/.
52poke 未收录的 Z-A 学习集从 pokemondb.net 兜底（缓存到 data/raw/pokemondb-cache/），
英文 TM 地点经人工翻译后放在 data/curated/tm_locations_za_pokemondb.json。
"""
from __future__ import annotations

import json
import re
import sqlite3
import sys
import time
from collections import Counter
from pathlib import Path

from pokemondb_client import fetch_html as pdb_fetch_html, strip_tags as pdb_strip_tags
from wiki_client import (  # 共享 52poke 客户端（缓存/批量 wikitext/别名回退）
    CACHE, ROOT, fetch_titles, get_wikitext)

DB_PATH = ROOT / "data" / "poketools.db"
CURATED = ROOT / "data" / "curated"

BDSP = "brilliant-diamond-shining-pearl"

# 52poke 使用官方新译名，PokeAPI CSV 部分招式仍是旧译名 → 别名映射
MOVE_NAME_ALIASES = {
    "空气之刃": "空气斩",     # air-slash
    "磷火": "鬼火",           # will-o-wisp
    "咒术": "祸不单行",       # hex
    "纠缠不休": "死缠烂打",   # infestation
    "電磁波": "电磁波",       # TMtable movebdsp 偶用繁体
}

# (gen, code) -> (game_id, version_label)
# 代码词汇来自对全缓存的普查：SWSHE/SwShE=剑盾扩展票、SVT=零之秘宝、ZAM=Z-A 异次元等
GAME_CODES = {
    (8, "SW"): ("sword-shield", "剑"), (8, "SH"): ("sword-shield", "盾"),
    (8, "SWSH"): ("sword-shield", "剑/盾"),
    (8, "SWE"): ("sword-shield", "剑·扩展票"), (8, "SHE"): ("sword-shield", "盾·扩展票"),
    (8, "SWSHE"): ("sword-shield", "剑/盾·扩展票"),
    (8, "BD"): (BDSP, "晶灿钻石"), (8, "SP"): (BDSP, "明亮珍珠"),
    (8, "BDSP"): (BDSP, "晶灿钻石/明亮珍珠"),
    (8, "LA"): ("legends-arceus", "传说 阿尔宙斯"), (8, "PLA"): ("legends-arceus", "传说 阿尔宙斯"),
    (9, "S"): ("scarlet-violet", "朱"), (9, "V"): ("scarlet-violet", "紫"),
    (9, "SV"): ("scarlet-violet", "朱/紫"),
    (9, "SC"): ("scarlet-violet", "朱"), (9, "VI"): ("scarlet-violet", "紫"),
    (9, "ST"): ("scarlet-violet", "朱·零之秘宝"), (9, "VT"): ("scarlet-violet", "紫·零之秘宝"),
    (9, "SVT"): ("scarlet-violet", "朱/紫·零之秘宝"), (9, "ID"): ("scarlet-violet", "朱/紫·零之秘宝"),
    (9, "ZA"): ("legends-za", "传说 Z-A"),
    (9, "ZAM"): ("legends-za", "Z-A·异次元"),
}

FLAVOR_FIELDS = {
    "Swdex": ("sword-shield", "剑"), "Shdex": ("sword-shield", "盾"),
    "sdex": ("sword-shield", "剑"), "bdex": ("sword-shield", "盾"),
    "ladex": ("legends-arceus", "洗翠"),
    "scdex": ("scarlet-violet", "朱"), "videx": ("scarlet-violet", "紫"),
    "zadex": ("legends-za", "Z-A"),
    "bdspdex": (BDSP, "晶钻/明珍"),
}

SPECIAL_LOC = {
    "null": ("", "本作中不存在"), "无": ("", "本作中不存在"), "無": ("", "本作中不存在"),
    "trade": ("", "通过连接交换传入"), "交换": ("", "通过连接交换传入"),
    "交換": ("", "通过连接交换传入"), "连接交换": ("", "通过连接交换传入"),
    "連線交換": ("", "通过连接交换传入"),
    "event": ("", "活动赠送"), "活动": ("", "活动赠送"), "活動": ("", "活动赠送"),
    "evo": ("", "进化获得"), "进化": ("", "进化获得"), "進化": ("", "进化获得"),
    "baby": ("", "生蛋获得"), "培育": ("", "生蛋获得"), "生蛋": ("", "生蛋获得"),
    "unknown": ("", "未知"), "未知": ("", "未知"),
}

# ------------------------------------------------- wiki fetch（统一走 wiki_client）


# ---------------------------------------------------------------- wikitext utils

def find_template(wt: str, name: str, start: int = 0) -> list[tuple[int, str]]:
    """Return [(offset, inner_body)] for each {{name|...}} occurrence."""
    out = []
    needle = f"{{{{{name}"
    i = wt.find(needle, start)
    while i != -1:
        nxt = wt[i + len(needle):i + len(needle) + 1]
        if nxt not in ("|", "}", "\n", " ", "\t"):
            i = wt.find(needle, i + len(needle))
            continue
        depth = 2
        j = i + 2
        while j < len(wt) and depth:
            if wt.startswith("{{", j):
                depth += 2; j += 2
            elif wt.startswith("}}", j):
                depth -= 2; j += 2
            else:
                j += 1
        if depth == 0:
            body = wt[i + 2 + len(name):j - 2]
            if body.startswith("|"):
                body = body[1:]
            out.append((i, body))
        i = wt.find(needle, j)
    return out


def split_params(body: str) -> list[str]:
    """Split template body on top-level '|' (braces/brackets aware), keep order."""
    parts, cur, b, k = [], [], 0, 0
    for ch in body:
        if ch == "{":
            b += 1
        elif ch == "}":
            b -= 1
        elif ch == "[":
            k += 1
        elif ch == "]":
            k -= 1
        if ch == "|" and b == 0 and k == 0:
            parts.append("".join(cur)); cur = []
        else:
            cur.append(ch)
    parts.append("".join(cur))
    return parts


def parse_params(body: str) -> tuple[dict[int, str], dict[str, str]]:
    """Return (positional{1..n}, named{}) in original order."""
    pos, named = {}, {}
    n = 0
    for raw in split_params(body):
        b, k = 0, 0
        eq = -1
        for idx, ch in enumerate(raw):
            if ch == "{":
                b += 1
            elif ch == "}":
                b -= 1
            elif ch == "[":
                k += 1
            elif ch == "]":
                k -= 1
            elif ch == "=" and b == 0 and k == 0 and eq == -1:
                eq = idx
        if eq > 0:
            key = raw[:eq].strip()
            named[key] = raw[eq + 1:]
        else:
            n += 1
            pos[n] = raw
    return pos, named


_RE_ZH = re.compile(r"-\{\s*zh-hans:([^;{}]*?)\s*;\s*zh-hant:.*?\}-", re.S)
_RE_ZH2 = re.compile(r"-\{\s*zh-hant:[^;{}]*?\s*;\s*zh-hans:([^;{}]*?)\s*\}-", re.S)
_RE_TT = re.compile(r"\{\{tt\|([^|{}]*)(?:\|[^{}]*)?\}\}")
_RE_SIMPLE = [
    (re.compile(r"\{\{bag\|([^|{}]+)(?:\|[^{}]*)?\}\}"), r"\1"),
    (re.compile(r"\{\{[iamp]\|([^|{}]+)(?:\|[^{}]*)?\}\}"), r"\1"),
    (re.compile(r"\{\{typelink\|([^|{}]+)(?:\|[^{}]*)?\}\}"), r"\1"),
    (re.compile(r"\{\{rt\|([^|{}]+)\|[^{}]*\}\}"), r"\1号道路"),
    (re.compile(r"\{\{par\|([^|{}]+)\|([^|{}]+)\}\}"), r"\1（\2）"),
    (re.compile(r"\{\{E\|([^|{}]+)\}\}"), r"\1"),
    (re.compile(r"\{\{(?:GameIconzh/\d+|game4?|MS\w*|sup[/\d]*)[^{}]*\}\}"), ""),
    (re.compile(r"\[\[File:[^\]]*\]\]"), ""),
    (re.compile(r"<!--.*?-->", re.S), ""),
    (re.compile(r"<ref[^>]*>.*?</ref>", re.S), ""),
    (re.compile(r"<ref[^>]*/>"), ""),
]
_RE_LINK = re.compile(r"\[\[([^\]|]*)\|([^\]]*)\]\]")
_RE_LINK2 = re.compile(r"\[\[([^\]]*)\]\]")
_RE_TAIL = re.compile(r"<small>（[^<]*）</small>")


def clean_wt(s: str | None) -> str:
    if not s:
        return ""
    s = _RE_SIMPLE[8][0].sub("", s)  # <!--...-->
    s = _RE_SIMPLE[9][0].sub("", s)  # <ref>...
    s = _RE_SIMPLE[10][0].sub("", s)  # <ref/>
    s = _RE_SIMPLE[7][0].sub("", s)  # [[File:...]]
    s = _RE_ZH2.sub(lambda m: m.group(1), s)
    s = _RE_ZH.sub(lambda m: m.group(1), s)
    for _ in range(4):
        s = _RE_LINK.sub(lambda m: m.group(2), s)
        s = _RE_LINK2.sub(lambda m: m.group(1), s)
        s = _RE_TT.sub(r"\1", s)
        for rx, rep in _RE_SIMPLE[:7]:
            s = rx.sub(rep, s)
        inner = re.search(r"\{\{([^{}]*)\}\}", s)
        if inner:
            last = [p for p in inner.group(1).split("|") if p.strip()]
            s = s[:inner.start()] + (last[-1] if last else "") + s[inner.end():]
    s = s.replace("<br>", "；").replace("<br/>", "；").replace("<br />", "；")
    s = re.sub(r"<[^>]+>", "", s)
    s = s.replace("''", "")
    s = s.replace("\r", "").replace("\n", " ").replace("\t", " ")
    return re.sub(r"\s+", " ", s).strip()


# ---------------------------------------------------------------- 表格工具：wikitable -> rows of cells

def wikitables(wt: str, start: int = 0) -> list[list[list[str]]]:
    """Parse {| ... |} tables into list of tables, each a list of rows (list of raw cell text)."""
    tables = []
    i = wt.find("{|", start)
    while i != -1:
        depth = 0
        j = i
        while j < len(wt):
            if wt.startswith("{|", j):
                depth += 1; j += 2
            elif wt.startswith("|}", j):
                depth -= 1; j += 2
                if depth == 0:
                    break
            else:
                j += 1
        tables.append(_parse_table(wt[i:j]))
        i = wt.find("{|", j)
    return tables


def _parse_table(seg: str) -> list[list[str]]:
    rows: list[list[str]] = []
    # 去掉嵌套表格里的 || 分隔行头；按行聚合单元格
    cur_cells: list[str] = []
    cur = ""
    for line in seg.splitlines():
        ls = line.strip()
        if ls.startswith("{|") or ls.startswith("|}"):
            continue
        if ls.startswith("|-"):
            if cur_cells or cur.strip():
                cur_cells.append(cur)
                rows.append([c for c in cur_cells])
            cur_cells, cur = [], ""
            continue
        if ls.startswith("!"):
            ls_cells = ls.lstrip("!").split("!!")
            if cur_cells or cur.strip():
                cur_cells.append(cur)
                rows.append(cur_cells[:])
                cur_cells, cur = [], ""
            rows.append([c.strip() for c in ls_cells])  # 表头行（当普通行处理）
            continue
        if ls.startswith("|"):
            parts = re.split(r"(?<!\|)\|\|(?!\|)", ls[1:])
            if len(parts) > 1:
                for k, p in enumerate(parts):
                    if k == 0 and cur.strip():
                        cur_cells.append(cur); cur = ""
                    if k < len(parts) - 1:
                        cur_cells.append(p.strip())
                    else:
                        cur = p.strip()
            else:
                if cur.strip():
                    cur_cells.append(cur)
                cur = ls[1:].strip()
        else:
            if cur_cells:
                cur += " " + ls
    if cur_cells or cur.strip():
        cur_cells.append(cur)
        rows.append(cur_cells[:])
    return rows


def _strip_cell_attrs(c: str) -> str:
    """wikitable 单元格 `attr|value` 形式：取顶层第一个 | 之后的内容（模板内 | 不算）。"""
    b = k = 0
    for i, ch in enumerate(c):
        if ch == "{":
            b += 1
        elif ch == "}":
            b -= 1
        elif ch == "[":
            k += 1
        elif ch == "]":
            k -= 1
        elif ch == "|" and b == 0 and k == 0:
            return c[i + 1:]
    return c


def cell_text(c: str) -> str:
    # Bag/Bag Latest 模板第 1 参数是道具名（generic 内层模板折叠会取最后一个参数）
    c = _strip_cell_attrs(c)
    c = re.sub(r"\{\{Bag(?:/Latest)?(?:/ZA)?\|([^|{}]+)[^{}]*\}\}", r"\1", c)
    return clean_wt(c)


# ---------------------------------------------------------------- pokemon pages: get_methods + flavor

def parse_get_methods(wt: str) -> list[dict]:
    rows = []
    for _, body in find_template(wt, "获得方式/main"):
        pos, named = parse_params(body)
        ndex = re.sub(r"[^0-9]", "", pos.get(1, ""))
        if not ndex:
            continue
        try:
            gen = int(pos.get(2, "0"))
        except ValueError:
            continue
        code = (named.get("game") or pos.get(3, "")).strip().upper()
        mapped = GAME_CODES.get((gen, code))
        if not mapped:
            continue
        game, vlabel = mapped
        loc_raw = (pos.get(5, "") or "").strip()
        method_raw = (pos.get(6, "") or "").strip()
        note = clean_wt(named.get("note") or pos.get(7) or "")
        loc = clean_wt(loc_raw)
        method = clean_wt(method_raw)
        special = loc_raw.strip().lower() in SPECIAL_LOC or loc_raw.strip() in SPECIAL_LOC
        if special:
            key = loc_raw.strip().lower()
            key2 = loc_raw.strip()
            loc2, method = SPECIAL_LOC.get(key, SPECIAL_LOC.get(key2, ("", method)))
            loc = loc2
            if loc_raw.strip().lower() in ("evo", "baby", "进化", "進化", "培育", "生蛋"):
                who = clean_wt(method_raw) or named.get("baby2", "")
                method = f"由{who}{method}" if who else method
        rows.append({
            "game": game, "version_label": vlabel, "location": loc,
            "method": method, "note": note,
            "form": bool(re.match(r"^\d{3,4}[A-Za-z]", pos.get(1, "").strip())),
        })
    return rows


# {{图鉴}} 字段值中 <hr> 分段的形态标记 → forms.identifier 后缀
# （段尾 <small>（标记）</small>，简繁均有；未收录标记落 TODO.json 不静默丢弃）
FORM_MARKERS = {
    "阿罗拉的样子": "alola", "阿羅拉的樣子": "alola",
    "伽勒尔的样子": "galar", "伽勒尔的樣子": "galar",
    "伽勒爾的樣子": "galar", "伽勒爾的样子": "galar",
    "洗翠的样子": "hisui", "洗翠的樣子": "hisui",
    "帕底亚的样子": "paldea", "帕底亞的樣子": "paldea",
    "帕底亚的样子，斗战种": "paldea-combat-breed",
    "帕底亚的样子，火炽种": "paldea-blaze-breed",
    "帕底亚的样子，水澜种": "paldea-aqua-breed",
    "伽勒尔的样子，达摩模式": "galar-zen",
    "加热洛托姆": "rotom-heat", "清洗洛托姆": "rotom-wash",
    "结冰洛托姆": "rotom-frost", "旋转洛托姆": "rotom-fan",
    "切割洛托姆": "rotom-mow",
    # 超级进化 / 超极巨化 / 原始回归 / 无极巨化
    "超级进化": "mega",
    "超级喷火龙Ｘ": "mega-x", "超级喷火龙Ｙ": "mega-y",
    "超级超梦Ｘ": "mega-x", "超级超梦Ｙ": "mega-y",
    "超级雷丘Ｘ": "mega-x", "超级雷丘Ｙ": "mega-y",
    "超级阿勃梭鲁Ｚ": "mega-z", "超级烈咬陆鲨Ｚ": "mega-z", "超级路卡利欧Ｚ": "mega-z",
    "超极巨化": "gmax",
    "一击流超极巨化": "single-strike-gmax", "连击流超极巨化": "rapid-strike-gmax",
    "一击流": "single-strike", "连击流": "rapid-strike",
    "原始回归": "primal", "无极巨化": "eternamax",
    "剑之王": "crowned", "盾之王": "crowned",
    "黄昏之鬃": "dusk", "拂曉之翼": "dawn", "拂晓之翼": "dawn",
    # 性别 / 花色 / 花纹 / 羽毛 / 卡带 / 姿势 / 尺寸 / 四季 / 帽子
    "雄性的样子": "male", "雌性的样子": "female",
    "绿羽毛": "green-plumage", "蓝羽毛": "blue-plumage",
    "黄羽毛": "yellow-plumage", "白羽毛": "white-plumage",
    "上弓姿势": "curly", "下垂姿势": "droopy", "平挺姿势": "stretchy",
    "普通尺寸": "average", "小尺寸": "small", "大尺寸": "large", "特大尺寸": "super",
    "中颗种": "average", "小颗种": "small", "大颗种": "large", "巨颗种": "super",
    "初始帽子": "original-cap", "丰缘帽子": "hoenn-cap", "神奥帽子": "sinnoh-cap",
    "合众帽子": "unova-cap", "卡洛斯帽子": "kalos-cap", "阿罗拉帽子": "alola-cap",
    "就决定是你了之帽子": "partner-cap", "世界帽子": "world-cap",
    # 梦特花纹（碧粉蝶 20 种）等地区/形态词
    "红条纹的样子": "red-striped", "蓝条纹的样子": "blue-striped",
    "紅條紋的樣子": "red-striped", "藍條紋的樣子": "blue-striped",
    "白条纹的样子": "white-striped",
    "高调的样子": "amped", "低调的样子": "low-key",
    "满腹花纹": "full-belly", "空腹花纹": "hangry",
    "化身形态": "incarnate", "灵兽形态": "therian",
    "别种形态": "altered", "起源形态": "origin",
    "白昼的样子": "midday", "黑夜的样子": "midnight", "黄昏的样子": "dusk",
    "一口吞的样子": "gulping", "大口吞的样子": "gorging",
    "單獨的樣子": "solo", "单独的样子": "solo",
    "魚群的樣子": "school", "鱼群的样子": "school",
    "达摩模式": "zen",
    "焰白酋雷姆": "white", "暗黑酋雷姆": "black",
    "歌声形态": "aria", "舞步形态": "pirouette",
    "陆上形态": "land", "天空形态": "sky",
    "永恒之花": "eternal",
    "惩戒胡帕": "confined", "解放胡帕": "unbound",
    "现形的样子": ["unbound", "busted"], "現形的樣子": ["unbound", "busted"],
    "化形的样子": ["disguised", "confined"], "化形的樣子": ["disguised", "confined"],
    "平常的样子": "ordinary", "觉悟的样子": "resolute",
    "结冻头": "ice", "解冻头": "noice",
    "百战勇者": "hero",
    "阿爸": "dada",
    "平凡形态": "zero", "全能形态": "hero",
    "二节形态": "two-segment", "三节形态": "three-segment",
    "完全体形态": "complete", "完全形态": "complete",
    "５０％形态": "50", "１０％形态": "10",
    "水井面具": "wellspring-mask",
    "火灶面具": "hearthflame-mask", "础石面具": "cornerstone-mask",
    "太晶形态": "terastal", "星晶形态": "stellar",
    "盾牌形态": "shield", "刀剑形态": "blade",
    "徒步形态": "roaming",
    "热辣热辣风格": "baile", "啪滋啪滋风格": "pom-pom",
    "呼拉呼拉风格": "pau", "轻盈轻盈风格": "sensu",
    "草木蓑衣": "plant", "砂土蓑衣": "sandy", "垃圾蓑衣": "trash",
    "骑白马的样子": "ice", "骑黑马的样子": "shadow",
    "黃昏之鬃": "dusk",
    "赫月": "bloodmoon",
    "三只家庭": "family-of-three", "四只家庭": "family-of-four",
    "超级阿勃梭鲁": "mega", "超级烈咬陆鲨": "mega", "超级路卡利欧": "mega",
    # 霜奶仙 奶香/糖饰（ PokeAPI 后缀）
}


def _strip_form_marker(seg: str) -> tuple[str, str]:
    """剥掉段尾 <small>（形态标记）</small>，返回 (正文, 标记)。"""
    m = re.search(r"<small>（(.+?)）</small>\s*$", seg)
    if not m:
        return seg, ""
    return seg[: m.start()].strip(), m.group(1)


def parse_flavor(wt: str) -> tuple[list[dict], list[dict], list[dict]]:
    """图鉴介绍 → (默认形态行, 形态独立行, 失败记录)。

    字段值可能是「默认段 <hr> 形态段<small>（标记）</small> <hr> …」的多段结构
    （如 嘎啦嘎啦-阿罗拉、洛托姆换装形态各有一段）；首段属默认形态，
    其余按 FORM_MARKERS 映射形态。未收录标记记入失败列表。
    """
    out: list[dict] = []
    forms_out: list[dict] = []
    unknown: list[dict] = []
    for _, body in find_template(wt, "图鉴"):
        _, named = parse_params(body)
        for field, (game, label) in FLAVOR_FIELDS.items():
            val = named.get(field)
            if not val:
                continue
            segs = val.split("<hr>")
            # 首段也可能整体属于形态（洗翠限定种的 ladex 只有形态文本，无 <hr> 分段）
            first_text, first_marker = _strip_form_marker(segs[0])
            head_segs = [(first_text, first_marker)] if first_marker                 else [(segs[0], "")]
            for seg_text, marker in head_segs + [
                    _strip_form_marker(s) for s in segs[1:]]:
                t = clean_wt(seg_text)
                if not t:
                    continue
                suffix = FORM_MARKERS.get(marker) if marker else None
                if suffix:
                    # 值可为 str 或 [候选…]（同名标记跨种歧义时按顺序试，如 化形→谜拟丘/胡帕）
                    cands = suffix if isinstance(suffix, list) else [suffix]
                    forms_out.append({"suffixes": cands, "game": game,
                                      "label": label, "text": t})
                elif marker:
                    unknown.append({"field": field, "marker": marker,
                                    "text": t[:60]})
                else:
                    out.append({"game": game, "label": label, "text": t})
        break  # only the first {{图鉴}} block
    return out, forms_out, unknown


# ---------------------------------------------------------------- TM pages

def fw(n: int) -> str:
    return "".join("０１２３４５６７８９"[int(c)] for c in f"{n:03d}")


def parse_tm_page(wt: str) -> dict:
    """Return {'sv': {...}, 'swsh': {...}, 'bdsp': {...}, 'za': {...}}"""
    res: dict = {"other_keys": []}
    for _, body in find_template(wt, "TMtable"):
        ordered = []
        for raw in split_params(body):
            b = k = 0
            eq = -1
            for idx, ch in enumerate(raw):
                if ch == "{":
                    b += 1
                elif ch == "}":
                    b -= 1
                elif ch == "[":
                    k += 1
                elif ch == "]":
                    k -= 1
                elif ch == "=" and b == 0 and k == 0 and eq == -1:
                    eq = idx
            if eq > 0:
                ordered.append((raw[:eq].strip(), raw[eq + 1:]))
        by_key = dict(ordered)
        keys = [k for k, _ in ordered]
        for suffix, game in (("9", "sv"), ("swsh", "swsh"), ("sw", "swsh"),
                             ("bdsp", "bdsp"), ("za", "za"), ("lz", "za")):
            loc = by_key.get(f"loc{suffix}")
            if loc is None:
                continue
            move = None
            for k in (f"move{suffix}", "move9", "move8"):
                if by_key.get(k):
                    move = by_key[k]
                    break
            res[game] = {
                "loc": clean_wt(loc),
                "item": clean_wt(by_key.get(f"item{suffix}", "")),
                "move": clean_wt(move or ""),
            }
        for k in keys:
            if k.startswith("loc") and not any(k.endswith(s) for s in ("9", "swsh", "sw", "bdsp", "za", "lz")):
                res["other_keys"].append(k)
        break
    return res


# ---------------------------------------------------------------- Z-A learnsets（52poke 子页）

def parse_za_learnlist(wt: str) -> dict:
    """Parse {species}/第九世代招式表 -> {'level': [(level, mastery, move)], 'tm': [(tmno, move)]}"""
    out: dict = {"level": [], "tm": []}
    i = wt.find("{{game|ZA}}")
    if i < 0:
        return out
    j = wt.find("===={{game|", i + 1)   # 下一个游戏小节；无则取到文末
    seg = wt[i:j] if j > 0 else wt[i:]
    for _, body in find_template(seg, "learnlist/level/za"):
        pos, named = parse_params(body)
        try:
            level = int(re.sub(r"[^0-9]", "", pos.get(1, "")) or 0)
        except ValueError:
            continue
        mastery = re.sub(r"[^0-9]", "", named.get("plus", "") or "")
        move = clean_wt(pos.get(2, ""))
        if move:
            out["level"].append((level, int(mastery) if mastery else None, move))
    for _, body in find_template(seg, "learnlist/tm/za"):
        pos, _ = parse_params(body)
        tmno = re.sub(r"[^0-9]", "", pos.get(1, "") or "")
        move = clean_wt(pos.get(2, ""))
        if tmno and move:
            out["tm"].append((int(tmno), move))
    return out


def parse_za_learnlist_alt(html: str, default_fid: int) -> dict | None:
    """解析 pokemondb /pokedex/{slug}/moves/9 的 Legends: Z-A 面板。

    返回 {'level': {form_id: [(lv, slug, name)]}, 'tm': {form_id: [(num, slug, name)]}}；
    面板内有内层形态 tab（id 形如 tab-moves-N-level-{form_id}，与本库 forms.id 同源）
    时按形态分表，无内层 tab 时整体归入 default_fid。无 Z-A 面板返回 None。
    """
    m = re.search(r'href="#(tab-moves-\d+)"[^>]*>\s*Legends: Z-A\s*</a>', html)
    if not m:
        return None
    tab_id = m.group(1)
    span = _div_span(html, tab_id)
    if span is None:
        return None
    seg = html[span[0]:span[1]]
    out: dict = {"level": {}, "tm": {}}

    def _rows(segment: str, key: str, fid: int) -> None:
        tb = re.search(r"<table[^>]*>.*?</table>", segment, re.S)
        if not tb:
            return
        for row in re.findall(r"<tr.*?</tr>", tb.group(0), re.S):
            tds = re.findall(r"<td.*?</td>", row, re.S)
            if len(tds) < 2:
                continue
            mv = re.search(r'href="/move/([a-z0-9-]+)"', tds[1])
            if not mv:
                continue
            name = pdb_strip_tags(tds[1])
            if key == "level":
                lv = re.sub(r"[^0-9]", "", pdb_strip_tags(tds[0]))
                if lv:
                    out["level"].setdefault(fid, []).append((int(lv), mv.group(1), name))
            else:
                num = re.sub(r"[^0-9]", "", pdb_strip_tags(tds[0]))
                if num:
                    out["tm"].setdefault(fid, []).append((int(num), mv.group(1), name))

    for h3name, key in (("Moves learnt by level up", "level"), ("Moves learnt by TM", "tm")):
        h = seg.find(h3name)
        if h < 0:
            continue
        sub = seg[h:]
        fm = re.search(
            r'tabset-moves-game-form sv-tabs-wrapper.*?<div class="sv-tabs-tab-list">(.*?)</div>',
            sub, re.S)
        if not fm:
            _rows(sub, key, default_fid)
            continue
        # 内层按形态分段：面板 id 形如 tab-moves-{n}-level-{form_id}
        hit_any = False
        for im in re.finditer(r'<div class="sv-tabs-panel[^"]*" id="(tab-moves-\d+-[a-z]+-(\d+))"', sub):
            ispan = _div_span(seg, im.group(1))
            if ispan is None:
                continue
            fid = int(im.group(2))
            _rows(seg[ispan[0]:ispan[1]], key, fid)
            hit_any = True
        if not hit_any:
            _rows(sub, key, default_fid)
    return out


def _div_span(html: str, div_id: str) -> tuple[int, int] | None:
    """返回 id=div_id 的 div 在 html 中的 [start, end) 字节区间（平衡扫描）。"""
    open_m = re.search(rf'<div[^>]*\bid="{re.escape(div_id)}"', html)
    if not open_m:
        return None
    depth = 0
    for tag in re.finditer(r"<(/?)div\b[^>]*>", html[open_m.start():]):
        if tag.group(1) == "/":
            depth -= 1
        else:
            depth += 1
        if depth == 0:
            return (open_m.start(), open_m.start() + tag.end())
    return None


# ---------------------------------------------------------------- sandwiches

def parse_sandwiches(wt: str) -> list[dict]:
    i = wt.find("== 食谱列表 ==")
    if i < 0:
        i = wt.find("==食谱列表==")
    seg = wt[i:] if i >= 0 else wt
    j = seg.find("{|")
    if j < 0:
        return []
    table = seg[j:seg.find("\n|}", j) if seg.find("\n|}", j) > 0 else len(seg)]
    recipes = []
    for row in re.split(r"^\|-.*$", table, flags=re.M):
        cells = []
        for line in row.splitlines():
            ls = line.strip()
            if ls.startswith("!!") or ls.startswith("|}"):
                continue
            if ls.startswith("|"):
                cells.append(ls[1:].strip())
            elif cells and ls and not ls.startswith("!"):
                cells[-1] += " " + ls
        cells = [c for c in cells if not c.startswith("[[File:")]
        if len(cells) < 6 or not cells[0].strip().isdigit():
            continue
        num, name, ing, seas, eff, how = cells[0], cells[1], cells[2], cells[3], cells[4], cells[5]
        effects = []
        for part in eff.replace("<br>", "；").replace("<br/>", "；").split("；"):
            part = part.strip()
            m = re.match(r"^(.+?力)(?:：(.+?))?\s*Lv\.?\s*(\d)$", part)
            if m:
                effects.append({"power": m.group(1), "type": m.group(2) or "", "level": int(m.group(3))})
        recipes.append({
            "no": int(num),
            "name": clean_wt(name),
            "ingredients": "、".join(re.findall(r"\{\{bag\|([^|{}]+)", ing)),
            "seasonings": "、".join(re.findall(r"\{\{bag\|([^|{}]+)", seas)),
            "effects": effects,
            "how": clean_wt(how),
        })
    return recipes


# ---------------------------------------------------------------- 食材/调味料（野餐道具 + 食材 + 道具页）

def parse_picnic_condiments(wt: str) -> list[dict]:
    """野餐道具页 调味料 表：道具/说明/获取地点/价格"""
    out = []
    i = wt.find("===调味料===")
    if i < 0:
        return out
    j = wt.find("===三明治签===", i)
    seg = wt[i:j if j > 0 else len(wt)]
    for tb in wikitables(seg):
        for row in tb:
            cells = [cell_text(c) for c in row]
            if len(cells) >= 4 and cells[0] and not cells[0].startswith("道具") and "秘传" not in cells[0][:2]:
                price = cells[3].replace("$", "").strip()
                out.append({"name": cells[0], "kind": "调味料",
                            "desc": cells[1], "how": cells[2], "price": price})
    return out


def parse_food_ingredients(wt: str, section: str, kind: str) -> list[dict]:
    """食材页 {{道具列表}} 条目"""
    out = []
    i = wt.find(section)
    if i < 0:
        return out
    j = wt.find("==", i + len(section))
    seg = wt[i:j if j > 0 else len(wt)]
    for _, body in find_template(seg, "道具列表"):
        _, named = parse_params(body)
        name = clean_wt(named.get("name", ""))
        if not name:
            continue
        out.append({"name": name, "kind": kind,
                    "desc": clean_wt(named.get("desc", "")), "how": "", "price": ""})
    return out


def parse_item_how(wt: str) -> str:
    """道具页 {{道具地点|...|sv=...}} 的 sv 字段"""
    for _, body in find_template(wt, "道具地点"):
        _, named = parse_params(body)
        for key in ("sv", "swsh", "za"):
            if named.get(key):
                return clean_wt(named[key])
        break
    return ""


# ---------------------------------------------------------------- 甜甜圈

def _ni(s: str) -> int:
    try:
        return int(re.sub(r"[^0-9]", "", s) or 0)
    except ValueError:
        return 0


def parse_donuts_full(wt: str) -> dict:
    """甜甜圈页完整解析：types/special/berries/flavor_powers/intro。"""
    out = {"types": [], "special": [], "berries": [], "flavor_powers": [], "intro": ""}

    # 制作段：基础甜甜圈表（0→★5）
    i = wt.find("=== 制作 ===")
    j = wt.find("=== 效果 ===")
    make_seg = wt[i:j] if 0 <= i < j else ""
    m = re.search(r"在旅馆Ｚ的安馨儿.*?制作甜甜圈。", make_seg, re.S)
    if m:
        out["intro"] = clean_wt(m.group(0))
    for tb in wikitables(make_seg):
        for row in tb:
            cells = [cell_text(c) for c in row]
            if len(cells) >= 4 and cells[1] in ("蛋白霜", "咖喱", "蜜饯", "巧克力", "奶油", "综合"):
                out["types"].append({"flavor": cells[3], "name": cells[1], "desc": cells[2]})

    # 特殊甜甜圈表：13 列（含 rowspan=2 的食材列缺格时 12 列）
    k = wt.find("安抚并捕捉扭洞深处")
    if k > 0:
        end = wt.find("== 现实世界中 ==")
        seg = wt[k:end if end > 0 else len(wt)]
        for tb in wikitables(seg):
            last_ing = ""
            for row in tb:
                cells = [cell_text(c) for c in row]
                if len(cells) < 12 or not cells[1].endswith("甜甜圈"):
                    continue
                nums = cells[3:8]
                if not all(re.fullmatch(r"\d+", n) for n in nums):
                    continue
                if len(cells) >= 13:
                    ing = cells[8] or last_ing
                    if cells[8]:
                        last_ing = ing
                    power, target, rift, loc = cells[9], cells[10], cells[11], cells[12]
                else:  # 食材列被上一行 rowspan 占用
                    ing = last_ing
                    power, target, rift, loc = cells[8], cells[9], cells[10], cells[11]
                out["special"].append({
                    "name": cells[1], "desc": cells[2],
                    "sweet": _ni(cells[3]), "spicy": _ni(cells[4]),
                    "sour": _ni(cells[5]), "bitter": _ni(cells[6]), "fresh": _ni(cells[7]),
                    "ingredients": ing, "power": power, "target": target,
                    "rift": rift, "location": loc,
                })

    # 树果提供的效果
    bi = wt.find("=== 树果提供的效果 ===")
    bj = wt.find("=== 风味力量 ===")
    if 0 <= bi < bj:
        seg = wt[bi:bj]
        for tb in wikitables(seg):
            for row in tb:
                cells = [cell_text(c) for c in row]
                if len(cells) >= 8 and cells[0].endswith("果"):
                    out["berries"].append({
                        "name": cells[0],
                        "sweet": _ni(cells[1]), "spicy": _ni(cells[2]), "sour": _ni(cells[3]),
                        "bitter": _ni(cells[4]), "fresh": _ni(cells[5]),
                        "boost": cells[6], "energy": _ni(cells[7])})

    # 风味力量：表格 rowspan/colspan 布局不规则，使用人工整理的 curated 数据
    fp_file = CURATED / "flavor_powers_manual.json"
    if fp_file.exists():
        out["flavor_powers"] = json.loads(fp_file.read_text(encoding="utf-8"))
    return out


# ---------------------------------------------------------------- 咖喱饭

def parse_curries(wt: str) -> list[dict]:
    i = wt.find("==咖哩圖鑑==")
    j = wt.find("===圖鑑收集獎勵===")
    seg = wt[i:j if j > 0 else len(wt)]
    out = []
    for tb in wikitables(seg):
        carried_key = ""
        for row in tb:
            cells = [cell_text(c) for c in row]
            if not cells or not cells[0].isdigit():
                continue
            no = int(cells[0])
            name = cells[1]
            if len(cells) >= 6:
                key_raw = cells[4]
                m = re.search(r"\{\{i\|([^|}]+)", row[4]) or re.search(r"link=([^]|]+?)(?:（道具）)?\|", row[4])
                carried_key = (m.group(1) if m else key_raw)
                desc = cells[5]
            else:
                desc = cells[-1]
            out.append({"no": no, "name": name, "key_ingredient": carried_key, "desc": desc})
    return out


# ---------------------------------------------------------------- main

def main() -> None:
    if not DB_PATH.exists():
        sys.exit("poketools.db missing — run scripts/build_db.py first")
    con = sqlite3.connect(DB_PATH)

    # ---- 1. pokemon pages: get_methods + flavor ----
    species = con.execute("SELECT id, name_zh FROM species ORDER BY id").fetchall()
    print(f"[1/6] pokemon pages ({len(species)} species)")
    overrides = {}
    ov_file = CURATED / "species_title_overrides.json"
    if ov_file.exists():
        overrides = json.loads(ov_file.read_text(encoding="utf-8"))
    titles = [overrides.get(str(sid)) or name for sid, name in species]
    fetch_titles(titles)

    gm_rows, flavor_rows, form_flavor_rows, failed = [], [], [], []
    form_marker_unknown: list[dict] = []
    for sid, name in species:
        wt = get_wikitext(overrides.get(str(sid)) or name)
        if wt is None:
            failed.append({"species_id": sid, "name": name, "reason": "page not found"})
            continue
        gm = [r for r in parse_get_methods(wt) if not r["form"]]
        seen = set()
        for r in gm:
            key = (r["game"], r["version_label"], r["location"], r["method"], r["note"])
            if key in seen:
                continue
            seen.add(key)
            gm_rows.append((sid, r["game"], r["version_label"], r["location"], r["method"], r["note"]))
        fl, fl_forms, fl_unknown = parse_flavor(wt)
        for r in fl:
            flavor_rows.append((sid, r["game"], r["label"], r["text"]))
        for r in fl_forms:
            form_flavor_rows.append((sid, r["suffixes"], r["game"], r["label"], r["text"]))
        for u in fl_unknown:
            form_marker_unknown.append({"species_id": sid, "name": name,
                                        "field": u["field"], "marker": u["marker"],
                                        "text": u["text"]})

    print("  get_methods rows per game:", dict(Counter(g for _, g, *_ in gm_rows)))
    print("  flavor rows per game:", dict(Counter(g for _, g, *_ in flavor_rows)))
    print(f"  form flavor rows: {len(form_flavor_rows)}")
    if failed:
        print(f"  !! {len(failed)} species pages not found -> TODO.json")

    # ---- 2. TM pages ----
    print("[2/6] TM pages (000-260)")
    tm_titles = [f"招式学习器{fw(n)}" for n in range(0, 261)]
    fetch_titles(tm_titles)
    tm_rows, bdsp_machines, other_keys = [], [], Counter()
    move_id_by_zh = {z: mid for mid, z in con.execute("SELECT id, name_zh FROM moves")}
    for n in range(0, 261):
        wt = get_wikitext(f"招式学习器{fw(n)}")
        if wt is None:
            continue
        info = parse_tm_page(wt)
        other_keys.update(info["other_keys"])
        for key, vg in (("swsh", 20), ("sv", 25), ("za", 30)):
            d = info.get(key)
            if not d:
                continue
            loc, item = d["loc"], d["item"]
            # 朱紫 loc9 为空但制作素材齐全：TM 皆可在招式机器用 LP+素材制作（52poke 未整理地点）
            if not loc and item and key == "sv":
                loc = "在招式机器用 LP 与素材制作"
            if not loc:
                continue
            mid = move_id_by_zh.get(d["move"])
            if mid is None:
                mid = con.execute(
                    "SELECT move_id FROM machines WHERE vg=? AND machine_number=?",
                    (vg, n)).fetchone()
                mid = mid[0] if mid else None
            if mid is None:
                continue
            tm_rows.append((vg, n, mid, loc, item))
        # BDSP：TM001-100，机器表 PokeAPI 缺失，由 52poke 补全
        d = info.get("bdsp")
        if d and d["move"]:
            mid = (move_id_by_zh.get(d["move"])
                   or move_id_by_zh.get(MOVE_NAME_ALIASES.get(d["move"], "")))
            if mid is not None:
                bdsp_machines.append((23, n, mid, f"tm{n:03d}"))
                if d["loc"]:
                    tm_rows.append((23, n, mid, d["loc"], ""))

    # SwSh TR: generic how-to text joined to TR machine numbers
    tr_generic = "旷野地带用瓦特在瓦特商店购买；击败极巨团体战的野生宝可梦后概率获得"
    for (num, mid) in con.execute(
            "SELECT machine_number, move_id FROM machines WHERE vg=20 AND item_identifier LIKE 'tr%'"):
        tm_rows.append((20, num, mid, tr_generic, ""))

    # Z-A TM 获取地点：52poke 未整理，人工翻译自 pokemondb（curated，只补缺号）
    za_tm_curated = CURATED / "tm_locations_za_pokemondb.json"
    if za_tm_curated.exists():
        have_za = {n for v, n, *_ in tm_rows if v == 30}
        added = 0
        for r in json.loads(za_tm_curated.read_text(encoding="utf-8"))["rows"]:
            num = int(r["number"])
            if num in have_za:
                continue
            mid = con.execute(
                "SELECT move_id FROM machines WHERE vg=30 AND machine_number=?",
                (num,)).fetchone()
            if mid:
                tm_rows.append((30, num, mid[0], r["how"], ""))
                added += 1
        print(f"  za tm locations from curated pokemondb: +{added}")

    print("  tm_how rows per vg:", dict(Counter(v for v, *_ in tm_rows)))
    print("  bdsp machines from 52poke:", len(bdsp_machines))
    print("  unknown TMtable loc keys:", dict(other_keys))

    # ---- 3. Z-A learnsets ----
    print("[3/6] Z-A learnsets (52poke subpages + pokemondb fallback)")
    za_species = con.execute(
        """SELECT DISTINCT s.id, s.name_zh FROM dex_entries e
           JOIN regional_dexes d ON d.id = e.dex_id
           JOIN species s ON s.id = e.species_id
           WHERE d.game_id='legends-za' ORDER BY s.id""").fetchall()
    sub_titles = [f"{overrides.get(str(sid)) or name}/第九世代招式表" for sid, name in za_species]
    fetch_titles(sub_titles)
    za_rows, za_missing, za_tm_corrections = [], [], []
    # machines vg30+vg31：TM 编号 → 招式（游戏数据，52poke Z-A 表偶有编号↔招式错位如 TM091）
    tm_move_by_num: dict[int, int] = {}
    move_zh = dict(con.execute("SELECT id, name_zh FROM moves"))
    for vg, num, mid in con.execute(
            "SELECT vg, machine_number, move_id FROM machines WHERE vg IN (30,31)"):
        tm_move_by_num.setdefault(num, mid)
    for sid, name in za_species:
        base = overrides.get(str(sid)) or name
        wt = get_wikitext(f"{base}/第九世代招式表")
        if wt is None:
            za_missing.append({"species_id": sid, "name": name, "reason": "ZA subpage not found"})
            continue
        default_form = con.execute(
            "SELECT id FROM forms WHERE species_id=? ORDER BY is_default DESC, id LIMIT 1",
            (sid,)).fetchone()
        if not default_form:
            continue
        fid = default_form[0]
        parsed = parse_za_learnlist(wt)
        if not parsed["level"] and not parsed["tm"]:
            za_missing.append({"species_id": sid, "name": name,
                               "reason": "subpage has no Z-A move table section"})
            continue
        for level, mastery, move in parsed["level"]:
            mid = move_id_by_zh.get(move) or move_id_by_zh.get(MOVE_NAME_ALIASES.get(move, ""))
            if mid is None:
                za_missing.append({"species_id": sid, "name": name, "reason": f"ZA move not in db: {move}"})
                continue
            za_rows.append((fid, mid, "level-up", 30, level, mastery))
        for tmno, move in parsed["tm"]:
            mid = tm_move_by_num.get(tmno)
            by_name = move_id_by_zh.get(move) or move_id_by_zh.get(MOVE_NAME_ALIASES.get(move, ""))
            if mid is not None and by_name is not None and by_name != mid:
                # wiki 行的招式与游戏数据 machines 不符 → 以游戏数据为准并记录
                za_tm_corrections.append({"species_id": sid, "name": name, "tm": tmno,
                                          "wiki": move, "fixed_to": move_zh.get(mid)})
                by_name = mid
            elif mid is None:
                mid = by_name
            if mid is None:
                za_missing.append({"species_id": sid, "name": name, "reason": f"ZA tm move not in db: {move}"})
                continue
            za_rows.append((fid, mid, "machine", 30, None, None))
    print(f"  za learnset rows (52poke): {len(za_rows)} "
          f"(missing subpages: {len(set(m['species_id'] for m in za_missing))}, "
          f"tm corrections: {len(za_tm_corrections)})")

    # ---- 3b. PokemonDB 兜底（52poke 未写 Z-A 表的种类/形态）----
    form_species = dict(con.execute("SELECT id, species_id FROM forms"))
    covered_forms = {f for f, *_ in za_rows}
    move_by_ident = dict(con.execute("SELECT identifier, id FROM moves"))
    move_by_en = {k: v for k, v in con.execute("SELECT name_en, id FROM moves") if k}
    alt_rows: list[tuple] = []
    for sid, name in za_species:
        ident = con.execute("SELECT identifier FROM species WHERE id=?", (sid,)).fetchone()
        if not ident:
            continue
        html = pdb_fetch_html(f"pokedex/{ident[0]}/moves/9")
        if html is None:
            za_missing.append({"species_id": sid, "name": name,
                               "reason": "pokemondb page not found"})
            continue
        fid = con.execute(
            "SELECT id FROM forms WHERE species_id=? ORDER BY is_default DESC, id LIMIT 1",
            (sid,)).fetchone()
        if not fid:
            continue
        alt = parse_za_learnlist_alt(html, fid[0])
        if alt is None:
            za_missing.append({"species_id": sid, "name": name,
                               "reason": "pokemondb page has no Z-A panel"})
            continue
        if not alt["level"] and not alt["tm"]:
            za_missing.append({"species_id": sid, "name": name,
                               "reason": "pokemondb Z-A panel empty"})
            continue
        for key, method in (("level", "level-up"), ("tm", "machine")):
            for form_id, items in alt[key].items():
                if form_id in covered_forms:
                    continue  # 该形态 52poke 已覆盖（默认形态优先保 52poke 源）
                if form_id not in form_species or form_species[form_id] != sid:
                    za_missing.append({"species_id": sid, "name": name,
                                       "reason": f"pokemondb form_id {form_id} not in db"})
                    continue
                for lv_or_num, slug, disp in items:
                    mid = None
                    if key == "tm":
                        mid = tm_move_by_num.get(lv_or_num)
                    if mid is None:
                        mid = move_by_ident.get(slug) or move_by_en.get(disp)
                    if mid is None:
                        za_missing.append({"species_id": sid, "name": name,
                                           "reason": f"pokemondb move not in db: {slug}"})
                        continue
                    if key == "level":
                        alt_rows.append((form_id, mid, method, 30, lv_or_num, None))
                    else:
                        alt_rows.append((form_id, mid, method, 30, None, None))
    print(f"  za alt rows (pokemondb): {len(alt_rows)}")
    # 兜底已覆盖的形态不再是缺口：清掉 52poke 侧的对应 issue，只留真实问题
    final_covered = {form_species[f] for f, *_ in za_rows} | \
                    {form_species[f] for f, *_ in alt_rows if f in form_species}
    za_missing = [m for m in za_missing if m["species_id"] not in final_covered]
    print(f"  za learnset real gaps after fallback: {len(set(m['species_id'] for m in za_missing))}")
    if alt_rows:
        (CURATED / "za_learnsets_pokemondb.json").write_text(
            json.dumps({"source": "pokemondb.net /pokedex/{slug}/moves/9 Legends: Z-A 面板"
                                 "（52poke 未收录种类的兜底；mastery 不提供）",
                        "rows": [{"form_id": f, "move_id": m, "method": me, "vg": v,
                                  "level": lv, "mastery": ma}
                                 for f, m, me, v, lv, ma in alt_rows]},
                       ensure_ascii=False, indent=1), encoding="utf-8")

    # ---- 4. 特化功能页 ----
    print("[4/6] feature pages (sandwich/picnic/donut/curry)")
    fetch_titles(["三明治", "甜甜圈", "食材", "野餐道具"])
    sw_wt = get_wikitext("三明治") or ""
    recipes = parse_sandwiches(sw_wt)
    print(f"  sandwiches: {len(recipes)}")

    picnic = parse_picnic_condiments(get_wikitext("野餐道具") or "")
    food_wt = get_wikitext("食材") or ""
    picnic += parse_food_ingredients(food_wt, "=== 三明治的食材 ===", "食材")
    picnic += parse_food_ingredients(food_wt, "=== 咖喱饭的食材 ===", "咖喱食材")
    # 食材获取方式：道具页 道具地点 sv 字段
    ing_names = [p["name"] for p in picnic if p["kind"] in ("食材",) and not p["how"]]
    if ing_names:
        fetch_titles([f"{n}（道具）" for n in ing_names])
        for p in picnic:
            if p["kind"] == "食材" and not p["how"]:
                iwt = get_wikitext(f"{p['name']}（道具）")
                if iwt:
                    p["how"] = parse_item_how(iwt)
    print(f"  picnic items: {len(picnic)} (食材含获取方式: "
          f"{sum(1 for p in picnic if p['kind']=='食材' and p['how'])}/{sum(1 for p in picnic if p['kind']=='食材')})")

    # 咖喱页（原题「咖喱饭」）
    fetch_titles(["咖喱饭"])
    curry_wt = None
    for cand in ("咖喱饭", "咖喱飯"):
        curry_wt = get_wikitext(cand)
        if curry_wt:
            break
    if curry_wt is None:
        # 按缓存文件兜底
        p = CACHE / "咖喱饭.txt"
        if p.exists():
            curry_wt = p.read_text(encoding="utf-8")
    curries = parse_curries(curry_wt or "")
    print(f"  curries: {len(curries)}")

    # 甜甜圈（含树果效果/风味力量，复杂表用 curated 补丁）
    donut_wt = get_wikitext("甜甜圈") or ""
    donuts = parse_donuts_full(donut_wt)

    # ---- 5. write curated JSON ----
    print("[5/6] write curated JSON")
    CURATED.mkdir(parents=True, exist_ok=True)
    enc_json = [{"species_id": s, "game": g, "version_label": v, "location": l, "method": m, "note": n}
                for s, g, v, l, m, n in gm_rows]
    (CURATED / "encounters_52poke.json").write_text(
        json.dumps(enc_json, ensure_ascii=False, indent=1), encoding="utf-8")
    (CURATED / "flavor_52poke.json").write_text(
        json.dumps([{"species_id": s, "game": g, "label": lb, "text": t}
                    for s, g, lb, t in flavor_rows], ensure_ascii=False, indent=1),
        encoding="utf-8")
    (CURATED / "form_flavor_52poke.json").write_text(
        json.dumps([{"species_id": s, "suffix": fx, "game": g, "label": lb, "text": t}
                    for s, fx, g, lb, t in form_flavor_rows], ensure_ascii=False, indent=1),
        encoding="utf-8")
    (CURATED / "tm_locations.json").write_text(
        json.dumps([{"vg": v, "number": n, "move_id": m, "how": h, "materials": i}
                    for v, n, m, h, i in tm_rows], ensure_ascii=False, indent=1),
        encoding="utf-8")
    (CURATED / "sandwiches.json").write_text(
        json.dumps(recipes, ensure_ascii=False, indent=1), encoding="utf-8")
    (CURATED / "picnic_items.json").write_text(
        json.dumps(picnic, ensure_ascii=False, indent=1), encoding="utf-8")
    (CURATED / "curries.json").write_text(
        json.dumps(curries, ensure_ascii=False, indent=1), encoding="utf-8")
    (CURATED / "donuts.json").write_text(
        json.dumps(donuts, ensure_ascii=False, indent=1), encoding="utf-8")
    (CURATED / "za_learnsets.json").write_text(
        json.dumps([{"form_id": f, "move_id": m, "method": me, "level": lv, "mastery": ma}
                    for f, m, me, _, lv, ma in za_rows], ensure_ascii=False, indent=1),
        encoding="utf-8")

    todo = {"missing_species_pages": failed,
            "form_flavor_unparsed_markers": form_marker_unknown,
            "za_learnset_issues": za_missing,
            "za_tm_corrections": za_tm_corrections}
    (CURATED / "TODO.json").write_text(json.dumps(todo, ensure_ascii=False, indent=1),
                                       encoding="utf-8")

    # ---- 6. merge into DB ----
    print("[6/6] merge into DB")
    cur = con.cursor()

    def guarded(name: str, min_rows: int, merge_fn) -> None:
        """护栏：解析行数过低（抓取/解析失败）时跳过该表，防止清空已交付数据。"""
        try:
            n = merge_fn()
            if n < min_rows:
                print(f"  !! {name} 仅 {n} 行（<{min_rows}），跳过合并并保留原表", file=sys.stderr)
        except Exception as e:  # noqa: BLE001
            print(f"  !! {name} 合并异常：{e}，保留原表", file=sys.stderr)

    def _merge_get_methods():
        cur.execute("DELETE FROM get_methods")
        cur.executemany("INSERT INTO get_methods VALUES (?,?,?,?,?,?)", gm_rows)
        return len(gm_rows)

    def _merge_tm():
        cur.execute("DELETE FROM tm_how")
        cur.executemany("INSERT OR REPLACE INTO tm_how VALUES (?,?,?,?,?)", tm_rows)
        if bdsp_machines:
            cur.executemany("INSERT OR REPLACE INTO machines VALUES (?,?,?,?)", bdsp_machines)
        return len(tm_rows)

    def _merge_sandwiches():
        cur.execute("DELETE FROM sandwiches")
        cur.executemany("INSERT OR REPLACE INTO sandwiches VALUES (?,?,?,?,?,?)",
                        [(r["no"], r["name"], r["ingredients"], r["seasonings"],
                          json.dumps(r["effects"], ensure_ascii=False), r["how"]) for r in recipes])
        return len(recipes)

    def _merge_picnic():
        cur.execute("DELETE FROM picnic_items")
        cur.executemany("INSERT OR REPLACE INTO picnic_items VALUES (?,?,?,?,?)",
                        [(p["name"], p["kind"], p["desc"], p["how"], p["price"]) for p in picnic])
        return len(picnic)

    def _merge_curries():
        cur.execute("DELETE FROM curries")
        cur.executemany("INSERT OR REPLACE INTO curries VALUES (?,?,?,?)",
                        [(c["no"], c["name"], c["key_ingredient"], c["desc"]) for c in curries])
        return len(curries)

    def _merge_donut_types():
        cur.execute("DELETE FROM donut_types")
        cur.executemany("INSERT OR REPLACE INTO donut_types VALUES (?,?,?)",
                        [(t["flavor"], t["name"], t["desc"]) for t in donuts["types"]])
        return len(donuts["types"])

    guarded("get_methods", 1000, _merge_get_methods)
    guarded("tm_how", 100, _merge_tm)
    guarded("sandwiches", 100, _merge_sandwiches)
    guarded("picnic_items", 60, _merge_picnic)
    guarded("curries", 100, _merge_curries)
    guarded("donut_types", 5, _merge_donut_types)
    cur.execute("DELETE FROM special_donuts")
    cur.executemany("INSERT OR REPLACE INTO special_donuts VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
                    [(d["name"], d["desc"], d["sweet"], d["spicy"], d["sour"], d["bitter"], d["fresh"],
                      d["ingredients"], d["power"], d["target"], d["rift"], d["location"])
                     for d in donuts["special"]])
    cur.execute("DELETE FROM berries")
    cur.executemany("INSERT OR REPLACE INTO berries VALUES (?,?,?,?,?,?,?,?)",
                    [(b["name"], b["sweet"], b["spicy"], b["sour"], b["bitter"], b["fresh"],
                      b["boost"], b["energy"]) for b in donuts["berries"]])
    cur.execute("DELETE FROM flavor_powers")
    cur.executemany("INSERT OR REPLACE INTO flavor_powers VALUES (?,?,?,?,?,?,?)",
                    [(f["flavor"], f["power"], f["effect"], f["lv1"], f["lv2"], f["lv3"], f["prefix"])
                     for f in donuts["flavor_powers"]])
    if za_rows or alt_rows:
        cur.execute("DELETE FROM learnsets WHERE vg=30")
        cur.executemany("INSERT OR REPLACE INTO learnsets VALUES (?,?,?,?,?,?)",
                        za_rows + alt_rows)
    else:
        print("  !! Z-A 学习集为空（抓取全失败？），跳过 vg30 合并以保护已有数据",
              file=sys.stderr)
    # 52poke flavor overrides PokeAPI flavor（空结果护栏）
    if not flavor_rows:
        print("  !! flavor_rows 为空，跳过 dex_flavor 合并", file=sys.stderr)
    else:
        cur.execute("DELETE FROM dex_flavor WHERE game IN ('legends-arceus','scarlet-violet','legends-za',?)", (BDSP,))
        for s, g, lb, txt in flavor_rows:
            cur.execute("DELETE FROM dex_flavor WHERE species_id=? AND game=? AND version_label=?",
                        (s, g, lb))
            cur.execute("INSERT INTO dex_flavor VALUES (?,?,?,?)", (s, g, lb, txt))

    # 形态独立图鉴介绍（suffix → form_id）。匹配优先级：尾部精确（marowak-alola）
    # > 整体相等（rotom-heat）> 中缀（darmanitan-galar-standard），
    # 中缀命中时带 -standard 的形态优先于兄弟形态（达摩模式等）。
    cur.execute("DELETE FROM form_flavor")
    unmatched = []
    for s, suffixes, g, lb, txt in form_flavor_rows:
        row = None
        for suffix in suffixes:  # 候选按顺序，首个命中即用
            row = con.execute(
                """SELECT id, identifier,
                       CASE
                         WHEN identifier LIKE '%-'||? THEN 0
                         WHEN identifier = ? THEN 1
                         WHEN identifier LIKE '%-'||?||'-%' THEN 2
                         ELSE 9 END AS score
                   FROM forms WHERE species_id=? AND score < 9
                   ORDER BY score,
                     CASE WHEN identifier LIKE '%-standard' THEN 0 ELSE 1 END,
                     LENGTH(identifier)
                   LIMIT 1""",
                (suffix, suffix, suffix, s)).fetchone()
            if row:
                break
        if row is None:
            unmatched.append((s, suffixes))
            continue
        cur.execute("DELETE FROM form_flavor WHERE form_id=? AND game=? AND version_label=?",
                    (row[0], g, lb))
        cur.execute("INSERT INTO form_flavor VALUES (?,?,?,?)", (row[0], g, lb, txt))
    if unmatched:
        print(f"  !! form_flavor 未匹配形态: {sorted(set(map(str, unmatched)))[:10]}")
    con.commit()

    for t in ("get_methods", "dex_flavor", "form_flavor", "tm_how", "sandwiches", "picnic_items",
              "curries", "donut_types", "special_donuts", "berries", "flavor_powers"):
        n = con.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0]
        print(f"  {t:16s} {n}")
    n = con.execute("SELECT COUNT(*) FROM learnsets WHERE vg=30").fetchone()[0]
    print(f"  learnsets(vg30)    {n}")
    con.close()
    print("OK")


if __name__ == "__main__":
    main()
