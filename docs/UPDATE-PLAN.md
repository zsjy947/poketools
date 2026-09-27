# UPDATE-PLAN —— 九项更新实施计划（2026-09-27）

> 状态：待实施。本文档为完整执行蓝图，按里程碑 M0–M7 分层，每个里程碑一次 commit。
> 探索结论已逐项核实到文件：行号，实现时以本文档为基准，发现新差异按约定落 `TODO.json`，禁止编造。

## 已确认的设计决策（用户拍板）

| 决策点 | 结论 |
|---|---|
| 已捕捉卡片视觉 | 仅右上角精灵球状态（捕捉=红白填充球 / 未捕捉=灰描边球），卡片完全不变色 |
| 本体↔DLC 图鉴同步 | 同游戏内自动双向同步；跨游戏不同步 |
| 朱紫「进化&回忆」 | 单独「进化&回忆」tab |

## 探索核实的关键事实

- **标记现状**：蒙底/绿点是 `dex.css:24-25`（`.dex-card.caught` + `::before`）；`invert()`（`dex.js:132-142`）只会把未捕捉标上、无清除路径；批量操作无确认框。
- **caught_state**：主键 `(profile_id, dex_id, species_id)`，无 note 列；取消标记写 `caught=0` 行留存；`dex_id` = `regional_dexes.id`（galar / isle-of-armor / crown-tundra / sinnoh / hisui / paldea / kitakami / blueberry / lumiose-city / hyperspace）。
- **「小猴宝可梦宝可梦」**：`detail.js:41` 硬拼「宝可梦」，而 `species.genus_zh` 数据本身已带后缀 → 删前端拼接即可。
- **喵喵→喵头目**：`evolutions` 表按 species 建边（52→863），地区形态不参与建边；PokeAPI 该边 region 为空。
- **特性文案**：PokeAPI `ability_prose.csv` 中文行数 = 0，必须抓 52poke。页面结构（已核实威吓/飘浮两页）：`==特性效果==`（首段散文 = effect，`*` 行列表 = 多点补充）、`==特性说明==`（`{{状态说明框|世代|游戏|-{zh-hans:…;…}-}}` 分世代介绍）。无「特性介绍」章节。抓取走 `wiki_client.py` 的 api.php（`action=raw`/index.php 会被 403）。
- **朱紫招式**：52poke 朱紫学习集在子页 `{名}/第九世代招式表`，`{{learnlist/level9|0|鼓击|…}}` 等级参数 0 渲染为「进化」；PokeAPI vg25 本来就有 level=0 行，是 `build_db.py:365-367` 强制改成 1 丢了语义 → 无需推倒数据源。52poke 朱紫表**没有**回忆列（回忆=本作回忆机可回忆全部升级招式）。
- **获取方式**：`get_methods.method` 是中文自由文本（316 种；Top：可见 1865、本作中不存在 1259、极巨团体战 1130、通过连接交换传入 784、定点 732、太晶团体战 525、随机 375、极巨大冒险 247…）；带形态标记的行在 `scrape_52poke.py:856` 被直接丢弃。
- **形态×游戏**：mega 97 个 / gmax 34 个 / primal 2 个；mega 在任何 vg 学习集都无行（vg23=0、vg30=0、gmax 在 vg20 也 0 行）→「哪个游戏有哪些形态」只能人工 curated 配置。地区形态：-alola 20、-galar 20、-hisui 16、-paldea 4。
- **LA 图鉴**：LA 无法从外部传入宝可梦，图鉴内 242 species 均本作可获得，**无需删除**；问题只是默认展示普通形态（如卡蒂狗显示普通样子而非洗翠样子），需按图鉴做默认形态覆盖。
- **体型**：PokeAPI `pokemon_shapes.csv` 有 shape_id（1-14），`pokemon_shape_prose.csv` 无中文；14 种中文译名已核实（52poke 信息框 body 参数）：01 球形 02 蛇形 03 鱼形 04 双手形 05 柱形 06 双足兽形 07 双腿形 08 四足兽形 09 双翅形 10 触手形 11 组合形 12 人形 13 多翅形 14 虫形。
- **咖喱**：151 = 25 食材组 × 6 口味 + 1 创意咖喱；图片按命名规则前端拼（`curry_{组名} SWSH.png`，26 张全齐），`isGroupFirst` 门控导致 125/151 张卡不显示图。
- **相性/进度条**：相克表硬编码 `damage.py:15-44`（经 `/api/meta/typechart` 下发）；「超能力」方块溢出因 `.type-badge` 是 min-width 而非定宽（base.css:31）；进度条五档配色是 JS 内联（detail.js:373-379）。

