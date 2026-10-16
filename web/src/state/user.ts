/* 用户状态（唯一实现）：caught_state / custom_recipes 迁 localStorage（路线 B）。
 * localStorage 键与 Vue 版一致（pkt.caught_state.v1 / pkt.custom_recipes.v1）——用户数据零迁移；
 * 端点签名与响应结构与原 app/routers/dex.py、lookup.py 一致。
 * 收集标记为物种级：一次标记传播到该物种所在的全部图鉴（跨游戏）+ "national" 伪 dexId
 * （全国图鉴 = 各地区图鉴并集，任一地区捕获 ⇔ 全国捕获）。 */
import { table } from "../data/core";

const K_CAUGHT = "pkt.caught_state.v1"; // {dexId: {speciesId: 0/1}}；national 为伪 dexId 键
const K_RECIPES = "pkt.custom_recipes.v1"; // [{id, game, name, effects, ingredients, seasonings, created_at}]
export const NATIONAL_DEX = "national";
export const PROFILE = 1;
const RECIPE_GAMES = ["scarlet-violet", "legends-za"];

function store(): Storage | null {
  try {
    return localStorage;
  } catch {
    return null;
  }
}
function readJson(key: string, dflt: any): any {
  const s = store() && store()!.getItem(key);
  if (!s) return dflt;
  try {
    return JSON.parse(s);
  } catch {
    return dflt;
  }
}
function writeJson(key: string, v: any): void {
  if (store()) store()!.setItem(key, JSON.stringify(v));
}

// ---- dex_entries → 全局图鉴索引（species → dexIds，跨游戏全量）----
let allDexIdx: Map<number, string[]> | null = null;
async function allDexIndex(): Promise<Map<number, string[]>> {
  if (allDexIdx) return allDexIdx;
  const bySp = new Map<number, string[]>();
  for (const e of await table("dex_entries")) {
    let arr = bySp.get(e.species_id);
    if (!arr) {
      arr = [];
      bySp.set(e.species_id, arr);
    }
    if (!arr.includes(e.dex_id)) arr.push(e.dex_id);
  }
  allDexIdx = bySp;
  return bySp;
}

/** 物种级标记的传播目标：所在全部图鉴（跨游戏）+ national 伪键（并集语义）。 */
async function propagateTargets(speciesId: number): Promise<string[]> {
  const idx = await allDexIndex();
  const dexIds = (idx.get(speciesId) || []).slice();
  if (!dexIds.includes(NATIONAL_DEX)) dexIds.push(NATIONAL_DEX);
  return dexIds;
}

async function validateDexId(dexId: string): Promise<void> {
  if (dexId === NATIONAL_DEX) return;
  const dexes = await table("regional_dexes");
  if (!dexes.find((d) => d.id === dexId)) throw new Error("dex_id 无效");
}

// ---- /api/state（PUT）/api/state/bulk（POST）/api/state/counts（GET） ----
export async function setState(body: any): Promise<{ ok: boolean; synced_dexes: string[] }> {
  const dexId = body.dex_id || "";
  const speciesId = parseInt(body.species_id, 10);
  if (!dexId) throw new Error("dex_id 必填");
  if (!Number.isInteger(speciesId)) throw new Error("species_id 无效");
  const caught = body.caught ? 1 : 0;
  await validateDexId(dexId);
  let dexIds = await propagateTargets(speciesId);
  if (!dexIds.includes(dexId)) dexIds = dexIds.concat([dexId]);
  const all = readJson(K_CAUGHT, {});
  for (const d of dexIds) {
    all[d] = all[d] || {};
    all[d][String(speciesId)] = caught;
  }
  writeJson(K_CAUGHT, all);
  return { ok: true, synced_dexes: dexIds };
}

export async function setStateBulk(body: any): Promise<{ ok: boolean; count: number }> {
  const dexId = body.dex_id || "";
  if (!dexId) throw new Error("dex_id 必填");
  const caught = body.caught ? 1 : 0;
  const ids = (body.species_ids || []).map((s: any) => parseInt(s, 10));
  if (ids.some((x: number) => !Number.isInteger(x))) throw new Error("species_ids 无效");
  await validateDexId(dexId);
  const all = readJson(K_CAUGHT, {});
  for (const sid of ids) {
    for (const d of await propagateTargets(sid)) {
      all[d] = all[d] || {};
      all[d][String(sid)] = caught;
    }
  }
  writeJson(K_CAUGHT, all);
  return { ok: true, count: ids.length };
}

export function stateCounts(): Record<string, number> {
  const all = readJson(K_CAUGHT, {});
  const out: Record<string, number> = {};
  for (const [dexId, bySp] of Object.entries(all)) {
    let n = 0;
    for (const v of Object.values(bySp as Record<string, any>)) if (v === 1) n += 1;
    if (n) out[dexId] = n;
  }
  return out;
}

