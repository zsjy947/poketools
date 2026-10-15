/* battle-field.test.ts —— 场地状态推导（天气/地形/空间/侧壁）回归 */
import { describe, expect, it } from "vitest";
import { parseLogLine } from "../src/engine-adapter";
import type { BattleEvent } from "../src/engine-adapter";
import { fieldConditions, condLabel } from "../src/battle/field";

const feed = (lines: string[]): BattleEvent[] => lines.map(parseLogLine);

describe("场地状态推导", () => {
  it("天气：开始/持续/结束（none）", () => {
    const a = fieldConditions(feed(["|-weather|SunnyDay"]));
    expect(a.weather).toBe("sunnyday");
    const b = fieldConditions(feed(["|-weather|SunnyDay", "|-weather|SunnyDay|[upkeep]"]));
    expect(b.weather).toBe("sunnyday");
    const c = fieldConditions(feed(["|-weather|RainDance", "|-weather|none"]));
    expect(c.weather).toBeUndefined();
  });

  it("地形与场地招式：fieldstart/fieldend", () => {
    const a = fieldConditions(feed(["|-fieldstart|move: Electric Terrain"]));
    expect(a.terrain).toBe("electricterrain");
    expect(a.fieldMoves).toEqual([]);
    const b = fieldConditions(feed(["|-fieldstart|move: Trick Room"]));
    expect(b.terrain).toBeUndefined();
    expect(b.fieldMoves).toEqual(["trickroom"]);
    const c = fieldConditions(
      feed(["|-fieldstart|move: Grassy Terrain", "|-fieldend|move: Grassy Terrain"]),
    );
    expect(c.terrain).toBeUndefined();
  });

  it("侧壁：sidestart/sideend 按阵营归属", () => {
    const a = fieldConditions(
      feed(["|-sidestart|p1: 阵营 A|move: Reflect", "|-sidestart|p2: 阵营 B|move: Light Screen"]),
    );
    expect(a.sideStatus.p1).toEqual(["reflect"]);
    expect(a.sideStatus.p2).toEqual(["lightscreen"]);
    const b = fieldConditions(
      feed(["|-sidestart|p1: 阵营 A|move: Reflect", "|-sideend|p1: 阵营 A|move: Reflect"]),
    );
    expect(b.sideStatus.p1).toEqual([]);
  });

  it("中文文案映射", () => {
    expect(condLabel("sunnyday")).toBe("晴天");
    expect(condLabel("electricterrain")).toBe("电气场地");
    expect(condLabel("trickroom")).toBe("戏法空间");
    expect(condLabel("auroraveil")).toBe("极光幕");
    expect(condLabel("tailwind")).toBe("顺风");
  });
});

/* 招式槽位映射（濒死槽裁剪）回归：双打左槽阵亡时名字/招式不得错位 */
import { liveMoveSlots } from "../src/battle/BattleView";
import type { RequestChoice } from "../src/engine-adapter/session";

const mon = (ident: string, active: boolean, cond: string) => ({
  ident,
  details: ident.split(": ")[1] ?? ident,
  condition: cond,
  active,
  stats: { atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
  moves: [],
  baseAbility: "",
  item: "",
  ability: "",
  pokeball: "poke",
});
const slotData = (name: string) => ({
  moves: [{ move: name + "-A", id: name.toLowerCase() + "a", pp: 10, maxpp: 10, target: "normal" }],
});

const mkReq = (c0: string, c1: string): RequestChoice => ({
  side: {
    name: "阵营 A",
    id: "p1",
    pokemon: [
      mon("p1a: Garchomp", true, c0),
      mon("p1b: Corviknight", true, c1),
      mon("p1c: Zoroark", false, "0 fnt"),
    ],
  },
  active: [slotData("garchomp"), slotData("corviknight")],
});

describe("招式槽位映射（liveMoveSlots）", () => {
  it("双打左槽阵亡：只剩右槽，招式与名字同为右侧存活者", () => {
    const out = liveMoveSlots(mkReq("0 fnt", "150/150"));
    expect(out).toHaveLength(1);
    expect(out[0]!.i).toBe(1);
    expect(out[0]!.mon.ident).toBe("p1b: Corviknight");
    expect(out[0]!.a.moves[0]!.move).toBe("corviknight-A");
  });

  it("双打右槽阵亡：只剩左槽", () => {
    const out = liveMoveSlots(mkReq("150/150", "0 fnt"));
    expect(out).toHaveLength(1);
    expect(out[0]!.i).toBe(0);
    expect(out[0]!.mon.ident).toBe("p1a: Garchomp");
    expect(out[0]!.a.moves[0]!.move).toBe("garchomp-A");
  });

  it("双存活：两槽齐备（槽位序）", () => {
    const out = liveMoveSlots(mkReq("150/150", "150/150"));
    expect(out.map((x) => x.i)).toEqual([0, 1]);
    expect(out.map((x) => x.mon.ident)).toEqual(["p1a: Garchomp", "p1b: Corviknight"]);
  });
});
