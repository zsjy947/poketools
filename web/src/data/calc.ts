/* 伤害计算器端点（唯一实现，自 app/routers/calc.py 逐行移植的 JS 版 TS 化）：
 * 装配/机制校验/Z·超极巨映射/进场扣减/双方×4招批量；数值内核 ./damage。 */
import { table, learnsetsAllOf } from "./core";
import { calcDamage, calcModernStats, koSummary, hazardDamage, type Stats } from "./damage";

const DEFAULT_EV = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };
const DEFAULT_IV = { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 };
const FIELD_OPTS = [
  "mode",
  "weather",
  "terrain",
  "gravity",
  "magic_room",
  "wonder_room",
  "crit",
  "helping_hand",
  "friend_guard",
  "foresight",
  "flower_gift",
  "flower_gift_d",
  "steely_spirit",
  "battery",
  "power_spot",
  "auras",
  "ruin",
  "hazards",
  "defender_sash",
];

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}
function httpError(status: number, message: string): HttpError {
  return new HttpError(status, message);
}

// ---- meta 端点 ----
export async function metaSpecies() {
  return (await table("species"))
    .map((s) => ({ id: s.id, name_zh: s.name_zh, name_en: s.name_en }))
    .sort((a, b) => a.id - b.id);
}

export async function calcForms(speciesId: number) {
  const forms = (await table("forms"))
    .filter((f) => f.species_id === speciesId)
    .sort((a, b) => b.is_default - a.is_default || a.id - b.id);
  return forms.map((f) => {
    const hidden = new Set((f.hidden_abilities || "").split(",").filter(Boolean));
    return {
      id: f.id,
      form_label: f.form_label || (f.is_default === 1 ? "默认形态" : f.identifier),
      identifier: f.identifier,
      types: f.types,
      abilities: f.abilities,
      ability_list: (f.abilities || "")
        .split(",")
        .filter(Boolean)
        .map((a: string) => ({ name: a, hidden: hidden.has(a) })),
      is_mega: f.is_mega,
      hp: f.hp,
      atk: f.atk,
      def: f.def,
      spa: f.spa,
      spd: f.spd,
      spe: f.spe,
    };
  });
}

export async function metaItems() {
  const rows = (await table("items")).filter((r) => r.name_zh !== "").sort((a, b) => a.id - b.id);
  return rows.map((r) => ({ identifier: r.identifier, name_zh: r.name_zh }));
}

export async function metaAbilities() {
  return (await table("abilities"))
    .filter((r) => r.name_zh !== "")
    .sort((a, b) => a.ability_id - b.ability_id)
    .map((r) => r.name_zh);
}

export async function metaZMoves() {
  const [items, zGeneric, zExclusive] = await Promise.all([
    table("items"),
    table("z_generic"),
    table("z_exclusive"),
  ]);
  const itemByIdent = new Map(items.map((i) => [i.identifier, i]));
  const generic = items
    .filter((i) => i.id >= 900000 && i.id < 900100)
    .sort((a, b) => a.id - b.id)
    .map((i) => {
      const z = zGeneric.find((x) => x.crystal_identifier === i.identifier);
      return z
        ? {
            crystal_identifier: i.identifier,
            crystal_name: i.name_zh,
            type: z.type,
            z_move_name: z.z_move_name,
          }
        : null;
    })
    .filter(Boolean);
  const exclusive = zExclusive
    .slice()
    .sort(
      (a, b) => cmpStr(a.crystal_identifier, b.crystal_identifier) || a.species_id - b.species_id,
    )
    .map((z) => {
      const i = itemByIdent.get(z.crystal_identifier);
      return {
        crystal_identifier: z.crystal_identifier,
        crystal_name: i ? i.name_zh : null,
        species_id: z.species_id,
        form_suffix: z.form_suffix,
        base_move_id: z.base_move_id,
        z_move_name: z.z_move_name,
        power: z.power,
        damage_class: z.damage_class,
        note: z.note,
      };
    });
  return { generic, exclusive };
}

export async function metaMaxMoves() {
  return (await table("moves"))
    .filter((m) => (m.identifier || "").startsWith("max-"))
    .sort((a, b) => a.id - b.id)
    .map((m) => ({
      identifier: m.identifier,
      name_zh: m.name_zh,
      type_zh: m.type_zh,
      damage_class: m.damage_class,
    }));
}

export async function metaGmaxMoves() {
  return table("gmax_moves");
}

export async function metaNatures() {
  return (await table("natures")).slice().sort((a, b) => a.id - b.id);
}

