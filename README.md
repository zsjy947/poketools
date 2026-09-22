# PokéTools 宝可梦工具助手

Switch 宝可梦游戏（剑／盾、传说 阿尔宙斯、朱／紫、传说 Z-A）的本地工具助手。
完全离线运行，界面为中文，双击 exe 即可启动（无命令行窗口）。

## 功能

1. **地区图鉴追踪** —— 按游戏 / 地区图鉴（伽勒尔、铠岛、王冠雪原、洗翠、帕底亚、北上乡、蓝莓、密阿雷市、超空间）浏览宝可梦，勾选已捕捉 / 反选未捕捉，一键筛选未捕捉；详情页含捕捉方式（地点 / 方式 / 等级）、图鉴描述、努力值。
2. **招式学习表** —— 按升级 / 招式学习器 / 蛋招式 / 教授分类；招式学习器可查看当前游戏中的编号与获取方式；蛋招式可自动计算**最短生蛋链**（BFS，展示全部最短路径与每一环的招式来源）。
3. **努力值查询** —— 每只宝可梦击倒获得的努力值点数；按努力值种类 / 点数 / 游戏反向筛选全部宝可梦。
4. **朱紫三明治助手** —— 按食力（蛋蛋力 / 遭遇力 / 闪光力 / 捕获力 / 大大力 / 经验力 / 掉物力 / 团战力 / 称号力）、目标属性、等级筛选排序食谱。
5. **伤害计算器（二期）** —— 见 `docs/damage-calc-design.md`。

## 技术栈

- 后端：Python 3.10 + FastAPI（本地 REST API，运行时完全离线）
- 前端：Vue 3 + Element Plus（构建产物由后端托管）
- 桌面化：pywebview 原生窗口 + PyInstaller 打包
- 数据：SQLite（`data/poketools.db` 静态数据只读 + `data/userstate.db` 用户勾选状态）

## 快速开始

```bash
# 1) 安装依赖
pip install -r requirements.txt

# 2) 构建数据库（首次必须，需要先克隆离线数据源）
git clone --depth 1 https://github.com/PokeAPI/pokeapi data/raw/pokeapi
python scripts/build_db.py          # PokeAPI CSV -> data/poketools.db
python scripts/scrape_52poke.py     # 52poke wiki -> data/curated/*.json -> 合并入库
python scripts/fetch_sprites.py     # 下载宝可梦图片到 data/sprites

# 3) 前端（可选：仓库已含构建产物时可跳过）
cd web && npm install && npm run build && cd ..

# 4) 开发模式启动（浏览器访问 http://127.0.0.1:8734）
python app/main.py

# 5) 桌面窗口模式
pythonw launcher.pyw

# 6) 打包 exe
build_exe.bat
```

## 目录结构

```
poketools/
├─ app/                # FastAPI 后端（routers/ API、services/ 算法）
├─ web/                # Vue3 前端源码（构建产物复制到 app/static/dist）
├─ scripts/            # 数据管线：build_db.py / scrape_52poke.py / fetch_sprites.py
├─ data/
│  ├─ raw/pokeapi/     # PokeAPI 离线 CSV（gitignore，需克隆）
│  ├─ curated/         # 52poke 抓取与人工整理数据（JSON，已提交）
│  ├─ poketools.db     # 静态数据（构建产物）
│  └─ userstate.db     # 用户勾选状态
├─ tests/              # pytest
├─ launcher.pyw        # pywebview 桌面启动器
└─ docs/               # 设计文档（二期伤害计算器等）
```

## 数据来源与致谢

- [PokeAPI](https://pokeapi.co)（离线数据集 [PokeAPI/pokeapi](https://github.com/PokeAPI/pokeapi)）：宝可梦 / 形态 / 招式 / 学习方式 / TM 映射 / 剑盾捕捉地点 / 中文名。
- [52poke 中文维基](https://wiki.52poke.com)：朱紫 / 阿尔宙斯 / Z-A 捕捉方式、图鉴描述、招式学习器获取方式、三明治食谱、地点中文名。
- 宝可梦及相关数据 © Nintendo / Creatures Inc. / GAME FREAK inc.，本项目仅为个人本地工具，不作商业用途。

## 测试

```bash
pytest tests/ -v
```
