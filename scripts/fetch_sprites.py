"""下载宝可梦图片到 data/sprites/（来源 PokeAPI/sprites 仓库，默认正面图）。"""
from __future__ import annotations

import concurrent.futures as cf
import sqlite3
import sys
import time
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parent.parent
DB = ROOT / "data" / "poketools.db"
OUT = ROOT / "data" / "sprites"
BASE = "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon"
UA = "poketools/0.1 (one-shot asset build)"


def download(form_id: int) -> tuple[int, bool]:
    dest = OUT / f"{form_id}.png"
    if dest.exists() and dest.stat().st_size > 0:
        return form_id, True
    for attempt in range(3):
        try:
            r = requests.get(f"{BASE}/{form_id}.png", timeout=30, headers={"User-Agent": UA})
            if r.status_code == 200 and r.content:
                dest.write_bytes(r.content)
                return form_id, True
            if r.status_code == 404:
                return form_id, False
        except Exception:
            time.sleep(1 + attempt)
    return form_id, False


def main() -> None:
    if not DB.exists():
        sys.exit("poketools.db missing")
    OUT.mkdir(parents=True, exist_ok=True)
    con = sqlite3.connect(DB)
    ids = [r[0] for r in con.execute("SELECT id FROM forms ORDER BY id")]
    con.close()
    todo = [i for i in ids if not (OUT / f"{i}.png").exists()]
    print(f"forms: {len(ids)}, to download: {len(todo)}")
    ok = fail = 0
    with cf.ThreadPoolExecutor(max_workers=24) as ex:
        for fid, success in ex.map(download, todo):
            ok += success
            fail += not success
    print(f"done. ok={ok} missing/fail={fail} -> {OUT}")


if __name__ == "__main__":
    main()