---

## M0 数据层前置（一次管线重建，服务 M2/M5/M6）

### scripts/build_db.py
1. `FORM_SUFFIX_ZH["gmax"]`「极巨化」→「超极巨化」（build_db.py:77；修正剑盾形态标签 bug，`calc.py:136-138` 用 identifier 后缀判定不受影响）。
2. `species` 增 `shape_zh` 列：读 `pokemon_shapes.csv` 的 shape_id，14 种中文名内置字典（见上）。
3. learnsets **保留 level=0**：删除 build_db.py:365-367 的强制改 1，恢复「进化时学会」语义（全游戏受益，不只是朱紫）。注意检查排序/去重逻辑对 level=0 的兼容。
4. `get_methods` 增 `form` TEXT 列（默认空）。
5. 新表：
   - `abilities(ability_id INTEGER PK, name_zh TEXT, intro TEXT, effect TEXT, extra TEXT)`（extra 存多点列表 JSON 数组文本；按 name_zh 与 `forms.abilities` 中文逗号串 join）
   - `evo_branches(family_key TEXT, species_id INTEGER, form_suffix TEXT)`（form_suffix 空 = 普通形态；一个 family_key = 一条独立进化分支）
   - `dex_default_forms(dex_id TEXT, species_id INTEGER, form_id INTEGER, PK(dex_id,species_id))`
   - `form_game_availability(form_id INTEGER, game_id TEXT, PK(form_id,game_id))`

### scripts/scrape_52poke.py
6. 新增特性页抓取：全部特性名（PokeAPI `ability_names.csv` lang=12，约 310 个）→ `wiki_client` 批量 wikitext（一次 ≤50 标题）→ 解析：
   - effect = `==特性效果==` 节首个非标题非列表段（清理 `{{a|x}}/{{s|x}}/{{type|x}}/{{i|x}}`→x、`[[a|b]]`→b、`'''`、`<ref>`）
   - extra = 该节 `^\*\s*` 行列表
   - intro = `==特性说明==` 节取第九世代 zh-hans，无则取最后一世代
   - 结果写 `data/curated/abilities.json`，解析失败落 `TODO.json`（新键 `ability_parse_failed`）
7. `parse_get_methods` **保留带形态标记的行**（现 scrape_52poke.py:342 已解析出 form、:856 丢弃 → 不再丢弃），form 写入新列；`data/curated/encounters_52poke.json` 导出结构同步加 form。
8. 特性抓取注意：页面可能有 `===宝可梦不可思议迷宫系列===` 等子节（只取子节前的正文）、`{{game2|E}}` 等版本模板、`-{}-` 简繁标记。

