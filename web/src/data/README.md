# data（数据访问层·唯一实现）

一切 UI 查询的数据入口——图鉴/招式/学习表/赛制/伤害计算的领域逻辑收拢在本目录的 TS 单实现（v1.0.0 终态统一：原 Python FastAPI 后端与 battle 子应用数据层均已并入此处）。

- `index.ts`：对外门面；`local-api.ts`：本地 API 调度器（端点签名与原 FastAPI 一致，`api.ts` 在无后端时调用；实现分布于 core/pokemon/lookup/calc/damage 与 `state/user.ts`）。
- `core.ts` / `pokemon.ts` / `lookup.ts`：图鉴与查询（`public/data/*.json` 为构建期管线 `scripts/build_db.py` + `export_static_data.py` 的产物，manifest 带 data_version）。
- `damage.ts`：伤害计算（对齐 @smogon/calc gen9，公式与取整链锁定，门禁 `tools/calib` 51+41）；`calc.ts` 计算页组装。
- `zh-patch.ts`（手工修订表）+ `zh-gen.ts`（管线生成表）：中文名/文案双源；`zh-patch` 优先。
- `formats.ts`：赛制目录（构建期校验）；`battle-items.ts` 对战道具表。

分层约束：UI 不直接触碰引擎 Dex（`engine-adapter` 亦经本层取数）。
