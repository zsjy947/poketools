/* 伤害计算器共享模型与工具（自 CalcPage.tsx 抽出，纯位移）：
 * SideState 端态、形态/道具/Z 派生助手、物种缓存与 meta 预热、场地常量。 */
import { TYPE_LIST, apiGet } from "../../data/api";

export const itemIdOf = (ident: string): string => ident.toLowerCase().replace(/[^a-z0-9]/g, "");
/* 超级进化石随形态自动锁定、Z 纯晶随 Z 标记自动装备——均不进下拉 */
export const isAutoEquipStone = (ident: string): boolean =>
  ident !== "eviolite" &&
  (/ite(-[xyz])?$/.test(ident) || ident === "keystone" || ident.endsWith("-z"));

/* ---- 模块级 meta 缓存 + 预热 ---- */
export interface MetaCache {
  species: any[] | null;
  items: any[] | null;
  abilities: string[] | null;
  zMoves: any | null;
  maxMoves: any[] | null;
  gmaxMoves: any[] | null;
  natures: any[] | null;
}
export const _metaCache: MetaCache = {
  species: null,
  items: null,
  abilities: null,
  zMoves: null,
  maxMoves: null,
  gmaxMoves: null,
  natures: null,
};
export const _metaPromises: Record<string, Promise<any>> = {};
export const META_URLS: Record<keyof MetaCache, string> = {
  species: "/api/meta/species",
  items: "/api/meta/items",
  abilities: "/api/meta/abilities",
  zMoves: "/api/meta/z-moves",
  maxMoves: "/api/meta/max-moves",
  gmaxMoves: "/api/meta/gmax-moves",
  natures: "/api/meta/natures",
};
export function warmMeta(key: keyof MetaCache, url?: string): Promise<any> {
  if (_metaCache[key]) return Promise.resolve(_metaCache[key]);
  if (!_metaPromises[key]) {
    _metaPromises[key] = apiGet(url || META_URLS[key]).then((r) => {
      (_metaCache as any)[key] = r;
      delete _metaPromises[key];
      return r;
    });
  }
  return _metaPromises[key];
}
export function warmCalcMeta(): void {
  /* U10：常驻预热——进入应用即开始加载，首入计算器有现成数据 */
  warmMeta("species", "/api/meta/species");
  warmMeta("items", "/api/meta/items");
  warmMeta("abilities", "/api/meta/abilities");
  warmMeta("zMoves", "/api/meta/z-moves");
  warmMeta("maxMoves", "/api/meta/max-moves");
  warmMeta("gmaxMoves", "/api/meta/gmax-moves");
  warmMeta("natures", "/api/meta/natures");
  for (const src of [
    "/assets/mechanism/dynamax.png",
    ...TYPE_LIST.map((t) => `/assets/mechanism/tera_${t}.png`),
    "/assets/mechanism/tera_星晶.png",
  ]) {
    new Image().src = src;
  }
}

/* forms/moves 每物种缓存（FIFO 24） */
export const _speciesCache = new Map<number, { forms: any[]; moves: any[] }>();
export async function fetchSpeciesData(sid: number) {
  if (_speciesCache.has(sid)) return _speciesCache.get(sid)!;
  const [forms, moves] = await Promise.all([
    apiGet("/api/calc/forms", { species_id: sid }),
    apiGet("/api/calc/moves", { species_id: sid }),
  ]);
  const data = { forms, moves };
  _speciesCache.set(sid, data);
  if (_speciesCache.size > 24) _speciesCache.delete(_speciesCache.keys().next().value!);
  return data;
}

export function isMegaForm(f: any): boolean {
  return !!(f && (f.is_mega || /-(mega|primal)/.test(f.identifier || "")));
}
export function isGmaxForm(f: any): boolean {
  return !!(f && /-gmax/.test(f.identifier || ""));
}

export interface SideState {
  speciesId: number | null;
  formId: number | null;
  forms: any[];
  nameZh: string;
  level: number;
  nature: string;
  evs: Record<string, number>;
  ivs: Record<string, number>;
  boosts: Record<string, number>;
  ability: string;
  item: string;
  teraOn: boolean;
  teraType: string;
  maxOn: boolean;
  zMarks: boolean[];
  zLocked: string | null;
  moves: Array<number | null>;
  varPowers: Record<number, number>;
  moveOptions: any[];
  moveResults: any[];
  lastStats: any;
  hazardHp?: number;
  burn: boolean;
  crit: boolean;
  helping: boolean;
  statuses: string[];
  screen: string;
  friendGuard: boolean;
  flowerGift: boolean;
  steely: boolean;
  battery: boolean;
  powerSpot: boolean;
  foresight: boolean;
  tailwind: boolean;
  powerTrick: boolean;
  switching: boolean;
  hazards: { rocks: boolean; spikes: number; saltCure: boolean; leechSeed: boolean };
}