export async function calcMoves(speciesId: number) {
  const [forms, movesRows, vgsRows, laRows] = await Promise.all([
    table("forms"),
    table("moves"),
    table("vgs"),
    learnsetsAllOf(speciesId),
  ]);
  const formIds = new Set(forms.filter((f) => f.species_id === speciesId).map((f) => f.id));
  const moveById = new Map(movesRows.map((m) => [m.id, m]));
  const genByVg = new Map(vgsRows.map((v) => [v.id, v.gen]));
  const agg = new Map<number, any>();
  for (const l of laRows) {
    if (!formIds.has(l.form_id)) continue;
    const m = moveById.get(l.move_id);
    if (!m) continue;
    let e = agg.get(m.id);
    if (!e) {
      e = {
        move_id: m.id,
        name_zh: m.name_zh,
        type_zh: m.type_zh,
        damage_class: m.damage_class,
        power: m.power,
        accuracy: m.accuracy,
        is_spread: m.is_spread,
        gens: new Set<number>(),
      };
      agg.set(m.id, e);
    }
    const gen = genByVg.get(l.vg);
    if (gen !== undefined) e.gens.add(gen);
  }
  const out = [...agg.values()].map((e) => {
    const gens = [...e.gens];
    const firstGen = Math.min(...gens);
    return {
      move_id: e.move_id,
      name_zh: e.name_zh,
      type_zh: e.type_zh,
      damage_class: e.damage_class,
      power: e.power,
      accuracy: e.accuracy,
      is_spread: e.is_spread,
      first_gen: firstGen,
      gens: gens.sort((a, b) => a - b),
    };
  });
  out.sort((a, b) => a.first_gen - b.first_gen || a.move_id - b.move_id);
  return out;
}

function cmpStr(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

// ---- 装配 / 校验 ----
export async function assemble(side: any, isAttacker: boolean) {
  void isAttacker;
  const speciesId = side.species_id;
  const speciesRows = await table("species");
  const sp = speciesRows.find((s) => s.id === speciesId);
  if (!sp) throw httpError(404, `species ${speciesId} not found`);
  const allForms = await table("forms");
  const myForms = allForms
    .filter((f) => f.species_id === speciesId)
    .sort((a, b) => b.is_default - a.is_default || a.id - b.id);
  let form = side.form_id ? myForms.find((f) => f.id === side.form_id) : null;
  if (!form) form = myForms[0] || null;
  if (!form) throw httpError(404, `species ${speciesId} has no form`);
  const level = parseInt(side.level || 50, 10);
  const natures = await table("natures");
  const nature = natures.find((n) => n.identifier === (side.nature || "hardy")) || null;
  const evs = Object.assign({}, DEFAULT_EV, side.evs || {});
  const ivs = Object.assign({}, DEFAULT_IV, side.ivs || {});
  const item = side.item || "";
  const stats: Stats = calcModernStats(
    form,
    level,
    nature,
    evs,
    ivs,
    item,
    Boolean(side.is_dynamax),
  );
  for (const [k, v] of Object.entries(side.stat_overrides || {})) {
    if (k in stats && typeof v === "number" && v >= 1) (stats as any)[k] = Math.floor(v);
  }
  const hidden = new Set((form.hidden_abilities || "").split(",").filter(Boolean));
  const evolutions = await table("evolutions");
  return {
    species_id: speciesId,
    name: sp.name_zh,
    form_id: form.id,
    form_label: form.form_label,
    types: form.types,
    level,
    item,
    ability: side.ability || "",
    ability_list: (form.abilities || "")
      .split(",")
      .filter(Boolean)
      .map((a: string) => ({ name: a, hidden: hidden.has(a) })),
    boosts: side.boosts || {},
    is_dynamax: Boolean(side.is_dynamax),
    is_mega:
      Boolean(form.is_mega) ||
      (form.identifier || "").endsWith("-primal") ||
      (form.identifier || "").endsWith("-gmax"),
    is_gmax: (form.identifier || "").endsWith("-gmax"),
    tera_type: side.tera_type || "",
    stats,
    _raw: Object.assign({}, side),
    evs,
    ivs,
    __form_identifier: form.identifier || "",
    can_evolve: evolutions.some((e) => e.from_species === speciesId),
  };
}

async function zOf(atk: any, mv: any) {
  const zExclusive = await table("z_exclusive");
  let row =
    zExclusive.find((r) => r.base_move_id === mv.id && r.species_id === atk.species_id) || null;
  if (row !== null) {
    const suffix = row.form_suffix || "";
    if (suffix && !selfSuffixOk(atk, suffix)) row = null;
  }
  if (row !== null) {
    if (row.power === null) {
      return {
        source: "exclusive",
        name: row.z_move_name,
        power: null,
        damage_class: row.damage_class,
        note: row.note,
        no_damage: true,
      };
    }
    return {
      source: "exclusive",
      name: row.z_move_name,
      power: row.power,
      damage_class: row.damage_class,
      note: row.note,
    };
  }
  const zGeneric = await table("z_generic");
  const gm = zGeneric.find((r) => r.type === mv.type_zh);
  if (gm) return { source: "generic", name: gm.z_move_name, type: mv.type_zh };
  return { source: "generic" };
}

function selfSuffixOk(atk: any, suffix: string): boolean {
  const ident = atk.form_identifier || "";
  if (!ident) return false;
  return suffix
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean)
    .some((sfx) => ident.endsWith("-" + sfx) || ident.includes("-" + sfx + "-"));
}

