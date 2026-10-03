/* damage.golden.test.ts —— 伤害引擎黄金用例（原 tests/test_damage.py 用例移植，
 * 基准向量 = Bulbapedia「Damage」页官方算例）。Python 版退役后此文件为公式层
 * 行为回归资产（数值对拍由 calib.test.ts 承担）。 */
import { describe, it, expect } from "vitest";
import {
  calcDamage,
  calcModernStats,
  hazardDamage,
  zPower,
  maxPower,
  type Side,
  type Move,
} from "../src/data/damage";

function glaceonGarchompVector(crit = false) {
  /** 75级冰伊布(攻击123) 冰牙(65物理冰,STAB) vs 163防烈咬陆鲨(龙/地) → 168~196。
   * 属性相性 4 倍；无其他修正；会心一击 ×1.5。 */
  const a: Side = {
    types: "冰",
    level: 75,
    stats: { atk: 123, def: 100, spa: 200, spd: 150, spe: 100, hp: 200 },
    item: "",
    ability: "",
    boosts: {},
  };
  const d: Side = {
    types: "龙,地面",
    level: 75,
    stats: { atk: 150, def: 163, spa: 100, spd: 110, spe: 102, hp: 270 },
    item: "",
    ability: "",
    boosts: {},
    is_dynamax: false,
  };
  const move: Move = {
    name_zh: "冰牙",
    identifier: "ice-fang",
    type_zh: "冰",
    damage_class: "physical",
    power: 65,
  };
  return calcDamage(a, d, move, { crit });
}

