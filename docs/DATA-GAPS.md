# DATA-GAPS —— 数据完整性说明

> 依据「信息完全校验」要求：抓取/计算无法完全覆盖的数据在此逐项说明。
> 前端对缺失数据一律显示「待补充」，绝不编造。重建数据后请重读本文件核对是否已过期。
> 五期后按三档重组：**①无源待补 ②人工 curated 已知账 ③明确取舍**。
> 计算器近似项已全部建模（见 ARCHITECTURE §5/§7），本章不再维护近似表。

## 一、无源待补（源站未写/官方未建模）

### 1. Z-A 招式学习器获取方式（43 / 160）

- TM001-107 编号与招式映射来自 PokeAPI machines vg30；vg31（异次元 DLC）= TM108-160 已导入。
- 获取地点：42 条自 pokemondb 人工翻译（`tm_locations_za_pokemondb.json`）+ 52poke 1 条 = 43 条。
- 其余 117 个 TM 两站均未整理 → 显示「获取方式待补充」。

### 2. Z-A 图鉴介绍（缺 20 种）与精通等级

- zadex 缺 20 种（凯路迪欧/美洛耶塔/彩粉蝶/花蓓蓓系/超能妙喵/坚盾剑怪/基格尔德/胡帕/谜拟丘/玛机雅娜/
  颤弦蝾螈/爱管侍/莫鲁贝可/怒鹦哥/米立龙/索财灵等）→ 显示「待补充」。
- 精通等级（mastery）仅 52poke 主源提供（656/2209 行），PokemonDB 不提供；两源表现一致。

### 3. 特性文案（310 / 374）

- `abilities.json` 已抓 310 个特性页（特性效果 + 特性说明第九世代优先）。
- 失败 64 项落 `TODO.json` `ability_parse_failed`：多数为 PokeAPI 新增而 52poke 尚无页面的条目
  （eelevate/fire-mane 等 Champions 数据），少量译名代差页 → 详情页显示「待补充」。
- 特例：波导防护（aura-guard，路卡利欧Ｚ专属）52poke 有页而 PokeAPI 无简中名，
  已在 build_db 直填译名入库（ability intro 仍待补）。

### 4. ✅ 形态独立图鉴介绍未挂靠段（原 276 段，2026-10-03 已全部解决）

- 根因：PokeAPI 新建模把纯外观形态（四季/花色/字母/花纹/命名蛋糕/东西海/真赝品等 228 行）
  只存于 `pokemon_forms.csv`（pokemon_id 指回基础行），build_db 只按 `pokemon.csv` 建形态行 →
  形态行缺失 + 基础行 label 被兄弟形态覆盖（四季鹿→winter 之类）。
- U19 修复：build_db 按 `pokemon_forms` 补建（合成行 id=900000+forms_id，属性/种族值/特性继承基础行；
  form_meta 改取 is_default 行）；52poke FORM_MARKERS 补齐全部中文形态名→后缀映射（276 段清零）；
  形态中文标签来自 PokeAPI 官方中文名 + curated 公式映射（花叶蒂=红花、未知图腾=Ａ 字形、
  霜奶仙=香草奶油草莓等），52poke 无中文名者少量保留英文标识。
- 配套：fetch_sprites 对 900000 段还原精灵图源 id；`web` 端 FORM_MARKER_TO_SUFFIX 三级解析不变。

### 5. 道具图标（缺 ~820）

- PokeAPI sprites 仓库不含 TM/HM 系列、GO/Let's Go/传说系杂项道具图。
- 2026-10-03 起兜底扩展：TM/TR 走 52poke 属性圆盘（`Bag_TM_{属性}_{世代}_Sprite.png`，同号跨作取最新盘），
  其余道具用 `Bag_{中文名} Sprite`（含 ZA 后缀变体）逐个试（净增 534 张，覆盖 1385/2207）；
  仍缺清单落 `data/curated/item_icons_missing.txt`（GO/LGPE 杂项等两站均无图）。
- 前端 `onerror` 隐藏图标兜底，不阻塞选择。

### 6. 精灵图缺 229 张（新补建的外观形态，待网络恢复）

- U19 形态补齐新增 228+ 外观形态行（四季/花色/字母/花纹/蛋糕等），官方绘图源
  raw.githubusercontent.com 当日不可达（环境代理），`python scripts/fetch_sprites.py` 重跑即可补齐
  （脚本已按 900000 段还原精灵图源 id）。缺图时前端三级回退 + 隐藏兜底。

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
- Z 招式泛用 18 + 专属 22 来自 52poke「Ｚ招式」页（`build_z_moves.py` **重跑会冲掉 caps 脏行等手工修复，
  curated 修复后勿盲目重跑**——合并保留逻辑见 plans/ROADMAP.md RM-17），
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
| 宝可梦缺图 4 张 | 故勒顿/密勒顿骑乘形态（10264/10266/10268/10270）三级源均无；且已按「非战斗载具形态」全游戏隐藏 |
| 咖喱小/中/大份图 | 未入库（信息重复）；151 卡全部显示组共享成品图（M4 后无缺图） |
| 计算器每回合削血 | 剧毒/灼伤/盐淹每回合削血不进 KO 卷积（进场类一次性先扣）；UI 注明 |
| 星晶相性 | 以 smogon 对拍为口径；星晶「每属性限一次」按当次为首次处理（单次计算） |
| 计算器威力表 | 固定/变动威力招（power NULL）保留手动威力输入；重量/HP 类不自动 |
| 进化条件 required_pokemon_form_id（81 行） | 种类级表已隐含（分支链渲染表达同一信息） |
| 朱紫 TM 获取 | 229/229（31 个「招式机器 LP+素材制作」标注源自 wiki item9 字段） |
| BDSP 图鉴 | 151/151（original-sinnoh）；描述分 bddex/spdex/bdspdex 三字段全量入库 |
