# DATA-GAPS —— 数据完整性说明

> 依据「信息完全校验」要求：抓取/计算无法完全覆盖的数据在此逐项说明。
> 前端对缺失数据一律显示「待补充」，绝不编造。重建数据后请重读本文件核对是否已过期。
> 五期后按三档重组：**①无源待补 ②人工 curated 已知账 ③明确取舍**。
> 计算器近似项已全部建模（见 ARCHITECTURE §5/§7），本章不再维护近似表。

## 一、无源待补（源站未写/官方未建模）

### 1. ✅ Z-A 招式学习器获取方式（原 43 / 160，2026-10-31 已全部收口）

- TM001-107 编号与招式映射来自 PokeAPI machines vg30；vg31（异次元 DLC）= TM108-160 已导入。
- 获取地点：原仅 43 条（42 条 pokemondb 人工翻译 + 52poke 1 条）。
- **2026-10-31 重抓收口**：52poke 已补齐 Z-A 地点表，重跑后 tm_how vg30 = **160/160 全量真实地点**（零占位、
  零「待补充」），curated 的 pokemondb 43 条转为兜底不再新增。

### 2. Z-A 图鉴介绍（原缺 20 种，2026-10-31 大幅收口）与精通等级

- **2026-10-31 重抓**：52poke 已为原缺物种补写 Z-A 文本（按形态标记段），重跑后
  dex_flavor(legends-za) 344→345（玛机雅娜基础段收口），其余 17 种的文本以**形态段**挂靠 form_flavor
  （如 凯路迪欧=平常/觉悟、基格尔德=50%/10%/完全体、怒鹦哥=四羽毛）；图鉴/详情按所选形态展示。
- 基础段（默认形态行）仍缺 19 种——源站该段只写了形态行，非解析缺口；**2026-11-01 起详情页
  自动回退展示形态段并标注形态名**（RM-24；图鉴列表不回退），连形态段也没有时才标「待补充」。
- FORM_MARKERS 新增/修正：玛机雅娜四标记（现在的颜色/５００年前的颜色 × 超级进化）改挂
  ""/original/mega/original-mega——旧值 "eternal" 对 801 的 forms 后缀永不命中（死键，静默丢弃）。
- 精通等级（mastery）仅 52poke 主源提供（656/2209 行），PokemonDB 不提供；两源表现一致。

### 3. ✅ 特性文案（2026-10-31 全量收口）

- 原 310 页 / 64 项解析失败；2026-10-31 重抓后 abilities 表 312 行、**effect 312/312 全覆盖、
  TODO ability_parse_failed = 0**（52poke 已补页 + 解析器对缺「特性效果」标题的页回退用官方说明文本，
  同源不编造）。

### 4. ✅ 形态独立图鉴介绍未挂靠段（原 276 段，2026-10-03 已全部解决）

- 根因：PokeAPI 新建模把纯外观形态（四季/花色/字母/花纹/命名蛋糕/东西海/真赝品等 228 行）
  只存于 `pokemon_forms.csv`（pokemon_id 指回基础行），build_db 只按 `pokemon.csv` 建形态行 →
  形态行缺失 + 基础行 label 被兄弟形态覆盖（四季鹿→winter 之类）。
- U19 修复：build_db 按 `pokemon_forms` 补建（合成行 id=900000+forms_id，属性/种族值/特性继承基础行；
  form_meta 改取 is_default 行）；52poke FORM_MARKERS 补齐全部中文形态名→后缀映射（276 段清零）；
  形态中文标签来自 PokeAPI 官方中文名 + curated 公式映射（花叶蒂=红花、未知图腾=Ａ 字形、
  霜奶仙=香草奶油草莓等），52poke 无中文名者少量保留英文标识。
- 配套：fetch_sprites 对 900000 段还原精灵图源 id；`web` 端 FORM_MARKER_TO_SUFFIX 三级解析不变。

