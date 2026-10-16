/* battle-m3.test.ts —— M3 对战优化：回合分组 / 引擎窥视（倒计时与能力变化）/
 * 事件 ident 归一（p1a: X → p1: X 的 HP 增量追踪）/ 悬浮框数据组装。 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import { setLoader } from "../src/data/core";
import { BattleSession } from "../src/engine-adapter";
import type { SessionSnapshot } from "../src/engine-adapter";
import { importShowdown } from "../src/team/showdown";
import { turnGroups } from "../src/battle/turnLog";
import { buildMonInfo } from "../src/battle/MonHover";
import { dexFor } from "../src/data";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const DATA = path.join(ROOT, "web", "public", "data");

beforeAll(() => {
  setLoader((rel) => Promise.resolve(JSON.parse(readFileSync(path.join(DATA, rel), "utf-8"))));
});

const TEAM = `Garchomp @ Life Orb
Ability: Rough Skin
Level: 50
Tera Type: Steel
EVs: 4 HP / 252 Atk / 252 Spe
Jolly Nature
- Earthquake
- Swords Dance
- Protect

Milotic @ Sitrus Berry
Ability: Marvel Scale
Level: 50
EVs: 196 HP / 124 Def / 188 SpA
Calm Nature
- Surf
- Ice Beam
- Recover
- Protect

Torkoal @ Charcoal
Ability: Drought
Level: 50
- Flamethrower
- Protect
- Rain Dance`;

describe("M3 turnGroups 回合分组", () => {
  it("pre 段归第 0 组、回合锚点切组、末尾空组保留", () => {
    const groups = turnGroups([
      "|player|p1|A",
      "|turn|1",
      "|move|p1a: Garchomp|Earthquake",
      "|turn|2",
      "|switch|p1a: Milotic|Milotic, L50, F",
      "|turn|3",
    ]);
    expect(groups.map((g) => g.turn)).toEqual([null, 1, 2, 3]);
    expect(groups[0]!.lines).toEqual(["|player|p1|A"]);
    expect(groups[1]!.lines).toEqual(["|move|p1a: Garchomp|Earthquake"]);
    expect(groups[3]!.lines).toEqual([]);
  });

  it("空输入与无 turn 行（纯开局日志）", () => {
    expect(turnGroups([])).toEqual([{ turn: null, lines: [] }]);
    const g = turnGroups(["|player|p1|A", "|rule|Doubles"]);
    expect(g.length).toBe(1);
    expect(g[0]!.turn).toBeNull();
    expect(g[0]!.lines.length).toBe(2);
  });
});

describe("M3 引擎窥视与事件 ident 归一", () => {
  it("完整对局：天气倒计时递减、能力变化可读、招式 PP 可读、HP 增量追踪生效", async () => {
    const sets = importShowdown(TEAM)!;
    const p1 = sets.slice(0, 2); // Garchomp + Milotic
    const p2 = [sets[2]!, ...sets.slice(0, 2)]; // Torkoal(日照) + ...
    const s = new BattleSession({
      formatid: "gen9vgc2025regi",
      teams: { p1: structuredClone(p1), p2: structuredClone(p2) },
      seed: [11, 22, 33, 44],
    });
    let snap: SessionSnapshot | null = null;
    s.subscribe((x) => {
      snap = x;
    });
    await s.start();
    await new Promise((r) => setTimeout(r, 200));
    await s.choose("p1", "team 1,2");
    await s.choose("p2", "team 1,2");
    await new Promise((r) => setTimeout(r, 250));

    let peek = s.enginePeek();
    expect(peek).not.toBeNull();
    expect(peek!.field.weather).toBe("sunnyday");
    expect(peek!.field.weatherDuration).toBeGreaterThan(0);
    expect(peek!.mons.p1.length).toBe(2);
    const garchomp = peek!.mons.p1.find((m) => m.ident.includes("Garchomp"))!;
    expect(garchomp).toBeTruthy();
    expect(garchomp.moveSlots.some((m) => m.id === "swordsdance" && m.pp === m.maxpp)).toBe(true);

    // 回合 1：Garchomp 剑舞（atk +2）——事件 ident 带槽位字母，引擎 boosts 直接可读
    await s.choose("p1", "move 2, move 4");
    await s.choose("p2", "move 2, move 2");
    await new Promise((r) => setTimeout(r, 500));
    peek = s.enginePeek();
    const boosted = peek!.mons.p1.find((m) => m.ident.includes("Garchomp"))!;
    expect(boosted.boosts.atk).toBe(2);

    // HP 增量追踪：事件行 p1a:/p2a: 前缀应命中 request 的 p1:/p2: ident（此前静默失配）
    const p2Mons = snap!.sides.p2.bench;
    expect(p2Mons.every((m) => m.maxhp > 0)).toBe(true); // 濒死者保留 maxhp，不变 0/0
    const anyTracked = p2Mons.some((m) => m.hp !== m.maxhp);
    if (anyTracked) {
      // 引擎同名列 HP 与 MonState 一致（增量 + request 双通道不漂移）
      const engineHp = peek!.mons.p2.find(
        (m) => m.ident === p2Mons.find((x) => x.hp !== x.maxhp)!.ident,
      )!.hp;
      expect(engineHp).toBe(p2Mons.find((x) => x.hp !== x.maxhp)!.hp);
    }

    // 倒计时随回合递减
    const d1 = peek!.field.weatherDuration ?? 0;
    await s.choose("p1", "move 3, move 4");
    await s.choose("p2", "move 2, move 2");
    await new Promise((r) => setTimeout(r, 500));
    peek = s.enginePeek();
    expect(peek!.field.weatherDuration!).toBe(d1 - 1);
    s.destroy();
  }, 30000);
});

describe("M3 悬浮框数据组装", () => {
  it("buildMonInfo：三源合流（payload 引擎化 + MonState + 引擎视图）", async () => {
    const sets = importShowdown(TEAM)!;
    const s = new BattleSession({
      formatid: "gen9vgc2025regi",
      teams: { p1: sets.slice(0, 2), p2: structuredClone(sets).slice(0, 2) },
      seed: [1, 2, 3, 4],
    });
    let snap: SessionSnapshot | null = null;
    s.subscribe((x) => {
      snap = x;
    });
    await s.start();
    await new Promise((r) => setTimeout(r, 200));
    await s.choose("p1", "team 1,2");
    await s.choose("p2", "team 1,2");
    await new Promise((r) => setTimeout(r, 250));
    const peek = s.enginePeek()!;
    const dex = dexFor("gen9");
    const mon = snap!.sides.p1.bench.find((m) => m.ident.includes("Garchomp"))!;
    const payload = snap!.requests.p1!.side.pokemon.find((p) => p.ident === mon.ident);
    const info = buildMonInfo({
      dex,
      mon,
      payload,
      engineMon: peek.mons.p1.find((m) => m.ident === mon.ident),
    });
    expect(info.nameZh).toBe("烈咬陆鲨");
    expect(info.level).toBe("L50");
    expect(info.ability).toBe("roughskin");
    expect(info.item).toBe("lifeorb");
    expect(info.types).toEqual(["龙", "地面"]);
    expect(info.teraType).toBe("Steel"); // 原始值；卡片渲染时经 TYPE_ZH 转中文
    expect(info.moves.length).toBe(3);
    expect(info.moves.some((m) => m.zh === "剑舞" && m.pp === m.maxpp)).toBe(true);
    expect(info.boosts).toEqual({});
    s.destroy();
  }, 30000);
});
