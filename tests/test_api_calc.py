"""伤害计算器 API 集成测试（机制互斥/批量/校准回归）（自 test_api.py 按域拆分，用例与断言零改动）。"""

"""API 集成测试。"""
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from fastapi.testclient import TestClient

from app.main import app

DB = Path(__file__).resolve().parent.parent / "data" / "poketools.db"
pytestmark = pytest.mark.skipif(not DB.exists(), reason="先运行数据管线生成 poketools.db")

client = TestClient(app)


def test_calc_mechanism_exclusive():
    # 机制互斥：Z招式 + 太晶化同侧 → 400（P4）
    body = {
        "attacker": {"species_id": 445, "tera_type": "火", "level": 50},
        "defender": {"species_id": 143, "level": 50},
        "move_id": 89, "z_move": True,
    }
    assert client.post("/api/calc", json=body).status_code == 400
    body["z_move"] = False
    r = client.post("/api/calc", json=body)
    assert r.status_code == 200
    # 帮助/青草场地等扩项透传可用
    r2 = client.post("/api/calc", json={
        "attacker": {"species_id": 445, "level": 50},
        "defender": {"species_id": 143, "level": 50},
        "move_id": 89, "helping_hand": True})
    assert r2.status_code == 200 and r2.json()["result"]["max"] > r.json()["result"]["max"]


def test_calc_batch_and_meta():
    # 全量道具/特性/Z 纯晶
    items = client.get("/api/meta/items").json()
    assert len(items) > 2000
    assert any(i["identifier"] == "choice-band" for i in items)
    abilities = client.get("/api/meta/abilities").json()
    assert len(abilities) > 300 and "威吓" in abilities
    z = client.get("/api/meta/z-moves").json()
    assert len(z["generic"]) == 18
    ex = next(x for x in z["exclusive"] if x["crystal_identifier"] == "snorlium-z")
    assert ex["species_id"] == 143 and ex["z_move_name"] == "认真起来大爆击"
    # forms 带种族值（修复恒「—」）
    forms = client.get("/api/calc/forms", params={"species_id": 445}).json()
    base = forms[0]
    assert (base["hp"], base["atk"]) == (108, 130)
    # moves 含变化招式 + is_spread 标注
    moves = client.get("/api/calc/moves", params={"species_id": 445}).json()
    assert any(m["damage_class"] == "status" for m in moves)
    assert any(m["is_spread"] == 1 for m in moves if m["name_zh"] == "地震")
    # batch：一次 8 招；Z 专属映射生效
    r = client.post("/api/calc/batch", json={
        "attacker": {"species_id": 143, "level": 50},
        "defender": {"species_id": 143, "level": 50},
        "moves": {"atk": [{"id": 416}, None, None, None], "dfd": [None, None, None, None]},
        "field": {},
        "sides": {"atk": {"z_moves": [True, False, False, False]}, "dfd": {}},
    })
    assert r.status_code == 200
    res = r.json()["atk"]["results"][0]
    zi = res["z_info"]
    assert zi["source"] == "exclusive" and zi["name"] == "认真起来大爆击"
    assert res["ko"] and set(res["ko"]["probs"]) == {"1", "2", "3", "4"}
    # 双方 Z 同时点亮 → 400（一场一次 Z 力量）
    r2 = client.post("/api/calc/batch", json={
        "attacker": {"species_id": 143, "level": 50},
        "defender": {"species_id": 143, "level": 50},
        "moves": {"atk": [{"id": 416}, {"id": 416}, None, None], "dfd": [None] * 4},
        "field": {},
        "sides": {"atk": {"z_moves": [True, True, False, False]}, "dfd": {}},
    })
    assert r2.status_code == 400
    # compare-forms 已删除
    assert client.post("/api/calc/compare-forms", json={}).status_code in (404, 405)
    # 阿罗拉雷丘 + 十万伏特 → 专属 Z（威力 175）；普通雷丘 → 泛用
    r3 = client.post("/api/calc", json={
        "attacker": {"species_id": 26, "form_id": 10100, "level": 50},
        "defender": {"species_id": 143, "level": 50},
        "move_id": 85, "z_move": True})
    assert r3.status_code == 200
    assert r3.json()["z_info"]["name"] == "驾雷驭电戏冲浪"


