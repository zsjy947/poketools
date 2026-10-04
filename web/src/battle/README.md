# battle（对战界面与演出）

- `BattleView.tsx`：信息流 + 演出一体化对战界面——单人操控双方（阵营 A/B 配色切换防误操作）、多槽指令合成与目标选择、机制按钮（Mega/Z/极巨/太晶互斥点亮）、完整战斗日志回看与 Showdown 导出。
- `anim.ts`：事件 → 演出步骤映射（`useBattleAnim`，事件流来自 `engine-adapter/parse.ts` 的结构化事件，含 `-damage`/`-heal`/`-mega`/`-zpower` 等虚线次要事件）；动画关闭时自动降级纯信息流。
- `sprites.ts`：精灵图 URL 解析（正面/背面/动画/官方绘图回退链，`public/sprites`）。

引擎交互全部经 `engine-adapter`（引擎内部类型不泄漏），数据访问经 `data/` 层；对局记录经 `app/storage.ts`（localStorage）。
