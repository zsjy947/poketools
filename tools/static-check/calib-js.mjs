// calib-js.mjs —— 自研 damage.js（本地引擎）vs Pokémon Showdown @smogon/calc 基准对拍。
// 与 tools/calib/check.py 同源案例（tools/static-check/cases.json 由其导出）、同一基准
// （tools/calib/smogon_baseline.json）；JS 版先绿是 damage.py TS/JS 移植的硬门禁。
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const DIST = path.join(ROOT, "app", "static", "dist", "js", "local");
const DATA = path.join(ROOT, "app", "static", "data");

// ---- 在共享上下文加载本地引擎（无 DOM/localStorage/fetch 依赖） ----
const ctx = vm.createContext({ console, globalThis: {} });
for (const f of ["damage.js", "data-core.js"]) {
  new vm.Script(readFileSync(path.join(DIST, f), "utf-8"), { filename: f })
    .runInContext(ctx);
}
const PKT = ctx.globalThis.__PKT_LOCAL__;
PKT.data.setLoader((rel) => Promise.resolve(
  JSON.parse(readFileSync(path.join(DATA, rel), "utf-8"))));

const tables = {};
async function table(name) {
  if (!tables[name]) tables[name] = await PKT.data.table(name);
  return tables[name];
}

// ---- check.py 的 assemble/opt 构建（镜像） ----
const { cases: CASES, SID, MOVE_EN } = JSON.parse(
  readFileSync(path.join(ROOT, "tools", "static-check", "cases.json"), "utf-8"));
const baseline = JSON.parse(
  readFileSync(path.join(ROOT, "tools", "calib", "smogon_baseline.json"), "utf-8"));
const base = new Map(baseline.cases.map((c) => [c.key, c]));

const EV0 = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };
const IV = { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 };

const natures = await table("natures");
const evolutions = await table("evolutions");
const zExclusive = await table("z_exclusive");

async function assemble(side, isAtk) {
  void isAtk;
  const sid = SID[side.sp];
  const forms = await table("forms");
  // check.py 语义：WHERE f.id=sid OR (f.species_id=sid AND is_default) ORDER BY f.id 优先 LIMIT 1
  const rows = forms.filter((f) => f.id === sid
    || (f.species_id === sid && f.is_default === 1));
  rows.sort((a, b) => ((a.id === sid ? 0 : 1) - (b.id === sid ? 0 : 1)));
  const f2 = rows[0];
  const nature = natures.find((n) => n.identifier === side.nature) || null;
  const evs = Object.assign({}, EV0, side.evs || {});
  const item = side.item !== undefined ? side.item : "";
  const choice = (item === "讲究头带" || item === "讲究眼镜") ? item : "";
  const stats = PKT.damage.calcModernStats(f2, side.level, nature, evs, IV, choice,
    Boolean(side.is_dynamax));
  if (side.burn && side.ability === "毅力") {
    stats.atk = PKT.damage.rndHalfDown(stats.atk * 1.5);
  }
  return { types: f2.types, level: side.level, stats,
    item, ability: side.ability !== undefined ? side.ability : "",
    boosts: side.boosts || {}, tera_type: side.tera_type !== undefined ? side.tera_type : "",
    form_identifier: f2.identifier,
    is_dynamax: Boolean(side.is_dynamax),
    species_id: f2.species_id,
    can_evolve: evolutions.some((e) => e.from_species === f2.species_id) };
}

const OPT_KEYS = ["crit", "weather", "terrain", "helping_hand", "mode", "screen",
  "friend_guard", "steely_spirit", "battery", "power_spot", "auras", "ruin",
  "flower_gift", "hazards", "gravity", "magic_room", "wonder_room", "burn",
  "max_move", "z_move"];

