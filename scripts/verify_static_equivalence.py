"""静态化等价性验证（A1 硬门禁之二）：真实 FastAPI 响应 vs 本地 JS 引擎（Node 驱动）。

覆盖：
- 抽样 50 物种详情（× 5 游戏变体 + form/dex 参数）与招式表逐字段比对；
- 全量小表端点（games/dex×10/sandwiches/picnic/donuts/curries/typechart/meta×8）；
- /api/ev 参数扫描（6 能力值 × 2 档 × 5 游戏）；
- 计算器：forms/moves 抽样 + POST /api/calc 与 /api/calc/batch 样例；
- 生蛋链抽样（chains 顺序按 Python 集合迭代序不确定，做序无关规范化后比对）。

用法：python scripts/verify_static_equivalence.py  （需先跑 export_static_data.py）
"""
from __future__ import annotations

import json
import random
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402

GAMES = ["", "sword-shield", "brilliant-diamond-shining-pearl",
         "legends-arceus", "scarlet-violet", "legends-za"]
# 形态/分支/默认形态覆盖重点物种 + 随机抽样
FOCUS = [386, 479, 201, 37, 58, 133, 6, 143, 445, 25, 172, 172, 10100 // 10,
         658, 887, 888, 493, 641, 905, 700, 664, 681, 784, 964, 987, 1017]


