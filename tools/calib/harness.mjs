// 双引擎比对：Showdown @smogon/calc 输出基准值（JSON）
// 五期扩展：雪/沙暴/场地/扩散/友防/钢之意志·蓄电池·能量点/气场/四灾兽/花之礼/
//           星晶攻防/防守太晶/重力·奇妙·魔法空间/背心·进化奇石/多段极巨/Z泛用+专属/会心升降
import { toID, Generations, Pokemon, Move, Field, calculate } from "@smogon/calc";

const gen = Generations.get(9);
const IV = { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 };

// atk/def: {species, level, nature, evs, ivs, item?, ability?, boosts?, teraType?, isDynamax?}
// move: {name, useZ?, useMax?, isCrit?, isStellarFirstUse?, hits?}
// field: {weather?, terrain?, gameType?, isGravity?, isMagicRoom?, isWonderRoom?,
//         isFairyAura?, isDarkAura?, isAuraBreak?, isSwordOfRuin?, isBeadsOfRuin?,
//         isTabletsOfRuin?, isVesselOfRuin?, atkSide?, defSide?}
const cases = [
  // ---- 原有 10 案例 ----
  { key: "eq_basic",
    atk: { species: "Garchomp", level: 50, nature: "Adamant", evs: { atk: 252 }, ivs: IV },
    def: { species: "Snorlax", level: 50, nature: "Careful", evs: {}, ivs: IV },
    move: "Earthquake" },
  { key: "flamethrower",
    atk: { species: "Charizard", level: 50, nature: "Modest", evs: { spa: 252 }, ivs: IV },
    def: { species: "Garchomp", level: 50, nature: "Careful", evs: {}, ivs: IV },
    move: "Flamethrower" },
  { key: "eq_crit_lo",
    atk: { species: "Garchomp", level: 50, nature: "Adamant", evs: { atk: 252 }, ivs: IV, item: "Life Orb" },
    def: { species: "Snorlax", level: 50, nature: "Careful", evs: {}, ivs: IV },
    move: "Earthquake", crit: true },
  { key: "rain_hydro",
    atk: { species: "Garchomp", level: 50, nature: "Modest", evs: { spa: 252 }, ivs: IV },
    def: { species: "Snorlax", level: 50, nature: "Careful", evs: { hp: 252 }, ivs: IV },
    move: "Hydro Pump", weather: "Rain" },
  { key: "guts_burn_cc",
    atk: { species: "Hariyama", level: 50, nature: "Adamant", evs: { atk: 252 }, ivs: IV, ability: "Guts", status: "brn" },
    def: { species: "Snorlax", level: 50, nature: "Careful", evs: {}, ivs: IV },
    move: "Close Combat" },
  { key: "scarf_punch_sun",
    atk: { species: "Garchomp", level: 100, nature: "Adamant", evs: { atk: 252 }, ivs: IV, item: "Choice Band" },
    def: { species: "Snorlax", level: 100, nature: "Bold", evs: { def: 252, hp: 252 }, ivs: IV },
    move: "Fire Punch", weather: "Sun" },
  { key: "freeze_dry",
    atk: { species: "Glaceon", level: 50, nature: "Modest", evs: { spa: 252 }, ivs: IV },
    def: { species: "Gyarados", level: 50, nature: "Careful", evs: {}, ivs: IV },
    move: "Freeze-Dry" },
  { key: "helping_hand_eq",
    atk: { species: "Garchomp", level: 50, nature: "Adamant", evs: { atk: 252 }, ivs: IV },
    def: { species: "Snorlax", level: 50, nature: "Careful", evs: {}, ivs: IV },
    move: "Earthquake", helpingHand: true },
  { key: "grassy_terrain_eq",
    atk: { species: "Garchomp", level: 50, nature: "Adamant", evs: { atk: 252 }, ivs: IV },
    def: { species: "Snorlax", level: 50, nature: "Careful", evs: {}, ivs: IV },
    move: "Earthquake", terrain: "Grassy" },
  { key: "levitate_immune",
    atk: { species: "Garchomp", level: 50, nature: "Adamant", evs: { atk: 252 }, ivs: IV },
    def: { species: "Rotom-Wash", level: 50, nature: "Bold", evs: {}, ivs: IV },
    move: "Earthquake" },

  // ---- 五期：天气防御 ----
  { key: "snow_ice_def",
    atk: { species: "Garchomp", level: 50, nature: "Adamant", evs: { atk: 252 }, ivs: IV },
    def: { species: "Glaceon", level: 50, nature: "Bold", evs: { def: 252 }, ivs: IV },
    move: "Earthquake", weather: "Snow" },
  { key: "sand_rock_spd",
    atk: { species: "Charizard", level: 50, nature: "Modest", evs: { spa: 252 }, ivs: IV },
    def: { species: "Gigalith", level: 50, nature: "Calm", evs: {}, ivs: IV },
    move: "Flamethrower", weather: "Sand" },

  // ---- 五期：场地 ----
  { key: "psychic_terrain",
    atk: { species: "Gardevoir", level: 50, nature: "Modest", evs: { spa: 252 }, ivs: IV },
    def: { species: "Snorlax", level: 50, nature: "Careful", evs: {}, ivs: IV },
    move: "Psychic", terrain: "Psychic" },
  { key: "misty_terrain_dragon",
    atk: { species: "Garchomp", level: 50, nature: "Modest", evs: { spa: 252 }, ivs: IV },
    def: { species: "Snorlax", level: 50, nature: "Careful", evs: {}, ivs: IV },
    move: "Draco Meteor", terrain: "Misty" },
  { key: "electric_terrain",
    atk: { species: "Charizard", level: 50, nature: "Modest", evs: { spa: 252 }, ivs: IV },
    def: { species: "Snorlax", level: 50, nature: "Careful", evs: {}, ivs: IV },
    move: "Thunderbolt", terrain: "Electric" },
  { key: "grassy_boost_grass",
    atk: { species: "Charizard", level: 50, nature: "Modest", evs: { spa: 252 }, ivs: IV },
    def: { species: "Snorlax", level: 50, nature: "Careful", evs: {}, ivs: IV },
    move: "Energy Ball", terrain: "Grassy" },

  // ---- 五期：双打扩散 / 屏幕双打系数 ----
  { key: "doubles_spread_eq",
    atk: { species: "Garchomp", level: 50, nature: "Adamant", evs: { atk: 252 }, ivs: IV },
    def: { species: "Snorlax", level: 50, nature: "Careful", evs: {}, ivs: IV },
    move: "Earthquake", gameType: "Doubles" },
  { key: "doubles_screen",
    atk: { species: "Garchomp", level: 50, nature: "Adamant", evs: { atk: 252 }, ivs: IV },
    def: { species: "Snorlax", level: 50, nature: "Careful", evs: {}, ivs: IV },
    move: "Earthquake", gameType: "Doubles", defSide: { isReflect: true } },
  { key: "friend_guard",
    atk: { species: "Garchomp", level: 50, nature: "Adamant", evs: { atk: 252 }, ivs: IV },
    def: { species: "Snorlax", level: 50, nature: "Careful", evs: {}, ivs: IV },
    move: "Earthquake", defSide: { isFriendGuard: true } },

  // ---- 五期：友方辅助 ----
  { key: "steely_spirit",
    atk: { species: "Corviknight", level: 50, nature: "Adamant", evs: { atk: 252 }, ivs: IV },
    def: { species: "Snorlax", level: 50, nature: "Careful", evs: {}, ivs: IV },
    move: "Steel Wing", atkSide: { isSteelySpirit: true } },
  { key: "battery_special",
    atk: { species: "Charizard", level: 50, nature: "Modest", evs: { spa: 252 }, ivs: IV },
    def: { species: "Snorlax", level: 50, nature: "Careful", evs: {}, ivs: IV },
    move: "Flamethrower", atkSide: { isBattery: true } },
  { key: "power_spot",
    atk: { species: "Garchomp", level: 50, nature: "Adamant", evs: { atk: 252 }, ivs: IV },
    def: { species: "Snorlax", level: 50, nature: "Careful", evs: {}, ivs: IV },
    move: "Earthquake", atkSide: { isPowerSpot: true } },

  // ---- 五期：气场 ----
  { key: "fairy_aura",
    atk: { species: "Gardevoir", level: 50, nature: "Modest", evs: { spa: 252 }, ivs: IV },
    def: { species: "Snorlax", level: 50, nature: "Careful", evs: {}, ivs: IV },
    move: "Moonblast", isFairyAura: true },
  { key: "dark_aura_break",
    atk: { species: "Garchomp", level: 50, nature: "Adamant", evs: { atk: 252 }, ivs: IV },
    def: { species: "Snorlax", level: 50, nature: "Careful", evs: {}, ivs: IV },
    move: "Crunch", isDarkAura: true, isAuraBreak: true },

  // ---- 五期：四灾兽 ----
  { key: "ruin_sword_def",
    atk: { species: "Garchomp", level: 50, nature: "Adamant", evs: { atk: 252 }, ivs: IV },
    def: { species: "Snorlax", level: 50, nature: "Careful", evs: {}, ivs: IV },
    move: "Earthquake", isSwordOfRuin: true },
  { key: "ruin_beads_spd",
    atk: { species: "Charizard", level: 50, nature: "Modest", evs: { spa: 252 }, ivs: IV },
    def: { species: "Snorlax", level: 50, nature: "Careful", evs: {}, ivs: IV },
    move: "Flamethrower", isBeadsOfRuin: true },
  { key: "ruin_tablets_atk",
    atk: { species: "Garchomp", level: 50, nature: "Adamant", evs: { atk: 252 }, ivs: IV },
    def: { species: "Snorlax", level: 50, nature: "Careful", evs: {}, ivs: IV },
    move: "Earthquake", isTabletsOfRuin: true },
  { key: "ruin_vessel_spa",
    atk: { species: "Charizard", level: 50, nature: "Modest", evs: { spa: 252 }, ivs: IV },
    def: { species: "Snorlax", level: 50, nature: "Careful", evs: {}, ivs: IV },
    move: "Flamethrower", isVesselOfRuin: true },

  // ---- 五期：花之礼 / 满血多鳞片+钉子 ----
  { key: "flower_gift_sun",
    atk: { species: "Garchomp", level: 50, nature: "Adamant", evs: { atk: 252 }, ivs: IV },
    def: { species: "Snorlax", level: 50, nature: "Careful", evs: {}, ivs: IV },
    move: "Earthquake", weather: "Sun", atkSide: { isFlowerGift: true } },
  { key: "multiscale_sr",
    atk: { species: "Garchomp", level: 50, nature: "Adamant", evs: { atk: 252 }, ivs: IV },
    def: { species: "Dragonite", level: 50, nature: "Careful", evs: {}, ivs: IV, ability: "Multiscale" },
    move: "Dragon Claw", defSide: { isSR: true } },
  { key: "multiscale_full",
    atk: { species: "Garchomp", level: 50, nature: "Adamant", evs: { atk: 252 }, ivs: IV },
    def: { species: "Dragonite", level: 50, nature: "Careful", evs: {}, ivs: IV, ability: "Multiscale" },
    move: "Dragon Claw" },

  // ---- 五期：星晶 / 防守太晶 ----
  { key: "stellar_stab_orig",
    atk: { species: "Garchomp", level: 50, nature: "Adamant", evs: { atk: 252 }, ivs: IV, teraType: "Stellar" },
    def: { species: "Snorlax", level: 50, nature: "Careful", evs: {}, ivs: IV },
    move: { name: "Earthquake", isStellarFirstUse: true } },
  { key: "stellar_stab_nonorig",
    atk: { species: "Garchomp", level: 50, nature: "Adamant", evs: { atk: 252 }, ivs: IV, teraType: "Stellar" },
    def: { species: "Snorlax", level: 50, nature: "Careful", evs: {}, ivs: IV },
    move: { name: "Stone Edge", isStellarFirstUse: true } },
  { key: "def_tera_weak_shift",
    atk: { species: "Charizard", level: 50, nature: "Modest", evs: { spa: 252 }, ivs: IV },
    def: { species: "Snorlax", level: 50, nature: "Careful", evs: {}, ivs: IV, teraType: "Fighting" },
    move: "Air Slash" },
  { key: "def_tera_immune_gone",
    atk: { species: "Garchomp", level: 50, nature: "Adamant", evs: { atk: 252 }, ivs: IV },
    def: { species: "Gyarados", level: 50, nature: "Careful", evs: {}, ivs: IV, teraType: "Dragon" },
    move: "Earthquake" },
  { key: "def_tera_stellar_keep",
    atk: { species: "Garchomp", level: 50, nature: "Adamant", evs: { atk: 252 }, ivs: IV },
    def: { species: "Gyarados", level: 50, nature: "Careful", evs: {}, ivs: IV, teraType: "Stellar" },
    move: "Earthquake" },
  { key: "atk_tera_stab",
    atk: { species: "Garchomp", level: 50, nature: "Adamant", evs: { atk: 252 }, ivs: IV, teraType: "Dragon" },
    def: { species: "Snorlax", level: 50, nature: "Careful", evs: {}, ivs: IV },
    move: "Dragon Claw" },

  // ---- 五期：空间 / 重力 ----
  { key: "gravity_eq_flying",
    atk: { species: "Garchomp", level: 50, nature: "Adamant", evs: { atk: 252 }, ivs: IV },
    def: { species: "Gyarados", level: 50, nature: "Careful", evs: {}, ivs: IV },
    move: "Earthquake", isGravity: true },
  { key: "wonder_room_special",
    atk: { species: "Charizard", level: 50, nature: "Modest", evs: { spa: 252 }, ivs: IV },
    def: { species: "Shuckle", level: 50, nature: "Bold", evs: { def: 252 }, ivs: IV },
    move: "Flamethrower", isWonderRoom: true },
  { key: "magic_room_lo",
    atk: { species: "Garchomp", level: 50, nature: "Adamant", evs: { atk: 252 }, ivs: IV, item: "Life Orb" },
    def: { species: "Snorlax", level: 50, nature: "Careful", evs: {}, ivs: IV },
    move: "Earthquake", isMagicRoom: true },

  // ---- 五期：背心 / 进化奇石 / 会心升降 ----
  { key: "assault_vest",
    atk: { species: "Charizard", level: 50, nature: "Modest", evs: { spa: 252 }, ivs: IV },
    def: { species: "Snorlax", level: 50, nature: "Careful", evs: {}, ivs: IV, item: "Assault Vest" },
    move: "Flamethrower" },
  { key: "eviolite_chansey",
    atk: { species: "Charizard", level: 50, nature: "Modest", evs: { spa: 252 }, ivs: IV },
    def: { species: "Chansey", level: 50, nature: "Calm", evs: { hp: 252 }, ivs: IV, item: "Eviolite" },
    move: "Focus Blast" },
  { key: "crit_ignores_def_boost",
    atk: { species: "Garchomp", level: 50, nature: "Adamant", evs: { atk: 252 }, ivs: IV },
    def: { species: "Snorlax", level: 50, nature: "Careful", evs: {}, ivs: IV, boosts: { def: 2 } },
    move: { name: "Earthquake", isCrit: true } },
  { key: "def_boost_nocrit",
    atk: { species: "Garchomp", level: 50, nature: "Adamant", evs: { atk: 252 }, ivs: IV },
    def: { species: "Snorlax", level: 50, nature: "Careful", evs: {}, ivs: IV, boosts: { def: 2 } },
    move: "Earthquake" },

  // ---- 五期：Z / 极巨 ----
  { key: "z_generic_eq",
    atk: { species: "Garchomp", level: 50, nature: "Adamant", evs: { atk: 252 }, ivs: IV, item: "Groundium Z" },
    def: { species: "Snorlax", level: 50, nature: "Careful", evs: {}, ivs: IV },
    move: { name: "Earthquake", useZ: true } },
  { key: "z_generic_giga",
    atk: { species: "Snorlax", level: 50, nature: "Adamant", evs: { atk: 252 }, ivs: IV, item: "Normalium Z" },
    def: { species: "Snorlax", level: 50, nature: "Careful", evs: {}, ivs: IV },
    move: { name: "Giga Impact", useZ: true } },
  { key: "max_eq",
    atk: { species: "Garchomp", level: 50, nature: "Adamant", evs: { atk: 252 }, ivs: IV, isDynamax: true },
    def: { species: "Snorlax", level: 50, nature: "Careful", evs: {}, ivs: IV },
    move: { name: "Earthquake", useMax: true } },
  { key: "max_rock_blast",
    atk: { species: "Garchomp", level: 50, nature: "Adamant", evs: { atk: 252 }, ivs: IV, isDynamax: true },
    def: { species: "Snorlax", level: 50, nature: "Careful", evs: {}, ivs: IV },
    move: { name: "Rock Blast", useMax: true } },
  { key: "max_fighting",
    atk: { species: "Garchomp", level: 50, nature: "Adamant", evs: { atk: 252 }, ivs: IV, isDynamax: true },
    def: { species: "Snorlax", level: 50, nature: "Careful", evs: {}, ivs: IV },
    move: { name: "Close Combat", useMax: true } },

  // ---- 五期：特性免疫 ----
  { key: "flash_fire_immune",
    atk: { species: "Charizard", level: 50, nature: "Modest", evs: { spa: 252 }, ivs: IV },
    def: { species: "Snorlax", level: 50, nature: "Careful", evs: {}, ivs: IV, ability: "Flash Fire" },
    move: "Flamethrower" },
  { key: "water_absorb_immune",
    atk: { species: "Garchomp", level: 50, nature: "Modest", evs: { spa: 252 }, ivs: IV },
    def: { species: "Snorlax", level: 50, nature: "Careful", evs: {}, ivs: IV, ability: "Water Absorb" },
    move: "Surf" },
];

