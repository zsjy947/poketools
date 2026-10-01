/**
 * 供应商化引擎打包（champions mod 三级策略·第 2 级兜底，plans/00 §4.4）：
 *
 * 上游 smogon/pokemon-showdown 的 sim/ + data/（含 data/mods/champions*）以 esbuild
 * 打包为浏览器可用的单文件引擎包，对上层暴露与 @pkmn/sim 一致的导出
 * （Dex / Teams / BattleStreams / PRNG / toID）。
 *
 * 原理：上游 sim 在运行时用 require() 动态装载数据文件与 fs.readdirSync 枚举 mod。
 * 本脚本生成一个入口文件，静态 import 全部所需数据模块，注入：
 *   - __PS_MODULES__ 路径→模块表（data/* · data/mods/{champions,championsregmb}/* ·
 *     config/formats · data/aliases · data/text/{en,zh-cn}/*）
 *   - globalThis.require 垫片（按规范化路径查表；查无抛 MODULE_NOT_FOUND——
 *     loadDataFile 依赖该错误码回退父 mod）
 *   - fs/path 垫片（readdirSync 返回受支持 mod 清单；resolve 做 posix 归一化）
 *
 * 产物 src/engine-adapter/vendor/ps-engine.js（gitignore，可由本脚本随时重建）。
 * 用法：node scripts/build-engine.mjs（需先克隆上游仓库，路径见 scripts/config.json）
 */
import { build } from "esbuild";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, "scripts/config.json"), "utf8"));
const PS = path.resolve(ROOT, cfg.showdownPath);
if (!fs.existsSync(path.join(PS, "sim/index.ts"))) {
  console.error(`[build-engine] 上游仓库不存在：${PS}（先 git clone smogon/pokemon-showdown）`);
  process.exit(1);
}

const DATA_FILES = [
  "abilities",
  "rulesets",
  "formats-data",
  "items",
  "learnsets",
  "moves",
  "natures",
  "pokedex",
  "pokemongo",
  "scripts",
  "conditions",
  "typechart",
];
const MODS = ["champions", "championsregmb"];
// fs.readdirSync 垫片返回上游 data/mods 全部目录名（dexes 惰性创建，无需打包其数据）
const ALL_MODS = [
  "afd",
  "biomechmons",
  "champions",
  "championsregmb",
  "chatbats",
  "fullpotential",
  "gen1",
  "gen1jpn",
  "gen1stadium",
  "gen2",
  "gen2stadium2",
  "gen3",
  "gen3colosseum",
  "gen3frlg",
  "gen3rs",
  "gen4",
  "gen4pt",
  "gen5",
  "gen5bw1",
  "gen6",
  "gen6xy",
  "gen7",
  "gen7letsgo",
  "gen7sm",
  "gen8",
  "gen8bdsp",
  "gen8dlc1",
  "gen8legends",
  "gen9deltamon",
  "gen9dlc1",
  "gen9legends",
  "gen9mnmlimitedsupply",
  "gen9predlc",
  "gen9ssb",
  "linked",
  "mixandmega",
  "monkeyspaw",
  "partnersincrime",
  "passiveaggressive",
  "pokebilities",
  "pokemoves",
  "randomroulette",
  "sharedpower",
  "sharingiscaring",
  "teraoverride",
  "thecardgame",
  "trademarked",
];
const TEXT_FILES = ["pokedex", "tags", "names", "moves", "abilities", "items", "default"];

const entries = []; // [key, absPath]
const exists = (p) => fs.existsSync(p) && fs.statSync(p).isFile();
for (const f of DATA_FILES) {
  const p = path.join(PS, "data", `${f}.ts`);
  if (exists(p)) entries.push([`data/${f}`, p]);
}
{
  const p = path.join(PS, "data/aliases.ts");
  if (exists(p)) entries.push(["data/aliases", p]);
}
for (const mod of MODS) {
  for (const f of DATA_FILES) {
    const p = path.join(PS, "data/mods", mod, `${f}.ts`);
    if (exists(p))
      entries.push(`data/mods/${mod}/${f}`.replace(/^/, "") && [`data/mods/${mod}/${f}`, p]);
  }
}
{
  const p = path.join(PS, "config/formats.ts");
  if (exists(p)) entries.push(["config/formats", p]);
}
{
  const p = path.join(PS, "config/custom-formats.ts");
  if (exists(p)) entries.push(["config/custom-formats", p]);
}
// 随机队伍数据（team:null 起局与 RandomPlayerAI 需要）：gen9 全系 + champions
{
  const rbDir = path.join(PS, "data/random-battles");
  if (fs.existsSync(rbDir)) {
    for (const d of fs.readdirSync(rbDir)) {
      if (!d.startsWith("gen9") && d !== "champions") continue;
      const dir = path.join(rbDir, d);
      if (!fs.statSync(dir).isDirectory()) continue;
      for (const f of fs.readdirSync(dir)) {
        if (f.endsWith(".ts")) {
          entries.push([`data/random-battles/${d}/${f.replace(/\.ts$/, "")}`, path.join(dir, f)]);
        } else if (f.endsWith(".json")) {
          entries.push([
            `data/random-battles/${d}/${f.replace(/\.json$/, "")}.json`,
            path.join(dir, f),
          ]);
        }
      }
    }
  }
}
for (const f of TEXT_FILES) {
  const en = path.join(PS, "data/text", `${f}.ts`);
  if (exists(en)) entries.push([`data/text/${f}`, en]);
  const zh = path.join(PS, "data/text/zh-cn", `${f}.ts`);
  if (exists(zh)) entries.push([`data/text/zh-cn/${f}`, zh]);
}

