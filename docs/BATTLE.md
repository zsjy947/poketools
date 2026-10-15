# BATTLE —— 模拟对战功能说明

> 模拟对战功能的**单文档**（架构 / 环境 / 数据 / 使用 / 过程记录）。原 battle/ 独立子应用已在 v1.0.0 终态统一时整体 `git mv` 并入 `web/`，本文路径已按终态更新；历史过程记录（§里程碑等）保留当时路径。
> 历史规划（原 plans/00-项目规划文档.md，2026-10-02 归档删除）未完成项见 `plans/ROADMAP.md`（本地维护，不入 git）；
> 本文只沉淀**已实现**结论，随里程碑更新。

## 文档信息

| 项目 | 内容 |
| --- | --- |
| 文档编号 | docs/BATTLE |
| 适用版本 | battle 0.1.0（M0-M8，tag `battle-v1.0.0`） |
| 上游仓库 | github.com/pokemon-showdown/pokemon-showdown（`data/raw/pokemon-showdown`，锁定 commit 见 `web/scripts/config.json`） |
| 引擎许可 | 上游 MIT（sim/ + data/）；供应商化打包产物 `src/engine-adapter/vendor/ps-engine.js` 为 gitignore 可重建物 |

## 合规立场（权威，原 plans/00 §2.3）

- 本应用及其产物**仅供本人本地学习研究使用，不公开分发、不商用**。
- Showdown 素材（精灵图/图标/叫声）为**个人本地使用的素材副本**，属 Nintendo/Creatures/GAME FREAK/The Pokémon Company 版权资产；来源与下载记录见 `web/NOTICE` 与素材 manifest。
- 若未来出现任何公开分发计划，必须**先整体移除素材与游戏数据并重新评审**。
- 协议边界：运行时仅引入上游 MIT 部分（引擎/数据），严禁 AGPL 文件进入（M5 隔离审查通过，见 §6 M5）。

## 1. 功能概览

**宝可梦模拟对战（Pokémon Solo Battle）**：完全本地、离线可用、单人操控双方的 Switch 世代对战练功工具。

- **赛制选择**（FR-01）：8 个内置赛制（6 P0 + 2 P1），覆盖 朱紫 VGC/BSS、宝可梦冠军（Pokémon Champions）VGC/BSS、OU、自定义。
- **队伍构建**（FR-02~05）：A/B 双阵营槽位、逐项编辑器（等级/IV/EV/性格/特性/道具/招式/太晶）、Showdown 文本导入导出、按赛制实时合法性校验（中文错误提示）。
  **选择器全部可搜索**（FilterSelect，名称包含即命中）；宝可梦列表 = 赛制名册 − 对战临时形态 − 等值重复形态
  （`battle/data/roster.ts` 单源：引擎 `battleOnly` 字段动态收集 + 等值合并组 + 手工兜底），展示名统一
  「种名-形态短名」（如 幽尾玄鱼-雌性 / 洛托姆-加热 / 风速狗-洗翠）；招式选项两列布局（属性/分类/威力定宽右对齐
  `tabular-nums` 竖直成列）；等级默认 = 赛制等级（L50 系 50 / 自由对战 100），键入立即生效（1~100 clamp）。
- **上阵预览**（FR-06）：**有序**上阵（点击顺序=顺位，可上移/下移调整）按赛制 6 选 4 / 6 选 3 / 整队；OTS 双方阵容互见。顺位语义：单打第 1 只/双打前 2 只=首发；**顺位末位存活者=索罗亚克「幻觉」伪装目标**（引擎实测：上阵序 [索罗亚克, 钢铠鸦, 烈咬陆鲨] 时索罗亚克以钢铠鸦外观登场）。
  卡片信息区固定列网格（名字/属性/道具/招式列纵向对齐、招式超长截断带 title），恒定顺位操作槽——选中态不改变卡高。
