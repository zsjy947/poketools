/* 本地 API 调度器（唯一实现）：端点签名与原 FastAPI 一致（/api/… 路径 + 查询参数）。
 * 由 api.ts 在无后端（Tauri/APK 壳、纯静态托管）时调用；实现分布于
 * data/{core,pokemon,lookup,calc,damage}.ts 与 state/user.ts。 */
import { manifest } from "./core";
import * as pokemonApi from "./pokemon";
import * as lookupApi from "./lookup";
import * as calcApi from "./calc";
import * as state from "../state/user";

/** handle(method, path, params|body) → Promise<响应对象>；未知路径 reject。 */
export async function handle(method: string, path: string, paramsOrBody?: any): Promise<any> {
  const parts = path.split("?")[0]!.split("/").filter(Boolean);
  // parts[0] === "api"
  const head = parts[1];
  const sub = parts[2];
  const rest = parts[3];
  const p = Object.assign({}, paramsOrBody || {});
  const body = method === "GET" ? null : paramsOrBody || {};

  if (head === "ping") return { ok: true };
  if (head === "version") {
    // 本地模式以数据分片版本表达（manifest.data_version）
    return { version: (await manifest()).data_version };
  }
  if (head === "games") return pokemonApi.games();
  if (head === "dex" && sub) return pokemonApi.dexEntries(decodeURIComponent(sub), p);
  if (head === "pokemon" && sub) {
    const sid = parseInt(sub, 10);
    if (rest === "moves") return pokemonApi.pokemonMoves(sid, p);
    return pokemonApi.pokemonDetail(sid, p);
  }
  if (head === "state") {
    if (method === "PUT") return state.setState(body);
    if (method === "POST") return state.setStateBulk(body);
    if (sub === "counts") return state.stateCounts();
  }
  if (head === "ev") return lookupApi.evFilter(p);
  if (head === "sandwiches") return lookupApi.sandwiches(p);
  if (head === "breed-chains") {
    return lookupApi.breedChains(parseInt(p.species_id, 10), parseInt(p.move_id, 10), p.game);
  }
  if (head === "picnic-items") return lookupApi.picnicItems(p);
  if (head === "donuts") return lookupApi.donuts();
  if (head === "curries") return lookupApi.curries(p);
  if (head === "custom-recipes") {
    if (method === "GET") return state.listCustomRecipes(p);
    if (method === "POST") return state.addCustomRecipe(body);
    if (method === "DELETE" && sub) {
      return state.delCustomRecipe(parseInt(sub, 10));
    }
  }
  if (head === "meta") {
    if (sub === "typechart") return lookupApi.typechart();
    if (sub === "species") return calcApi.metaSpecies();
    if (sub === "items") return calcApi.metaItems();
    if (sub === "abilities") return calcApi.metaAbilities();
    if (sub === "z-moves") return calcApi.metaZMoves();
    if (sub === "max-moves") return calcApi.metaMaxMoves();
    if (sub === "gmax-moves") return calcApi.metaGmaxMoves();
    if (sub === "natures") return calcApi.metaNatures();
  }
  if (head === "calc") {
    if (sub === "forms") return calcApi.calcForms(parseInt(p.species_id, 10));
    if (sub === "moves") return calcApi.calcMoves(parseInt(p.species_id, 10));
    if (sub === "batch") return calcApi.calcBatch(body);
    if (!sub) return calcApi.calc(body);
  }
  throw new Error("本地模式不支持该端点：" + method + " " + path);
}
