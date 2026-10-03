"""桌面老用户数据迁移：data/userstate.db → JSON（web 端一次性 importAll 导入）。

用法：python scripts/export_userstate.py [输出路径]
默认输出 data/userstate_export.json。在 web 端控制台执行：
  const { importAll } = await import('/src/state/user.ts');
  importAll(JSON.parse(await (await fetch('userstate_export.json')).json()));
（打包产物场景把该 JSON 放到 web/public/ 下再 fetch，或直接粘贴文件内容。）
"""
from __future__ import annotations

import json
import sqlite3
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DB = ROOT / "data" / "userstate.db"


def _recipe_items_counted(raw: str) -> list:
    """兼容三种历史存法：[{name,count}] / 字符串数组 / 顿号文本。与后端读取语义一致
    （旧格式原样保留，web 端展示层兼容）。"""
    try:
        v = json.loads(raw or "[]")
    except (ValueError, TypeError):
        return raw or ""
    return v if isinstance(v, list) else raw


def main() -> None:
    if not DB.exists():
        sys.exit("data/userstate.db 不存在（无桌面老用户数据需要迁移）")
    out_path = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "data" / "userstate_export.json"
    con = sqlite3.connect(DB)
    con.row_factory = sqlite3.Row

    # caught_state：按 dex 归组 {dex_id: {species_id: 0/1}}（对齐 web localStorage 结构）
    caught: dict[str, dict[str, int]] = {}
    for r in con.execute(
            "SELECT dex_id, species_id, caught FROM caught_state WHERE profile_id=1"):
        caught.setdefault(str(r["dex_id"]), {})[str(r["species_id"])] = 1 if r["caught"] else 0

    # custom_recipes：effects/ingredients/seasonings 的 JSON 字符串还原
    recipes = []
    for r in con.execute(
            "SELECT id, game, name, effects, ingredients, seasonings, created_at "
            "FROM custom_recipes WHERE profile_id=1 ORDER BY id"):
        recipes.append({
            "id": r["id"], "game": r["game"], "name": r["name"],
            "effects": json.loads(r["effects"] or "[]"),
            "ingredients": _recipe_items_counted(r["ingredients"]),
            "seasonings": _recipe_items_counted(r["seasonings"]),
            "created_at": r["created_at"],
        })
    con.close()

    payload = {
        "_comment": "poketools 桌面版用户数据一次性导出（caught_state + custom_recipes，默认档案）",
        "caught_state": caught,
        "custom_recipes": recipes,
    }
    out_path.write_text(json.dumps(payload, ensure_ascii=False, indent=1), encoding="utf-8")
    n_caught = sum(1 for by in caught.values() for v in by.values() if v == 1)
    print(f"导出完成 → {out_path}")
    print(f"  caught_state: {len(caught)} 图鉴 / {n_caught} 只已捕捉")
    print(f"  custom_recipes: {len(recipes)} 条")


if __name__ == "__main__":
    main()