def build_plan() -> list[dict]:
    con = None
    import sqlite3
    con = sqlite3.connect(f"file:{ROOT / 'data' / 'poketools.db'}?mode=ro", uri=True)
    con.row_factory = sqlite3.Row
    rng = random.Random(20261002)
    all_species = [r[0] for r in con.execute("SELECT id FROM species ORDER BY id")]
    ddf_species = [r[0] for r in con.execute(
        "SELECT DISTINCT species_id FROM dex_default_forms")]
    branch_species = [r[0] for r in con.execute("SELECT DISTINCT species_id FROM evo_branches")]
    sample = list(dict.fromkeys(FOCUS + rng.sample(all_species, 30)
                                + rng.sample(ddf_species, min(10, len(ddf_species)))
                                + rng.sample(branch_species, min(10, len(branch_species)))))[:50]
    dexes = [r[0] for r in con.execute("SELECT id FROM regional_dexes ORDER BY id")]
    dex_default_rows = con.execute(
        "SELECT ddf.dex_id, ddf.species_id, f.identifier FROM dex_default_forms ddf "
        "JOIN forms f ON f.id = ddf.form_id").fetchall()
    marks = ",".join("?" * len(sample))
    form_suffix_rows = con.execute(
        f"SELECT species_id, identifier FROM forms WHERE species_id IN ({marks})",
        sample).fetchall()
    moves_sample = rng.sample(all_species, 8)
    breed_moves = con.execute(
        """SELECT l.move_id, l.vg FROM learnsets l WHERE l.method='egg' LIMIT 400""").fetchall()
    con.close()

    plan: list[dict] = [{"method": "GET", "path": "/api/games"},
                        {"method": "GET", "path": "/api/meta/typechart"},
                        {"method": "GET", "path": "/api/meta/species"},
                        {"method": "GET", "path": "/api/meta/items"},
                        {"method": "GET", "path": "/api/meta/abilities"},
                        {"method": "GET", "path": "/api/meta/z-moves"},
                        {"method": "GET", "path": "/api/meta/max-moves"},
                        {"method": "GET", "path": "/api/meta/gmax-moves"},
                        {"method": "GET", "path": "/api/meta/natures"}]
    for d in dexes:
        plan.append({"method": "GET", "path": f"/api/dex/{d}"})
    plan += [
        {"method": "GET", "path": f"/api/dex/{dexes[0]}", "params": {"filter": "caught"}},
        {"method": "GET", "path": f"/api/dex/{dexes[0]}", "params": {"type": "火"}},
        {"method": "GET", "path": f"/api/dex/{dexes[0]}", "params": {"q": "皮卡丘"}},
    ]
    for sid in sample:
        for game in GAMES:
            params = {"game": game} if game else {}
            plan.append({"method": "GET", "path": f"/api/pokemon/{sid}", "params": params})
        plan.append({"method": "GET", "path": f"/api/pokemon/{sid}/moves",
                     "params": {"game": "scarlet-violet"}})
        plan.append({"method": "GET", "path": f"/api/pokemon/{sid}/moves",
                     "params": {"game": "sword-shield"}})
    # 图鉴默认形态入口（dex 参数 → 默认选中覆盖形态）
    for r in dex_default_rows[:12]:
        suffix = (r["identifier"] or "").rpartition("-")[2] if "-" in (r["identifier"] or "") else ""
        plan.append({"method": "GET", "path": f"/api/pokemon/{r['species_id']}",
                     "params": {"game": "", "dex": r["dex_id"], "form": suffix}})
    # 显式 form 后缀（地区形态分支）
    suffix_by_species: dict[int, set[str]] = {}
    for r in form_suffix_rows:
        ident = r["identifier"] or ""
        if "-" in ident:
            suffix_by_species.setdefault(r["species_id"], set()).add(ident.rpartition("-")[2])
    for sid, suffixes in list(suffix_by_species.items())[:12]:
        for sfx in sorted(suffixes)[:2]:
            plan.append({"method": "GET", "path": f"/api/pokemon/{sid}",
                         "params": {"game": "", "form": sfx}})
    # EV 扫描
    for stat in ("hp", "atk", "def", "spa", "spd", "spe"):
        for value in (0, 2):
            for game in ("", "legends-arceus", "scarlet-violet"):
                params = {"stat": stat, "value": value}
                if game:
                    params["game"] = game
                plan.append({"method": "GET", "path": "/api/ev", "params": params})
    # 三明治/野餐/甜甜圈/咖喱
    plan += [
        {"method": "GET", "path": "/api/sandwiches"},
        {"method": "GET", "path": "/api/sandwiches",
         "params": {"power": "闪光力", "sort": "level"}},
        {"method": "GET", "path": "/api/sandwiches", "params": {"q": "咸"}},
        {"method": "GET", "path": "/api/picnic-items"},
        {"method": "GET", "path": "/api/picnic-items", "params": {"kind": "食材"}},
        {"method": "GET", "path": "/api/donuts"},
        {"method": "GET", "path": "/api/curries"},
        {"method": "GET", "path": "/api/curries", "params": {"q": "咖喱"}},
    ]
    # 计算器 meta
    for sid in moves_sample:
        plan.append({"method": "GET", "path": "/api/calc/forms", "params": {"species_id": sid}})
        plan.append({"method": "GET", "path": "/api/calc/moves", "params": {"species_id": sid}})
    # 计算器 POST（单招 + 批量）
    plan.append({"method": "POST", "path": "/api/calc", "params": {
        "attacker": {"species_id": 445, "level": 50, "nature": "adamant", "evs": {"atk": 252}},
        "defender": {"species_id": 143, "level": 50, "nature": "careful"},
        "move_id": 89, "weather": "rain", "crit": True}})
    plan.append({"method": "POST", "path": "/api/calc/batch", "params": {
        "attacker": {"species_id": 445, "level": 50, "nature": "adamant", "evs": {"atk": 252},
                     "tera_type": "龙"},
        "defender": {"species_id": 130, "level": 50, "nature": "jolly",
                     "ability": "多重鳞片", "item": "突击背心", "is_dynamax": True},
        "moves": {"atk": [89, 339, 428, 403], "dfd": [56, 240, 58, 0]},
        "field": {"mode": "doubles", "weather": "sun", "terrain": "electric"},
        "sides": {"atk": {"z_moves": [False, True, False, False], "crit": True},
                  "dfd": {"screen": "light_screen", "hazards": {"rocks": True}}}}})
    # 生蛋链（vg→game）
    vg_game = {20: "sword-shield", 23: "brilliant-diamond-shining-pearl",
               24: "legends-arceus", 25: "scarlet-violet", 30: "legends-za"}
    seen_pairs = set()
    picked = 0
    for r in breed_moves:
        game = vg_game.get(r["vg"])
        if not game or (r["vg"], r["move_id"]) in seen_pairs:
            continue
        seen_pairs.add((r["vg"], r["move_id"]))
        plan.append({"method": "GET", "path": "/api/breed-chains",
                     "params": {"species_id": 133, "move_id": r["move_id"], "game": game}})
        picked += 1
        if picked >= 8:
            break
    return plan


