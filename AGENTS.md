# AGENTS.md —— 给后续 AI 编码助手 / 维护者的项目指南

## 项目概况

Switch 宝可梦五作（剑盾 / 晶灿钻石·明亮珍珠 / 传说 阿尔宙斯 / 朱紫 / 传说 Z-A）的本地图鉴工具助手。
构建期 Python 管线（SQLite + 52poke/PokeAPI 抓取）+ 唯一前端 `web/`（React 18 + TS strict +
Vite + zustand + vitest，含模拟对战）+ Tauri 2 桌面壳（NSIS 安装包/便携 exe）。
**运行时完全离线**：全部领域逻辑（伤害公式/数据访问/生蛋链）只在 `web/src/data` TS 单实现，
数据为静态分片，零 API 零网络。

## 常用命令

```bash
# 数据管线（构建期 Python，按顺序）
git clone --depth 1 https://github.com/PokeAPI/pokeapi data/raw/pokeapi   # 一次性
python scripts/build_db.py         # PokeAPI CSV -> data/poketools.db（可重复执行，重建）
python scripts/build_z_moves.py    # 52poke「Ｚ招式」页 -> curated/z_moves.json
python scripts/build_db.py         # 二次执行装入 Z 纯晶 items 与 z_exclusive
python scripts/scrape_52poke.py    # 52poke wiki -> data/curated/*.json + 合并入库
python scripts/export_static_data.py    # DB -> web/public/data 静态分片（33 表 + manifest + 一致性硬门禁）
python scripts/fetch_sprites.py    # 官方绘图(三级回退+Pillow缩放) -> web/public/pkt/
python scripts/fetch_calc_assets.py     # 全量道具图标 -> web/public/assets/items/ + 机制图标(极巨/太晶)
python scripts/fetch_feature_images.py  # 属性雪碧图/游戏商标/特化页配图 -> web/public/assets/
python scripts/fetch_sandwich_images.py # 三明治 151 张 16:9 食谱图
python scripts/make_icon.py        # 精灵球应用图标（Tauri 图标基图 + favicon）
python scripts/check_web_assets.py # web/public 资产清单核对（表行数 vs DB/绘图/精灵图/资产族）
python scripts/export_userstate.py # （可选）桌面老用户 userstate.db -> JSON 一次性迁移
# 52poke 访问统一走 scripts/wiki_client.py（缓存/批量 wikitext/imageinfo 直链/Referer 下载），勿再各写一份
# PokemonDB（52poke 缺口的英文补源）走 scripts/pokemondb_client.py（HTML 缓存 data/raw/pokemondb-cache/）

# 前端开发与打包（唯一前端 = web/，先 cd web && pnpm install）
cd web
pnpm dev                           # 开发服务器（本地引擎自动接管，无后端依赖）
pnpm test                          # vitest（含 calib 51+41 对拍 + damage/breeding/state golden）
pnpm build                         # tsc --noEmit + vite build -> web/dist
npx tauri build                    # 桌面打包 -> src-tauri/target/release/bundle/nsis/（NSIS + 便携 exe）
pnpm lint                          # eslint + prettier（零错误基线）

# 仓库级门禁（python 侧）
pytest tests/ -q                   # test_db（数据完整性）+ test_parsers（解析器）
ruff check scripts/ tests/         # 静态检查（零告警基线，配置 pyproject.toml）
node tools/smoke.mjs               # 冒烟：web 构建产物静态托管逐资源断言（先 pnpm build）
```

注意：Python 仅存**构建期**管线；前端在 `web/`（React，Tauri 2 壳），
运行时零 API、零网络请求（桌面壳 custom-protocol 内嵌全部资产）。

## 架构要点

- `data/poketools.db`：静态数据，构建期产物。每次由 `scripts/build_db.py` 重建，不要手工编辑；
  web 端读取的是 `web/public/data` 静态分片（`export_static_data.py` 导出 + 逐字段一致性硬门禁）。
- 用户状态：web 端存 localStorage（`pkt.caught_state.v1` / `pkt.custom_recipes.v1`，
  `web/src/state/user.ts`；**同游戏各图鉴自动双向同步**；custom_recipes 食材/调味料/树果为
  `[{name,count}]`，读取兼容旧字符串数组/顿号文本）。桌面老用户 `data/userstate.db` 经
  `scripts/export_userstate.py` → JSON → web 控制台 `importAll()` 一次性迁移。
