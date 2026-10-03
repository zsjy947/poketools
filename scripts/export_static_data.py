"""数据静态化导出：poketools.db 读侧 → JSON 分片（路线 B / APK 基座，UPDATE-PLAN §3.2/§4.1）。

产物（app/static/data/，随 gitignore，可重复执行重建）：
- tables/{表名}.json        —— 常规表全量（{rows:[...]}，保持 SQL 读序）
- learnsets/vg{id}.json     —— learnsets 按 vg 分片（详情招式表/生蛋链按需载入）
- learnsets_all/{sid}.json  —— learnsets_all 按物种分片（计算器招式并集懒加载）
- encounters/{sid}.json     —— encounters 按物种分片（剑盾捕捉地点懒加载；无行物种不建文件）
- manifest.json             —— 版本（db 行数指纹）、文件清单与行数（diff 门禁与前端加载用）

一致性硬门禁（A1 go/no-go）：导出后立即回读 SQLite 全表逐行逐字段与分片比对，
任何差异非零退出（脚本自身即门禁，CI/构建期直接调用）。
"""
from __future__ import annotations

import hashlib
import json
import sqlite3
import sys
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

ROOT = Path(__file__).resolve().parent.parent

DB_PATH = ROOT / "data" / "poketools.db"
OUT_DIR = ROOT / "web" / "public" / "data"

# 分片例外：这三张表不进 tables/ 全量文件
SHARDED = {"learnsets": "vg", "learnsets_all": "species", "encounters": "species"}


def _rows(con: sqlite3.Connection, sql: str, args: tuple = ()) -> list[dict]:
    return [dict(r) for r in con.execute(sql, args)]


def export_table(con: sqlite3.Connection, table: str) -> int:
    rows = _rows(con, f"SELECT * FROM {table}")
    path = OUT_DIR / "tables" / f"{table}.json"
    path.write_text(json.dumps({"table": table, "rows": rows},
                               ensure_ascii=False, separators=(",", ":")),
                    encoding="utf-8")
    return len(rows)


def export_learnsets_by_vg(con: sqlite3.Connection) -> int:
    n = 0
    for (vg,) in con.execute("SELECT DISTINCT vg FROM learnsets ORDER BY vg"):
        rows = _rows(con, "SELECT * FROM learnsets WHERE vg=? ORDER BY rowid", (vg,))
        (OUT_DIR / "learnsets" / f"vg{vg}.json").write_text(
            json.dumps({"vg": vg, "rows": rows}, ensure_ascii=False,
                       separators=(",", ":")), encoding="utf-8")
        n += len(rows)
    return n


def export_by_species(con: sqlite3.Connection, table: str, order_col: str) -> int:
    """learnsets_all / encounters：按 forms.species_id 切片（保持 rowid 序）。"""
    n = 0
    sids = [r[0] for r in con.execute(
        f"""SELECT DISTINCT f.species_id FROM {table} t
            JOIN forms f ON f.id = t.form_id ORDER BY f.species_id""")]
    for sid in sids:
        rows = _rows(con, f"""SELECT t.* FROM {table} t JOIN forms f ON f.id = t.form_id
                              WHERE f.species_id=? ORDER BY t.rowid""", (sid,))
        (OUT_DIR / table / f"{sid}.json").write_text(
            json.dumps({"species_id": sid, "rows": rows}, ensure_ascii=False,
                       separators=(",", ":")), encoding="utf-8")
        n += len(rows)
    return n


