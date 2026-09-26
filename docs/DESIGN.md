# PokéTools 设计总纲（DESIGN）

> 本文是项目**当前实现**的设计总纲，由一期（PHASE1）、二期（DAMAGE-CALC）、三期（UPGRADE3）三份设计文档合并而成，
> 只保留仍在生效的方案；已被推翻或移除的内容压缩进文末「变更历史」。
> 迭代规划见 `PLAN.md`，数据缺口见 `DATA-GAPS.md`，操作手册见 `USER-MANUAL.md`，自我迭代记录见 `SELF-ITERATION.md`。

## 1. 技术栈与架构

| 层 | 选型 | 说明 |
|---|---|---|
| 后端 | Python 3.10 + FastAPI + uvicorn | 本地 REST API，单进程，默认端口 8734（占用自动顺延） |
| 前端 | Vue 3 + Element Plus（**免构建**） | `vendor/` 放 UMD 产物，视图为模板字符串组件；无 Node 构建链 |
| 窗口壳 | pywebview | `launcher.pyw` 拉起本地服务线程 + 原生窗口；WebView2 缺失回退浏览器 |
| 打包 | PyInstaller onefile | `build_exe.bat`；`--collect-all webview` 是窗口能弹出的关键 |
| 存储 | SQLite ×2 | `data/poketools.db` 静态数据（**只读**，构建期生成）+ `data/userstate.db` 用户状态（可写） |
| 运行时 | 完全离线 | 所有数据/图片在构建期入库/落盘 |

架构原则：

- 静态库由脚本重建，应用代码**绝不**在运行时写 `poketools.db`。
- 前端构建产物（`app/static/dist`）随仓库提交，使用者无需 Node 即可运行/打包。
- 功能入口**按游戏组织**（`games.features`），伤害计算器是全局独立入口，不随所选游戏联动。

## 2. 数据管线与数据源

```bash
git clone --depth 1 https://github.com/PokeAPI/pokeapi data/raw/pokeapi   # 一次性
python scripts/build_db.py            # PokeAPI CSV -> data/poketools.db（可重复执行）
python scripts/scrape_52poke.py       # 52poke wiki -> data/curated/*.json + 合并入库
python scripts/fetch_sprites.py       # 官方绘图（三级回退）-> data/sprites/
python scripts/fetch_feature_images.py / fetch_sandwich_images.py   # 特化页配图 -> dist/assets
python scripts/make_icon.py           # 精灵球应用图标
```

### PokeAPI（离线整包 CSV）

- 来源 `data/v2/csv/*.csv`，简体中文语言 id=12（en=9）。
- **现行版本组（vg）映射**（唯一权威表）：

  | 游戏 | vg | 备注 |
  |---|---|---|
  | 剑盾 | 20/21/22 | 图鉴/学习集取 20；TR（100-199）在 machines vg20 |
  | 晶灿钻石·明亮珍珠 | 23 | 图鉴用 extended-sinnoh 白金 210 编号；PokeAPI machines 仅 17 条，TM001-100 由 52poke 补全 |
  | 传说 阿尔宙斯 | 24 | 无 TM/生蛋 |
  | 朱紫 | 25/26/27 | **machines 只导 vg25**（26/27 同号重复）；tutor 数据以 52poke「进化&回忆」为准修正 |
  | 传说 Z-A | 30/31 | 学习集：52poke 主源 + PokemonDB 兜底（`parse_za_learnlist_alt`），写入 vg30；machines 导 vg30+vg31（31=异次元 DLC TM108-160）。**vg32 是 Pokémon Champions 的 train 数据，与 Z-A 无关，勿导入** |

- 覆盖：地区图鉴（9 张）、种族值/努力值/蛋组/特性、招式与学习方式、剑盾 TM/TR 映射、剑盾捕捉地点（encounters **仅剑盾有**）、剑盾简中图鉴描述。
- 已知坑：蛋组标识符是 `ground/plant/humanshape/indeterminate/no-eggs`；natures.csv 的 stat_id 顺序为 1=hp,2=atk,3=def,4=spa,5=spd,6=spe。

