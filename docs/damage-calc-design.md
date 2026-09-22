# 二期设计文档：伤害计算器（不分世代 + 全形态对比）

> 调研对象：Bulbapedia「Damage」公式页（第五世代起/阿尔宙斯/Z-A 三套公式）、
> smogon/damagecalc 与 pkmn-calc 的修正项结构、Pokémon Showdown 伤害计算器（在线比对基准）。

## 0. 需求回顾

- 不分世代：宝可梦/形态/招式可来自任何世代，可跨世代比较（超级进化 vs 极巨化等）。
- 招式列表取**全世代并集**：只要任一世代能学会，就进入可选列表（标注学会世代）。
- 分两步实现：
  - **第一步**：复现"同世代"（现代公式，剑盾/朱紫规则）的单场伤害计算。
  - **第二步**：跨世代/跨游戏规则 + 全形态批量对比 + 与在线工具比对校准。

## 1. 公式（依据 Bulbapedia，逐条落地）

### 1.1 现代公式（第五世代起；剑盾 / 朱紫）

```
Damage = ((2×Level/5 + 2) × Power × A/D / 50 + 2)
         × Targets × PB × Weather × GlaiveRush × Critical
         × random × STAB × Type × Burn × other
```

- 基础伤害整体向下取整；此后的每次乘法**四舍五入（0.5 舍去）**；
  Critical 与 Type 两项**向下取整**。
- `random`：85~100 的整数 / 100（共 16 种 roll）。
- `STAB` 1.5（适应力 2.0）；`Type` 查属性相性表（0.25/0.5/1/2/4…）。
- `other` 修正链以 4096 为基（生命宝珠 5324/4096、达人带 4915/4096、
  异兽提升类 5461/4096 等），按固定顺序相乘，每步取最近整数（0.5 进位），最后 /4096。
- 伤害最低为 1（Type=0 免疫除外）。

### 1.2 传说 阿尔宙斯（独立公式）

```
Damage = (((100 + A + 15×Level) × Power) / (D + 50) / 5)
         × (AtkMod × DefMod) × random × Type × OtherMods
```

- 全程向下取整；STAB 1.25；无特性；
  AtkMod/DefMod（快速/刚猛风格）1.5 / 1 / 0.66；Type 表 0.4/0.5/1/2/2.5。

### 1.3 传说 Z-A（现代公式的变体）

```
Damage = (A × Power × (2×Level/5+2) / 50 / D + 2)
         × Weather × Critical × random × STAB × Type × Burn × other × 0.7
```

- 全程向下取整；能力变化 ×1.5/×0.67；天气 1.2/0.8；末尾全局 ×0.7。

### 1.4 极巨化规则（用于超进化 vs 极巨化对比）

- 极巨化方 HP ×2（展示用）。
- 攻击方招式变为极巨招式：威力按所选"极巨威力"输入
  （提供 90/100/110/120/130/140 预设，对应一般…属性标准威力表），守护等状态不实装。
- 巨兽斩击/巨兽弹击/极巨炮 对极巨化目标 ×2（other 链首位）。

## 2. 能力值计算（现代规则，各游戏通用）

```
HP = floor((2×B + IV + floor(EV/4)) × L / 100) + L + 10     （觉醒值 B=1 时 HP=1 特例）
其他 = floor((floor((2×B + IV + floor(EV/4)) × L / 100) + 5) × Nature)
性格修正 1.1 / 0.9；等级默认 50（可调 1~100）
能力等级：+1=1.5 … +6=3.0；-1=0.667=2/3 …（以分数表示，乘后取整）
```

## 3. 范围裁剪（明确不做的）

- 一级/二级特殊效果仅保留：冻干(冰→水2x)、飞身重压(双属性相乘)、
  巨兽系/极巨炮对极巨化2x、打草结/吃剩的东西等威力按重量类不做（手动改威力即可）。
- 特性只实装常用数值型：适应力、狙击手、有色眼镜、超净之躯( punk rock 简化不做)、
  冰鳞粉、蓬蓬毛、多重鳞片、近距离炮击( Collision Course 系 5461/4096)、
  铁刺? 不做。防御方：滤芯/ Prism 装甲 0.75、神经感应 1.25（攻方）。
- 道具只实装：无 / 生命宝珠 / 达人带 / 讲究头带 / 讲究眼镜 / 讲究围巾 / 磁铁系属性加成道具(1.2?)——
  按第五世代数值：讲究类在能力值阶段 ×1.5，不进 other 链。
- 天气：晴/雨 对火/水 1.5/0.5；场地、戏法防守、极巨化攻防弥补项不做。

## 4. 数据支持（需改 build_db.py 重建）

- 新表 `learnsets_all(form_id, move_id, method, vg)`：**全部**版本组的学习集，
  用于"全世代招式并集"列表；前端按世代号标注。
- 种族值说明：PokeAPI 只提供各形态**当前世代**的种族值。
  本工具以"游戏=数据上下文"：剑盾/朱紫/阿尔宙斯/Z-A 各形态种族值均取当前值
  （对第八/九世代宝可梦即本世代值）；跨世代数值变动的历史差异不实装，界面标注。
- 属性相性表：硬编码 18×18 现代相性（含第六世代起妖精、钢不再抗幽灵恶）。

## 5. 接口设计

```
POST /api/calc           单次计算
  { attacker:{species_id, form_id?, level, nature, ev{...}, iv{...}, boosts{atk,spa}, stat_stage, burn,
              game, move_id, move_power_override?, is_max?, max_power?, crit, item, ability},
    defender:{species_id, form_id?, level, nature, ev, iv, boosts{def,spd}, screens, weather_side,
              game, is_dynamax?, ability},
    formula: "modern" | "pla" | "za" }
  → { stats:{atk,def,...}, rolls:[16], min, max, hp, pct:{min,max}, ohko, effectiveness }

POST /api/calc/compare-forms
  { side: "attacker"|"defender", base:{...固定一方+招式...}, species_id }
  → [ {form, label, types, min, max, pctMax, ohko} ]  按伤害排序

GET  /api/calc/moves?species_id=   全世代招式并集（含每招式的世代标签与默认威力/属性/分类）
GET  /api/meta/natures             性格表（来自 CSV natures.csv）
```

## 6. 比对校准方案

1. 内建向量：Bulbapedia 官方算例——75 级冰伊布(攻击 123) 冰牙(65, 物理, STAB)
   vs 163 防御烈咬陆鲨(龙/地, 4×弱点)，无其他修正 → **168~196**（写进 pytest）。
2. 在线比对：用浏览器打开 Pokémon Showdown 伤害计算器（calc.pokemonshowdown.com），
   输入相同案例（含性格/努力值/道具/天气/会心一击组合 3~5 组），逐项比对 min~max，
   不一致时修公式（重点核对取整顺序）。
3. 极巨化对比案例：耿鬼极巨化(HP×2) 承接 超级喷火龙Y 大字爆炎? 类似组合在 Showdown 上核对。

## 7. 前端

新增「伤害计算器」页：左右攻防卡片（宝可梦搜索/形态/等级/性格/努力值/个体值/能力等级/
道具/特性/天气/盾牌/极巨化开关）、中央招式选择（全世代并集列表，属性分类威力标注，
极巨威力输入）、结果区（16 roll 区间、HP%、是否确一）；
「对比全部形态」按钮弹出按伤害排序的形态表。菜单解禁 🧮 入口。
