# AGENTS.md —— 给后续 AI 编码助手 / 维护者的项目指南

## 项目概况

Switch 宝可梦五作（剑盾 / 晶灿钻石·明亮珍珠 / 传说 阿尔宙斯 / 朱紫 / 传说 Z-A）的本地图鉴工具助手。
Python 3.10 + FastAPI + Vue3 + SQLite，pywebview 桌面窗口，PyInstaller 打包。
**运行时完全离线**：所有数据在构建期抓取入库。

## 常用命令

```bash
# 数据管线（按顺序）
git clone --depth 1 https://github.com/PokeAPI/pokeapi data/raw/pokeapi   # 一次性
python scripts/build_db.py         # PokeAPI CSV -> data/poketools.db（可重复执行，重建）
python scripts/scrape_52poke.py    # 52poke wiki -> data/curated/*.json + 合并入库
python scripts/fetch_sprites.py    # 官方绘图(三级回退+Pillow缩放) -> data/sprites/
python scripts/fetch_feature_images.py  # 属性雪碧图/游戏商标/特化页配图 -> app/static/dist/assets/
python scripts/fetch_sandwich_images.py # 三明治 151 张 16:9 食谱图
python scripts/make_icon.py        # 精灵球应用图标
# 52poke 访问统一走 scripts/wiki_client.py（缓存/批量 wikitext/imageinfo 直链/Referer 下载），勿再各写一份
# PokemonDB（52poke 缺口的英文补源）走 scripts/pokemondb_client.py（HTML 缓存 data/raw/pokemondb-cache/）

# 开发
python -m app.main                 # 启动 API + 静态前端，http://127.0.0.1:8734
pytest tests/ -v                   # 测试（改伤害公式后另跑 tools/calib 校准）
pythonw launcher.pyw               # 桌面窗口启动
./build_exe.bat                    # PyInstaller 打包 → release/poketools/（exe+data 即拷即用；release/ 已 gitignore）
```

注意：前端是**免构建**的 Vue3 + Element Plus（UMD），源码就是 `app/static/dist/`，
没有 `web/` 目录与 npm 步骤。

## 架构要点

- `data/poketools.db`：静态数据，应用**只读**。每次由 `scripts/build_db.py` 重建，不要手工编辑。
- `data/userstate.db`：用户状态，应用可写。表：`profiles`（P3-1 起档案 UI 已移除，固定默认档案 id=1，表保留）、`caught_state(profile_id, dex_id, species_id, caught, note)`、`custom_recipes(profile_id, game, name, effects, ingredients, seasonings)`（食材/调味料/树果存 JSON 数组，读取兼容旧文本）。
- `data/curated/*.json`：52poke 抓取结果 + 人工补录，**随 git 提交**（是数据库的可复现来源）。`TODO.json` 记录解析失败/数据缺口（za_learnset_issues 现已清零；form_flavor_unparsed_markers 为 PokeAPI 未建模形态）；`za_learnsets_pokemondb.json`（PokemonDB 兜底学习集）、`tm_locations_za_pokemondb.json`（Z-A TM 地点人工翻译）为新补数据 curated；风味力量为人工整理（`flavor_powers_manual.json`，wiki 表格 rowspan 布局不规则勿尝试程序化解析）。
- 版本组（vg）映射：sword-shield=20/21/22、**bdsp=23**（图鉴用 extended-sinnoh 白金 210 编号；TM001-100 由 52poke 补全，PokeAPI machines 仅 17 条）、legends-arceus=24、scarlet-violet=25/26/27（**machines 只导 vg25**，26/27 同号重复）、**legends-za=30/31（学习集 52poke 主源 + PokemonDB 兜底写入 vg30，双源在 scrape_52poke；machines 导 vg30+vg31=TM108-160 异次元 DLC；vg32 是 Pokémon Champions 的 train 数据，与 Z-A 无关，勿导入）**。
- 功能入口**按游戏组织**（`games.features`：dex/ev/sandwich/donut/curry），伤害计算器为全局独立入口；详情页两栏布局、内容按当前游戏与**所选形态**裁剪（介绍/获取方式/招式表；`form_flavor` 存地区形态/洛托姆换装的独立图鉴介绍）。
- 招式表 tab 逐游戏不同（`GAME_MOVE_CONFIG`）：**朱紫无教授**（PokeAPI vg25 的 4 条 tutor 在 52poke 为「回忆」，并入升级组）；Z-A 仅 升级/学习器。
- 语言：PokeAPI CSV 中 zh-Hans=12，en=9。
- 生蛋链算法在 `app/services/breeding.py`：多源 BFS，节点=能学会该招式的物种，边=共享蛋组；从「自学」（升级/学习器/教授）节点到目标蛋组，输出全部最短路径。
- 设计总纲：`docs/DESIGN.md`（技术栈/数据管线/Schema/API/伤害计算器/前端架构/取舍/变更历史）；数据缺口清单 `docs/DATA-GAPS.md`（Z-A 94 种学习集缺失、SV 31 个 TM 无获取文本等）；操作手册 `docs/USER-MANUAL.md`。**文档命名规范：内容描述 + 全大写**。
- 伤害计算器（四期重建）：`app/services/damage.py`（**仅现代公式**，阿尔宙斯/Z-A 公式已删）+ `app/routers/calc.py`（机制 mega/Z/极巨/太晶同侧互斥校验）+ 前端 `views/calc.js`（对战场/编辑面板/场地三区，四招式即点即算）。
  - 前端 CSS 按页拆分：`css/base|dex|features|calc.css`（免构建，index.html 多链）。
  - 现代公式已与 Pokémon Showdown 官方引擎 `@smogon/calc` **逐 roll 校准一致**；
    校准脚本 `tools/calib/`（node harness.mjs 生成基准 → python check.py 比对，改公式后必须重跑）。
  - 取整语义是关键：天气/会心作用于基础伤害（会心 ×1.5 向下取整）；随机最先 floor(base×(85+i)/100)；
    STAB 与 finalMod 是 4096 分数链（pokeRound 半舍去）；勿改顺序。
  - Z招式/极巨招式威力换算表在 `damage.py`（z_power/max_power）；太晶化影响 STAB 与防守相性。
  - `learnsets_all` 表存**全世代**学习集（伤害计算器招式并集用），与 `learnsets`（仅目标游戏）分开。
  - 性格表 `natures`（up/down 列），版本组→世代映射 `vgs` 表，进化条件 `evolutions` 表。

