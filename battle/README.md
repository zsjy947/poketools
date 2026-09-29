# 宝可梦模拟对战（Pokémon Solo Battle）

完全本地、无服务器的个人对战练功工具：自建两支队伍，单人操控对战双方，
复用 Showdown 对战引擎与全量赛制数据（Windows exe + Android APK 双端，安装后完全离线）。

> 本目录是 poketools 仓库 `battle` 分支上的 monorepo 子项目，与主仓 Python 栈零耦合。
> 规划与规范唯一权威：`plans/00-项目规划文档.md`（里程碑 M0-M8、DoR/DoD、测试与发布规范）。

## 目录结构

```
battle/
├─ (无独立 docs/)      # 规划文档在仓库 plans/（不入 git）；功能说明文档 = 项目 docs/BATTLE.md 单文档
├─ src/               # 前端（React 18 + TS strict）
│  ├─ app/            #   应用壳、路由、全局状态
│  ├─ team/           #   队伍构建器（M3）
│  ├─ battle/         #   对战界面（信息流 M4 + 动画渲染 M5）
│  ├─ engine-adapter/ #   @pkmn/sim 适配层（阵营输入路由/日志解析/状态机，M2）
│  ├─ data/           #   数据访问层 + 管线产物（gitignore，M1 生成）
│  └─ assets/         #   精灵图/动画/图标/叫声（gitignore，素材管线生成）
├─ src-tauri/         # Tauri 2 壳（Windows NSIS / Android APK）
├─ scripts/           # 数据/素材管线（Node）：fetch-data / export-formats / verify-data / fetch-sprites
├─ tests/             # 单元 / 集成 / 金标准对拍
├─ CHANGELOG.md
└─ NOTICE             # 第三方来源与协议声明
```

## 开发命令（M0 完成构建链打通后生效）

```bash
pnpm install
pnpm dev            # Vite 开发服务器（:1420）
pnpm tauri dev      # Tauri 桌面壳
pnpm lint && pnpm test && pnpm build
pnpm tauri build            # Windows NSIS 安装包
pnpm tauri android build    # Android APK（需 Android SDK）
```

## 规范速记

- TypeScript `strict` 全开（含 noUncheckedIndexedAccess），禁用 `any`；ESLint + Prettier 强制统一。
- 用户可见文案全部简体中文；素材不进 git、不进公开渠道（版权立场见 NOTICE 与 plans/00 §2.3）。
- commit：`类型: 摘要` + `[battle]` 前缀（沿用主仓规范，便于检索）。
- 里程碑合入前按 plans/00 §6.6 审查清单自审（含协议合规：AGPL 零进入）。