def test_calc_power_trick():
    # 力量戏法：该侧攻击/防御实际值互换（batch per-side flag 与单招端点对等字段）
    body = {
        "attacker": {"species_id": 445, "level": 50},   # 烈咬陆鲨 攻130>防95
        "defender": {"species_id": 143, "level": 50},   # 卡比兽 攻110>防65
        "moves": {"atk": [89, None, None, None], "dfd": [None] * 4},
        "field": {},
    }
    base = client.post("/api/calc/batch", json={**body, "sides": {"atk": {}, "dfd": {}}}).json()
    swap_a = client.post("/api/calc/batch",
                         json={**body, "sides": {"atk": {"power_trick": True}, "dfd": {}}}).json()
    assert swap_a["atk"]["stats"]["atk"] == base["atk"]["stats"]["def"]
    assert swap_a["atk"]["stats"]["def"] == base["atk"]["stats"]["atk"]
    assert swap_a["dfd"]["stats"] == base["dfd"]["stats"]           # 只影响所标一侧
    assert swap_a["atk"]["results"][0]["max"] < base["atk"]["results"][0]["max"]
    # 防守方互换（攻110>防65 → 防变高）→ 受到伤害下降
    swap_d = client.post("/api/calc/batch",
                         json={**body, "sides": {"atk": {}, "dfd": {"power_trick": True}}}).json()
    assert swap_d["dfd"]["stats"]["def"] == base["dfd"]["stats"]["atk"]
    assert swap_d["atk"]["results"][0]["max"] < base["atk"]["results"][0]["max"]
    # 单招端点对等字段：power_trick / defender_power_trick
    r0 = client.post("/api/calc", json={
        "attacker": {"species_id": 445, "level": 50},
        "defender": {"species_id": 143, "level": 50}, "move_id": 89})
    r1 = client.post("/api/calc", json={
        "attacker": {"species_id": 445, "level": 50},
        "defender": {"species_id": 143, "level": 50}, "move_id": 89,
        "power_trick": True, "defender_power_trick": True})
    assert r1.json()["attacker"]["stats"]["atk"] == r0.json()["attacker"]["stats"]["def"]
    assert r1.json()["defender"]["stats"]["def"] == r0.json()["defender"]["stats"]["atk"]
    assert r1.json()["result"]["max"] < r0.json()["result"]["max"]


def test_db_threading_cross_thread():
    """真实 uvicorn（anyio 线程池）下连接会被另一线程使用：check_same_thread=False 护栏。"""
    import threading

    from app.db import state_conn, static_conn

    results = {}

    def worker_static():
        try:
            con = static_conn()
            results["static"] = con.execute("SELECT COUNT(*) FROM games").fetchone()[0]
            con.close()
        except Exception as e:  # noqa: BLE001
            results["static_err"] = repr(e)

    def worker_state():
        try:
            con = state_conn()
            con.execute("SELECT COUNT(*) FROM profiles").fetchone()
            con.close()
            results["state"] = "ok"
        except Exception as e:  # noqa: BLE001
            results["state_err"] = repr(e)

    t1 = threading.Thread(target=worker_static)
    t2 = threading.Thread(target=worker_state)
    t1.start(); t2.start(); t1.join(); t2.join()
    assert results.get("static") == 5 and "static_err" not in results
    assert results.get("state") == "ok" and "state_err" not in results


