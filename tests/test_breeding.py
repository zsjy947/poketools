"""生蛋链算法测试。"""
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from app.db import static_conn
from app.services.breeding import breed_chains

DB = Path(__file__).resolve().parent.parent / "data" / "poketools.db"
pytestmark = pytest.mark.skipif(not DB.exists(), reason="先运行数据管线生成 poketools.db")


def _move_id(name: str) -> int:
    con = static_conn()
    try:
        return con.execute("SELECT id FROM moves WHERE name_zh=?", (name,)).fetchone()["id"]
    finally:
        con.close()


def _validate(data: dict) -> None:
    """校验链结构：steps 非空、首环自学、相邻可交配、末步到达目标。"""
    for c in data["chains"]:
        assert c["steps"], "链为空"
        assert c["length"] == data["min_length"], "存在非最短路径"
        assert c["steps"][0]["from"]["learn"] != "蛋招式（需由上一环遗传）", "首环必须能自学招式"
        for s in c["steps"]:
            ga, gb = set(s["from"]["groups"]), set(s["to"]["groups"])
            assert ga & gb or "百变怪" in ga or "百变怪" in gb, "相邻物种必须可交配"
        last = c["steps"][-1]
        assert last["to"]["species_id"] == data["target"]["species_id"], "末步必须到达目标"


def test_direct_chain():
    """新叶喵 × 「寄生种子」（朱紫）：有同蛋组自学源，最短 1 次繁殖。"""
    conn = static_conn()
    try:
        data = breed_chains(conn, 906, _move_id("寄生种子"), "scarlet-violet")
    finally:
        conn.close()
    assert data["ok"]
    assert data["min_length"] == 1
    assert data["chain_count"] >= 1
    _validate(data)


def test_multi_step_chain():
    """新叶喵 × 「交换场地」（朱紫）：已知需要 2 次繁殖的中间传递链。"""
    conn = static_conn()
    try:
        data = breed_chains(conn, 906, _move_id("交换场地"), "scarlet-violet")
    finally:
        conn.close()
    assert data["ok"]
    assert data["min_length"] >= 2
    assert data["chain_count"] >= 1
    _validate(data)


def test_undiscovered_group_rejected():
    """未发现蛋组（固拉多）无法生蛋遗传。"""
    conn = static_conn()
    try:
        data = breed_chains(conn, 383, _move_id("剑舞"), "scarlet-violet")
    finally:
        conn.close()
    assert not data["ok"]
    assert "未发现" in data["reason"]
