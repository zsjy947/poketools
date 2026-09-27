"""数据库与 curated 数据完整性测试（需先运行 scripts/build_db.py 与 scrape_52poke.py）。"""
import json
import sqlite3
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
DB = ROOT / "data" / "poketools.db"

pytestmark = pytest.mark.skipif(not DB.exists(), reason="先运行数据管线生成 poketools.db")


@pytest.fixture(scope="module")
def con():
    c = sqlite3.connect(DB)
    c.row_factory = sqlite3.Row
    yield c
    c.close()


def test_games_and_dexes(con):
    games = {r["id"] for r in con.execute("SELECT id FROM games")}
    assert games == {"sword-shield", "brilliant-diamond-shining-pearl",
                     "legends-arceus", "scarlet-violet", "legends-za"}
    dexes = {r["id"]: r["total"] for r in con.execute(
        """SELECT d.id, COUNT(e.species_id) AS total FROM regional_dexes d
           LEFT JOIN dex_entries e ON e.dex_id = d.id GROUP BY d.id""")}
    assert dexes["galar"] == 400 and dexes["paldea"] == 400
    assert dexes["hisui"] == 242
    assert dexes["sinnoh"] == 151  # BDSP 神奥图鉴（同 DP 的 151 只，非白金 210）
    assert len(dexes) == 10


def test_species_names_zh(con):
    missing = con.execute(
        "SELECT COUNT(*) FROM species WHERE name_zh IS NULL OR name_zh=''").fetchone()[0]
    assert missing == 0


def test_forms_stats_and_ev(con):
    row = con.execute("SELECT * FROM forms WHERE species_id=906 AND is_default=1").fetchone()
    assert (row["hp"], row["atk"], row["def"], row["spa"], row["spd"], row["spe"]) == (40, 61, 54, 45, 45, 65)
    assert row["ev_spe"] == 1 and row["types"] == "草"


def test_learnsets_coverage(con):
    # 每个目标版本组都有学习集数据（vg30=Z-A 来自 52poke 抓取；vg32 是 Champions 数据，不导入）
    vgs = {r["vg"] for r in con.execute("SELECT DISTINCT vg FROM learnsets")}
    assert {20, 23, 24, 25, 30} <= vgs
    # 蛋招式存在于有生蛋机制的游戏
    for vg in (20, 23, 25):
        n = con.execute("SELECT COUNT(*) FROM learnsets WHERE vg=? AND method='egg'", (vg,)).fetchone()[0]
        assert n > 1000
    # Z-A 学习集带精通等级
    assert con.execute(
        "SELECT COUNT(*) FROM learnsets WHERE vg=30 AND method='level-up' AND mastery IS NOT NULL"
    ).fetchone()[0] > 300


def test_get_methods_coverage(con):
    for game, dex in [("scarlet-violet", "paldea"), ("sword-shield", "galar"),
                      ("legends-arceus", "hisui"), ("legends-za", "lumiose-city")]:
        total = con.execute("SELECT COUNT(*) FROM dex_entries WHERE dex_id=?", (dex,)).fetchone()[0]
        cov = con.execute(
            """SELECT COUNT(DISTINCT de.species_id) FROM dex_entries de
               JOIN get_methods g ON g.species_id=de.species_id AND g.game=?
               WHERE de.dex_id=?""", (game, dex)).fetchone()[0]
        assert cov / total > 0.9, f"{game} 捕捉方式覆盖率过低: {cov}/{total}"


def test_flavor_coverage(con):
    # 每个游戏至少 200 条图鉴描述
    for game in ("sword-shield", "legends-arceus", "scarlet-violet", "legends-za"):
        n = con.execute("SELECT COUNT(DISTINCT species_id) FROM dex_flavor WHERE game=?",
                        (game,)).fetchone()[0]
        assert n >= 200, f"{game} 图鉴描述过少: {n}"


def test_tm_how(con):
    assert con.execute("SELECT COUNT(*) FROM tm_how WHERE vg=25").fetchone()[0] >= 190
    assert con.execute("SELECT COUNT(*) FROM tm_how WHERE vg=20").fetchone()[0] >= 190
    row = con.execute(
        """SELECT t.how, t.materials FROM tm_how t JOIN moves m ON m.id=t.move_id
           WHERE t.vg=25 AND m.name_zh='猛撞'""").fetchone()
    assert row and "西第１区" in row["how"] and "LP" in row["materials"]


def test_sandwiches(con):
    n = con.execute("SELECT COUNT(*) FROM sandwiches").fetchone()[0]
    assert n >= 150
    row = con.execute("SELECT * FROM sandwiches WHERE no=1").fetchone()
    assert row["name"] == "火腿黄油三明治"
    effects = json.loads(row["effects"])
    powers = {e["power"] for e in effects}
    assert "遭遇力" in powers and "捕获力" in powers
    assert all(e["level"] in (1, 2, 3) for e in effects)