### curated 新文件（人工整理，逐项对照 52poke 核实后入库）
9. `evo_branches.json`：地区形态分支进化链，约 35 族。喵喵示例：`{"52": [["","53"],["alola","53:alola"],["galar","863"]]}` 语义 = 普通喵喵→喵老大 / 阿罗拉喵喵→阿罗拉喵老大 / 伽勒尔喵喵→喵头目。需覆盖：阿罗拉系（六尾/穿山王/雷丘/嘎啦嘎啦/引梦貘人/臭臭泥/三地鼠/喵喵/椰蛋树等以 PokeAPI 实际 forms 为准）、伽勒尔系（大葱鸭/魔墙人偶/呆呆兽/双弹瓦斯/魔尼尼/蛇纹熊/达摩狒狒/哭哭面具/喵喵/小火马/海地鼠等）、洗翠系（卡蒂狗/火球鼠/木木枭/圈圈熊/霹雳电球/索罗亚/狃拉/千针鱼/黏美儿等）。分支条件文本同步补（PokeAPI 52→863 边 region 为空 → curated 里补「在伽勒尔地区」）。
10. `dex_default_forms.json`：`{dex_id: {species_id: form_suffix}}`，仅收录与默认形态不同的条目。要点：hisui 图鉴 16+ 洗翠形态种（卡蒂狗/九尾/霹雳电球/索罗亚/狃拉/千针鱼/黏美儿等——注意：御三家在 LA 是普通样子捕获、最终进化才是洗翠样子，基础形态不覆盖）；galar 图鉴的喵喵(52)/六尾(37)/呆呆兽(79)/小火马(77)/嘎啦嘎啦(105)/蛇纹熊(263)等显伽勒尔样子；kitakami 的月月熊(217)→血月样子；blueberry 图鉴内含的地区形态（对照 52poke 蓝碧基图鉴列表核对）；ioa/ct 图鉴逐项核对（阿罗拉形态在剑盾经铠岛 151 地鼠任务可获得，是否入 ioa/ct 图鉴以 52poke 为准）。
11. `form_game_availability.json`：`{"mega": {"bdsp": [identifiers…], "legends-za": [identifiers…含异次元DLC]}, "gmax": ["sword-shield"], "alola": ["sword-shield"], "galar": ["sword-shield"], "hisui": ["legends-arceus"], "paldea": ["scarlet-violet"], "primal": [], "special": {…}}`。BDSP 实际支持超级进化（名单保留），如需去掉可调配置。Z-A mega 名单对照 52poke「超级进化」页 + 异次元 DLC 核对。**特殊形态逐个归属**（不在后缀规则内的 PokeAPI forms）：血月月月熊→scarlet-violet；故勒顿/密勒顿骑乘形态（10264/10266/10268/10270）等非战斗载具形态→全游戏隐藏；索财灵宝箱形态→scarlet-violet；规则外形态默认显示。**一致性约束**：dex_default_forms 指定的覆盖形态必须同时出现在对应游戏的 availability 中（如 kitakami 月月熊=血月形态），build_db 校验并告警。
12. 重跑 `python scripts/build_db.py` + `python scripts/scrape_52poke.py`，`pytest tests/ -v` 全绿后 commit（`data: 特性文案/形态分支/图鉴默认形态/体型/进化招式语义——数据层前置`）。

---

## M1 已捕捉标记完全重制 + 同游戏同步（需求 1、2）

前端 `dex.js` / `dex.css` / `components.js`，后端 `dex.py`：

1. **卡片视觉**：删 `.dex-card.caught` 蒙底与绿点（dex.css:24-25）；已捕捉=精灵球红白填充、未捕捉=灰色描边，尺寸 18→24px 并加大点击热区（components.js PokeToggle / dex.css:32-34）；卡片底色边框与普通卡一致。
2. **批量操作重做**：「本筛选全标记/反选未捕捉」（dex.js:21-22）替换为「批量操作」下拉菜单：
   - 标记当前筛选 / 清除当前筛选标记 / 标记整本图鉴 / 清空整本图鉴
   - 每项先 `ElMessageBox.confirm`（已 import 未用，dex.js）并显示影响数量；删除 `invert`（dex.js:132-142）；`markAll`（dex.js:122-131）改造支持 caught=false。
3. **手动标记**：精灵球加大（见 1）+ 页头新增「标记模式」开关——开启后点击整卡直接切换捕捉（不触发 openDetail 跳转），关闭恢复浏览。
4. **同游戏双向同步**：`PUT /api/state`（dex.py:113-133）与 `POST /api/state/bulk`（dex.py:136-156）写入时按 `regional_dexes.game_id` + `dex_entries` 找出同游戏内所有含该 species 的 dex_id 一并 UPSERT（标记与取消标记都传播）；跨游戏不传播。
5. 新增 `GET /api/state/counts?profile=1`：一次返回全部图鉴的 caught/total，前端替换 dex.js:108-110 只覆盖已加载图鉴的 `recount()`，修复未访问 tab 计数恒 0。
6. 乐观更新失败回滚（现 toggle 无回滚，dex.js:114-121）。
7. 测试：test_api 增——标记传播断言（galar 标记 → isle-of-armor/crown-tundra 同 species 生效）、清除传播、counts 结构。

