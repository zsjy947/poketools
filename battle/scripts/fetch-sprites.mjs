/**
 * 素材管线（plans/00 §5.2，选择性下载版）：
 * 官方 sprites.zip 全量 890MB 且网络频繁中断——本脚本解析 zip 中央目录（Range 拉取文件尾部），
 * 只按需下载所需目录的数据块（正面/背面/shiny/gen5 动画/dex 大图 ≈150MB），本地解压写出。
 * 产物 src/assets/sprites/{dir}/*.{png,gif} + manifest.json（gitignore；版权仅个人使用）。
 */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, "scripts/config.json"), "utf8"));
const URL_ZIP = cfg.sprites.sourceUrl;
const OUT = path.join(ROOT, "public/sprites");
const KEEP = ["", "back", "shiny", "back-shiny", "ani", "ani-back", "ani-shiny", "dex"];
const RAW = path.join(ROOT, ".sprite-raw");
fs.mkdirSync(RAW, { recursive: true });

async function fetchRange(start, end, tries = 8) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(URL_ZIP, { headers: { Range: `bytes=${start}-${end}` } });
      if (res.status !== 206) throw new Error(`HTTP ${res.status}`);
      return new Uint8Array(await res.arrayBuffer());
    } catch (e) {
      console.log(`  range ${start}-${end} 重试 ${i + 1}: ${String(e).slice(0, 80)}`);
      await new Promise((r) => setTimeout(r, 1500 + i * 1000));
    }
  }
  throw new Error(`range ${start}-${end} 下载失败`);
}

/** EOCD 解析：普通返回 {cdOffset,cdSize}；zip64 返回 {zip64EocdOffset}（记录紧邻中央目录前） */
function parseEocd(tail) {
  const buf = Buffer.from(tail);
  let idx = -1;
  for (let i = buf.length - 22; i >= 0; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      idx = i;
      break;
    }
  }
  if (idx < 0) throw new Error("EOCD 未找到");
  const cdSize = buf.readUInt32LE(idx + 12);
  const cdOffset = buf.readUInt32LE(idx + 16);
  const entryCount = buf.readUInt32LE(idx + 10);
  if (cdOffset !== 0xffffffff && cdSize !== 0xffffffff && entryCount !== 0xffff) {
    return { cdOffset, cdSize };
  }
  // zip64：EOCD 定位器在 EOCD 前 20 字节，其 +8 为 eocd64 记录绝对偏移
  const loc = idx - 20;
  if (loc < 0 || buf.readUInt32LE(loc) !== 0x07064b50) throw new Error("zip64 定位器未找到");
  return { zip64EocdOffset: Number(buf.readBigUInt64LE(loc + 8)) };
}

/** zip64 EOCD 记录 → { cdOffset, cdSize } */
function parseZip64Eocd(rec) {
  const buf = Buffer.from(rec);
  if (buf.readUInt32LE(0) !== 0x06064b50) throw new Error("eocd64 签名错误");
  return {
    cdSize: Number(buf.readBigUInt64LE(40)),
    cdOffset: Number(buf.readBigUInt64LE(48)),
  };
}

