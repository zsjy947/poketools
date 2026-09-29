"""SQLite connections for static data (read-only) and user state (read-write)."""
from __future__ import annotations

import sqlite3
import sys
from collections.abc import Iterator
from pathlib import Path


def project_root() -> Path:
    """开发时=仓库根；打包后=exe 所在目录（data 文件夹随 exe 分发）。

    exe 旁没有 data 时回退尝试工作目录下的 data。"""
    if getattr(sys, "frozen", False):
        exe_dir = Path(sys.executable).resolve().parent
        if (exe_dir / "data").exists():
            return exe_dir
        cwd_data = Path.cwd() / "data"
        if cwd_data.exists():
            return cwd_data.parent
        return exe_dir
    return Path(__file__).resolve().parent.parent


ROOT = project_root()
DATA = ROOT / "data"
STATIC_DB = DATA / "poketools.db"
STATE_DB = DATA / "userstate.db"

STATE_SCHEMA = """
CREATE TABLE IF NOT EXISTS profiles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL
);
CREATE TABLE IF NOT EXISTS caught_state (
  profile_id INTEGER NOT NULL,
  dex_id TEXT NOT NULL,
  species_id INTEGER NOT NULL,
  caught INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT DEFAULT (datetime('now','localtime')),
  PRIMARY KEY (profile_id, dex_id, species_id)
);
CREATE TABLE IF NOT EXISTS custom_recipes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  profile_id INTEGER NOT NULL,
  game TEXT NOT NULL,
  name TEXT NOT NULL,
  effects TEXT NOT NULL,
  ingredients TEXT NOT NULL,
  seasonings TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now','localtime'))
);
INSERT OR IGNORE INTO profiles (id, name) VALUES (1, '默认档案');
"""


def static_conn() -> sqlite3.Connection:
    # check_same_thread=False：真实 uvicorn（anyio 线程池）下依赖 setup / 端点体 / teardown
    # 可能落在不同线程（CALC-FIX §1 跨线程 500 回归）；连接为请求级短生命周期不跨请求共享，安全。
    con = sqlite3.connect(f"file:{STATIC_DB.as_posix()}?mode=ro", uri=True,
                          check_same_thread=False)
    con.row_factory = sqlite3.Row
    con.execute("PRAGMA query_only=1")
    return con


_state_init_done = False


def state_conn() -> sqlite3.Connection:
    global _state_init_done
    con = sqlite3.connect(STATE_DB, check_same_thread=False)
    con.row_factory = sqlite3.Row
    if not _state_init_done:
        con.executescript(STATE_SCHEMA)
        _state_init_done = True
    return con


# ---- 请求级连接管理（P0-3：此前各端点手动 close 且多数无 try/finally，异常路径泄漏）----
# 路由一律经 Depends 注入，请求结束自动关闭；确需自管的（如 lru_cache 缓存函数）自行 try/finally。

def get_static_db() -> Iterator[sqlite3.Connection]:
    con = static_conn()
    try:
        yield con
    finally:
        con.close()


def get_state_db() -> Iterator[sqlite3.Connection]:
    con = state_conn()
    try:
        yield con
    finally:
        con.close()
