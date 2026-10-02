# 更新日志（CHANGELOG）

版本号 SemVer；发布门禁与产物规范见 plans/00-项目规划文档.md §6.8/§7。

## [0.1.0] —— 2026-10-02

首个可用版本（里程碑 M0-M8，tag `battle-v1.0.0`）。功能说明与过程记录见 `docs/BATTLE.md`。

### 新增

- **引擎**：Pokemon Showdown 上游 sim/ 供应商化单文件打包（`scripts/build-engine.mjs`，
  含 champions mod 与 zh-cn 文本，约 11MB）；BattleSession 单人操控双方会话（p1/p2 双流、
  批量 emit、确定性日志、`|error|` 归属恢复）与协议解析层。
- **数据层**：8 内置赛制目录（朱紫 VGC/BSS、Champions VGC/BSS、OU、自定义等）+ 构建期校验；
  数据访问层统一出口（物种/招式/特性/道具简中名、getMovePool 学习表）。
- **队伍构建**：A/B 双阵营逐项编辑器（等级/IV/EV/性格/特性/道具/招式/太晶）、Showdown 文本
  导入/导出、按赛制实时合法性校验（14 条中文规则）。
- **对战**：上阵预览（6 选 4 / 6 选 3 / OTS）、信息流对战界面（多槽指令合成/目标选择/机制按钮/
  阵营切换锁定）、动画演出（10 种事件演出 + CSS 关键帧 + 速度倍率，关闭自动降级信息流）、
  精灵三级回退（静态→动画→官方绘图→占位）、对局记录持久化（配额自愈）与日志回看。
- **双端发布**：Windows NSIS 安装包 + Android arm64 签名 APK（Windows 手动构建链见
  docs/BATTLE.md §3）；keystore 双备份；SHA256SUMS。

### 变更

- 文档体系收敛：battle/docs 取消（01 设计/02 审查职能并入项目 docs/BATTLE.md 单文档，
  随开发更新、随分支合入 main）；00 规划文档迁至仓库 plans/00-项目规划文档.md（plans/ 不入 git）；
  站内引用路径同步更新。

### 已知限制

- 对拍口径：官方 replay 无 seed，采用图鉴/学习表/属性克制/道具特性四维结构核验（9 条 × 4 维）；
  逐行重放明确不做。
- 移动端未做资产分级（dex/ani-shiny 全量内嵌，APK ~439MB），资产分级留待统一壳阶段（见
  docs/BATTLE.md §6.1 P2）。

## [未发布]

### 新增

- battle 分支首批落地：Tauri 2 + React + TS 脚手架（M0 骨架，构建链打通与版本锁定待 M0 完成）、
  数据/素材管线脚本占位、NOTICE 协议声明。