---

## M2 详情页重设计（需求 3.1–3.7）

前端 `detail.js` / `components.js` / `dex.css` / `base.css`，后端 `pokemon.py`：

1. **3.1 头部信息块**：
   - genus 删「宝可梦」硬拼（detail.js:41 `{{ d.species.genus_zh }}宝可梦` → 直接输出 genus_zh）。
   - 捕获率（`species.capture_rate`）、身高体重（`curForm.height/weight` ÷10）、击倒努力值（`ev-badges`）从特性 block 末尾（detail.js:68-74）上移进头部 meta 行；新增体型 chip（`species.shape_zh`）。
2. **3.2 特性展开**：`/api/pokemon` 的 `_abilities_of`（pokemon.py:50-53）join `abilities` 表输出 `{name, hidden, intro, effect, extra[]}`；`AbilityList`（components.js:115-123）重做为展开卡：intro + effect 内联展示，extra 多点列表放 el-collapse「详细介绍」下拉；abilities 表无数据的标「待补充」。**特性栏按当前游戏隐藏**：阿尔宙斯与传说 Z-A 无特性机制，当前游戏为两者时特性 block 整体不渲染（3.1 上移捕获率/身高体重/EV 后块内无其他内容；前端按 store.gameId 判定，API 不改）。
3. **3.3 属性相性栏**：
   - `.type-badge` 全局定宽约 78px（容纳三字属性+图标；base.css:31 min-width 改 width；技能列表/头部等处同步等长）。
   - `.eff-group` 改 flex 首行悬挂：`.eff-m`（倍率块，dex.css:107-111）固定左列不换行，属性方块容器独立 flex-wrap，换行永不与倍率块同列；防守面/攻击面统一。
   - 攻击面属性方块加 ⚔ 前缀标记（或专用描边样式）与防守面区分。
4. **3.4 进度条统一单色**：删 detail.js:373-379 阈值配色，统一一个强调色（建议现有 `#5a9be0`）。
5. **3.5 进化链按形态**：
   - `/api/pokemon` 增 form 参数（当前选中形态的 identifier 后缀）。
   - `_evolution_chain`（pokemon.py:132-176）读 `evo_branches`：物种存在分支时只渲染选中形态所属 family（节点名/图/属性按对应 form 的 `forms` 行取，不再一律 `is_default=1`，pokemon.py:163-165）；无 curated 分支的走现状。
   - 条件文本：分支条件优先取 curated（如「在伽勒尔地区」），再走 `_evo_condition`。
   - 获取方式按所选形态过滤：`get_methods.form` 为空 = 通用行恒显示，非空 = 与选中形态 suffix 匹配才显示——普通喵喵不再显示喵头目的获取行。
6. **3.6 形态名**：
   - 默认形态不显示任何文字与「（默认）」：删 detail.js:21 拼接；`formDisplayName`（components.js:107-112）删英文 identifier 兜底（:111），未翻译的形态 label 落 TODO 补 `FORM_LABEL_ZH`。
   - 形态条（detail.js:17-23）默认形态无 chip；选中非默认形态后显示「还原」按钮回到默认（或点选中的 chip 取消选择）。
7. **3.7 形态按游戏过滤**：`/api/pokemon` 返回 forms 前按 `form_game_availability` 过滤（pokemon.py:187-188 现在全量返回）——剑盾只显 galar 形态与超极巨化、BDSP/Z-A 显各自 mega 名单、SV 只显 paldea 系、LA 只显 hisui 系、primal 全隐藏；配合 M0 第 1 条修正「超极巨化」标签。
8. 测试：test_api 增——abilities 字段、喵喵进化链分支（52 普通 → 不含 863；galar → 863）、forms 按游戏过滤（剑盾无 mega、Z-A 无 gmax）。

---

## M3 努力值页（需求 4）

`ev.js`（全文件 71 行重排）+ `lookup.py`（/api/ev，lookup.py:32-59）：

