# PROGRESS —— 终态统一改造执行进展（断点续作手册）

> 本文档为**断点续作与回退手册**：记录 plans/MASTER-PLAN.md 阶段 0-7 的执行进度、
> 未提交的工作区状态、被打断时正在进行的操作及其回退方法。
> 执行权威与验收标准仍以 `plans/MASTER-PLAN.md` 为准；本文只回答「现在做到哪、
> 工作区里有什么没提交、出事怎么退」。
> 维护约定：每完成一个阶段 commit 后更新本文；合并回 main 后本文可删除。

## 1. 总览

| 阶段 | 状态 | commit（dev 分支） |
| --- | --- | --- |
| 0 前置修复与基线（U3/U8/U9/U4） | ✅ 已完成 | `35193b8` |
| 1 工作区统一（battle→web + 统一壳 + 资产改道） | ✅ 已完成 | `13c2b99` |
| 2 数据/状态层 TS 化 + calib vitest + golden | ✅ 已完成 | `3307568` |
| 3 poketools 八页 React 迁移（U1-U14） | ✅ 已完成 | `9dfb34f` |
| 4 模拟对战修复 B1-B10 | ✅ 已完成 | `76fd40f` |
| 5 Tauri 桌面壳 | 🔶 **进行中**（构建已成功，验收未做） | 未提交（见 §3） |
| 6 Python 运行时退役 + 门禁重建 | ⬜ 未开始 | — |
| 7 文档沉淀 + 合并回 main + 发布 | ⬜ 未开始 | — |
| 代码审查报告（不提交） | ⬜ 未开始 | 产物将落 `plans/CODE-REVIEW.md` |
| ROADMAP 后续计划实施方法探索 | ⬜ 未开始 | 结论将并入 `plans/ROADMAP.md` |

当前分支 `dev`（自 main@922dcba 迁出，全程未动 main）。

## 2. 最近一次被打断时的操作（重要）

**场景**：阶段 5 的 `npx tauri build` 刚在后台成功完成（2026-10-03，约 14 分钟编译），
随后按用户要求转写本 PROGRESS.md。构建产物已生成但**尚未做 exe 双击验收**，也**尚未 commit**。

构建产物（均为 gitignore 的本地文件，不随 git）：

- 安装包：`web/src-tauri/target/release/bundle/nsis/宝可梦工具助手_1.0.0_x64-setup.exe`（491.92 MiB）
- 便携 exe：`web/src-tauri/target/release/poketools-app.exe`
- 图标：`web/src-tauri/icons/`（由 `npx tauri icon ../app/static/dist/assets/appicon.png` 从 make_icon 基图生成）

**若需回退阶段 5**：`web/src-tauri/` 全目录未提交，`git clean -fd web/src-tauri` 即可整体撤销
（注意别带 `src-tauri/target` 之外的 `web/` 路径误删已提交文件；更稳妥是
`git clean -fd web/src-tauri && git checkout -- web/`）。阶段 0-4 的 commit 不受影响。

## 3. 当前工作区未提交内容（仅此一项）

| 路径 | 内容 | 处置 |
| --- | --- | --- |
| `web/src-tauri/`（未跟踪） | Cargo.toml/lock（crate 改名 poketools-app）、tauri.conf.json（ productName 宝可梦工具助手 / NSIS / 1280×820 窗口）、src/main.rs+lib.rs、capabilities/default.json、全套图标、.cargo/config.toml（Android linker，RM-18 恢复安卓时用） | 阶段 5 验收通过后随阶段 5 一起 commit（target/ 与 gen/ 已被 .gitignore 忽略，不会入库） |

已处理过的一次事故（无需再处理，留档备查）：恢复归档时
`git checkout archived/battle -- battle/src-tauri/` 会把 `battle/src-tauri/*` **暂存进 index**；
已用 `git rm -r --cached battle/ && rm -rf battle` 清除。若再次从 `archived/battle` 取文件，
取完务必同样清掉 index 与目录（battle/ 已不在 .gitignore，残留会污染提交）。

`battle/release/` 空目录仍被某进程句柄占用（历史遗留，非 git 跟踪内容，无碍；重启后可删）。

## 4. 阶段 5 剩余步骤（从这里继续）

1. exe 验收（MASTER-PLAN §8 5.3）：双击 `poketools-app.exe`（或装 NSIS 包）→
   断网全功能（本地模式自动接管）→ localStorage 持久（重开队伍/标记还在）→
   与 Vue 版抽核一致 → 首次进入计算器有占位（引擎 11.7MB 解析期）。