- `data/curated/*.json`：52poke 抓取结果 + 人工补录，**随 git 提交**（是数据库的可复现来源）。
  `TODO.json` 记录解析失败/数据缺口（`ability_parse_failed` 特性 64 项、`form_flavor_unparsed_markers` 276 段）；
  `za_learnsets_pokemondb.json`/`tm_locations_za_pokemondb.json` 为 PokemonDB 兜底数据；
  `evo_branches.json`（地区形态分支进化链 29 族）、`form_game_availability.json`（形态×游戏可用性）、
  `dex_default_forms.json`（图鉴默认形态人工增补）、`z_moves.json`（Z 纯晶/专属 Z）为五期新 curated；
  风味力量为人工整理（`flavor_powers_manual.json`，wiki 表格 rowspan 布局不规则勿尝试程序化解析）。
- 版本组（vg）映射：sword-shield=20/21/22、**bdsp=23**（图鉴用 DP 神奥图鉴 151 编号 original-sinnoh；
  TM001-100 由 52poke 补全）、legends-arceus=24、scarlet-violet=25/26/27（**machines 只导 vg25**）、
  **legends-za=30/31（学习集 52poke 主源 + PokemonDB 兜底写入 vg30；machines 导 vg30+vg31=TM108-160 异次元 DLC；
  vg32 是 Pokémon Champions 的 train 数据，与 Z-A 无关，勿导入）**。
- 功能入口**按游戏组织**（`games.features`：dex/ev/sandwich/donut/curry），伤害计算器为全局独立入口；
  详情页两栏布局、内容按当前游戏与**所选形态**裁剪（`pokemonDetail(sid, {form})`：进化分支/获取方式随之过滤；
  LA 与 Z-A 无特性机制，特性栏整体不渲染）。
- 招式表 tab 逐游戏不同（`GAME_MOVE_CONFIG`）：**朱紫=升级/进化&回忆/学习器/蛋**（tutor=回忆机、
  level=0=进化招式同入该组；其他游戏 level=0 置顶升级组标「进化」）；Z-A 仅 升级/学习器。
- 语言：PokeAPI CSV 中 zh-Hans=12，en=9。`learnsets` 保留 level=0 进化语义。
- 生蛋链算法在 `web/src/data/lookup.ts`（breedChains）：多源 BFS，节点=能学会该招式的物种，边=共享蛋组。
- **设计总纲：`docs/ARCHITECTURE.md`**（技术栈/数据管线/Schema/API/伤害计算器/前端架构/设计决策记录/规范/Roadmap/变更历史）；
  数据缺口清单 `docs/DATA-GAPS.md`（三档：无源待补/curated 已知账/明确取舍）；操作手册 `docs/USER-MANUAL.md`；
  未完成/延后/否决项 `plans/ROADMAP.md`（本地维护，不入 git）。
  **文档命名规范：内容描述 + 全大写**。
- **文档分层（2026-10-02 归档修订）**：`docs/` = 说明文档（入库），只沉淀**已实现**的功能结论
  （架构/操作/设计决策；模拟对战功能说明 = `docs/BATTLE.md` 单文档；未实现/延后/否决项统一追踪于 `plans/ROADMAP.md`，本地不入 git）；
  `plans/` = 计划文档（**gitignore 不入 git**），仅维护 `plans/ROADMAP.md`（未完成/延后/否决项）与
  `plans/KEYSTORE.md`（签名 keystore 口令备忘，敏感信息不入 git）。
  历史计划已随项目收官删除（2026-10-02：00/UPDATE-PLAN/CALC-FIX-PLAN/REFACTOR-PLAN/OPTIMIZE-PLAN；
  2026-10-08：MASTER-PLAN/PROGRESS/FOLLOWUP-PLAN-2026-10-04/CODE-REVIEW/REF-* 三件——终态统一改造已随
  v1.0.0 完结，实现结论沉淀 docs/，未完成项在 plans/ROADMAP.md）。计划实现后按序把有效结论并入 docs/ 对应文档并随代码提交。
