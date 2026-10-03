/* 本地数据访问层：JSON 分片加载（浏览器 fetch / Node fs 注入两用）+ 表缓存与索引。
 * 分片布局见 scripts/export_static_data.py（tables/ learnsets/ learnsets_all/ encounters/）。 */

export type Row = Record<string, any>;
export type Loader = (rel: string) => Promise<any>;

const cache = new Map<string, any>(); // 相对路径 → 解析后的 JSON
let baseDir = "data/"; // 浏览器：相对 index.html；Node 驱动可覆写
let loader: Loader | null = null; // 默认 fetch

export function setLoader(fn: Loader, dir?: string): void {
  loader = fn;
  if (dir !== undefined) baseDir = dir;
}

async function load(rel: string): Promise<any> {
  if (cache.has(rel)) return cache.get(rel);
  if (!loader) {
    loader = (p: string) =>
      fetch(baseDir + p).then((r) => {
        if (!r.ok) throw new Error("本地数据缺失：" + p);
        return r.json();
      });
  }
  const data = await loader(rel);
  cache.set(rel, data);
  return data;
}

export async function table(name: string): Promise<Row[]> {
  return (await load(`tables/${name}.json`)).rows as Row[];
}
export async function learnsetsByVg(vg: number): Promise<Row[]> {
  const data = await load(`learnsets/vg${vg}.json`).catch(() => ({ rows: [] }));
  return data.rows as Row[];
}
export async function learnsetsAllOf(sid: number): Promise<Row[]> {
  const data = await load(`learnsets_all/${sid}.json`).catch(() => ({ rows: [] }));
  return data.rows as Row[];
}
export async function encountersOf(sid: number): Promise<Row[]> {
  const data = await load(`encounters/${sid}.json`).catch(() => ({ rows: [] }));
  return data.rows as Row[];
}
export async function manifest(): Promise<any> {
  return load("manifest.json");
}

// ---- 常驻索引（懒建；全量小表一次载入后建 Map） ----
const idx = new Map<string, Map<any, Row[]>>(); // 名字 → Map(key → rows[])
function buildIndex(rows: Row[], keyFn: (r: Row) => any): Map<any, Row[]> {
  const m = new Map<any, Row[]>();
  for (const r of rows) {
    const k = keyFn(r);
    let arr = m.get(k);
    if (!arr) {
      arr = [];
      m.set(k, arr);
    }
    arr.push(r);
  }
  return m;
}
export async function index(name: string, keyFn: (r: Row) => any): Promise<Map<any, Row[]>> {
  if (!idx.has(name)) idx.set(name, buildIndex(await table(name), keyFn));
  return idx.get(name)!;
}

export function clearCache(): void {
  cache.clear();
  idx.clear();
}