const banner = `
var __dirname = "/ps/sim";
var __PS_MODS__ = ${JSON.stringify(ALL_MODS)};
function __psNormalize(p) {
  var parts = String(p).replace(/\\\\/g, "/").split("/");
  var out = [];
  for (var i = 0; i < parts.length; i++) {
    var s = parts[i];
    if (s === "" && i > 0) continue;
    if (s === ".") continue;
    if (s === "..") { out.pop(); continue; }
    out.push(s);
  }
  return out.join("/");
}
function __psKey(p) {
  var n = __psNormalize(p);
  if (n.indexOf("/ps/") === 0) n = n.slice(4);
  else if (n.indexOf("ps/") === 0) n = n.slice(3);
  return n.replace(/\\.(ts|js)$/, "");
}
function __psRequire(p) {
  var raw = String(p);
  var key = __psKey(raw);
  if (raw.indexOf("..") === 0) {
    // '../data/…' 形式：调用方在 sim/ 目录（teams.ts 动态 require 随机队伍）
    key = __psKey("/ps/sim/" + raw);
  } else if (raw.charAt(0) === ".") {
    // './sets.json'：按最近一次数据模块目录解析（random-battles 加载器）
    key = __psKey((__psLastDir__ || "data") + "/" + raw);
  } else if (raw.indexOf("/") < 0) {
    key = __psKey((__psLastDir__ || "data") + "/" + raw);
  }
  var mod = __PS_MODULES__[key];
  if (!mod) { var e = new Error("Cannot find module '" + p + "' (key=" + key + ")"); e.code = "MODULE_NOT_FOUND"; throw e; }
  var idx = key.lastIndexOf("/");
  __psLastDir__ = idx > 0 ? key.slice(0, idx) : key;
  if (/\\.json$/.test(key)) return mod.default !== undefined ? mod.default : mod;
  return mod;
}
var __psLastDir__ = "";
__psRequire.resolve = function (p) {
  if (!__PS_MODULES__[__psKey(p)]) { var e = new Error("Cannot find module '" + p + "'"); e.code = "MODULE_NOT_FOUND"; throw e; }
  return p;
};
var require = __psRequire;
`;

const fsShim = `
import * as mod from "fs";
export default mod;
export const readdirSync = () => __PS_MODS__;
export const existsSync = () => false;
export const readFileSync = () => { throw new Error("fs shim: not supported"); };
`;

const pathShim = `
export function resolve(...parts) {
  const abs = parts.length > 0 && String(parts[0]).startsWith("/");
  return __psNormalize((abs ? parts : ["", "ps", "sim", ...parts]).join("/"));
}
export function join(...parts) { return __psNormalize(parts.join("/")); }
export function normalize(p) { return __psNormalize(p); }
export const posix = { resolve, join, normalize };
export const sep = "/";
export const delimiter = ":";
export default { resolve, join, normalize, posix, sep, delimiter };
`;

// sim/index.ts `export * from '../lib'` 与 battle-stream `import {Streams, Utils}`：
// lib/index 会连带 net/process-manager/repl 等服务端模块——垫片只导出浏览器所需两者。
const libShim = `
export * as Streams from ${JSON.stringify(path.join(PS, "lib/streams.ts").replace(/\\/g, "/"))};
export * as Utils from ${JSON.stringify(path.join(PS, "lib/utils.ts").replace(/\\/g, "/"))};
export * as Dashycode from ${JSON.stringify(path.join(PS, "lib/dashycode.ts").replace(/\\/g, "/"))};
`;

