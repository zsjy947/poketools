# 三期升级设计：按游戏入口重构 / 图鉴增强 / 特化功能 / 计算器增强

> 需求来源：`docs/PLAN.md`「修改方向」。一期见 `DESIGN-PHASE1.md`，二期见 `DESIGN-DAMAGE-CALC.md`。
> 本文记录三期架构决策与数据源验证结论，验收记录见文末。

## 1. 功能矩阵（按游戏入口）

功能不再按工具平铺，而是「游戏 → 该游戏的功能」；伤害计算器为全局功能。

| 游戏 id | 名称 | 图鉴 | 努力值 | 特化功能 |
|---|---|---|---|---|
| sword-shield | 剑／盾 | 伽勒尔/铠岛/王冠雪原 | ✓ | 咖喱饭图鉴 |
| brilliant-diamond-shining-pearl | 晶灿钻石／明亮珍珠 | 神奥（210，新增） | ✓ | — |
| legends-arceus | 传说 阿尔宙斯 | 洗翠 | ✓ | — |
| scarlet-violet | 朱／紫 | 帕底亚/北上乡/蓝莓 | ✓ | 三明治食谱（含自由录入 + 食材调味料表） |
| legends-za | 传说 Z-A | 密阿雷市/超空间 | ✓ | 甜甜圈工房（特殊配方 + 自由录入 + 树果效果 + 风味力量） |

不提供全国图鉴。特化功能按内容命名入口（不叫「其他功能」）。

## 2. 数据源验证结论（三期新增）

| 数据 | 来源 | 结论 |
|---|---|---|
| BDSP 图鉴 | PokeAPI pokedex `extended-sinnoh`（210 只，编号同白金） | vg=23 |
| BDSP TM | PokeAPI machines 仅 17 条（严重不全）→ 由 52poke TMtable `movebdsp/locbdsp` 键补全 TM001-100 | 100 条 |
| BDSP 图鉴描述 | 52poke `{{图鉴}}` 的 `bdspdex` 字段（338 种），缺失标「待补充」 | — |
| BDSP 捕捉方式 | 52poke `{{获得方式/main}}` gen=8 code=`BDSP/BD/SP` | — |
| Z-A 学习集 | **PokeAPI 缺失**（vg32 实为 Pokémon Champions 的 train 数据，vg30/31 无 pokemon_moves）→ 抓 52poke `{种类}/第九世代招式表` 子页，解析 `learnlist/level/za` 与 `learnlist/tm/za` | Z-A 有 TM001-107 |
| 版本独占/DLC 标签 | `获得方式/main` 游戏代码：`SW/SH/SWSH/SWE/SHE/SWSHE`、`S/V/SV/ST/VT/SVT`、`BD/SP/BDSP`、`ZA/ZAM` | ZAM=Z-A 异次元 |
| SV TM 去重补漏 | machines vg26/27 与 vg25 同号同招式（显示重复）；tm_how vg25 缺 31 条 → 统一只用 vg25 编号，52poke loc9/item9 补全 | — |
| 三明治食材/调味料 | `食材`页（名称+描述）、`野餐道具`页（调味料表含获取地点+价格）、各食材道具页 `道具地点` 模板（获取方式） | — |
| 甜甜圈 | `甜甜圈`页：制作（6 基础口味 0→★5）、特殊配方表（风味数值/食材/风味力量/失控超级进化宝可梦/扭洞位置）、树果提供的效果表、风味力量表 | 风味力量为多行合并表格，解析脆弱部分人工整理进 curated |
| 咖喱饭 | `咖喱饭`页（原题「咖喱饭」）咖喱图鉴表（编号/名字/关键食材/介绍，含 rowspan 合并）+ 等级与奖励效果 | — |
| 进化链 | species.evolves_from 递归 + 52poke `{{进化框}}` 模板的条件（evotype/level/stone） | 分支家族（伊布等）显示为分支列表 |

## 3. 数据库 schema v2（data/poketools.db）

- `games`：新增 `features TEXT`（JSON 数组，如 `["dex","ev","sandwich"]`）；新增 BDSP 行。
- `regional_dexes/dex_entries`：新增 `sinnoh`（神奥图鉴，game=bdsp）。
- `get_methods`：**新增 `version_label`**（剑／剑·扩展票／朱／朱／紫·零之秘宝／晶灿钻石…／Z-A·异次元 等）。
- `learnsets`：**新增 `mastery INTEGER`**（Z-A 精通等级）；Z-A 学习集写入 vg=30（method=level-up/machine，来自 52poke）；BDSP 学习集写入 vg=23（PokeAPI）。
- `machines`：BDSP 补全（52poke）；SV 只保留 vg25；Z-A 用 vg30。
- `forms`：**新增 `hidden_abilities TEXT`**（隐藏特性名单，逗号分隔；`abilities` 仍为全量逗号串）。
- 新表：
  - `picnic_items(name, kind, desc, how, price)` — 三明治食材+调味料（含获取方式）
  - `donut_types(flavor, name, desc)` — 6 种基础甜甜圈
  - `special_donuts(name, desc, sweet, spicy, sour, bitter, fresh, ingredients, power, target, rift, location)` — 特殊甜甜圈
  - `berries(name, sweet, spicy, sour, bitter, fresh, boost, energy)` — 树果（Z-A 甜甜圈用效果表）
  - `flavor_powers(flavor, power, effect, lv1, lv2, lv3, prefix)` — 风味力量说明
  - `curries(no, name, key_ingredient, desc)` — 咖喱图鉴（编号含口味变体）
  - `tm_how` 扩展到 vg23/30；`move_meta` 不需要（priority 已在 moves 表）。

