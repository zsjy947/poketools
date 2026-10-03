// smoke.mjs —— 回归冒烟（终态）：对 web 前端构建产物做静态托管（vite preview，无后端），
// 逐资源断言 hash 路由壳 + 数据分片 + 资产可达（本地模式即壳内真实运行形态）。
// 公式对拍在 web/tests/calib.test.ts（vitest）；本脚本只做「构建产物可用性」冒烟。
// 用法：先 `cd web && pnpm build`，再 `node tools/smoke.mjs`
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const WEB = path.join(ROOT, "web");
const PORT = 8877;
const BASE = `http://127.0.0.1:${PORT}`;

// 冒烟清单：[说明, 路径, 校验函数(响应文本)]（全部走本地引擎，无任何 /api 后端调用）
const CHECKS = [
  ["壳入口", "/", (t) => t.includes("宝可梦工具助手")],
  ["数据 manifest", "/data/manifest.json", (t) => JSON.parse(t).tables !== undefined],
  ["games 表", "/data/tables/games.json", (t) => JSON.parse(t).rows.length === 5],
  ["图鉴默认形态表", "/data/tables/dex_default_forms.json", (t) => JSON.parse(t).rows.length > 60],
  ["属性雪碧图", "/assets/type_sprite.webp", () => true],
  ["机制图标(极巨)", "/assets/mechanism/dynamax.png", () => true],
  ["游戏商标(剑)", "/assets/games/sword.webp", () => true],
  ["三明治食谱图", "/assets/sandwiches/sandwich_001.webp", () => true],
  ["官方绘图#1", "/pkt/1.png", () => true],
  ["道具图标(讲究头带)", "/assets/items/leftovers.png", () => true],
  ["对战精灵目录", "/sprites/manifest.json", (t) => JSON.parse(t).keepDirs !== undefined],
];

async function main() {
  const proc = spawn("npx", ["vite", "preview", "--port", String(PORT), "--strictPort"],
    { cwd: WEB, shell: true, stdio: ["ignore", "ignore", "pipe"] });
  proc.stderr.on("data", (d) => process.stderr.write("[preview] " + d));

  let failed = 0;
  try {
    // 等待 preview 就绪
    let up = false;
    for (let i = 0; i < 40 && !up; i++) {
      try {
        const r = await fetch(`${BASE}/`, { signal: AbortSignal.timeout(1500) });
        up = r.ok;
      } catch { /* not up yet */ }
      if (!up) await sleep(400);
    }
    if (!up) throw new Error("vite preview 未在超时内就绪（先跑 pnpm build）");

    for (const [label, p, ok] of CHECKS) {
      const r = await fetch(BASE + p, { signal: AbortSignal.timeout(5000) });
      const pass = r.ok && ok(await r.text());
      if (!pass) { failed += 1; console.log(`[FAIL] ${label} ${p} -> ${r.status}`); }
      else console.log(`[ ok ] ${label}`);
    }
  } finally {
    // shell:true 的子进程树需整树终止（win32 proc.kill 只杀 shell）
    if (process.platform === "win32") {
      spawn("taskkill", ["/PID", String(proc.pid), "/T", "/F"], { shell: true });
    } else {
      proc.kill();
    }
  }
  console.log(failed ? `冒烟失败：${failed} 项` : "冒烟全绿（web 构建产物·本地模式）");
  process.exitCode = failed ? 1 : 0;
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