1. `/api/ev` 增 `locations` 字段：join `get_methods`，method ∈ 野生白名单（可见 / 随机 / 垂钓 / 冲浪 / 成群出现 / 大量出现 等；实现时先 `SELECT method, COUNT(*)` 按各作核定白名单，白名单外的野生类值落 TODO 复核，排除 打坑/定点/交换/赠送/活动/团体战/「本作中不存在」）；`version_label` 剑/盾/朱/紫独占的标版本 chip（共用「剑/盾」不标），**DLC 行以「扩展票 / 零之秘宝 / 异次元」chip 标注**（version_label 已含这些字样）；地点行与 M5 的覆盖形态做 form 匹配（form 为空的通用行恒显，非空行匹配当前默认/覆盖形态）；无自然出现留空数组。
2. 布局：表格高度改 flex 撑满主区（去掉 `calc(100vh - 220px)` 空挡，ev.js:22；`.main` 底 padding 40px 一并处理）；列宽重排——宝可梦列定宽（现 min-width:150 吃掉全部剩余宽度是空隙根因），新增「野外地点」列吃剩余宽度（多条换行、超 3 条折叠「+N」+ tooltip 展开全量）。
3. 测试：test_ev_filter 增 locations 字段与版本标签断言。

---

## M4 咖喱图补齐（需求 5）

`curry.js`：去掉 `isGroupFirst` 门控（curry.js:51-61），151 张卡全部渲染所属组共享图 `curry_{组名} SWSH.png`（26 张图复用——52poke 即同种料理不同口味共享一图），`onerror` 隐藏兜底保持；组名正则剥前缀逻辑不变。

---

## M5 图鉴默认形态（需求 6）

`dex.py` / `lookup.py` / `detail.js`：

1. 结论先行：LA 无法外部传入宝可梦，hisui 图鉴 species **不删**；改默认展示形态。
2. 列表卡片 `/api/dex/{dex_id}`（dex.py:61-65 的 `is_default=1` 取 form）与 `/api/ev`（lookup.py `_game_dex_species` + `f.is_default=1`）改为 LEFT JOIN `dex_default_forms` 优先——LA 有洗翠形态的种（卡蒂狗等 16+）显洗翠样子（属性/图/努力值同步为该形态）；剑盾 galar 图鉴显伽勒尔样子；kitakami 月月熊显血月样子。
3. 详情页按 game/dex 上下文（hash 参数已有 `?game=&dex=`）默认选中覆盖形态（detail.js:432 现默认 is_default）。
4. 测试：test_db 增 dex_default_forms 覆盖断言（hisui 图鉴洗翠形态种全命中；galar 52=伽勒尔）。

---

## M6 朱紫招式（需求 7）

`build_db.py`（M0 已保留 level=0）/ `pokemon.py` / `detail.js`：

1. `GAME_MOVE_CONFIG`（pokemon.py:14-29）scarlet-violet tabs 增 `("evolution-recall","进化&回忆")`，顺序：升级 / 进化&回忆 / 招式学习器 / 蛋招式。
2. 分组逻辑（pokemon.py:331-342）：level=0 行 + tutor 回忆行（现 `RECALL_AS_LEVEL_GAMES` 并组逻辑替换）路由到 `evolution-recall` 组；其他游戏 level=0 行在升级 tab 置顶、显「进化」徽章（不再假 Lv.1）。
3. 前端 detail.js:169-225 渲染新 tab（「进化」「回忆」徽章样式沿用 mastery span）。
4. 测试：test_api.py:62-65 SV tabs 断言更新为含 evolution-recall；1009 大晴天/磨爪断言移到新 tab；补一条 SwSh level=0 招式显「进化」的断言。

---

## M7 食谱/树果数量选择（需求 8、9）

`sandwiches.js` / `donuts.js` / `lookup.py` / `db.py`：

1. `custom_recipes` 的 ingredients/seasonings 存 `[{name, count}]` JSON 数组；`_parse_items`（lookup.py:182-191）扩展兼容三格式：新 `[{name,count}]` / 旧字符串数组 / 旧顿号文本（后两者 count=1）。
2. 编辑器（sandwiches.js:167 起、donuts.js:139-145）：el-select 选入后生成行，每行 `el-input-number` 数量步进器（min 1）+ 删除按钮，显示「生菜 ×2」；风味预览（donuts.js:213-234 五维求和）按 count 加权。
3. 校验（lookup.py:240-244）：Z-A 树果总数改 `3 <= Σcount <= 8`；SV 保持 ingredients+seasonings 非空。
4. 测试：test_custom_recipes 增数量写入、旧格式读取兼容、Z-A 总数校验断言。

