"""测试公共配置：sys.path 注入（tests/ 与 scripts/ 均以仓库根为基准导入）。

分层要求（终态）：
① test_db    数据完整性（行数护栏、新表覆盖率；无 DB 时模块内 skipif 自行跳过）
② test_parsers wikitext/特性解析器单测
③ 公式与领域逻辑（伤害/生蛋链/状态端点）在 web/tests（vitest：
   calib.test.ts 51+41 对拍 + damage/breeding/state golden）
④ 数据管线回归：build_db → build_z_moves → build_db → scrape_52poke → fetch_* 后跑 pytest
"""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
