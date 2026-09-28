# REFACTOR-PLAN —— 代码库架构重构与全量审查计划

> 状态：**R1 已实施（2026-09-29，P0 五项全部修复）**；R2-R5 待实施。基于五期交付后（M0-M8 全绿：
> pytest 59 / calib 51 案例 + 41 威力表 / ruff 零告警 / 打包冒烟通过）对**全量代码库**的逐文件审查得出。
> 文档命名遵循「内容描述 + 全大写」规范。
> 原则：**行为零变更**——每步重构必须 pytest + calib + 浏览器冒烟三绿后才 commit；
> 涉及公式/取整的文件（damage.py）只做命名与结构搬移，逻辑字节不动。

## 一、现状盘点（审查结论）

### 规模

| 区域 | 文件 | 行数 | 健康度 |
|---|---|---|---|
| 后端 routers | calc 330 / pokemon 490 / lookup 460 / dex 210 | ~1490 | ⚠️ 职责混杂（见 P1） |
| 后端 services | damage 380 / breeding 195 | ~575 | ✅ 算法层清晰 |
| 基础设施 | db 73 / main 74 | ~150 | ✅ |
| 数据管线 | build_db 850 / scrape_52poke 1300 / 其余 6 脚本 | ~2600 | ⚠️ main() 巨函数 |
| 前端 JS | calc 720 / detail 540 / components 300 / 其余 8 视图 | ~2600 | ⚠️ 单文件过大、内联样式多 |
| 前端 CSS | base/dex/features/calc 四件套 | ~300 | ✅ |
| 测试 | conftest + 5 文件（59 用例）+ calib | ~900 | ⚠️ test_api 单文件 330 行 |

### 已达成的规范基线（五期 M8 交付）

- ruff 零告警（E/F/I/B/UP/SIM/PERF/PIE/RUF/BLE，`pyproject.toml`）；
- `node --check` 全部 JS 语法兜底；测试样板收敛 `tests/conftest.py`；
- calib 自动化双引擎对拍（51 案例 + zTable 41 项）；
- 文档单一权威（ARCHITECTURE/DATA-GAPS/USER-MANUAL/AGENTS 四件套）。

## 二、审查发现（按优先级）

### P0 —— 正确性隐患（先修）

| # | 位置 | 问题 | 方案 | 状态 |
|---|---|---|---|---|
| P0-1 | `lookup.py` `from ..routers.pokemon import FORM_MARKER_TO_SUFFIX` | 路由层跨文件导入常量，形成 routers 内隐式耦合；pokemon.py 后续重构会破坏 | 新建 `app/services/constants.py`（或 `app/consts.py`）收编 FORM_MARKER_TO_SUFFIX / SUFFIX_REGION_ZH / GAME_MOVE_CONFIG / EVOLUTION_RECALL_GAMES，两路由与 lookup 统一引用 | ✅ R1 已修（四常量全部收编 `app/services/constants.py`） |
| P0-2 | `calc.py` 调 `damage._ko_summary`（私有函数跨层） | 私有约定被打破；damage 内部改名即断 | damage.py 公开 `ko_summary()`（去掉下划线并导出），`_ko_summary` 保留别名一版后删 | ✅ R1 已修（公开 `ko_summary` + 兼容别名，calc.py 两处改公开名） |
| P0-3 | `db.py` `static_conn()` 每请求新建连接 + 多数端点手动 close（部分 try/finally 部分没有） | 异常路径连接泄漏；sqlite 新建连接虽廉价但 WAL 模式下每次 reopen 有页缓存损失 | 统一 `get_db()` 上下文管理器（`contextlib.closing` 或 FastAPI Depends），routers 全部改造；可选 thread-local 复用 | ✅ R1 已修（`db.get_static_db/get_state_db` Depends 注入，四路由全部端点改造；`_game_dex_species` 缓存函数按注释例外自管） |
| P0-4 | `index.html` 手动 `?v=18` 缓存击穿 | 五期已实际踩坑（改 JS 忘 bump 导致冒烟误报）；忘 bump 会向用户分发旧前端 | 开发模式给 StaticFiles 响应加 `Cache-Control: no-cache`（中间件 12 行），去掉手动版本号；打包版不受影响（本地无缓存问题） | ✅ R1 已修（main.py no-cache 中间件，静态响应不再缓存；手动版本号暂保留为惰性装饰——UPDATE-PLAN §1.5 验收仍要求 bump，两者不冲突） |
| P0-5 | `build_db.py` `guarded()` 只覆盖 scrape 侧合并 | build_db 自身的 curated 装载（evo_branches/form_game_availability）无行数护栏，curated 损坏时静默空表 | 三个 curated 装载各加 min 行数校验（evo_branches≥20 / availability≥150 / z_exclusive≥20） | ✅ R1 已修（`require_rows` 护栏三处：z_exclusive/form_game_availability/evo_branches） |