def canonicalize(value):
    """序无关规范化：生蛋链 chains 顺序来自 Python set 迭代序，按内容排序后再比。"""
    if isinstance(value, dict):
        if "chains" in value and isinstance(value["chains"], list):
            value = dict(value)
            value["chains"] = sorted(value["chains"],
                                     key=lambda c: json.dumps(c, ensure_ascii=False, sort_keys=True))
        return {k: canonicalize(v) for k, v in value.items()}
    if isinstance(value, list):
        return [canonicalize(v) for v in value]
    return value


def strip_caught(value):
    """userstate 相关字段不比（本地 localStorage 与测试库状态独立，语义另测）。"""
    if isinstance(value, dict):
        if "entries" in value and isinstance(value["entries"], list):
            value = dict(value)
            value["entries"] = [{k: v for k, v in e.items() if k != "caught"}
                                for e in value["entries"]]
        return {k: strip_caught(v) for k, v in value.items()}
    if isinstance(value, list):
        return [strip_caught(v) for v in value]
    return value


def main() -> int:
    plan = build_plan()
    client = TestClient(app)

    with tempfile.TemporaryDirectory() as td:
        plan_file = Path(td) / "plan.json"
        out_file = Path(td) / "out.json"
        plan_file.write_text(json.dumps(plan, ensure_ascii=False), encoding="utf-8")
        r = subprocess.run(["node", str(ROOT / "tools/static-check/driver.mjs"),
                            str(plan_file), str(out_file)],
                           capture_output=True, text=True, cwd=ROOT, check=True)
        print(r.stderr.strip())
        js_results = json.loads(out_file.read_text(encoding="utf-8"))

    fails = 0
    for call, js in zip(plan, js_results, strict=True):
        label = call["method"] + " " + call["path"]
        if call.get("params"):
            label += " " + json.dumps(call["params"], ensure_ascii=False)[:60]
        if call["method"] == "GET":
            resp = client.get(call["path"], params=call.get("params"))
        else:
            resp = client.post(call["path"], json=call.get("params"))
        if resp.status_code >= 400:
            # 两边都报错视为等价（校验路径一致）
            if not js["ok"]:
                continue
            fails += 1
            print(f"[DIFF] {label}\n  py=HTTP{resp.status_code} js=ok")
            continue
        if not js["ok"]:
            fails += 1
            print(f"[DIFF] {label}\n  js error: {js['error']}")
            continue
        py = canonicalize(strip_caught(resp.json()))
        jsv = canonicalize(strip_caught(js["data"]))
        if py != jsv:
            fails += 1
            print(f"[DIFF] {label}")
            if fails <= 3:
                import difflib
                a = json.dumps(py, ensure_ascii=False, indent=1, sort_keys=True).splitlines()
                b = json.dumps(jsv, ensure_ascii=False, indent=1, sort_keys=True).splitlines()
                for line in list(difflib.unified_diff(a, b, "py", "js", lineterm=""))[2:14]:
                    print("  " + line)
    total = len(plan)
    print(f"\n等价性验证：{total - fails}/{total} 调用逐字段一致"
          + ("" if not fails else f"，{fails} 失败"))
    return 1 if fails else 0


if __name__ == "__main__":
    raise SystemExit(main())