async function gmaxOf(att: any) {
  const ident = att.form_identifier || "";
  if (!ident.endsWith("-gmax")) return null;
  const rows = await table("gmax_moves");
  return rows.find((r) => r.form_identifier === ident) || null;
}

function applyGmax(opt: any, gmax: any, mv: any): void {
  if (gmax && mv.type_zh === gmax.type_zh && mv.damage_class !== "status") {
    opt.gmax_move = { name: gmax.gmax_move_name, type: gmax.type_zh, power: gmax.power };
  }
}

function validateMechanisms(atk: any, dfd: any, body: any): void {
  function check(sideLabel: string, flags: Array<string | false | undefined>): void {
    const on = flags.filter(Boolean);
    if (on.length > 1) {
      throw httpError(400, `${sideLabel}的机制互斥：超级进化/Z招式/极巨化/太晶化只能选择一个`);
    }
  }
  const atkZ = body.z_moves;
  let zOn: boolean;
  if (Array.isArray(atkZ)) {
    if (atkZ.filter(Boolean).length > 1) {
      throw httpError(400, "一场战斗仅能使用一次 Z 力量：只能点亮一个招式的 Z 标记");
    }
    zOn = atkZ.some(Boolean);
  } else {
    zOn = Boolean(body.z_move);
  }
  check("攻击方", [
    (atk.is_mega || atk.is_gmax) && "超级进化",
    zOn && "Z招式",
    (body.max_move || atk.is_dynamax) && !atk.is_gmax && "极巨化",
    atk.tera_type && "太晶化",
  ]);
  check("防御方", [
    (dfd.is_mega || dfd.is_gmax) && "超级进化",
    dfd.is_dynamax && !dfd.is_gmax && "极巨化",
    dfd.tera_type && "太晶化",
  ]);
}

function hazardHp(dfd: any, opt: any): number {
  const hazards = opt.hazards || {};
  if (!Object.values(hazards).some(Boolean)) return dfd.stats.hp;
  const types = (dfd.types || "").split(",").filter(Boolean);
  const hp = dfd.stats.hp;
  const grounded = !(
    types.includes("飞行") ||
    dfd.ability === "漂浮" ||
    dfd.item === "气球" ||
    opt.gravity
  );
  const d = hazardDamage(types, hp, hazards, grounded);
  return Math.max(1, hp - d);
}

function formIdentOf(side: any): string {
  return side.__form_identifier || "";
}

function swapAtkDef(stats: Stats): void {
  const t = stats.atk;
  stats.atk = stats.def;
  stats.def = t;
}

async function moveById(id: number) {
  const movesRows = await table("moves");
  return movesRows.find((m) => m.id === id) || null;
}

// ---- POST /api/calc ----
export async function calc(body: any) {
  const atk: any = await assemble(body.attacker, true);
  const dfd: any = await assemble(body.defender, false);
  atk.form_identifier = formIdentOf(atk);
  dfd.form_identifier = formIdentOf(dfd);
  validateMechanisms(atk, dfd, body);
  if (body.power_trick) swapAtkDef(atk.stats);
  if (body.defender_power_trick) swapAtkDef(dfd.stats);
  const mv = await moveById(body.move_id);
  if (!mv) throw httpError(404, "move not found");
  const opt: any = {};
  for (const k of FIELD_OPTS) opt[k] = body[k];
  for (const k of [
    "burn",
    "screen",
    "defender_full_hp",
    "move_power_override",
    "z_move",
    "max_move",
  ]) {
    // Python body.get：缺失键显式落 None（与键不存在区分，影响满血判定默认值）
    opt[k] = body[k] === undefined ? null : body[k];
  }
  opt.is_switching_out = Boolean(body.defender_switching_out);
  let zInfo: any = null;
  if (opt.z_move) {
    zInfo = await zOf(atk, mv);
    if (zInfo.source === "exclusive" && !zInfo.no_damage) {
      opt.z_exclusive = { name: zInfo.name, power: zInfo.power };
    }
  }
  if (opt.max_move) applyGmax(opt, await gmaxOf(atk), mv);
  const result = calcDamage(atk, dfd, Object.assign({}, mv), opt);
  const hazard = hazardHp(dfd, opt);
  if (hazard < dfd.stats.hp && "ko" in result) {
    result.ko = koSummary(
      result.rolls,
      hazard,
      Object.assign({}, opt, { defender_full_hp: false }),
    );
  }
  const resp: any = {
    attacker: pick(atk, ["name", "types", "level", "stats", "tera_type"]),
    defender: pick(dfd, ["name", "types", "level", "stats", "is_dynamax", "tera_type"]),
    move: { name: mv.name_zh, type: mv.type_zh, damage_class: mv.damage_class, power: mv.power },
    result,
    hazard_hp: hazard,
  };
  if (zInfo) resp.z_info = zInfo;
  return resp;
}

