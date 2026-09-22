"""Scrape game-specific Chinese data from wiki.52poke.com and merge into poketools.db.

Outputs curated JSON to data/curated/ (committed to git) and merges into DB:
  - get_methods  : 捕捉方式 (SV / PLA / Z-A primarily; SwSh as fallback to PokeAPI)
  - dex_flavor   : 图鉴描述 (ladex/scdex/videx/zadex + sdex/bdex)
  - tm_how       : 招式学习器获取方式与素材 (SV loc9/item9, SwSh locswsh, Z-A best-effort)
  - sandwiches   : 朱紫三明治食谱

Run AFTER scripts/build_db.py. All pages cached to data/raw/52poke-cache/.
"""
from __future__ import annotations

import json
import re
import sqlite3
import sys
import time
from collections import Counter
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parent.parent
DB_PATH = ROOT / "data" / "poketools.db"
CACHE = ROOT / "data" / "raw" / "52poke-cache"
CURATED = ROOT / "data" / "curated"

API = "https://wiki.52poke.com/api.php"
UA = "poketools/0.1 (personal offline tool; one-shot build)"
BATCH = 40

# game code (gen, code) -> our game id
CODE_MAP = {}
for c in ("SW", "SH", "SWSH", "SWSHE", "SWE", "SHE", "IA", "A", "CT", "C", "IASw", "CTSw"):
    CODE_MAP[(8, c.upper())] = "sword-shield"
CODE_MAP[(8, "LA")] = "legends-arceus"
CODE_MAP[(8, "PLA")] = "legends-arceus"
for c in ("SV", "SC", "S", "VI", "V", "SVT", "TM", "ID"):
    CODE_MAP[(9, c.upper())] = "scarlet-violet"
for c in ("ZA", "LZ", "ZAM", "LZM"):
    CODE_MAP[(9, c.upper())] = "legends-za"

FLAVOR_FIELDS = {
    "sdex": ("sword-shield", "剑"), "bdex": ("sword-shield", "盾"),
    "ladex": ("legends-arceus", "洗翠"),
    "scdex": ("scarlet-violet", "朱"), "videx": ("scarlet-violet", "紫"),
    "zadex": ("legends-za", "Z-A"),
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

# ---------------------------------------------------------------- wiki fetch

_session = requests.Session()
_session.headers["User-Agent"] = UA
_aliases: dict[str, str] = {}


def _cache_path(title: str) -> Path:
    safe = re.sub(r'[\\/:*?"<>|]', "_", title)
    return CACHE / f"{safe}.txt"


def fetch_titles(titles: list[str]) -> None:
    """Download wikitext for titles into cache (50-ish per request, with continue)."""
    CACHE.mkdir(parents=True, exist_ok=True)
    todo = [t for t in dict.fromkeys(titles) if not _cache_path(t).exists()]
    if not todo:
        return
    print(f"  fetching {len(todo)} pages from 52poke ...")
    for i in range(0, len(todo), BATCH):
        chunk = todo[i:i + BATCH]
        params = {
            "action": "query", "prop": "revisions", "rvprop": "content",
            "rvslots": "main", "titles": "|".join(chunk),
            "format": "json", "formatversion": "2", "redirects": 1,
        }
        for attempt in range(4):
            try:
                while True:
                    r = _session.get(API, params=params, timeout=90)
                    if r.status_code in (429, 503):
                        time.sleep(5 * (attempt + 1)); continue
                    r.raise_for_status()
                    data = r.json()
                    break
                break
            except Exception:
                if attempt == 3:
                    print(f"  !! batch {i} failed, skipping")
                    data = None
                    break
                time.sleep(3)
        if data is None:
            continue
        q = data.get("query", {})
        for red in q.get("redirects", []):
            _aliases[red["from"]] = red["to"]
        for page in q.get("pages", []):
            if page.get("missing"):
                continue
            revs = page.get("revisions") or []
            if revs:
                txt = revs[0]["slots"]["main"]["content"]
                _cache_path(page["title"]).write_text(txt, encoding="utf-8")
        cont = data.get("continue")
        if cont:  # response split: refetch same chunk with continuation
            params.update(cont)
            _session.get(API, params=params, timeout=90)  # content already merged above loop
        time.sleep(0.6)
        done = min(i + BATCH, len(todo))
        if done % 200 == 0 or done == len(todo):
            print(f"    {done}/{len(todo)}")


def get_wikitext(title: str) -> str | None:
    for t in (title, _aliases.get(title), f"{title}（宝可梦）"):
        if not t:
            continue
        p = _cache_path(t)
        if p.exists():
            return p.read_text(encoding="utf-8")
    return None


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
    s = s.replace("\r", "").replace("\n", " ").replace("\t", " ")
    return re.sub(r"\s+", " ", s).strip()


# ---------------------------------------------------------------- pokemon pages

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
        game = CODE_MAP.get((gen, code))
        if not game:
            continue
        rowspan = pos.get(4, "1").strip()
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
            "game": game, "location": loc, "method": method, "note": note,
            "form": bool(re.match(r"^\d{3,4}[A-Za-z]", pos.get(1, "").strip())),
        })
    return rows


