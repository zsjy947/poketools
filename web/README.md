# web/ —— poketools 唯一前端（React 18 + TS strict + Vite + Tauri 2 壳）

图鉴 / 努力值 / 三明治 / 甜甜圈 / 咖喱 / 伤害计算器 / 模拟对战的统一实现，
运行时完全离线（Tauri custom-protocol 内嵌全部资产，零 API 零网络）。
模拟对战功能说明唯一权威：`docs/BATTLE.md`；历史规划未完成项见 `plans/ROADMAP.md`（本地维护，不入 git）。

> 桌面壳随本目录 src-tauri/ 发布（NSIS 安装包 / 便携 exe）；安卓壳已随 v1.0.0 收官迁至
> `archived/android` 分支存档。第三方来源与协议声明见 NOTICE 与 CHANGELOG.md。

## 目录结构

```
web/
├─ src/
│  ├─ main.tsx          # 入口（样式装载顺序：battle → 壳 → 组件库）
│  ├─ app/              # 统一壳：App.tsx hash 路由分发 + 分区 keep-alive + 壳样式
│  ├─ lib/              # 零依赖通用件（hash 路由 router.ts）
│  ├─ state/            # 客户端状态：game.ts（当前游戏上下文）/ user.ts（localStorage 持久化）
│  ├─ components/       # 共享 UI 组件库 shared.tsx + 设计系统 CSS（pkt- 前缀类名避撞）
│  ├─ pages/            # hash 路由功能页（游戏中心/图鉴/详情/努力值/特化页/计算器）
│  │  └─ calc/          #   计算器子组件 + 共享模型 model.ts
│  ├─ battle/           # 模拟对战自包含 feature：BattleApp/赛制页/store/storage/对战视图/演出/样式
│  ├─ data/             # 数据访问层唯一实现（领域逻辑：伤害公式/生蛋链/视图组装/简中化）
│  ├─ team/             # Showdown 队伍文本导入/导出/合法性校验
│  └─ engine-adapter/   # 供应商化 Showdown 引擎适配层（vendor/ gitignore，build-engine.mjs 重建）
├─ scripts/             # 构建/数据管线（Node 22）：build-engine / fetch-sprites / verify-data 等
├─ tests/               # vitest：calib 51+41 对拍 + damage/breeding/state golden + 引擎/回放
├─ src-tauri/           # Tauri 2 桌面壳（NSIS/便携，custom-protocol 资产协议）
├─ public/              # 构建期生成（gitignore）：data 分片/精灵图/素材
└─ CHANGELOG.md
```

分层约束：`pages/` 与 `battle/` 只经 `data/` 取数、只经 `components/` 复用 UI；
`data/` 与 `team/`、`battle/` 经 `engine-adapter/` 触引擎（引擎内部类型不泄漏到 UI）；
`engine-adapter/` 不依赖任何上层。用户数据：`state/user.ts`（`pkt.*` 键）与
`battle/storage.ts`（队伍/对局记录）互不干扰。

## 开发命令

```bash
pnpm install
pnpm dev            # Vite 开发服务器（:1420，与 tauri.conf.json devUrl 对齐）
pnpm test           # vitest（改伤害公式后必须重跑 calib）
pnpm build          # tsc --noEmit + vite build
pnpm lint           # eslint + prettier（零错误基线）
npx tauri build     # 桌面打包
```

## 规范速记

- TypeScript `strict` 全开（含 noUncheckedIndexedAccess / exactOptionalPropertyTypes）；
  ESLint + Prettier 强制统一（构建脚本审批在 pnpm-workspace.yaml，pnpm ≥10 不读 package.json 的 pnpm 字段）。
- 用户可见文案全部简体中文；素材不进 git、不进公开渠道（版权立场见 NOTICE 与 docs/BATTLE.md「合规立场」）。
- 无数据一律标「待补充」，禁止编造。
