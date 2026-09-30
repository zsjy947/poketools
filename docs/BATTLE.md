# BATTLE —— 模拟对战功能说明

> battle/ 子应用的**单文档**（架构 / 环境 / 数据 / 使用 / 过程记录）。
> 规划与里程碑规格见 `plans/00-项目规划文档.md`（本地维护，不入 git）；本文只沉淀**已实现**结论，随里程碑更新。

## 文档信息

| 项目 | 内容 |
| --- | --- |
| 文档编号 | docs/BATTLE |
| 适用版本 | battle 0.1.0（M0-M4） |
| 上游仓库 | github.com/pokemon-showdown/pokemon-showdown（`data/raw/pokemon-showdown`，锁定 commit 见 `battle/scripts/config.json`） |
| 引擎许可 | 上游 MIT（sim/ + data/）；供应商化打包产物 `src/engine-adapter/vendor/ps-engine.js` 为 gitignore 可重建物 |

## 1. 功能概览

**宝可梦模拟对战（Pokémon Solo Battle）**：完全本地、离线可用、单人操控双方的 Switch 世代对战练功工具。

- **赛制选择**（FR-01）：8 个内置赛制（6 P0 + 2 P1），覆盖 朱紫 VGC/BSS、宝可梦冠军（Pokémon Champions）VGC/BSS、OU、自定义。
- **队伍构建**（FR-02~05）：A/B 双阵营槽位、逐项编辑器（等级/IV/EV/性格/特性/道具/招式/太晶）、Showdown 文本导入导出、按赛制实时合法性校验（中文错误提示）。
- **上阵预览**（FR-06）：按赛制 6 选 4 / 6 选 3 / 整队；OTS 双方阵容互见。
- **信息流对战**（FR-07/09）：单人操控双方（阵营切换 + 锁定态防误操作）、仿 Showdown 场地（站位精灵/血条/异常状态/太晶·超巨标记/替补精灵球）、招式/换人指令面板、完整战斗日志回看。
- **动画演出**（FR-08）：M5 细化中；当前为静态精灵 + 血条动画，动画开关关闭时自动降级信息流。
- **对局记录**（FR-10）：终局自动入库（localStorage 持久化，双端一致），含胜者/回合数/完整确定性日志，可回看。

## 2. 架构

```
battle/
├─ src/
│  ├─ app/                  # 应用层（React 18 + zustand）
│  │  ├─ App.tsx            # 应用壳 + ErrorBoundary（渲染异常兜底，不整树卸载）
│  │  ├─ store.ts           # 全局态（页面流/双队伍槽/会话桥/记录/设置）
│  │  ├─ storage.ts         # localStorage 持久化（队伍/记录/设置，Web 与 Tauri 双端一致）
│  │  └─ pages/             # Home(赛制)/TeamBuilder(队伍)/Preview(上阵)/Records/Settings
│  ├─ battle/
│  │  ├─ BattleView.tsx     # 对战界面（多槽指令合成/目标选择/机制按钮/日志）
│  │  └─ sprites.ts         # 精灵图 URL（正面/背面/动画，public/sprites）
│  ├─ data/
│  │  ├─ formats.ts         # 赛制目录（FORMAT_CATALOG 8 项 + verifyFormats 构建期校验）
│  │  └─ index.ts           # 数据访问层（一切 UI 查询经此，不直接触碰引擎 Dex）
│  ├─ team/showdown.ts      # Showdown 文本导入/导出/校验（错误文案翻译简中）
│  └─ engine-adapter/       # 引擎适配层（对上层隔离引擎来源）
│     ├─ vendor/ps-engine.js# 供应商化引擎（gitignore，scripts/build-engine.mjs 重建）
│     ├─ session.ts         # BattleSession（单人操控双方/事件流/快照/错误恢复）
│     ├─ parse.ts           # 协议行解析（BattleEvent）
│     └─ index.ts           # 重导出表面（未来可换 @pkmn/sim 而上层不感知）
├─ scripts/                 # build-engine / fetch-sprites / verify-data 等
├─ src-tauri/               # Tauri 2 壳（Windows NSIS + Android）
└─ tests/                   # vitest：data(7) / engine(9) / showdown(16)
```

