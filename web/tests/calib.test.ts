/* calib.test.ts —— 伤害引擎 vs Pokémon Showdown @smogon/calc 基准对拍（唯一对拍门禁）。
 * 与原 tools/static-check/calib-js.mjs 同源案例（tools/static-check/cases.json）、
 * 同一基准（tools/calib/smogon_baseline.json）：51 案例 + 41 行 Z/极巨威力表全绿为硬门禁。
 * 改伤害公式后必须重跑（pnpm test -- calib）。 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import { setLoader, table } from "../src/data/core";
import { calcDamage, calcModernStats, rndHalfDown, zPower, maxPower } from "../src/data/damage";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const DATA = path.join(ROOT, "web", "public", "data");

// Node fs 注入数据分片（浏览器路径由 fetch 兜底，测试无需）
setLoader((rel) => Promise.resolve(JSON.parse(readFileSync(path.join(DATA, rel), "utf-8"))));

const tables: Record<string, any[]> = {};
async function tbl(name: string): Promise<any[]> {
  if (!tables[name]) tables[name] = await table(name);
  return tables[name];
}

const {
  cases: CASES,
  SID,
  MOVE_EN,
} = JSON.parse(readFileSync(path.join(ROOT, "tools", "static-check", "cases.json"), "utf-8"));
const baseline = JSON.parse(
  readFileSync(path.join(ROOT, "tools", "calib", "smogon_baseline.json"), "utf-8"),
);
const base = new Map<string, any>(baseline.cases.map((c: any) => [c.key, c]));

const EV0 = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };
const IV = { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 };

async function assemble(side: any, isAtk: boolean) {
  void isAtk;
  const sid = SID[side.sp];
  const forms = await tbl("forms");
  // check.py 语义：WHERE f.id=sid OR (f.species_id=sid AND is_default) ORDER BY f.id 优先 LIMIT 1
  const rows = forms.filter((f) => f.id === sid || (f.species_id === sid && f.is_default === 1));
  rows.sort((a, b) => (a.id === sid ? 0 : 1) - (b.id === sid ? 0 : 1));
  const f2 = rows[0];
  const natures = await tbl("natures");
  const nature = natures.find((n) => n.identifier === side.nature) || null;
  const evs = Object.assign({}, EV0, side.evs || {});
  const item = side.item !== undefined ? side.item : "";
  const choice = item === "讲究头带" || item === "讲究眼镜" ? item : "";
  const stats = calcModernStats(f2, side.level, nature, evs, IV, choice, Boolean(side.is_dynamax));
  if (side.burn && side.ability === "毅力") {
    stats.atk = rndHalfDown(stats.atk * 1.5);
  }
  const evolutions = await tbl("evolutions");
  return {
    types: f2.types,
    level: side.level,
    stats,
    item,
    ability: side.ability !== undefined ? side.ability : "",
    boosts: side.boosts || {},
    tera_type: side.tera_type !== undefined ? side.tera_type : "",
    form_identifier: f2.identifier,
    is_dynamax: Boolean(side.is_dynamax),
    species_id: f2.species_id,
    can_evolve: evolutions.some((e) => e.from_species === f2.species_id),
  };
}

const OPT_KEYS = [
  "crit",
  "weather",
  "terrain",
  "helping_hand",
  "mode",
  "screen",
  "friend_guard",
  "steely_spirit",
  "battery",
  "power_spot",
  "auras",
  "ruin",
  "flower_gift",
  "hazards",
  "gravity",
  "magic_room",
  "wonder_room",
  "burn",
  "max_move",
  "z_move",
];

describe("calib：伤害引擎 vs @smogon/calc 基准", () => {
  it("51 案例逐 roll 全绿", async () => {
    const zExclusive = await tbl("z_exclusive");
    for (const c of CASES) {
      const a = await assemble(c.atk, true);
      const d = await assemble(c.def, false);
      const mv = (await tbl("moves")).find((m) => m.name_zh === MOVE_EN[c.move]);
      const opt: Record<string, any> = {};
      for (const k of OPT_KEYS) if (c[k] !== undefined && c[k] !== null) opt[k] = c[k];
      if (c.hazards) opt.defender_full_hp = false;
      if (c.z_move && !c.z_generic_only) {
        const row = zExclusive.find(
          (z: any) => z.base_move_id === mv.id && z.species_id === a.species_id,
        );
        if (row && row.power !== null) {
          const okForm = !row.form_suffix || a.form_identifier.endsWith("-" + row.form_suffix);
          if (okForm) opt.z_exclusive = { name: row.z_move_name, power: row.power };
        }
      }
      const r = calcDamage(a, d, Object.assign({}, mv), opt);
      const ref = base.get(c.key)!.damage;
      const refRolls = Array.isArray(ref) ? ref : [ref];
      expect(r.rolls, `案例 ${c.key} rolls`).toEqual(refRolls);
      expect(r.hp, `案例 ${c.key} defHp`).toBe(base.get(c.key)!.defHp);
    }
  });

  it("Z/极巨威力表 41 行全绿", async () => {
    const EN2ZH: Record<string, string> = {
      Tackle: "撞击",
      "Quick Attack": "电光一闪",
      "Wing Attack": "翅膀攻击",
      "Body Slam": "泰山压顶",
      Bite: "咬住",
      "Water Pulse": "水之波动",
      Acid: "溶解液",
      "Mud-Slap": "掷泥",
      "Rock Throw": "落石",
      Twineedle: "双针",
      Lick: "舌舔",
      "Metal Claw": "金属爪",
      Ember: "火花",
      "Water Gun": "水枪",
      "Vine Whip": "藤鞭",
      Spark: "电光",
      Confusion: "念力",
      "Powder Snow": "细雪",
      "Dragon Breath": "龙息",
      "Iron Head": "铁头",
      "Disarming Voice": "魅惑之声",
      "Hyper Beam": "破坏光线",
      "Giga Impact": "终极冲击",
      Earthquake: "地震",
      Flamethrower: "喷射火焰",
      Surf: "冲浪",
      "Close Combat": "近身战",
      "Rock Blast": "岩石爆击",
      "Bullet Seed": "种子机关枪",
      "Icicle Spear": "冰锥",
      "Double Kick": "二连踢",
      Bonemerang: "骨头回力镖",
      "Water Shuriken": "飞水手里剑",
      "Surging Strikes": "水流连打",
      "Triple Axel": "三旋击",
      "Fire Blast": "大字爆炎",
      "Draco Meteor": "流星群",
      "Weather Ball": "气象球",
      Hex: "祸不单行",
      "Giga Drain": "终极吸取",
      "V-create": "Ｖ热焰",
    };
    const moves = await tbl("moves");
    for (const [en, info] of Object.entries<any>(baseline.zTable)) {
      const zh = EN2ZH[en];
      if (!zh) continue;
      const mv = moves.find((m) => m.name_zh === zh);
      expect(mv, `招式 ${en}(${zh}) 缺失`).toBeTruthy();
      if (info.z !== null) {
        expect(zPower(mv!.power || 0, mv!.identifier), `${en} Z 威力`).toBe(info.z);
      }
      if (info.max !== null) {
        expect(maxPower(mv!.power || 0, mv!.type_zh, mv!.identifier), `${en} 极巨威力`).toBe(
          info.max,
        );
      }
    }
  });
});
