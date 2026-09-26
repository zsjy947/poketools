"""PokemonDB 共享客户端：HTML 本地缓存 + 抓取（52poke 缺口的英文补源）。

52poke 未收录的 Z-A 学习集 / TM 获取地点等从这里补。要点：
- 页面缓存到 data/raw/pokemondb-cache/（与 52poke 缓存同级，避免重复请求）；
- 404 视为「页面不存在」返回 None，5xx/网络错误带退避重试；
- 请求带浏览器式 UA（默认 UA 会被拒）。
"""
from __future__ import annotations

import re
import sys
import time
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / "data" / "raw" / "pokemondb-cache"
BASE = "https://pokemondb.net/"
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"

_session = requests.Session()
_session.headers["User-Agent"] = UA


def cache_path(path: str) -> Path:
    return CACHE / (path.strip("/").replace("/", "_") + ".html")


def fetch_html(path: str, retries: int = 4) -> str | None:
    """抓 https://pokemondb.net/{path} 的 HTML（缓存优先）。404 → None。"""
    CACHE.mkdir(parents=True, exist_ok=True)
    cp = cache_path(path)
    if cp.exists():
        return cp.read_text(encoding="utf-8", errors="replace")
    url = BASE + path.lstrip("/")
    for attempt in range(retries):
        try:
            r = _session.get(url, timeout=90)
            if r.status_code == 404:
                return None
            if r.status_code in (429, 502, 503):
                time.sleep(8 * (attempt + 1))
                continue
            r.raise_for_status()
            cp.write_text(r.text, encoding="utf-8")
            time.sleep(0.4)
            return r.text
        except Exception as e:  # noqa: BLE001
            if attempt == retries - 1:
                print(f"  !! pokemondb {path}: {type(e).__name__}: {str(e)[:120]}",
                      file=sys.stderr)
                return None
            time.sleep(5 * (attempt + 1))
    return None


def strip_tags(s: str) -> str:
    return re.sub(r"\s+", " ", re.sub("<[^>]+>", " ", s)).strip()