### 52poke 中文维基（MediaWiki API，补 PokeAPI 缺口）

- 提供：各游戏简中图鉴描述、朱紫/阿尔宙斯/Z-A/BDSP 捕捉方式（get_methods）、TM 获取与素材（tm_how）、
  BDSP 与 Z-A 学习集、三明治/甜甜圈/咖喱/食材调味料表、风味力量（人工整理 `flavor_powers_manual.json`）。
- 抓取方式：`api.php?action=query&prop=revisions&rvslots=main`，每批 ≤50 标题，带重试与
  `data/raw/52poke-cache/` 本地缓存（务必写缓存，避免重复请求）。
- 图片下载：`Special:FilePath` 对脚本 403，用 `api.php?prop=imageinfo&iiprop=url` 拿 media.52poke.com 直链；
  **API 会把标题下划线规范化成空格**，查表键要统一。
- 解析失败条目一律落 `data/curated/TODO.json`，禁止静默丢弃；界面缺失数据标「待补充」。
- 招式译名代差（磷火↔鬼火 等）由 `scrape_52poke.py` 的 `MOVE_NAME_ALIASES` 映射。

## 3. 数据库 Schema

### poketools.db（25 表，静态，构建期重建）

核心：`games`（含 features JSON）· `regional_dexes`+`dex_entries` · `species`（含 evolves_from）·
`forms`（属性/种族值/努力值/形态标签/特性/隐藏特性）· `moves` · `learnsets`（**仅目标游戏**版本组，含 Z-A mastery）·
`learnsets_all`（**全世代**，计算器招式并集）· `machines`（TM/TR 编号→招式）· `vgs`（版本组→世代）· `natures`（up/down）·
`evolutions`（进化条件，from/to）

52poke 合并：`get_methods`（中文捕捉方式+version_label）· `dex_flavor`（中文图鉴描述）· `form_flavor`（地区形态/洛托姆换装/超进化/帽子等形态独立介绍，FORM_MARKERS 映射支持候选列表）· `tm_how` · `sandwiches`；PokemonDB 兜底：Z-A 学习集（`za_learnsets_pokemondb.json`）

特化功能：`picnic_items` · `donut_types` · `special_donuts` · `berries` · `flavor_powers` · `curries` · `encounters`（剑盾英文兜底）· `move_flavor`（species_title_overrides 是 curated 文件而非数据表）

### userstate.db（3 表，用户可写）

`profiles`（固定默认档案 id=1）· `caught_state(profile_id, dex_id, species_id, caught, note)` ·
`custom_recipes(profile_id, game, name, effects, ingredients, seasonings)`

## 4. API 设计（现行全部端点）

| 方法与路径 | 说明 |
|---|---|
| `GET /api/games` | 游戏列表 + features + 各图鉴计数 |
| `GET /api/dex/{dex_id}?profile&filter&type&q` | 图鉴条目（含捕捉状态） |
| ~~`GET/POST /api/profiles`~~ | 已随 P3-1 下线（前端固定默认档案 profile_id=1，userstate 表保留） |
| `PUT /api/state` · `POST /api/state/bulk` | 捕捉勾选 / 批量标记 |
| `GET /api/pokemon/{id}?game=` | 详情（介绍/获取方式/进化链/形态/种族值/努力值，按游戏裁剪） |
| `GET /api/pokemon/{id}/moves?game=&form_id=` | 招式分组表（tab 随游戏；TM 展开 how/materials） |
| `GET /api/breed-chains?species_id&move_id&game` | 蛋招式最短生蛋链（多源 BFS） |
| `GET /api/ev?stat&value&game&q` | 努力值反筛 |
| `GET /api/meta/typechart` · `GET /api/meta/natures` · `GET /api/meta/items` · `GET /api/meta/species` | 元数据 |
| `GET /api/sandwiches` · `GET /api/picnic-items` · `GET /api/donuts` · `GET /api/curries` | 特化功能数据 |
| `GET/POST/DELETE /api/custom-recipes` | 自定义食谱（userstate.db） |
| `GET /api/calc/forms?species_id=` · `GET /api/calc/moves?species_id=` | 计算器：形态（含特性）/全世代招式并集 |
| `POST /api/calc` · `POST /api/calc/compare-forms` | 伤害计算 / 全形态对比 |

