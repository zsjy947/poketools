/* battle-validate-zh.test.ts —— 合规性校验消息全中文回归（U23 清漏扫描）。
 * 用样例违规队伍跑 TeamValidator，断言翻译后的消息不含成段英文（专名白名单除外）。 */
import { describe, expect, it } from "vitest";
import { validateTeam, translateValidatorError } from "../src/team/showdown";
import type { PokemonSet } from "../src/engine-adapter";

const mk = (species: string, patch: Partial<PokemonSet> = {}): PokemonSet => ({
  name: "",
  species,
  item: "",
  ability: "",
  moves: ["", "", "", ""],
  nature: "Serious",
  evs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
  ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 },
  level: 50,
  ...patch,
});

const EV_MAX = { hp: 252, atk: 252, def: 252, spa: 252, spd: 252, spe: 252 };

/** 允许保留的专名片段（赛制名/招式名转中文前的白名单兜底） */
const ALLOW = /(?:VGC|Reg|BSS|Bo3|OT S|Gen ?9|Champions|Flat Rules|Min Source)/g;

describe("合规性校验消息全中文（U23）", () => {
  const battery: Array<[string, PokemonSet[]]> = [
    ["昵称与物种不符", [mk("garchomp", { name: "雷丘" })]],
    ["空特性+空招式", [mk("garchomp")]],
    ["非法道具/特性/招式", [mk("garchomp", { item: "不存在道具", ability: "不存在特性", moves: ["不存在招式", "", "", ""] })]],
    ["道具条款", [mk("garchomp", { item: "Choice Band" }), mk("dragapult", { item: "Choice Band" })]],
    ["努力值超上限", [mk("garchomp", { evs: EV_MAX })]],
    ["努力值 0 提示", [mk("garchomp", { nature: "Adamant", evs: EV_MAX })]],
    ["未进化形态+非法招式", [mk("charmeleon", { ability: "Blaze", moves: ["Belly Drum", "Flamethrower", "", ""] })]],
  ];

  for (const [name, sets] of battery) {
    it(`全中文：${name}`, async () => {
      const r = await validateTeam("gen9championsvgc2026regmc", sets);
      expect(r.ok).toBe(false);
      expect(r.errors.length).toBeGreaterThan(0);
      for (const e of r.errors) {
        expect(e.replace(ALLOW, ""), `英文泄漏：${e}`).not.toMatch(/[A-Za-z]{4,}/);
      }
    });
  }

  it("昵称与物种不符的提示映射（用户报样例）", () => {
    const out = translateValidatorError(
      "雷丘 (大剑鬼) must not be nicknamed a different Pokémon species than what it actually is",
    );
    expect(out).toContain("雷丘");
    expect(out).toContain("大剑鬼");
    expect(out).toContain("昵称与实际种名不符");
    expect(out).not.toMatch(/must not be nicknamed/);
  });
});
