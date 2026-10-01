// state.test.mjs —— 本地状态端点单测（O1/N1：等价性验证未覆盖的写侧）。
// 覆盖：PUT /api/state 同游戏同步、POST /api/state/bulk、GET /api/state/counts、
// custom-recipes 增/列/删与校验规则、exportAll/importAll 迁移兜底。
// 用法：node tools/static-check/state.test.mjs
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import vm from "node:vm";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const DIST = path.join(ROOT, "app", "static", "dist", "js", "local");
const DATA = path.join(ROOT, "app", "static", "data");

const mem = new Map();
const ctx = vm.createContext({
  console,
  localStorage: {
    getItem: (k) => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => mem.set(k, String(v)),
    removeItem: (k) => mem.delete(k),
  },
});
for (const f of ["damage.js", "data-core.js", "state.js", "pokemon.js", "lookup.js",
  "calc.js", "local-api.js"]) {
  new vm.Script(readFileSync(path.join(DIST, f), "utf-8"), { filename: f }).runInContext(ctx);
}
const PKT = ctx.__PKT_LOCAL__;
PKT.data.setLoader((rel) => Promise.resolve(
  JSON.parse(readFileSync(path.join(DATA, rel), "utf-8"))));
const call = (m, p, b) => PKT.localApi.handle(m, p, b);
mem.clear();   // 用例间隔离

let passed = 0, failed = 0;
async function t(name, fn) {
  try { await fn(); passed += 1; console.log(`[PASS] ${name}`); }
  catch (e) { failed += 1; console.log(`[FAIL] ${name}: ${e.message}`); }
}
function eq(a, b, msg) {
  const ja = JSON.stringify(a), jb = JSON.stringify(b);
  if (ja !== jb) throw new Error(`${msg || "不等"}: ${ja.slice(0, 120)} vs ${jb.slice(0, 120)}`);
}
async function throws(fn, msg) {
  try { await fn(); } catch (e) { if (msg && !String(e.message).includes(msg)) throw new Error(`异常文案不含「${msg}」：${e.message}`); return; }
  throw new Error("预期抛错但未抛");
}

await t("PUT /api/state：帕底亚图鉴标记 906 → 同步本体图鉴", async () => {
  const r = await call("PUT", "/api/state",
    { profile_id: 1, dex_id: "paldea", species_id: 906, caught: true });
  eq(r.ok, true);
  if (!(r.synced_dexes.includes("paldea") && r.synced_dexes.length >= 1)) {
    throw new Error("synced_dexes 应含 paldea");
  }
});
await t("GET /api/state/counts：计数反映标记", async () => {
  const c = await call("GET", "/api/state/counts");
  if (!c.paldea) throw new Error("paldea 计数缺失");
});
await t("PUT 取消标记 → 计数归零", async () => {
  await call("PUT", "/api/state", { profile_id: 1, dex_id: "paldea", species_id: 906, caught: false });
  const c = await call("GET", "/api/state/counts");
  eq(c.paldea || 0, 0);
});
await t("POST /api/state/bulk：批量 3 只 + 计数", async () => {
  const r = await call("POST", "/api/state/bulk",
    { profile_id: 1, dex_id: "paldea", species_ids: [906, 907, 908], caught: true });
  eq(r, { ok: true, count: 3 });
  const c = await call("GET", "/api/state/counts");
  eq(c.paldea, 3);
});
await t("PUT 校验：未知 dex_id 拒绝", () =>
  throws(() => call("PUT", "/api/state", { dex_id: "nope", species_id: 1, caught: 1 }), "dex_id 无效"));

await t("custom-recipes：非法游戏拒绝", () =>
  throws(() => call("POST", "/api/custom-recipes",
    { profile_id: 1, game: "sword-shield", name: "x", effects: [{ power: "蛋蛋力", level: 1 }], ingredients: [{ name: "a", count: 1 }], seasonings: [{ name: "b", count: 1 }] }),
    "不支持自定义食谱"));
await t("custom-recipes：朱紫缺调味料拒绝", () =>
  throws(() => call("POST", "/api/custom-recipes",
    { profile_id: 1, game: "scarlet-violet", name: "x", effects: [{ power: "蛋蛋力", level: 1 }], ingredients: [{ name: "辣香肠", count: 1 }] }),
    "必填"));
await t("custom-recipes：Z-A 树果 2 个拒绝（<3）", () =>
  throws(() => call("POST", "/api/custom-recipes",
    { profile_id: 1, game: "legends-za", name: "x", effects: [{ power: "蛋蛋力", level: 1 }], ingredients: [{ name: "欧蔓果", count: 2 }] }),
    "3~8"));
await t("custom-recipes：正常写入 → 列表（倒序）→ 删除", async () => {
  const r = await call("POST", "/api/custom-recipes",
    { profile_id: 1, game: "legends-za", name: "测试甜甜圈",
      effects: [{ power: "蛋蛋力", type: "", level: 1 }],
      ingredients: [{ name: "欧蔓果", count: 3 }] });
  eq(r.name, "测试甜甜圈");
  eq(r.ingredients, [{ name: "欧蔓果", count: 3 }]);
  const list = await call("GET", "/api/custom-recipes", { game: "legends-za" });
  eq(list.length, 1);
  eq(list[0].id, r.id);
  const d = await call("DELETE", `/api/custom-recipes/${r.id}`);
  eq(d, { ok: true });
  eq((await call("GET", "/api/custom-recipes", {})).length, 0);
});
await t("exportAll/importAll：迁移兜底往返无损", async () => {
  mem.clear();
  await call("PUT", "/api/state", { profile_id: 1, dex_id: "paldea", species_id: 25, caught: true });
  await call("POST", "/api/custom-recipes",
    { profile_id: 1, game: "scarlet-violet", name: "迁移",
      effects: [{ power: "遭遇力", type: "一般", level: 1 }],
      ingredients: [{ name: "辣香肠", count: 1 }], seasonings: [{ name: "盐", count: 1 }] });
  const snapshot = PKT.state.exportAll();
  mem.clear();
  eq(PKT.state.exportAll().caught_state, {});
  PKT.state.importAll(snapshot);
  eq(PKT.state.exportAll(), snapshot);
  const c = await call("GET", "/api/state/counts");
  eq(c.paldea, 1);
});

console.log(failed ? `\n${failed} 失败` : `\n状态端点单测全绿（${passed} 项）`);
process.exit(failed ? 1 : 0);
void writeFileSync; void mkdtempSync; void os;
