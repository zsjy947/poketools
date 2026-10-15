/**
 * 对战选择数据基建（名册 / 形态过滤 / 展示名规则）。
 *
 * 选择列表 = 赛制名册 − 机制形态（超进化/极巨化/原始回归）− 对战临时形态 − 等值重复形态，
 * 展示名统一「种名-形态短名」格式。判定依据：
 * - 名册：引擎 species.isNonstandard（champions 系 mod 把名册外物种标 Past；校验器
 *   「在该赛制不存在」即来自同一数据，UI 过滤与其同源）；自由对战（customgame）无条款，
 *   引擎校验放行 Past 物种，列表同样放开（仅排除 Custom 等数据性条目）。
 * - 临时形态：只在对战中由招式/特性/道具触发（如谜拟丘被打破、坚盾剑怪刀剑、太晶 Tera 形态）。
 *   引擎 Pokedex 中带 battleOnly 字段的条目即临时形态（值 = 归属的基础种），动态收集一次缓存，
 *   不在渲染路径逐行调引擎。注意永恒之花（floetteeternal）不是临时形态——champions 里是可选用
 *   的特殊形态（其超进化 floettemega 才是 battleOnly）；gen9 中它标 Past 由名册过滤兜底。
 * - 等值形态：种族值/特性/招式池完全一致、仅外观差异（彩粉蝶花纹、霜奶仙奶油、
 *   一家鼠家庭数、怒鹦哥羽色、来悲粗茶真伪）；南瓜怪人尺寸族存在少量种族值差异
 *  （HP/速度随尺寸递增），按用户要求一并并入默认形态（其他尺寸仍可经 PokePaste 导入使用）。
 * - 不设默认组：形态间不可互相代表（幽尾玄鱼雄/雌、鬃岩狼人昼/夜/黄昏、超能妙喵雄/雌、
 *   爱管侍雄/雌、颤弦蝾螈活泼/低调、洛托姆 6 形态），全部保留且基础条目也带后缀（无裸名项）。
 * - 地区形态：基础种保留裸名，地区形态带「-地区」短后缀（阿罗拉/伽勒尔/洗翠；帕底亚肯泰罗
 *   三种以专表处理）。
 */
import type { SpeciesView } from "../../data";
import { speciesView } from "../../data";
import type { ModdedDex } from "../../engine-adapter";

type DexLike = ReturnType<typeof import("../../data").dexFor> | ModdedDex;

/** 等值合并组：组内全部并入基础条目（判定依据见文件头注释） */
const EQUIV_MERGE_BASES: ReadonlySet<string> = new Set([
  "vivillon", // 彩粉蝶 20 花纹：纯外观
  "maushold", // 一家鼠三只/四只家庭：种族值与特性一致
  "alcremie", // 霜奶仙 7 奶油：纯外观
  "gourgeist", // 南瓜怪人 4 尺寸：少量种族值差异，按要求并入默认（普通尺寸）
  "sinistcha", // 来悲粗茶普通/杰作：真伪茶具差异仅外观
  "squawkabilly", // 怒鹦哥 4 羽色：纯外观
]);

/** 形态短后缀（键 = 引擎物种 id）。不设默认组含基础条目；地区形态仅形态条目 */
const FORME_SUFFIX_ZH: Readonly<Record<string, string>> = {
  // —— 不设默认组（全部带后缀，无裸名项）——
  basculegion: "雄性",
  basculegionf: "雌性",
  lycanroc: "白昼",
  lycanrocmidnight: "黑夜",
  lycanrocdusk: "黄昏",
  meowstic: "雄性",
  meowsticf: "雌性",
  indeedee: "雄性",
  indeedeef: "雌性",
  toxtricity: "活泼",
  toxtricitylowkey: "低调",
  rotom: "普通",
  rotomheat: "加热",
  rotomwash: "洗涤",
  rotomfan: "旋转",
  rotommow: "切割",
  rotomfrost: "冷冻",
  // —— 地区派生覆盖不了的帕底亚肯泰罗三牛 ——
  taurospaldeacombat: "斗战种",
  taurospaldeablaze: "火炽种",
  taurospaldeaaqua: "水澜种",
  // —— 永恒之花：champions 可选特殊形态（可超进化，超进化形态 floettemega 为 battleOnly）——
  floetteeternal: "永恒之花",
  // —— 厄诡椪持久面具形态（引擎 zh-cn 英文占位，中文名走 zh-gen 手工补名）——
  ogerpontteal: "青草面具",
  ogerponwellspring: "水井面具",
  ogerponhearthflame: "火炉面具",
  ogerponcornerstone: "基石面具",
};

