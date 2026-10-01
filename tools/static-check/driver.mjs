// driver.mjs —— 本地 API 引擎的 Node 驱动：执行 JSON 调用计划，回放响应供 Python 侧比对。
// 用法：node driver.mjs plan.json out.json
// 计划格式：[{method, path, params?}]; 输出：[{ok, data|error}]
import { readFileSync, writeFileSync } from "node:fs";
import vm from "node:vm";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const DIST = path.join(ROOT, "app", "static", "dist", "js", "local");
const DATA = path.join(ROOT, "app", "static", "data");

// localStorage 垫片（内存实现；状态端点在 Node 下可跑）
const mem = new Map();
const localStorageShim = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
};

const ctx = vm.createContext({
  console,
  localStorage: localStorageShim,
});
const FILES = ["damage.js", "data-core.js", "state.js", "pokemon.js",
  "lookup.js", "calc.js", "local-api.js"];
for (const f of FILES) {
  new vm.Script(readFileSync(path.join(DIST, f), "utf-8"), { filename: f }).runInContext(ctx);
}
const PKT = ctx.__PKT_LOCAL__;
PKT.data.setLoader((rel) => Promise.resolve(
  JSON.parse(readFileSync(path.join(DATA, rel), "utf-8"))));

const plan = JSON.parse(readFileSync(process.argv[2], "utf-8"));
const out = [];
for (const call of plan) {
  try {
    const data = await PKT.localApi.handle(call.method || "GET", call.path, call.params || {});
    out.push({ ok: true, data });
  } catch (e) {
    out.push({ ok: false, error: String(e && e.message ? e.message : e) });
  }
}
writeFileSync(process.argv[3], JSON.stringify(out, null, 1), "utf-8");
console.error(`driver: ${out.length} calls, ${out.filter((r) => !r.ok).length} errors`);
