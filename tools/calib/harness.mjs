// 双引擎比对：Showdown @smogon/calc 输出基准值（JSON）
import { Generations, Pokemon, Move, Field, calculate } from "@smogon/calc";

const gen = Generations.get(9);
const IV = { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 };

const cases = [
  {
    key: "eq_basic",
    atk: { species: "Garchomp", level: 50, nature: "Adamant", evs: { atk: 252 }, ivs: IV },
    def: { species: "Snorlax", level: 50, nature: "Careful", evs: {}, ivs: IV },
    move: "Earthquake",
  },
  {
    key: "flamethrower",
    atk: { species: "Charizard", level: 50, nature: "Modest", evs: { spa: 252 }, ivs: IV },
    def: { species: "Garchomp", level: 50, nature: "Careful", evs: {}, ivs: IV },
    move: "Flamethrower",
  },
  {
    key: "eq_crit_lo",
    atk: { species: "Garchomp", level: 50, nature: "Adamant", evs: { atk: 252 }, ivs: IV, item: "Life Orb" },
    def: { species: "Snorlax", level: 50, nature: "Careful", evs: {}, ivs: IV },
    move: "Earthquake", crit: true,
  },
  {
    key: "rain_hydro",
    atk: { species: "Garchomp", level: 50, nature: "Modest", evs: { spa: 252 }, ivs: IV },
    def: { species: "Snorlax", level: 50, nature: "Careful", evs: { hp: 252 }, ivs: IV },
    move: "Hydro Pump", weather: "Rain",
  },
  {
    key: "guts_burn_cc",
    atk: { species: "Hariyama", level: 50, nature: "Adamant", evs: { atk: 252 }, ivs: IV, ability: "Guts", status: "brn" },
    def: { species: "Snorlax", level: 50, nature: "Careful", evs: {}, ivs: IV },
    move: "Close Combat",
  },
  {
    key: "scarf_punch_sun",
    atk: { species: "Garchomp", level: 100, nature: "Adamant", evs: { atk: 252 }, ivs: IV, item: "Choice Band" },
    def: { species: "Snorlax", level: 100, nature: "Bold", evs: { def: 252, hp: 252 }, ivs: IV },
    move: "Fire Punch", weather: "Sun",
  },
  {
    key: "freeze_dry",
    atk: { species: "Glaceon", level: 50, nature: "Modest", evs: { spa: 252 }, ivs: IV },
    def: { species: "Gyarados", level: 50, nature: "Careful", evs: {}, ivs: IV },
    move: "Freeze-Dry",
  },
  {
    key: "levitate_immune",
    atk: { species: "Garchomp", level: 50, nature: "Adamant", evs: { atk: 252 }, ivs: IV },
    def: { species: "Rotom-Wash", level: 50, nature: "Bold", evs: {}, ivs: IV },
    move: "Earthquake",
  },
];

const out = cases.map((c) => {
  const atk = new Pokemon(gen, c.atk.species, {
    level: c.atk.level, nature: c.atk.nature, evs: c.atk.evs, ivs: c.atk.ivs,
    item: c.atk.item, ability: c.atk.ability, status: c.atk.status,
  });
  const def = new Pokemon(gen, c.def.species, {
    level: c.def.level, nature: c.def.nature, evs: c.def.evs, ivs: c.def.ivs,
  });
  const move = new Move(gen, c.move, { isCrit: c.crit || undefined });
  const field = new Field({ weather: c.weather });
  const r = calculate(gen, atk, def, move, field);
  return {
    key: c.key,
    damage: r.damage,
    atkStats: r.attacker.stats,
    defStats: r.defender.stats,
    defHp: r.defender.stats.hp,
  };
});
console.log(JSON.stringify(out, null, 1));