### P1 —— 架构分层重构（主体工程）

**目标分层**：`routers`（参数校验 + 响应组装，≤150 行/文件）→ `services`（业务与查询）→ `db`（连接）。
判断标准：router 里不应出现多步推导循环（如 dex 默认形态回退、ev 地点合并、进化分支树构建）。

| # | 重构 | 内容 | 验收 |
|---|---|---|---|
| P1-1 | 拆 `services/evolution.py` | `_evolution_chain`/`_evo_condition`/`_decode_natures`/TRIGGER_ZH/SUFFIX_REGION_ZH 从 pokemon.py 迁出（~180 行） | pokemon.py ≤300 行；test_api 全绿 |
| P1-2 | 拆 `services/movesets.py` | GAME_MOVE_CONFIG + 招式分组/排序/TM 组装（pokemon_moves 端点主体 ~90 行） | 同上 |
| P1-3 | 拆 `services/dexquery.py` | dex_entries 的默认形态覆盖/筛选排序 + /api/ev 的 override/wild 合并 + `WILD_METHOD_KEYWORDS` 白名单 | lookup.py 瘦身到 ~250 行 |
| P1-4 | 拆 `routers/recipes.py` | /api/custom-recipes 三端点 + `_recipe_items*` 从 lookup.py 迁出 | 路由前缀不变（回归用例不动） |
| P1-5 | calc.py 去重 | /api/calc 与 /calc/batch 共用 `_compute(con, atk, dfd, mv, opt, zi)`；`_opts`/`_assemble` 保持 | calc.py ≤260 行；calib 全绿 |
| P1-6 | 数据管线函数化 | build_db.py main() 拆 `build_reference/build_species_forms/build_moves/build_learnsets/merge_curated` 五函数；scrape main 拆 `scrape_species/scrape_abilities/scrape_tms/scrape_za/scrape_features/merge_all` 六段 | 管线重跑输出逐行一致（构建后 diff DB 行数报表） |
| P1-7 | curated 派生外移 | dex_default_forms 自动派生与一致性校验（build_db 内 ~90 行）拆 `scripts/derive_dex_defaults.py`（build_db 调用） | 派生结果不变（125 行） |

### P2 —— 规范化与质量（可分批）

| # | 位置 | 内容 |
|---|---|---|
| P2-1 | detail.js / calc.js | 纯函数（KO 文案格式化、formDisplayName、suffix 提取、versionChip）抽 `js/utils.js`（index.html 引入）；两视图瘦身 ≥120 行 |
| P2-2 | 视图内联样式 | detail.js/ev.js 的 `style="..."` 迁 CSS class（约 25 处） |
| P2-3 | api.js 错误处理 | 页面级 catch 与全局 api-error toast 双重提示去重：apiSend 抛错时标记已 toast，页面 catch 判标记 |
| P2-4 | test_api 拆分 | 按 domain 拆 test_api_dex/test_api_pokemon/test_api_calc/test_api_features/test_api_recipes 五文件（用例不变） |
| P2-5 | calib 单一事实源 | harness.mjs 的 cases 数组输出为 `cases.json`，check.py 读同一份（key/参数不再双份维护） |
| P2-6 | schema 微调 | `get_methods(form)` 加索引 `(species_id, game, form)`；`z_exclusive` 增 `crystal_id` 列（对齐 curated，排序不再绕 join）；`abilities` 过滤无中文行（eelevate 等 Champions 条目 64 行移 TODO 即数据侧完成） |
| P2-7 | 前端冒烟固化 | 把本次浏览器冒烟脚本化：`tools/smoke.mjs`（node 逐页打开断言关键 DOM 文案，复用 index.html 已有 `__errs` 收集器断言零错误）；纳入 M8 checklist |
| P2-8 | damage.py 清理 | 删未用的 `poke_round_ratio`；`rnd_half_down` 更名 `poke_round`（与文档/ARCHITECTURE 术语统一，全文替换 + calib 重跑） |
| P2-9 | scrape_52poke 解析器拆文件 | 1300 行拆 `scripts/parsers/wikitext.py`（find_template/split_params/clean_wt/表格工具）+ `parsers/features.py`（三明治/甜甜圈/咖喱），main 留编排 |
| P2-10 | 版本号与启动横幅 | main.py `/` 端点附版本（读 pyproject）；UI 页脚显示版本，打包可追溯 |

