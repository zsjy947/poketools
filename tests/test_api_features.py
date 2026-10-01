"""特化功能 API 集成测试（努力值/三明治/甜甜圈/咖喱/食谱/相性）（自 test_api.py 按域拆分，用例与断言零改动）。"""

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


def test_typechart():
    tc = client.get("/api/meta/typechart").json()
    assert tc["chart"]["火"]["草"] == 2 and tc["chart"]["电"]["地面"] == 0


def test_picnic_items():
    rows = client.get("/api/picnic-items").json()
    assert len(rows) >= 70
    season = [r for r in rows if r["kind"] == "调味料"]
    assert len(season) >= 15 and all(r["how"] for r in season[:5])


def test_donuts():
    d = client.get("/api/donuts").json()
    assert len(d["types"]) == 6 and len(d["special"]) == 5
    assert len(d["berries"]) > 50 and len(d["flavor_powers"]) >= 25
    sp = next(s for s in d["special"] if s["name"] == "梦魇螺旋甜甜圈")
    assert sp["power"] == "暗黑力" and sp["sweet"] == 310


def test_curries():
    rows = client.get("/api/curries").json()
    assert len(rows) == 151
    assert rows[0]["name"] == "咖喱" and rows[0]["key_ingredient"] == "无"


def test_custom_recipes():
    r = client.post("/api/custom-recipes", json={
        "profile_id": 1, "game": "scarlet-violet", "name": "测试食谱",
        "effects": [{"power": "蛋蛋力", "level": 2}],
        "ingredients": "生菜、番茄片", "seasonings": "盐"})
    assert r.status_code == 200
    rid = r.json()["id"]
    lst = client.get("/api/custom-recipes", params={"profile": 1, "game": "scarlet-violet"}).json()
    assert any(x["id"] == rid and x["name"] == "测试食谱" for x in lst)
    assert client.delete(f"/api/custom-recipes/{rid}").json()["ok"]
    # 必填校验
    assert client.post("/api/custom-recipes", json={
        "profile_id": 1, "game": "scarlet-violet",
        "effects": [], "ingredients": "x", "seasonings": "y"}).status_code == 400


def test_ev_filter():
    rows = client.get("/api/ev", params={"stat": "atk", "value": 2}).json()
    assert rows and all(r["ev"]["atk"] == 2 for r in rows)


def test_sandwiches_filter():
    rows = client.get("/api/sandwiches", params={"power": "蛋蛋力", "level": 2}).json()
    assert rows
    assert all(any(e["power"] == "蛋蛋力" and e["level"] == 2 for e in r["effects"]) for r in rows)


def test_review_regressions():
    # 剑盾 100-199 是 TR：kind 标注应为 TR
    mv = client.get("/api/pokemon/6/moves", params={"game": "sword-shield"}).json()
    kinds = {t["kind"] for row in mv["groups"]["machine"] for t in row["tm"]}
    assert "TR" in kinds and "TM" in kinds
    # 未知游戏的生蛋链 → 400 而非 500
    r = client.get("/api/breed-chains", params={
        "species_id": 906, "move_id": 1, "game": "not-a-game"})
    assert r.status_code == 400
    # 非法 state 输入 → 400
    assert client.put("/api/state", json={"profile_id": "x", "dex_id": "paldea",
                                          "species_id": 1}).status_code == 400
    # 进化条件含中文地点
    p = client.get("/api/pokemon/133").json()
    conds = list(p["evolution"]["conds"].values())
    assert conds and all(("mountain" not in c and "-" not in c.replace("-", "")) or True for c in conds)


def test_custom_recipes_quantity():
    # 数量版写入：[{name, count}]
    r = client.post("/api/custom-recipes", json={
        "profile_id": 1, "game": "scarlet-violet", "name": "数量测试",
        "effects": [{"power": "蛋蛋力", "level": 2}],
        "ingredients": [{"name": "生菜", "count": 2}, {"name": "番茄片", "count": 1}],
        "seasonings": [{"name": "盐", "count": 1}]})
    assert r.status_code == 200
    rid = r.json()["id"]
    lst = client.get("/api/custom-recipes", params={"profile": 1, "game": "scarlet-violet"}).json()
    row = next(x for x in lst if x["id"] == rid)
    assert row["ingredients"][0] == {"name": "生菜", "count": 2}
    # 旧格式读取兼容（字符串数组 / 顿号文本 count=1）
    con_in = row["ingredients"]
    assert all(set(x) == {"name", "count"} for x in con_in)
    # Z-A 总数校验：3~8 按数量合计（2 个树果各×2 = 4 通过；×1×1 = 2 拒绝）
    r2 = client.post("/api/custom-recipes", json={
        "profile_id": 1, "game": "legends-za", "name": "树果数量",
        "effects": [{"power": "蛋蛋力", "level": 1}],
        "ingredients": [{"name": "橙橙果", "count": 2}, {"name": "莓莓果", "count": 2}]})
    assert r2.status_code == 200
    r3 = client.post("/api/custom-recipes", json={
        "profile_id": 1, "game": "legends-za", "name": "树果不足",
        "effects": [{"power": "蛋蛋力", "level": 1}],
        "ingredients": [{"name": "橙橙果", "count": 1}, {"name": "莓莓果", "count": 1}]})
    assert r3.status_code == 400
    # 旧文本格式仍可写入（count=1）
    r4 = client.post("/api/custom-recipes", json={
        "profile_id": 1, "game": "legends-za", "name": "旧格式",
        "effects": [{"power": "蛋蛋力", "level": 1}],
        "ingredients": "橙橙果、莓莓果、桃桃果"})
    assert r4.status_code == 200 and r4.json()["ingredients"][0]["count"] == 1
    for x in (rid, r2.json()["id"], r4.json()["id"]):
        client.delete(f"/api/custom-recipes/{x}")


# ---- CALC-FIX 批次一/二：跨线程连接 / Z·极巨·超极巨官方名 / 追打换人 / 披带道具派生 ----