- 伤害计算器：`web/src/data/damage.ts`（唯一实现，对齐 @smogon/calc gen9 修正链）+
  `web/src/data/calc.ts`（机制 mega/Z/极巨/太晶互斥校验；batch 一次算双方×4 招）+
  `web/src/pages/CalcPage.tsx`（页面装配与状态；六组件与共享模型在 `web/src/pages/calc/`，
  2026-10-08 纯位移拆分；太晶/极巨顶部标记、每招 Z 纯晶标记单选自动装备、场地区按钮网格）。
  - 公式与 @smogon/calc 逐 roll 校准：`web/tests/calib.test.ts`（vitest 读 `tools/static-check/cases.json` +
    `tools/calib/smogon_baseline.json`，51 案例 + 41 行威力表，**改公式后必须重跑**）；
    基准再生成用 `tools/calib/harness.mjs`（node + @smogon/calc）。
  - 取整语义是关键：威力阶段 bpMods（帮助 6144/场地 5325·2048/气场 5448）→ Z/极巨换算以原始威力为输入 →
    基础伤害每步 floor → 扩散(3072)与天气(6144/2048) pokeRound 作用于基础伤害 → 会心 ×1.5 floor →
    随机最先 floor(base×(85+i)/100) → STAB 与 finalMod 是 4096 分数链（pokeRound 半舍去）；勿改顺序。
  - 屏幕双打 2732；雪天冰系**防御**（非特防）×1.5、沙暴岩石特防 ×1.5；防守方太晶替换原属性相性；
    星晶攻（4915/+2048）防（保原属性）两侧；KO 概率 n=1..4 精确枚举 + 钉子先扣 + 气势披带。
- 图鉴默认形态：`dex_default_forms` 表（自动派生 + curated 增补）驱动列表卡/努力值页/详情默认选中。

## 约定

- commit 规范：`类型: 摘要`（类型 = feat/fix/data/docs/test/chore），每个里程碑一次 commit。
- UI 文案一律简体中文；界面缺失数据一律标注「待补充」，禁止编造数据。
- 52poke 解析失败的条目必须落 `data/curated/TODO.json`，不要静默丢弃。
- 前端构建产物 `web/dist` 不入库（gitignore）；发布产物为 Tauri 安装包/便携 exe。
- `data/raw/`、`data/*.db`、`data/sprites/`、`node_modules/` 均已 gitignore，不要提交。
- 静态检查零告警：`ruff check`（含 E/F/I/B/UP/SIM/PERF/PIE/RUF/BLE，BLE 豁免 scripts/ 网络容错）。

## 已知坑

- PokeAPI 没有朱紫/阿尔宙斯/Z-A/BDSP 的捕捉地点（encounters 表仅剑盾）→ 由 52poke 抓取补充
  （**带形态标记的行**已保留：pos1 形如 `0037A`，`get_methods.form` 存标记字母，
  `pokemon.py FORM_MARKER_TO_SUFFIX` 映射后缀）。
- PokeAPI 图鉴描述的简体中文只到剑盾 → 朱紫等由 52poke 补充（`Swdex/Shdex` 首字母大写；BDSP 用 `bdspdex`，
  DP 原生种分 `bddex`/`spdex`）。特性页标题多为 `{名}（特性）`（部分名无重定向，两种标题都抓）。
- 52poke 是 MediaWiki：批量取 wikitext 用 `api.php?action=query&prop=revisions&rvprop=content&titles=A|B`
  （一次最多 50 个标题）；抓取时务必写本地缓存（`data/raw/52poke-cache/`），避免重复请求。
- 52poke 图片下载：`Special:FilePath` 对脚本返回 403，用 `api.php?prop=imageinfo&iiprop=url` 拿直链
  （media.52poke.com）；**API 会把标题下划线规范化成空格**，查表键要统一。道具雪碧图仅数百字节，
  勿走 `download()` 的 500B 下限。
- 环境代理可能使 requests 抓 raw.githubusercontent.com 报 SSL 证书错误（curl 正常）：
  `fetch_sprites.py`/`fetch_calc_assets.py` 已内置降级不校验重试。
- wikitext 表格单元格 `属性|内容`（如 `class="bgl-甜Z"| 甜`）要先剥属性再 clean；`{{Bag|名|…}}` 取第 1 参数。
- 招式译名代差：52poke 用官方新译名（磷火/咒术/空气之刃/纠缠不休/舌舔/飞水手里剑），
  PokeAPI 是旧名（鬼火/祸不单行/空气斩/死缠烂打/舌舔），`scrape_52poke.py` 的 `MOVE_NAME_ALIASES`
  与 calib `EN2ZH` 做映射，新增差异往里补。
- Windows 下 Tauri 依赖 WebView2 运行时（Win10/11 一般自带）；图标全套在 `web/src-tauri/icons/`（`npx tauri icon` 生成）。
- pnpm ≥10 不再读 package.json 的 `pnpm.onlyBuiltDependencies`（v12 会硬报 ERR_PNPM_IGNORED_BUILDS）：
  构建脚本审批配置在 `web/pnpm-workspace.yaml`（`allowBuilds: esbuild: true`），新依赖需 postinstall 时在此追加。
- sqlite3.Row 迭代产出**值**而非键（`for k in row` 是坑），取键要用 `row.keys()` 或 `dict(row).items()`。
