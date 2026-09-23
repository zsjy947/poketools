# 一期设计文档：图鉴追踪 / 招式与生蛋链 / 努力值 / 三明治 / 桌面化

> 对应实施计划 v2（不含二期伤害计算器，二期见 `damage-calc-design.md`）。
> 本文记录设计决策、数据源验证结论与实际交付形态，供后续维护者理解全貌。

## 1. 技术栈与架构

| 层 | 选型 | 说明 |
|---|---|---|
| 后端 | Python 3.10 + FastAPI + uvicorn | 本地 REST API，单进程 |
| 前端 | Vue 3 + Element Plus（**免构建**） | vendor 目录放 `vue.global.prod.js` / `element-plus` UMD 产物，由 FastAPI 托管静态文件；无需 Node 构建链（与原计划的 Vite 方案不同，落地时为降低打包/分发复杂度改为免构建 SPA，视图为模板字符串组件） |
| 窗口壳 | pywebview 原生窗口 | `launcher.pyw`：拉起本地服务线程 + 原生窗口；WebView2 缺失时回退默认浏览器 |
| 打包 | PyInstaller onefile | exe 输出到仓库根目录，`data` 文件夹就在旁边直接可用；`--collect-all webview` 是窗口能弹出的关键 |
| 存储 | SQLite ×2 | `data/poketools.db` 静态数据（只读，构建期生成）+ `data/userstate.db` 勾选状态（可写，多档案 profile） |
| 运行时 | 完全离线 | 所有数据/图片构建期入库/落盘 |

端口：默认 8734，被占用自动顺延。同类项目调研结论（supeffective / pokedextracker 等）：
静态数据打包 + 本地状态存储 + Web SPA + 原生壳是该类工具的成熟模式。

## 2. 数据源策略（构建期验证结论）

**PokeAPI（离线整包，不逐条调接口）**：
- 来源 `git clone --depth 1 https://github.com/PokeAPI/pokeapi` → `data/v2/csv/*.csv`（约 187 张表）
- 覆盖：4 款游戏版本组（sword-shield=20/21/22、legends-arceus=24、scarlet-violet=25/26/27、legends-za=30/32）
  与全部 9 张地区图鉴；简体中文名（语言 id：zh-Hans=12，en=9）；种族值/努力值/蛋组/特性；
  招式与学习方式（level-up/egg/tutor/machine）；剑盾与朱紫的 TM→招式映射（machines.csv）；
  剑盾捕捉地点（encounters.csv，**仅剑盾有**）；剑盾简中图鉴描述。
- 关键坑：Z-A 的学习集挂在 vg=32（mega-dimension）而非 30；蛋组标识符是 `ground/plant/humanshape/indeterminate/no-eggs` 而非常见别名；natures.csv 的 stat_id 顺序为 1=hp,2=atk,3=def,4=spa,5=spd,6=spe。

**52poke 中文维基（MediaWiki API 抓取，补 PokeAPI 缺口）**：
- 朱紫/阿尔宙斯/Z-A 捕捉方式（PokeAPI 的 encounters 表这三作为空）
- 各游戏简中图鉴描述（PokeAPI 图鉴描述简中只到剑盾）
- 招式学习器获取方式与制作素材（朱紫 loc9/item9、剑盾 locswsh；Z-A 基本无文档，标「待补充」）
- 三明治食谱（151 个，wikitable 规整）
- 抓取方式：`api.php?action=query&prop=revisions&rvslots=main`，每批 ≤50 标题、带重试与
  `data/raw/52poke-cache/` 本地缓存；宝可梦页解析 `{{获得方式/main|编号|世代|游戏代码|…|地点|方式|备注}}`
  与 `{{图鉴|sdex/bdex/ladex/scdex/videx/zadex=…}}` 模板；繁简字形差异用
  `data/curated/species_title_overrides.json` 覆盖（如 負电拍拍→负电拍拍）。
- 解析失败条目一律落 `data/curated/TODO.json`，界面缺失数据标「待补充」，不编造。

## 3. 数据库（data/poketools.db，由 scripts/build_db.py 重建）

静态核心：`games` · `regional_dexes`+`dex_entries` · `species` · `forms`（属性/种族值/努力值/形态标签）
· `moves` · `learnsets`（**仅目标游戏**版本组）· `learnsets_all`（**全世代**，二期计算器招式并集）
· `machines`（TM 编号→招式）· `encounters`（PokeAPI 剑盾英文捕捉，作兜底）· `vgs`（版本组→世代）· `natures`

52poke 合并（scrape_52poke.py 填充）：`get_methods`（中文捕捉方式）· `dex_flavor`（中文图鉴描述，
覆盖 PokeAPI 同名条目）· `tm_how`（TM 获取/素材）· `sandwiches`

用户状态（data/userstate.db）：`profiles` · `caught_state(profile_id, dex_id, species_id, caught)`

