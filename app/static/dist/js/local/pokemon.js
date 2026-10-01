/* 图鉴/详情端点本地实现：app/routers/pokemon.py + dex.py（games/dex_entries）逐行移植。
 * 分片来自 tables/*（行序=SQLite rowid 序，与 SQL 查询序一致性由 scripts/verify_static_equivalence.py 把关）。 */
(function (g) {
  "use strict";
  const PKT = (g.__PKT_LOCAL__ = g.__PKT_LOCAL__ || {});
  const D = () => PKT.data;

  const GAME_ORDER = ["sword-shield", "brilliant-diamond-shining-pearl", "legends-arceus",
    "scarlet-violet", "legends-za"];
  const GAME_RANK = new Map(GAME_ORDER.map((x, i) => [x, i]));

  const TRIGGER_ZH = {
    "level-up": "等级提升", "trade": "连接交换", "use-item": "使用道具",
    "shed": "脱皮", "spin": "旋转", "tower-of-darkness": "恶之塔",
    "three-critical-hits": "3次会心", "damage-location": "特定地点受伤",
    "agile-style-move": "迅疾招式", "strong-style-move": "刚猛招式",
    "recoil-damage": "反动伤害",
  };
  const _NATURE_ZH = { 1: "勤奋", 2: "怕寂寞", 3: "勇敢", 4: "固执", 5: "顽皮", 6: "大胆",
    7: "坦率", 8: "悠闲", 9: "淘气", 10: "乐天", 11: "胆小", 12: "急躁",
    13: "认真", 14: "爽朗", 15: "天真", 16: "内敛", 17: "慢吞吞", 18: "冷静",
    19: "害羞", 20: "马虎", 21: "温和", 22: "温顺", 23: "自大", 24: "慎重",
    25: "浮躁" };
  const FORM_MARKER_TO_SUFFIX = {
    "A": "alola", "G": "galar", "H": "hisui", "P": "paldea",
    "W": "white-striped", "B": "blue-striped",
    "D": "dusk", "Mn": "midnight", "N": "midday", "L": "low-key",
    "F": "female", "M": "male", "GM": "gmax",
    "PA": "paldea-combat-breed", "PB": "paldea-blaze-breed", "PC": "paldea-aqua-breed",
  };
  const SUFFIX_REGION_ZH = { "alola": "阿罗拉", "galar": "伽勒尔", "hisui": "洗翠", "paldea": "帕底亚" };
  const GAME_MOVE_CONFIG = {
    "sword-shield": { vg: 20, tm_vgs: [20],
      tabs: [["level", "升级"], ["machine", "招式学习器"], ["egg", "蛋招式"], ["tutor", "教授"]] },
    "brilliant-diamond-shining-pearl": { vg: 23, tm_vgs: [23],
      tabs: [["level", "升级"], ["machine", "招式学习器"], ["egg", "蛋招式"], ["tutor", "教授"]] },
    "legends-arceus": { vg: 24, tm_vgs: [],
      tabs: [["level", "升级"], ["tutor", "教授"]] },
    "scarlet-violet": { vg: 25, tm_vgs: [25],
      tabs: [["level", "升级"], ["evolution-recall", "进化&回忆"], ["machine", "招式学习器"], ["egg", "蛋招式"]] },
    "legends-za": { vg: 30, tm_vgs: [30, 31],
      tabs: [["level", "升级"], ["machine", "招式学习器"]] },
  };
  const EVOLUTION_RECALL_GAMES = new Set(["scarlet-violet"]);
  const TYPE_ORDER = ["一般", "火", "水", "电", "草", "冰", "格斗", "毒", "地面",
    "飞行", "超能力", "虫", "岩石", "幽灵", "龙", "恶", "钢", "妖精"];

  function typeSort(types) {
    const parts = (types || "").split(",").filter(Boolean);
    parts.sort((a, b) => {
      const ra = TYPE_ORDER.indexOf(a), rb = TYPE_ORDER.indexOf(b);
      return ((ra === -1 ? 99 : ra) - (rb === -1 ? 99 : rb));
    });
    return parts.join(",");
  }
  function cmpStr(a, b) { return a < b ? -1 : a > b ? 1 : 0; }
  function gameOrderCmp(a, b) {
    return (GAME_RANK.get(a) ?? 99) - (GAME_RANK.get(b) ?? 99);
  }

  // ---- 形态工具 ----
  async function formsOfSpecies(sid) {
    // 克隆：detail 会往 form 行挂 ability_list，不得污染 data-core 表缓存
    const forms = (await D().table("forms")).filter((f) => f.species_id === sid)
      .map((f) => Object.assign({}, f));
    forms.sort((a, b) => (b.is_default - a.is_default) || (a.id - b.id));
    return forms;
  }
  function formBySuffix(speciesForms, suffix) {
    if (!suffix) {
      return speciesForms.find((f) => f.is_default) || null;
    }
    const cands = speciesForms.filter((f) => (f.identifier || "").endsWith("-" + suffix)
      || (f.identifier || "").includes("-" + suffix + "-"));
    cands.sort((a, b) => (a.identifier || "").length - (b.identifier || "").length);
    return cands[0] || null;
  }

  // ---- 特性文案 ----
  async function abilitiesOf(form) {
    const abils = (form.abilities || "").split(",").filter(Boolean);
    const hidden = new Set((form.hidden_abilities || "").split(",").filter(Boolean));
    const prose = new Map((await D().table("abilities")).map((r) => [r.name_zh, r]));
    return abils.map((a) => {
      const p = prose.get(a) || {};
      return { name: a, hidden: hidden.has(a),
        intro: p.intro || "", effect: p.effect || "",
        extra: p.extra ? JSON.parse(p.extra || "[]") : [] };
    });
  }

  // ---- 进化条件文本（_evo_condition 移植） ----
  function decodeNatures(mask) {
    const m = parseInt(mask, 10);
    if (!Number.isFinite(m)) return [];
    const out = [];
    for (let i = 0; i < 25; i++) if (m & (1 << i)) out.push(_NATURE_ZH[i + 1]);
    return out;
  }
  function evoCondition(row) {
    const trig = row.trigger;
    const parts = [];
    if (trig === "level-up") parts.push(row.min_level ? `Lv.${row.min_level}` : "升级");
    else if (trig === "use-item") parts.push(row.item ? `使用${row.item}` : "使用道具");
    else if (trig === "trade") parts.push(row.trade_species ? `与${row.trade_species}交换` : "连接交换");
    else parts.push(TRIGGER_ZH[trig] !== undefined ? TRIGGER_ZH[trig] : trig);
    if (row.held_item) parts.push(`携带${row.held_item}`);
    if (row.min_happiness) parts.push(`亲密度≥${row.min_happiness}`);
    if (row.min_affection) parts.push(`友好度≥${row.min_affection}`);
    if (row.known_move) parts.push(`学会${row.known_move}`);
    if (row.time_of_day) {
      parts.push({ "day": "白天", "night": "夜晚", "dusk": "黄昏" }[row.time_of_day] || row.time_of_day);
    }
    if (row.needs_overworld_rain) parts.push("下雨时");
    if (row.turn_upside_down) parts.push("倒置主机");
    if (row.location) parts.push(`在${row.location}`);
    if (row.region) parts.push(`在${row.region}地区`);
    if (row.gender) parts.push(`${row.gender}限定`);
    if (row.known_move_type) parts.push(`学会${row.known_move_type}属性招式`);
    if (row.relative_physical_stats !== null && row.relative_physical_stats !== undefined) {
      parts.push({ 1: "攻击>防御", 0: "攻击=防御", "-1": "攻击<防御" }[String(row.relative_physical_stats)] || "");
    }
    if (row.party_species) parts.push(`队伍中有${row.party_species}`);
    if (row.party_type) parts.push(`队伍中有${row.party_type}属性宝可梦`);
    if (row.near_special_rock) {
      parts.push(row.to_species === 471 ? "在冰岩石附近" : "在苔藓岩石附近");
    }
    if (row.min_beauty) parts.push(`美丽≥${row.min_beauty}`);
    if (row.needs_multiplayer) parts.push("联机游玩时");
    if (row.min_move_count) parts.push(`特定招式累计使用${row.min_move_count}次`);
    if (row.min_steps) parts.push(`同行走${row.min_steps}步`);
    if (row.min_damage_taken) parts.push(`累计受到伤害≥${row.min_damage_taken}`);
    if (row.nature_bitmask) parts.push("性格：" + decodeNatures(row.nature_bitmask).join("、"));
    return parts.filter(Boolean).join("，");
  }

  // ---- 进化家族树（_evolution_chain 移植） ----
  async function evolutionChain(speciesId, formSuffix) {
    const speciesRows = await D().table("species");
    const byId = new Map(speciesRows.map((s) => [s.id, s]));
    const sp = byId.get(speciesId);
    if (!sp) return { root: null, nodes: {}, children: {}, conds: {} };
    const seen = new Set([speciesId]);
    let cur = sp;
    while (cur.evolves_from) {
      if (seen.has(cur.evolves_from)) break;
      seen.add(cur.evolves_from);
      cur = byId.get(cur.evolves_from);
      if (!cur) break;
    }
    const root = cur.id;

    const allForms = await D().table("forms");
    const formsOf = (sid) => allForms.filter((f) => f.species_id === sid);

    // 地区形态分支（curated）
    const branches = new Map();
    for (const r of await D().table("evo_branches")) {
      if (String(r.family_key) !== String(root)) continue;
      if (!branches.has(r.branch)) branches.set(r.branch, []);
      branches.get(r.branch).push([r.species_id, r.form_suffix]);
    }
    if (branches.size) {
      const sel = [speciesId, formSuffix || ""];
      let chosen = null;
      for (const toks of branches.values()) {
        if (toks.some((t) => t[0] === sel[0] && t[1] === sel[1])) { chosen = toks; break; }
      }
      if (chosen === null) {
        for (const toks of branches.values()) {
          if (toks.length && toks[0][1] === "") { chosen = toks; break; }
        }
      }
      if (chosen !== null) {
        const nodes = {}, children = {}, conds = {};
        const chosenIds = [...new Set(chosen.map((t) => t[0]))];
        const evolutions = await D().table("evolutions");
        let prev = null;
        const baseSuf = chosen[0][1];
        for (const [sid, suf] of chosen) {
          const f = formBySuffix(formsOf(sid), suf);
          nodes[sid] = { species_id: sid, name: (byId.get(sid) || { name_zh: String(sid) }).name_zh,
            form_id: f ? f.id : 0, types: f ? (f.types || "") : "", form_suffix: suf };
          if (prev !== null) {
            (children[prev[0]] = children[prev[0]] || []).push(sid);
            const r = evolutions.find((e) => e.from_species === prev[0] && e.to_species === sid) || null;
            let cond = r ? evoCondition(r) : "进化";
            const regionSuf = SUFFIX_REGION_ZH[suf] ? suf : (SUFFIX_REGION_ZH[baseSuf] ? baseSuf : "");
            if (regionSuf && (!r || !r.region)
              && !cond.includes(SUFFIX_REGION_ZH[regionSuf])) {
              const prefix = `在${SUFFIX_REGION_ZH[regionSuf]}地区`;
              cond = (cond && cond !== "进化") ? `${prefix}，${cond}` : `${prefix}进化`;
            }
            conds[`${prev[0]}|${sid}`] = cond;
          }
          prev = [sid, suf];
        }
        void chosenIds;
        return { root: chosen[0][0], nodes, children, conds, branched: true };
      }
    }

    // 常规家族：根向下 BFS
    const evolutions = await D().table("evolutions");
    const family = new Set([root]);
    const queue = [root];
    while (queue.length) {
      const sid = queue.pop();
      for (const r of evolutions) {
        if (r.from_species === sid && !family.has(r.to_species)) {
          family.add(r.to_species);
          queue.push(r.to_species);
        }
      }
    }
    const nodes = {}, children = {}, conds = {};
    for (const sid of family) {
      const s = byId.get(sid);
      const f = formsOf(sid).find((x) => x.is_default) || null;
      nodes[sid] = { species_id: sid, name: s ? s.name_zh : String(sid),
        form_id: f ? f.id : 0, types: f ? (f.types || "") : "" };
    }
    for (const r of evolutions) {
      if (family.has(r.from_species) && family.has(r.to_species)) {
        (children[r.from_species] = children[r.from_species] || []).push(r.to_species);
        const cond = evoCondition(r);
        const key = `${r.from_species}|${r.to_species}`;
        if (conds[key] === undefined || cond.length > conds[key].length) conds[key] = cond;
      }
    }
    return { root, nodes, children, conds };
  }

  // ---- GET /api/games ----
  async function games() {
    const gamesRows = (await D().table("games")).slice()
      .sort((a, b) => a.sort - b.sort);
    const dexes = await D().table("regional_dexes");
    const entries = await D().table("dex_entries");
    const out = [];
    for (const gm of gamesRows) {
      let features = [];
      try { features = JSON.parse(gm.features || "[]"); } catch (e) { features = []; }
      const myDexes = dexes.filter((d) => d.game_id === gm.id)
        .sort((a, b) => a.sort - b.sort)
        .map((d) => ({ id: d.id, name_zh: d.name_zh, name_en: d.name_en,
          total: entries.filter((e) => e.dex_id === d.id).length }));
      const row = Object.assign({}, gm);
      delete row.features;
      out.push(Object.assign(row, { features, dexes: myDexes }));
    }
    return out;
  }

  // ---- GET /api/dex/{dex_id} ----
  async function dexEntries(dexId, params) {
    const p = params || {};
    const filter = p.filter || "all";
    const dexes = await D().table("regional_dexes");
    const gamesRows = await D().table("games");
    const dex = dexes.find((d) => d.id === dexId);
    if (!dex) throw new Error("dex not found");
    const game = gamesRows.find((x) => x.id === dex.game_id);
    const overrideMap = new Map((await D().table("dex_default_forms"))
      .filter((r) => r.dex_id === dexId).map((r) => [r.species_id, r.form_id]));
    const allForms = await D().table("forms");
    const typesMap = new Map();
    for (const f of allForms) {
      if (f.is_default) typesMap.set(f.species_id, [f.id, f.types || ""]);
    }
    const caught = PKT.state.caughtMap(dexId);
    const speciesRows = await D().table("species");
    const spById = new Map(speciesRows.map((s) => [s.id, s]));
    const entryRows = (await D().table("dex_entries"))
      .filter((e) => e.dex_id === dexId).sort((a, b) => a.ndex - b.ndex);
    const qLower = (p.q || "").trim().toLowerCase();
    let entries = entryRows.map((e) => {
      const sp = spById.get(e.species_id) || {};
      let [fid, tp] = typesMap.get(e.species_id) || [0, ""];
      const ofid = overrideMap.get(e.species_id);
      if (ofid) {
        const frow = allForms.find((f) => f.id === ofid);
        fid = ofid;
        tp = frow ? (frow.types || "") : "";
      }
      return { ndex: e.ndex, species_id: e.species_id,
        name_zh: sp.name_zh, name_en: sp.name_en,
        types: typeSort(tp), form_id: fid,
        caught: caught.get(e.species_id) || false };
    });
    if (filter === "caught") entries = entries.filter((e) => e.caught);
    else if (filter === "uncaught") entries = entries.filter((e) => !e.caught);
    if (p.type) entries = entries.filter((e) => e.types.split(",").includes(p.type));
    if (qLower) {
      entries = entries.filter((e) => qLower.includes
        ? ((e.name_zh || "").toLowerCase().includes(qLower)
          || (e.name_en || "").toLowerCase().includes(qLower)
          || qLower === String(e.ndex))
        : true);
    }
    return { id: dex.id, name_zh: dex.name_zh, name_en: dex.name_en,
      game_id: dex.game_id, game_zh: game ? game.name_zh : null,
      total: entries.length, entries };
  }

  // ---- GET /api/pokemon/{species_id} ----
  async function pokemonDetail(speciesId, params) {
    const p = params || {};
    const game = p.game || "";
    const form = p.form || "";
    const dexParam = p.dex || "";
    const speciesRows = await D().table("species");
    const sp = speciesRows.find((s) => s.id === speciesId);
    if (!sp) throw new Error("species not found");

    let forms = await formsOfSpecies(speciesId);
    let defaultForm = forms.find((f) => f.is_default) || forms[0] || null;

    let dexDefaultSuffix = "";
    if (dexParam) {
      const ddf = (await D().table("dex_default_forms"))
        .find((r) => r.dex_id === dexParam && r.species_id === speciesId);
      if (ddf) {
        const frow = forms.find((f) => f.id === ddf.form_id);
        if (frow) {
          const parts = (frow.identifier || "").split("-");
          dexDefaultSuffix = parts.length > 1 ? parts[parts.length - 1] : "";
        }
      }
    }

    if (game) {
      const avail = new Map();
      for (const r of await D().table("form_game_availability")) {
        if (!avail.has(r.form_id)) avail.set(r.form_id, new Set());
        avail.get(r.form_id).add(r.game_id);
      }
      const visible = forms.filter((f) => !avail.has(f.id) || avail.get(f.id).has(game));
      if (visible.length) forms = visible;
      else {
        forms = await formsOfSpecies(speciesId);
        defaultForm = forms.find((f) => f.is_default) || forms[0] || null;
      }
    }

    const flavorAll = (await D().table("dex_flavor"))
      .filter((r) => r.species_id === speciesId)
      .sort((a, b) => gameOrderCmp(a.game, b.game)
        || cmpStr(a.version_label || "", b.version_label || ""));
    const speciesFormIds = new Set(forms.map((f) => f.id));
    const formFlavorAll = (await D().table("form_flavor"))
      .filter((r) => speciesFormIds.has(r.form_id))
      .sort((a, b) => gameOrderCmp(a.game, b.game)
        || cmpStr(a.version_label || "", b.version_label || ""));
    const gmAll = (await D().table("get_methods"))
      .filter((r) => r.species_id === speciesId)
      .sort((a, b) => gameOrderCmp(a.game, b.game)
        || cmpStr(a.version_label || "", b.version_label || ""));

    let flavor = flavorAll.map((r) => ({ game: r.game, version_label: r.version_label, text: r.text }));
    let formFlavor = new Map();
    for (const r of formFlavorAll) {
      if (!formFlavor.has(r.form_id)) formFlavor.set(r.form_id, []);
      formFlavor.get(r.form_id).push({ game: r.game, version_label: r.version_label, text: r.text });
    }
    let gm = gmAll.map((r) => ({ game: r.game, version_label: r.version_label,
      location: r.location, method: r.method, note: r.note, form: r.form }));

    if (game) {
      flavor = flavor.filter((f) => f.game === game);
      formFlavor = new Map([...formFlavor.entries()]
        .map(([fid, rows]) => [fid, rows.filter((r) => r.game === game)])
        .filter(([, rows]) => rows.length));
      gm = gm.filter((x) => x.game === game);
    }

    const selSuffix = form.trim() || dexDefaultSuffix;
    gm = gm.filter((x) => !x.form
      || (FORM_MARKER_TO_SUFFIX[x.form] === selSuffix && FORM_MARKER_TO_SUFFIX[x.form] !== undefined));

    const gamesWithGm = new Set(gm.map((x) => x.game));
    let enc = [];
    if (!game || game === "sword-shield") {
      const encRows = (await D().encountersOf(speciesId))
        .filter((r) => !game || r.game_id === game)
        .sort((a, b) => (a.vg - b.vg) || cmpStr(a.location_en, b.location_en))
        .slice(0, 60);
      enc = encRows.filter((r) => !gamesWithGm.has(r.game_id));
    }
    const seen = new Set();
    const encDedup = [];
    for (const e of enc) {
      const key = `${e.game_id}|${e.location_en}|${e.min_level}|${e.max_level}`;
      if (!seen.has(key)) { seen.add(key); encDedup.push(e); }
    }

    const dexes = await D().table("regional_dexes");
    const gamesRows = await D().table("games");
    const dexList = (await D().table("dex_entries"))
      .filter((e) => e.species_id === speciesId)
      .map((e) => {
        const d = dexes.find((x) => x.id === e.dex_id);
        if (!d) return null;
        const gm2 = gamesRows.find((x) => x.id === d.game_id);
        return { dex_id: e.dex_id, ndex: e.ndex, dex_zh: d.name_zh,
          game_id: d.game_id, game_zh: gm2 ? gm2.name_zh : null };
      })
      .filter(Boolean)
      .sort((a, b) => ((a.game_id === game ? 0 : 1) - (b.game_id === game ? 0 : 1))
        || (dexes.find((x) => x.id === a.dex_id).sort
          - dexes.find((x) => x.id === b.dex_id).sort));

    const evolution = await evolutionChain(speciesId, selSuffix);

    if (defaultForm) {
      for (const f of forms) f.ability_list = await abilitiesOf(f);
    }

    return {
      species: sp,
      default_form: defaultForm,
      forms,
      selected_suffix: selSuffix,
      ev: defaultForm
        ? Object.fromEntries(["hp", "atk", "def", "spa", "spd", "spe"]
          .map((k) => [k, defaultForm["ev_" + k]])) : {},
      base_stats: defaultForm
        ? Object.fromEntries(["hp", "atk", "def", "spa", "spd", "spe"]
          .map((k) => [k, defaultForm[k]])) : {},
      flavor,
      form_flavor: Object.fromEntries(formFlavor.entries()),
      get_methods: gm,
      encounters_api: encDedup,
      dex_list: dexList,
      evolution,
      game: game || null,
    };
  }

  // ---- GET /api/pokemon/{species_id}/moves ----
  async function pokemonMoves(speciesId, params) {
    const p = params || {};
    const game = p.game;
    const cfg = GAME_MOVE_CONFIG[game];
    if (!cfg) throw new Error("unknown game");
    const speciesRows = await D().table("species");
    const sp = speciesRows.find((s) => s.id === speciesId);
    if (!sp) throw new Error("species not found");
    const vg = cfg.vg;

    const forms = await formsOfSpecies(speciesId);
    let form = p.form_id
      ? forms.find((f) => f.id === parseInt(p.form_id, 10)) : null;
    if (!form) form = forms[0] || null;

    const movesRows = await D().table("moves");
    const moveById = new Map(movesRows.map((m) => [m.id, m]));
    const lsRows = (await D().learnsetsByVg(vg)).filter((l) => l.form_id === form.id);
    const rows = lsRows.map((l) => {
      const m = moveById.get(l.move_id);
      return { method: l.method, level: l.level, mastery: l.mastery,
        move_id: m.id, name_zh: m.name_zh, type_zh: m.type_zh,
        damage_class: m.damage_class, power: m.power, accuracy: m.accuracy,
        pp: m.pp, priority: m.priority };
    }).sort((a, b) => a.move_id - b.move_id);

    const machines = new Map();
    if (cfg.tm_vgs.length) {
      const allMachines = (await D().table("machines"))
        .filter((r) => cfg.tm_vgs.includes(r.vg))
        .sort((a, b) => (a.vg - b.vg) || (a.machine_number - b.machine_number));
      for (const r of allMachines) {
        if (!machines.has(r.move_id)) machines.set(r.move_id, new Map());
        machines.get(r.move_id).set(r.machine_number, [r.vg, r.item_identifier || ""]);
      }
    }
    const tmHow = new Map();
    for (const r of await D().table("tm_how")) {
      tmHow.set(`${r.vg}|${r.machine_number}`,
        { how: (r.how || "").replace(/\r/g, "").replace(/\n/g, " ").trim(),
          materials: (r.materials || "").replace(/\r/g, "").replace(/\n/g, " ").trim() });
    }
    function tmInfo(moveId) {
      const byNum = machines.get(moveId);
      if (!byNum) return [];
      return [...byNum.keys()].sort((a, b) => a - b).map((num) => {
        const [vgnum, itemIdent] = byNum.get(num);
        const h = tmHow.get(`${vgnum}|${num}`) || {};
        return { number: num,
          kind: (itemIdent || "").toLowerCase().startsWith("tr") ? "TR" : "TM",
          how: h.how || "", materials: h.materials || "" };
      });
    }

    const groups = {};
    for (const [key] of cfg.tabs) groups[key] = [];
    const methodKey = { "level-up": "level", "machine": "machine", "egg": "egg", "tutor": "tutor" };
    const seen = new Set();
    for (const r of rows) {
      const d = Object.assign({}, r);
      d.tm = d.method === "machine" ? tmInfo(d.move_id) : [];
      let mkey = methodKey[d.method] !== undefined ? methodKey[d.method] : d.method;
      if (EVOLUTION_RECALL_GAMES.has(game)) {
        if (mkey === "tutor") {
          mkey = "evolution-recall"; d.level = null; d.recall = true;
        } else if (mkey === "level" && (d.level || 0) === 0) {
          mkey = "evolution-recall"; d.evolution = true;
        }
      } else if (mkey === "level" && (d.level || 0) === 0) {
        d.evolution = true;
      }
      const key = `${mkey}|${d.move_id}`;
      if (seen.has(key) || !(mkey in groups)) continue;
      seen.add(key);
      groups[mkey].push(d);
    }
    groups.level.sort((a, b) => (
      ((a.recall === true) ? 1 : 0) - ((b.recall === true) ? 1 : 0))
      || (((a.level || 0) === 0 ? 0 : 1) - ((b.level || 0) === 0 ? 0 : 1))
      || ((a.level || 0) - (b.level || 0))
      || (a.move_id - b.move_id));
    for (const k of Object.keys(groups)) {
      if (k !== "level") {
        groups[k].sort((a, b) => (((a.evolution ? 0 : 1) - (b.evolution ? 0 : 1)))
          || cmpStr(a.name_zh, b.name_zh));
      }
    }

    const gamesRows = await D().table("games");
    const gmRow = gamesRows.find((x) => x.id === game);
    return {
      species: { id: sp.id, name_zh: sp.name_zh }, form, game, vg,
      has_breeding: gmRow ? Boolean(gmRow.has_breeding) : false,
      tabs: cfg.tabs.map(([k, lbl]) => ({ key: k, label: lbl })),
      groups,
    };
  }

  PKT.pokemonApi = {
    games, dexEntries, pokemonDetail, pokemonMoves, evolutionChain,
    GAME_MOVE_CONFIG, FORM_MARKER_TO_SUFFIX, typeSort,
  };
})(typeof window !== "undefined" ? window : globalThis);