## 5. 伤害计算器

服务 `app/services/damage.py` + 路由 `app/routers/calc.py` + 前端 `views/calc.js`。
四期起**只保留现代公式**（剑盾/朱紫回合制），阿尔宙斯/Z-A 公式已随 P4-1 移除。

### 现代公式（gen5+，与 @smogon/calc 逐 roll 校准一致）

```
Damage = ((2×Level/5 + 2) × Power × A/D / 50 + 2)
         × PB × Weather × Critical × random × STAB × Type × Burn × finalMod
```

**取整语义是关键，勿改顺序**（源码级对齐 `@smogon/calc` gen789）：

0. 威力阶段修正（bpMods）：帮助 ×6144/4096；青草场地仅地震/跺脚且防守方接地 ×2048/4096；随后 Z/极巨威力换算；
1. 基础伤害 = floor(floor(floor(floor(2L/5+2)×威力)×A/D)/50+2)；大晴天/大雨按晴/雨同乘数，乱流/沙暴/雪不影响数值；
2. 天气以 4096 分数（晴火/雨水 6144/4096，反向 2048/4096）pokeRound 作用于**基础伤害**；
3. 会心 ×1.5 **向下取整**，作用于基础伤害（狙击手走 finalMod 链）；
4. 随机数**最先**：floor(base×(85+i)/100)，i=0..15；
5. STAB 为 4096 分数（6144；适应力/太晶同属性 8192），无即时取整；
6. pokeRound 后乘属性相性并**向下取整**；灼伤 floor(dmg/2)（毅力免除并改为攻击 ×1.5）；
7. finalMod 单链（反射壁/光墙/极光幕→超感知→狙击手→有色眼镜→巨兽系对极巨化→多重鳞片→冰鳞粉→滤芯→达人带→生命宝珠），
   每步 (M×mod+2048)>>12，最终 pokeRound、最低 1（免疫为 0）。

### 能力值

```
HP   = floor((2×B + IV + floor(EV/4)) × L / 100) + L + 10    （B=1 时 HP=1：脱壳忍者特例）
其他 = floor((floor((2×B + IV + floor(EV/4)) × L / 100) + 5) × Nature)
```

性格 1.1/0.9；讲究类道具在能力值阶段 ×1.5（不进 finalMod）；突击背心/进化奇石 特防（防御）×1.5；
能力等级以分数 (2±k)/2 表达，乘后取整。

### Z / 极巨 / 太晶

- Z 招式威力按「基础威力→固定威力」换算表（`z_power`，个别招式特例）；极巨招式按属性/威力区间（`max_power`，格斗/毒独立档），极巨化 HP×2。
- 太晶化：太晶属性替换防守相性（单属性）；STAB = max(原属性 STAB, 太晶同属性 STAB)，适应力时 2 倍。
- 巨兽斩击/巨兽弹击/极巨炮 对极巨化目标 ×2（finalMod 链）。

### 校准流程（改公式后必须重跑）

```bash
cd tools/calib && npm install          # @smogon/calc
node harness.mjs > smogon_baseline.json
python check.py                        # 需先完成数据管线
```

10 个基准案例逐 roll 比对（基础/相性/宝珠会心/雨天/毅力灼伤/讲究晴天/冷冻干燥/漂浮免疫/帮助/青草场地），全绿才可提交。

