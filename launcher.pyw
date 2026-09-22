"""PokéTools 桌面启动器（pythonw launcher.pyw 双击运行，无命令行窗口）。

启动本地 API 服务线程 → pywebview 原生窗口；若 WebView2 不可用则回退到默认浏览器。
"""
from __future__ import annotations

import socket
import sys
import threading
import time
import webbrowser
from pathlib import Path

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))

import uvicorn  # noqa: E402

from app.main import app  # noqa: E402


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


def main() -> None:
    port = find_free_port(8734)
    url = f"http://127.0.0.1:{port}"
    threading.Thread(
        target=lambda: uvicorn.run(app, host="127.0.0.1", port=port, log_level="warning"),
        daemon=True,
    ).start()
    if not wait_port(port):
        webbrowser.open(url)
        time.sleep(5)
        return

    try:
        import webview

        webview.create_window(
            "PokéTools 宝可梦工具助手", url, width=1320, height=900, min_size=(980, 640)
        )
        webview.start()
    except Exception:
        # WebView2 缺失等情况下回退到系统浏览器
        webbrowser.open(url)
        print(f"PokéTools 运行中：{url}（关闭本进程即退出）")
        try:
            while True:
                time.sleep(3600)
        except KeyboardInterrupt:
            pass


if __name__ == "__main__":
    main()
