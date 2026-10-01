"""特化功能表解析（O6 拆分）：三明治/野餐食材调味料/甜甜圈/咖喱。"""
from __future__ import annotations

import json
import re
from pathlib import Path

from . import wikitext as _wt

CURATED = Path(__file__).resolve().parent.parent.parent / "data" / "curated"

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
    for row in re.split(r"^\|-.*$", table, flags=re.MULTILINE):
        cells = []
        for line in row.splitlines():
            ls = line.strip()
            if ls.startswith(("!!", "|}")):
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
            "name": _wt.clean_wt(name),
            "ingredients": "、".join(re.findall(r"\{\{bag\|([^|{}]+)", ing)),
            "seasonings": "、".join(re.findall(r"\{\{bag\|([^|{}]+)", seas)),
            "effects": effects,
            "how": _wt.clean_wt(how),
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
    for tb in _wt.wikitables(seg):
        for row in tb:
            cells = [_wt.cell_text(c) for c in row]
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
    for _, body in _wt.find_template(seg, "道具列表"):
        _, named = _wt.parse_params(body)
        name = _wt.clean_wt(named.get("name", ""))
        if not name:
            continue
        out.append({"name": name, "kind": kind,
                    "desc": _wt.clean_wt(named.get("desc", "")), "how": "", "price": ""})
    return out


def parse_item_how(wt: str) -> str:
    """道具页 {{道具地点|...|sv=...}} 的 sv 字段"""
    for _, body in _wt.find_template(wt, "道具地点"):
        _, named = _wt.parse_params(body)
        for key in ("sv", "swsh", "za"):
            if named.get(key):
                return _wt.clean_wt(named[key])
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
    m = re.search(r"在旅馆Ｚ的安馨儿.*?制作甜甜圈。", make_seg, re.DOTALL)
    if m:
        out["intro"] = _wt.clean_wt(m.group(0))
    for tb in _wt.wikitables(make_seg):
        for row in tb:
            cells = [_wt.cell_text(c) for c in row]
            if len(cells) >= 4 and cells[1] in ("蛋白霜", "咖喱", "蜜饯", "巧克力", "奶油", "综合"):
                out["types"].append({"flavor": cells[3], "name": cells[1], "desc": cells[2]})

    # 特殊甜甜圈表：13 列（含 rowspan=2 的食材列缺格时 12 列）
    k = wt.find("安抚并捕捉扭洞深处")
    if k > 0:
        end = wt.find("== 现实世界中 ==")
        seg = wt[k:end if end > 0 else len(wt)]
        for tb in _wt.wikitables(seg):
            last_ing = ""
            for row in tb:
                cells = [_wt.cell_text(c) for c in row]
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
        for tb in _wt.wikitables(seg):
            for row in tb:
                cells = [_wt.cell_text(c) for c in row]
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
    for tb in _wt.wikitables(seg):
        carried_key = ""
        for row in tb:
            cells = [_wt.cell_text(c) for c in row]
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


