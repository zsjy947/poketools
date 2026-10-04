# engine-adapter（对战引擎适配层）

引擎来源对上层透明的薄层——**当前为供应商化上游引擎**（`vendor/ps-engine.js`，含 champions mod，gitignore；`web/scripts/build-engine.mjs` 从 `data/raw/pokemon-showdown` 重建，锁定 commit 记录于 `web/scripts/config.json`）。若未来 @pkmn/sim 官方发布含 champions 的版本，仅需改 `index.ts` 的重导出来源，UI 与测试不感知。

- `index.ts`：重导出 + 对外类型重声明（引擎内部类型不泄漏给 UI）。
- `session.ts`：对局会话（同一进程持有 p1/p2 两条输入流、request/choice 协议）。
- `parse.ts`：协议行 → 结构化事件（含 `-damage`/`-heal`/`-mega`/`-zpower`/`-weather` 等虚线次要事件；未识别类型透传 raw）。

分层约束：数据访问一律经 `src/data/` 层，本层不直接做 UI 查询。