- **信息流对战**（FR-07/09）：单人操控双方、**双侧指令面板同屏常驻且占全列高**（可同时为双方出招，引擎按侧
  收指令；1280×720/1440×900 双视图零滚动，内容超高时面板内滚动不越框）；**三栏舞台** = 左指令面板｜中列
  （场地在上 + 居中收窄日志在下）｜右指令面板。场地：B 右上 / A 左下，名字+血条在精灵头顶且与精灵等宽
  （**白轨绿条：扣血露白**）、异常状态图案徽章（🔥⚡☠️☣️💤❄️）、太晶·超巨标记、替补精灵球；**手绘风格场地背景**
  （天空→草地分层渐变 + 双站位椭圆平台，随天气换色调：晴暖/雨蓝/沙黄/雪白）；**场地状态栏**（天气/地形/空间 +
  双方侧壁 chips，由事件流推导，`battle/field.ts` 纯函数）；开始对战**直通第 1 回合**（预览顺位自动代发 team
  指令，跳过对战页内二次点选）。
- **机制图标**：太晶化/极巨化走 `/assets/mechanism` 图标按钮（太晶图标按精灵太晶属性取图、含星晶），点亮=启用
  （出招附加对应指令）；超级进化/Z 为文字按钮（引擎 request 的 can* 字段驱动显示）。对战招式卡走 data 层
  `moveView`（分类物理/特殊/变化正确显示）。
- **动画演出**（FR-08）：事件→演出映射（10 种演出 + CSS 关键帧 + 速度倍率）；动画开关关闭时自动降级信息流
  （开关单源 `settings.animation`，与设置页同步）。
- **对局记录**（FR-10）：终局自动入库（localStorage 持久化，双端一致），含胜者/回合数/完整确定性日志，可回看；
  日志区不渲染传输帧（update/sideupdate/request JSON），只留可读事件行。
- **替补不足免卡死**：被迫换人时空位数 > 存活替补数时，可交互槽 = 替补数（每槽必选），多余空位自动 pass
  （引擎 `forcedPassesLeft` 语义），不再阻塞确认。

## 2. 架构

```
web/
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
└─ tests/                   # vitest：data(7) / engine(9) / showdown(16)
```

分层约束（原 plans/00 §6.5）：UI → 数据层（data/）→ 引擎适配层（engine-adapter/）→ 引擎；层间只走显式接口。

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
| pnpm | ≥9（实测 12） | `pnpm install`；esbuild 构建许可已写 `pnpm-workspace.yaml` allowBuilds（pnpm ≥10 不读 package.json 的 pnpm 字段） |

```bash
cd web
pnpm install
node scripts/build-engine.mjs      # 重建供应商化引擎（需 data/raw/pokemon-showdown）
node scripts/fetch-sprites.mjs     # 选择性下载精灵图（zip 中央目录 Range 解析，约 454MB → public/sprites，gitignore）
pnpm test                          # vitest（32 用例）
pnpm build                         # tsc + vite 产物
```

开发：`pnpm dev`（http://localhost:1420）。

**桌面/安卓打包（已迁移）**：Tauri 2 壳（`src-tauri/`，Windows NSIS exe + Android APK 共用的完整构建链——
custom-protocol feature、NDK 交叉编译、gradle 手动链与签名流程）已于 2026-10-02 自 main 移除，
迁移至 `archived/android` 分支维护（文档成文时记作 dev/android，实为该存档分支）；main 聚焦应用本体与统一化嵌入（vite 产物由主应用静态托管）。

### 3.1 安装指南与演练记录

> 历史产物安装记录（battle v0.1.0 发布版；构建链已迁 `archived/android` 存档分支）。

- **Windows**：双击 `release/宝可梦模拟对战_0.1.0_x64-setup.exe`（NSIS 安装器）安装；卸载走系统「应用」或 Uninstall 入口；升级直接覆盖安装（同版本覆盖装即升级路径验证）。
- **Android（arm64）**：`adb install -r release/宝可梦模拟对战_0.1.0_arm64.apk`；卸载 `adb uninstall <包名>` 或桌面长按卸载；升级沿用 `adb install -r`（同 keystore 签名才可覆盖）。
- **演练记录（2026-10-02）**：本机无真机（adb devices 空）；已尝试模拟器路径——sdkmanager 下载 Android 30 x86_64 system image + emulator 并创建 AVD 成功，但**无硬件加速**（AEHD/WHPX hypervisor 均未安装，x86_64 镜像硬性要求加速）无法启动，启用需管理员权限改系统配置+重启，不属本会话可执行范围。安装/卸载/升级三步演练**环境受限未执行**——签名验证（apksigner verify v2+v3）与包结构完整性已核；真机演练待有设备环境时补做（Android 10 + 最新版各一台，原 plans/00 §6.3 M7 质量门禁；已列 plans/ROADMAP.md RM-15）。