export function blankSide(): SideState {
  return {
    speciesId: null,
    formId: null,
    forms: [],
    nameZh: "",
    level: 50,
    nature: "hardy",
    evs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
    ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 },
    boosts: { atk: 0, spa: 0, def: 0, spd: 0 },
    ability: "",
    item: "",
    teraOn: false,
    teraType: "一般",
    maxOn: false,
    zMarks: [false, false, false, false],
    zLocked: null,
    moves: [null, null, null, null],
    varPowers: {},
    moveOptions: [],
    moveResults: [null, null, null, null],
    lastStats: null,
    burn: false,
    crit: false,
    helping: false,
    statuses: [],
    screen: "",
    friendGuard: false,
    flowerGift: false,
    steely: false,
    battery: false,
    powerSpot: false,
    foresight: false,
    tailwind: false,
    powerTrick: false,
    switching: false,
    hazards: { rocks: false, spikes: 0, saltCure: false, leechSeed: false },
  };
}

export async function loadSpeciesInto(
  setSide: (s: SideState) => void,
  getSide: () => SideState,
  sid: number,
): Promise<SideState> {
  const names = _metaCache.species
    ? Object.fromEntries(_metaCache.species.map((x) => [x.id, x.name_zh]))
    : {};
  const data = await fetchSpeciesData(sid);
  const s = { ...getSide() };
  s.speciesId = sid;
  s.nameZh = names[sid] || "";
  s.zMarks = [false, false, false, false];
  s.zLocked = null;
  s.teraOn = false;
  s.maxOn = false;
  s.forms = data.forms;
  s.formId = s.forms.length ? s.forms[0].id : null;
  const f = s.forms.find((x) => x.id === s.formId);
  pickDefaultAbility(s, f);
  s.moveOptions = data.moves;
  /* 默认四招：优先 STAB 高威力 */
  const types = new Set(((f && f.types) || "").split(",").filter(Boolean));
  const damaging = s.moveOptions.filter((m) => m.power).sort((a, b) => b.power - a.power);
  const stab = damaging.filter((m) => types.has(m.type_zh));
  const rest = damaging.filter((m) => !types.has(m.type_zh));
  const picked = [...stab, ...rest].slice(0, 4).map((m) => m.move_id);
  s.moves = [0, 1, 2, 3].map((i) => (picked[i] != null ? picked[i]! : null));
  syncFormDerived(s);
  setSide(s);
  return s;
}

export function pickDefaultAbility(s: SideState, f: any): void {
  if (!f || !f.ability_list || !f.ability_list.length) {
    s.ability = "";
    return;
  }
  const own = f.ability_list.find((a: any) => !a.hidden);
  s.ability = (own || f.ability_list[0]).name;
}
export function syncFormDerived(s: SideState): void {
  const f = s.forms.find((x) => x.id === s.formId);
  if (!f) return;
  if (isGmaxForm(f)) s.maxOn = true;
  if (isMegaForm(f)) {
    s.teraOn = false;
    s.maxOn = false;
    s.zMarks = [false, false, false, false];
  }
}

export function exclusiveZHit(s: SideState, move: any, zMeta: any): any | null {
  const ex = ((zMeta && zMeta.exclusive) || []).find(
    (x: any) => x.species_id === s.speciesId && x.base_move_id === move.move_id,
  );
  if (!ex) return null;
  const suf = ex.form_suffix || "";
  if (suf) {
    const f = s.forms.find((x) => x.id === s.formId);
    const ident = (f && f.identifier) || "";
    const ok = suf.split(",").some((p: string) => {
      const qq = p.trim();
      return qq && (ident.endsWith("-" + qq) || ident.includes("-" + qq + "-"));
    });
    if (!ok) return null;
  }
  return ex;
}

export function zCrystalFor(s: SideState, move: any, items: any[], zMeta: any): string {
  if (!items || !zMeta) return "";
  const ex = exclusiveZHit(s, move, zMeta);
  const ident = ex
    ? ex.crystal_identifier
    : (() => {
        const g = (zMeta.generic || []).find((x: any) => x.type === move.type_zh);
        return g ? g.crystal_identifier : "";
      })();
  if (!ident) return "";
  const hit = items.find((i) => i.identifier === ident);
  return hit ? hit.name_zh : "";
}

/* U10：下拉「过滤 + 可见上限」通用选择器 */

export const SCREENS = [
  { v: "reflect", t: "反射壁" },
  { v: "light_screen", t: "光墙" },
  { v: "aurora", t: "极光幕" },
];
export const SHOW_STATUSES = ["中毒", "剧毒", "冰冻", "睡眠", "麻痹"];
