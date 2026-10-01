/* 用户状态本地实现：userstate.db 的 caught_state / custom_recipes 迁 localStorage（路线 B）。
 * 端点签名与响应结构与 app/routers/dex.py、lookup.py 一致；
 * 同游戏图鉴双向同步语义逐行移植（_same_game_dex_ids → dex_entries+regional_dexes 索引）。 */
(function (g) {
  "use strict";
  const PKT = (g.__PKT_LOCAL__ = g.__PKT_LOCAL__ || {});
  const D = () => PKT.data;

  const K_CAUGHT = "pkt.caught_state.v1";      // {dexId: {speciesId: 0/1}}
  const K_RECIPES = "pkt.custom_recipes.v1";   // [{id, game, name, effects, ingredients, seasonings, created_at}]
  const PROFILE = 1;
  const RECIPE_GAMES = ["scarlet-violet", "legends-za"];

  function store() {
    try { return g.localStorage; } catch (e) { return null; }
  }
  function readJson(key, dflt) {
    const s = store() && store().getItem(key);
    if (!s) return dflt;
    try { return JSON.parse(s); } catch (e) { return dflt; }
  }
  function writeJson(key, v) {
    if (store()) store().setItem(key, JSON.stringify(v));
  }

  // ---- dex_entries + regional_dexes → 同游戏图鉴索引（species → dexIds，插入序=表序） ----
  let sameGameIdx = null;   // Map(gameId -> Map(speciesId -> [dexId]))
  async function sameGameIndex() {
    if (sameGameIdx) return sameGameIdx;
    const [entries, dexes] = await Promise.all([D().table("dex_entries"), D().table("regional_dexes")]);
    const dexGame = new Map(dexes.map((d) => [d.id, d.game_id]));
    const byGame = new Map();
    for (const e of entries) {
      const gm = dexGame.get(e.dex_id);
      if (!gm) continue;
      let bySp = byGame.get(gm);
      if (!bySp) { bySp = new Map(); byGame.set(gm, bySp); }
      let arr = bySp.get(e.species_id);
      if (!arr) { arr = []; bySp.set(e.species_id, arr); }
      if (!arr.includes(e.dex_id)) arr.push(e.dex_id);
    }
    sameGameIdx = byGame;
    return byGame;
  }

  async function sameGameDexIds(speciesId, gameId) {
    const byGame = await sameGameIndex();
    const bySp = byGame.get(gameId);
    return (bySp && bySp.get(speciesId)) || [];
  }

  // ---- /api/state（PUT）/api/state/bulk（POST）/api/state/counts（GET） ----
  async function setState(body) {
    const dexId = body.dex_id || "";
    const speciesId = parseInt(body.species_id, 10);
    if (!dexId) throw new Error("dex_id 必填");
    if (!Number.isInteger(speciesId)) throw new Error("species_id 无效");
    const caught = body.caught ? 1 : 0;
    const dexes = await D().table("regional_dexes");
    const dex = dexes.find((d) => d.id === dexId);
    if (!dex) throw new Error("dex_id 无效");
    let dexIds = (await sameGameDexIds(speciesId, dex.game_id)) || [];
    if (!dexIds.includes(dexId)) dexIds = dexIds.concat([dexId]);
    const all = readJson(K_CAUGHT, {});
    for (const d of dexIds) {
      all[d] = all[d] || {};
      all[d][String(speciesId)] = caught;
    }
    writeJson(K_CAUGHT, all);
    return { ok: true, synced_dexes: dexIds };
  }

  async function setStateBulk(body) {
    const dexId = body.dex_id || "";
    if (!dexId) throw new Error("dex_id 必填");
    const caught = body.caught ? 1 : 0;
    const ids = (body.species_ids || []).map((s) => parseInt(s, 10));
    if (ids.some((x) => !Number.isInteger(x))) throw new Error("species_ids 无效");
    const dexes = await D().table("regional_dexes");
    const dex = dexes.find((d) => d.id === dexId);
    if (!dex) throw new Error("dex_id 无效");
    const all = readJson(K_CAUGHT, {});
    for (const sid of ids) {
      for (const d of await sameGameDexIds(sid, dex.game_id)) {
        all[d] = all[d] || {};
        all[d][String(sid)] = caught;
      }
    }
    writeJson(K_CAUGHT, all);
    return { ok: true, count: ids.length };
  }

  function stateCounts() {
    const all = readJson(K_CAUGHT, {});
    const out = {};
    for (const [dexId, bySp] of Object.entries(all)) {
      let n = 0;
      for (const v of Object.values(bySp)) if (v === 1) n += 1;
      if (n) out[dexId] = n;
    }
    return out;
  }

  function caughtMap(dexId) {
    const all = readJson(K_CAUGHT, {});
    const bySp = all[dexId] || {};
    const m = new Map();
    for (const [sid, v] of Object.entries(bySp)) m.set(parseInt(sid, 10), v === 1);
    return m;
  }

  // ---- /api/custom-recipes（GET/POST/DELETE） ----
  function pad2(n) { return String(n).padStart(2, "0"); }
  function localNow() {
    const t = new Date();
    return `${t.getFullYear()}-${pad2(t.getMonth() + 1)}-${pad2(t.getDate())} `
      + `${pad2(t.getHours())}:${pad2(t.getMinutes())}:${pad2(t.getSeconds())}`;
  }

  function listCustomRecipes(params) {
    const game = (params && params.game) || "";
    let out = readJson(K_RECIPES, []);
    if (game) out = out.filter((r) => r.game === game);
    return out.slice().sort((a, b) => b.id - a.id);
  }

  function recipeItemsCounted(v) {
    const out = [];
    if (Array.isArray(v)) {
      for (const x of v) {
        if (x && typeof x === "object") {
          const name = String(x.name === undefined ? "" : x.name).trim().slice(0, 40);
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
    return s.split(/[、,，\n]/).filter((x) => x.trim()).slice(0, 20)
      .map((x) => ({ name: x.trim().slice(0, 40), count: 1 }));
  }

  function addCustomRecipe(body) {
    const pid = parseInt(body.profile_id || 1, 10) || 1;
    const game = body.game || "";
    if (!RECIPE_GAMES.includes(game)) throw new Error("该游戏不支持自定义食谱");
    let effects = body.effects || [];
    if (!Array.isArray(effects) || !effects.every((e) => e && typeof e === "object")) {
      throw new Error("effects 格式无效");
    }
    const cleanEffects = [];
    for (const e of effects) {
      if (!e.power) continue;
      const level = parseInt(e.level === undefined ? 1 : e.level, 10);
      if (!Number.isFinite(level)) throw new Error("effects.level 无效");
      cleanEffects.push({ power: String(e.power).slice(0, 20), type: String(e.type).slice(0, 8), level });
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
    const name = (String(body.name || "").slice(0, 40).trim()) || "我的食谱";
    const rows = readJson(K_RECIPES, []);
    const id = rows.reduce((m, r) => Math.max(m, r.id), 0) + 1;
    const row = { id, profile_id: pid, game, name, effects,
      ingredients, seasonings, created_at: localNow() };
    rows.push(row);
    writeJson(K_RECIPES, rows);
    return row;
  }

  function delCustomRecipe(recipeId) {
    writeJson(K_RECIPES, readJson(K_RECIPES, []).filter((r) => r.id !== recipeId));
    return { ok: true };
  }

  /** 一次性导入/导出兜底（UPDATE-PLAN §3.2 用户状态迁移）：返回可持久化 JSON。 */
  function exportAll() {
    return { caught_state: readJson(K_CAUGHT, {}), custom_recipes: readJson(K_RECIPES, []) };
  }
  function importAll(payload) {
    if (payload && payload.caught_state) writeJson(K_CAUGHT, payload.caught_state);
    if (payload && payload.custom_recipes) writeJson(K_RECIPES, payload.custom_recipes);
    return { ok: true };
  }

  PKT.state = {
    PROFILE, setState, setStateBulk, stateCounts, caughtMap,
    listCustomRecipes, addCustomRecipe, delCustomRecipe, exportAll, importAll,
  };
})(typeof window !== "undefined" ? window : globalThis);