## 约定

- commit 规范：`类型: 摘要`（类型 = feat/fix/data/docs/test/chore），每个里程碑一次 commit，不 push（无远程）。
- UI 文案一律简体中文；界面缺失数据一律标注「待补充」，禁止编造数据。
- 52poke 解析失败的条目必须落 `data/curated/TODO.json`，不要静默丢弃。
- 前端构建产物（`app/static/dist`）提交到仓库，保证使用者无需 Node 即可打包运行。
- `data/raw/`、`data/*.db`、`data/sprites/`、`node_modules/` 均已 gitignore，不要提交。

## 已知坑

- PokeAPI 没有朱紫/阿尔宙斯/Z-A/BDSP 的捕捉地点（encounters 表仅剑盾）→ 由 52poke 抓取补充。
- PokeAPI 图鉴描述的简体中文只到剑盾 → 朱紫等由 52poke 补充（`Swdex/Shdex` 注意首字母大写；BDSP 用 `bdspdex`）。
- 52poke 是 MediaWiki：批量取 wikitext 用 `api.php?action=query&prop=revisions&rvprop=content&titles=A|B`（一次最多 50 个标题）；抓取时务必写本地缓存（`data/raw/52poke-cache/`），避免重复请求。
- 52poke 图片下载：`Special:FilePath` 对脚本返回 403，用 `api.php?prop=imageinfo&iiprop=url` 拿直链（media.52poke.com）；**API 会把标题下划线规范化成空格**，查表键要统一。
- 环境代理可能使 requests 抓 raw.githubusercontent.com 报 SSL 证书错误（curl 正常）：`fetch_sprites.py` 已内置降级不校验重试。
- wikitext 表格单元格 `属性|内容`（如 `class="bgl-甜Z"| 甜`）要先剥属性再 clean；`{{Bag|名|…}}` 取第 1 参数。
- 招式译名代差：52poke 用官方新译名（磷火/咒术/空气之刃/纠缠不休），PokeAPI 是旧名（鬼火/祸不单行/空气斩/死缠烂打），`scrape_52poke.py` 的 `MOVE_NAME_ALIASES` 做映射，新增差异往里补。
- Windows 下打包注意 pywebview 依赖 WebView2 运行时（Win10/11 一般自带）；图标经 `--icon` 打进 exe。

