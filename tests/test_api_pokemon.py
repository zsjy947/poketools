"""宝可梦详情/招式表/生蛋链 API 集成测试（自 test_api.py 按域拆分，用例与断言零改动）。"""

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
    # M6：朱紫「进化&回忆」独立 tab（level=0 进化招式 + tutor 回忆行）
    assert [t["key"] for t in mv["tabs"]] == ["level", "evolution-recall", "machine", "egg"]
    assert mv["groups"]["level"] and mv["groups"]["machine"] and mv["groups"]["egg"]
    assert "pp" in mv["groups"]["level"][0] and "priority" in mv["groups"]["level"][0]
    # 「回忆」条目在进化&回忆组（波荡水：大晴天/磨爪）
    ww = client.get("/api/pokemon/1009/moves", params={"game": "scarlet-violet"}).json()
    recall = [r for r in ww["groups"]["evolution-recall"] if r.get("recall")]
    assert {r["name_zh"] for r in recall} == {"大晴天", "磨爪"}
    # 进化时学会（level=0）入进化&回忆组并标「进化」
    assert any(r.get("evolution") for r in ww["groups"]["evolution-recall"])
    assert not any((r.get("level") or 0) == 0 and not r.get("evolution")
                   for r in ww["groups"]["level"])
    # 其他游戏 level=0 置顶显「进化」徽章（剑盾）
    sw = client.get("/api/pokemon/445/moves", params={"game": "sword-shield"}).json()
    lv0 = [r for r in sw["groups"]["level"] if (r.get("level") or 0) == 0]
    assert lv0 and all(r.get("evolution") for r in lv0)
    assert sw["groups"]["level"][0].get("evolution")
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


def test_breed_chains_api():
    mv = client.get("/api/pokemon/906/moves", params={"game": "scarlet-violet"}).json()
    move_id = mv["groups"]["egg"][0]["move_id"]
    d = client.get("/api/breed-chains", params={
        "species_id": 906, "move_id": move_id, "game": "scarlet-violet"}).json()
    assert d["ok"] and d["chains"]
    assert d["chains"][0]["steps"]


def test_pokemon_form_branch_and_abilities():
    # 喵喵默认分支不含喵头目；伽勒尔分支含且条件带地区前缀
    d = client.get("/api/pokemon/52", params={"game": "sword-shield"}).json()
    assert "863" not in d["evolution"]["nodes"]
    g = client.get("/api/pokemon/52", params={"game": "sword-shield", "form": "galar"}).json()
    assert "863" in g["evolution"]["nodes"]
    assert "伽勒尔地区" in g["evolution"]["conds"]["52|863"]
    # 获取方式按形态过滤：默认形态只看通用行；伽勒尔形态含 G 行且不含 A 行
    assert all(not r["form"] for r in d["get_methods"])
    g_forms = {r["form"] for r in g["get_methods"] if r["form"]}
    assert g_forms == {"G"}
    # 特性带文案（52poke 抓取）
    ab = d["forms"][0]["ability_list"][0]
    assert set(ab) >= {"name", "hidden", "intro", "effect", "extra"}
    # 形态按游戏过滤：剑盾无 mega 形态；Z-A 有
    ss = client.get("/api/pokemon/445", params={"game": "sword-shield"}).json()
    assert all("mega" not in (f["identifier"] or "") for f in ss["forms"])
    za = client.get("/api/pokemon/445", params={"game": "legends-za"}).json()
    assert any(f["identifier"] == "garchomp-mega" for f in za["forms"])
    # 体型/种族列存在
    assert d["species"]["shape_zh"]


def test_ev_locations():
    rows = client.get("/api/ev", params={"stat": "atk", "game": "legends-arceus"}).json()
    r = next(x for x in rows if x["species_id"] == 58)
    assert r["locations"] and any("迎风林" in l["location"] for l in r["locations"])
    # 白名单排除团体战/定点：剑盾烈咬陆鲨野生地点不含极巨团体战方法
    rows2 = client.get("/api/ev", params={"stat": "atk", "game": "sword-shield"}).json()
    g = next(x for x in rows2 if x["species_id"] == 445)
    assert all("团体战" not in l["method"] for l in g["locations"])
    # 版本标签保留（扩展票/零之秘宝行可标注）
    rows3 = client.get("/api/ev", params={"stat": "atk", "game": "scarlet-violet"}).json()
    assert any(l["version_label"] for x in rows3 for l in x["locations"])
