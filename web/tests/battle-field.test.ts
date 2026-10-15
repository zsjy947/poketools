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
