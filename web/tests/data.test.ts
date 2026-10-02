// M1 数据层测试：赛制覆盖 / 中文查询 / champions mod 专属性
import { describe, expect, it } from "vitest";
import { Dex } from "../src/engine-adapter";
import { FORMAT_CATALOG, verifyFormats } from "../src/data/formats";
import { dexFor, natureList, speciesView, moveView, TYPE_ZH } from "../src/data";

describe("M1 数据层", () => {
  it("全部 P0/P1 赛制在上游存在", () => {
    const v = verifyFormats();
    expect(v.ok, `缺失：${v.missing.join(",")}`).toBe(true);
  });

  it("赛制目录至少含 6 个 P0 项", () => {
    expect(FORMAT_CATALOG.filter((f) => f.priority === "P0").length).toBeGreaterThanOrEqual(6);
  });

  it("champions mod 生效：Mega 回归 + PP 上限 20", () => {
    const dex = Dex.mod("champions");
    expect(dex.species.get("charizardmegay").exists).toBe(true);
    expect(dex.moves.get("earthquake").pp).toBeLessThanOrEqual(20);
  });

  it("champions 道具：普通道具 Past、超进化石可用", () => {
    const dex = Dex.mod("champions");
    expect(dex.items.get("choicespecs").isNonstandard).toBeTruthy();
    expect(dex.items.get("charizarditex").isNonstandard).toBeFalsy();
  });

  it("中文查询：物种/招式官方简中名", () => {
    const dex = dexFor("gen9");
    expect(speciesView(dex, "garchomp")?.zhName).toBe("烈咬陆鲨");
    expect(moveView(dex, "earthquake")?.zhName).toBe("地震");
    expect(moveView(dex, "dragonclaw")?.type).toBe(TYPE_ZH.Dragon);
  });

  it("性格清单 25 项含中文与升降", () => {
    const natures = natureList();
    expect(natures.length).toBe(25);
    const jolly = natures.find((n) => n.name === "Jolly");
    expect(jolly?.zhName).toBe("爽朗");
    expect(jolly?.plus).toBe("速度");
  });

  it("gen9 基础数据可查：烈咬陆鲨种族值", () => {
    const dex = dexFor("gen9");
    const g = speciesView(dex, "garchomp");
    expect(g?.baseStats).toEqual({ hp: 108, atk: 130, def: 95, spa: 80, spd: 85, spe: 102 });
  });
});
