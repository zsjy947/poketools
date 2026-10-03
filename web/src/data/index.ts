/**
 * 数据访问层：图鉴/招式/道具/特性/学习表查询 + 官方简中名（zh-cn 文本数据）。
 * 一切 UI 数据访问经本层（00 §6.5 分层约束），UI 不直接触碰引擎 Dex。
 */
import { Dex } from "../engine-adapter";
import type { AbilityData, ItemData, SpeciesData } from "../engine-adapter";
import { zhOfPatched, zhTable, ZH_ITEM_DESC } from "./zh-patch";

export { zhLine } from "./zh-patch";

export interface SpeciesView {
  id: string;
  num: number;
  name: string;
  zhName: string;
  types: string[];
  baseStats: { hp: number; atk: number; def: number; spa: number; spd: number; spe: number };
  abilities: string[];
  isMega: boolean;
  isNonstandard?: string | null | undefined;
  baseSpecies?: string | undefined;
  forme?: string | undefined;
  otherFormes?: string[] | undefined;
}

export interface MoveView {
  id: string;
  name: string;
  zhName: string;
  type: string;
  basePower: number;
  accuracy: number | true;
  pp: number;
  category: "physical" | "special" | "status";
  priority: number;
  desc: string;
}

export interface ItemView {
  id: string;
  name: string;
  zhName: string;
  desc: string;
  megaEvolves?: string | undefined;
}
export interface AbilityView {
  id: string;
  name: string;
  zhName: string;
  desc: string;
}

export interface NamedText {
  Pokedex: Record<string, { name?: string }>;
  Moves: Record<string, { name?: string; shortDesc?: string; desc?: string }>;
  Abilities: Record<string, { name?: string }>;
  Items: Record<string, { name?: string }>;
}

export const TYPE_ZH: Record<string, string> = {
  Normal: "一般",
  Fire: "火",
  Water: "水",
  Electric: "电",
  Grass: "草",
  Ice: "冰",
  Fighting: "格斗",
  Poison: "毒",
  Ground: "地面",
  Flying: "飞行",
  Psychic: "超能力",
  Bug: "虫",
  Rock: "岩石",
  Ghost: "幽灵",
  Dragon: "龙",
  Dark: "恶",
  Steel: "钢",
  Fairy: "妖精",
};

export const NATURE_ZH: Record<string, string> = {
  Adamant: "固执",
  Bashful: "怕寂寞",
  Bold: "大胆",
  Brave: "勇敢",
  Calm: "沉着",
  Careful: "慎重",
  Docile: "温顺",
  Gentle: "温和",
  Hardy: "勤奋",
  Hasty: "急躁",
  Impish: "淘气",
  Jolly: "爽朗",
  Lax: "乐天",
  Lonely: "孤僻",
  Mild: "慢吞吞",
  Modest: "内敛",
  Naive: "天真",
  Naughty: "顽皮",
  Quiet: "冷静",
  Quirky: "浮躁",
  Rash: "马虎",
  Relaxed: "悠闲",
  Sassy: "自大",
  Serious: "认真",
  Timid: "胆小",
};

export const STATUS_ZH: Record<string, string> = {
  brn: "灼伤",
  par: "麻痹",
  slp: "睡眠",
  psn: "中毒",
  tox: "剧毒",
  frz: "冰冻",
};

export const STAT_ZH: Record<string, string> = {
  hp: "HP",
  atk: "攻击",
  def: "防御",
  spa: "特攻",
  spd: "特防",
  spe: "速度",
};

const STATUS_LABEL: Record<string, string> = { P0: "可用", P1: "可用（归档）" };
export function modStatusLabel(f: { priority: string }): string {
  return STATUS_LABEL[f.priority] ?? "可用";
}

/** zh-cn 文本缓存（一次加载） */
let zhCache: NamedText | null = null;
export function zhText(): NamedText {
  if (!zhCache) {
    zhCache = Dex.mod("base").loadTextData("zh-cn") as unknown as NamedText;
  }
  return zhCache;
}

function zhOf(table: Record<string, { name?: string }>, id: string, fallback: string): string {
  // 引擎 zh-cn 优先；缺失或值仍是英文占位（Gmax/Mega 形态、进化石、champions 新条目）走补丁表
  const engine = table[id]?.name;
  if (engine && /[一-鿿]/.test(engine)) return engine;
  const patched = zhOfPatched(zhTable(zhText()), id, "");
  if (patched) return patched;
  return engine || fallback;
}

/** 按赛制解析 mod dex（formats.id → mod），UI 一切查询带赛制上下文 */
export function dexFor(formatMod: string) {
  return Dex.mod(formatMod === "base" ? undefined : formatMod);
}

export function speciesView(dex: ReturnType<typeof dexFor>, id: string): SpeciesView | null {
  const sp = dex.species.get(id);
  if (!sp.exists) return null;
  const zh = zhText().Pokedex;
  return {
    id: sp.id,
    num: sp.num,
    name: sp.name,
    zhName: zhOf(zh, sp.id, sp.name),
    types: sp.types,
    baseStats: sp.baseStats,
    abilities: Object.values(sp.abilities ?? {}).filter(Boolean) as string[],
    isMega: !!sp.isMega,
    isNonstandard: sp.isNonstandard,
    baseSpecies: sp.baseSpecies,
    forme: sp.forme,
    otherFormes: sp.otherFormes,
  };
}

