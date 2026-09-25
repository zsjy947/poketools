# PokéTools 宝可梦工具助手

> **⚠️ 本项目仍在开发中。** 功能与数据仍在持续完善，可能存在数据错误和遗漏（已知缺口见 [docs/DATA-GAPS.md](docs/DATA-GAPS.md)）。如发现问题欢迎提 Issue 反馈。

Switch 宝可梦游戏（剑／盾、晶灿钻石／明亮珍珠、传说 阿尔宙斯、朱／紫、传说 Z-A）的本地工具助手。
完全离线运行，界面为中文，双击 exe 即可启动（无命令行窗口，精灵球图标）。

**功能按游戏入口组织**：游戏中心选择游戏 → 该游戏的图鉴 / 努力值查询 / 游戏特化功能；伤害计算器为全局工具。

## 功能

1. **地区图鉴追踪** —— 10 张图鉴（伽勒尔、铠岛、王冠雪原、神奥、洗翠、帕底亚、北上乡、蓝莓、密阿雷市、超空间）浏览宝可梦；精灵球按钮标记捕捉、反选未捕捉、属性/名称筛选；环形进度显示完成度。
2. **宝可梦详情**（按当前游戏裁剪）—— 进化链（含条件）、图鉴介绍、获取方式（按「本体 / 扩展票 / 零之秘宝 / 版本独占」分组）、**种族值 + 能力值计算器**（等级/性格/努力值/个体值实时计算）、**属性相性（防守）**、招式表（含 PP / 优先度；学习器展开获取方式与材料；蛋招式计算**最短生蛋链**）。特性标注隐藏特性。
3. **努力值查询** —— 游戏入口内使用，仅当前游戏图鉴宝可梦，点击直达详情。
4. **三明治食谱（朱／紫）** —— 食力/属性/等级筛选排序；**食材与调味料表**（获得方式与价格）；**我的食谱**自由录入（食材/调味料可搜索多选）。
5. **甜甜圈工房（传说 Z-A）** —— 特殊配方（风味数值/食材/失控超级进化对象/扭洞位置）、基础甜甜圈、**树果效果图鉴**、**风味力量说明**、自定义配方录入。
6. **咖喱图鉴（剑／盾）** —— 151 种咖喱图鉴与介绍，搜索与关键食材筛选。
7. **伤害计算器** —— 对战场 + 编辑面板 + 场地三区布局：四招式即点即算（伤害占比/16 档随机/OHKO 与 2 回合击倒概率）、**超级进化/Z招式/极巨化/太晶化** 互斥点亮、帮助/极光幕/青草场地/天气、六项能力值与实际值覆盖、全形态对比。现代公式与 Pokémon Showdown 引擎逐 roll 校准一致（`tools/calib/` 10 案例）。

## 技术栈

- 后端：Python 3.10 + FastAPI（本地 REST API，运行时完全离线）
- 前端：Vue 3 + Element Plus（免构建，`app/static/dist` 由后端托管）
- 桌面化：pywebview 原生窗口 + PyInstaller 打包（精灵球图标）
- 数据：SQLite（`data/poketools.db` 静态数据只读 + `data/userstate.db` 勾选状态与自定义食谱）

## 快速开始

```bash
# 1) 安装依赖
pip install -r requirements.txt

# 2) 构建数据库（首次必须，需要先克隆离线数据源）
git clone --depth 1 https://github.com/PokeAPI/pokeapi data/raw/pokeapi
python scripts/build_db.py          # PokeAPI CSV -> data/poketools.db
python scripts/scrape_52poke.py     # 52poke wiki -> data/curated/*.json -> 合并入库
python scripts/fetch_sprites.py     # 官方绘图(三级回退) -> data/sprites
python scripts/fetch_feature_images.py  # 特化功能配图 -> app/static/dist/assets（可选）
python scripts/make_icon.py         # 应用图标（可选）

# 3) 开发模式启动（浏览器访问 http://127.0.0.1:8734）
python -m app.main

# 4) 桌面窗口模式
pythonw launcher.pyw

# 5) 打包 exe（生成到仓库根目录，data 就在旁边，直接双击可用）
build_exe.bat

# 分发给他人：拷走整个 release\poketools\ 文件夹（exe + data）即可双击运行。
# 启动异常时查看 exe 旁的 Poketools.log。
```

## 目录结构

```
poketools/
├─ app/                # FastAPI 后端（routers/ API、services/ 算法）
│  └─ static/dist/     # 前端（免构建 Vue3 + Element Plus，随仓库分发）
├─ scripts/            # 数据管线：build_db / scrape_52poke / fetch_sprites / fetch_feature_images / make_icon
├─ data/
│  ├─ raw/pokeapi/     # PokeAPI 离线 CSV（gitignore，需克隆）
│  ├─ curated/         # 52poke 抓取与人工整理数据（JSON，已提交）
│  ├─ poketools.db     # 静态数据（构建产物）
│  └─ userstate.db     # 用户勾选状态与自定义食谱
├─ tests/              # pytest
├─ launcher.pyw        # pywebview 桌面启动器
└─ docs/               # 设计总纲（DESIGN）、迭代规划（PLAN）、数据缺口（DATA-GAPS）、手册（USER-MANUAL）
```

## 数据来源与致谢

- [PokeAPI](https://pokeapi.co)（离线数据集 [PokeAPI/pokeapi](https://github.com/PokeAPI/pokeapi) 与 sprites 图片仓库）：宝可梦 / 形态 / 招式 / 学习方式 / TM 映射 / 进化条件 / 中文名 / 官方绘图。
- [52poke 中文维基](https://wiki.52poke.com)：捕捉方式（含版本独占与 DLC 标签）、图鉴描述、招式学习器获取方式、Z-A 学习集、三明治食谱与食材、甜甜圈/树果/风味力量、咖喱图鉴。
- 数据完整性说明见 `docs/DATA-GAPS.md`；缺失数据界面标「待补充」。
- 宝可梦及相关数据 © Nintendo / Creatures Inc. / GAME FREAK inc.，本项目仅为个人本地工具，不作商业用途。

## 测试

```bash
pytest tests/ -v
```
