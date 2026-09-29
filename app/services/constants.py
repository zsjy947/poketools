"""跨路由共享的领域常量（P0-1 收编：此前 lookup.py 从 routers/pokemon.py 跨文件导入，
形成 routers 层隐式耦合；常量归属业务层，两路由与本模块统一引用）。"""
from __future__ import annotations

# 每个游戏的招式表结构：学习集 vg、TM 机器 vg、分组 tab（key→中文标签）
# （逐游戏核对过 52poke 各作招式表列：剑盾教授=铠岛/雪原，BDSP 有教授列（tutor8 模板），
#   阿尔宙斯=训练场佐思，朱紫无教授——4 条 PokeAPI tutor 数据在 52poke 为「回忆」，
#   并入升级表以「回忆」标注；Z-A 仅 升级/学习器 两列，无回忆列）
GAME_MOVE_CONFIG = {
    "sword-shield": {"vg": 20, "tm_vgs": [20],
                     "tabs": [("level", "升级"), ("machine", "招式学习器"),
                              ("egg", "蛋招式"), ("tutor", "教授")]},
    "brilliant-diamond-shining-pearl": {"vg": 23, "tm_vgs": [23],
                                        "tabs": [("level", "升级"), ("machine", "招式学习器"),
                                                 ("egg", "蛋招式"), ("tutor", "教授")]},
    "legends-arceus": {"vg": 24, "tm_vgs": [],
                       "tabs": [("level", "升级"), ("tutor", "教授")]},
    # 朱紫：升级表中 level=0（进化时学会）与教授（=回忆，PokeAPI 标 tutor，52poke 为回忆机）
    # 单独「进化&回忆」tab
    "scarlet-violet": {"vg": 25, "tm_vgs": [25],
                       "tabs": [("level", "升级"), ("evolution-recall", "进化&回忆"),
                                ("machine", "招式学习器"), ("egg", "蛋招式")]},
    # tm_vgs 含 vg31（异次元 DLC TM108-160），与 vg30 的 TM001-107 连续编号
    "legends-za": {"vg": 30, "tm_vgs": [30, 31],
                   "tabs": [("level", "升级"), ("machine", "招式学习器")]},
}

# 「进化&回忆」独立 tab 的游戏（level=0 进化招式 + tutor 回忆行）
EVOLUTION_RECALL_GAMES = {"scarlet-violet"}

# 52poke 获得方式模板的形态标记字母 → forms.identifier 后缀（M2 3.5 获取方式按形态过滤）
FORM_MARKER_TO_SUFFIX = {
    "A": "alola", "G": "galar", "H": "hisui", "P": "paldea",
    "W": "white-striped", "B": "blue-striped",
    "D": "dusk", "Mn": "midnight", "N": "midday", "L": "low-key",
    "F": "female", "M": "male", "GM": "gmax",
    "PA": "paldea-combat-breed", "PB": "paldea-blaze-breed", "PC": "paldea-aqua-breed",
}

# 地区后缀 → 中文名（分支条件文本前缀）
SUFFIX_REGION_ZH = {"alola": "阿罗拉", "galar": "伽勒尔", "hisui": "洗翠", "paldea": "帕底亚"}
