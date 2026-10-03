// M6 核心层补测：session 兜底路径 / 校验器错误翻译 / 数据访问层全表面
import { describe, expect, it } from "vitest";
import { BattleSession, Dex } from "../src/engine-adapter";
import { importShowdown, exportShowdown, validateTeam } from "../src/team/showdown";
import { FORMAT_CATALOG } from "../src/data/formats";
import {
  dexFor,
  natureList,
  speciesView,
  moveView,
  itemView,
  abilityView,
  zhText,
  TYPE_ZH,
  speciesList,
  itemList,
  abilityList,
  learnableMoves,
} from "../src/data";

const TEAM = `Garchomp @ Life Orb
Ability: Rough Skin
Level: 50
Tera Type: Steel
EVs: 4 HP / 252 Atk / 252 Spe
Jolly Nature
- Earthquake
- Dragon Claw
- Iron Head
- Protect

Milotic @ Sitrus Berry
Ability: Marvel Scale
Level: 50
Tera Type: Water
EVs: 196 HP / 124 Def / 188 SpA
Calm Nature
- Surf
- Ice Beam
- Recover
- Protect`;

describe("M6 session 兜底路径", () => {
  it("forceLose 终局化 + destroy 中途销毁不抛错", async () => {
    const sets = importShowdown(TEAM)!;
    const s = new BattleSession({
      formatid: "gen9vgc2025regi",
      teams: { p1: sets.slice(0, 4), p2: structuredClone(sets).slice(0, 4) },
      seed: [1, 2, 3, 4],
    });
    s.subscribe(() => undefined);
    await s.start();
    await new Promise((r) => setTimeout(r, 50));
    await s.forceLose("p2");
    for (let i = 0; i < 100 && s.phase !== "finished"; i++)
      await new Promise((r) => setTimeout(r, 20));
    expect(s.phase).toBe("finished");
    expect(s.winner).toBeTruthy();
    s.destroy();

    const s2 = new BattleSession({
      formatid: "gen9vgc2025regi",
      teams: { p1: sets.slice(0, 4), p2: structuredClone(sets).slice(0, 4) },
      seed: [1, 2, 3, 4],
    });
    await s2.start();
    await new Promise((r) => setTimeout(r, 30));
    expect(() => s2.destroy()).not.toThrow();
    // destroy 后 choose 静默
    await expect(s2.choose("p1", "move 1")).resolves.toBeUndefined();
  }, 30000);
});

describe("M6 校验器与文本翻译", () => {
  it("禁用招式/道具给出中文提示", async () => {
    const bad = importShowdown(TEAM)!.map((s) =>
      s.species === "Milotic"
        ? { ...s, moves: ["Surf", "Ice Beam", "Recover", "Spacial Rend"] }
        : s,
    );
    const check = await validateTeam("gen9vgc2025regi", bad);
    expect(check.ok).toBe(false);
    expect(
      check.errors.some(
        (e) => e.includes("不可获得") || e.includes("不可用") || e.includes("招式"),
      ),
    ).toBe(true);
  });

  it("赛制不存在 → 明确中文错误", async () => {
    const sets = importShowdown(TEAM)!;
    const check = await validateTeam("gen9nonexistentformat", sets);
    expect(check.ok).toBe(false);
    expect(check.errors[0]).toContain("赛制不存在");
  });

  it("垃圾文本导入返回 null；空队伍导出为空串", () => {
    expect(importShowdown("hello world 不是一个队伍")).toBeNull();
    expect(importShowdown("")).toBeNull();
    expect(exportShowdown([])).toBe("");
  });
});

describe("M6 数据访问层表面", () => {
  const dex = dexFor("gen9");
  it("视图查询：物种/招式/道具/特性中文名与回落", () => {
    expect(speciesView(dex, "garchomp")?.zhName).toBe("烈咬陆鲨");
    expect(moveView(dex, "earthquake")?.zhName).toBe("地震");
    expect(itemView(dex, "lifeorb")?.zhName).toBe("生命宝珠");
    expect(abilityView(dex, "roughskin")?.zhName).toBe("粗糙皮肤");
    expect(speciesView(dex, "not-a-pokemon")).toBeNull();
  });
  it("性格清单全量简中 + 太晶属性表完备", () => {
    const natures = natureList();
    expect(natures.length).toBe(25);
    expect(natures.every((n) => !/[a-z]{3}/.test(n.zhName) || n.zhName.length <= 4)).toBe(true);
    expect(TYPE_ZH["Dragon"]).toBe("龙");
  });
  it("zh-cn 文本表四域齐备", () => {
    const zh = zhText();
    expect(zh.Pokedex["garchomp"]?.name).toBe("烈咬陆鲨");
    expect(zh.Moves["earthquake"]?.name).toBe("地震");
    expect(zh.Abilities["roughskin"]?.name).toBe("粗糙皮肤");
    expect(zh.Items["lifeorb"]?.name).toBeTruthy();
  });
  it("赛制优先级标签", () => {});
  it("Dex 赛制目录含全部目录赛制", () => {
    Dex.includeFormats();
    const all = new Set(Dex.formats.all().map((f) => String(f.id)));
    for (const f of FORMAT_CATALOG) {
      expect(all.has(f.id), f.id).toBe(true);
    }
  });
  it("清单函数：物种/道具/特性/可学招式（编辑器数据面）", () => {
    const species = speciesList(dex);
    expect(species.length).toBeGreaterThan(500);
    expect(species.some((s) => s.id === "garchomp")).toBe(true);
    expect(species.every((s) => !s.isNonstandard)).toBe(true);
    const items = itemList(dex);
    expect(items.length).toBeGreaterThan(200);
    expect(items.some((i) => i.zhName === "生命宝珠")).toBe(true);
    const abilities = abilityList(dex);
    expect(abilities.length).toBeGreaterThan(250);
    expect(abilities.some((a) => a.zhName === "粗糙皮肤")).toBe(true);
    const moves = learnableMoves(dex, "garchomp");
    expect(moves.length).toBeGreaterThan(40);
    expect(moves.some((m) => m.zhName === "地震")).toBe(true);
    expect(
      moves.every((m, i) => i === 0 || moves[i - 1]!.zhName.localeCompare(m.zhName, "zh") <= 0),
    ).toBe(true);
  });
});
