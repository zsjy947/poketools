/* detail-typechart.test.ts —— RM-19：DetailPage 属性相性纯函数拆出的回归。 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import { setLoader } from "../src/data/core";
import { loadTypeChart } from "../src/components/games";
import { attackGroups, defenseGroups, effClass } from "../src/pages/detail/typechart";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const DATA = path.join(ROOT, "web", "public", "data");

beforeAll(async () => {
  setLoader((rel) => Promise.resolve(JSON.parse(readFileSync(path.join(DATA, rel), "utf-8"))));
  await loadTypeChart();
});

describe("属性相性纯函数（DetailPage 拆出）", () => {
  it("防守面：草→5 档分组（4/2/1/0.5/0.25/0 序）", () => {
    const g = defenseGroups(["草"]);
    expect(g).not.toBeNull();
    // 单属性草无 4 档（4x 需双属性叠加）；2 档 = 火/冰/毒/飞行/虫
    expect(g![0]!.m).toBe("2");
    for (const t of ["火", "冰", "毒", "飞行", "虫"]) {
      expect(g![0]!.types).toContain(t);
    }
    const fire = g!.find((x) => x.m === "2");
    expect(fire!.types).toContain("火");
  });

  it("攻击面：火攻 2/0.5/0 分组", () => {
    const g = attackGroups("火");
    expect(g[0]!.m).toBe("2");
    expect(g[0]!.types).toContain("草");
    expect(g[1]!.m).toBe("0.5");
    expect(g[1]!.types).toContain("水");
  });

  it("倍率 → CSS 类", () => {
    expect(effClass("2")).toBe("bad");
    expect(effClass("1")).toBe("neutral");
    expect(effClass("0")).toBe("immune");
    expect(effClass("0.5")).toBe("good");
  });
});