def parse_flavor(wt: str) -> list[dict]:
    out = []
    for _, body in find_template(wt, "图鉴"):
        _, named = parse_params(body)
        for field, (game, label) in FLAVOR_FIELDS.items():
            val = named.get(field)
            if not val:
                continue
            text = clean_wt(val)
            if text:
                out.append({"game": game, "label": label, "text": text})
        break  # only the first {{图鉴}} block
    return out


# ---------------------------------------------------------------- TM pages

def fw(n: int) -> str:
    return "".join("０１２３４５６７８９"[int(c)] for c in f"{n:03d}")


def parse_tm_page(wt: str) -> dict:
    """Return {'sv': {'loc':..,'item':..,'move':..}, 'swsh': {...}, 'za': ..., 'other_keys': [...]}"""
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
        # group per game suffix
        for suffix, game in (("9", "scarlet-violet"), ("swsh", "sword-shield"),
                             ("sw", "sword-shield"), ("za", "legends-za"),
                             ("lz", "legends-za")):
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
            if k.startswith("loc") and not any(k.endswith(s) for s in ("9", "swsh", "sw", "za", "lz")):
                res["other_keys"].append(k)
        break
    return res


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


# ---------------------------------------------------------------- main

def main() -> None:
    if not DB_PATH.exists():
        sys.exit("poketools.db missing — run scripts/build_db.py first")
    con = sqlite3.connect(DB_PATH)

    # ---- 1. pokemon pages: get_methods + flavor ----
    species = con.execute("SELECT id, name_zh FROM species ORDER BY id").fetchall()
    print(f"[1/4] pokemon pages ({len(species)} species)")
    overrides = {}
    ov_file = CURATED / "species_title_overrides.json"
    if ov_file.exists():
        overrides = json.loads(ov_file.read_text(encoding="utf-8"))
    titles = [overrides.get(str(sid)) or name for sid, name in species]
    fetch_titles(titles)

    gm_rows, flavor_rows, failed = [], [], []
    for sid, name in species:
        wt = get_wikitext(overrides.get(str(sid)) or name)
        if wt is None:
            failed.append({"species_id": sid, "name": name, "reason": "page not found"})
            continue
        gm = [r for r in parse_get_methods(wt) if not r["form"]]
        seen = set()
        for r in gm:
            key = (r["game"], r["location"], r["method"], r["note"])
            if key not in seen:
                seen.add(key)
                gm_rows.append((sid, r["game"], r["location"], r["method"], r["note"]))
        fl = parse_flavor(wt)
        for r in fl:
            flavor_rows.append((sid, r["game"], r["label"], r["text"]))

    gm_games = Counter(g for _, g, *_ in gm_rows)
    print("  get_methods rows per game:", dict(gm_games))
    print("  flavor rows per game:", dict(Counter(g for _, g, *_ in flavor_rows)))
    if failed:
        print(f"  !! {len(failed)} species pages not found -> TODO.json")

    # ---- 2. TM pages ----
    print("[2/4] TM pages (000-260)")
    tm_titles = [f"招式学习器{fw(n)}" for n in range(0, 261)]
    fetch_titles(tm_titles)
    tm_rows, other_keys = [], Counter()
    move_id_by_zh = {z: mid for mid, z in con.execute("SELECT id, name_zh FROM moves")}
    for n in range(0, 261):
        wt = get_wikitext(f"招式学习器{fw(n)}")
        if wt is None:
            continue
        info = parse_tm_page(wt)
        other_keys.update(info["other_keys"])
        for game, vg in (("sword-shield", 20), ("scarlet-violet", 25), ("legends-za", 30)):
            d = info.get(game)
            if not d or not d["loc"]:
                continue
            mid = move_id_by_zh.get(d["move"])
            if mid is None:
                mid = con.execute(
                    "SELECT move_id FROM machines WHERE vg=? AND machine_number=?",
                    (vg, n)).fetchone()
                mid = mid[0] if mid else None
            if mid is None:
                continue
            tm_rows.append((vg, n, mid, d["loc"], d["item"]))

    # SwSh TR: generic how-to text joined to TR machine numbers
    tr_generic = "旷野地带用瓦特在瓦特商店购买；击败极巨团体战的野生宝可梦后概率获得"
    for (num, mid) in con.execute(
            "SELECT machine_number, move_id FROM machines WHERE vg=20 AND item_identifier LIKE 'tr%'"):
        tm_rows.append((20, num, mid, tr_generic, ""))

    print("  tm_how rows per vg:", dict(Counter(v for v, *_ in tm_rows)))
    print("  unknown TMtable loc keys:", dict(other_keys))

    # ---- 3. sandwiches ----
    print("[3/4] sandwiches")
    fetch_titles(["三明治"])
    sw_wt = get_wikitext("三明治") or ""
    recipes = parse_sandwiches(sw_wt)
    print(f"  parsed {len(recipes)} recipes")
    if not recipes:
        print("  !! sandwich table parse failed -> TODO.json")

    # ---- 4. write curated JSON + merge into DB ----
    print("[4/4] write curated JSON + merge into DB")
    CURATED.mkdir(parents=True, exist_ok=True)
    enc_json = [{"species_id": s, "game": g, "location": l, "method": m, "note": n}
                for s, g, l, m, n in gm_rows]
    (CURATED / "encounters_52poke.json").write_text(
        json.dumps(enc_json, ensure_ascii=False, indent=1), encoding="utf-8")
    (CURATED / "flavor_52poke.json").write_text(
        json.dumps([{"species_id": s, "game": g, "label": lb, "text": t}
                    for s, g, lb, t in flavor_rows], ensure_ascii=False, indent=1),
        encoding="utf-8")
    (CURATED / "tm_locations.json").write_text(
        json.dumps([{"vg": v, "number": n, "move_id": m, "how": h, "materials": i}
                    for v, n, m, h, i in tm_rows], ensure_ascii=False, indent=1),
        encoding="utf-8")
    (CURATED / "sandwiches.json").write_text(
        json.dumps(recipes, ensure_ascii=False, indent=1), encoding="utf-8")

    todo = {"missing_species_pages": failed}
    (CURATED / "TODO.json").write_text(json.dumps(todo, ensure_ascii=False, indent=1),
                                       encoding="utf-8")

    cur = con.cursor()
    cur.execute("DELETE FROM get_methods")
    cur.executemany("INSERT INTO get_methods VALUES (?,?,?,?,?)", gm_rows)
    cur.execute("DELETE FROM tm_how")
    cur.executemany("INSERT OR REPLACE INTO tm_how VALUES (?,?,?,?,?)", tm_rows)
    cur.execute("DELETE FROM sandwiches")
    cur.executemany("INSERT OR REPLACE INTO sandwiches VALUES (?,?,?,?,?,?)",
                    [(r["no"], r["name"], r["ingredients"], r["seasonings"],
                      json.dumps(r["effects"], ensure_ascii=False), r["how"]) for r in recipes])
    # 52poke flavor overrides PokeAPI flavor
    cur.execute("DELETE FROM dex_flavor WHERE game IN ('legends-arceus','scarlet-violet','legends-za')")
    for s, g, lb, t in flavor_rows:
        cur.execute("DELETE FROM dex_flavor WHERE species_id=? AND game=? AND version_label=?",
                    (s, g, lb))
        cur.execute("INSERT INTO dex_flavor VALUES (?,?,?,?)", (s, g, lb, t))
    con.commit()

    for t in ("get_methods", "dex_flavor", "tm_how", "sandwiches"):
        n = con.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0]
        print(f"  {t:14s} {n}")
    con.close()
    print("OK")


if __name__ == "__main__":
    main()