### 明确不做（评估后否决）

- **前端引入构建链**（Vite/SFC）：违背「免构建、产物提交仓库」的核心约定，收益不抵成本。
- **ORM/查询构建器**：SQL 已全参数化且数量可控，sqlite 手写 SQL 最直白。
- **store 状态机化**（pinia 式）：单页应用状态极少（gameId/profileId/typeChart），加层无收益。
- **routers 合并成单文件 API 类**：FastAPI 路由函数式即惯用法。
- **pytest 前端单测框架**（vitest 等）：免构建约束下用 P2-7 冒烟脚本覆盖同等风险。

## 三、实施顺序与里程碑

| 里程碑 | 内容 | 回归门槛 | commit |
|---|---|---|---|
| R1（P0）✅ | P0-1..P0-5（2026-09-29 完成；同轮独立安全扫描：SQL 全参数化、静态挂载无穿越、仅绑定 127.0.0.1、写端点校验齐全，无新增高危项） | pytest 60 绿 + ruff 零告警 + node check + 冒烟（中间件头/端点抽查/状态写入回滚） | `fix: 全量审查P0五项修复…` |
| R2（后端分层） | P1-1..P1-5 | 同上 + API 响应逐端点 diff（改造前后用 httpx 录制回放对比） | `refactor(services): routers 瘦身，业务下沉 services` |
| R3（管线） | P1-6..P1-7 | 管线全量重跑，DB 行数报表 diff 一致 | `refactor(scripts): build_db/scrape 函数化，curated 派生外移` |
| R4（前端） | P2-1..P2-3、P2-7 | 浏览器冒烟脚本（新增）全绿 | `refactor(frontend): utils 抽取/内联样式收敛/错误去重/冒烟脚本` |
| R5（测试与微调） | P2-4..P2-6、P2-8..P2-10 | pytest + calib + smoke 三绿 | `test/refactor: 拆分与 calib 单源/schema 微调/版本横幅` |

每个里程碑独立可回滚；R2 是唯一有回归风险的步骤（API diff 工具先行）。

## 四、全量审查测试清单（固化到 ARCHITECTURE §8）

1. `ruff check` 零告警；`node --check` 全 JS；
2. `pytest tests/ -v` 全绿（59 → 拆分后计数不变）；
3. `cd tools/calib && node harness.mjs > smogon_baseline.json && python check.py` 逐 roll 全绿；
4. 管线重建：build_db → build_z_moves → build_db → scrape_52poke → fetch_*（网络可用时）→ 重复 2-3；
5. 浏览器冒烟（tools/smoke.mjs）：图鉴标记/批量/同步 · 详情各栏与形态过滤 · EV 地点列 · 咖喱 151 卡 ·
   三明治/甜甜圈数量行 · 计算器 batch 回填/Z 纯晶自动装备/互斥 toast；
6. `./build_exe.bat` → release 目录 exe+data 完整性检查。

> 以上即「每类改动」的统一回归门槛：公式改动加跑 3；数据改动加跑 4；UI 改动加跑 5；发布加跑 6。

## 五、风险与说明

- R2 的 API diff 回放：用 `httpx` 对改造前后各发一遍全端点请求集（固定 DB 快照），逐字节对比 JSON——
  是防止「顺手改行为」的关键护栏，必须先做。
- damage.py 的 P2-8 更名涉及 ARCHITECTURE §5 术语，文档同步更新。
- P2-6 的 schema 变更会让旧 poketools.db 与新代码不兼容——本项目 DB 本就构建期重建（应用只读），无迁移负担，
  但需要与 release 打包同步（重跑管线）。
- 全程**不动**测试断言（除非断言本身错误）：测试是重构的契约。