def verify_against_db(con: sqlite3.Connection, manifest: dict) -> tuple[int, list[str]]:
    """硬门禁：SQLite 全表逐行逐字段 vs 导出分片，必须零差异。

    分片表（learnsets/learnsets_all/encounters）按分片口径校验：
    每个分片文件 ↔ SQLite 同键切片（保持 rowid 序）逐行比对，行数与字段全等。"""
    errors: list[str] = []
    checked = 0
    for table, meta in manifest["tables"].items():
        db_rows = _rows(con, f"SELECT * FROM {table} ORDER BY rowid")
        if table == "learnsets":
            for f in meta["files"]:
                vg = json.loads((OUT_DIR / f).read_text(encoding="utf-8"))["vg"]
                slice_rows = _rows(
                    con, "SELECT * FROM learnsets WHERE vg=? ORDER BY rowid", (vg,))
                exported = json.loads(
                    (OUT_DIR / f).read_text(encoding="utf-8"))["rows"]
                checked += len(slice_rows)
                if slice_rows != exported:
                    errors.append(f"learnsets vg{vg}: {len(slice_rows)} vs {len(exported)}")
        elif table in ("learnsets_all", "encounters"):
            for f in meta["files"]:
                sid = json.loads((OUT_DIR / f).read_text(encoding="utf-8"))["species_id"]
                slice_rows = _rows(
                    con, f"""SELECT t.* FROM {table} t JOIN forms f ON f.id=t.form_id
                             WHERE f.species_id=? ORDER BY t.rowid""", (sid,))
                exported = json.loads(
                    (OUT_DIR / f).read_text(encoding="utf-8"))["rows"]
                checked += len(slice_rows)
                if slice_rows != exported:
                    errors.append(
                        f"{table} species {sid}: {len(slice_rows)} vs {len(exported)}")
        else:
            exported: list[dict] = []
            for f in meta["files"]:
                exported.extend(
                    json.loads((OUT_DIR / f).read_text(encoding="utf-8"))["rows"])
            checked += len(db_rows)
            if db_rows != exported:
                first = next((i for i, (a, b) in enumerate(zip(db_rows, exported, strict=False))
                              if a != b), None)
                errors.append(
                    f"{table}: db {len(db_rows)} 行 vs 导出 {len(exported)} 行"
                    + ("" if len(db_rows) != len(exported) else f"，首个差异行 {first}"))
    return checked, errors


def main() -> int:
    con = sqlite3.connect(f"file:{DB_PATH}?mode=ro", uri=True)
    con.row_factory = sqlite3.Row
    tables = [r[0] for r in con.execute(
        "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")]

    if OUT_DIR.exists():
        for sub in (OUT_DIR / "tables", OUT_DIR / "learnsets",
                    OUT_DIR / "learnsets_all", OUT_DIR / "encounters"):
            if sub.exists():
                for f in sub.glob("*.json"):
                    f.unlink()
    for sub in ("tables", "learnsets", "learnsets_all", "encounters"):
        (OUT_DIR / sub).mkdir(parents=True, exist_ok=True)

    manifest: dict = {"tables": {}, "generated_at": datetime.now().isoformat(timespec="seconds")}
    for table in tables:
        if table in SHARDED:
            continue
        n = export_table(con, table)
        manifest["tables"][table] = {"rows": n, "files": [f"tables/{table}.json"]}

    n = export_learnsets_by_vg(con)
    manifest["tables"]["learnsets"] = {
        "rows": n, "files": sorted(
            f"learnsets/{p.name}" for p in (OUT_DIR / "learnsets").glob("*.json"))}

    for table in ("learnsets_all", "encounters"):
        n = export_by_species(con, table, "rowid")
        manifest["tables"][table] = {
            "rows": n, "files": sorted(
                f"{table}/{p.name}" for p in (OUT_DIR / table).glob("*.json"))}

    # 版本指纹：行数矩阵的散列（数据变更 → 前端可检测刷新）
    digest_src = json.dumps({t: m["rows"] for t, m in manifest["tables"].items()},
                            ensure_ascii=False, sort_keys=True)
    manifest["data_version"] = hashlib.sha256(digest_src.encode()).hexdigest()[:16]

    checked, errors = verify_against_db(con, manifest)
    total_db = sum(con.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0]
                   for t in tables)
    con.close()

    manifest["verify"] = {"rows_compared": checked, "db_total_rows": total_db,
                          "diff_errors": errors[:5], "ok": not errors}
    (OUT_DIR / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=1), encoding="utf-8")

    size = sum(f.stat().st_size for f in OUT_DIR.rglob("*.json"))
    print(f"导出 {len(manifest['tables'])} 表 {total_db} 行 → {OUT_DIR} "
          f"（{size / 1048576:.1f} MB，data_version={manifest['data_version']}）")
    if errors:
        for e in errors[:5]:
            print(f"  [DIFF] {e}", file=sys.stderr)
        print(f"一致性硬门禁失败：{len(errors)} 表存在差异", file=sys.stderr)
        return 1
    print(f"一致性硬门禁通过：{checked}/{total_db} 行逐字段比对零差异")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