let allOk = true;
const lines = [];
for (const c of CASES) {
  const a = await assemble(c.atk, true);
  const d = await assemble(c.def, false);
  const mv = (await table("moves")).find((m) => m.name_zh === MOVE_EN[c.move]);
  const opt = {};
  for (const k of OPT_KEYS) if (c[k] !== undefined && c[k] !== null) opt[k] = c[k];
  if (c.hazards) opt.defender_full_hp = false;
  if (c.z_move && !c.z_generic_only) {
    const row = zExclusive.find((z) => z.base_move_id === mv.id && z.species_id === a.species_id);
    if (row && row.power !== null) {
      const okForm = !row.form_suffix || a.form_identifier.endsWith("-" + row.form_suffix);
      if (okForm) opt.z_exclusive = { name: row.z_move_name, power: row.power };
    }
  }
  const r = PKT.damage.calcDamage(a, d, Object.assign({}, mv), opt);
  const ref = base.get(c.key).damage;
  const refRolls = Array.isArray(ref) ? ref : [ref];
  const ok = JSON.stringify(r.rolls) === JSON.stringify(refRolls);
  const hpOk = r.hp === base.get(c.key).defHp;
  allOk = allOk && ok && hpOk;
  lines.push(`[${ok && hpOk ? "PASS" : "DIFF"}] ${c.key.padEnd(24)} `
    + `mine=${r.rolls[0]}~${r.rolls[r.rolls.length - 1]} `
    + `ref=${refRolls[0]}~${refRolls[refRolls.length - 1]} hp=${r.hp}/${base.get(c.key).defHp}`);
  if (!ok) lines.push(`        mine: ${JSON.stringify(r.rolls)}`);
}
console.log(lines.join("\n"));

// ---- Z/极巨威力表 ----
const EN2ZH = { "Tackle": "撞击", "Quick Attack": "电光一闪", "Wing Attack": "翅膀攻击",
  "Body Slam": "泰山压顶", "Bite": "咬住", "Water Pulse": "水之波动",
  "Acid": "溶解液", "Mud-Slap": "掷泥", "Rock Throw": "落石", "Twineedle": "双针",
  "Lick": "舌舔", "Metal Claw": "金属爪", "Ember": "火花", "Water Gun": "水枪",
  "Vine Whip": "藤鞭", "Spark": "电光", "Confusion": "念力", "Powder Snow": "细雪",
  "Dragon Breath": "龙息", "Iron Head": "铁头", "Disarming Voice": "魅惑之声",
  "Hyper Beam": "破坏光线", "Giga Impact": "终极冲击", "Earthquake": "地震",
  "Flamethrower": "喷射火焰", "Surf": "冲浪", "Close Combat": "近身战",
  "Rock Blast": "岩石爆击", "Bullet Seed": "种子机关枪", "Icicle Spear": "冰锥",
  "Double Kick": "二连踢", "Bonemerang": "骨头回力镖", "Water Shuriken": "飞水手里剑",
  "Surging Strikes": "水流连打", "Triple Axel": "三旋击", "Fire Blast": "大字爆炎",
  "Draco Meteor": "流星群", "Weather Ball": "气象球", "Hex": "祸不单行",
  "Giga Drain": "终极吸取", "V-create": "Ｖ热焰" };
const moves = await table("moves");
let tableOk = true;
for (const [en, info] of Object.entries(baseline.zTable)) {
  const zh = EN2ZH[en];
  if (!zh) continue;
  const mv = moves.find((m) => m.name_zh === zh);
  if (!mv) { console.log(`[MISS] ${en}(${zh})`); tableOk = false; continue; }
  let ok = true;
  if (info.z !== null) {
    const mine = PKT.damage.zPower(mv.power || 0, mv.identifier);
    ok = ok && mine === info.z;
    if (mine !== info.z) console.log(`[DIFF] ${en} z mine=${mine} ref=${info.z}`);
  }
  if (info.max !== null) {
    const mine = PKT.damage.maxPower(mv.power || 0, mv.type_zh, mv.identifier);
    ok = ok && mine === info.max;
    if (mine !== info.max) console.log(`[DIFF] ${en} max mine=${mine} ref=${info.max}`);
  }
  tableOk = tableOk && ok;
}
console.log(tableOk ? "威力表 OK" : "威力表 HAS DIFF");
console.log(allOk && tableOk ? "ALL PASS" : "HAS DIFF — JS 引擎与基准不一致");
process.exit(allOk && tableOk ? 0 : 1);
