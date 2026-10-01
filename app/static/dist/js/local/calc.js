/* 伤害计算器端点本地实现：app/routers/calc.py 逐行移植（装配/机制校验/Z·超极巨映射/
 * 进场扣减/双方×4招批量），数值内核走 local/damage.js（damage.py 移植）。 */
(function (g) {
  "use strict";
  const PKT = (g.__PKT_LOCAL__ = g.__PKT_LOCAL__ || {});
  const D = () => PKT.data;
  const dmg = () => PKT.damage;

  const DEFAULT_EV = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };
  const DEFAULT_IV = { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 };
  const FIELD_OPTS = ["mode", "weather", "terrain", "gravity", "magic_room", "wonder_room",
    "crit", "helping_hand", "friend_guard", "foresight",
    "flower_gift", "flower_gift_d", "steely_spirit", "battery", "power_spot",
    "auras", "ruin", "hazards", "defender_sash"];

  function httpError(status, message) {
    const e = new Error(message);
    e.status = status;
    return e;
  }

  // ---- meta 端点 ----
  async function metaSpecies() {
    return (await D().table("species"))
      .map((s) => ({ id: s.id, name_zh: s.name_zh, name_en: s.name_en }))
      .sort((a, b) => a.id - b.id);
  }

  async function calcForms(speciesId) {
    const forms = (await D().table("forms")).filter((f) => f.species_id === speciesId)
      .sort((a, b) => (b.is_default - a.is_default) || (a.id - b.id));
    return forms.map((f) => {
      const hidden = new Set((f.hidden_abilities || "").split(",").filter(Boolean));
      return {
        id: f.id,
        form_label: f.form_label || (f.is_default === 1 ? "默认形态" : f.identifier),
        identifier: f.identifier, types: f.types, abilities: f.abilities,
        ability_list: (f.abilities || "").split(",").filter(Boolean)
          .map((a) => ({ name: a, hidden: hidden.has(a) })),
        is_mega: f.is_mega, hp: f.hp, atk: f.atk, def: f.def, spa: f.spa, spd: f.spd, spe: f.spe,
      };
    });
  }

  async function metaItems() {
    const rows = (await D().table("items"))
      .filter((r) => r.name_zh !== "")
      .sort((a, b) => a.id - b.id);
    return rows.map((r) => ({ identifier: r.identifier, name_zh: r.name_zh }));
  }

  async function metaAbilities() {
    return (await D().table("abilities"))
      .filter((r) => r.name_zh !== "")
      .sort((a, b) => a.ability_id - b.ability_id)
      .map((r) => r.name_zh);
  }

  async function metaZMoves() {
    const [items, zGeneric, zExclusive] = await Promise.all([
      D().table("items"), D().table("z_generic"), D().table("z_exclusive")]);
    const itemByIdent = new Map(items.map((i) => [i.identifier, i]));
    const generic = items
      .filter((i) => i.id >= 900000 && i.id < 900100)
      .sort((a, b) => a.id - b.id)
      .map((i) => {
        const z = zGeneric.find((x) => x.crystal_identifier === i.identifier);
        return z ? { crystal_identifier: i.identifier, crystal_name: i.name_zh,
          type: z.type, z_move_name: z.z_move_name } : null;
      }).filter(Boolean);
    const exclusive = zExclusive
      .slice()
      .sort((a, b) => cmpStr(a.crystal_identifier, b.crystal_identifier)
        || (a.species_id - b.species_id))
      .map((z) => {
        const i = itemByIdent.get(z.crystal_identifier);
        return { crystal_identifier: z.crystal_identifier,
          crystal_name: i ? i.name_zh : null, species_id: z.species_id,
          form_suffix: z.form_suffix, base_move_id: z.base_move_id,
          z_move_name: z.z_move_name, power: z.power,
          damage_class: z.damage_class, note: z.note };
      });
    return { generic, exclusive };
  }

  async function metaMaxMoves() {
    return (await D().table("moves"))
      .filter((m) => (m.identifier || "").startsWith("max-"))
      .sort((a, b) => a.id - b.id)
      .map((m) => ({ identifier: m.identifier, name_zh: m.name_zh,
        type_zh: m.type_zh, damage_class: m.damage_class }));
  }

  async function metaGmaxMoves() {
    return D().table("gmax_moves");
  }

  async function metaNatures() {
    return (await D().table("natures")).slice().sort((a, b) => a.id - b.id);
  }

  async function calcMoves(speciesId) {
    const [forms, movesRows, vgsRows, laRows] = await Promise.all([
      D().table("forms"), D().table("moves"), D().table("vgs"),
      D().learnsetsAllOf(speciesId)]);
    const formIds = new Set(forms.filter((f) => f.species_id === speciesId).map((f) => f.id));
    const moveById = new Map(movesRows.map((m) => [m.id, m]));
    const genByVg = new Map(vgsRows.map((v) => [v.id, v.gen]));
    const agg = new Map();
    for (const l of laRows) {
      if (!formIds.has(l.form_id)) continue;
      const m = moveById.get(l.move_id);
      if (!m) continue;
      let e = agg.get(m.id);
      if (!e) {
        e = { move_id: m.id, name_zh: m.name_zh, type_zh: m.type_zh,
          damage_class: m.damage_class, power: m.power, accuracy: m.accuracy,
          is_spread: m.is_spread, gens: new Set() };
        agg.set(m.id, e);
      }
      const gen = genByVg.get(l.vg);
      if (gen !== undefined) e.gens.add(gen);
    }
    const out = [...agg.values()].map((e) => {
      const gens = [...e.gens];
      const firstGen = Math.min(...gens);
      return { move_id: e.move_id, name_zh: e.name_zh, type_zh: e.type_zh,
        damage_class: e.damage_class, power: e.power, accuracy: e.accuracy,
        is_spread: e.is_spread, first_gen: firstGen,
        gens: gens.sort((a, b) => a - b) };
    });
    out.sort((a, b) => (a.first_gen - b.first_gen) || (a.move_id - b.move_id));
    return out;
  }

  function cmpStr(a, b) { return a < b ? -1 : a > b ? 1 : 0; }

  // ---- 装配 / 校验 ----
  async function assemble(side, isAttacker) {
    const speciesId = side.species_id;
    const speciesRows = await D().table("species");
    const sp = speciesRows.find((s) => s.id === speciesId);
    if (!sp) throw httpError(404, `species ${speciesId} not found`);
    const allForms = await D().table("forms");
    const myForms = allForms.filter((f) => f.species_id === speciesId)
      .sort((a, b) => (b.is_default - a.is_default) || (a.id - b.id));
    let form = side.form_id ? myForms.find((f) => f.id === side.form_id) : null;
    if (!form) form = myForms[0] || null;
    const level = parseInt(side.level || 50, 10);
    const natures = await D().table("natures");
    const nature = natures.find((n) => n.identifier === (side.nature || "hardy")) || null;
    const evs = Object.assign({}, DEFAULT_EV, side.evs || {});
    const ivs = Object.assign({}, DEFAULT_IV, side.ivs || {});
    const item = side.item || "";
    const stats = dmg().calcModernStats(form, level, nature, evs, ivs, item,
      Boolean(side.is_dynamax));
    for (const [k, v] of Object.entries(side.stat_overrides || {})) {
      if (k in stats && typeof v === "number" && v >= 1) stats[k] = Math.floor(v);
    }
    const hidden = new Set((form.hidden_abilities || "").split(",").filter(Boolean));
    const evolutions = await D().table("evolutions");
    return {
      species_id: speciesId, name: sp.name_zh,
      form_id: form.id, form_label: form.form_label,
      types: form.types, level, item,
      ability: side.ability || "",
      ability_list: (form.abilities || "").split(",").filter(Boolean)
        .map((a) => ({ name: a, hidden: hidden.has(a) })),
      boosts: side.boosts || {},
      is_dynamax: Boolean(side.is_dynamax),
      is_mega: Boolean(form.is_mega)
        || (form.identifier || "").endsWith("-primal")
        || (form.identifier || "").endsWith("-gmax"),
      is_gmax: (form.identifier || "").endsWith("-gmax"),
      tera_type: side.tera_type || "",
      stats, _raw: Object.assign({}, side),
      evs, ivs, __form_identifier: form.identifier || "",
      can_evolve: evolutions.some((e) => e.from_species === speciesId),
    };
  }

  async function zOf(atk, mv) {
    const zExclusive = await D().table("z_exclusive");
    let row = zExclusive.find((r) => r.base_move_id === mv.id && r.species_id === atk.species_id) || null;
    if (row !== null) {
      const suffix = row.form_suffix || "";
      if (suffix && !selfSuffixOk(atk, suffix)) row = null;
    }
    if (row !== null) {
      if (row.power === null) {
        return { source: "exclusive", name: row.z_move_name, power: null,
          damage_class: row.damage_class, note: row.note, no_damage: true };
      }
      return { source: "exclusive", name: row.z_move_name, power: row.power,
        damage_class: row.damage_class, note: row.note };
    }
    const zGeneric = await D().table("z_generic");
    const gm = zGeneric.find((r) => r.type === mv.type_zh);
    if (gm) return { source: "generic", name: gm.z_move_name, type: mv.type_zh };
    return { source: "generic" };
  }

  function selfSuffixOk(atk, suffix) {
    const ident = atk.form_identifier || "";
    if (!ident) return false;
    return suffix.split(",").map((x) => x.trim()).filter(Boolean)
      .some((sfx) => ident.endsWith("-" + sfx) || ident.includes("-" + sfx + "-"));
  }

  async function gmaxOf(att) {
    const ident = att.form_identifier || "";
    if (!ident.endsWith("-gmax")) return null;
    const rows = await D().table("gmax_moves");
    return rows.find((r) => r.form_identifier === ident) || null;
  }

  function applyGmax(opt, gmax, mv) {
    if (gmax && mv.type_zh === gmax.type_zh && mv.damage_class !== "status") {
      opt.gmax_move = { name: gmax.gmax_move_name, type: gmax.type_zh, power: gmax.power };
    }
  }

  function validateMechanisms(atk, dfd, body) {
    function check(sideLabel, flags) {
      const on = flags.filter(Boolean);
      if (on.length > 1) {
        throw httpError(400, `${sideLabel}的机制互斥：超级进化/Z招式/极巨化/太晶化只能选择一个`);
      }
    }
    const atkZ = body.z_moves;
    let zOn;
    if (Array.isArray(atkZ)) {
      if (atkZ.filter(Boolean).length > 1) {
        throw httpError(400, "一场战斗仅能使用一次 Z 力量：只能点亮一个招式的 Z 标记");
      }
      zOn = atkZ.some(Boolean);
    } else {
      zOn = Boolean(body.z_move);
    }
    check("攻击方", [(atk.is_mega || atk.is_gmax) && "超级进化",
      zOn && "Z招式",
      (body.max_move || atk.is_dynamax) && !atk.is_gmax && "极巨化",
      atk.tera_type && "太晶化"]);
    check("防御方", [(dfd.is_mega || dfd.is_gmax) && "超级进化",
      dfd.is_dynamax && !dfd.is_gmax && "极巨化",
      dfd.tera_type && "太晶化"]);
  }

  function hazardHp(dfd, opt) {
    const hazards = opt.hazards || {};
    if (!Object.values(hazards).some(Boolean)) return dfd.stats.hp;
    const types = (dfd.types || "").split(",").filter(Boolean);
    const hp = dfd.stats.hp;
    const grounded = !(types.includes("飞行") || dfd.ability === "漂浮"
      || dfd.item === "气球" || opt.gravity);
    const d = dmg().hazardDamage(types, hp, hazards, grounded);
    return Math.max(1, hp - d);
  }

  function formIdentOf(side) {
    return side.__form_identifier || "";
  }

  function swapAtkDef(stats) {
    const t = stats.atk;
    stats.atk = stats.def;
    stats.def = t;
  }

  async function moveById(id) {
    const movesRows = await D().table("moves");
    return movesRows.find((m) => m.id === id) || null;
  }

  // ---- POST /api/calc ----
  async function calc(body) {
    const atk = await assemble(body.attacker, true);
    const dfd = await assemble(body.defender, false);
    atk.form_identifier = formIdentOf(atk);
    dfd.form_identifier = formIdentOf(dfd);
    validateMechanisms(atk, dfd, body);
    if (body.power_trick) swapAtkDef(atk.stats);
    if (body.defender_power_trick) swapAtkDef(dfd.stats);
    const mv = await moveById(body.move_id);
    if (!mv) throw httpError(404, "move not found");
    const opt = {};
    for (const k of FIELD_OPTS) opt[k] = body[k];
    for (const k of ["burn", "screen", "defender_full_hp", "move_power_override", "z_move", "max_move"]) {
      // Python body.get：缺失键显式落 None（与键不存在区分，影响满血判定默认值）
      opt[k] = body[k] === undefined ? null : body[k];
    }
    opt.is_switching_out = Boolean(body.defender_switching_out);
    let zInfo = null;
    if (opt.z_move) {
      zInfo = await zOf(atk, mv);
      if (zInfo.source === "exclusive" && !zInfo.no_damage) {
        opt.z_exclusive = { name: zInfo.name, power: zInfo.power };
      }
    }
    if (opt.max_move) applyGmax(opt, await gmaxOf(atk), mv);
    const result = dmg().calcDamage(atk, dfd, Object.assign({}, mv), opt);
    const hazard = hazardHp(dfd, opt);
    if (hazard < dfd.stats.hp && "ko" in result) {
      result.ko = dmg().koSummary(result.rolls, hazard,
        Object.assign({}, opt, { defender_full_hp: false }));
    }
    const resp = {
      attacker: pick(atk, ["name", "types", "level", "stats", "tera_type"]),
      defender: pick(dfd, ["name", "types", "level", "stats", "is_dynamax", "tera_type"]),
      move: { name: mv.name_zh, type: mv.type_zh,
        damage_class: mv.damage_class, power: mv.power },
      result, hazard_hp: hazard,
    };
    if (zInfo) resp.z_info = zInfo;
    return resp;
  }

  function pick(o, keys) {
    const out = {};
    for (const k of keys) out[k] = o[k];
    return out;
  }

  // ---- POST /api/calc/batch ----
  async function calcBatch(body) {
    const atk = await assemble(body.attacker, true);
    const dfd = await assemble(body.defender, false);
    atk.form_identifier = formIdentOf(atk);
    dfd.form_identifier = formIdentOf(dfd);
    const sides = body.sides || {};
    const sa = sides.atk || {}, sb = sides.dfd || {};
    const field = body.field || {};
    if (sa.power_trick) swapAtkDef(atk.stats);
    if (sb.power_trick) swapAtkDef(dfd.stats);
    validateMechanisms(atk, dfd, { z_moves: sa.z_moves, max_move: atk.is_dynamax });
    const hazard = {
      atk: hazardHp(atk, Object.assign({}, field, { hazards: sa.hazards })),
      dfd: hazardHp(dfd, Object.assign({}, field, { hazards: sb.hazards })),
    };

    function opts0Of(att, dfdSide, attFlags, dfdFlags) {
      const o = {};
      for (const k of FIELD_OPTS) o[k] = field[k];
      Object.assign(o, {
        burn: attFlags.burn, crit: attFlags.crit,
        helping_hand: attFlags.helping,
        steely_spirit: attFlags.steely,
        battery: attFlags.battery, power_spot: attFlags.power_spot,
        flower_gift: attFlags.flower_gift,
        screen: dfdFlags.screen,
        friend_guard: dfdFlags.friend_guard,
        foresight: dfdFlags.foresight,
        flower_gift_d: dfdFlags.flower_gift,
        defender_sash: dfdFlags.sash,
        defender_full_hp: true,
        max_move: Boolean(att.is_dynamax),
        is_switching_out: Boolean(dfdFlags.switching),
      });
      return o;
    }

    async function resultsOf(att, dfdSide, attFlags, dfdFlags, moveIds, zMarks, dfdHazard) {
      const out = [];
      const opts0 = opts0Of(att, dfdSide, attFlags, dfdFlags);
      const gmax = opts0.max_move ? await gmaxOf(att) : null;
      const moveObjs = moveIds || [];
      for (let i = 0; i < moveObjs.length; i++) {
        const mobj = moveObjs[i];
        if (!mobj) { out.push(null); continue; }
        const mid = (mobj && typeof mobj === "object") ? mobj.id : mobj;
        const powerOverride = (mobj && typeof mobj === "object") ? mobj.power : null;
        const mv = await moveById(mid);
        if (!mv) { out.push({ error: "move not found" }); continue; }
        const opt = Object.assign({}, opts0);
        if (powerOverride) opt.move_power_override = powerOverride;
        if (gmax) applyGmax(opt, gmax, mv);
        let zi = null;
        if (zMarks && zMarks[i]) {
          zi = await zOf(att, mv);
          opt.z_move = true;
          if (zi.source === "exclusive" && !zi.no_damage) {
            opt.z_exclusive = { name: zi.name, power: zi.power };
          }
        }
        const r = dmg().calcDamage(att, dfdSide, Object.assign({}, mv), opt);
        const effHp = Math.min(dfdHazard, dfdSide.stats.hp);
        if (effHp < dfdSide.stats.hp && "ko" in r) {
          r.ko = dmg().koSummary(r.rolls, effHp,
            Object.assign({}, opt, { defender_full_hp: false }));
        }
        if (zi) r.z_info = zi;
        out.push(r);
      }
      return out;
    }

    const atkResults = await resultsOf(atk, dfd, sa, sb,
      (body.moves || {}).atk, sa.z_moves || [], hazard.dfd);
    const dfdResults = await resultsOf(dfd, atk, sb, sa,
      (body.moves || {}).dfd, sb.z_moves || [], hazard.atk);
    return {
      atk: { name: atk.name, stats: atk.stats, results: atkResults },
      dfd: { name: dfd.name, stats: dfd.stats, results: dfdResults },
      hazard_hp: hazard,
    };
  }

  PKT.calcApi = {
    metaSpecies, calcForms, metaItems, metaAbilities, metaZMoves,
    metaMaxMoves, metaGmaxMoves, metaNatures, calcMoves, calc, calcBatch,
  };
})(typeof window !== "undefined" ? window : globalThis);
