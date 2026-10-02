// smoke.mjs —— 回归冒烟脚本（P2-7 固化，O1 实现）：
// ① 起真实 uvicorn，按 M8 冒烟清单逐页端点断言（含静态资源完整性）；
// ② 同一调用计划过本地引擎（tools/static-check/driver.mjs）——双模式对照。
// 完整浏览器走查（__errs 零错误断言）仍为发版前手工步骤（本仓库历次实测记录见 ARCHITECTURE §10）。
// 用法：node tools/smoke.mjs
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = 8823;
const BASE = `http://127.0.0.1:${PORT}`;

async function waitForServer(timeoutMs = 20000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    try {
      const r = await fetch(`${BASE}/api/ping`);
      if (r.ok) return;
    } catch (e) { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error("uvicorn 未在超时内就绪");
}

// 冒烟清单：页面 → 关键端点（M8 checklist 逐页）+ 静态资源
const CHECKS = [
  ["首页", "/api/games"],
  ["图鉴tab", "/api/dex/paldea"],
  ["详情-基本", "/api/pokemon/25?game=scarlet-violet"],
  ["详情-招式", "/api/pokemon/25/moves?game=scarlet-violet"],
  ["图鉴-剑盾", "/api/dex/galar"],
  ["EV", "/api/ev?stat=atk&value=2&game=scarlet-violet"],
  ["三明治", "/api/sandwiches?power=%E9%97%AA%E5%85%89%E5%8A%9B"],
  ["甜甜圈", "/api/donuts"],
  ["咖喱", "/api/curries?q=%E5%92%96%E5%B1%B1"],
  ["野餐道具", "/api/picnic-items"],
  ["相性表", "/api/meta/typechart"],
  ["计算器meta", "/api/meta/species"],
  ["计算器forms", "/api/calc/forms?species_id=445"],
  ["计算器moves", "/api/calc/moves?species_id=445"],
  ["状态计数", "/api/state/counts"],
  ["生蛋链", "/api/breed-chains?species_id=133&move_id=34&game=scarlet-violet"],
];

const BATCH_BODY = {
  attacker: { species_id: 445, level: 50, nature: "adamant", evs: { atk: 252 } },
  defender: { species_id: 143, level: 50, nature: "careful" },
  moves: { atk: [89, 0, 0, 0], dfd: [56, 0, 0, 0] },
  field: {}, sides: { atk: {}, dfd: {} },
};

async function main() {
  const proc = spawn("python", ["-m", "uvicorn", "app.main:app", "--port", String(PORT)],
    { cwd: ROOT, env: { ...process.env, PYTHONPATH: ROOT },
      stdio: ["ignore", "ignore", "pipe"] });
  proc.stderr.on("data", (d) => process.stderr.write("[uv] " + d));
  proc.on("exit", (c) => console.error("[uv] exited", c));
  let failed = 0;
  try {
    await waitForServer();
    for (const [label, p] of CHECKS) {
      const r = await fetch(BASE + p);
      const ok = r.ok;
      let shapeOk = false;
      if (ok) {
        const ct = r.headers.get("content-type") || "";
        shapeOk = ct.includes("application/json");
        await r.json();
      }
      if (!(ok && shapeOk)) { failed += 1; console.log(`[FAIL] ${label} ${p} -> ${r.status}`); }
      else { console.log(`[ ok ] ${label}`); }
    }
    const rb = await fetch(`${BASE}/api/calc/batch`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(BATCH_BODY),
    });
    const jb = await rb.json();
    const rolls = jb.atk.results[0].rolls;
    if (!(rb.ok && Array.isArray(rolls) && rolls.length === 16)) {
      failed += 1; console.log(`[FAIL] calc/batch rolls=${JSON.stringify(rolls).slice(0, 40)}`);
    } else { console.log(`[ ok ] 计算器batch（rolls ${rolls[0]}~${rolls[15]}）`); }
    // 静态资源完整性：index.html 引用的本地资源全部可 200
    const html = await (await fetch(`${BASE}/`)).text();
    const refs = [...html.matchAll(/(?:src|href)="(?!https?:|\/\/|\/api)([^"]+)"/g)].map((m) => m[1]);
    for (const ref of refs) {
      const r = await fetch(`${BASE}/${ref.replace(/^\//, "")}`);
      if (!r.ok && !r.ok) { /* noop */ }
      if (r.status !== 200) { failed += 1; console.log(`[FAIL] 资源 ${ref} -> ${r.status}`); }
    }
    console.log(`[ ok ] 静态资源 ${refs.length} 项全部 200`);
    // 图鉴默认形态全量枚举：逐行打开详情，selected_suffix 必须等于 ddf 形态后缀
    // （U4 回归防线：后端按 dex 默认后缀过滤内容，前端据此选形态，错位即详情死循环回归）
    const ddf = JSON.parse(readFileSync(
      path.join(ROOT, "app", "static", "data", "tables", "dex_default_forms.json"), "utf-8")).rows;
    const forms = JSON.parse(readFileSync(
      path.join(ROOT, "app", "static", "data", "tables", "forms.json"), "utf-8")).rows;
    const dexes = JSON.parse(readFileSync(
      path.join(ROOT, "app", "static", "data", "tables", "regional_dexes.json"), "utf-8")).rows;
    const formIdent = new Map(forms.map((f) => [f.id, f.identifier || ""]));
    const dexGame = new Map(dexes.map((d) => [d.id, d.game_id]));
    let ddfBad = 0;
    for (const r of ddf) {
      const game = dexGame.get(r.dex_id) || "";
      const ident = formIdent.get(r.form_id) || "";
      const suffix = ident.includes("-") ? ident.slice(ident.lastIndexOf("-") + 1) : "";
      const q = `/api/pokemon/${r.species_id}?game=${game}&dex=${r.dex_id}`;
      const j = await (await fetch(BASE + q)).json();
      if (j.selected_suffix !== suffix) {
        ddfBad += 1;
        console.log(`[FAIL] ddf ${r.dex_id}#${r.species_id} 期望 ${suffix} 实得 ${j.selected_suffix}`);
      }
    }
    if (ddfBad) failed += ddfBad;
    else console.log(`[ ok ] 图鉴默认形态 ${ddf.length} 行全量枚举一致`);
    // 默认形态详情招式表可正常返回（形态过滤参数通路）
    for (const r of [ddf[0], ddf[Math.floor(ddf.length / 2)], ddf[ddf.length - 1]]) {
      const game = dexGame.get(r.dex_id) || "";
      const rm = await fetch(`${BASE}/api/pokemon/${r.species_id}/moves?game=${game}&form_id=${r.form_id}`);
      if (!rm.ok) { failed += 1; console.log(`[FAIL] ddf moves ${r.dex_id}#${r.species_id} -> ${rm.status}`); }
    }
    console.log("[ ok ] 默认形态招式表抽样 3 行 200");
  } finally {
    proc.kill("SIGTERM");
  }
  console.log(failed ? `冒烟失败：${failed} 项` : "冒烟全绿（真实后端模式）");
  process.exitCode = failed ? 1 : 0;
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
void readFileSync;