export function caughtMap(dexId: string): Map<number, boolean> {
  const all = readJson(K_CAUGHT, {});
  const bySp = all[dexId] || {};
  const m = new Map<number, boolean>();
  for (const [sid, v] of Object.entries(bySp)) m.set(parseInt(sid, 10), v === 1);
  return m;
}

// ---- /api/custom-recipes（GET/POST/DELETE） ----
function pad2(n: number): string {
  return String(n).padStart(2, "0");
}
function localNow(): string {
  const t = new Date();
  return (
    `${t.getFullYear()}-${pad2(t.getMonth() + 1)}-${pad2(t.getDate())} ` +
    `${pad2(t.getHours())}:${pad2(t.getMinutes())}:${pad2(t.getSeconds())}`
  );
}

export function listCustomRecipes(params?: { game?: string }): any[] {
  const game = (params && params.game) || "";
  let out = readJson(K_RECIPES, []);
  if (game) out = out.filter((r: any) => r.game === game);
  return out.slice().sort((a: any, b: any) => b.id - a.id);
}

export function recipeItemsCounted(v: any): Array<{ name: string; count: number }> {
  const out: Array<{ name: string; count: number }> = [];
  if (Array.isArray(v)) {
    for (const x of v) {
      if (x && typeof x === "object") {
        const name = String(x.name === undefined ? "" : x.name)
          .trim()
          .slice(0, 40);
        if (!name) continue;
        let count = parseInt(x.count === undefined ? 1 : x.count, 10);
        if (!Number.isFinite(count)) count = 1;
        count = Math.max(1, Math.min(99, count));
        out.push({ name, count });
      } else if (String(x).trim()) {
        out.push({ name: String(x).trim().slice(0, 40), count: 1 });
      }
    }
    return out.slice(0, 20);
  }
  const s = String(v === undefined || v === null ? "" : v).trim();
  if (!s) return [];
  return s
    .split(/[、,，\n]/)
    .filter((x) => x.trim())
    .slice(0, 20)
    .map((x) => ({ name: x.trim().slice(0, 40), count: 1 }));
}

export function addCustomRecipe(body: any): any {
  const pid = parseInt(body.profile_id || 1, 10) || 1;
  const game = body.game || "";
  if (!RECIPE_GAMES.includes(game)) throw new Error("该游戏不支持自定义食谱");
  let effects = body.effects || [];
  if (!Array.isArray(effects) || !effects.every((e: any) => e && typeof e === "object")) {
    throw new Error("effects 格式无效");
  }
  const cleanEffects = [];
  for (const e of effects) {
    if (!e.power) continue;
    const level = parseInt(e.level === undefined ? 1 : e.level, 10);
    if (!Number.isFinite(level)) throw new Error("effects.level 无效");
    cleanEffects.push({
      power: String(e.power).slice(0, 20),
      type: String(e.type).slice(0, 8),
      level,
    });
  }
  effects = cleanEffects;
  const ingredients = recipeItemsCounted(body.ingredients);
  const seasonings = recipeItemsCounted(body.seasonings);
  if (game === "legends-za") {
    const total = ingredients.reduce((s, i) => s + i.count, 0);
    if (!(total >= 3 && total <= 8)) throw new Error("树果总数需为 3~8 个（可同种多个）");
  } else if (!ingredients.length || !seasonings.length) {
    throw new Error("效果、食材、调味料均为必填");
  }
  if (!effects.length) throw new Error("效果为必填");
  const name =
    String(body.name || "")
      .slice(0, 40)
      .trim() || "我的食谱";
  const rows = readJson(K_RECIPES, []);
  const id = rows.reduce((m: number, r: any) => Math.max(m, r.id), 0) + 1;
  const row = {
    id,
    profile_id: pid,
    game,
    name,
    effects,
    ingredients,
    seasonings,
    created_at: localNow(),
  };
  rows.push(row);
  writeJson(K_RECIPES, rows);
  return row;
}

export function delCustomRecipe(recipeId: number): { ok: boolean } {
  writeJson(
    K_RECIPES,
    readJson(K_RECIPES, []).filter((r: any) => r.id !== recipeId),
  );
  return { ok: true };
}

/** 一次性导入/导出兜底（桌面老用户 userstate.db 迁移入口）：返回可持久化 JSON。 */
export function exportAll(): { caught_state: any; custom_recipes: any } {
  return { caught_state: readJson(K_CAUGHT, {}), custom_recipes: readJson(K_RECIPES, []) };
}
export function importAll(payload: any): { ok: boolean } {
  if (payload && payload.caught_state) writeJson(K_CAUGHT, payload.caught_state);
  if (payload && payload.custom_recipes) writeJson(K_RECIPES, payload.custom_recipes);
  return { ok: true };
}
