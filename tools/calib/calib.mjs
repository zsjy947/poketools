// 与自研计算器比对的基准脚本：使用 Pokémon Showdown 官方计算器引擎 @smogon/calc
// 用法: node calib.mjs
import { Generations, Pokemon, Move, Field, calculate } from "@smogon/calc";

const gen = Generations.get(9); // 朱紫(第九世代, 现代公式)

const cases = [
  {
    name: "A: 50级固执烈咬陆鲨(252攻) 地震 vs 50级卡比兽(无努力)",
    attacker: new Pokemon(gen, "Garchomp", {
      level: 50, nature: "Adamant", evs: { atk: 252 }, statDVs: defaultIVs(),
    }),
    defender: new Pokemon(gen, "Snorlax", { level: 50, nature: "Careful", statDVs: defaultIVs() }),
    move: new Move(gen, "Earthquake"),
  },
  {
    name: "B: 50级内敛喷火龙(252特攻) 大字爆炎 vs 50级烈咬陆鲨",
    attacker: new Pokemon(gen, "Charizard", {
      level: 50, nature: "Modest", evs: { spa: 252 }, statDVs: defaultIVs(),
    }),
    defender: new Pokemon(gen, "Garchomp", { level: 50, nature: "Careful", statDVs: defaultIVs() }),
    move: new Move(gen, "Flamethrower"),
  },
  {
    name: "C: 同A + 生命宝珠 + 会心一击",
    attacker: new Pokemon(gen, "Garchomp", {
      level: 50, nature: "Adamant", evs: { atk: 252 }, item: "Life Orb", statDVs: defaultIVs(),
    }),
    defender: new Pokemon(gen, "Snorlax", { level: 50, nature: "Careful", statDVs: defaultIVs() }),
    move: new Move(gen, "Earthquake"),
    crit: true,
  },
  {
    name: "D: 同A + 雨天 水炮(特殊)",
    attacker: new Pokemon(gen, "Garchomp", {
      level: 50, nature: "Modest", evs: { spa: 252 }, statDVs: defaultIVs(),
    }),
    defender: new Pokemon(gen, "Snorlax", { level: 50, nature: "Careful", evs: { hp: 252 }, statDVs: defaultIVs() }),
    move: new Move(gen, "Hydro Pump"),
    weather: "Rain",
  },
  {
    name: "E: 50级固执铁掌力士(252攻) 吸血巨拳? 改用近身战(格斗, 2x) vs 卡比兽",
    attacker: new Pokemon(gen, "Hariyama", {
      level: 50, nature: "Adamant", evs: { atk: 252 }, ability: "Guts", status: "brn", statDVs: defaultIVs(),
    }),
    defender: new Pokemon(gen, "Snorlax", { level: 50, nature: "Careful", statDVs: defaultIVs() }),
    move: new Move(gen, "Close Combat"),
  },
];

function defaultIVs() {
  return { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 };
}

for (const c of cases) {
  const field = new Field({ isCritical: c.crit || undefined, weather: c.weather });
  const result = calculate(gen, c.attacker, c.defender, c.move, field);
  const r = result.damage;
  const range = Array.isArray(r) ? `${Math.min(...r)}~${Math.max(...r)}` : String(r);
  console.log(`${c.name}`);
  console.log(`  smogon: ${range} | 效果x${result.desc.typeEffectiveness} | 防方HP ${result.defender.stats.hp} 攻方A值 ${result.attacker.stats.atk}/${result.attacker.stats.spa}`);
}
