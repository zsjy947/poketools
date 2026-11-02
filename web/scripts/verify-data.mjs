// 数据校验（F-11 落实引擎锁校验，fail fast）：
// 校验 vendor 引擎产物与 scripts/config.json 锁定的 showdownCommit 一致——
// build-engine.mjs 构建成功后在产物旁写 ps-engine.version.json 标记，此处比对；
// 产物或标记缺失、版本不一致均 exit 1（vendor 过期需重跑 build-engine）。
// 用法：node scripts/verify-data.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, "scripts/config.json"), "utf8"));
const VENDOR = path.join(ROOT, "src/engine-adapter/vendor");
const ENGINE = path.join(VENDOR, "ps-engine.js");
const MARKER = path.join(VENDOR, "ps-engine.version.json");

function fail(msg) {
  console.error(`[verify-data] ${msg}`);
  process.exit(1);
}

if (!fs.existsSync(ENGINE)) {
  fail(
    "vendor 引擎产物缺失（src/engine-adapter/vendor/ps-engine.js）——先运行 node scripts/build-engine.mjs",
  );
}
if (!fs.existsSync(MARKER)) {
  fail(
    "引擎版本标记缺失（ps-engine.version.json，旧版 build-engine 产物）——先运行 node scripts/build-engine.mjs 重新构建",
  );
}

let marker;
try {
  marker = JSON.parse(fs.readFileSync(MARKER, "utf8"));
} catch (e) {
  fail(`引擎版本标记损坏（${e.message}）——先运行 node scripts/build-engine.mjs 重新构建`);
}
const built = String(marker.showdownCommit || "");
const locked = String(cfg.showdownCommit || "");
// 标记存完整 HEAD、config 常为短 hash：按前缀兼容比较
const ok = built === locked || built.startsWith(locked) || locked.startsWith(built);
if (!ok) {
  fail(
    `vendor 引擎与配置锁不一致：产物构建自 showdown@${built || "(空)"}，` +
      `config.json 锁定 ${locked}——请 checkout 对应 commit 后重跑 node scripts/build-engine.mjs`,
  );
}
console.log(`[verify-data] OK：vendor 引擎 = showdown@${built}（config 锁定 ${locked}）`);
