/* battle-anim-queue.test.ts —— M4 P2 演出队列：位移风格分化 / 伤害飘字差量与着色 /
 * 金标准回放整局驱动无错位（步骤序 = 事件序、数值非负、ident 全可归一）。 */
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseLogLine } from "../src/engine-adapter";
import { linesToSteps, eventsToSteps, normAnimIdent } from "../src/battle/anim";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

describe("M4 P2 位移风格分化", () => {
  const cat = {
    Earthquake: "physical",
    Surf: "special",
    Spore: "status",
  } as Record<string, "physical" | "special" | "status">;

  it("物理=突进 / 特殊=蓄能 / 变化=低幅起手", () => {
    const mk = (mv: string) =>
      linesToSteps([`|move|p1a: Attacker|${mv}|p2a: Target`], 1, {
        categoryOf: (n) => cat[n],
      })[0]!;
    expect(mk("Earthquake").style).toBe("lunge");
    expect(mk("Surf").style).toBe("cast");
    expect(mk("Spore").style).toBe("chant");
  });

  it("未知类别回落物理突进；无目标招式不产受击步骤", () => {
    const steps = linesToSteps([`|move|p1a: A|Unknown Move`], 1);
    expect(steps).toHaveLength(1);
    expect(steps[0]!.style).toBe("lunge");
  });
});

describe("M4 P2 伤害飘字", () => {
  it("HP 段差量：首击靠 initialHp 种子，后续逐次差量；濒死全额", () => {
    const steps = eventsToSteps(
      [
        parseLogLine("|-damage|p1a: Garchomp|150/193"),
        parseLogLine("|-damage|p1a: Garchomp|82/193"),
        parseLogLine("|-heal|p1a: Garchomp|120/193"),
        parseLogLine("|-damage|p1a: Garchomp|0 fnt"),
      ],
      1,
      { initialHp: { "p1: Garchomp": [193, 193] } },
    );
    const pops = steps.map((s) => s.popup?.text);
    expect(pops).toEqual(["-43", "-68", "+38", "-120"]);
    expect(steps[3]!.popup!.tone).toBe("dmg");
  });

  it("switch HP 段播种（replay 百分比口径）：无 initialHp 也能算差量", () => {
    const steps = linesToSteps([
      "|switch|p1a: Amoonguss|Amoonguss, L50, F|100/100",
      "|-damage|p1a: Amoonguss|67/100",
      "|-damage|p1a: Amoonguss|0 fnt",
    ]);
    expect(steps.map((s) => s.popup?.text)).toEqual([undefined, "-33", "-67"]);
  });

  it("要害/效果着色后置关联：-crit/-supereffective/-resisted 修正最近飘字；免疫独立飘字", () => {
    const steps = linesToSteps([
      "|switch|p2a: Foe|Milotic, L50|100/100",
      "|-damage|p2a: Foe|40/100",
      "|-crit|p2a: Foe",
      "|-damage|p2a: Foe|20/100",
      "|-supereffective|p2a: Foe",
      "|-damage|p2a: Foe|10/100",
      "|-resisted|p2a: Foe",
      "|-immune|p1a: Ally",
    ]);
    const dmg = steps.filter((s) => s.popup);
    expect(dmg.map((s) => [s.popup!.text, s.popup!.tone])).toEqual([
      ["-60", "crit"],
      ["-20", "super"],
      ["-10", "resisted"],
      ["没有效果", "immune"],
    ]);
  });
});

describe("M4 P2 金标准回放整局驱动", () => {
  const replayDir = join(ROOT, "tests", "replays");

  it("9 份官方日志：步骤序即事件序，差量全部非负有限，ident 全部可归一", () => {
    const files = readdirSync(replayDir).filter((x) => x.endsWith(".log"));
    expect(files.length).toBeGreaterThanOrEqual(9);
    let popupCount = 0;
    for (const f of files) {
      const lines = readFileSync(join(replayDir, f), "utf8").split("\n");
      const steps = linesToSteps(lines, 1);
      for (const s of steps) {
        expect(Number.isFinite(s.durMs) && s.durMs > 0, `${f} ${s.kind}`).toBe(true);
        expect(s.ident, `${f} ident`).toMatch(/^p[12][ab]?: /);
        expect(normAnimIdent(s.ident)).toMatch(/^p[12]: /);
        if (s.popup) {
          popupCount += 1;
          expect(
            s.popup.tone in { dmg: 1, heal: 1, crit: 1, super: 1, resisted: 1, immune: 1 },
          ).toBe(true);
        }
      }
    }
    // 样本应产出可观数量的飘字（replay 语料 -damage/-heal 行数百条）
    expect(popupCount).toBeGreaterThan(50);
  });
});
