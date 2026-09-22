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
    assert {g["id"] for g in games} == {"sword-shield", "legends-arceus", "scarlet-violet", "legends-za"}
    sv = next(g for g in games if g["id"] == "scarlet-violet")
    assert {d["id"] for d in sv["dexes"]} == {"paldea", "kitakami", "blueberry"}


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
    mv = client.get("/api/pokemon/906/moves", params={"game": "scarlet-violet"}).json()
    assert mv["groups"]["level"] and mv["groups"]["machine"] and mv["groups"]["egg"]
    tm = mv["groups"]["machine"][0]["tm"]
    assert tm and tm[0]["how"]
    # 没有生蛋机制的游戏
    pla = client.get("/api/pokemon/25/moves", params={"game": "legends-arceus"}).json()
    assert pla["has_breeding"] is False


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
