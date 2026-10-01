/* 努力值/三明治/甜甜圈/咖喱/野餐/生蛋链/属性相性端点本地实现：
 * app/routers/lookup.py + app/services/breeding.py 逐行移植。 */
(function (g) {
  "use strict";
  const PKT = (g.__PKT_LOCAL__ = g.__PKT_LOCAL__ || {});
  const D = () => PKT.data;

  const EV_COLS = { hp: "ev_hp", atk: "ev_atk", def: "ev_def",
    spa: "ev_spa", spd: "ev_spd", spe: "ev_spe" };
  const EV_KEYS = ["hp", "atk", "def", "spa", "spd", "spe"];

  const WILD_METHOD_KEYWORDS = ["可见", "隨機", "随机", "垂钓", "沖浪", "冲浪", "大量出现",
    "时空歪曲", "宝可梦追踪", "涂甜甜蜜", "野生", "摇动", "四处游走"];

  function isWildMethod(method) {
    const m = method || "";
    if (!m || m.includes("团体战") || m.includes("不存在") || m.includes("交换")
      || m.includes("赠送") || m.includes("化石")) return false;
    return WILD_METHOD_KEYWORDS.some((k) => m.includes(k));
  }

  function cmpStr(a, b) { return a < b ? -1 : a > b ? 1 : 0; }

  // ---- GET /api/ev ----
  let gameDexSpeciesCache = null;
  async function gameDexSpecies() {
    if (gameDexSpeciesCache) return gameDexSpeciesCache;
    const [entries, dexes] = await Promise.all([D().table("dex_entries"), D().table("regional_dexes")]);
    const out = new Map();
    for (const e of entries) {
      const d = dexes.find((x) => x.id === e.dex_id);
      if (!d) continue;
      if (!out.has(d.game_id)) out.set(d.game_id, new Set());
      out.get(d.game_id).add(e.species_id);
    }
    gameDexSpeciesCache = out;
    return out;
  }

  async function evFilter(params) {
    const stat = params.stat, value = parseInt(params.value || "0", 10);
    const game = params.game || "", q = params.q || "";
    const col = EV_COLS[stat];
    const allForms = await D().table("forms");
    const speciesRows = await D().table("species");
    const spById = new Map(speciesRows.map((s) => [s.id, s]));
    const rows = allForms.filter((f) => f.is_default === 1
      && (value === 0 ? f[col] > 0 : f[col] === value))
      .map((f) => ({ species_id: f.species_id,
        name_zh: (spById.get(f.species_id) || {}).name_zh,
        name_en: (spById.get(f.species_id) || {}).name_en,
        form_id: f.id, types: f.types,
        ev_hp: f.ev_hp, ev_atk: f.ev_atk, ev_def: f.ev_def,
        ev_spa: f.ev_spa, ev_spd: f.ev_spd, ev_spe: f.ev_spe }))
      .sort((a, b) => a.species_id - b.species_id);

    const qLower = q.trim().toLowerCase();
    const override = new Map();
    if (game) {
      const dexes = await D().table("regional_dexes");
      const ddf = await D().table("dex_default_forms");
      for (const r of ddf) {
        const d = dexes.find((x) => x.id === r.dex_id);
        if (d && d.game_id === game) {
          const f = allForms.find((x) => x.id === r.form_id);
          if (f) override.set(r.species_id, f);
        }
      }
    }
    const wild = new Map();
    if (game) {
      const ovSuffix = new Map();
      for (const [sid, f] of override) {
        const ident = f.identifier || "";
        const parts = ident.split("-");
        ovSuffix.set(sid, ident.includes("-") ? parts[parts.length - 1] : "");
      }
      for (const r of (await D().table("get_methods"))
        .filter((x) => x.game === game && x.location !== "")) {
        if (!isWildMethod(r.method)) continue;
        if (r.form && (PKT.pokemonApi.FORM_MARKER_TO_SUFFIX[r.form] || null)
          !== (ovSuffix.get(r.species_id) || "")) continue;
        if (!wild.has(r.species_id)) wild.set(r.species_id, []);
        wild.get(r.species_id).push({ location: r.location, method: r.method,
          version_label: r.version_label });
      }
    }
    const dexSpecies = game ? (await gameDexSpecies()).get(game) || new Set() : null;
    const out = [];
    for (const r of rows) {
      if (game && !dexSpecies.has(r.species_id)) continue;
      if (qLower && !((r.name_zh || "").toLowerCase().includes(qLower)
        || (r.name_en || "").toLowerCase().includes(qLower))) continue;
      const d = Object.assign({}, r);
      d.ev = {}; for (const k of EV_KEYS) d.ev[k] = r[EV_COLS[k]];
      const ov = override.get(r.species_id);
      if (ov) {
        for (const k of EV_KEYS) d[k] = ov[EV_COLS[k]];  // Python 写无前缀键（hp/atk/…）
        d.ev = {}; for (const k of EV_KEYS) d.ev[k] = ov[EV_COLS[k]];
        d.form_id = ov.id;
        d.types = ov.types;
      }
      const locs = wild.get(r.species_id) || [];
      const merged = new Map();
      for (const item of locs) {
        if (!merged.has(item.location)) {
          merged.set(item.location, { location: item.location, methods: new Set(), labels: new Set() });
        }
        const m = merged.get(item.location);
        m.methods.add(item.method);
        m.labels.add(item.version_label);
      }
      d.locations = [...merged.values()].map((m) => ({
        location: m.location,
        method: [...m.methods].sort(cmpStr).join("、"),
        version_label: [...m.labels].sort(cmpStr).join("、"),
      }));
      out.push(d);
    }
    return out;
  }

  // ---- GET /api/sandwiches ----
  async function sandwiches(params) {
    const p = params || {};
    const power = p.power || "", ptype = p.ptype || "";
    const level = parseInt(p.level || "0", 10);
    const sort = p.sort || "no";
    const qLower = (p.q || "").trim().toLowerCase();
    const rows = (await D().table("sandwiches"))
      .slice().sort((a, b) => a.no - b.no)
      .map((r) => Object.assign({}, r, { effects: JSON.parse(r.effects || "[]") }));
    const out = [];
    for (const r of rows) {
      if (qLower && !(r.name || "").toLowerCase().includes(qLower)
        && !((r.ingredients || "") + (r.seasonings || "")).toLowerCase().includes(qLower)) continue;
      let effs = r.effects;
      if (power) effs = effs.filter((e) => e.power === power);
      if (ptype) effs = effs.filter((e) => e.type === ptype);
      if (level) effs = effs.filter((e) => e.level === level);
      if ((power || ptype || level) && !effs.length) continue;
      out.push(Object.assign({}, r, { effects: effs,
        _min_level: Math.min(...r.effects.map((e) => e.level), 9) }));
    }
    if (sort === "power") {
      out.sort((a, b) => cmpStr(a.effects[0] ? a.effects[0].power : "", b.effects[0] ? b.effects[0].power : "")
        || (a.no - b.no));
    } else if (sort === "level") {
      out.sort((a, b) => (Math.max(...b.effects.map((e) => e.level), 0)
        - Math.max(...a.effects.map((e) => e.level), 0)) || (a.no - b.no));
    }
    return out;
  }

  // ---- GET /api/breed-chains ----
  const GAME_LEARNSET_VG = {
    "sword-shield": 20,
    "brilliant-diamond-shining-pearl": 23,
    "legends-arceus": 24,
    "scarlet-violet": 25,
    "legends-za": 30,
  };
  const METHOD_TEXT = { "level-up": "升级学会", "machine": "招式学习器", "tutor": "教授招式", "egg": "蛋招式" };
  const MAX_PATHS = 100;

  async function breedChains(speciesId, moveId, game) {
    if (!(game in GAME_LEARNSET_VG)) throw new Error("unknown game");
    const vg = GAME_LEARNSET_VG[game];
    const speciesRows = await D().table("species");
    const sp = speciesRows.find((s) => s.id === speciesId);
    if (!sp) return { ok: false, reason: "未找到目标宝可梦" };
    const movesRows = await D().table("moves");
    const mv = movesRows.find((m) => m.id === moveId);
    if (!mv) return { ok: false, reason: "未找到招式" };
    const targetGroups = new Set((sp.egg_groups || "").split(",").filter(Boolean));
    if (!targetGroups.size || (targetGroups.size === 1 && targetGroups.has("未发现"))) {
      return { ok: false, reason: "该宝可梦属于「未发现」蛋组，无法通过生蛋遗传招式" };
    }

    const forms = await D().table("forms");
    const formSpecies = new Map(forms.map((f) => [f.id, f.species_id]));
    const spName = new Map(speciesRows.map((s) => [s.id, s.name_zh]));
    const lsRows = (await D().learnsetsByVg(vg)).filter((l) => l.move_id === moveId);

    // learners：Map 保插入序（整数键的普通对象会按数值序迭代，破坏路径顺序语义）
    const learners = new Map();
    for (const l of lsRows) {
      const sid = formSpecies.get(l.form_id);
      if (sid === undefined) continue;
      let info = learners.get(sid);
      if (!info) {
        info = { species_id: sid, name: spName.get(sid),
          groups: new Set(((speciesRows.find((s) => s.id === sid) || {}).egg_groups || "").split(",").filter(Boolean)),
          gender_rate: (speciesRows.find((s) => s.id === sid) || {}).gender_rate,
          direct: null, egg: false };
        learners.set(sid, info);
      }
      if (l.method === "egg") info.egg = true;
      else if (info.direct === null) {
        info.direct = l.method === "level-up" ? `升级Lv.${l.level}学会`
          : (METHOD_TEXT[l.method] !== undefined ? METHOD_TEXT[l.method] : l.method);
      }
    }

    function breedable(info) {
      return Boolean(info.groups.size)
        && (info.groups.has("百变怪")
          || (info.gender_rate !== -1 && info.gender_rate !== null && info.gender_rate !== undefined));
    }
    const nodes = new Map();
    for (const [sid, i] of learners) {
      if (sid !== speciesId && breedable(i)) nodes.set(sid, i);
    }
    const sources = new Map();
    for (const [sid, i] of nodes) if (i.direct) sources.set(sid, i);
    if (!sources.size) {
      return { ok: false, reason: "当前游戏中没有可直接自学该招式的宝可梦，无法计算生蛋链" };
    }

    function compatible(g1, g2) {
      if (!g1.size || !g2.size || g1.has("未发现") || g2.has("未发现")) return false;
      if (g1.has("百变怪") || g2.has("百变怪")) return true;
      for (const x of g1) if (g2.has(x)) return true;
      return false;
    }
    const targets = [];
    for (const [sid, i] of nodes) {
      if (compatible(i.groups, targetGroups)) targets.push(sid);
    }
    if (!targets.length) {
      return { ok: false, reason: "没有可交配的宝可梦能学会该招式" };
    }

    const groupIndex = new Map();
    for (const [sid, i] of nodes) {
      for (const gp of i.groups) {
        if (!groupIndex.has(gp)) groupIndex.set(gp, []);
        groupIndex.get(gp).push(sid);
      }
    }
    const nodeArr = [...nodes.keys()];
    function neighbors(sid) {
      const out = new Set();
      for (const gp of nodes.get(sid).groups) {
        for (const n of groupIndex.get(gp) || []) out.add(n);
      }
      if (nodes.get(sid).groups.has("百变怪")) {
        for (const n of nodeArr) out.add(n);
      }
      for (const n of nodeArr) {
        if (nodes.get(n).groups.has("百变怪")) out.add(n);
      }
      out.delete(sid);
      return [...out].sort((a, b) => a - b);
    }

    const dist = new Map();
    for (const sid of sources.keys()) dist.set(sid, 0);
    const parents = new Map();
    let frontier = [...sources.keys()];
    let best = null;
    while (frontier.length) {
      const nxt = [];
      for (const sid of frontier) {
        if (best !== null && dist.get(sid) >= best) continue;
        for (const nb of neighbors(sid)) {
          if (dist.has(nb) && dist.get(nb) <= dist.get(sid) + 1) {
            if (dist.has(nb) && dist.get(nb) === dist.get(sid) + 1) {
              if (!parents.has(nb)) parents.set(nb, []);
              if (!parents.get(nb).includes(sid)) parents.get(nb).push(sid);
            }
            continue;
          }
          dist.set(nb, dist.get(sid) + 1);
          parents.set(nb, [sid]);
          if (targets.includes(nb)) best = dist.get(nb);
          nxt.push(nb);
        }
      }
      frontier = nxt;
    }

    const achieved = targets.filter((t) => dist.has(t));
    if (!achieved.length) {
      return { ok: false, reason: "能学会该招式的宝可梦与目标没有可交配的途径" };
    }
    const minD = Math.min(...achieved.map((t) => dist.get(t)));
    const endNodes = achieved.filter((t) => dist.get(t) === minD);

    const paths = [];
    function backtrack(node, acc) {
      if (paths.length >= MAX_PATHS) return;
      if (dist.get(node) === 0) { paths.push([node].concat(acc)); return; }
      for (const p of parents.get(node) || []) backtrack(p, [node].concat(acc));
    }
    for (const t of endNodes) backtrack(t, []);

    function nodePayload(sid) {
      const i = learners.get(sid);
      return { species_id: sid, name: i.name,
        groups: [...i.groups].sort(cmpStr),
        learn: i.direct || "蛋招式（需由上一环遗传）" };
    }
    function sharedGroups(a, b) {
      const ia = learners.get(a), ib = learners.get(b);
      const ga = ia ? ia.groups : targetGroups;
      const gb = ib ? ib.groups : targetGroups;
      let arr;
      if (ga.has("百变怪") || gb.has("百变怪")) {
        const inter = [...ga].filter((x) => gb.has(x));
        arr = inter.length ? inter : ["百变怪"];
      } else {
        arr = [...ga].filter((x) => gb.has(x));
      }
      return arr.sort(cmpStr);
    }

    const chains = [];
    for (const p of paths) {
      const seq = p.concat([speciesId]);
      const steps = [];
      for (let i = 0; i < seq.length - 1; i++) {
        const a = seq[i], b = seq[i + 1];
        steps.push({
          from: nodePayload(a),
          to: b !== speciesId ? nodePayload(b) : {
            species_id: speciesId, name: sp.name_zh,
            groups: [...targetGroups].sort(cmpStr), learn: "目标宝可梦",
          },
          shared_groups: sharedGroups(a, b),
        });
      }
      chains.push({ steps, length: p.length });
    }
    return {
      ok: true,
      move: { id: mv.id, name: mv.name_zh },
      target: { species_id: speciesId, name: sp.name_zh,
        groups: [...targetGroups].sort(cmpStr) },
      min_length: minD + 1,
      chain_count: chains.length,
      truncated: chains.length >= MAX_PATHS,
      chains,
      note: "按第六世代起机制计算（双亲均可遗传蛋招式）；实际操作还需注意性别比与百变怪搭配。",
    };
  }

  // ---- 简单表端点 ----
  async function typechart() {
    const CHART = PKT.damage.CHART;
    const chart = {};
    for (const atk of Object.keys(CHART)) {
      chart[atk] = {};
      for (const [dfd, mult] of Object.entries(CHART[atk])) chart[atk][dfd] = mult;
    }
    return { types: PKT.damage.TYPES, chart };
  }

  async function picnicItems(params) {
    const kind = (params && params.kind) || "";
    const rows = await D().table("picnic_items");
    // rowid = 全表序（1..78 连续）；响应按 (kind, name) 排序（对齐 SQL ORDER BY）
    const indexed = rows.map((r, i) => Object.assign({ no_rowid: i + 1 }, r));
    indexed.sort((a, b) => cmpStr(a.kind, b.kind) || cmpStr(a.name, b.name));
    return kind ? indexed.filter((r) => r.kind === kind) : indexed;
  }

  async function donuts() {
    const [types, special, berries, flavor] = await Promise.all([
      D().table("donut_types"), D().table("special_donuts"),
      D().table("berries"), D().table("flavor_powers")]);
    return { types, special,
      berries: berries.slice().sort((a, b) => (a.energy - b.energy) || cmpStr(a.name, b.name)),
      flavor_powers: flavor };
  }

  async function curries(params) {
    const p = params || {};
    const q = (p.q || "").trim();
    const keyIng = p.key_ingredient || "";
    let rows = (await D().table("curries")).slice();
    if (q) {
      rows = rows.filter((r) => (r.name || "").includes(q) || (r.key_ingredient || "").includes(q));
    }
    if (keyIng) rows = rows.filter((r) => r.key_ingredient === keyIng);
    rows.sort((a, b) => a.no - b.no);
    return rows;
  }

  PKT.lookupApi = { evFilter, sandwiches, breedChains, typechart, picnicItems, donuts, curries };
})(typeof window !== "undefined" ? window : globalThis);
