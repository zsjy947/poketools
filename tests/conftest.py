"""测试公共配置：sys.path 注入 + DB 存在性 skipif。

分层要求（写入 docs/ARCHITECTURE.md §8）：
① test_db    数据完整性（行数护栏、新表覆盖率）
② test_api   API 集成（每新增/修改端点必须带正反用例）
③ test_damage/test_breeding 纯函数
④ 公式改动铁律：扩 tools/calib 案例并重跑 node harness.mjs → python check.py 逐 roll 全绿
⑤ 数据管线回归：build_db → build_z_moves → build_db → scrape_52poke → fetch_* 后跑 pytest
"""
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

DB = ROOT / "data" / "poketools.db"

# 数据库未生成时跳过数据依赖测试（管线先行的约定保持不变）
requires_db = pytest.mark.skipif(not DB.exists(), reason="先运行数据管线生成 poketools.db")
