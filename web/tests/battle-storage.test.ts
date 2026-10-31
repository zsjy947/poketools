/* battle-storage.test.ts —— RM-23：旧格式对局记录（2026-10-30 前录制，p1Team 为整队文本）
 * 读取时直接剪枝丢弃。 */
import { describe, expect, it } from "vitest";
import { BATTLE_SUBSET_EPOCH, pruneLegacyRecords } from "../src/battle/storage";
import type { StoredBattleRecord } from "../src/battle/storage";

function rec(playedAt: number, id = `r-${playedAt}`): StoredBattleRecord {
  return {
    id,
    formatid: "gen9championsvgc2026regmc",
    playedAt,
    winner: "阵营 A",
    p1Name: "阵营 A",
    p2Name: "阵营 B",
    p1Team: "Typhlosion-Hisui @ Choice Scarf ...",
    p2Team: "...",
    turns: 5,
    log: ["|win|p1"],
    choices: [{ side: "p1", input: "team 1,2,3,4", turn: 0 }],
  };
}

describe("旧格式对局记录剪枝（RM-23）", () => {
  it("换代分界为 2026-10-30 零点", () => {
    expect(BATTLE_SUBSET_EPOCH).toBe(new Date("2026-10-30T00:00:00").getTime());
  });

  it("2026-10-30 前的记录整条丢弃，其余保留", () => {
    const old1 = rec(new Date("2026-10-17T22:52:27").getTime());
    const old2 = rec(new Date("2026-10-29T23:59:59").getTime());
    const new1 = rec(new Date("2026-10-30T02:32:58").getTime());
    const new2 = rec(new Date("2026-10-31T12:00:00").getTime());
    const out = pruneLegacyRecords([old1, new1, old2, new2]);
    expect(out.map((r) => r.playedAt)).toEqual([new1.playedAt, new2.playedAt]);
  });

  it("边界值：恰好等于分界的新格式记录保留", () => {
    const edge = rec(BATTLE_SUBSET_EPOCH);
    expect(pruneLegacyRecords([edge])).toHaveLength(1);
  });
});
