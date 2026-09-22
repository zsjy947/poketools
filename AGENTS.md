# AGENTS.md —— 给后续 AI 编码助手 / 维护者的项目指南

## 项目概况

Switch 宝可梦四作（剑盾 / 传说 阿尔宙斯 / 朱紫 / 传说 Z-A）的本地图鉴工具助手。
Python 3.10 + FastAPI + Vue3 + SQLite，pywebview 桌面窗口，PyInstaller 打包。
**运行时完全离线**：所有数据在构建期抓取入库。

## 常用命令

```bash
# 数据管线（按顺序）
git clone --depth 1 https://github.com/PokeAPI/pokeapi data/raw/pokeapi   # 一次性
python scripts/build_db.py         # PokeAPI CSV -> data/poketools.db（可重复执行，重建）
python scripts/scrape_52poke.py    # 52poke wiki -> data/curated/*.json + 合并入库
python scripts/fetch_sprites.py    # 图片下载到 data/sprites/

# 开发
python app/main.py                 # 启动 API + 静态前端，http://127.0.0.1:8734
cd web && npm run build            # 前端构建（产物 -> app/static/dist）
pytest tests/ -v                   # 测试
pythonw launcher.pyw               # 桌面窗口启动
./build_exe.bat                    # PyInstaller 打包 exe
```

## 架构要点

- `data/poketools.db`：静态数据，应用**只读**。每次由 `scripts/build_db.py` 重建，不要手工编辑。
- `data/userstate.db`：用户勾选状态（多档案 profile），应用可写。表：`profiles`、`caught_state(profile_id, dex_id, species_id, caught, note)`。
- `data/curated/*.json`：52poke 抓取结果 + 人工补录，**随 git 提交**（是数据库的可复现来源）。`TODO.json` 记录解析失败需人工补录的条目。
- 版本组（vg）映射：sword-shield=20/21/22（本体/DLC 合并查 20 的学习集与 20+26+27 的 TM）、legends-arceus=24、scarlet-violet=25/26/27（学习集查 25，TM 查 25+26+27）、legends-za=30/32（**学习集只存在于 vg32**）。
- 语言：PokeAPI CSV 中 zh-Hans=12，en=9。
- 生蛋链算法在 `app/services/breeding.py`：多源 BFS，节点=能学会该招式的物种，边=共享蛋组；从「自学」（升级/学习器/教授）节点到目标蛋组，输出全部最短路径。
- 二期伤害计算器：见 `docs/damage-calc-design.md`，服务层在 `app/services/damage.py`。

## 约定

- commit 规范：`类型: 摘要`（类型 = feat/fix/data/docs/test/chore），每个里程碑一次 commit，不 push（无远程）。
- UI 文案一律简体中文；界面缺失数据一律标注「待补充」，禁止编造数据。
- 52poke 解析失败的条目必须落 `data/curated/TODO.json`，不要静默丢弃。
- 前端构建产物（`app/static/dist`）提交到仓库，保证使用者无需 Node 即可打包运行。
- `data/raw/`、`data/*.db`、`data/sprites/`、`node_modules/` 均已 gitignore，不要提交。

## 已知坑

- PokeAPI 没有朱紫/阿尔宙斯/Z-A 的捕捉地点（encounters 表仅剑盾）→ 由 52poke 抓取补充。
- PokeAPI 图鉴描述的简体中文只到剑盾 → 朱紫等由 52poke 补充。
- 52poke 是 MediaWiki：批量取 wikitext 用 `api.php?action=query&prop=revisions&rvprop=content&titles=A|B`（一次最多 50 个标题）；抓取时务必写本地缓存（`data/raw/52poke-cache/`），避免重复请求。
- Windows 下打包注意 pywebview 依赖 WebView2 运行时（Win10/11 一般自带）。
