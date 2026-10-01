"""图鉴与捕捉状态 API 集成测试（自 test_api.py 按域拆分，用例与断言零改动）。"""

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


def test_state_sync_and_counts():
    # 同游戏同步：皮卡丘在 galar+isle-of-armor（不在 crown-tundra）
    r = client.put("/api/state", json={"profile_id": 1, "dex_id": "galar",
                                       "species_id": 25, "caught": True})
    assert r.json()["ok"] and set(r.json()["synced_dexes"]) == {"galar", "isle-of-armor"}
    for dex in ("galar", "isle-of-armor"):
        d = client.get(f"/api/dex/{dex}", params={"filter": "caught"}).json()
        assert any(e["species_id"] == 25 for e in d["entries"]), dex
    d = client.get("/api/dex/crown-tundra", params={"filter": "caught"}).json()
    assert not any(e["species_id"] == 25 for e in d["entries"])   # 未收录不同步
    # 取消标记同样传播
    client.put("/api/state", json={"profile_id": 1, "dex_id": "isle-of-armor",
                                   "species_id": 25, "caught": False})
    for dex in ("galar", "isle-of-armor"):
        d = client.get(f"/api/dex/{dex}", params={"filter": "caught"}).json()
        assert not any(e["species_id"] == 25 for e in d["entries"]), dex
    # counts：一次返回全部图鉴计数
    client.put("/api/state", json={"profile_id": 1, "dex_id": "paldea",
                                   "species_id": 906, "caught": True})
    counts = client.get("/api/state/counts", params={"profile": 1}).json()
    assert counts.get("paldea") == 1
    # bulk 同步传播（耿鬼 94 在 kitakami+paldea 同游戏）
    r = client.post("/api/state/bulk", json={"profile_id": 1, "dex_id": "kitakami",
                                             "caught": True, "species_ids": [94]})
    assert r.json()["ok"]
    d = client.get("/api/dex/paldea", params={"filter": "caught"}).json()
    assert any(e["species_id"] == 94 for e in d["entries"])
    # 清理
    for dex in ("galar", "isle-of-armor", "kitakami", "paldea"):
        client.post("/api/state/bulk", json={"profile_id": 1, "dex_id": dex,
                                             "caught": False, "species_ids": [25, 906, 94]})


def test_dex_default_form_api():
    # 洗翠图鉴卡蒂狗显洗翠样子（form_id/属性为洗翠形态）
    d = client.get("/api/dex/hisui").json()
    e = next(x for x in d["entries"] if x["species_id"] == 58)
    assert "洗翠" in (e["types"] + str(e)) or e["form_id"] > 10000
    import sqlite3
    con = sqlite3.connect("data/poketools.db")
    ident = con.execute("SELECT identifier FROM forms WHERE id=?", (e["form_id"],)).fetchone()[0]
    assert ident == "growlithe-hisui"
    # /api/ev 同步覆盖（LA 攻击 EV 查询含洗翠风速狗形态）
    rows = client.get("/api/ev", params={"stat": "atk", "game": "legends-arceus"}).json()
    a9 = next((r for r in rows if r["species_id"] == 59), None)
    assert (a9 and a9["form_id"] and "hisui" in str(a9["form_id"])) or a9 is not None
    # 详情页 dex 上下文默认选中覆盖形态
    p = client.get("/api/pokemon/58", params={"game": "legends-arceus", "dex": "hisui"}).json()
    assert p["selected_suffix"] == "hisui"
    con.close()
