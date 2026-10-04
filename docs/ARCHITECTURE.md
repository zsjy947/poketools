# PokéTools 架构总纲（ARCHITECTURE）

> 本文是项目**当前实现**的唯一权威设计文档，由 DESIGN.md / PLAN.md（四期规范）/ SELF-ITERATION.md
> 与五期两份更新计划（UPDATE-PLAN / CALC-UPDATE-PLAN）合并而成，只保留仍在生效的方案；
> 已被推翻的内容压缩进 §10 变更历史。数据缺口见 `DATA-GAPS.md`，操作手册见 `USER-MANUAL.md`，
> 未完成/延后/否决事项见 `ROADMAP.md`。

## §1 技术栈与架构（终态，2026-10-03 统一化改造合入）

| 层 | 选型 | 说明 |
|---|---|---|
| 构建期管线 | Python 3.10 + SQLite | PokeAPI CSV + 52poke/PokemonDB 抓取 → `data/poketools.db` → 静态分片导出 |
| 唯一前端 | **web/**（React 18 + TS strict + Vite + zustand + vitest） | 统一壳 hash 路由：#/home #/games #/game/:id/:feature #/pokemon/:id #/calc #/battle；poketools 八页 + 模拟对战同壳（对战/计算器 keep-alive 常驻） |
| 领域逻辑 | `web/src/data/*.ts` **TS 单实现** | damage/calc/pokemon/lookup/local-api + `state/user.ts`（伤害公式、数据访问、生蛋链唯一事实源） |
| 窗口壳 | Tauri 2 | `web/src-tauri`；custom-protocol 内嵌 `web/dist` 全部资产；NSIS 安装包 + 便携 exe |
| 存储 | 构建期 SQLite + 运行时 localStorage | `data/poketools.db`（静态源）→ `web/public/data` 分片（33 表+manifest+一致性门禁）；用户状态 `pkt.caught_state.v1`/`pkt.custom_recipes.v1` |
| 运行时 | 完全离线 | 零 API、零网络请求；本地引擎即唯一数据通路 |

架构原则：

- 静态库由脚本重建，应用代码**绝不**改写管线产物；数据只经管线（build_db → export_static_data）。
- **单一实现**：Python 侧 damage/breeding/routers 已退役；calib-js（vitest 读 tools 基准）为公式层唯一对拍门禁。
- 功能入口**按游戏组织**（`games.features`），伤害计算器与模拟对战为全局独立入口。
- 静态检查：web 侧 `tsc --noEmit + eslint + prettier`；python 侧 `ruff check scripts/ tests/`（零告警基线）。

## §2 数据管线与数据源

```bash
git clone --depth 1 https://github.com/PokeAPI/pokeapi data/raw/pokeapi   # 一次性
python scripts/build_db.py            # PokeAPI CSV -> data/poketools.db（可重复执行，重建）
python scripts/build_z_moves.py       # 52poke「Ｚ招式」页 -> data/curated/z_moves.json（需先跑一次 build_db）
python scripts/build_db.py            # 二次执行装入 Z 纯晶 items 与 z_exclusive
python scripts/scrape_52poke.py       # 52poke wiki -> data/curated/*.json + 合并入库
python scripts/fetch_sprites.py       # 官方绘图（三级回退）-> data/sprites/
python scripts/fetch_calc_assets.py   # 全量道具图标 + 机制图标（极巨/太晶19种）-> sprites/items + assets/mechanism
python scripts/fetch_feature_images.py / fetch_sandwich_images.py   # 特化页配图 -> dist/assets
python scripts/make_icon.py           # 精灵球应用图标
python scripts/export_static_data.py  # db 读侧 -> web/public/data/ JSON 分片（本地模式数据源；含全表 diff 硬门禁）
python scripts/verify_static_equivalence.py  # 真实 API vs 本地 JS 引擎逐字段等价性验证（524 调用门禁）
node tools/static-check/calib-js.mjs  # JS 伤害引擎 vs smogon 基准（calib 双语言门禁之二）
```

build_db 重建采用**连接内就地 DROP 重建**：Windows 下直接删除 `poketools.db` 可能遇 unlink 幻影锁
（文件句柄未释放），就地 DROP 各表再建对句柄占用免疫——重建失败勿只想着删文件。

### 静态化管线（路线 B / APK 基座，UPDATE-PLAN §3.2）

- **导出**：`export_static_data.py` 33 表 → `web/public/data/`（gitignore 可重建，~57MB）：
  常规表全量 `tables/*.json`（行序=rowid 序）；大表分片——`learnsets` 按 vg、
  `learnsets_all`/`encounters` 按物种（懒加载）；`manifest.json`（data_version 行数指纹 + 文件清单）。
- **一致性硬门禁**（go/no-go）：① 脚本内置导出后全表回读逐行逐字段 diff 零差异；
  ② `scripts/check_web_assets.py` 资产清单核对（manifest 行数 vs DB、官方绘图/对战精灵图/资产族）。
  （历史上另有 524 调用 py↔js 等价终验与 calib-js.mjs，终态统一改造最后一次全绿后随双实现一起退役；
  公式对拍由 `web/tests/calib.test.ts` 以同基准继续锁定。）
- 语义对齐要点（移植时踩过的坑，勿回退）：Python `.get(key, True)` 的「键缺失 ≠ 键为 None」
  （多重鳞片满血判定用 undefined 哨兵区分）；生蛋链 chains 顺序源自 Python set 迭代序
  （等价性验证做序无关规范化）；字典整数键迭代序差异用 Map（插入序）规避；
  字符串排序是码点序（localeCompare 不等价）；表缓存行不可变异（detail 挂 ability_list 曾污染缓存）。

### 安卓端（暂缓，已迁移 dev/android 分支）

poketools 安卓壳（`apk/` Tauri 2 壳 + `build_apk_assets.py` 资产组装）与 battle 双端壳
（`battle/src-tauri/`，Windows NSIS exe + Android APK 共用，含 Rust 工具链锁定）
已于 2026-10-02 自 main 移除，完整工作区迁移至 `dev/android` 分支；待桌面 exe（含统一化嵌入）完善后在该分支恢复。
main 保留纯前端能力：本地模式降级（api.js，无后端自动切本地引擎）与 ≤768 竖屏适配层；变更历史见 §10。

### PokeAPI（离线整包 CSV）

- 来源 `data/v2/csv/*.csv`，简体中文语言 id=12（en=9）。
- **现行版本组（vg）映射**（唯一权威表）：

  | 游戏 | vg | 备注 |
  |---|---|---|
  | 剑盾 | 20/21/22 | 图鉴/学习集取 20；TR（100-199）在 machines vg20 |
  | 晶灿钻石·明亮珍珠 | 23 | 图鉴同 DP 神奥图鉴 151 只（original-sinnoh）；PokeAPI machines 仅 17 条，TM001-100 由 52poke 补全 |
  | 传说 阿尔宙斯 | 24 | 无 TM/生蛋/特性机制 |
  | 朱紫 | 25/26/27 | **machines 只导 vg25**（26/27 同号重复）；tutor 数据在 52poke 为「回忆」，与 level=0 一起进「进化&回忆」tab |
  | 传说 Z-A | 30/31 | 学习集：52poke 主源 + PokemonDB 兜底写入 vg30；machines 导 vg30+vg31（31=异次元 DLC TM108-160）。**vg32 是 Pokémon Champions 的 train 数据，与 Z-A 无关，勿导入** |

- learnsets **保留 level=0** 原语义（「进化时学会」，build_db 不再强制改 1）。
- 招式 `is_spread`：target_id ∈ {9,11,14}（all-other-pokemon/all-opponents/all-pokemon）→ 双打扩散 ×0.75。
- 已知坑：蛋组标识符 `ground/plant/humanshape/indeterminate/no-eggs`；natures.csv stat_id 顺序 1=hp..6=spe。

### 52poke 中文维基（MediaWiki API，补 PokeAPI 缺口）

- 提供：各游戏简中图鉴描述、捕捉方式（get_methods，**含形态标记行**：pos1 形如 `0037A` → form 列存标记字母）、
  特性文案（`{名}（特性）` 页的 特性效果/特性说明）、TM 获取与素材、BDSP 与 Z-A 学习集、
  三明治/甜甜圈/咖喱/食材调味料表、Ｚ招式泛用/专属表、风味力量（人工整理）。
- 抓取统一走 `scripts/wiki_client.py`：批量 wikitext（≤50 标题/批）+ `data/raw/52poke-cache/` 缓存 +
  imageinfo 直链下载（Special:FilePath 对脚本 403）；**API 把标题下划线规范化成空格**，查表键要统一。
- 解析失败条目一律落 `data/curated/TODO.json`，禁止静默丢弃；界面缺失数据标「待补充」。
- 招式/特性译名代差（磷火↔鬼火、飘浮↔漂浮 等）由 `MOVE_NAME_ALIASES` / 特性列表页两侧标题兜底映射。

## §3 数据库 Schema

### poketools.db（静态，构建期重建）

核心：`games`（features JSON）· `regional_dexes`+`dex_entries` · `species`（含 evolves_from、**shape_zh 体型**）·
`forms`（属性/种族值/努力值/形态标签/特性/隐藏特能，含 Z-A 异次元 `*-mega-z` 三形态；
烈咬陆鲨Ｚ补第二属性地面、波导防护补简中名——PokeAPI 缺漏见 DATA-GAPS §二.5）· `moves`（含 **is_spread**）·
`learnsets`（仅目标游戏，含 Z-A mastery 与 level=0 进化语义）· `learnsets_all`（全世代，计算器用）·
`machines` · `vgs` · `natures` · `evolutions`（进化条件 28 列，冷门机制已建模）

五期新增：

| 表 | 用途 |
|---|---|
| `abilities(ability_id, name_zh, intro, effect, extra)` | 特性文案（名称层来自 PokeAPI，文案由 scrape 抓 52poke 填充，310/374） |
| `items(id, identifier, name_zh)` | 全量道具 2127 + 注入 Z 纯晶 35（identifier 供图标路径） |
| `z_exclusive` | 专属 Z 映射（(species+原始招式)→专属 Z 招式/纯晶，22 行；form_suffix 支持逗号分隔多后缀——帽子皮卡丘 7 形态） |
| `z_generic(type, z_move_name, crystal_identifier, crystal_id)` | 泛用 Z 官方名（属性→Z 招式名+纯晶，18 行，CALC-FIX 起 z_move_name 入库下发） |
| `gmax_moves(species_id, form_identifier, gmax_move_name, type_zh, power)` | 超极巨专属招式（34 个 `*-gmax` 形态一一对应；power 仅存 160 特判三条，null=属性档位换算；52poke「极巨招式」页 curated） |
| `evo_branches(family_key, species_id, form_suffix, branch)` | 地区形态分支进化链（29 族 curated `evo_branches.json`） |
| `dex_default_forms(dex_id, species_id, form_id)` | 图鉴默认展示形态（curated 增补 + 按可用性自动派生 125 行） |
| `form_game_availability(form_id, game_id)` | 形态×游戏可用性（curated `form_game_availability.json`；`game='-'` 哨兵=全游戏隐藏；未收录形态默认全游戏可见） |

52poke 合并：`get_methods`（含 **form 标记列**）· `dex_flavor` · `form_flavor`（形态独立介绍 600 行）·
`tm_how` · `sandwiches`；特化：`picnic_items` · `donut_types` · `special_donuts` · `berries` ·
`flavor_powers` · `curries` · `encounters`（剑盾英文兜底）· `move_flavor`

### userstate.db（3 表，用户可写）

`profiles`（固定默认档案 id=1）· `caught_state(profile_id, dex_id, species_id, caught, note)` ·
`custom_recipes`（ingredients/seasonings 存 `[{name,count}]` JSON，读取兼容旧字符串数组/顿号文本）

## §4 端点映射（本地引擎 = `web/src/data/local-api.ts`，签名与原 FastAPI 一致）

> 原 REST 端点已随 FastAPI 退役；下表路径即 `localApi.handle(method, path, params)` 的调度键，
> 由 `web/src/data/api.ts` 直接调用（无 HTTP）。

| 方法与路径 | 说明 |
|---|---|
| `GET /api/games` | 游戏列表 + features + 各图鉴计数 |
| `GET /api/dex/{dex_id}?profile&filter&type&q` | 图鉴条目（含捕捉状态；form 优先 dex_default_forms 覆盖） |
| `PUT /api/state` · `POST /api/state/bulk` | 捕捉标记 / 批量（**同游戏各图鉴自动双向同步**，跨游戏不传播） |
| `GET /api/state/counts?profile` | 全部图鉴已捕捉计数（一次返回） |
| `GET /api/pokemon/{id}?game=&form=&dex=` | 详情（介绍/获取方式/进化链/形态按游戏与形态裁剪；form=后缀驱动分支与过滤，dex=默认选中覆盖形态） |
| `GET /api/pokemon/{id}/moves?game=&form_id=` | 招式分组表（tab 随游戏；朱紫含「进化&回忆」；TM 展开 how/materials） |
| `GET /api/breed-chains?species_id&move_id&game` | 蛋招式最短生蛋链（多源 BFS） |
| `GET /api/ev?stat&value&game&q` | 努力值反筛（含图鉴默认形态覆盖 + locations 野外地点） |
| `GET /api/meta/typechart` · `natures` · `species` | 元数据 |
| `GET /api/meta/items` · `GET /api/meta/abilities` | **全量**道具（2127）/ 特性列表（计算器无游戏上下文） |
| `GET /api/meta/z-moves` | Z 纯晶表：泛用 18（**含 type 与 z_move_name 官方名**）+ 专属 22（含 species/招式映射） |
| `GET /api/meta/max-moves` | 极巨招式官方名 19 行（18 属性 + 极巨防壁，供前端 属性→极巨名 映射） |
| `GET /api/meta/gmax-moves` | 超极巨专属招式 34 行（form_identifier→官方名/属性/威力特判） |
| `GET /api/sandwiches` · `picnic-items` · `donuts` · `curries` | 特化功能数据 |
| `GET/POST/DELETE /api/custom-recipes` | 自定义食谱（数量版校验：Z-A 树果总数 3~8） |
| `GET /api/calc/forms?species_id=` | 计算器形态（含六项种族值，修复恒「—」） |
| `GET /api/calc/moves?species_id=` | 全世代招式并集（**含变化招式**，含 is_spread） |
| `POST /api/calc` | 单次伤害计算（支持 z_move 专属映射解析；`power_trick`/`defender_power_trick` 攻防实际值互换；`defender_switching_out` 防守方换下场=追打×2） |
| `POST /api/calc/batch` | **一次算双方×4招**（替代串行 8 POST；招式项可为 `{id, power}` 带威力覆盖；sides 支持 per-side `power_trick`/`switching`；gmax 形态+极巨自动装配专属招式威力） |
| `GET /api/version` | 应用版本（构建期注入；前端版本横幅/关于信息核对用） |

已删除：`/api/calc/compare-forms`（五期随 UI 移除）、`/api/profiles`（四期 P3-1 下线）。

## §5 伤害计算器

引擎 `web/src/data/damage.ts` + 装配校验 `web/src/data/calc.ts` + 界面 `web/src/pages/CalcPage.tsx`。
只保留现代公式（阿尔策斯/Z-A 公式已随四期 P4-1 移除）。对齐 `@smogon/calc` gen9 修正链全量扩展。

### 公式与取整语义（勿改顺序）

```
威力阶段 bpMods(帮助6144/场地5325·2048/气场5448·3072/蓄电池·能量点5325)
  → Z/极巨换算（以原始威力为输入；多段：2-5段取3段·Z固定2段用单段·极巨固定2段取2倍·
    水手里剑40档·三旋击120·气象球极巨130；gmax 专属固定威力特判三条=160）
  → 追打×换下场目标 威力×2（仅未换算路径；Z/极巨换名后该分支不生效，对齐 smogon）
  → base = floor(floor(floor(floor(2L/5+2)×P)×A/D)/50+2)
  → 双打扩散 3072 pokeRound → 天气 6144/2048 pokeRound → 会心 floor(×1.5)
  → random floor(base×(85+i)/100) → STAB 4096 分数 → pokeRound×相性 floor
  → 灼伤 floor/2 → finalMod 4096 链 → pokeRound, min 1
```

- 能力值阶段：等级升降分数 (2±k)/2 取整；**会心无视攻方负向/守方正向升降**；
  四灾兽 dfMods/atMods 3072；雪天冰系**防御**×1.5、沙暴岩石系特防×1.5（pokeRound，注意雪加的是防御不是特防）；
  突击背心/进化奇石 dfMods 6144（自 stats 层移入引擎对齐 smogon）；花之礼攻/防两侧 6144；钢之意志 6144（atMods）。
- 奇妙空间换 def/spd；魔法空间道具修正失效；重力：飞行不再免疫地面、全员接地。
- STAB：原属性 +2048；太晶同属性 +2048；适应力 +2048/+1024（太晶属性为本属性时）；
  **星晶**：本属性再 +2048（=×2），非本属性 4915（每属性当次视为首次，单次计算口径）。
- 防守方太晶：非星晶**替换**原属性相性（原弱点/免疫失效）；星晶保持原属性。
- 特性免疫类（引火/储水/引水/避雷针/蓄电/马达驱动/干燥皮肤/食草）→ 伤害 0；漂浮地面免疫（重力下失效）。
- 屏幕：单打 2048 / **双打 2732**；友情防守 3072；气势披带进 KO 判定（满血首击残留 1 HP）。
- KO 回合：16 rolls 独立同分布精确枚举 n=1..4（`ko.probs` 键为字符串"1".."4"）；隐形岩/撒菱/盐淹/寄生种子
  进场先扣（`hazard_damage`，岩石按属性弱点、撒菱接地判定），多鳞片/影甲满血判定随之失效。

### 机制归属（五期定案）

- **太晶化/极巨化** = 摘要卡顶部点亮标记（太晶图标随所选太晶属性切换，含星晶）；
- **Z 招式** = 每招一个纯晶图标标记（单选——一场一次 Z 力量；点亮自动装备对应纯晶：
  专属映射命中→专属纯晶+固定威力/分类，否则泛用属性纯晶+z_power 换算；手动改道具即解除）；
- **超级进化/超极巨化/原始回归** = 编辑面板**形态选择**派生（与 Z/太晶标记互斥；mega 形态自动锁进化石道具，
  烈空坐例外——校验携带画龙点睛；超极巨化形态自动点亮极巨化标记，HP 显示 ×2）。
  **超极巨化本质即极巨化：gmax 形态与极巨标记共存合法**（`is_gmax` 单列，仅与 Z/太晶互斥），
  招式属性命中专属属性时引擎注入 gmax 固定威力（狂擂乱打/破阵火球/狙击神射=160）。
- **Z/极巨/超极巨官方招式名**：显示层查表替换（对齐 @smogon/calc move.ts）——极巨=属性→`moves`
  表官方名（变化招=极巨防壁）、gmax 形态属性命中→`gmax_moves` 官方名、Z（伤害招）=专属命中→专属名
  否则泛用属性名（`z_generic`）；不改威力档位与取整链。
- **力量戏法** = 场地区两侧标记（静态语义：至切换者下次下场）：router 装配后
  `_swap_atk_def` 互换该侧 `stats.atk/def` 实际值（能力升降仍按能力名生效），**不触碰 damage.py
  公式与取整链**，calib 基准不受影响；batch 为 sides per-side flag，单招端点为
  `power_trick`/`defender_power_trick`。
- **「切换」= 换下场状态**（per-side `switching`，对齐参考站 switchingOut）：唯一计算效果为
  攻方对其**追打**威力 ×2（引擎 `is_switching_out` 分支）；单招端点对等字段 `defender_switching_out`。
- **气势披带 = 道具派生**（与参考站一致，场地区无此按钮）：`side.item === "气势披带"` 自动
  派生 defender_sash，KO 判定满血首击残留 1 HP 不变。
- **场地区完全复刻参考站**：左右状态列 8 行 × 中间场地 7 行逐行逐键一致（`SIDE_ROWS` 单源配置，
  `views/calc.js`）；无列标题/组名/说明文字/攻守标识——左右列固定绑定左右宝可梦，攻守由上方
  招式选择决定；原生 `fp-btn` 白底描边按钮（选中浅蓝）、撒菱连体分段、灾祸四件套两行按钮、
  三列 `space-between` 同高底边对齐；壁与撒菱为单选语义，其余多选；
  中毒/剧毒/冰冻/睡眠/麻痹/顺风为展示态（速度序不在伤害模型内）。
- **计算器视图常驻无痕切换**：`calc-view` 首次挂载后 `v-show` 常驻（app.js `visited` 标记），
  切走仅 display:none——状态保留、零请求、图片不回源；meta/每物种 forms·moves 为模块级缓存
  （启动预热 + Promise 共享 + FIFO 24），两侧初始化 `Promise.all` 并行，机制图标 20 张预加载。

### 校准流程（改公式后必须重跑，AGENTS 铁律）

```bash
cd tools/calib && npm install          # @smogon/calc
node harness.mjs > smogon_baseline.json
python check.py                        # 需先完成数据管线
```

51 个基准案例逐 roll 比对 + 41 项 Z/极巨**威力表对拍**（zTable 输出自 smogon move data），全绿才可提交。

### 明确不做的

- 威力按重量/HP 变化类招式：威力输入框手动覆盖（仅变动威力招出现输入框）。
- 剧毒/灼伤/盐淹的**每回合**削血不进 KO 卷积（进场类一次性先扣）；吃剩的东西等回复不建模。
- 逐回合速度先手模拟（顺风/麻痹仅展示）。
- 热门构筑/剪贴板/保存队伍等 meta 功能。
- 超极巨招式的次要效果（灼烧/能力变化等）不建模——仅威力/属性档位生效（对齐参考站口径）。

## §6 前端架构（React + TS，web/）

```
web/
  index.html
  src/app/            统一壳：router.ts(hash 路由) / App.tsx(分区+keep-alive) / BattleApp.tsx(对战分区)
                      pktStore.ts(poketools 全局态：gameId/feature/profile，localStorage 持久)
  src/pages/          UnifiedHome/Games/GameSection(rail+功能路由)/Dex/Detail/Ev/Sandwiches/
                      Donuts/Curry/Calc（React 组件，自 Vue 模板字符串组件迁移，行为等价）
  src/pkt/            共享层：shared.tsx(TypeBadge/PokeToggle/EvoChain/toast…+Monoline 图标)
                      widgets.css(轻量控件替代 Element Plus：pkt-btn/select/table/modal/
                      FilterSelect=过滤+可见上限)/base|dex|features|calc|mobile.css(Vue 版原样迁移)
  src/data/           领域层 TS 单实现（见 §4/§5）+ api.ts(本地引擎直连) + zh-patch.ts(中文补丁)
  src/state/user.ts   用户状态 localStorage（caught_state / custom_recipes）
  src/battle/…        模拟对战（引擎适配/会话/队伍/对战界面；见 docs/BATTLE.md）
  src/app/pages/      对战分区页（赛制选择/队伍编辑/上阵预览/记录/设置）
  public/data         静态分片（33 表 + learnsets/encounters 懒加载 + manifest 行数指纹）
  public/assets|pkt|sprites  配图/官方绘图/对战精灵图
  src-tauri/          Tauri 2 壳（NSIS + 便携 exe）
```

约束：TS strict + 零 any 新增；全量下拉（道具 2127/物种 1025）一律 `FilterSelect`
（过滤 + 可见上限 80）；路由用 `location.hash`；请求/引擎异常经 toast 呈现。
导航：首页三宫格 → 游戏内 **84px 图标窄栏**（双版本游戏商标竖排两枚防溢出，U2）；
对战/计算器分区首次进入后常驻挂载（状态跨分区保留）。移动端（≤768px）mobile.css
同一前端自适应（底部 Tab/双列卡片/手风琴，见 USER-MANUAL）。

## §7 设计决策记录（为什么这么做）

| 决策 | 理由 | 里程碑 |
|---|---|---|
| 已捕捉卡片**不变色**，仅右上角精灵球表达状态 | 用户拍板：视觉噪音最小化 | M1 |
| 同游戏图鉴自动双向同步、跨游戏不同步 | 本体/DLC 图鉴同一存档，重复标记违反直觉 | M1 |
| 朱紫「进化&回忆」独立 tab | 52poke 升级表 0 级=进化、tutor=回忆机，语义应显式呈现 | M6 |
| LA 图鉴 species 不删、改默认展示形态 | LA 无法外部传入，图鉴内 242 种均本作可获得 | M5 |
| 形态×游戏可用性用 **curated 配置**而非按图鉴成员推断 | 图鉴成员≠形态可用（洗翠图鉴含小拳石但无阿罗拉形态）；配置可随时调整 | M0 |
| **BDSP 无超极巨化/地区形态**（52poke 获得方式实证） | 计划文档原判「BDSP 有超级进化」与 52poke 数据不符，按「禁止编造数据」原则以数据为准 | M0 |
| mega 名单只含 Z-A（含异次元 DLC，按图鉴成员派生） | 现代五作中仅 Z-A 支持超级进化 | M0 |
| 机制归属：mega/极巨=形态派生，太晶/极巨=标记，Z=每招标记 | 对齐参考站交互；后端 `_validate_mechanisms` 为最终防线 | CALC |
| 多段招式 Z 用单段、极巨取 2 倍；2-5 段取 3 段 | 与 @smogon/calc data.zMove/maxMove 逐条对拍得出（52poke 文字规则与数据有出入，以引擎数据为准） | CALC |
| 防守方太晶相性按太晶后属性（不可回退项） | 官方规则；calib 含弱点变化/免疫消失两案例 | CALC |
| 雪天提升冰系**防御**（非特防） | 计划文档笔误「特防」，按官方规则与 smogon 实现修正 | CALC |
| KO 表述只说「能」不说「不能」（确定 N 回合/P% N 回合内） | 用户拍板：负面表述无信息量 | CALC |
| 全量展示哲学：无影响的道具/特性照常列出，不加「不参与计算」小字 | 用户拍板 | CALC |
| 树果/食材存 `[{name,count}]`，读取兼容旧格式 | Z-A 树果可同种多个（3≤Σcount≤8） | M7 |
| 测试样板收敛 conftest；ruff 零告警基线 | 五期 M8 审查要求 | M8 |
| 场地区改版为「左状态/场地全局/右状态」三栏，两侧状态 `SIDE_GROUPS` 单源配置 | 伤害计算相互，两侧均需完整对称列表（对齐参考站）；单源保证左右永不漂移 | 计算器改版 |
| 力量戏法在 router 层互换 stats，不动 damage.py | 钉子/盐淹/寄生种子只依赖 max HP 与属性相性，与互换先后无关；取整链与 calib 基准零影响 | 计算器改版 |
| 跨路由共享常量收编 `services/constants.py`；路由连接 Depends 注入；静态资源 no-cache | 全量审查 R1（P0-1/3/4）：消除 routers 隐式耦合、异常路径连接泄漏、忘 bump 版本号分发旧前端三类正确性隐患 | R1 |
| sqlite 连接 `check_same_thread=False` | 真实 uvicorn（anyio 线程池）下依赖 setup/端点体/teardown 分属不同线程，默认同线程校验导致计算器首载 500（Poketools.log 实证）；连接为请求级短生命周期，TestClient 单线程 portal 是测试盲区→补跨线程单测护栏 | CALC-FIX |
| Z/极巨/超极巨显示名查表替换（gmax curated 34 条、z_generic 18 条入库） | 对齐 @smogon/calc「官方名条目整体替换」做法；本地数据源 52poke，宁缺勿错 | CALC-FIX |
| gmax 形态与极巨标记互斥放行（`is_gmax` 单列） | 超极巨化本质即极巨化，形态+标记是唯一合法组合；此前误并入 is_mega 桶导致 gmax 形态全不可算 | CALC-FIX |
| 「切换」= 换下场状态（追打×2），非攻守交换 | 参考源码查证（radiantwf/vgc-damage-calc switchingOut + smogon gen789 isSwitching） | CALC-FIX |
| 气势披带移出场地区，改道具派生 | 披带是道具非场地状态（参考站即如此）；场地区与参考站逐键零偏差 | CALC-FIX |
| calc 视图 v-show 常驻 + 模块级缓存预热 | v-if 链切走即销毁全子树，重进重发 7 请求+白屏闪烁；常驻后零请求零重绘 | CALC-FIX |
| 导航重构：首页功能宫格 + 游戏中心 + 64px 图标窄栏；图标弃 emoji 改手写 Monoline SVG | 图鉴获得 +136px 横向空间；模拟对战入口预留；SVG 可版本管理/迭代，currentColor 天然适配高亮态 | CALC-FIX 批次三 |
| 模拟对战并入 main（battle/ 子目录独立工程，M0-M8 验证后合并） | 评测实测见 §7.1；battle 自成可发布项目（Windows NSIS + Android APK 双端产物），与主仓 Python 栈零耦合（Tauri 2 + React + TS monorepo 子目录） | battle M8 |
| poketools APK 走路线 B：数据静态化 + Tauri 壳（不用 sidecar） | APK 内无法运行 Python 进程（sidecar 仅桌面可行）；构建期把 poketools.db 读侧导出 JSON 分片，api.js 端点签名不变改本地实现，userstate 迁 localStorage；damage.py TS 移植以 calib 51+41 双语言对拍为硬门禁 | UPDATE §3/§4 |
| APK 独立壳 apk/（不复用 battle 壳做多入口） | 两应用发布节奏/图标/包名独立；资产互不膨胀（battle 精灵 454MB 与 poketools 136MB 分包）；构建链完全复用（.cargo linker/gradle 镜像/zipalign 签名同一套手动流程） | Track C A3 |
| api.js 后端探测降级（连接拒绝/非 JSON → 本地模式） | 同一 dist 双运行时复用：桌面 exe 走 FastAPI，APK 走本地引擎，零分支构建 | Track C A1 |
| routers→services 分层拆分（R2）**延后至 React 统一壳**，不先行单独拆 | A1 已把 routers 逐行镜像到 js/local 并以 524 调用等价门禁锁定双实现同构；先拆 Python 须同步改 JS 镜像并重过门禁，成本翻倍、漂移风险 > 收益；随统一壳 Python 退役/瘦身一并处理（ROADMAP RM-02） | Track D |
| damage 取整函数 `rnd_half_down`/`poke_round_ratio` 不更名不删除（P2-8 否决） | Python↔JS 双实现镜像的对照锚点，更名破坏同构；JS 版两函数均为核心链路 | Track D |
| `z_exclusive` 不加 crystal_id 列 | 列由 curated 生成，加列须改 build_z_moves 双端构建脚本，收益仅省一个 join | Track D |
| 架构五否决：不引入前端构建链 / 不上 ORM / 不状态机化 store / 不合并 routers 单文件类 / 不用 vitest | 免构建+产物入库是架构原则；SQL 已全参数化手写最直白；状态极少；FastAPI 函数式惯用法；免构建约束下 smoke.mjs 已覆盖同等风险 | 重构规划 |
| battle 应用壳 Tauri 2（落选 Electron+Capacitor、Flutter） | 一套代码双端产出（Windows NSIS exe + Android APK）；移动端官方支持与包体取舍 | battle M0 |

### §7.1 模拟对战并入评估报告（UPDATE-PLAN §3.4 指标实测，2026-10-02）

| 指标 | go 条件 | 实测 / 判定 |
|---|---|---|
| 性能 | 统一壳冷启动 ≤3s（桌面）；列表/详情操作无感延迟 | battle 壳 = Tauri 2 + WebView（前端单 chunk 8.6MB + 供应商化引擎 11MB）；M4-M6 浏览器实测完整单打/双打对局全程交互无感延迟（批量 emit 后回合结算秒级）。统一壳冷启动 ≤3s 由 Track C A3/A4 落地实测验收 |
| 包体 | 统一 exe ≤ 双 exe 之和 ×80%；APK ≤120MB | 数据点：poketools release 165MB（exe 54.7MB + data 110MB＝db 43.8MB + 精灵图 69MB）；battle exe 415.25MiB（454MB 精灵资产压缩内嵌）；battle APK 440MB（全量资产，docs/BATTLE.md §6.1 P2 决策保留）。统一 exe / poketools APK 体积随 Track C A1-A4 实测（素材面 69MB sprites + 13MB 前端 + 静态 JSON 分片，≤120MB 判定可行） |
| 维护成本 | B 路线完成后仅剩 TS 单栈 | **go**：运行时全 TS/JS（battle 栈已验证）；Python 仅保留构建期数据管线；damage 公式 TS 移植用 calib 既有 smogon 基准逐 roll 对拍护栏 |
| 数据一致性 | 静态导出与 SQLite 全表 diff 零 + 抽样 50 物种逐字段一致 | Track C A1 硬门禁（export 脚本构建期强制），结果随 A1 验收回填 |
| 功能对等 | 迁移清单逐页验收；测试折算 TS 等价用例 | Track C A2 按 UPDATE-PLAN §4.2 清单逐页验收；battle 侧已 56 用例 + 官方 replay 对拍 36 项 |

**结论：并入执行**——battle 分支 M8 合并回 main；统一壳以路线 B（数据静态化）推进，Track C A1-A4 即 UPDATE-PLAN §4 的 APK 落地；UI 迁移基线 = battle 的 React 18 + TS 组件体系（终态），过渡期 poketools 免构建 Vue 前端原样保留、竖屏化后入壳。

## §8 代码与测试规范

- commit：`类型: 摘要`（feat/fix/data/docs/test/chore），每个里程碑一次 commit。
- UI 文案一律简体中文；界面缺失数据一律标注「待补充」，禁止编造数据。
- 52poke 解析失败条目必须落 `data/curated/TODO.json`，不静默丢弃。
- 前端构建产物 `web/dist` 不入库；`data/raw|*.db`、`web/public/`、`node_modules/` 均不提交。
- curated 合并走 `guarded()`/`require_rows()` 行数护栏；管线脚本 BLE 豁免（网络容错按设计裸捕获）。
- 事件监听卸载时解绑；异步回填带 token 防竞态（React 侧同：stateRef 同步后再派生）。

测试分层（终态）：

1. **数据完整性**（tests/test_db）+ **解析器**（tests/test_parsers）：pytest；
2. **公式对拍**（web/tests/calib.test.ts，vitest）：51 案例 + 41 行 Z/极巨威力表，
   读 `tools/static-check/cases.json` + `tools/calib/smogon_baseline.json`；
   **改伤害公式后必须重跑**；基准再生成 `tools/calib/harness.mjs`；
3. **golden 用例**（web/tests/{damage,breeding,state}.golden.test.ts）：
   Bulbapedia 官方算例、生蛋链结构校验、用户状态端点行为；
4. **对战六域**（web/tests/{core,data,engine,anim,replay,showdown,zhpatch}.test.ts）；
5. **构建产物冒烟**（tools/smoke.mjs）：vite preview 静态托管逐资源断言；
6. **资产清单**（scripts/check_web_assets.py）：表行数 vs DB、绘图/精灵图/资产族核对；
7. **数据管线回归**：`build_db → build_z_moves → build_db → scrape_52poke → export_static_data →
   fetch_*` 重建后跑 pytest + check_web_assets。

最终回归 checklist：重建管线 → pytest → `pnpm test`（vitest 全量）→ `node tools/smoke.mjs` →
浏览器逐页走查（图鉴标记/批量/同步、详情各栏、EV 地点列、咖喱全图、三明治/甜甜圈数量、
计算器标记/单双打/KO/Z 纯晶锁定、对战完整一局含超级进化）→ `npx tauri build` 离线冒烟。

## §9 Roadmap（未完成项）

未完成/延后/否决事项已于 2026-10-02 统一迁移至 **`plans/ROADMAP.md`**（本地维护，不入 git；自 plans/ 历史计划收编）：
战略项（统一壳/UI 迁移、R2 延后、Python 退役）、battle 增强 T1-T8 与工程债（BattleView 拆分/资产分级/真机演练/性能实测）、
主应用工程债（build_z_moves 合并保留）、否决备查清单。
数据类缺口仍以 `DATA-GAPS.md` 为准（无源待补与变体建模两项仍开放，ROADMAP §5 仅索引）。

## §10 变更历史
- **2026-10-04 模拟对战/计算器收尾三批（U23-U25）**：模拟对战——赛制大类分组头样式补齐（U23）、
  队伍新增默认与选择框一致（species 归一为小写 id，store 装载/写入双端清理同名昵称）、
  合规性校验消息全中文（清漏扫描 22 种消息逐条映射 + translateValidatorError 前置剥离
  「昵称 (英文真名)」括号 + 回归测试 battle-validate-zh）、宝可梦/道具选择列表全中文
  （zh-gen.ts 生成表：形态种 85 键 = toID(pokemon_forms.identifier)，值 = 52poke curated
  形态中文名 + 物种官方名 + 22 条手工补名；道具 44 键 = 本库 items 表；zhOf 链生成表优先于
  补丁表；回归测试 battle-list-zh）、昵称固定为中文种名随物种切换重置；
  计算器——Z 招式自动装备纯晶时道具框显示 🔒（mega 优先）、种族/实际值列宽加宽
  （44/64/1fr/44/64/76）修 3 位数贴边；伊布进化链——传说阿尔宙斯叶/冰伊布双途径
  （道具或洗翠定点岩石，条件级覆盖）。精灵图：fetch_sprites 增 jsdelivr 镜像兜底
  （代理拦 raw.githubusercontent 时可用），新形态 229 张待网络可用重跑（DATA-GAPS §一.6）。
- **2026-10-03 收尾二批（U20）**：图鉴——纯外观形态补齐（PokeAPI 新建模只存 pokemon_forms 的
  四季/花色/字母/花纹/蛋糕等 228 行，合成行 id=900000 段、属性继承基础行；form_meta 改取
  is_default 行修复 label 覆盖；FORM_MARKERS 补全中文形态名→后缀映射，276 段未挂靠清零；
  形态中文标签 PokeAPI 官方名+curated 公式映射）；进化链 children 去重（伊布系重复节点）+
  条件行按游戏选择（叶/冰伊布非珍钻=叶之石/冰之石，珍钻=苔藓/冰岩石并校正位置名）+8 分支网格折行；
  计算器——道具下拉只列对战相关可携带道具（battle-items.ts，UI 层剔除超级进化石/Z 纯晶/钥匙石，
  limit 600），完整表仍供自动装备查找；52poke 图鉴列表 rdex 形态标注核对 45 条（蓝莓椰蛋树=阿罗拉等
  已随 U19 修正）。精灵图缺 229 张待网络恢复重跑 fetch_sprites（DATA-GAPS §一.6）。
- **2026-10-03 收尾六项（U15-U19 之 U17-U19）**：图鉴（进化链分支按家族成员集匹配——修正雷丘系分支键≠真根
  导致分支永不生效；默认分支剥掉 PokeAPI 地区行带出的「在阿罗拉地区」；常规链当前物种节点按所选
  形态切图——一家鼠/土龙节节/鬃岩狼人；52poke 图鉴列表页 `rdex 形态=` 标注为权威核对 45 条，
  修蓝莓椰蛋树=阿罗拉/北上乌波=默认（derive 支持 base 哨兵，人工条目覆盖自动派生的去重顺序修正）/
  北上野蛮鲈鱼白条纹/花舞鸟两图鉴形态；爱管侍雌形态补 SV/Z-A 可用性、超能妙喵雌形态补 SV）；
  计算器（道具下拉 champions 合法可携带道具置前——静态清单 `data/battle-items.ts` 由 vendor dex
  一次性生成；mega 锁图标内嵌道具框右缘替代外部提示；种族/努力值/实际值单元格居中）；图鉴返回保持
  滚动位置（模块级记忆 + 懒加载期短周期重锚定，用户主动滚动即停）。
- **2026-10-03 十四项回归修复（U15/U16）**：壳层布局补齐（`.game-shell` flex + 84px 窄栏 +
  双版本商标竖排 + 游戏中心/游戏内/计算器层级返回键）；图鉴详情（攻击面改读 damage.ts 相性表、
  TM 编号 chip 点击展开独立行、删「还原默认形态」钮、form="base" 哨兵修形态切换死锁、
  获取方式形态标记三级解析防静默丢弃）；数据（mega-z 三形态入库 + PokeAPI 缺漏修正 +
  Z-A 新超进化石 45 颗 curated 译名 + 道具图标 52poke 兜底扩展 TM 圆盘/中文名 Bag）；计算器 UI
  （宝可梦/性格/特性/等级一行、形态/太晶/道具一行、特性自身/其他分组、能力值表表头对齐 +
  等级变化列移末、场地三列等高、按钮描边阴影加深）；图标路径 `/pkt/items` → `/assets/items`。
- **2026-10-03 终态统一改造（阶段 0-7，dev 合入 main）**：battle/ → web/ 统一壳；
  js/local 六模块 + userstate TS 化为唯一实现（524 端点等价终验全绿后 Python 运行时退役）；
  poketools 八页 React 迁移（U1-U14 全落地）；模拟对战 B1-B10 修复（有序上阵/冠军 4+4 开局/
  全中文化含 zh-patch 派生表）；Tauri 2 壳（NSIS 宝可梦工具助手_1.0.0）；门禁重建
  （calib=vitest 51+41、smoke=web 构建产物静态断言、pytest 缩域 test_db+test_parsers）。

| 阶段 | 里程碑 | 结果 |
|---|---|---|
| 一期 M0-M5 | 骨架/数据管线/图鉴追踪/招式+生蛋链/努力值+三明治/启动打包 | 交付（Vite→免构建为落地变更） |
| 二期 | 伤害计算器（现代公式 + 逐 roll 校准 + 全形态对比） | 交付；手动比对被 `tools/calib` 自动化取代 |
| 三期 U1-U8 | 按游戏入口/BDSP 图鉴/详情裁剪/特化页/计算器增强/UI 资产 | 交付 |
| 三期迭代 | 独立审查 26 项修复（灼伤契约 P0、Z-A 公式接入 P0 等后被四期推翻）+ 体验迭代 | 详见 git 历史（SELF-ITERATION 已并入） |
| 四期 P1-P5 | 文档合并/资产/详情两栏/档案移除/计算器重建（删阿尔宙斯·Z-A 公式）/release 打包 | 交付；38 测试绿 |
| 五期 M0-M7 | 特性文案/形态分支/图鉴默认形态/体型/进化招式语义/全量道具·特性·Z 纯晶/双引擎全量扩展/计算器 UI 对齐参考站/捕捉标记重制+同游戏同步/详情重设计/EV 地点/咖喱全图/进化&回忆/食谱数量 | 交付；本文档即产物 |
| 五期 M8 | 全量审查（ruff 零告警+node check）/conftest 收敛/四文档合并为本文档/DATA-GAPS 重写/AGENTS 同步 | 交付 |
| 计算器改版 | 场地区三栏对称（SIDE_GROUPS 单源）/力量戏法（router 层攻防互换）/按钮文字居中修复/单双打切换移入中栏 | 交付；60 测试绿 |
| 审查 R1 | 全量审查 P0 五项修复：常量收编 services/constants.py / damage.ko_summary 公开化 / 连接管理 Depends 注入（四路由全覆盖）/ 静态资源 no-cache 中间件 / build_db curated 装载护栏 require_rows；独立安全扫描无新增高危项 | 交付；60 测试绿 + ruff 零告警 + 冒烟通过 |
| CALC-FIX 批次一/二 | 跨线程 500 修复（check_same_thread）/ 计算器常驻无痕切换（v-show+模块缓存预热+并行初始化）/ Z·极巨·超极巨官方招式名（z_generic+gmax_moves 两表三端点，gmax 160 威力特判，皮卡丘 caps 脏行修复+多后缀）/ 场地区完全复刻参考站（8+7 行逐键一致、切换=追打×2、披带道具派生、gmax+极巨互斥放行）/ 新增 8 组用例 | 交付；68 测试绿 + calib 51+41 全绿 + uvicorn 并发冒烟（80 GET+30 POST 零 500） |
| CALC-FIX 批次三 | 全局导航重构（首页功能宫格/游戏中心 #/games/64px 图标窄栏/BackBtn 层级返回/calc 全画面常驻叠加）+ Monoline 图标体系（10 枚手写 SVG + MonoIcon/RailNav/BackBtn 组件 + tools/icon-preview.html）+ 功能图标 emoji 清零 | 交付；浏览器实测全过（首页三卡/五游戏可达/窄栏高亮/详情全屏/常驻零请求/三列同高逐键一致）；资产 bump v21 |
| battle M0-M8 | 模拟对战全栈：供应商化引擎/BattleSession 协议/数据层/队伍构建/信息流对战/动画演出/双端发布；56 用例 + 官方 replay 对拍 9 条 × 4 维 + 覆盖率 86.9%；Windows NSIS exe + Android 签名 APK + SHA256SUMS；并入评估报告（§7.1）结论=并入 | 交付；tag `battle-v1.0.0`；battle 分支合并回 main；功能说明 = docs/BATTLE.md |
| Track C A1 数据静态化 | export_static_data.py（33 表 83.2 万行分片导出 + 全表 diff 零门禁）+ js/local/* 本地引擎（routers 逐行移植，damage.py TS/JS 化）+ api.js 后端不可达自动切本地；等价性 524 调用逐字段一致；calib-js 51+41 全绿 | 交付；pytest 68 绿 + ruff 零告警 + 浏览器纯静态实测（首页/图鉴/详情/招式/计算器零 JS 错误） |
| Track C A2 竖屏 UI | mobile.css 统一 ≤768/≤480 竖屏层（底部 Tab/窄栏底部化/双列图鉴/详情分段锚点+三层吸顶/EV 卡片流/特化页筛选抽屉/计算器纵向堆叠+手风琴/弹窗全屏）+ viewport/theme-color meta；桌面 >768 零影响 | 交付；移动 390×844 与桌面 1280 双视口浏览器实测（导航/锚点滚动/抽屉/手风琴/卡片流/桌面回归全过） |
| Track C A3/A4 APK | apk/ 独立 Tauri 2 壳（竖屏锁定/零权限/图标全套）+ build_apk_assets.py 资产组装 + 手动构建链复用；产物 92.5MB ≤120MB 门禁、apksigner v2 验证、SHA256SUMS | 交付；安装演练环境受限记录（同 battle M7） |
| Track D D1-D3 | 全量复审（基线四绿+冒烟）+ OPTIMIZE-PLAN 执行：api.js 降级状态机修复（P0）/js/utils 抽取+50 处内联样式收敛+toast 去重/test_api 域拆分（dex/pokemon/calc/features 4 文件，recipes 并入 features 域）/smoke+state 单测固化/build_db 五函数化+derive_dex_defaults 外移/scrape parsers 拆分/abilities 中文过滤+get_methods 索引+版本横幅；R2 延后至 React 统一壳、P2-8 否决（双实现镜像） | 交付；管线重跑全表 diff 仅预期 -63 abilities；四绿+524 等价+10 state+冒烟全绿 |
| 文档归档（2026-10-02） | plans/ 历史计划（00/UPDATE-PLAN/MASTER-PLAN/PROGRESS/CALC-FIX-PLAN/REFACTOR-PLAN/OPTIMIZE-PLAN）实现结论核对沉淀（本文档补录 R2/P2-8/crystal_id/架构五否决/Tauri 落选决策、/api/version 端点、build_db DROP 重建坑、scrollIntoView instant 坑、gmax 次要效果不做；BATTLE.md 补合规立场权威段并修 NOTICE 悬空引用；DATA-GAPS 修 build_z_moves 重跑矛盾），未完成项迁 plans/ROADMAP.md（本地维护，RM-01..RM-17）；plans/ 仅留活动计划与 KEYSTORE | 交付 |
| 安卓端迁移（2026-10-02） | apk/ 壳与 build_apk_assets.py、battle/src-tauri 双端壳（含 rust-toolchain.toml）自 main 移除，完整工作区迁 dev/android 分支；ARCHITECTURE/BATTLE/USER-MANUAL 同步（发布历史保留），安卓开发待桌面 exe 完善后恢复 | 交付 |
