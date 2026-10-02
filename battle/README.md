# 宝可梦模拟对战（Pokémon Solo Battle）

完全本地、无服务器的个人对战练功工具：自建两支队伍，单人操控对战双方，
复用 Showdown 对战引擎与全量赛制数据，安装后完全离线。
应用本体为纯前端 SPA（Vite 构建）；桌面/安卓打包壳已迁移至仓库 `dev/android` 分支。

> 本目录是 poketools 仓库内的 monorepo 子项目（原 battle 分支，已合回 main），与主仓 Python 栈零耦合。
> 功能说明唯一权威：`docs/BATTLE.md`；历史规划未完成项见 `plans/ROADMAP.md`（本地维护，不入 git）。

## 目录结构

```
battle/
├─ (无独立 docs/)      # 功能说明文档 = 项目 docs/BATTLE.md 单文档
├─ src/               # 前端（React 18 + TS strict）
│  ├─ app/            #   应用壳、路由、全局状态
│  ├─ team/           #   队伍构建器
│  ├─ battle/         #   对战界面（信息流 + 动画渲染）
│  ├─ engine-adapter/ #   供应商化 Showdown 引擎适配层（阵营输入路由/日志解析/状态机）
│  ├─ data/           #   数据访问层 + 管线产物（gitignore，生成）
│  └─ assets/         #   精灵图/动画/图标/叫声（gitignore，素材管线生成）
├─ scripts/           # 数据/素材管线（Node）：build-engine / fetch-sprites 等
├─ tests/             # 单元 / 集成 / 金标准对拍
├─ CHANGELOG.md
└─ NOTICE             # 第三方来源与协议声明
```

## 开发命令

```bash
pnpm install
pnpm dev            # Vite 开发服务器（:1420）
pnpm lint && pnpm test && pnpm build
```

## 规范速记

- TypeScript `strict` 全开（含 noUncheckedIndexedAccess），禁用 `any`；ESLint + Prettier 强制统一。
- 用户可见文案全部简体中文；素材不进 git、不进公开渠道（版权立场见 NOTICE 与 docs/BATTLE.md「合规立场」）。
- commit：`类型: 摘要` + `[battle]` 前缀（沿用主仓规范，便于检索）。
- 合入前自审（含协议合规：AGPL 零进入；历史审查报告见 docs/BATTLE.md §6.1）。
