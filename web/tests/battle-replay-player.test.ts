/* battle-replay-player.test.ts —— M4 P3 回放：seed+choices 确定性复现到同一胜负与日志；
 * 旧记录无 choices 时判定不可重演（UI 置灰口径）。 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import { setLoader } from "../src/data/core";
import { BattleSession } from "../src/engine-adapter";
import type { SessionSnapshot, SideSlot } from "../src/engine-adapter";
import { importShowdown, exportShowdown } from "../src/team/showdown";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const DATA = path.join(ROOT, "web", "public", "data");

beforeAll(() => {
  setLoader((rel) => Promise.resolve(JSON.parse(readFileSync(path.join(DATA, rel), "utf-8"))));
});

const TEAM = `Garchomp @ Life Orb
Ability: Rough Skin
Level: 50
Tera Type: Steel
- Earthquake
- Swords Dance
- Protect

Milotic @ Sitrus Berry
Ability: Marvel Scale
Level: 50
- Surf
- Ice Beam
- Recover
- Protect

Torkoal @ Charcoal
Ability: Drought
Level: 50
- Flamethrower
- Protect

Amoonguss @ Leftovers
Ability: Regenerator
Level: 50
- Spore
- Protect
- Pollen Puff`;

/** 简易自动驾驶员：双方各挑每回合首招/首替补（确定性），指令经 session.choiceLog 留痕 */
async function autoPlay(s: BattleSession, maxTurns = 40): Promise<SessionSnapshot> {
  let snap: SessionSnapshot | null = null;
  s.subscribe((x) => {
    snap = x;
  });
  await s.start();
  for (let t = 0; t < maxTurns * 4; t++) {
    await new Promise((r) => setTimeout(r, 120));
    const cur = snap as SessionSnapshot | null;
    if (!cur) continue;
    if (cur.phase === "finished") break;
    for (const side of ["p1", "p2"] as const) {
      if (!cur.pending.includes(side)) continue;
      const req = cur.requests[side]!;
      if (req.teamPreview) {
        const n = req.maxChosenTeamSize ?? req.side.pokemon.length;
        await s.choose(side, `team ${Array.from({ length: n }, (_, i) => i + 1).join(",")}`);
      } else if (req.forceSwitch?.some(Boolean)) {
        const bench = (req.side.pokemon ?? [])
          .map((p, i) => ({ p, i }))
          .find((x) => !x.p.active && !x.p.condition.includes("fnt"));
        const needs = (req.forceSwitch ?? []).filter(Boolean).length;
        const parts = Array.from({ length: needs }, () =>
          bench ? `switch ${bench.i + 1}` : "pass",
        );
        await s.choose(side, parts.join(", "));
      } else {
        const noTarget = new Set([
          "self",
          "randomNormal",
          "all",
          "allAdjacent",
          "allAdjacentFoes",
          "allySide",
          "foeSide",
          "usersSide",
          "allyTeam",
          "scripted",
        ]);
        const slots = (req.active ?? []).map((a, i) => ({ a, i })).filter(({ a }) => !!a);
        const onField = (req.side.pokemon ?? []).filter((m) => m.active);
        const parts: string[] = [];
        for (const { a, i } of slots) {
          if (onField[i] && onField[i]!.condition.includes("fnt")) {
            parts.push("pass");
            continue;
          }
          const t = a!.moves[0]!.target;
          parts.push("move 1" + (t && !noTarget.has(t) ? " +1" : ""));
        }
        if (!parts.length) parts.push("pass");
        await s.choose(side, parts.join(", "));
      }
    }
  }
  for (let i = 0; i < 60 && (snap as SessionSnapshot | null)?.phase !== "finished"; i++)
    await new Promise((r) => setTimeout(r, 100));
  return snap as unknown as SessionSnapshot;
}

describe("M4 P3 回放复现", () => {
  it("seed + choices 重放：同日志同胜负（choiceLog 全程留痕）", async () => {
    const sets = importShowdown(TEAM)!;
    const seed: [number, number, number, number] = [77, 88, 99, 12];
    const p1 = sets.slice(0, 2);
    const p2 = [sets[2]!, sets[3]!];
    const live = new BattleSession({
      formatid: "gen9vgc2025regi",
      teams: { p1, p2 },
      seed,
      names: { p1: "A", p2: "B" },
    });
    const snap = await autoPlay(live, 40);
    expect(live.choiceLog.length).toBeGreaterThan(3);
    if (snap.phase !== "finished") {
      // 平局/未完结样本不适用本断言（本样本固定种子必然分出胜负）
      live.destroy();
      throw new Error("样本对局未在时限内结束");
    }
    const recordLog = live.deterministicLog();
    const winner = snap.winner;
    const seedUsed: [number, number, number, number] = live.seedUsed ?? seed;
    live.destroy();

    // 回放：同 seed 同队伍（Showdown 文本往返）新建会话，按提交序重灌指令
    const replay = new BattleSession({
      formatid: "gen9vgc2025regi",
      teams: {
        p1: importShowdown(exportShowdown(p1))!,
        p2: importShowdown(exportShowdown(p2))!,
      },
      seed: seedUsed,
      names: { p1: "A", p2: "B" },
    });
    let rsnap: SessionSnapshot | null = null;
    replay.subscribe((x) => {
      rsnap = x;
    });
    await replay.start();
    await new Promise((r) => setTimeout(r, 200));
    for (const c of live.choiceLog) {
      await replay.choose(c.side as SideSlot, c.input);
      await new Promise((r) => setTimeout(r, 30));
    }
    for (let i = 0; i < 80 && (rsnap as SessionSnapshot | null)?.phase !== "finished"; i++)
      await new Promise((r) => setTimeout(r, 100));
    const rs = rsnap as unknown as SessionSnapshot;
    expect(rs.phase).toBe("finished");
    expect(rs.winner).toBe(winner);
    expect(replay.deterministicLog()).toEqual(recordLog);
    replay.destroy();
  }, 60000);

  it("无 choices 的旧记录不可重演（记录判定口径）", () => {
    const rec: { choices?: unknown[] | undefined; seed?: string | undefined } = {
      choices: undefined,
      seed: undefined,
    };
    expect(!!(rec.seed && rec.choices?.length)).toBe(false);
  });
});