## 4. 数据

- **赛制目录** `src/data/formats.ts`：8 项（id 以上游 formats 实际导出为准，存在命名漂移，验收以显示名为准）；`verifyFormats()` 构建期 fail-fast。
- **中文文本**：引擎 `loadTextData("zh-cn")`（上游 text/zh-cn 数据打包进 vendor），物种/招式/道具/特性官方简中名。
- **可学招式**：`dex.species.getMovePool(id)`（上游 dex-species API；本赛制世代内并集，含家族形态；~~`dex.learnsets`~~ 表不存在——d.ts 曾误声明导致运行时崩溃，已修正）。
- **随机队伍**（team:null）：需打包 `data/random-battles/{gen9*,champions}` 的 teams.ts + *.json。

## 5. 使用

页面流：**主页（选赛制）→ 队伍编辑（A/B 槽页签 + 导入/复制）→ 上阵预览（选出战成员）→ 对战 → 记录/设置**。

队伍编辑页：

1. 宝可梦/特性/道具/招式均为**搜索式选择器**（输入关键字过滤）；宝可梦列表已按赛制名册过滤
   （临时形态/等值形态不出现在列表；存量老队伍中的被过滤物种保留数据、仅禁止重选并给出中文提示）。
2. 等级默认 = 赛制等级；等级框键入立即生效（1~100 clamp，清空回赛制默认）。
3. 昵称已移除（对模拟对战无意义），显示名恒为中文种名；导入自动丢弃昵称、导出不再产出昵称行。

对战页操作（一屏布局：左 = 阵营 A 招式卡，中 = 场地，右 = 阵营 B 招式卡，底部 = 日志）：

1. 上阵预览页选满出顺位后点「开始对战」**直达第 1 回合**（预览顺位自动作为引擎 team 指令，OTS 照常）。
2. **双侧同屏下令**：左右各一列指令面板（卡头 ⏳待指令标识），可先为阵营 A 选招再为阵营 B 选招；
   每侧「下达指令」独立提交（引擎按侧收指令，两个独立输入通道）。
3. **招式回合**：每只在场宝可梦一个槽位——选招式（可点亮机制图标：太晶/极巨为图标、超级进化/Z 为文字）、
   双打需目标的招式出现目标行（对手左/右、己方左/右）、可「改为换人」；全部槽位选定后「下达指令」。
4. **被迫换人**：濒死后为每个空位选替补；替补不足时空位数 > 替补数的部分自动跳过（pass），不阻塞确认。
5. 指令被引擎拒绝时该侧面板顶部黄条提示原因并自动复位，重新下达即可。
6. 终局显示结果并自动入「对局记录」；记录页可回看完整日志。

## 6. 过程记录（里程碑摘要）