/** 中央目录 → 条目列表（文件名/本地头偏移/压缩大小/压缩方法） */
function parseCentralDir(cd) {
  const buf = Buffer.from(cd);
  const entries = [];
  let p = 0;
  while (p + 46 <= buf.length && buf.readUInt32LE(p) === 0x02014b50) {
    const method = buf.readUInt16LE(p + 10);
    // 本 zip 仅 849MB：u32 足够；0xffffffff 才需要 zip64 扩展段（此处不会出现）
    const compSize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localOffset = buf.readUInt32LE(p + 42);
    const name = buf.slice(p + 46, p + 46 + nameLen).toString("utf8");
    entries.push({ name, method, compSize, localOffset });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

function inflate(method, data) {
  if (method === 0) return data; // stored
  if (method === 8) return new Uint8Array(zlib.inflateRawSync(Buffer.from(data)));
  throw new Error(`不支持的压缩方法 ${method}`);
}

async function main() {
  const head = await fetch(`${URL_ZIP}`, { method: "HEAD" });
  const total = Number(head.headers.get("content-length") ?? 0);
  if (!total) throw new Error("无法获取文件大小");
  console.log(`[sprites] 总大小 ${(total / 1048576).toFixed(0)}MB，解析中央目录…`);
  const tail = await fetchRange(Math.max(0, total - 65536), total - 1);
  let { cdOffset, cdSize } = parseEocd(tail);
  if (cdOffset === undefined) {
    // zip64：eocd64 记录在中央目录前，按需再取 56 字节
    const e = parseEocd(tail);
    const rec = await fetchRange(e.zip64EocdOffset, e.zip64EocdOffset + 55);
    ({ cdOffset, cdSize } = parseZip64Eocd(rec));
  }
  console.log(`[sprites] 中央目录 ${(cdSize / 1048576).toFixed(1)}MB @ ${cdOffset}`);
  const cdBuf = await fetchRange(cdOffset, cdOffset + cdSize - 1);
  const entries = parseCentralDir(cdBuf);
  console.log(`[sprites] 共 ${entries.length} 条目`);
  const wanted = entries.filter((e) => {
    if (e.name.endsWith("/")) return false;
    const m = e.name.match(/^sprites\/([^/]*)\/([^/]+\.(?:png|gif))$/i);
    if (!m) return false;
    return KEEP.includes(m[1]);
  });
  console.log(`[sprites] 目标 ${wanted.length} 个文件`);
  // 本地头在大块中的定位需要按 entry 逐个：本地头在 cd 里的 localOffset。
  // 按偏移排序后分块（每块 ≤16MB，覆盖连续区段，块内空隙一并下载）
  wanted.sort((a, b) => a.localOffset - b.localOffset);
  const BLOCK = 16 * 1024 * 1024;
  let done = 0;
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  let i = 0;
  while (i < wanted.length) {
    const blockStart = wanted[i].localOffset;
    let blockEnd = blockStart;
    let j = i;
    while (j < wanted.length && wanted[j].localOffset - blockStart < BLOCK) {
      blockEnd = Math.max(blockEnd, wanted[j].localOffset + 30 + 512 + wanted[j].compSize);
      j++;
    }
    const block = await fetchRange(blockStart, Math.min(blockEnd, total) - 1);
    const blockBuf = Buffer.from(block);
    for (; i < j; i++) {
      const e = wanted[i];
      const rel = e.localOffset - blockStart;
      if (rel < 0 || rel + 30 > blockBuf.length) throw new Error(`块外偏移：${e.name}`);
      const head2 = blockBuf.slice(rel, rel + 30);
      if (head2.readUInt32LE(0) !== 0x04034b50) throw new Error(`本地头错误：${e.name}`);
      const nameLen = head2.readUInt16LE(26);
      const extraLen = head2.readUInt16LE(28);
      const dataStart = rel + 30 + nameLen + extraLen;
      const comp = blockBuf.slice(dataStart, dataStart + e.compSize);
      const file = inflate(e.method, comp);
      const outPath = path.join(OUT, e.name.replace(/^sprites\//, "").replace(/\//g, path.sep));
      fs.mkdirSync(path.dirname(outPath), { recursive: true });
      fs.writeFileSync(outPath, file);
      done++;
    }
    process.stdout.write(`\r[sprites] ${done}/${wanted.length}`);
  }
  console.log("");
  const manifest = {
    sourceUrl: URL_ZIP,
    downloadedAt: new Date().toISOString(),
    files: done,
    keepDirs: KEEP,
    note: "仅个人本地使用（任天堂/宝可梦公司版权资产，不进入公开渠道）；选择性下载（中央目录 Range 解析）",
  };
  fs.writeFileSync(path.join(OUT, "manifest.json"), JSON.stringify(manifest, null, 2));
  console.log(`[sprites] OK：${done} 个文件 -> public/sprites/`);
}

main().catch((e) => {
  console.error("[sprites] 失败：", e);
  process.exit(1);
});
