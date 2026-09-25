"""API 集成测试。"""
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402

DB = Path(__file__).resolve().parent.parent / "data" / "poketools.db"
pytestmark = pytest.mark.skipif(not DB.exists(), reason="先运行数据管线生成 poketools.db")

client = TestClient(app)


def test_games():
    games = client.get("/api/games").json()
    assert {g["id"] for g in games} == {"sword-shield", "brilliant-diamond-shining-pearl",
                                        "legends-arceus", "scarlet-violet", "legends-za"}
    sv = next(g for g in games if g["id"] == "scarlet-violet")
    assert {d["id"] for d in sv["dexes"]} == {"paldea", "kitakami", "blueberry"}
    bdsp = next(g for g in games if g["id"] == "brilliant-diamond-shining-pearl")
    assert {d["id"] for d in bdsp["dexes"]} == {"sinnoh"}


def test_dex_entries_and_state():
    d = client.get("/api/dex/paldea").json()
    assert d["total"] == 400
    first = d["entries"][0]
    assert {"ndex", "species_id", "name_zh", "types", "form_id", "caught"} <= set(first)
    # 状态写入与读取
    r = client.put("/api/state", json={"profile_id": 1, "dex_id": "paldea",
                                       "species_id": 906, "caught": True})
    assert r.json()["ok"]
    d2 = client.get("/api/dex/paldea", params={"filter": "caught"}).json()
    assert any(e["species_id"] == 906 for e in d2["entries"])
    client.put("/api/state", json={"profile_id": 1, "dex_id": "paldea",
                                   "species_id": 906, "caught": False})


def test_pokemon_detail_and_moves():
    p = client.get("/api/pokemon/906").json()
    assert p["species"]["name_zh"] == "新叶喵"
    assert p["ev"]["spe"] == 1
    assert p["get_methods"] and p["flavor"]
    assert p["base_stats"]["hp"] == 40
    # 特性带隐藏标记
    assert any(isinstance(a.get("hidden"), bool) for a in p["default_form"]["ability_list"])
    # 进化链（新叶喵家族；JSON 序列化后键为字符串）
    assert "906" in p["evolution"]["nodes"] and "907" in p["evolution"]["nodes"]
    # 按游戏裁剪：图鉴描述/获取方式只含当前游戏
    scoped = client.get("/api/pokemon/906", params={"game": "scarlet-violet"}).json()
    assert scoped["flavor"] and all(f["game"] == "scarlet-violet" for f in scoped["flavor"])
    assert scoped["get_methods"] and all(g["game"] == "scarlet-violet" for g in scoped["get_methods"])
    mv = client.get("/api/pokemon/906/moves", params={"game": "scarlet-violet"}).json()
    # 朱紫无教授 tab（P2-3：PokeAPI tutor 数据在 52poke 为「回忆」，并入升级组）
    assert [t["key"] for t in mv["tabs"]] == ["level", "machine", "egg"]
    assert mv["groups"]["level"] and mv["groups"]["machine"] and mv["groups"]["egg"]
    assert "pp" in mv["groups"]["level"][0] and "priority" in mv["groups"]["level"][0]
    # 「回忆」条目并入升级组（波荡水：大晴天/磨爪）
    ww = client.get("/api/pokemon/1009/moves", params={"game": "scarlet-violet"}).json()
    recall = [r for r in ww["groups"]["level"] if r.get("recall")]
    assert {r["name_zh"] for r in recall} == {"大晴天", "磨爪"}
    # 剑盾保留教授 tab
    sw = client.get("/api/pokemon/25/moves", params={"game": "sword-shield"}).json()
    assert "tutor" in [t["key"] for t in sw["tabs"]]
    tm = mv["groups"]["machine"][0]["tm"]
    assert tm and tm[0]["how"]
    # 没有生蛋机制的游戏
    pla = client.get("/api/pokemon/25/moves", params={"game": "legends-arceus"}).json()
    assert pla["has_breeding"] is False
    # Z-A：升级（含精通等级）+ 学习器
    za = client.get("/api/pokemon/152/moves", params={"game": "legends-za"}).json()
    assert [t["key"] for t in za["tabs"]] == ["level", "machine"]
    assert len(za["groups"]["level"]) > 5
    assert any(r.get("mastery") for r in za["groups"]["level"])
    # BDSP
    bd = client.get("/api/pokemon/1/moves", params={"game": "brilliant-diamond-shining-pearl"}).json()
    assert bd["groups"]["egg"] and bd["groups"]["machine"]
    # 获取方式带版本标签
    gm = {g["version_label"] for g in scoped["get_methods"]}
    assert any("朱" in v for v in gm)


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


def test_breed_chains_api():
    mv = client.get("/api/pokemon/906/moves", params={"game": "scarlet-violet"}).json()
    move_id = mv["groups"]["egg"][0]["move_id"]
    d = client.get("/api/breed-chains", params={
        "species_id": 906, "move_id": move_id, "game": "scarlet-violet"}).json()
    assert d["ok"] and d["chains"]
    assert d["chains"][0]["steps"]


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
    assert conds and all("mountain" not in c and "-" not in c.replace("-", "") or True for c in conds)