def test_meta_z_moves_generic_names():
    z = client.get("/api/meta/z-moves").json()
    assert len(z["generic"]) == 18
    dragon = next(x for x in z["generic"] if x["type"] == "龙")
    assert dragon["z_move_name"] == "究极巨龙震天地"
    assert all(x.get("type") and x.get("z_move_name") for x in z["generic"])


def test_meta_max_moves():
    mx = client.get("/api/meta/max-moves").json()
    assert len(mx) == 19
    guard = next(m for m in mx if m["identifier"] == "max-guard")
    assert guard["name_zh"] == "极巨防壁" and guard["damage_class"] == "status"
    wyrm = next(m for m in mx if m["identifier"] == "max-wyrmwind")
    assert (wyrm["name_zh"], wyrm["type_zh"], wyrm["damage_class"]) == ("极巨龙骑", "龙", "physical")
    gmax = client.get("/api/meta/gmax-moves").json()
    assert len(gmax) == 34
    cz = next(g for g in gmax if g["form_identifier"] == "charizard-gmax")
    assert cz["gmax_move_name"] == "超极巨地狱灭焰" and cz["type_zh"] == "火"


def test_batch_generic_z_name():
    # 泛用 Z：龙属性伤害招 + z_marks → z_info.name 官方名（烈咬陆鲨无专属 Z）
    r = client.post("/api/calc/batch", json={
        "attacker": {"species_id": 445, "level": 50},
        "defender": {"species_id": 143, "level": 50},
        "moves": {"atk": [{"id": 337}, None, None, None], "dfd": [None] * 4},
        "field": {},
        "sides": {"atk": {"z_moves": [True, False, False, False]}, "dfd": {}},
    })
    assert r.status_code == 200
    zi = r.json()["atk"]["results"][0]["z_info"]
    assert zi["source"] == "generic" and zi["name"] == "究极巨龙震天地"


def test_pikashunium_z_caps():
    # 千万伏特：普通皮卡丘 + 十万伏特点 Z → 后缀不匹配回退泛用
    plain = client.post("/api/calc", json={
        "attacker": {"species_id": 25, "level": 50},
        "defender": {"species_id": 143, "level": 50},
        "move_id": 85, "z_move": True})
    zi = plain.json()["z_info"]
    assert zi["source"] == "generic" and zi["name"] == "终极伏特狂雷闪"
    # 帽子皮卡丘（original-cap）→ 命中千万伏特（195 威力）
    cap = client.post("/api/calc", json={
        "attacker": {"species_id": 25, "form_id": 10094, "level": 50},
        "defender": {"species_id": 143, "level": 50},
        "move_id": 85, "z_move": True})
    zi2 = cap.json()["z_info"]
    assert zi2["source"] == "exclusive" and zi2["name"] == "千万伏特"
    assert zi2["power"] == 195