/** 地区形态 id 后缀 → 短后缀（基础种保留裸名） */
const REGION_SUFFIX_RULES: ReadonlyArray<[RegExp, string]> = [
  [/alola$/, "阿罗拉"],
  [/galar$/, "伽勒尔"],
  [/hisui$/, "洗翠"],
];

/** 缓存：dex 索引键 → 临时形态 id 集（battleOnly 动态收集，同 dex 只算一次） */
const battleOnlyCache = new WeakMap<object, Set<string>>();

function battleOnlyFormes(dex: DexLike): Set<string> {
  const cached = battleOnlyCache.get(dex as object);
  if (cached) return cached;
  const out = new Set<string>();
  const pokedex = (
    dex as unknown as {
      data: { Pokedex: Record<string, { battleOnly?: string | string[] }> };
    }
  ).data.Pokedex;
  for (const [id, sp] of Object.entries(pokedex ?? {})) {
    if (sp?.battleOnly) out.add(id);
  }
  battleOnlyCache.set(dex as object, out);
  return out;
}

/** 机制形态（对战中由道具/机制触发，不可作为队伍成员）：超进化 / 极巨化 / 原始回归。
 *  超进化用引擎 isMega 字段（yanmega 等正常物种不误伤）；gmax/primal 用 id 后缀。 */
function isMechanicalForm(view: SpeciesView): boolean {
  return view.isMega || /gmax$/.test(view.id) || /primal$/.test(view.id);
}

/** 该物种是否应从选择列表隐藏（仍允许存量数据保留，仅禁止重选） */
export function isHiddenFromRoster(view: SpeciesView, unrestricted: boolean): boolean {
  if (!unrestricted && view.isNonstandard) return true;
  if (view.isNonstandard === "Custom") return true;
  if (isMechanicalForm(view)) return true;
  if (view.battleOnly) return true;
  const base = view.baseSpecies?.toLowerCase().replace(/ /g, "");
  if (base && view.id !== base && EQUIV_MERGE_BASES.has(base)) return true;
  return false;
}

/** 对战可选物种清单：名册/临时/等值过滤后的完整列表（按赛制计算一次缓存于调用方 useMemo）。
 *  不复用 data 层 speciesList——其源头硬编码排除一切 isNonstandard，而自由对战需要放开
 *  名册外物种（引擎 customgame 校验放行 Past），故自行遍历 Pokedex。 */
export function rosterSpecies(dex: DexLike, unrestricted: boolean): SpeciesView[] {
  const battleOnly = battleOnlyFormes(dex);
  const pokedex = (
    dex as unknown as {
      data: { Pokedex: Record<string, { isNonstandard?: string | null }> };
    }
  ).data.Pokedex;
  const out: SpeciesView[] = [];
  for (const key of Object.keys(pokedex ?? {})) {
    const v = speciesView(dex, key);
    if (!v) continue;
    if (!unrestricted && v.isNonstandard) continue;
    if (v.isNonstandard === "Custom") continue;
    if (isMechanicalForm(v)) continue;
    if (battleOnly.has(v.id)) continue;
    const base = v.baseSpecies?.toLowerCase().replace(/ /g, "");
    if (base && v.id !== base && EQUIV_MERGE_BASES.has(base)) continue;
    out.push(v);
  }
  return out;
}

/** 选择列表展示名：种名-形态短名（种名取基础种中文名，短后缀见 FORME_SUFFIX_ZH/地区规则） */
export function speciesLabel(dex: DexLike, id: string): string {
  const view = speciesView(dex, id);
  if (!view) return id;
  const suffix = FORME_SUFFIX_ZH[view.id];
  if (suffix) return `${baseNameOf(dex, view)}-${suffix}`;
  if (view.baseSpecies && view.id !== view.baseSpecies.toLowerCase().replace(/ /g, "")) {
    for (const [re, region] of REGION_SUFFIX_RULES) {
      if (re.test(view.id)) return `${baseNameOf(dex, view)}-${region}`;
    }
  }
  return view.zhName;
}

function baseNameOf(dex: DexLike, view: SpeciesView): string {
  if (view.baseSpecies) {
    const base = speciesView(dex, view.baseSpecies);
    if (base && base.id !== view.id) return base.zhName;
  }
  return view.zhName;
}
