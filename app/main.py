"""PokéTools 本地服务入口：API + 静态前端 + 宝可梦图片。

开发运行:  python app/main.py   → http://127.0.0.1:8734
桌面运行:  pythonw launcher.pyw
"""
from __future__ import annotations

import socket
import sys
from pathlib import Path

import uvicorn
from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from .db import project_root
from .routers import calc, dex, lookup, pokemon

ROOT = project_root()
if getattr(sys, "frozen", False):
    DIST = Path(getattr(sys, "_MEIPASS", ROOT)) / "app" / "static" / "dist"
else:
    DIST = Path(__file__).resolve().parent / "static" / "dist"
SPRITES = ROOT / "data" / "sprites"
PORT = 8734

app = FastAPI(title="PokéTools", docs_url=None, redoc_url=None)
app.include_router(dex.router)
app.include_router(pokemon.router)
app.include_router(lookup.router)
app.include_router(calc.router)

if SPRITES.exists():
    app.mount("/sprites", StaticFiles(directory=SPRITES), name="sprites")


@app.get("/api/ping")
def ping():
    return {"ok": True}


@app.get("/")
def index():
    if (DIST / "index.html").exists():
        return FileResponse(DIST / "index.html")
    return {"error": "frontend not built", "hint": "cd web && npm run build，或参见 README"}


if DIST.exists():
    # 挂在最后：API 路由优先，其余路径全部走前端静态文件
    app.mount("/", StaticFiles(directory=DIST, html=True), name="dist")


def find_free_port(preferred: int) -> int:
    for p in (preferred, preferred + 1, preferred + 2, 0):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            try:
                s.bind(("127.0.0.1", p))
                return s.getsockname()[1]
            except OSError:
                continue
    return preferred


def main() -> None:
    port = find_free_port(PORT)
    print(f"PokéTools -> http://127.0.0.1:{port}")
    uvicorn.run(app, host="127.0.0.1", port=port, log_level="warning")


if __name__ == "__main__":
    main()