### 5. 道具图标（原缺 ~700，2026-10-31 收口至 19）

- PokeAPI sprites 仓库不含 TM/HM 系列、GO/Let's Go/传说系杂项道具图。
- 2026-10-03 兜底扩展：TM/TR 走 52poke 属性圆盘（`Bag_TM_{属性}_{世代}_Sprite.png`，同号跨作取最新盘），
  其余道具用 `Bag_{中文名} Sprite`（含 ZA 后缀变体）逐个试（净增 534 张）。
- 2026-10-17 再扩展（`fetch_calc_assets.py` 增 `Bag_{中文名} SV Sprite` 候选 +
  `fetch_sprites_52poke.py` 二次兜底）：再恢复 121 张（机变骰子/拳击手套/密探斗篷等朱紫对战道具全补齐），
  覆盖 1506/2207；**mega 石与对战实用道具零缺失**。
- **2026-10-31 重跑收口**：PokeAPI sprites 仓库已上架 GO/LGPE 杂项图标，重跑 `fetch_calc_assets.py`
  净恢复 682 张，缺口 701 → **19**；剩余均为活动限定/衍生小物件（academy 球/杯、双打 Sisters 极巨结晶、
  苹哇果汁/牙牙鳞片/椰蛋糖/运动球等），PokeAPI/52poke 均无独立图标，清单落
  `data/curated/item_icons_missing.txt`；前端 `onerror` 隐藏图标兜底，不阻塞选择。

### 6. ✅ 精灵图缺口（原缺 229，2026-10-17 收口至个位数）

- U19 补建的 229 张外观形态图缺口：PokeAPI 源恢复后 `fetch_sprites.py` 重跑补回 151 张；
- 残余 74 张（PokeAPI 无图：霜奶仙 62 形态、性别差异、古董茶具、骑乘形态、绅士蛾-垃圾蓑衣）
  由 `fetch_sprites_52poke.py` 按 52poke File 标题兜底（性别差异/古董茶具/骑乘用 curated 标题映射
  `FORM_TITLES`，霜奶仙按 奶油×糖饰 命名规则程序化派生——2026-10-17 修复漏连字符后重跑补齐）；
  骑乘 4 张中 2 张为梦境世界绘图替代（官方无战斗图，`FORM_TITLES` 注明）。
- 命中映射持久化 `data/curated/sprite_overrides_52poke.json`（重跑幂等）；仍失败项落
  `TODO.json` `sprite_52poke_failed`，不静默丢弃。
- 残余：绅士蛾-垃圾蓑衣（mothim-trash）52poke 无独立图（PokeAPI/Bulbagarden 亦无）→ 前端隐藏兜底。

### 7. ✅ 抓取文案繁简混排（2026-10-29 登记，2026-10-31 已解决）

- 部分特性文案/获取方式地点为繁体中文（如「通過在腳下張開青草场地…寶可夢」「挑戰海灘」
  「歐鼬鎮愛奧尼亚酒店」）：源头 52poke 部分页面/表格单元格本身是繁体；API `variant` 参数
  对 `rvprop=content` 无效（探针实测）。
- **2026-10-31 解决**：`wiki_client.py` 写缓存前做 OpenCC t2s（`opencc-python-reimplemented`，
  requirements.txt 登记）；缓存键 `.zhcn` 与旧繁体缓存隔离，全量重抓（1880 页）后
  abilities/get_methods/tm_how 等全部表繁体清零。连带的解析器键位修复已编入脚本：
  build_z_moves `POKEMON_COL_MAP` 补「守护神」简体键（22 行护栏恢复）、
  scrape `FORM_MARKERS` 补简体「颜色」系列标记。
- 影响面：全部 wikitext 来源文本（特性/图鉴/获取方式/TM/三明治等），以后重跑自动保持简体。

## 二、人工 curated 已知账

### 1. Z-A 学习集（已全覆盖 364/364）