分层约束（00 §6.5）：UI → 数据层（data/）→ 引擎适配层（engine-adapter/）→ 引擎；层间只走显式接口。

### 2.1 引擎供应商化（M0 关键决策）

`@pkmn/sim` 发布版不含 Champions mod，采用**供应商化打包**：`scripts/build-engine.mjs` 用 esbuild 把上游 `sim/` + 全部所需 `data/`（含 champions/championsregmb mods 与 zh-cn 文本）打为单文件 `ps-engine.js`（约 11MB）：

- `define: { require: "__psRequire" }` 是关键——esbuild 默认把动态 require 编译为 `__glob` 映射，必须 define 替换才能落入 require 垫片；
- fs 垫片 `readdirSync` 返回上游 data/mods 全部目录名（formats 校验需要 mod 名存在）；
- require 垫片路径规则：`../data/…` 按 `/ps/sim` 拼接；`./xxx`/裸名按 `__psLastDir__`；`.json` 取 default；
- path 垫片 resolve 对绝对路径不得再前置 sim 前缀（双重前缀坑）；
- lib/index.ts 以 onResolve 插件替换为垫片（只导出 Streams/Utils/Dashycode，剥离 net/process-manager 服务端模块）。

### 2.2 会话与指令协议（M2/M4 实战结论）

`BattleSession` 同时持有 p1/p2 输入流（BattleStream 直读），核心语义：

- **指令格式**（sim/side.ts）：`move <序号> [+目标] [mega|zmove|dynamax|terastallize]`，`switch <n>`、`team <n,…>` 均为 **1 基编号**；双打每回合每只在场宝可梦各一条指令（逗号连接）。
- **目标 loc**：正数=对手槽（+1 左 / +2 右），负数=己方槽（-1/-2）；是否需要目标由 `activePerHalf`（场地槽位）决定——**双打残局只剩 1 只也必须带目标**。
- **濒死槽自动 pass**：引擎 getChoiceIndex 对濒死槽自动 choosePass，UI 按「存活在场数」渲染槽位并只发等量指令（多发报 `You sent more choices than unfainted Pokémon`）。
- **pending/请求由引擎侧驱动**：`choose()` 不做乐观清除——引擎对无效指令只回 `|error|` 侧更新**不重发请求**，乐观清除会脱节死锁；会话解析 sideupdate 帧归属 `|error|`，标回待指令并克隆请求对象触发 UI 复位（alert 提示重新下达）。
- **性能**：输出按 chunk 批量 emit（逐行 emit 会让一回合产生上百次 React 全量重渲染）。
- **确定性**：同 seed + 同指令序列 ⇒ 同输出；`|t:|` 时间戳行比对时过滤（deterministicLog）。
- `>forcelose p1/p2` 为驱动器兜底指令（替补不足等边界流的终局化）。

### 2.3 champions mod 规则实证（TeamValidator）

无道具（普通道具 isNonstandard=Past，仅超进化石/Ｚ纯晶）、IV 必须 31、**每项努力值 ≤32**（champions 努力值体系）、名册有限（部分朱紫宝可梦不在 champions 名册）。VGC 赛制 bestOfDefault=Bo3（单局会话验证用 BSS）。

## 3. 环境

| 依赖 | 版本 | 说明 |
| --- | --- | --- |
| Node | ≥22（实测 24） | package.json engines 锁定 |
| pnpm | ≥9（实测 12） | `pnpm install`；esbuild 构建许可已写 `pnpm.onlyBuiltDependencies` |
| Rust | stable（rust-toolchain.toml 锁定） | Tauri 壳编译 |
| JDK 17 | — | Android 构建（JAVA_HOME） |
| Android SDK | platform 34 + build-tools 34.0.0 + NDK 27 | ANDROID_HOME / NDK_HOME |

```bash
cd battle
pnpm install
node scripts/build-engine.mjs      # 重建供应商化引擎（需 data/raw/pokemon-showdown）
node scripts/fetch-sprites.mjs     # 选择性下载精灵图（zip 中央目录 Range 解析，约 454MB → public/sprites，gitignore）
pnpm test                          # vitest（32 用例）
pnpm build                         # tsc + vite 产物
pnpm tauri build                   # Windows NSIS exe
pnpm tauri android build --apk     # Android APK
```