---

## M8 全量代码审查、测试流程固化与文档重构（最终里程碑，M0–M7 与 CALC 计划全部落地后执行）

### 8.1 全量代码审查

- **范围**：`app/`（routers/dex|pokemon|lookup|calc、services/damage|breeding、db、main）、`scripts/`（build_db、scrape_52poke、wiki_client、pokemondb_client、fetch_sprites、fetch_feature_images、fetch_sandwich_images、make_icon）、`tests/`、`tools/calib/`、`app/static/dist/`（js 全部视图与组件 + css 四件套）。
- **方式**：引入 `ruff`（Python 静态检查，零告警基线）+ `node --check`（前端免构建 JS 语法兜底）+ 人工模块审查清单（逐项打勾，报告落档）。
- **审查维度清单**：
  1. API 输入校验与错误处理（400 语义完整、类型/枚举边界、异常不裸抛）；
  2. SQL 全参数化、连接管理（static_conn 只读 URI / state_conn 懒建事务）、N+1 查询；
  3. 前端竞态（loadMoves 类异步回填、防抖）、事件泄漏（hashchange/全局监听解绑）、XSS 面（模板字符串插值必须纯文本，禁 v-html 注入外部数据）；
  4. 死代码与未用导入清理（如 CALC_OPTS.item_type 类）、缓存上限（52poke 缓存、前端 store）；
  5. 性能点：全量道具/特性下拉渲染、recalcAll 批量化落地情况、列表页 counts 一次性拉取；
  6. 命名/注释/风格与 AGENTS.md 约定一致性；curated 护栏（min 行数校验）覆盖所有合并入表的数据。
- **产出**：审查发现按 P0（计算/数据错误）/ P1（用户可见缺陷）/ P2（质量）分级，逐项修复并回归，记录风格延续 SELF-ITERATION.md 的三轮审查格式。

### 8.2 测试流程固化（长效规范，写入 ARCHITECTURE）

- **分层要求**：①数据完整性测试（test_db：行数护栏、新表覆盖率断言）；②API 集成测试（test_api：每新增/修改端点必须带正反用例）；③纯函数测试（test_damage/test_breeding）；④**公式改动铁律**：必须扩 `tools/calib` 案例并重跑 `node harness.mjs → python check.py` 逐 roll 全绿；⑤数据管线回归：按 `build_db → scrape_52poke → fetch_*` 顺序重建后跑 pytest。
- **收敛**：新增 `tests/conftest.py` 统一 sys.path 注入与 DB 存在性 skipif fixture（消除各测试文件头部重复）。
- **最终回归 checklist（固化顺序执行）**：
  1. 重建管线并跑 `pytest tests/ -v` 全绿；
  2. `tools/calib` 全绿；
  3. `python -m app.main` 逐页冒烟：图鉴标记/批量/同步、详情页 3.1–3.7 各栏、EV 页布局与地点列、咖喱全图、三明治/甜甜圈数量、计算器标记点灯/单双打/KO 文案/Z 纯晶锁定；
  4. `./build_exe.bat` 打包，release 目录离线冒烟（exe 直启 + 数据完整性）。
- 里程碑级验收：每个 M 的测试要求已在各节列出，M8 汇总复核无遗漏。

### 8.3 文档重构（合并为 `docs/ARCHITECTURE.md`）

- **来源与去向**：

