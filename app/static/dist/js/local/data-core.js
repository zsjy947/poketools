/* 本地数据访问层：JSON 分片加载（浏览器 fetch / Node fs 注入两用）+ 表缓存与索引。
 * 分片布局见 scripts/export_static_data.py（tables/ learnsets/ learnsets_all/ encounters/）。 */
(function (g) {
  "use strict";
  const PKT = (g.__PKT_LOCAL__ = g.__PKT_LOCAL__ || {});

  const cache = new Map();          // 相对路径 → 解析后的 JSON
  let baseDir = "data/";            // 浏览器：相对 index.html；Node 驱动可覆写
  let loader = null;                // (path) => Promise<object>；默认 fetch

  function setLoader(fn, dir) {
    loader = fn;
    if (dir !== undefined) baseDir = dir;
  }

  async function load(rel) {
    if (cache.has(rel)) return cache.get(rel);
    if (!loader) {
      loader = (p) => fetch(baseDir + p).then((r) => {
        if (!r.ok) throw new Error("本地数据缺失：" + p);
        return r.json();
      });
    }
    const data = await loader(rel);
    cache.set(rel, data);
    return data;
  }

  async function table(name) {
    return (await load(`tables/${name}.json`)).rows;
  }
  async function learnsetsByVg(vg) {
    const data = await load(`learnsets/vg${vg}.json`).catch(() => ({ rows: [] }));
    return data.rows;
  }
  async function learnsetsAllOf(sid) {
    const data = await load(`learnsets_all/${sid}.json`).catch(() => ({ rows: [] }));
    return data.rows;
  }
  async function encountersOf(sid) {
    const data = await load(`encounters/${sid}.json`).catch(() => ({ rows: [] }));
    return data.rows;
  }
  async function manifest() { return load("manifest.json"); }

  // ---- 常驻索引（懒建；全量小表一次载入后建 Map） ----
  const idx = new Map();            // 名字 → Map(key → rows[])
  function buildIndex(rows, keyFn) {
    const m = new Map();
    for (const r of rows) {
      const k = keyFn(r);
      let arr = m.get(k);
      if (!arr) { arr = []; m.set(k, arr); }
      arr.push(r);
    }
    return m;
  }
  async function index(name, keyFn) {
    if (!idx.has(name)) idx.set(name, buildIndex(await table(name), keyFn));
    return idx.get(name);
  }

  PKT.data = {
    load, table, learnsetsByVg, learnsetsAllOf, encountersOf, manifest,
    setLoader, index, clearCache: () => { cache.clear(); idx.clear(); },
  };
})(typeof window !== "undefined" ? window : globalThis);
