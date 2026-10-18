/* battle-log-prose.test.ts —— Showdown 式整合日志：伤害句合并（%/剩余/要害/效果/连击）、
 * miss 并入出招、HP 百分比跨行追踪、未覆盖事件回落单行渲染。 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import { setLoader } from "../src/data/core";
import { proseTurns, lastLogText } from "../src/battle/turnLog";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const DATA = path.join(ROOT, "web", "public", "data");

beforeAll(() => {
  setLoader((rel) => Promise.resolve(JSON.parse(readFileSync(path.join(DATA, rel), "utf-8"))));
});

/** 展平全部行（跨回合），便于断言语序与合并结果 */
function flat(lines: string[]): Array<{ turn: number | null; text: string; cls: string }> {
  const out: Array<{ turn: number | null; text: string; cls: string }> = [];
  for (const t of proseTurns(lines)) for (const l of t.lines) out.push({ turn: t.turn, ...l });
  return out;
}

describe("Showdown 式整合日志", () => {
  it("伤害句合并：出招句 + 损失%/剩余%（要害与效果并入句尾括注）", () => {
    const out = flat([
      "|switch|p2a: Testmon|Testmon, L50|100/100",
      "|move|p1a: Attacker|Earthquake|p2a: Testmon",
      "|-damage|p2a: Testmon|60/100",
      "|-crit|p2a: Testmon",
      "|-supereffective|p2a: Testmon",
    ]);
    expect(out.map((l) => l.text)).toEqual([
      "B·Testmon 上场了！",
      "A·Attacker 使用了 地震！",
      "B·Testmon 损失了 40% 的 HP（剩余 60%）（击中要害，效果绝佳）",
    ]);
    expect(out[2]!.cls).toBe("-supereffective");
  });

  it("HP 百分比跨行追踪：连续伤害各算各的差量", () => {
    const out = flat([
      "|switch|p2a: Testmon|Testmon, L50|100/100",
      "|-damage|p2a: Testmon|60/100",
      "|-damage|p2a: Testmon|30/100",
      "|-heal|p2a: Testmon|55/100",
    ]);
    expect(out.slice(1).map((l) => l.text)).toEqual([
      "B·Testmon 损失了 40% 的 HP（剩余 60%）",
      "B·Testmon 损失了 30% 的 HP（剩余 30%）",
      "B·Testmon 回复了 25% 的 HP（剩余 55%）",
    ]);
  });

  it("多段攻击：-hits 次数并入伤害句", () => {
    const out = flat([
      "|switch|p2a: Testmon|Testmon, L50|100/100",
      "|move|p1a: Attacker|Double Slap|p2a: Testmon",
      "|-damage|p2a: Testmon|80/100",
      "|-hits|p2a: Testmon|5",
    ]);
    expect(out[2]!.text).toBe("B·Testmon 损失了 20% 的 HP（剩余 80%）（连续命中 5 次）");
  });

  it("落空并入出招：move 后的 -miss 不单独成行", () => {
    const out = flat([
      "|move|p1a: Attacker|Hydro Pump|p2a: Testmon",
      "|-miss|p1a: Attacker|p2a: Testmon",
    ]);
    expect(out.map((l) => l.text)).toEqual(["A·Attacker 使用了 水炮！", "B·Testmon 避开了攻击！"]);
  });

  it("回合分组保留：|turn| 锚点切组，未覆盖事件回落单行渲染", () => {
    const out = flat(["|turn|2", "|-weather|RainDance|[upkeep]", "|faint|p2a: Testmon"]);
    expect(out.map((l) => l.turn)).toEqual([2, 2]);
    expect(out[1]!.text).toContain("Testmon");
    expect(out[1]!.text).toContain("倒下");
  });

  it("未知首段（无 switch 播种）也能给出剩余百分比", () => {
    const out = flat(["|-damage|p2a: Testmon|70/100"]);
    expect(out[0]!.text).toBe("B·Testmon 受到了伤害（剩余 70%）");
  });

  it("服务器 UI 注入行（uhtml/otsrequest 按钮）不进日志与 ticker", () => {
    const startup = [
      "|tier|[Gen 9] VGC 2025 Reg I",
      "|rule|Item Clause: Limit 1 of each item",
      "|teampreview|4",
      '|uhtml|otsrequest|<button name="send" value="/acceptopenteamsheets"><strong>Accept Open Team Sheets</strong></button>',
      "|uhtmlchange|otsrequest|",
    ];
    // 整合视图：uhtml/uhtmlchange 整行丢弃，回退渲染也不落 HTML 文本
    const out = flat(startup);
    expect(out.some((l) => l.text.includes("<button"))).toBe(false);
    expect(out.map((l) => l.text)).toEqual(["规则：Item Clause: Limit 1 of each item"]);
    // ticker（lastLogText）取最后一条可渲染行而非 otsrequest HTML
    expect(lastLogText(startup)).toBe("规则：Item Clause: Limit 1 of each item");
  });
});