### 明确不做的

- 威力按重量/HP 变化类招式（打草结等）：手动改威力覆盖即可。
- 回合制模拟（吃剩的东西回血等）：超出单次计算范围。
- 特性只实装数值型常用项（适应力/狙击手/有色眼镜/超感知/毅力/漂浮/多重鳞片/冰鳞粉/滤芯/Prism装甲）。

## 6. 前端架构（免构建）

```
app/static/dist/
  index.html          引入 vendor UMD + js + css（无构建步骤）
  css/base|dex|features|calc.css   按页拆分的样式（免构建，index.html 多链引入）
  js/api.js           fetch 封装 + 全局常量（TYPE_LIST/POWER_LIST…）
  js/components.js    store + 全局组件（TypeBadge/MoveClassBadge/PokeToggle/PokeImg/EvoChain/StatBars…）
  js/app.js           根组件 + 哈希路由（#/#game/{id}/{feature}/#pokemon/{id}/#calc）
  js/views/*.js       home/dex/detail/ev/sandwiches/donuts/curry/calc
  assets/             特化页配图、属性雪碧图、三明治图等（随 git 提交，保证离线）
  vendor/             vue/element-plus/中文语言包/图标 UMD
```

约束：视图是**模板字符串组件**（无 SFC/JSX）；新全局组件在 `components.js` 注册；
路由用 `location.hash`，游戏上下文存 `store.gameId`；请求失败统一 `api-error` 事件 → toast。

## 7. 已知取舍

- Z/极巨威力用换算表（近似官方表，个别特例不覆盖）；跨世代种族值历史差异不实装。
- PokeAPI 图鉴描述简中只到剑盾、encounters 仅剑盾 → 其余由 52poke 补充，缺口见 `DATA-GAPS.md`。
- 属性图标走 52poke 雪碧图（等宽胶囊 + 图标 span），星晶无图标退化纯色胶囊。
- 风味力量表由人工整理（wiki rowspan 布局不规则，勿程序化解析）。
- 数据缺口统一记 `DATA-GAPS.md`（Z-A 学习集已双源全覆盖；SV TM 已以「招式机器制作」补全；剩余为源站未写类缺口）。

## 8. 变更历史

| 阶段 | 里程碑 | 结果 |
|---|---|---|
| 一期 M0-M5 | 骨架/数据管线/图鉴追踪/招式+生蛋链/努力值+三明治/启动打包 | 全部交付（Vite→免构建为落地变更） |
| 二期 | 伤害计算器（现代公式 + @smogon/calc 逐 roll 校准 + 全形态对比） | 交付；手动比对方案被 `tools/calib` 自动化 harness 取代 |
| 三期 U1-U8 | 按游戏入口重构/BDSP 图鉴/详情裁剪/特化页/计算器增强/UI 资产 | 交付；35 pytest 全绿 |
| 三期迭代 | 独立审查 26 项修复（灼伤契约 P0、Z-A 公式接入 P0、形态联动等）+ 3 项体验迭代 | 见 `SELF-ITERATION.md` |
| 四期 P1 | 设计文档合并、属性雪碧图、三明治图、首页清理、游戏商标图标 | 本文档即产物之一 |
| 四期 P2 | 详情页两栏重设计、形态拆分、招式表游戏化核对、翻页平滑、版本主题色 | 见 `PLAN.md` |
| 四期 P3 | 档案 UI 移除（固定默认档案）、三明治/甜甜圈录入重做 | 见 `PLAN.md` |
| 四期 P4 | 计算器推倒重建：删除阿尔宙斯/Z-A 公式，只留现代公式；UI 效仿 pokestats.top/calc | **阿尔宙斯/Z-A 公式自此移除，不再收录** |
| 四期 P5 | release 打包目录、代码结构重构 | 见 `PLAN.md` |