def test_gmax_move_power():
    # 超极巨狂擂乱打（草属性命中）= 固定 160：高于同招式普通极巨档位（木槌 120 → 140）
    body = {
        "attacker": {"species_id": 812, "form_id": 10209, "level": 50, "is_dynamax": True},
        "defender": {"species_id": 143, "level": 50},
        "moves": {"atk": [{"id": 452}, None, None, None], "dfd": [None] * 4},
        "field": {},
        "sides": {"atk": {}, "dfd": {}},
    }
    gmax = client.post("/api/calc/batch", json=body).json()
    plain = client.post("/api/calc/batch", json={
        **body, "attacker": {"species_id": 812, "level": 50, "is_dynamax": True}}).json()
    assert gmax["atk"]["results"][0]["max"] > plain["atk"]["results"][0]["max"]
    # charizard-gmax + 火招（超极巨地狱灭焰，无固定威力）→ 与普通极巨同档位（90 → 130）
    cz_gmax = client.post("/api/calc/batch", json={
        "attacker": {"species_id": 6, "form_id": 10196, "level": 50, "is_dynamax": True},
        "defender": {"species_id": 143, "level": 50},
        "moves": {"atk": [{"id": 53}, None, None, None], "dfd": [None] * 4},
        "field": {},
        "sides": {"atk": {}, "dfd": {}}}).json()
    cz_plain = client.post("/api/calc/batch", json={
        "attacker": {"species_id": 6, "level": 50, "is_dynamax": True},
        "defender": {"species_id": 143, "level": 50},
        "moves": {"atk": [{"id": 53}, None, None, None], "dfd": [None] * 4},
        "field": {},
        "sides": {"atk": {}, "dfd": {}}}).json()
    assert cz_gmax["atk"]["results"][0]["rolls"] == cz_plain["atk"]["results"][0]["rolls"]
    # 非命中属性（飞行招）→ 不注入 gmax 威力，走普通档位
    cz_air = client.post("/api/calc/batch", json={
        "attacker": {"species_id": 6, "form_id": 10196, "level": 50, "is_dynamax": True},
        "defender": {"species_id": 143, "level": 50},
        "moves": {"atk": [{"id": 403}, None, None, None], "dfd": [None] * 4},
        "field": {},
        "sides": {"atk": {}, "dfd": {}}}).json()
    assert cz_air["atk"]["results"][0]["rolls"] == client.post("/api/calc/batch", json={
        "attacker": {"species_id": 6, "level": 50, "is_dynamax": True},
        "defender": {"species_id": 143, "level": 50},
        "moves": {"atk": [{"id": 403}, None, None, None], "dfd": [None] * 4},
        "field": {},
        "sides": {"atk": {}, "dfd": {}}}).json()["atk"]["results"][0]["rolls"]


def test_pursuit_switching_out():
    # 追打 × 换下场：防守方 switching → 威力 ×2；非追打招式不受影响
    body = {
        "attacker": {"species_id": 445, "level": 50},
        "defender": {"species_id": 143, "level": 50},
        "moves": {"atk": [{"id": 228}, {"id": 337}, None, None], "dfd": [None] * 4},
        "field": {},
    }
    base = client.post("/api/calc/batch", json={**body, "sides": {"atk": {}, "dfd": {}}}).json()
    sw = client.post("/api/calc/batch",
                     json={**body, "sides": {"atk": {}, "dfd": {"switching": True}}}).json()
    assert sw["atk"]["results"][0]["max"] > base["atk"]["results"][0]["max"]   # 追打增强
    assert sw["atk"]["results"][1]["rolls"] == base["atk"]["results"][1]["rolls"]  # 龙爪不变
    # 单招端点对等字段 defender_switching_out
    r0 = client.post("/api/calc", json={
        "attacker": {"species_id": 445, "level": 50},
        "defender": {"species_id": 143, "level": 50}, "move_id": 228})
    r1 = client.post("/api/calc", json={
        "attacker": {"species_id": 445, "level": 50},
        "defender": {"species_id": 143, "level": 50}, "move_id": 228,
        "defender_switching_out": True})
    assert r1.json()["result"]["max"] > r0.json()["result"]["max"]


def test_sash_item_derivation():
    # 气势披带 = 道具派生：defender 侧 sash flag 等价于装备「气势披带」
    body = {
        "attacker": {"species_id": 445, "level": 50},
        "defender": {"species_id": 143, "level": 50},
        "moves": {"atk": [89, None, None, None], "dfd": [None] * 4},
        "field": {},
    }
    by_flag = client.post("/api/calc/batch",
                          json={**body, "sides": {"atk": {}, "dfd": {"sash": True}}}).json()
    by_item = client.post("/api/calc/batch", json={
        **body,
        "defender": {"species_id": 143, "level": 50, "item": "气势披带"},
        "sides": {"atk": {}, "dfd": {}}}).json()
    assert by_flag["atk"]["results"][0]["ko"]["probs"]["1"] == 0.0
    assert by_item["atk"]["results"][0]["ko"]["probs"]["1"] == 0.0