`data/userstate.db` 新增 `custom_recipes(profile_id, game, name, effects, ingredients, seasonings, created_at)`（三明治/甜甜圈自由录入，按档案隔离）。

## 4. API 变更（app/routers）

- `GET /api/games` → 附 `features`、`version_options`（本体/DLC/独占标签的展示顺序）。
- `GET /api/pokemon/{id}?game=` → **按当前游戏裁剪**：图鉴描述/获取方式（带 version_label 分组）/招式分组仅当前游戏；新增 abilities（含隐藏标记）、evolution（链+条件）、种族值、属性相性入参。
- `GET /api/pokemon/{id}/moves?game=` → 分组随游戏自适应（朱紫：升级/学习器/蛋/教授；阿尔宙斯：升级/教授；Z-A：升级（含精通等级）/学习器；BDSP：升级/学习器/蛋/教授）；输出 PP+优先度；TM 去重（同号只显示一次）。
- 新增：
  - `GET /api/meta/typechart` — 属性相性表（前端算防守方相性）
  - `GET /api/picnic-items` — 食材+调味料
  - `GET /api/donuts` — 甜甜圈全套（类型/特殊/树果/风味力量）
  - `GET /api/curries` — 咖喱图鉴
  - `GET/POST/DELETE /api/custom-recipes` — 自定义食谱（userstate.db）
- 伤害计算器：`/api/calc/forms` 附 abilities+hidden；`/api/calc` 支持 `tera_type`（双方）、`z_move`/`dynamax` 威力换算、`guts` 等已有；道具表扩充（含防守向）。

## 5. 前端架构（app/static/dist，免构建不变）

```
js/app.js        哈希路由 + 侧栏（首页[游戏中心] / 伤害计算器）
js/views/home.js 游戏卡片 → 进入游戏上下文（store.gameId）
js/views/dex.js  图鉴（按游戏上下文；重设计捕捉交互）
js/views/detail.js 详情（按当前游戏裁剪，新布局）
js/views/ev.js   努力值（按游戏上下文）
js/views/sandwiches.js 三明治（+自定义食谱+食材表）
js/views/donuts.js     甜甜圈工房（Z-A）
js/views/curry.js      咖喱图鉴（剑盾）
js/views/calc.js  伤害计算器（增强）
```

### 交互重设计（图鉴）
- 卡片右上角保留英文名；**捕捉改到底部左侧精灵球按钮**（点击切换精灵球/关闭球图标），已捕捉卡片左上角加圆形精灵球水印、卡片描边变绿。
- 顶部进度改环形（本图鉴完成度），点击图鉴 tab 显示「已捕捉/总数」。
- 详情页返回回到来源图鉴（保留 game/dex 上下文）。

### UI 规范
- 宝可梦图片：官方绘图（PokeAPI official-artwork）→ HOME 类 3D → 像素图兜底（fetch_sprites 三级回退）。
- 属性徽章：等宽（min-width）+ 仿 wiki 底色 + emoji 图标（离线可用，见 DATA-GAPS.md 取舍说明）。
- 招式分类：物理（红）/特殊（蓝）/变化（灰）底纹徽章。
- 三明治/甜甜圈/咖喱页头放 wiki 图片。
- 软件图标：PIL 绘制精灵球风格 ICO（替换软盘）。

## 6. 里程碑

| # | 内容 | 验收 |
|---|---|---|
| U1 | 文档规范化+设计文档 | 文件全大写命名，git mv 保留历史 |
| U2 | 数据管线 v2 | 重建 DB：BDSP 210 图鉴/100 TM；Z-A 学习集>0 且分方法；get_methods 带 version_label；SV TM 229 全有 how |
| U3 | 后端 API v2 | pytest 全绿 + 手动抽查 |
| U4 | 前端游戏入口+图鉴详情 | 浏览器走查 |
| U5 | 特化功能 | 三明治自定义/食材表；甜甜圈；咖喱 |
| U6 | 计算器增强 | 与 Showdown 抽样比对不回归 |
| U7 | UI 资产 | 官方绘图、图标、交互 |
| U8 | 测试+审查+自我迭代 | docs/SELF-ITERATION.md |

## 7. 已知取舍（详见 DATA-GAPS.md）

- Z 招式/极巨招式威力用「基础威力→固定威力」换算表（近似官方表，个别招式有特例不覆盖）。
- 属性图标用 emoji + 等宽底色（wiki 图标文件无稳定离线来源）。
- BDSP TM 获取文本来自 52poke locbdsp，个别缺文标「待补充」。
- Z-A TM 获取方式若 52poke 无专页，则列表展示编号与招式，获取标「待补充」。