重建顺序：`build_db.py`（全量重建）→ `scrape_52poke.py`（走缓存合并 curated）→ `fetch_sprites.py`（补缺图片）。

## 4. 功能与接口设计

### 4.1 图鉴追踪（`GET /api/games`、`/api/dex/{dex_id}`、`PUT /api/state`、`POST /api/state/bulk`）
- 游戏 → 地区图鉴 tab（带 x/y 进度）→ 卡片网格（编号/中文名/官方立绘/属性徽章/勾选框）
- 筛选：全部/已捕捉/未捕捉、属性、名称与编号搜索；「反选未捕捉」把当前筛选下未捕捉的一键标记
- 勾选即时 PUT 持久化，按 profile 隔离
- 详情页：捕捉方式（52poke 中文表优先，缺失回退 PokeAPI 英文表并标注）、图鉴描述（剑/盾/洗翠/朱/紫/Z-A 分标签）、
  努力值徽章、蛋组/捕获率、图鉴收录列表、多形态切换

### 4.2 招式表与生蛋链（`GET /api/pokemon/{id}/moves`、`GET /api/breed-chains`）
- 按游戏切换学习表（sword-shield→vg20，scarlet-violet→vg25，legends-za→vg32，legends-arceus→vg24）
- 招式学习器行展开：TM 编号 + 获取地点 + 制作素材（`tm_how`）
- 蛋招式 → 生蛋链计算（`app/services/breeding.py`）：
  - 节点=当前游戏能以任意方式学会该招式的物种；「自学」=升级/学习器/教授
  - 边=可交配（蛋组相交，或一方为百变怪蛋组；「未发现」蛋组直接拒绝）
  - 无性别且非百变怪的物种不可作中间环；目标自身不作为节点
  - 多源 BFS（源=自学物种，距离 0），到目标蛋组的全部最短路径回溯，输出
    `steps=[{from, to, shared_groups}]`（末步 to=目标），最多 100 条
  - 无生蛋机制的游戏（阿尔宙斯等）前端隐藏入口
- 已知案例验证：新叶喵 × 交换场地（朱紫）= 最短 2 次繁殖、6 条路线

### 4.3 努力值（`GET /api/ev`）
按 stat（hp/atk/def/spa/spd/spe）+ 点数（0=任意/1/2/3）+ 游戏（按图鉴收录过滤）反筛全部宝可梦。

### 4.4 三明治助手（`GET /api/sandwiches`）
食力（蛋蛋力/遭遇力/闪光力/捕获力/大大力/小小力/经验力/掉物力/团战力/称号力）+ 目标属性 + Lv 筛选；
按编号/效果/等级排序；食材、调味料、获得方式来自 52poke 食谱表。

### 4.5 前端结构（app/static/dist）
`index.html` + `js/api.js`（fetch 封装/常量）+ `js/components.js`（属性徽章/立绘/store）+
`js/views/{dex,detail,ev,sandwiches,calc}.js` + `js/app.js`（哈希路由 + 侧栏菜单）。
静态文件挂载顺序：API 路由优先，`/` 兜底到 dist（`html=True`）。

## 5. 目录与产物

```
scripts/build_db.py        PokeAPI CSV → poketools.db（可重复执行全量重建）
scripts/scrape_52poke.py   52poke 抓取 → data/curated/*.json → 合并入库
scripts/fetch_sprites.py   官方立绘下载 → data/sprites/{form_id}.png
data/curated/*.json        抓取与人工整理数据（随 git 提交，可复现）
launcher.pyw               pywebview 启动器（日志 Poketools.log）
build_exe.bat              PyInstaller 打包（--collect-all webview，输出到仓库根目录）
```

## 6. 里程碑与验收记录

| 里程碑 | 内容 | 验收 |
|---|---|---|
| M0 | 骨架/文档/规范 | commit `434fa63` |
| M1 | 数据管线（PokeAPI+52poke） | 计数核对：4 游戏/9 图鉴/2270 图鉴条目/1025 种/1351 形态/937 招式/12 万学习集；捕捉覆盖率 94~100%；抽样数值比对（新叶喵种族值/学习集/TM） | 
| M2 | 图鉴追踪页 | 浏览器实测：勾选持久化、筛选、反选、详情数据完整性 |
| M3 | 招式表+生蛋链 | TM 展开正确；生蛋链案例（2 步 6 链）+ pytest 结构校验 |
| M4 | 努力值+三明治 | 筛选/排序实测（蛋蛋力 24 例、151 食谱） |
| M5 | 启动器+打包 | exe 双击：窗口弹出、API 正常、data 读取正常 |

测试：`pytest tests/`（数据库完整性 / 生蛋链 / API 集成 / 伤害计算）；
修复迭代记录：蛋组中文映射（ground→陆上）、模板解析偏移、静态文件挂载、生蛋链单步链渲染、
打包后 webview 组件缺失与 data 定位（详见 git log 与 AGENTS.md「已知坑」）。