describe("damage 黄金用例（Bulbapedia 官方算例）", () => {
  it("官方基准向量 168~196（4 倍相性）", () => {
    const r = glaceonGarchompVector();
    expect([r.min, r.max]).toEqual([168, 196]);
    expect(r.effectiveness).toBe(4);
    expect(r.rolls.length).toBe(16);
    expect(r.rolls[0]).toBe(168);
    expect(r.rolls[r.rolls.length - 1]).toBe(196);
  });

  it("会心 ×1.5（作用于基础伤害，随机最先 floor，STAB 4096 分数链）", () => {
    const r = glaceonGarchompVector(true);
    expect([r.min, r.max]).toEqual([244, 292]);
  });

  it("幽灵免疫一般", () => {
    const r = calcDamage(
      {
        types: "一般",
        level: 50,
        stats: { atk: 100, def: 100, spa: 100, spd: 100, spe: 100, hp: 100 },
        item: "",
        ability: "",
        boosts: {},
      },
      {
        types: "幽灵",
        level: 50,
        stats: { atk: 100, def: 100, spa: 100, spd: 100, spe: 100, hp: 100 },
        item: "",
        ability: "",
        boosts: {},
      },
      {
        name_zh: "破坏光线",
        identifier: "hyper-beam",
        type_zh: "一般",
        damage_class: "special",
        power: 150,
      },
      {},
    );
    expect(r.effectiveness).toBe(0);
    expect(r.max).toBe(0);
  });

  it("漂浮免疫地面", () => {
    const r = calcDamage(
      {
        types: "地面",
        level: 50,
        stats: { atk: 150, def: 100, spa: 100, spd: 100, spe: 100, hp: 100 },
        item: "",
        ability: "",
        boosts: {},
      },
      {
        types: "超能力,飞行",
        level: 50,
        stats: { atk: 100, def: 100, spa: 100, spd: 100, spe: 100, hp: 100 },
        item: "",
        ability: "漂浮",
        boosts: {},
      },
      {
        name_zh: "地震",
        identifier: "earthquake",
        type_zh: "地面",
        damage_class: "physical",
        power: 100,
      },
      {},
    );
    expect(r.max).toBe(0);
  });

  it("能力值计算（烈咬陆鲨 50 级固执 252 攻）", () => {
    const form = { hp: 108, atk: 130, def: 95, spa: 80, spd: 85, spe: 102 };
    const evs = { hp: 0, atk: 252, def: 0, spa: 0, spd: 4, spe: 252 };
    const ivs = { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 };
    const nature = { up: "atk", down: "spa" };
    const s = calcModernStats(form, 50, nature, evs, ivs, "", false);
    expect(s.hp).toBe(183);
    expect(s.atk).toBe(200);
    expect(s.spa).toBe(90);
  });

  it("极巨化 HP×2 与巨兽系 ×2", () => {
    const a: Side = {
      types: "钢",
      level: 100,
      stats: { atk: 200, def: 150, spa: 100, spd: 150, spe: 100, hp: 100 },
      item: "",
      ability: "",
      boosts: {},
    };
    const dNormal: Side = {
      types: "龙",
      level: 100,
      stats: { atk: 150, def: 150, spa: 100, spd: 120, spe: 100, hp: 300 },
      item: "",
      ability: "",
      boosts: {},
    };
    const move: Move = {
      name_zh: "巨兽斩击",
      identifier: "behemoth-blade",
      type_zh: "钢",
      damage_class: "physical",
      power: 100,
    };
    const r1 = calcDamage(a, dNormal, move, {});
    const dMax = { ...dNormal, is_dynamax: true, stats: { ...dNormal.stats, hp: 600 } };
    const r2 = calcDamage(a, dMax, move, {});
    expect(r2.hp).toBe(600);
    expect([r2.min, r2.max]).toEqual([r1.min! * 2, r1.max! * 2]);
  });

  it("灼伤减半物理 / 毅性反转", () => {
    const base = vector();
    const burned = vector({ burn: true });
    expect(burned.max!).toBeLessThan(base.max!);
    const guts = calcDamage(
      {
        types: "火",
        level: 50,
        stats: { atk: 150, def: 100, spa: 150, spd: 100, spe: 100, hp: 160 },
        item: "",
        ability: "毅力",
        boosts: {},
      },
      vectorSideD(),
      vectorMove(),
      { burn: true },
    );
    expect(guts.max!).toBeGreaterThan(base.max!);
  });

  it("Z/极巨威力表档位与特例", () => {
    expect(zPower(85, "test")).toBe(160);
    expect(zPower(150, "test")).toBe(200);
    expect(zPower(90, "hex")).toBe(160);
    expect(maxPower(90, "火", "test")).toBe(130);
    expect(maxPower(90, "格斗", "test")).toBe(90);
    expect(maxPower(120, "火", "test")).toBe(140);
    // 多段：2~5 段取 3 段；固定 2 段 Z 用单段、极巨取 2 倍
    expect(zPower(25, "rock-blast")).toBe(140);
    expect(maxPower(25, "岩石", "rock-blast")).toBe(130);
    expect(zPower(30, "double-kick")).toBe(100);
    expect(maxPower(30, "格斗", "double-kick")).toBe(80);
    expect(maxPower(15, "水", "water-shuriken")).toBe(90);
    expect(maxPower(20, "冰", "triple-axel")).toBe(140);
    expect(maxPower(50, "一般", "weather-ball")).toBe(130);
  });

  it("太晶 STAB 与防守方相性替换", () => {
    const a: Side = {
      types: "一般",
      level: 50,
      stats: { atk: 150, def: 100, spa: 150, spd: 100, spe: 100, hp: 160 },
      item: "",
      ability: "",
      boosts: {},
    };
    const d: Side = {
      types: "钢",
      level: 50,
      stats: { atk: 100, def: 120, spa: 100, spd: 120, spe: 90, hp: 190 },
      item: "",
      ability: "",
      boosts: {},
      is_dynamax: false,
    };
    const move = vectorMove();
    const base = calcDamage(a, d, move, {});
    const teraAtk = calcDamage({ ...a, tera_type: "一般" }, d, move, {});
    expect(teraAtk.max!).toBeGreaterThan(base.max!);
    const teraDef = calcDamage(a, { ...d, tera_type: "钢" }, move, {});
    expect(teraDef.effectiveness).toBe(base.effectiveness);
    const teraDef2 = calcDamage(a, { ...d, tera_type: "幽灵" }, move, {});
    expect(teraDef2.effectiveness).toBe(0);
  });

  it("帮助为威力阶段修正（bpMods 6144/4096）", () => {
    const base = vectorWith({ power: 65 });
    const helped = vectorWith({ power: 97 });
    const same = vectorWith({ power: 65, helping_hand: true });
    expect(same.min).toBe(helped.min);
    expect(same.max).toBe(helped.max);
    expect(same.max!).toBeGreaterThan(base.max!);
  });

  it("极光幕等同屏幕，会心无视壁", () => {
    const plain = vectorWith({});
    const veiled = vectorWith({ screen: "aurora" });
    expect(veiled.max!).toBeLessThan(plain.max!);
    const critPlain = vectorWith({ crit: true });
    const critVeiled = vectorWith({ screen: "aurora", crit: true });
    expect(critVeiled.max).toBe(critPlain.max);
  });

  it("青草场地仅削弱接地防守方的地震/跺脚", () => {
    const base = vectorWith({ move_type: "地面", power: 90, identifier: "earthquake" });
    const grassy = vectorWith({
      move_type: "地面",
      power: 90,
      identifier: "earthquake",
      terrain: "grassy",
    });
    const expected = vectorWith({ move_type: "地面", power: 45, identifier: "earthquake" });
    expect(grassy.max).toBe(expected.max);
    expect(expected.max!).toBeLessThan(base.max!);
    const other = vectorWith({
      move_type: "地面",
      power: 90,
      identifier: "test-move",
      terrain: "grassy",
    });
    const otherBase = vectorWith({ move_type: "地面", power: 90, identifier: "test-move" });
    expect(other.max).toBe(otherBase.max);
    const flying = calcDamage(
      vectorSideA({ types: "冰" }),
      vectorSideD({ types: "飞行" }),
      {
        name_zh: "地震",
        identifier: "earthquake",
        type_zh: "地面",
        damage_class: "physical",
        power: 90,
      },
      { terrain: "grassy" },
    );
    const flyingPlain = calcDamage(
      vectorSideA({ types: "冰" }),
      vectorSideD({ types: "飞行" }),
      {
        name_zh: "地震",
        identifier: "earthquake",
        type_zh: "地面",
        damage_class: "physical",
        power: 90,
      },
      {},
    );
    expect(flying.max).toBe(flyingPlain.max);
  });

  it("烈日/大雨别名与沙暴不影响数值", () => {
    const sun = vectorWith({ move_type: "火", power: 90, weather: "sun" });
    const harsh = vectorWith({ move_type: "火", power: 90, weather: "harsh_sun" });
    const neutral = vectorWith({ move_type: "火", power: 90 });
    const sand = vectorWith({ move_type: "火", power: 90, weather: "sand" });
    expect(harsh.max).toBe(sun.max);
    expect(sun.max!).toBeGreaterThan(neutral.max!);
    expect(sand.max).toBe(neutral.max);
  });

  it("雪天冰系防御 / 沙暴岩石系特防", () => {
    const mv: Move = {
      name_zh: "测试",
      identifier: "earthquake",
      type_zh: "地面",
      damage_class: "physical",
      power: 90,
    };
    const plain = calcDamage(vectorSideA(), vectorSideD({ types: "冰" }), mv, {});
    const snowy = calcDamage(vectorSideA(), vectorSideD({ types: "冰" }), mv, { weather: "snow" });
    expect(snowy.max!).toBeLessThan(plain.max!);
    const snowy2 = calcDamage(vectorSideA(), vectorSideD(), mv, { weather: "snow" });
    const plain2 = calcDamage(vectorSideA(), vectorSideD(), mv, {});
    expect(snowy2.max).toBe(plain2.max);
    const fire: Move = {
      name_zh: "测试",
      identifier: "test-move",
      type_zh: "火",
      damage_class: "special",
      power: 90,
    };
    const rockPlain = calcDamage(vectorSideA(), vectorSideD({ types: "岩石" }), fire, {});
    const rockSandy = calcDamage(vectorSideA(), vectorSideD({ types: "岩石" }), fire, {
      weather: "sand",
    });
    expect(rockSandy.max!).toBeLessThan(rockPlain.max!);
  });

  it("双打扩散 3072 与屏幕 2732", () => {
    const mv: Move = {
      name_zh: "测试",
      identifier: "earthquake",
      type_zh: "地面",
      damage_class: "physical",
      power: 90,
      is_spread: true,
    };
    const singles = calcDamage(vectorSideA(), vectorSideD(), mv, {});
    const doubles = calcDamage(vectorSideA(), vectorSideD(), mv, { mode: "doubles" });
    expect(doubles.max!).toBeLessThan(singles.max!);
    const mv2: Move = {
      name_zh: "测试",
      identifier: "test-move",
      type_zh: "冰",
      damage_class: "physical",
      power: 65,
    };
    const s2 = calcDamage(vectorSideA(), vectorSideD(), mv2, { mode: "singles" });
    const d2 = calcDamage(vectorSideA(), vectorSideD(), mv2, { mode: "doubles" });
    expect(s2.max).toBe(d2.max);
    const scr1 = calcDamage(vectorSideA(), vectorSideD(), mv2, { screen: "reflect" });
    const scr2 = calcDamage(vectorSideA(), vectorSideD(), mv2, {
      screen: "reflect",
      mode: "doubles",
    });
    expect(scr2.max!).toBeGreaterThan(scr1.max!);
  });

  it("气场与气场破坏", () => {
    const mv: Move = {
      name_zh: "测试",
      identifier: "test-move",
      type_zh: "妖精",
      damage_class: "physical",
      power: 90,
    };
    const plain = calcDamage(vectorSideA(), vectorSideD(), mv, {});
    const aura = calcDamage(vectorSideA(), vectorSideD(), mv, { auras: { fairy: true } });
    const broken = calcDamage(vectorSideA(), vectorSideD(), mv, {
      auras: { fairy: true, break: true },
    });
    expect(aura.max!).toBeGreaterThan(plain.max!);
    expect(broken.max!).toBeLessThan(plain.max!);
  });

  it("灾祸系特性（剑/简）", () => {
    const mv: Move = {
      name_zh: "测试",
      identifier: "test-move",
      type_zh: "冰",
      damage_class: "physical",
      power: 65,
    };
    const plain = calcDamage(vectorSideA(), vectorSideD(), mv, {});
    const sword = calcDamage(vectorSideA(), vectorSideD(), mv, { ruin: { sword: true } });
    const tablets = calcDamage(vectorSideA(), vectorSideD(), mv, { ruin: { tablets: true } });
    expect(sword.max!).toBeGreaterThan(plain.max!);
    expect(tablets.max!).toBeLessThan(plain.max!);
    const byAb = calcDamage(vectorSideA({ ability: "灾祸之剑" }), vectorSideD(), mv, {});
    expect(byAb.max).toBe(sword.max);
  });

  it("星晶攻击 STAB ×2、星晶防守保原属性", () => {
    const mv: Move = {
      name_zh: "测试",
      identifier: "test-move",
      type_zh: "冰",
      damage_class: "physical",
      power: 65,
    };
    const base = calcDamage(vectorSideA(), vectorSideD(), mv, {});
    const stellar = calcDamage(vectorSideA({ tera_type: "星晶" }), vectorSideD(), mv, {});
    expect(stellar.max!).toBeGreaterThan(base.max!);
    const dStellar = calcDamage(vectorSideA(), vectorSideD({ tera_type: "星晶" }), mv, {});
    expect(dStellar.effectiveness).toBe(4);
    expect(base.effectiveness).toBe(4);
  });

  it("KO 概率与气势披带", () => {
    const mv: Move = {
      name_zh: "测试",
      identifier: "test-move",
      type_zh: "冰",
      damage_class: "physical",
      power: 65,
    };
    const r = calcDamage(vectorSideA(), vectorSideD(), mv, {});
    const ko = r.ko;
    expect(Object.keys(ko.probs).sort()).toEqual(["1", "2", "3", "4"]);
    expect(ko.probs["1"]).toBe(r.ohko ? 100.0 : 0.0);
    expect(ko.probs["2"]!).toBeGreaterThanOrEqual(ko.probs["1"]!);
    const r2 = calcDamage(vectorSideA(), vectorSideD(), mv, { defender_sash: true });
    expect(r2.ko.probs["1"]).toBe(0.0);
    expect(r2.ko.probs["2"]).toBe(100.0);
  });

  it("进场钉子伤害", () => {
    expect(hazardDamage(["飞行"], 100, { rocks: true }, true)).toBe(25);
    expect(hazardDamage(["一般"], 100, { rocks: true }, true)).toBe(12);
    expect(hazardDamage(["一般"], 120, { spikes: 3 }, true)).toBe(30);
    expect(hazardDamage(["一般"], 120, { spikes: 3 }, false)).toBe(0);
    expect(hazardDamage(["水"], 80, { salt_cure: true }, true)).toBe(20);
    expect(hazardDamage(["草"], 80, { leech_seed: true }, true)).toBe(10);
  });

  it("突击背心 / 进化奇石 / 黑洞奇妙空间 / 免疫特性", () => {
    const fire: Move = {
      name_zh: "测试",
      identifier: "test-move",
      type_zh: "火",
      damage_class: "special",
      power: 90,
    };
    const plain = calcDamage(vectorSideA(), vectorSideD(), fire, {});
    const vested = calcDamage(vectorSideA(), vectorSideD({ item: "突击背心" }), fire, {});
    expect(vested.max!).toBeLessThan(plain.max!);
    const evo = calcDamage(
      vectorSideA(),
      vectorSideD({ item: "进化奇石", can_evolve: true }),
      fire,
      {},
    );
    const noEvo = calcDamage(
      vectorSideA(),
      vectorSideD({ item: "进化奇石", can_evolve: false }),
      fire,
      {},
    );
    expect(evo.max!).toBeLessThan(plain.max!);
    expect(noEvo.max).toBe(plain.max);
    const lo = calcDamage(vectorSideA({ item: "生命宝珠" }), vectorSideD(), vectorMove(), {});
    const loMagic = calcDamage(vectorSideA({ item: "生命宝珠" }), vectorSideD(), vectorMove(), {
      magic_room: true,
    });
    expect(lo.max!).toBeGreaterThan(loMagic.max!);
    const wonder = calcDamage(
      vectorSideA(),
      vectorSideD({ stats: { atk: 150, def: 300, spa: 100, spd: 100, spe: 102, hp: 270 } }),
      fire,
      { wonder_room: true },
    );
    const wonderPlain = calcDamage(
      vectorSideA(),
      vectorSideD({ stats: { atk: 150, def: 300, spa: 100, spd: 100, spe: 102, hp: 270 } }),
      fire,
      {},
    );
    expect(wonder.max!).toBeLessThan(wonderPlain.max!);
    const fireR = calcDamage(vectorSideA(), vectorSideD({ ability: "引火" }), fire, {});
    expect(fireR.max).toBe(0);
    expect(fireR.immune_by).toBe("引火");
    const water: Move = {
      name_zh: "测试",
      identifier: "test-move",
      type_zh: "水",
      damage_class: "special",
      power: 90,
    };
    const waterR = calcDamage(vectorSideA(), vectorSideD({ ability: "储水" }), water, {});
    expect(waterR.max).toBe(0);
  });
});