// Z/极巨威力表对拍：遍历招式数据，输出每招的 zMove/maxMove 基础威力
const TABLE_MOVES = [
  "Tackle", "Quick Attack", "Wing Attack", "Body Slam", "Bite", "Water Pulse",
  "Acid", "Mud-Slap", "Rock Throw", "Twineedle", "Lick", "Metal Claw",
  "Ember", "Water Gun", "Vine Whip", "Spark", "Confusion", "Powder Snow",
  "Dragon Breath", "Bite", "Iron Head", "Disarming Voice", "Hyper Beam",
  "Giga Impact", "Earthquake", "Flamethrower", "Surf", "Close Combat",
  "Rock Blast", "Bullet Seed", "Icicle Spear", "Double Kick", "Bonemerang",
  "Water Shuriken", "Surging Strikes", "Triple Axel", "Fire Blast",
  "Draco Meteor", "Weather Ball", "Hex", "Giga Drain", "V-create",
];
const seen = new Set();
const zTable = {};
for (const name of TABLE_MOVES) {
  if (seen.has(name)) continue;
  seen.add(name);
  const data = gen.moves.get(toID(name));
  if (!data) continue;
  zTable[name] = {
    bp: data.basePower,
    z: data.zMove ? data.zMove.basePower : null,
    max: data.maxMove ? data.maxMove.basePower : null,
  };
}