export function moveView(dex: ReturnType<typeof dexFor>, id: string): MoveView | null {
  const mv = dex.moves.get(id);
  if (!mv.exists) return null;
  return {
    id: mv.id,
    name: mv.name,
    zhName: zhOf(zhText().Moves, mv.id, mv.name),
    type: TYPE_ZH[mv.type] ?? mv.type,
    basePower: mv.basePower,
    accuracy: mv.accuracy,
    pp: mv.pp,
    category: mv.category,
    priority: mv.priority,
    desc: zhMoveDesc(mv.id, mv),
  };
}

/** 招式说明：优先中文 shortDesc（zh-cn 文本），缺则回退英文 desc/shortDesc */
function zhMoveDesc(id: string, mv: { desc?: string; shortDesc?: string }): string {
  const zh = zhText().Moves[id];
  return zh?.shortDesc || zh?.desc || mv.desc || mv.shortDesc || "";
}

export function itemView(dex: ReturnType<typeof dexFor>, id: string): ItemView | null {
  const it = dex.items.get(id);
  if (!it.exists) return null;
  return {
    id: it.id,
    name: it.name,
    zhName: zhOf(zhText().Items, it.id, it.name),
    desc: ZH_ITEM_DESC[it.id] || it.desc || it.shortDesc || "",
    megaEvolves: it.megaEvolves,
  };
}

export function abilityView(dex: ReturnType<typeof dexFor>, id: string): AbilityView | null {
  const ab = dex.abilities.get(id);
  if (!ab.exists) return null;
  return {
    id: ab.id,
    name: ab.name,
    zhName: zhOf(zhText().Abilities, ab.id, ab.name),
    desc: ab.desc || ab.shortDesc || "",
  };
}

/** 可选物种清单（队伍编辑器搜索）：排除不存在/未发布的基础形态 */
export function speciesList(dex: ReturnType<typeof dexFor>): SpeciesView[] {
  const out: SpeciesView[] = [];
  for (const key of Object.keys(
    (dex as unknown as { data: { Pokedex: Record<string, SpeciesData> } }).data.Pokedex ?? {},
  )) {
    const v = speciesView(dex, key);
    if (v && !v.isNonstandard) out.push(v);
  }
  return out;
}

/** 物种可学招式（getMovePool：本赛制世代内可学并集，含预进化/家族形态，合法性由校验器把关） */
export function learnableMoves(dex: ReturnType<typeof dexFor>, speciesId: string): MoveView[] {
  const sp = dex.species.get(speciesId);
  if (!sp.exists) return [];
  const out: MoveView[] = [];
  for (const id of dex.species.getMovePool(sp.id)) {
    const v = moveView(dex, id);
    if (v) out.push(v);
  }
  return out.sort((a, b) => a.zhName.localeCompare(b.zhName, "zh"));
}

/** 道具清单（按赛制过滤不可用） */
export function itemList(dex: ReturnType<typeof dexFor>): ItemView[] {
  const out: ItemView[] = [];
  const items = (dex as unknown as { data: { Items: Record<string, ItemData> } }).data.Items ?? {};
  for (const key of Object.keys(items)) {
    const it = items[key];
    if (!key || !it || it.isNonstandard) continue;
    const v = itemView(dex, key);
    if (v) out.push(v);
  }
  return out;
}

/** 特性清单 */
export function abilityList(dex: ReturnType<typeof dexFor>): AbilityView[] {
  const out: AbilityView[] = [];
  const abilities =
    (dex as unknown as { data: { Abilities: Record<string, AbilityData> } }).data.Abilities ?? {};
  for (const key of Object.keys(abilities)) {
    const ab = abilities[key];
    if (!key || !ab || ab.isNonstandard) continue;
    const v = abilityView(dex, key);
    if (v) out.push(v);
  }
  return out;
}

/** 展示名：昵称为空或等于种名（中/英，PS 导入会带种名作昵称）时显示中文种名，自定义昵称原样 */
export function displayName(
  dex: ReturnType<typeof dexFor>,
  species: string,
  name?: string,
): string {
  const sp = speciesView(dex, species);
  const nick = name ?? "";
  if (!nick || nick === sp?.name || nick === sp?.zhName) {
    return sp?.zhName ?? species;
  }
  return nick;
}

/** 性格清单（简中名 + 升降） */
export function natureList(): Array<{
  id: string;
  name: string;
  zhName: string;
  plus?: string | undefined;
  minus?: string | undefined;
}> {
  return Dex.mod("base")
    .natures.all()
    .map((n) => ({
      id: n.id,
      name: n.name,
      zhName: NATURE_ZH[n.name] ?? n.name,
      plus: n.plus ? (STAT_ZH[n.plus] ?? n.plus) : undefined,
      minus: n.minus ? (STAT_ZH[n.minus] ?? n.minus) : undefined,
    }));
}