- 52poke 主源 2209 行（TM 编号经 machines 交叉校验修 12 处错位）+ PokemonDB 兜底 14411 行（按形态挂靠）。
- PokeAPI vg32 是 Pokémon Champions 数据，勿导入。

### 2. 形态×游戏可用性 / mega 名单 / 图鉴默认形态

- `form_game_availability.json` 由 52poke 获得方式模板的形态标记行（A/G/H/P/GM 等 18 种标记）逐作核实；
  BDSP 实证**无**超级进化与地区形态（计划文档原判有误，以数据为准）。
- mega 名单 = Z-A 图鉴（密阿雷 + 超空间）成员派生（87 种），primal 归 Z-A，gmax 归剑盾。
- `dex_default_forms` 为自动派生 + `dex_default_forms.json` 人工增补；御三家基础形态不覆盖
  （LA 中以普通样子捕获）。可随时改配置重建。

### 3. 地区形态分支进化链（29 族）

- `evo_branches.json` 人工整理；条件文本按分支后缀自动补「在{地区}地区」。
- 未收录家族走种类级进化树（现状渲染）。

### 4. 风味力量 / Z 招式表

- 风味力量为人工整理（wiki rowspan 布局不规则勿程序化解析）。
- Z 招式泛用 18 + 专属 22 来自 52poke「Ｚ招式」页（`build_z_moves.py` 可重跑——caps 脏行等人工修复
  已编入脚本 `POKEMON_COL_MAP`/`NOTE_APPEND`，重跑幂等；再有人工修复须同样编入脚本，勿只手改 JSON），
  威力与 smogon data 对拍（zTable 41 项全绿）。

### 5. mega-z（Z-A 异次元超进化）数据修正账

- `garchomp-mega-z`/`absol-mega-z`/`lucario-mega-z`（10307/10309/10310）曾按 PokeAPI 脏数据过滤，
  2026-10-03 核实种族值/属性为真实数据后入库（限定 legends-za，走 mega 名单）。
- PokeAPI 两处缺漏已在 build_db 直填（对照 52poke 核实）：烈咬陆鲨Ｚ缺第二属性「地面」、
  波导防护（314）无简中名。
- Z-A 新超进化石 45 颗 PokeAPI 有 items 行无译名 → `ITEM_ZH_CURATED` 直填
  （中文名逐一对照 52poke 道具页）。盖欧卡/固拉多原始回归用宝珠、烈空坐需画龙点睛，无进化石属正常。
- 战斗形态（超级进化/原始回归等）无专属学习集 → 招式表回落默认形态（前端 pokemonMoves 回退逻辑）。

## 三、明确取舍

| 项 | 处理 |
|---|---|
| ~~宝可梦缺图 4 张~~ | ✅ 2026-10-17 已由 52poke 兜底补齐（`fetch_sprites_52poke.py`；故勒顿/密勒顿骑乘形态其中 2 张为梦境世界绘图替代）；「非战斗载具形态」全游戏隐藏的取舍不变 |
| 咖喱小/中/大份图 | 未入库（信息重复）；151 卡全部显示组共享成品图（M4 后无缺图） |
| 计算器每回合削血 | 剧毒/灼伤/盐淹每回合削血不进 KO 卷积（进场类一次性先扣）；UI 注明 |
| 星晶相性 | 以 smogon 对拍为口径；星晶「每属性限一次」按当次为首次处理（单次计算） |
| 计算器威力表 | 固定/变动威力招（power NULL）保留手动威力输入；重量/HP 类不自动 |
| 进化条件 required_pokemon_form_id（81 行） | 种类级表已隐含（分支链渲染表达同一信息） |
| 朱紫 TM 获取 | 229/229（31 个「招式机器 LP+素材制作」标注源自 wiki item9 字段） |
| BDSP 图鉴 | 151/151（original-sinnoh）；描述分 bddex/spdex/bdspdex 三字段全量入库 |