const out = cases.map((c) => {
  const moveOpt = typeof c.move === "string" ? { isCrit: c.crit || undefined } : c.move;
  const moveName = typeof c.move === "string" ? c.move : c.move.name;
  const atk = new Pokemon(gen, c.atk.species, {
    level: c.atk.level, nature: c.atk.nature, evs: c.atk.evs, ivs: c.atk.ivs,
    item: c.atk.item, ability: c.atk.ability, status: c.atk.status,
    boosts: c.atk.boosts, teraType: c.atk.teraType,
    isDynamaxed: c.atk.isDynamax,
  });
  const def = new Pokemon(gen, c.def.species, {
    level: c.def.level, nature: c.def.nature, evs: c.def.evs, ivs: c.def.ivs,
    item: c.def.item, ability: c.def.ability, boosts: c.def.boosts,
    teraType: c.def.teraType,
  });
  const move = new Move(gen, moveName, moveOpt);
  const field = new Field({
    weather: c.weather, terrain: c.terrain, gameType: c.gameType,
    isGravity: c.isGravity, isMagicRoom: c.isMagicRoom, isWonderRoom: c.isWonderRoom,
    isFairyAura: c.isFairyAura, isDarkAura: c.isDarkAura, isAuraBreak: c.isAuraBreak,
    isSwordOfRuin: c.isSwordOfRuin, isBeadsOfRuin: c.isBeadsOfRuin,
    isTabletsOfRuin: c.isTabletsOfRuin, isVesselOfRuin: c.isVesselOfRuin,
    attackerSide: c.helpingHand ? { isHelpingHand: true } : c.atkSide,
    defenderSide: c.defSide,
  });
  const r = calculate(gen, atk, def, move, field);
  return {
    key: c.key,
    damage: r.damage,
    atkStats: r.attacker.stats,
    defStats: r.defender.stats,
    defHp: r.defender.stats.hp,
  };
});
console.log(JSON.stringify({ cases: out, zTable }, null, 1));
