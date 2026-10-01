/* 本地 API 调度器：端点签名与后端一致（/api/… 路径 + 查询参数），
 * 由 api.js 在后端不可达（无 Python 服务的 APK/Tauri 壳）时自动切换。
 * 实现分布于 local/{data-core,state,pokemon,lookup,calc,damage}.js。 */
(function (g) {
  "use strict";
  const PKT = (g.__PKT_LOCAL__ = g.__PKT_LOCAL__ || {});

  /** handle(method, path, params|body) → Promise<响应对象>；未知路径 reject。 */
  async function handle(method, path, paramsOrBody) {
    const parts = path.split("?")[0].split("/").filter(Boolean);
    // parts[0] === "api"
    const head = parts[1];
    const sub = parts[2];
    const rest = parts[3];
    const p = Object.assign({}, paramsOrBody || {});
    const body = method === "GET" ? null : (paramsOrBody || {});

    if (head === "ping") return { ok: true };
    if (head === "version") {
        // 本地模式以数据分片版本表达（manifest.data_version；桌面模式为 pyproject 版本）
        return { version: (await PKT.data.manifest()).data_version };
    }
    if (head === "games") return PKT.pokemonApi.games();
    if (head === "dex" && sub) return PKT.pokemonApi.dexEntries(decodeURIComponent(sub), p);
    if (head === "pokemon" && sub) {
      const sid = parseInt(sub, 10);
      if (rest === "moves") return PKT.pokemonApi.pokemonMoves(sid, p);
      return PKT.pokemonApi.pokemonDetail(sid, p);
    }
    if (head === "state") {
      if (method === "PUT") return PKT.state.setState(body);
      if (method === "POST") return PKT.state.setStateBulk(body);
      if (sub === "counts") return PKT.state.stateCounts();
    }
    if (head === "ev") return PKT.lookupApi.evFilter(p);
    if (head === "sandwiches") return PKT.lookupApi.sandwiches(p);
    if (head === "breed-chains") {
      return PKT.lookupApi.breedChains(parseInt(p.species_id, 10),
        parseInt(p.move_id, 10), p.game);
    }
    if (head === "picnic-items") return PKT.lookupApi.picnicItems(p);
    if (head === "donuts") return PKT.lookupApi.donuts();
    if (head === "curries") return PKT.lookupApi.curries(p);
    if (head === "custom-recipes") {
      if (method === "GET") return PKT.state.listCustomRecipes(p);
      if (method === "POST") return PKT.state.addCustomRecipe(body);
      if (method === "DELETE" && sub) {
        return PKT.state.delCustomRecipe(parseInt(sub, 10));
      }
    }
    if (head === "meta") {
      if (sub === "typechart") return PKT.lookupApi.typechart();
      if (sub === "species") return PKT.calcApi.metaSpecies();
      if (sub === "items") return PKT.calcApi.metaItems();
      if (sub === "abilities") return PKT.calcApi.metaAbilities();
      if (sub === "z-moves") return PKT.calcApi.metaZMoves();
      if (sub === "max-moves") return PKT.calcApi.metaMaxMoves();
      if (sub === "gmax-moves") return PKT.calcApi.metaGmaxMoves();
      if (sub === "natures") return PKT.calcApi.metaNatures();
    }
    if (head === "calc") {
      if (sub === "forms") return PKT.calcApi.calcForms(parseInt(p.species_id, 10));
      if (sub === "moves") return PKT.calcApi.calcMoves(parseInt(p.species_id, 10));
      if (sub === "batch") return PKT.calcApi.calcBatch(body);
      if (!sub) return PKT.calcApi.calc(body);
    }
    throw new Error("本地模式不支持该端点：" + method + " " + path);
  }

  PKT.localApi = { handle };
})(typeof window !== "undefined" ? window : globalThis);
