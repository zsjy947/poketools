# SELF-ITERATION —— 三期完成后的自我迭代记录

> 按 PLAN.md 要求：功能全部完成后进行代码合格性审查与自我迭代优化，本文记录三轮迭代的全部内容与验证结果。

## 第一轮：独立代码审查 → 修复（26 项）

由独立审查代理对三期全部改动做只读审查，产出 26 项问题（3 P0 / 8 P1 / 15 P2），全部修复并补回归测试（`tests/` 从 24 个增至 35 个，全绿；Showdown 逐 roll 校准无回归）。

### P0（错误数据/功能失效）

| # | 问题 | 修复 | 验证 |
|---|---|---|---|
| 1 | 灼伤勾选完全无效：前端把 `burn` 放进 attacker 子对象，后端只读顶层 | doCalc/compare 请求体顶层补 `burn: A.burn` | 物理招 21→10（减半）；毅力+灼伤 21→31 |
| 2 | Z-A 公式未接入：`formula="za"` 落入现代公式分支 | 新增 `calc_damage_za`（能力等级 ×1.5/×0.67 逐级取整、天气 1.2/0.8、末尾 ×0.7 向下取整） | 现代最大伤害 45 → Z-A 31（≈×0.7） |
| 3 | 甲贺忍蛙 Ash 形态标签乱码「卡璞·鸣鸣（阿ンロド）」 | FORM_SUFFIX_ZH `"ash"` → 「羁绊变身」 | DB 10117 = 羁绊变身 |

### P1（用户可见缺陷）

| # | 问题 | 修复 |
|---|---|---|
| 4 | 洗翠进化条件文案「刚猛/迅疾」颠倒 | TRIGGER_ZH 互换 |
| 5 | 详情页切换形态后招式表不跟随 | `watch(formId, loadMoves)` |
| 6 | 剑盾 TR(100-199) 显示成 TM | machines 透出 item_identifier，接口/前端按 `kind` 显示 TR（黄色标签） |
| 7 | 进化条件地点是英文 slug（blush-mountain） | build_db 改用 `location_names` 简中（火特力山…） |
| 8 | encounters 的 species_id 列误存形态 id（1605 行永远查不到） | 构建时经 pokemon.csv 映射真实物种 id；重建后 0 行无效 |
| 9 | compare-forms 循环内查招式(N+1)且 move 缺失时 500 | 循环外查一次 + 404 |
| 10 | 生蛋链未知 game 直接 KeyError 500；目标不在 learners 时 500 | 入口校验 400；`shared()` 用 target_groups 兜底 |
| 11 | /api/state 缺键/非数字 500 | 统一 `_int_or_400` → 400 |

### P2（质量/性能）

删除 damage.py 死代码（ITEMS/chain4096/_other_chain/_weather_mult）与错误注释；性格/道具元数据模块级缓存（同页 3-5 次重复请求 → 1 次）；删除未用的 GAME_NAMES 与 default_profile_id；努力值随形态切换（forms 行自带 ev 列）；state_conn 只初始化一次建表；/api/ev 游戏图鉴映射 lru_cache；自定义食谱入参校验与长度截断；egg_groups 读取 hack 清理；METHOD_IDS_ALL 去重；未用 import；PLA「敏捷」→「迅疾」官方术语；goBack 调试遗留清理。

## 第二轮：功能体验自我迭代（3 项 + 打包验证）

| 项 | 内容 | 验证 |
|---|---|---|
| 返回恢复图鉴 tab | 详情返回带 `?dex=`，图鉴页 hash 参数 > sessionStorage > 默认依次恢复 | 从蓝莓图鉴进入详情再返回 → 激活「蓝莓图鉴0/243」 |
| 详情页上一只/下一只 | 按当前图鉴编号顺序跳转（仅图鉴内物种启用） | 蓝莓图鉴 嘟嘟利(85) → 下一只 → 蛋蛋(102)；图鉴外物种按钮禁用 |
| 全局错误提示 | api.js 失败派发 `api-error`，app.js 统一 toast「请求失败：…」 | 手动断言事件链路；不再静默 unhandledrejection |
| exe 打包验证 | 修复 build_exe.bat 图标路径（`\\a` 转义事故）后重打包 | PyInstaller 成功产出含精灵球图标的 Poketools.exe |

## 遗留观察（记录不阻塞）

- Z-A 94 种学习集缺失、SV 31 个 TM 无获取文本：**数据源缺口**（52poke 未收录），见 `DATA-GAPS.md`；抓取脚本下次运行自动补齐。
- 计算器防御方「回血类道具」（吃剩的东西等）仅列出标注「不参与计算」，伤害占比模拟未实装——需要回合制模拟，超出单次计算范围。
- 图鉴网格一次渲染 400+ 卡片实测流畅；若未来加入全国图鉴可考虑虚拟滚动（当前需求明确不要全国图鉴）。

## 结论（前两轮）

