"""52poke MediaWiki 共享客户端：本地缓存 wikitext + imageinfo 直链 + 图片下载。

三个抓取脚本（scrape_52poke / fetch_feature_images / fetch_sandwich_images）共用，
消除各自的重复实现。要点：
- wikitext 批量抓取（每批 ≤50 标题）必须写 `data/raw/52poke-cache/` 本地缓存；
- 图片下载走 `api.php?prop=imageinfo` 拿 media.52poke.com 直链（Special:FilePath 会 403），
  且需要 Referer + 浏览器式 UA；
- API 会把标题中的下划线规范化为空格，查表键要统一。
"""
from __future__ import annotations

import io
import re
import time
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / "data" / "raw" / "52poke-cache"
API = "https://wiki.52poke.com/api.php"
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) poketools/0.4 (asset build)"
BATCH = 25   # 网关对过长 URL 偶发 502，缩批次

_session = requests.Session()
_session.headers["User-Agent"] = UA
_aliases: dict[str, str] = {}   # 重定向 from -> to


def cache_path(title: str) -> Path:
    safe = re.sub(r'[\\/:*?"<>|]', "_", title)
    return CACHE / f"{safe}.txt"


def _api(params: dict, retries: int = 5) -> dict | None:
    """带重试的 api.php GET（429/5xx 指数退避——网关对长 URL 偶发 502）。"""
    import sys
    for attempt in range(retries):
        try:
            while True:
                r = _session.get(API, params=params, timeout=90)
                if r.status_code in (429, 502, 503):
                    time.sleep(8 * (attempt + 1))
                    continue
                r.raise_for_status()
                return r.json()
        except Exception as e:  # noqa: BLE001 —— 单批失败重试后跳过
            if attempt == retries - 1:
                print(f"  !! api 批次异常: {type(e).__name__}: {str(e)[:160]}",
                      file=sys.stderr)
                return None
            time.sleep(5 * (attempt + 1))
    return None


def fetch_titles(titles: list[str]) -> None:
    """批量下载 wikitext 到缓存（每批 ≤50 标题，带 continue 与重定向记录）。"""
    CACHE.mkdir(parents=True, exist_ok=True)
    todo = [t for t in dict.fromkeys(titles) if not cache_path(t).exists()]
    if not todo:
        return
    print(f"  fetching {len(todo)} pages from 52poke ...")
    for i in range(0, len(todo), BATCH):
        chunk = todo[i:i + BATCH]
        params = {
            "action": "query", "prop": "revisions", "rvprop": "content",
            "rvslots": "main", "titles": "|".join(chunk),
            "format": "json", "formatversion": "2", "redirects": 1,
        }
        data = _api(params)
        if data is None:
            print(f"  !! batch {i} failed, skipping")
            continue
        q = data.get("query", {})
        for red in q.get("redirects", []):
            _aliases[red["from"]] = red["to"]
        for page in q.get("pages", []):
            if page.get("missing"):
                continue
            revs = page.get("revisions") or []
            if revs:
                cache_path(page["title"]).write_text(
                    revs[0]["slots"]["main"]["content"], encoding="utf-8")
        time.sleep(0.6)
        done = min(i + BATCH, len(todo))
        if done % 200 == 0 or done == len(todo):
            print(f"    {done}/{len(todo)}")


def get_wikitext(title: str) -> str | None:
    """读缓存（含重定向别名与「（宝可梦）」后缀回退）；未缓存返回 None。"""
    for t in (title, _aliases.get(title), f"{title}（宝可梦）"):
        if not t:
            continue
        p = cache_path(t)
        if p.exists():
            return p.read_text(encoding="utf-8")
    return None


def fetch_wikitext(title: str) -> str:
    """单页 wikitext（缓存优先，未缓存则现场抓取）。"""
    wt = get_wikitext(title)
    if wt is not None:
        return wt
    fetch_titles([title])
    wt = get_wikitext(title)
    return wt or ""


def image_urls(titles: list[str], thumb_width: int | None = None) -> dict[str, str]:
    """File:标题 → 直链（或缩略图直链）。批量，键为 API 规范化标题（下划线→空格）。"""
    out: dict[str, str] = {}
    for i in range(0, len(titles), BATCH):
        chunk = titles[i:i + BATCH]
        params = {
            "action": "query", "titles": "|".join(chunk),
            "prop": "imageinfo", "iiprop": "url",
            "format": "json", "formatversion": 2,
        }
        if thumb_width:
            params["iiurlwidth"] = thumb_width
        data = _api(params)
        if not data:
            print(f"  !! imageinfo 批次失败: titles[{i}:{i + len(chunk)}]", file=__import__("sys").stderr)
            continue
        for page in data.get("query", {}).get("pages", []):
            if page.get("missing"):
                continue
            ii = (page.get("imageinfo") or [{}])[0]
            url = ii.get("thumburl") if thumb_width else ii.get("url")
            if url:
                out[page["title"]] = url
        time.sleep(0.5)
    return out


def by_normalized(urls: dict[str, str], title: str) -> str | None:
    """按规范化标题查直链（API 把下划线规范化为空格）。"""
    return urls.get(title.replace("_", " "))


def fetch_bytes(url: str) -> bytes:
    """下载文件内容（media.52poke.com 直链需 Referer）。"""
    r = _session.get(url, headers={"Referer": "https://wiki.52poke.com/"}, timeout=90)
    r.raise_for_status()
    return r.content


def download(url: str, dest: Path) -> bool:
    """下载到 dest（已存在跳过；需 Referer 防直链 403）。"""
    if dest.exists() and dest.stat().st_size > 0:
        return True
    try:
        r = _session.get(url, headers={"Referer": "https://wiki.52poke.com/"}, timeout=90)
        if r.status_code == 200 and len(r.content) > 500:
            dest.write_bytes(r.content)
            return True
        print(f"  http {r.status_code} for {url[:90]}")
    except Exception as e:  # noqa: BLE001
        print(f"  fail {url[:90]}: {e}")
    return False


def download_webp(url: str, dest: Path, width: int = 360, quality: int = 88) -> bool:
    """下载并等比缩放到指定宽度，存 webp（已存在跳过）。"""
    if dest.exists() and dest.stat().st_size > 0:
        return True
    try:
        from PIL import Image
        r = _session.get(url, headers={"Referer": "https://wiki.52poke.com/"}, timeout=90)
        if r.status_code != 200 or len(r.content) <= 500:
            print(f"  http {r.status_code} for {url[:90]}")
            return False
        im = Image.open(io.BytesIO(r.content))
        w, h = im.size
        im = im.resize((width, round(h * width / w)), Image.LANCZOS)
        im.save(dest, "WEBP", quality=quality)
        return True
    except Exception as e:  # noqa: BLE001
        print(f"  fail {url[:90]}: {e}")
        return False
