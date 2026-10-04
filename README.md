# PokéTools 宝可梦工具助手

> **⚠️ 本项目仍在开发中。** 功能与数据仍在持续完善，可能存在数据错误和遗漏（已知缺口见 [docs/DATA-GAPS.md](docs/DATA-GAPS.md)）。如发现问题欢迎提 Issue 反馈。

Switch 宝可梦游戏（剑／盾、晶灿钻石／明亮珍珠、传说 阿尔宙斯、朱／紫、传说 Z-A）的本地工具助手。
完全离线运行，界面为中文，双击 exe 即可启动（无命令行窗口，精灵球图标）。

**功能按游戏入口组织**：游戏中心选择游戏 → 该游戏的图鉴 / 努力值查询 / 游戏特化功能；伤害计算器与模拟对战为全局工具。

## 功能

1. **地区图鉴追踪** —— 10 张图鉴（伽勒尔、铠岛、王冠雪原、神奥、洗翠、帕底亚、北上乡、蓝莓、密阿雷市、超空间）浏览宝可梦；精灵球按钮标记捕捉、反选未捕捉、属性/名称筛选；环形进度显示完成度。
2. **宝可梦详情**（按当前游戏裁剪）—— 进化链（含条件）、图鉴介绍、获取方式（按「本体 / 扩展票 / 零之秘宝 / 版本独占」分组）、**种族值 + 能力值计算器**（等级/性格/努力值/个体值实时计算）、**属性相性（防守）**、招式表（含 PP / 优先度；学习器展开获取方式与材料；蛋招式计算**最短生蛋链**）。特性标注隐藏特性。
3. **努力值查询** —— 游戏入口内使用，仅当前游戏图鉴宝可梦，点击直达详情。
4. **三明治食谱（朱／紫）** —— 食力/属性/等级筛选排序；**食材与调味料表**（获得方式与价格）；**我的食谱**自由录入（食材/调味料可搜索多选）。
5. **甜甜圈工房（传说 Z-A）** —— 特殊配方（风味数值/食材/失控超级进化对象/扭洞位置）、基础甜甜圈、**树果效果图鉴**、**风味力量说明**、自定义配方录入。
6. **咖喱图鉴（剑／盾）** —— 151 种咖喱图鉴与介绍，搜索与关键食材筛选。
7. **伤害计算器** —— 对战场 + 编辑面板 + 场地三区布局：四招式即点即算（伤害占比/16 档随机/OHKO 与 2 回合击倒概率）、**超级进化/Z招式/极巨化/太晶化** 互斥点亮、帮助/极光幕/青草场地/天气、六项能力值与实际值覆盖、全形态对比。现代公式与 Pokémon Showdown 引擎逐 roll 校准一致（`tools/calib/` 10 案例）。
8. **模拟对战** —— 供应商化 Showdown 引擎驱动的本机对战：双队伍构建（Showdown 文本导入导出 + 合法性校验）、单人操控双方、信息流 + 动画演出、完整日志与对局记录回看。详见 `docs/BATTLE.md`。

## 技术栈（v1.0.0 终态）

- **前端/应用**：React 18 + TypeScript（strict）+ Vite + zustand，`web/` 单实现；桌面壳为 **Tauri 2**（`web/src-tauri/`）。
- **数据管线（构建期 Python）**：`scripts/build_db.py`（PokeAPI CSV → SQLite）、`scrape_52poke.py`（中文维基 → `data/curated/*.json`）、`fetch_sprites.py` / `fetch_feature_images.py` / `make_icon.py`（素材与图标）、`export_static_data.py`（DB → `web/public/data/*.json` 静态分片）；旧 FastAPI/pywebview/PyInstaller 运行时已退役。
- **数据**：`data/poketools.db` 静态库（构建产物）+ `data/curated/`（已提交）；用户数据（勾选状态 `pkt.caught_state.v1`、自定义食谱 `pkt.custom_recipes.v1`）存 **localStorage**，旧 `userstate.db` 可用 `scripts/export_userstate.py` 导入迁移。
- **模拟对战引擎**：供应商化 Showdown sim（`web/src/engine-adapter/vendor/ps-engine.js`，gitignore；`web/scripts/build-engine.mjs` 可重建）。

## 快速开始（开发）

```bash
# 1) Web 前端（http://localhost:1420）
cd web && pnpm install && pnpm dev

# 2) 桌面壳（Tauri 2，需要 Rust 工具链）
cd web && pnpm tauri dev

# 3) 数据管线（首次必须，需要先克隆离线数据源）
#    git clone --depth 1 https://github.com/PokeAPI/pokeapi data/raw/pokeapi
python scripts/build_db.py           # PokeAPI CSV -> data/poketools.db
python scripts/scrape_52poke.py      # 52poke wiki -> data/curated/*.json -> 合并入库
python scripts/export_static_data.py # DB -> web/public/data/*.json（前端静态分片）
python scripts/fetch_sprites.py      # 官方绘图(三级回退) -> web/public/pkt
python scripts/fetch_feature_images.py  # 特化功能配图 -> web/public/assets（可选）
python scripts/make_icon.py          # 应用图标（可选）

# 4) 模拟对战引擎（可选，需要 data/raw/pokemon-showdown）
cd web && node scripts/build-engine.mjs
```

## 门禁（web/ 内）

```bash
cd web
pnpm test        # vitest（含 calib 校准 golden）
pnpm build       # tsc --noEmit + vite build
pnpm lint        # eslint + prettier
```

Python 管线测试：`pytest`（仓库根，`tests/test_db.py` + `tests/test_parsers.py`）。

## 目录结构

```
poketools/
├─ web/                    # React 18 + TS + Vite 应用（唯一前端实现）
│  ├─ src/                 #   pages/ 图鉴工具页面；app/ 对战子应用；data/ 数据访问层；engine-adapter/ 引擎适配
│  ├─ public/              #   data/*.json 静态分片、精灵图、素材（产物，部分 gitignore）
│  ├─ src-tauri/           #   Tauri 2 桌面壳
│  └─ scripts/             #   引擎重建 / 素材抓取（Node 侧）
├─ scripts/                # 构建期数据管线（Python：build_db / scrape_52poke / export_static_data / fetch_* / make_icon）
├─ data/
│  ├─ raw/                 # PokeAPI / pokemon-showdown 离线克隆（gitignore）
│  ├─ curated/             # 52poke 抓取与人工整理数据（JSON，已提交）
│  └─ poketools.db         # 静态数据（构建产物）
├─ tools/calib/            # 伤害计算对拍门禁（calib-js，基准 cases.json）
├─ tests/                  # pytest（管线测试）
└─ docs/                   # DATA-GAPS 数据缺口 / BATTLE 模拟对战 / USER-MANUAL 使用手册 / ARCHITECTURE 架构
```

## 数据来源与致谢

- [PokeAPI](https://pokeapi.co)（离线数据集 [PokeAPI/pokeapi](https://github.com/PokeAPI/pokeapi) 与 sprites 图片仓库）：宝可梦 / 形态 / 招式 / 学习方式 / TM 映射 / 进化条件 / 中文名 / 官方绘图。
- [52poke 中文维基](https://wiki.52poke.com)：捕捉方式（含版本独占与 DLC 标签）、图鉴描述、招式学习器获取方式、Z-A 学习集、三明治食谱与食材、甜甜圈/树果/风味力量、咖喱图鉴。
- 数据完整性说明见 `docs/DATA-GAPS.md`；缺失数据界面标「待补充」。
