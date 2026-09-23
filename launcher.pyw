"""PokéTools 桌面启动器（pythonw launcher.pyw 或双击 Poketools.exe）。

启动本地 API 服务线程 → pywebview 原生窗口；WebView2 不可用时回退到默认浏览器。
任何启动错误都会写入 exe 旁边的 Poketools.log，缺 data 时弹窗提示。
"""
from __future__ import annotations

import socket
import sys
import threading
import time
import traceback
import webbrowser
from pathlib import Path

FROZEN = getattr(sys, "frozen", False)
BASE = Path(sys.executable).resolve().parent if FROZEN else Path(__file__).resolve().parent
sys.path.insert(0, str(BASE))

LOG_PATH = BASE / "Poketools.log"


def log(msg: str) -> None:
    try:
        with open(LOG_PATH, "a", encoding="utf-8") as f:
            f.write(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] {msg}\n")
    except OSError:
        pass


# 打包后无控制台，把标准输出/错误重定向到日志，避免 uvicorn 写 None 崩溃
if FROZEN:
    try:
        sys.stdout = open(LOG_PATH, "a", encoding="utf-8", buffering=1)
        sys.stderr = sys.stdout
    except OSError:
        pass


def find_free_port(preferred: int) -> int:
    for p in (preferred, preferred + 1, preferred + 2, preferred + 3, 0):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            try:
                s.bind(("127.0.0.1", p))
                return s.getsockname()[1]
            except OSError:
                continue
    return preferred


def wait_port(port: int, timeout: float = 15.0) -> bool:
    deadline = time.time() + timeout
    while time.time() < deadline:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.settimeout(0.4)
            try:
                s.connect(("127.0.0.1", port))
                return True
            except OSError:
                time.sleep(0.15)
    return False


def alert(text: str) -> None:
    try:
        import ctypes
        ctypes.windll.user32.MessageBoxW(None, text, "PokéTools", 0x10)
    except Exception:
        log("alert: " + text)


def main() -> None:
    log(f"launcher start (frozen={FROZEN})")

    # 数据库检查：data 文件夹必须在 exe/脚本旁边
    db = BASE / "data" / "poketools.db"
    if not db.exists():
        alt = Path.cwd() / "data" / "poketools.db"
        if alt.exists():
            import app.db as appdb
            appdb.DATA = alt.parent
            appdb.STATIC_DB = alt
            appdb.ROOT = alt.parent
        else:
            alert("未找到 data\\poketools.db。\n\n请将 data 文件夹放在 Poketools.exe 旁边再启动。")
            return

    port = find_free_port(8734)
    url = f"http://127.0.0.1:{port}"

    try:
        import uvicorn
        from app.main import app
    except Exception:
        log("import server failed:\n" + traceback.format_exc())
        alert("服务启动失败，详见 Poketools.log")
        return

    threading.Thread(
        target=lambda: uvicorn.run(app, host="127.0.0.1", port=port, log_level="warning"),
        daemon=True,
    ).start()

    if not wait_port(port):
        log("server did not start in time")
        alert("本地服务启动超时，详见 Poketools.log")
        return

    try:
        import webview

        webview.create_window(
            "PokéTools 宝可梦工具助手", url, width=1320, height=900, min_size=(980, 640)
        )
        webview.start()
        log("webview window closed normally")
    except Exception:
        log("webview failed, fallback to browser:\n" + traceback.format_exc())
        webbrowser.open(url)
        try:
            while True:
                time.sleep(3600)
        except KeyboardInterrupt:
            pass


if __name__ == "__main__":
    main()