两轮迭代后：35 个测试全绿、Showdown 校准一致、五游戏入口与全部功能页浏览器实测零 JS 报错、exe 打包链路可用。项目满足 PLAN.md「修改方向」全部条目，缺口已文档化。

---

# 第三轮：四期（P1-P5）交付后的三路独立审查 → 修复

四期 P1-P5 全部交付后（设计文档合并/资产升级/详情页重设计/形态拆分/档案移除/特化页录入重做/计算器推倒重建/release 打包/wiki 客户端抽取），由三个独立审查代理分别审查后端、前端、文档与数据一致性，产出 3 P0 + 9 P1 + 多项 P2，全部修复并验证。

## P0（计算/数据错误）

| # | 问题 | 修复 | 验证 |
|---|---|---|---|
| 1 | 帮助挂在 finalMod 链，与 @smogon/calc 的 bpMods 语义不符（数值偏高约 3%） | 移到威力阶段：`power = rnd_half_down(power*6144/4096)` | calib 新增 helping_hand_eq 用例逐 roll 一致（199~235） |
| 2 | 青草场地对全部地面招式减半且挂错链（smogon 仅地震/跺脚 + 防守方接地，且是威力修正） | 限定 `identifier in (earthquake, bulldoze)` + 接地判定（排除漂浮与飞行系），改威力阶段 ×2048/4096 | calib grassy_terrain_eq 一致（67~79）；测试补飞行系/非地震招式不受影响 |
| 3 | 机制互斥校验漏掉原始回归/超极巨化形态（PokeAPI is_mega=0） | `_assemble` 的 is_mega 补 `identifier endswith -primal/-gmax` | 固拉多原始回归 + Z 现在返回 400 |

## P1（用户可见缺陷）

| # | 问题 | 修复 |
|---|---|---|
| 4 | 达摩狒狒「伽勒尔的样子」错绑到达摩模式形态（取最短 identifier） | 显式映射「伽勒尔的样子，达摩模式」→galar-zen + 匹配打分（尾部精确>整体>中缀，中缀时 -standard 优先）；重跑后两形态各有介绍 |
| 5 | 洗翠限定种单段字段的段尾「（洗翠的样子）」标记泄入默认介绍（16 形态缺数据） | `segs[0]` 也过 `_strip_form_marker`；重跑后 hisui 覆盖 5→16 种、LA 默认介绍脏尾巴清零、form_flavor 149→166 行 |
| 6 | wiki_client 429/502 内层重试无上限可死循环 | 内层 5 次上限后转外层退避 |
| 7 | 抓取失败时空解析会清空已交付 DB 表 | merge 加护栏（各表最小行数，过低跳过并保留原表；flavor_rows 为空跳过） |
| 8 | compare-forms 循环内吞掉机制互斥 400 | 固定方循环外校验一次；被遍历方冲突形态静默跳过（不可能组合） |
| 9 | effects.level 非数字 → 500 | 转 400「effects.level 无效」 |
| 10 | 前端 hashchange 监听器泄漏（每次进详情页累积，请求放大） | `onUnmounted` 移除监听 |
| 11 | loadMoves 无竞态防护（慢请求旧形态覆盖新形态表）+ 翻页双份请求 | moveToken 代际校验 + suppressMoveWatch 抑制程序化赋值触发的 watch |
| 12 | 机制从超级进化切走后 formId 仍是 mega 形态 → 全部请求 400 且误报「变化招式」 | 切走时恢复默认形态；结果条区分 status_or_no_power 与其他错误 |

## P2（质量）

recall 并入升级组后去重键改 (分组, 招式)；Z-A 子页无 `{{game|ZA}}` 小节的 221 种补记 TODO（此前静默）；detailCache 上限 40 条；预取改在 loadNav 完成后触发；计算器 natures 同步写全局缓存；base.css 拆分残留重写（拆分切片 bug 导致整段重复）；img-missing 规则补形态tab/进化链/对战场三处；donuts API 失败 loading 卡死修复；启动期双算消除；死代码（`const {h}=Vue`）移除。

## 文档纠偏（审查第三路）

- DATA-GAPS §1 Z-A 覆盖数 269/94 → **49 有/315 缺**（94 无子页 + 221 无 ZA 小节）——并补管线静默丢弃修复；
- README「三套公式」→ 计算器三区布局描述；分发说明改 release/poketools/；
- DESIGN API 表 profiles 标注下线；表数 24→25（补 form_flavor）；§5 补威力阶段修正/极光幕/天气别名；§6 css 拆分；
- USER-MANUAL 朱紫招式表去掉教授、补剑盾/BDSP 有教授；
- 清理空 web/ 目录与仓库根旧 exe。

## 结论（第三轮）

38 个 pytest 全绿；calib 扩到 **10 案例逐 roll 全绿**（新增帮助/青草场地两个对 smogon 的基准）；全站 8 页面浏览器 smoke 零 JS 报错；数据管线修复后 form_flavor 166 行、洗翠 16 种全覆盖。四期 P1-P5 + 审查修复全部完成。
