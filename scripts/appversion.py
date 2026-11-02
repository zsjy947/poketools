# -*- coding: utf-8 -*-
"""应用版本单一来源：web/package.json（桌面 Tauri / 安卓 APK 同源）。

被 android/pack.toml 的 version_ref = "scripts.appversion:__version__" 消费
（apx.versioning 将项目根加入 sys.path 后 import）。
"""
import json
from pathlib import Path

_PKG = Path(__file__).resolve().parent.parent / "web" / "package.json"

__version__ = json.loads(_PKG.read_text(encoding="utf-8"))["version"]