2. 版本号三处同步核对：`web/package.json`（现 0.1.0，应升 1.0.0）、
   `web/src-tauri/tauri.conf.json`（已 1.0.0）、CHANGELOG（web/CHANGELOG.md 需补 1.0.0 条目）。
3. commit 阶段 5（建议信息：`feat: Tauri 2 desktop shell for the unified app`，正文分条、
   不含计划编号）。

## 5. 阶段 6/7 要点备忘（执行时看 MASTER-PLAN §9/§10，此处仅断点提示）

- 阶段 6.1：`verify_static_equivalence.py`（524 门禁）**先终验一次全绿再退役**，失败先修再删。
- 阶段 6 退役清单：`app/`、`launcher.pyw`、`build_exe.bat`、`launcher/`、`build/`、
  `app/static/dist/`（切换日）、`tests/test_api*`、`tests/test_damage.py`、`tests/test_breeding.py`、
  `scripts/verify_static_equivalence.py`、`tools/calib/check.py`、`tools/static-check/calib-js.mjs`
  （calib 基准已迁 `web/tests/calib.test.ts`）。注意 Poketools.spec / Poketools.log 两个
  gitignore 内文件是否残留引用。
- 阶段 6.3：`tools/smoke.mjs` 改指 web 前端（可起 `pnpm preview` 或 `pnpm dev`）；
  `pyproject.toml` ruff 缩域到剩余 scripts/tests。
- 阶段 7：docs 三件套重写 + `git checkout main && git merge --no-ff dev` + tag + release。

## 6. 环境与进程状态（断点时）

- vite dev（端口 5199）已停止（后台任务被杀）。浏览器自动化还开着 1 个指向
  `http://127.0.0.1:8734/...`（旧 Vue 版页面）与 1 个 `5199` 的 IAB 标签，无碍可忽略。
- 数据管线产物：`web/public/data`（56.8MB，33 表，data_version=aa36a5e734c342fa）、
  `web/public/assets`（14MB）、`web/public/pkt`（官方绘图 1347 张）均最新且与 DB 一致
  （`python scripts/check_web_assets.py` 通过）。
- 上游核对结论（B8）：上游 Showdown **无 BSD 前缀双打赛制**（Champions 分区仅 BSS 单打 +
  VGC 双打），朱紫/冠军双打一律映射 VGC id（formats.ts 头部注释已记录）。此为开发期一次性
  联网核对（用户授权例外），运行时仍完全离线。

## 7. 各阶段门禁基线（当前应保持的状态）

| 门禁 | 命令 | 断点时状态 |
| --- | --- | --- |
| vitest（含 calib 51+41 与 golden） | `cd web && pnpm test` | 95 通过（11 文件） |
| TS strict | `cd web && npx tsc --noEmit` | 零错误 |
| lint/format | `cd web && pnpm lint` | 全绿 |
| 前端构建 | `cd web && pnpm build` | 成功（单 chunk >500KB 警告属已知 RM-13） |
| pytest | `python -m pytest tests/ -q` | 85 通过（阶段 6 将缩域） |
| ruff | `ruff check app/ scripts/ tests/ tools/calib/check.py` | 零告警（阶段 6 后路径缩减） |
| 资产清单 | `python scripts/check_web_assets.py` | 通过 |
| Tauri | `cd web && npx tauri build` | 成功（见 §2 产物） |

## 8. 回退总表（按损坏范围）

| 想回到的位置 | 操作 |
| --- | --- |
| 阶段 4 完成态（丢弃未提交的阶段 5） | `git clean -fd web/src-tauri`（target 一并删除，重编约 14 分钟） |
| 阶段 3 完成态 | `git reset --hard 9dfb34f` |
| 阶段 2 完成态 | `git reset --hard 3307568` |
| 阶段 1 完成态 | `git reset --hard 13c2b99` |
| 阶段 0 完成态 | `git reset --hard 35193b8` |
| 改造前（Vue 栈原始态） | `git checkout main`（dev 未合并前 main 始终未动） |

注意：`git reset --hard` 会丢工作区未提交内容；`web/src-tauri/target`、`web/public/*`、
`web/node_modules` 均为 gitignore 产物，reset 后按 AGENTS.md 管线命令重建即可。