开发：`pnpm dev`（http://localhost:1420）。

## 4. 数据

- **赛制目录** `src/data/formats.ts`：8 项（id 以上游 formats 实际导出为准，存在命名漂移，验收以显示名为准）；`verifyFormats()` 构建期 fail-fast。
- **中文文本**：引擎 `loadTextData("zh-cn")`（上游 text/zh-cn 数据打包进 vendor），物种/招式/道具/特性官方简中名。
- **可学招式**：`dex.species.getMovePool(id)`（上游 dex-species API；本赛制世代内并集，含家族形态；~~`dex.learnsets`~~ 表不存在——d.ts 曾误声明导致运行时崩溃，已修正）。
- **随机队伍**（team:null）：需打包 `data/random-battles/{gen9*,champions}` 的 teams.ts + *.json。

## 5. 使用

页面流：**主页（选赛制）→ 队伍编辑（A/B 槽页签 + 导入/复制）→ 上阵预览（选出战成员）→ 对战 → 记录/设置**。

对战页操作：

1. 上方**阵营切换**（阵营 A 蓝 / 阵营 B 红，横幅提示当前下令方）；「⏳待指令」标记等待输入的一侧。
2. **上阵顺序**：按出招顺序点击排列（VGC 6 选 4 / BSS 6 选 3，须选满才能确认）。
3. **招式回合**：每只在场宝可梦一个槽位——选招式（可再点机制按钮：太晶/极巨/Mega/Z）、双打需目标的招式出现目标行（对手左/右、己方左/右）、可「改为换人」；全部槽位选定后「下达指令」。
4. **被迫换人**：濒死后为每个空位选替补（替补不足可 pass）。
5. 指令被引擎拒绝时顶部黄条提示原因并自动复位，重新下达即可。
6. 终局显示结果并自动入「对局记录」；记录页可回看完整日志。

## 6. 过程记录（里程碑摘要）

| 里程碑 | 状态 | 结论 |
| --- | --- | --- |
| M0 环境与脚手架 | ✅ | 引擎供应商化打通（champions mod 全通）；Windows NSIS exe 构建成功；Android 工程已生成 |
| M1 数据层 | ✅ | formats 8 赛制校验通过；数据访问层 + zh-cn 映射；7 用例 |
| M2 引擎集成 | ✅ | BattleSession/协议解析；脚本驱动 gen9vgc2025regi 双打、bssregi 单打、champions 完整一局；同种子确定性逐行一致；官方 replay 对拍待补（M6） |
| M3 队伍层 | ✅ | 导入（Dex 存在性过滤）/导出/校验（13 条中文规则）/往返无损 12 组；16 用例 |
| M4 信息流对战 | ✅ | 浏览器实测完整打完双打（gen9vgc2025regi 6 回合）+ 单打（gen9bssregi 13 回合）各一局，零 JS 错误，记录入库与日志回看通过 |
| M5 动画渲染 | 🔄 | 静态精灵 + 血条已实现；动画队列/演出时序细化中 |
| M6-M8 | ⬜ | 测试审查 / 发布 / 合并待执行 |

M4 实测发现并修复的产品缺陷（均有回归测试护栏的候选）：

1. `dex.learnsets` 不存在（d.ts 虚假声明）→ `learnableMoves` 改用 `species.getMovePool`；
2. 队伍编辑渲染异常整树卸载白屏 → 增加 App 级 ErrorBoundary；
3. `team` 指令 0 基/1 基 off-by-one（上阵顺序确认无效）；
4. `choose()` 乐观清除 pending → 无效指令后 UI/引擎脱节死锁 → 改引擎侧驱动 + `|error|` 归属恢复；
5. 双打指令面板缺多槽合成（旧版只能发一条指令）；
6. 濒死槽对齐（多发指令被拒）；
7. 残局目标判定（按场地槽位而非存活数）；
8. 逐行 emit 性能（回合结算 30-60s → 批量后秒级）；
9. 日志渲染 clean() 正则吞掉错误文本。
