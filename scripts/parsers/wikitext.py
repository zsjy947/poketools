"""wikitext 工具（O6 自 scrape_52poke 拆分）：模板查找/参数切分/清洗/wikitable 解析。"""
from __future__ import annotations

import re

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
            body = body.removeprefix("|")
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


_RE_ZH = re.compile(r"-\{\s*zh-hans:([^;{}]*?)\s*;\s*zh-hant:.*?\}-", re.DOTALL)
_RE_ZH2 = re.compile(r"-\{\s*zh-hant:[^;{}]*?\s*;\s*zh-hans:([^;{}]*?)\s*\}-", re.DOTALL)
_RE_TT = re.compile(r"\{\{tt\|([^|{}]*)(?:\|[^{}]*)?\}\}")
_RE_SIMPLE = [
    (re.compile(r"\{\{bag\|([^|{}]+)(?:\|[^{}]*)?\}\}"), r"\1"),
    (re.compile(r"\{\{[iamp]\|([^|{}]+)(?:\|[^{}]*)?\}\}"), r"\1"),
    (re.compile(r"\{\{typelink\|([^|{}]+)(?:\|[^{}]*)?\}\}"), r"\1"),
    (re.compile(r"\{\{rt\|([^|{}]+)\|[^{}]*\}\}"), r"\1号道路"),
    (re.compile(r"\{\{par\|([^|{}]+)\|([^|{}]+)\}\}"), r"\1（\2）"),
    (re.compile(r"\{\{E\|([^|{}]+)\}\}"), r"\1"),
    (re.compile(r"\{\{(?:GameIconzh/\d+|game4?|MS\w*|[sS]up(?:/[a-zA-Z0-9]*)?)[^{}]*\}\}"), ""),
    (re.compile(r"\[\[File:[^\]]*\]\]"), ""),
    (re.compile(r"<!--.*?-->", re.DOTALL), ""),
    (re.compile(r"<ref[^>]*>.*?</ref>", re.DOTALL), ""),
    (re.compile(r"<ref[^>]*/>"), ""),
]
_RE_LINK = re.compile(r"\[\[([^\]|]*)\|([^\]]*)\]\]")
_RE_LINK2 = re.compile(r"\[\[([^\]]*)\]\]")
_RE_TAIL = re.compile(r"<small>（[^<]*）</small>")

# {{[sS]up/W|X}}：天气/星期上标模板 → 中文括注。取值经 data/raw/52poke-cache/ 全量枚举人工核定；
# 未能识别的取值由 scrape_52poke 收集落 data/curated/TODO.json（sup_weather_unmapped）。
SUP_WEATHER_ZH: dict[str, str] = {
    # 天气（单字图标缩写 → 通用天气名；剑盾旷野 9 种 + 传说 阿尔宙斯全词直传）
    "晴": "晴朗", "阴": "阴天", "雨": "雨天", "雷": "雷雨", "雪": "下雪",
    "冰": "暴风雪", "沙": "沙暴", "雾": "大雾", "曝": "烈日",
    "冰雹": "冰雹", "下雨": "下雨", "沙暴": "沙暴", "暴风雪": "暴风雪",
    # 星期（获取方式按星期几限定：捕虫大赛/传说定点/阿罗拉按星期变化的天气）
    "一": "星期一", "二": "星期二", "三": "星期三", "四": "星期四",
    "五": "星期五", "六": "星期六", "日": "星期日",
    "1": "星期一", "2": "星期二", "3": "星期三", "4": "星期四",
    "5": "星期五", "6": "星期六", "7": "星期日",
}
unknown_sup_weather: set[str] = set()

_RE_SUPW_ONE = re.compile(r"\{\{[sS]up/W\|([^{}|]+)\}\}")
_RE_SUPW_RUN = re.compile(r"(?:\{\{[sS]up/W\|[^{}|]+\}\})+")
_RE_INNER_TEMPLATE = re.compile(r"\{\{([^{}]*)\}\}")


def _annotate_weather(s: str) -> str:
    """连续的天气上标模板合并为一处「（值、值）」括注；未识别取值保留原文并登记。"""
    def _run(m: re.Match[str]) -> str:
        zh = []
        for raw in _RE_SUPW_ONE.findall(m.group(0)):
            v = raw.strip()
            if v in SUP_WEATHER_ZH:
                zh.append(SUP_WEATHER_ZH[v])
            else:
                unknown_sup_weather.add(v)
                zh.append(v)
        return f"（{'、'.join(zh)}）" if zh else ""
    return _RE_SUPW_RUN.sub(_run, s)


def _fold_inner(m: re.Match[str]) -> str:
    """内层（无嵌套）模板折叠：取最后一个非空参数。"""
    last = [p for p in m.group(1).split("|") if p.strip()]
    return last[-1] if last else ""


def clean_wt(s: str | None) -> str:
    if not s:
        return ""
    s = _RE_SIMPLE[8][0].sub("", s)  # <!--...-->
    s = _RE_SIMPLE[9][0].sub("", s)  # <ref>...
    s = _RE_SIMPLE[10][0].sub("", s)  # <ref/>
    s = _RE_SIMPLE[7][0].sub("", s)  # [[File:...]]
    s = _annotate_weather(s)  # sup/W 先于折叠与剥除（否则会散落成裸字/残留）
    s = _RE_ZH2.sub(lambda m: m.group(1), s)
    s = _RE_ZH.sub(lambda m: m.group(1), s)
    while True:  # 全量折叠：每轮替换当轮全部最内层模板，直至无变化
        for _ in range(4):
            s = _RE_LINK.sub(lambda m: m.group(2), s)
            s = _RE_LINK2.sub(lambda m: m.group(1), s)
            s = _RE_TT.sub(r"\1", s)
            for rx, rep in _RE_SIMPLE[:7]:
                s = rx.sub(rep, s)
        folded = _RE_INNER_TEMPLATE.sub(_fold_inner, s)
        if folded == s:
            break
        s = folded
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
        if ls.startswith(("{|", "|}")):
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