| 现有文档 | 内容 | 去向 |
|---|---|---|
| DESIGN.md（191 行） | 技术栈/管线/Schema/API/计算器/前端架构/取舍（现行设计） | ARCHITECTURE 正文 §1–§6；§8 变更历史并入 §10 |
| PLAN.md（313 行） | 四期迭代规划（已完成）+ **代码编写规范**（仍生效）+ 历史需求存档 | 规范 → §8；里程碑与存档 → §10 变更历史 |
| SELF-ITERATION.md（95 行） | 三轮自我审查记录（26 项修复等） | §10 变更历史（压缩为里程碑表，保留 P0 教训要点） |
| UPDATE-PLAN.md / CALC-UPDATE-PLAN.md | 本两份计划的设计决策（机制归属、进化分支模型、形态可用性、同步策略、近似项清零判定等） | 决策内容 → §7 设计决策记录（含理由与对应里程碑）；**实施并复核后整档删除** |
| DATA-GAPS.md | 缺口总账 | 按 8.3 重写规则原地更新（不并入） |

- **ARCHITECTURE.md 章节骨架**：§1 技术栈与架构 → §2 数据管线与数据源 → §3 数据库 Schema → §4 API 设计（全部现行端点）→ §5 伤害计算器 → §6 前端架构 → §7 设计决策记录（为什么这么做，两份计划沉淀）→ §8 代码与测试规范（原 PLAN §五 + M8.2 流程）→ §9 Roadmap（未完成项：PLAN 未竟需求、计划中标注「明确不做/实现时定」的条目）→ §10 变更历史（各期迭代 + 三轮审查 + 本次九项与计算器更新）。
- **DATA-GAPS.md 重写规则**：逐项按实施后现状核对——**移除已核对无缺失项**：§3 朱紫 TM（229/229 已补）、§4 BDSP（151/151 全覆盖）、§5 咖喱图（M4 后全图）、§8 近似项表（CALC 后已建模，保留一句指向 ARCHITECTURE §7）、§10 进化条件（evo_branches 落地后改写）；**保留并按三档重组**：①无源待补（Z-A TM 获取 117/160、Z-A zadex 20 种、mastery 大面积缺失）②人工 curated 已知账（form_flavor 276 段、mega 名单与 dex 默认形态的核对边界）③明确取舍（缺图 4 张、星晶相性以 smogon 对拍、乱流无修正）。
- **删除文件清单**（git 历史可溯）：PLAN.md、DESIGN.md、SELF-ITERATION.md、UPDATE-PLAN.md、CALC-UPDATE-PLAN.md；**AGENTS.md 同步**：架构要点段改指 ARCHITECTURE.md，文档清单更新。

### 8.4 commit 划分

`fix/refactor: 全量审查修复（P0/P1/P2 分级）` → `test: conftest 收敛与测试流程固化` → `docs: DESIGN/PLAN/SELF-ITERATION/两计划合并为 ARCHITECTURE，DATA-GAPS 按现状重写，AGENTS 同步`。不 push。

---

## 收尾与验证

- **commit 划分**：M0 `data:` → M1 `feat:` → M2 `feat:` → M3 `feat:` → M4 `fix:` → M5 `feat:` → M6 `feat:` → M7 `feat:` → M8（审查/测试/文档重构，见 8.4），每里程碑一次，不 push。
- **文档同步**（里程碑过程中的即时更新，M8 统一收敛归档）：`docs/DESIGN.md`（新表 schema/API 参数/进化分支模型/形态可用性配置）、`docs/DATA-GAPS.md`（特性抓取覆盖情况、野生白名单核定结果、mega 名单来源、咖喱共享图注记）、`docs/USER-MANUAL.md`（标记模式/批量操作/同游戏同步/数量选择/进化&回忆 tab）。
- **最终验证**：按 M8.2 回归 checklist 执行（重建管线 → pytest 全绿 → calib 全绿 → 逐页冒烟 → 打包离线冒烟）。
- **风险与说明**：
  - evo_branches / mega 名单 / dex 默认形态三份 curated 工作量最大，需逐项对照 52poke，宁缺勿错——有疑问的条目先落 TODO.json 缓存页面，后续补录。
  - M1 同步会让既有 caught 数据语义变化（同游戏各图鉴将随下次标记操作对齐）；不主动迁移旧数据。
  - BDSP 有超级进化（如 Mega 烈咬陆鲨），故 mega 名单保留 BDSP 分组；若用户不需要可改 `form_game_availability.json`。
  - 阿罗拉形态在剑盾的可用性（铠岛 151 地鼠任务奖励）以 52poke 各图鉴页核对结果为准，配置驱动可随时调整。