function pick(o: any, keys: string[]) {
  const out: any = {};
  for (const k of keys) out[k] = o[k];
  return out;
}

// ---- POST /api/calc/batch ----
export async function calcBatch(body: any) {
  const atk: any = await assemble(body.attacker, true);
  const dfd: any = await assemble(body.defender, false);
  atk.form_identifier = formIdentOf(atk);
  dfd.form_identifier = formIdentOf(dfd);
  const sides = body.sides || {};
  const sa = sides.atk || {},
    sb = sides.dfd || {};
  const field = body.field || {};
  if (sa.power_trick) swapAtkDef(atk.stats);
  if (sb.power_trick) swapAtkDef(dfd.stats);
  validateMechanisms(atk, dfd, { z_moves: sa.z_moves, max_move: atk.is_dynamax });
  const hazard = {
    atk: hazardHp(atk, Object.assign({}, field, { hazards: sa.hazards })),
    dfd: hazardHp(dfd, Object.assign({}, field, { hazards: sb.hazards })),
  };

  function opts0Of(att: any, dfdSide: any, attFlags: any, dfdFlags: any) {
    void dfdSide;
    const o: any = {};
    for (const k of FIELD_OPTS) o[k] = field[k];
    Object.assign(o, {
      burn: attFlags.burn,
      crit: attFlags.crit,
      helping_hand: attFlags.helping,
      steely_spirit: attFlags.steely,
      battery: attFlags.battery,
      power_spot: attFlags.power_spot,
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

  async function resultsOf(
    att: any,
    dfdSide: any,
    attFlags: any,
    dfdFlags: any,
    moveIds: any[],
    zMarks: any[],
    dfdHazard: number,
  ) {
    const out: any[] = [];
    const opts0 = opts0Of(att, dfdSide, attFlags, dfdFlags);
    const gmax = opts0.max_move ? await gmaxOf(att) : null;
    const moveObjs = moveIds || [];
    for (let i = 0; i < moveObjs.length; i++) {
      const mobj = moveObjs[i];
      if (!mobj) {
        out.push(null);
        continue;
      }
      const mid = mobj && typeof mobj === "object" ? mobj.id : mobj;
      const powerOverride = mobj && typeof mobj === "object" ? mobj.power : null;
      const mv = await moveById(mid);
      if (!mv) {
        out.push({ error: "move not found" });
        continue;
      }
      const opt = Object.assign({}, opts0);
      if (powerOverride) opt.move_power_override = powerOverride;
      if (gmax) applyGmax(opt, gmax, mv);
      let zi: any = null;
      if (zMarks && zMarks[i]) {
        zi = await zOf(att, mv);
        opt.z_move = true;
        if (zi.source === "exclusive" && !zi.no_damage) {
          opt.z_exclusive = { name: zi.name, power: zi.power };
        }
      }
      const r: any = calcDamage(att, dfdSide, Object.assign({}, mv), opt);
      const effHp = Math.min(dfdHazard, dfdSide.stats.hp);
      if (effHp < dfdSide.stats.hp && "ko" in r) {
        r.ko = koSummary(r.rolls, effHp, Object.assign({}, opt, { defender_full_hp: false }));
      }
      if (zi) r.z_info = zi;
      out.push(r);
    }
    return out;
  }

  const atkResults = await resultsOf(
    atk,
    dfd,
    sa,
    sb,
    (body.moves || {}).atk,
    sa.z_moves || [],
    hazard.dfd,
  );
  const dfdResults = await resultsOf(
    dfd,
    atk,
    sb,
    sa,
    (body.moves || {}).dfd,
    sb.z_moves || [],
    hazard.atk,
  );
  return {
    atk: { name: atk.name, stats: atk.stats, results: atkResults },
    dfd: { name: dfd.name, stats: dfd.stats, results: dfdResults },
    hazard_hp: hazard,
  };
}