// ---- 测试向量构造 ----
function vectorSideA(over: Partial<Side> = {}): Side {
  return {
    types: "冰",
    level: 75,
    stats: { atk: 123, def: 100, spa: 200, spd: 150, spe: 100, hp: 200 },
    item: "",
    ability: "",
    boosts: {},
    ...over,
  };
}
function vectorSideD(over: Partial<Side> = {}): Side {
  return {
    types: "龙,地面",
    level: 75,
    stats: { atk: 150, def: 163, spa: 100, spd: 110, spe: 102, hp: 270 },
    item: "",
    ability: "",
    boosts: {},
    is_dynamax: false,
    ...over,
  };
}
function vectorMove(): Move {
  return {
    name_zh: "百万吨重拳",
    identifier: "mega-punch",
    type_zh: "一般",
    damage_class: "physical",
    power: 80,
  };
}
function vector(optOver: Record<string, any> = {}) {
  return calcDamage(
    vectorSideA({ types: "火" }),
    vectorSideD({ types: "钢" }),
    vectorMove(),
    optOver,
  );
}
function vectorWith(
  opt: { move_type?: string; power?: number; identifier?: string } & Record<string, any>,
) {
  const { move_type = "冰", power = 65, identifier = "test-move", ...rest } = opt;
  return calcDamage(
    vectorSideA(),
    vectorSideD(),
    { name_zh: "测试招式", identifier, type_zh: move_type, damage_class: "physical", power },
    rest,
  );
}