| 里程碑 | 状态 | 结论 |
| --- | --- | --- |
| M0 环境与脚手架 | ✅ | 引擎供应商化打通（champions mod 全通）；Windows NSIS exe 构建成功；**Android APK 构建成功**（app-arm64-release 439MB，需手动流程规避 Windows 符号链接权限，见 §3） |
| M1 数据层 | ✅ | formats 8 赛制校验通过；数据访问层 + zh-cn 映射；7 用例 |
| M2 引擎集成 | ✅ | BattleSession/协议解析；脚本驱动 gen9vgc2025regi 双打、bssregi 单打、champions 完整一局；同种子确定性逐行一致；**官方 replay 结构对拍 9 条全绿**（官方日志无 seed，对拍口径=图鉴/学习表/属性克制/道具特性四维核验，见 §6） |
| M3 队伍层 | ✅ | 导入（Dex 存在性过滤）/导出/校验（14 条中文规则）/往返无损 12 组；16 用例 |
| M4 信息流对战 | ✅ | 浏览器实测完整打完双打（gen9vgc2025regi 6 回合）+ 单打（gen9bssregi 13 回合）各一局，零 JS 错误，记录入库与日志回看通过 |
| M5 动画渲染 | ✅ | anim.ts 事件→演出映射（10 种演出 + CSS 关键帧 + useBattleAnim）+ 速度倍率；动画关闭自动降级信息流；精灵三级回退（静态→动画→官方绘图→占位）+ 引擎 spriteid 命名；抽样 30 招式演出测试；AGPL 隔离审查通过（运行时全 MIT：自研 + 上游引擎 MIT + ts-chacha20 MIT，@pkmn/* 已移除） |
| M6 测试与审查 | ✅ | 56 用例全绿（data 7/engine 9/showdown 16/replay 10/anim 4/core 10）；覆盖率口径（引擎适配/数据/队伍/演出/精灵）86.9% 语句 ≥85% 门禁；对拍 9 条官方 replay ×4 维 = 36 项 ≥30；审查报告见 §6 |
| M7 构建发布 | ✅ | 双端产物：Windows NSIS `宝可梦模拟对战_0.1.0_x64-setup.exe`（415.25 MiB）+ Android arm64 签名 APK `宝可梦模拟对战_0.1.0_arm64.apk`（~440 MB，v2+v3 签名验证通过）；keystore 双备份（`battle/.keystore/` + 用户目录，口令不入 git）；SHA256SUMS 齐备。安装演练见 §3.1 |
| M8 文档收尾 + 合并 | ✅ | 本文档定稿；tag `battle-v1.0.0`；battle 分支合并回 main（main 无先行分叉，直接合并） |

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

M5/M6 期间发现并修复：

10. parse.ts `move` 事件 `to` 索引错位（p[3]→p[2]，目标受击演出/克制核验曾静默失效）；
11. 精灵文件名 = 引擎 `spriteid`（garchomp-mega/hooh/muk-alola），非显示名或 toID；
12. dex 官方绘图扩展名为 png（曾误按 gif 解析）；
13. 校验器「can't learn X」未翻译（补中文规则）；
14. 记录持久化配额自愈（日志体积可超 localStorage 5MB → 逐条丢弃最旧重试）；
15. fetch-sprites 根级文件过滤正则缺段（zip 根目录实为图标工作表，静态战斗图源头不存在——回退链兜底）。

### 6.1 M6 审查报告（P0/P1 清零记录）

- **P0（正确性）**：§6 所列 15 项全部修复并有测试护栏；无遗留。
- **P1（分层/结构）**：① BattleView.tsx 约 850 行，指令面板组件（MoveOrders/ForceSwitchChoice/TeamPreviewChoice）可拆独立文件；② describeChoice 与 ForceSwitchChoice 的替补互斥逻辑近似重复。均为可维护性问题，不影响行为，登记为后续重构项。
- **P2（规范）**：① 前端单 chunk 8.6MB（引擎内嵌所致，本地应用可接受；manualChunks 可优化首屏）；② anim.ts 的 useBattleAnim 依赖 DOM 无法纯单测（浏览器实测覆盖，纯函数 eventsToSteps 已单测）；③ APK ~440MB（dex/ani-shiny 全量内嵌）——**M7 决策：v1.0.0 保留全量资产**（剔除 ani-shiny 将损失异色动画显示、剔除 dex 破坏三级回退链），资产分级（按端剔除目录/按需下载）留待统一壳（路线 B）阶段一并处理。
- **明确不做**：① 官方 replay 逐行重放（公开日志无 seed，结构核验已覆盖数据一致性）；② 引擎 Web Worker 线程化（批量 emit 后回合结算已秒级）；③ 静态战斗精灵下载（上游 zip 已不提供，动画图全覆盖 + 回退链）。


## 7. 终态统一化结论（2026-10-03）

- 对战分区并入统一壳（web/，React）：#/battle 首入后 keep-alive 常驻，队伍/会话状态跨分区保留；
  赛制目录重建为「宝可梦冠军｜朱紫｜自由对战」三大类（单打/双打小类）。
- **BSD 命名核对**（开发期一次性联网，用户授权例外）：上游 Showdown Champions 分区无 BSD 前缀
  双打 id（仅 BSS 单打 + VGC 双打）——双打一律映射 VGC id（formats.ts 头部注释记录）。
- 冠军双打 4+4 开局修复：开赛校验改「有序上阵子集 + 忽略 champions Flat Rules 的 Min Team Size=6
  （注册语义）」；队伍编辑页保留整队注册口径并在横幅注明两者区别。
- 全中文化（B6）：zh-patch.ts 静态补丁 + Mega/Gmax 形态与进化石**派生补丁**（引擎 zh-cn 的英文占位
  值视为缺失）+ zhLine 整行最长匹配兜底；常用对战道具中文说明表（其余 desc 回退英文，
  数据缺口按需增补 ZH_ITEM_DESC）。单人双控在成功下达后自动切到另一待办侧。


## 8. v1.0.0 后修复与重构记录

- **parse.ts 虚线协议事件（2026-10-04 审查轮修复，`5d658a3`）**：引擎实际以 `.add("-damage"/"-heal"/
  "-weather"/"-mega"/"-zpower"/"-zmove"/"-max")` 发出次要事件（`|faint|` 为无虚线特例），此前 7 类全部落
  raw——mega/max/zmove 徽标永不显示、专属动画不触发、HP 靠回合快照跳变；测试 fixture 曾喂不存在的无虚线
  形态（自证错位）。修复：补 7 类虚线 case + fixture 改真实形态 + replay 语料回归断言不落 raw。
- **依赖环破除与 CalcPage 拆分（2026-10-08，`ef1c201`/`06b1d24`）**：`NamedText` 下沉叶子模块
  `web/src/data/names.ts`，`data/index ↔ zh-patch` 类型级环清零（index 保留 re-export，调用方零改动）；
  `CalcPage.tsx` 1786 行拆为页面装配 468 行 + `web/src/pages/calc/` 七模块（纯位移，行为零变更，
  calib 123 全绿护航）。
- **模拟对战修复批（2026-10-15，BATTLE-FIX-PLAN 全量落地）**：
  - **选择数据基建**：新增 `web/src/battle/data/roster.ts`（名册 = 引擎 `isNonstandard`，自由对战放开；
    临时形态 = 引擎 `battleOnly` 字段动态收集 + 永恒之花手工兜底；等值合并组白名单 + 形态短后缀表 +
    地区后缀派生）。`SpeciesView` 暴露 `battleOnly`；zh-gen 手工补厄诡椪基础与持久面具形态中文名
    （引擎 zh-cn 为英文占位）。
  - **招式分类修复**：引擎 `category` 是首字母大写（Physical/Special/Status），UI 小写比较永不命中
    → 全部显示「变化」。修复收敛在 data 层 `moveView`（归一小写），队伍下拉/预览卡/对战招式卡三处同源。
  - **校验消息中文化收尾**：事件配信类模板参数化（event #N 循环变量）、IV 未满 31 消息补主语捕获
    （原正则丢弃 `X's` 前缀）、`can't have` 特性与 gen9 0-EV 模板补齐；zhCapture 生成表优先于引擎占位名。
    另修复一条从未命中的 0 Stat Points 模板（缺括号转义的死代码）。
  - **等级输入**：默认 = 赛制等级；导入无等级标注归一。受控输入存在「事件后渲染快照重建 input 吞掉键入」
    的竞态（实机复现：fill 后 store 正确、DOM 回跳默认值），改非受控 + `defaultValue` + 槽位 key 重建，
    `normalizeLevelInput` 纯函数（1~100 clamp、空串回默认）单测覆盖。
  - **昵称移除**：编辑页输入栏删除；store 装载/写入、导入、导出全链路不再保留昵称（引擎显示名恒为种名）。
  - **上阵直通**：`BattleSession` 接受 `previewOrder`，teamPreview 请求到达时自动代发 team 指令
    （引擎侧语义保留），UI 跳过对战页内二次点选；指令被拒的 |error| 恢复兜底不变。
  - **一屏重布局**：删除阵营切换横幅/按钮，双侧指令面板同屏常驻（每侧独立「下达指令」）；血条移精灵头顶
    等宽；太晶/极巨机制图标（/assets/mechanism，点亮交互对齐计算器）；动画开关单源 `settings.animation`
    （本地副本曾与设置页脱钩导致多次切换后语义反转）。1280×720 页面级零滚动（日志唯一内部滚动）。
  - **替补不足卡死修复**：双打残局空位 > 存活替补时 UI 曾要求全部空位选中（永不满足 → 确认禁用卡死）。
    修复：可交互槽 = min(空位, 替补)，其余自动 pass（引擎 `forcedPassesLeft` = 空位 − 可换替补，实测接受）。
    会话级剧本测试（脱壳忍者点杀序列：先 3 回合各倒 1 补位、第 4 回合双倒剩 1 替补）断言混合
    switch/pass 被接受且终局正常。
  - **日志传输帧过滤**：update/sideupdate/p1/p2/|request| JSON 不再进日志区（isTransportFrame）；
    engine.test 驱动器的无效指令归属改用 `session.lastError.side`（帧行不再出现在 logTail），
    双打目标判定改按场地槽位数（active 数——残局单在场仍需目标）。
  - **测试**：battle-list-zh 扩为名册/临时/等值/后缀/分类 golden；battle-validate-zh 补事件配信与等级归一；
    engine 补直通与替补不足会话用例（137 用例全绿）。
- **模拟对战走查反馈批（2026-10-15 第二批，5 项）**：
  - **永恒之花恢复可选**：floetteeternal 在 champions 是可选特殊形态（其超进化 floettemega 才是
    battleOnly），首批手工兜底误伤已移除；展示名「花叶蒂-永恒之花」（花蓓蓓一族引擎中文名为英文占位，
    zh-gen 补名）。gen9（朱紫）仍由名册过滤（Past）。
  - **三栏全高布局**：左右指令面板占全列高（面板间距压缩后 1280×720 双打双槽零滚动），日志移入中列
    场地之下居中收窄；`.side-panel` 加 overflow-y:auto（内容超高面板内滚动，修复第二只宝可梦招式卡
    超出渲染框）。
  - **场地视觉**：分层渐变背景 + 站位平台（CSS 伪元素），随天气换色（--sky/--grass 变量）；
    场地状态栏 chips（天气/地形/空间/双方侧壁）——新增 `battle/field.ts` 推导纯函数
    （weather/fieldstart 走解析事件，fieldend/sidestart/sideend 按原始行前缀匹配；fieldend 载荷在段 2）；
    异常状态 emoji 徽章（STATUS_ICON）。
  - **血条白轨绿条**：恒绿存量 + 白轨露扣血；选择器作用域 `.mon-stage`（组件库 calc.css 有同名全局
    .hp-bar/.hp-fill，靠加载顺序会被覆盖，实测两轮特异度修正）。
  - **濒死槽位错位修复（走查反馈）**：MoveOrders 曾按「存活数 slice 前 N 槽」裁剪——左侧（槽 0）阵亡时
    前槽恰是濒死者的招式数据，面板出现「名字=右侧存活者、招式=左侧阵亡者」错位。改为 `liveMoveSlots(req)`
    按「该槽位宝可梦是否存活」过滤（req.active[i] 与场上第 i 只对齐）；槽标签改「左侧/右侧」，
    adjacentAlly 系目标缺省与太晶图标改按场地槽位取值。实机复现验证（脱壳忍者×5+吉利蛋 vs 耿鬼集火左槽）：
    无替补左槽阵亡后单槽面板名字与招式同为存活者，单槽指令正常结算。
  - 测试：battle-field 4 用例（天气起止/地形与空间/侧壁归属/中文映射）+ 永恒之花断言 + 槽位映射 3 用例，
    144 全绿。