// node:util.isDeepStrictEqual（dex-species 使用）——浅层递归实现（PS 数据对象为纯 JSON 结构）
const utilShim = `
export function isDeepStrictEqual(a, b) {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  const ka = Object.keys(a), kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  for (const k of ka) { if (!isDeepStrictEqual(a[k], b[k])) return false; }
  return true;
}
export default { isDeepStrictEqual };
`;

const tmpDir = path.join(ROOT, ".engine-tmp");
fs.mkdirSync(tmpDir, { recursive: true });
fs.writeFileSync(path.join(tmpDir, "fs-shim.mjs"), fsShim);
fs.writeFileSync(path.join(tmpDir, "path-shim.mjs"), pathShim);
fs.writeFileSync(path.join(tmpDir, "lib-shim.mjs"), libShim);
fs.writeFileSync(path.join(tmpDir, "util-shim.mjs"), utilShim);

const imports = entries
  .map(([, p], i) => `import * as m${i} from ${JSON.stringify(p.replace(/\\/g, "/"))};`)
  .join("\n");
const map = `const __PS_MODULES__ = {\n${entries
  .map(([key], i) => `  ${JSON.stringify(key)}: m${i},`)
  .join("\n")}\n};\nglobalThis.__PS_MODULES__ = __PS_MODULES__;\n`;

const entry = `${imports}\n${map}
export * from ${JSON.stringify(path.join(PS, "sim/index.ts").replace(/\\/g, "/"))};
export { __psRequire as __debugRequire, __psKey as __debugKey };
`;
const entryFile = path.join(tmpDir, "entry.ts");
fs.writeFileSync(entryFile, entry);

const outDir = path.join(ROOT, "src/engine-adapter/vendor");
fs.mkdirSync(outDir, { recursive: true });

const alias = {
  fs: path.join(tmpDir, "fs-shim.mjs"),
  path: path.join(tmpDir, "path-shim.mjs"),
  "node:util": path.join(tmpDir, "util-shim.mjs"),
  "node:path": path.join(tmpDir, "path-shim.mjs"),
  "node:fs": path.join(tmpDir, "fs-shim.mjs"),
  // ts-chacha20 由本包依赖提供（与 @pkmn/sim 同源做法；alias 路径需正斜杠）
  "ts-chacha20": path
    .join(ROOT, "node_modules/ts-chacha20/build/src/chacha20.js")
    .replace(/\\/g, "/"),
};
// node:crypto → 浏览器 WebCrypto（prng 仅在 globalThis.crypto 缺失时兜底引用）
const cryptoShim = `const c = (typeof globalThis.crypto !== "undefined") ? globalThis.crypto : {};
export const webcrypto = c;
export default c;
export function getRandomValues(a) { return c.getRandomValues(a); }
export function randomUUID() { return c.randomUUID ? c.randomUUID() : ""; }
`;
fs.writeFileSync(path.join(tmpDir, "crypto-shim.mjs"), cryptoShim);
alias["node:crypto"] = path.join(tmpDir, "crypto-shim.mjs");
// lib/index.ts → 垫片（alias 只支持裸模块名，路径匹配走 onResolve 插件）
const libIndexPath = path.join(PS, "lib/index.ts");
const libShimPlugin = {
  name: "ps-lib-shim",
  setup(build_) {
    build_.onResolve({ filter: /(^|\/)lib(\/index)?(\.ts)?$/ }, (args) => {
      // 兼容 '../lib'（目录导入）与 '../lib/index.ts' 两种说明符
      const base = path.resolve(args.resolveDir, args.path);
      const candidates = [base, `${base}.ts`, path.join(base, "index.ts")];
      if (candidates.some((c) => c === libIndexPath))
        return { path: path.join(tmpDir, "lib-shim.mjs") };
      return null;
    });
  },
};

await build({
  entryPoints: [entryFile],
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2022",
  outfile: path.join(outDir, "ps-engine.js"),
  banner: { js: banner },
  define: { require: "__psRequire" },
  alias,
  plugins: [libShimPlugin],
  legalComments: "inline",
  minify: false,
  metafile: true,
  logLevel: "error",
}).then((r) => {
  const outs = Object.values(r.metafile.outputs);
  const js = outs.find((o) => o.entryPoint);
  console.log(
    `[build-engine] ps-engine.js ${(js.bytes / 1048576).toFixed(1)} MB，模块 ${entries.length} 个`,
  );
});

fs.rmSync(tmpDir, { recursive: true, force: true });
console.log("[build-engine] OK ->", path.join(outDir, "ps-engine.js"));
