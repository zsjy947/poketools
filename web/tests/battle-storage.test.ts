/* battle-storage.test.ts —— RM-23：旧格式对局记录（2026-10-30 前录制，p1Team 为整队文本）
 * 读取时直接剪枝丢弃；F-03：剪枝为一次性迁移（标志置位后不再剪，时钟回拨不丢新记录）；
 * F-04：存储失败显性化（writeJson 返回 false）与队伍库满库淘汰可见。 */
import { beforeEach, describe, expect, it } from "vitest";
import { BATTLE_SUBSET_EPOCH, pruneLegacyRecords, storage } from "../src/battle/storage";
import type { StoredBattleRecord, StoredTeamEntry } from "../src/battle/storage";

// Node 环境 localStorage mock（键值与浏览器一致；quotaExceeded=true 时 setItem 抛配额异常）
const mem = new Map<string, string>();
let quotaExceeded = false;
(globalThis as any).localStorage = {
  getItem: (k: string) => (mem.has(k) ? mem.get(k)! : null),
  setItem: (k: string, v: string) => {
    if (quotaExceeded) {
      const e = new Error("mock quota exceeded");
      (e as { name?: string }).name = "QuotaExceededError";
      throw e;
    }
    mem.set(k, String(v));
  },
  removeItem: (k: string) => void mem.delete(k),
};
beforeEach(() => {
  mem.clear();
  quotaExceeded = false;
});

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

describe("一次性剪枝迁移标志（F-03）", () => {
  it("首次加载剪除旧格式并回写标志；二次加载不再剪", () => {
    const legacy = rec(new Date("2026-10-20T00:00:00").getTime(), "r-legacy");
    const fresh = rec(new Date("2026-10-31T00:00:00").getTime(), "r-fresh");
    mem.set("psb.records.v1", JSON.stringify([fresh, legacy]));
    const out1 = storage.loadRecords();
    expect(out1.map((r) => r.id)).toEqual(["r-fresh"]); // 首次：旧格式整条剪除
    expect(mem.get("psb.recordsPruned.v1")).toBe("true"); // 迁移标志已置
    const persisted = JSON.parse(mem.get("psb.records.v1")!) as StoredBattleRecord[];
    expect(persisted.map((r) => r.id)).toEqual(["r-fresh"]); // 剪后回写
    // 二次加载：再次出现 at < EPOCH 的记录不再被剪（标志已置）
    mem.set("psb.records.v1", JSON.stringify([fresh, legacy]));
    expect(storage.loadRecords().map((r) => r.id)).toEqual(["r-fresh", "r-legacy"]);
  });

  it("标志已置后：at < EPOCH 的新记录在读取/写入两侧都不丢（时钟回拨保护）", () => {
    mem.set("psb.recordsPruned.v1", "true");
    const backdated = rec(new Date("2026-10-01T00:00:00").getTime(), "r-back");
    mem.set("psb.records.v1", JSON.stringify([backdated]));
    expect(storage.loadRecords().map((r) => r.id)).toEqual(["r-back"]); // 读侧不剪
    storage.saveRecords([backdated]); // 写侧不剪
    const persisted = JSON.parse(mem.get("psb.records.v1")!) as StoredBattleRecord[];
    expect(persisted).toHaveLength(1);
    expect(persisted[0]!.id).toBe("r-back");
  });

  it("未迁移前写侧（saveRecords/deleteRecord）同样执行一次迁移", () => {
    const legacy = rec(new Date("2026-10-20T00:00:00").getTime(), "r-legacy");
    const next = storage.saveRecords([legacy]);
    expect(next).toHaveLength(0); // 首次写：旧格式被剪
    expect(mem.get("psb.recordsPruned.v1")).toBe("true");
  });
});

describe("存储失败显性化与队伍库淘汰（F-04）", () => {
  it("setItem 抛 QuotaExceeded：saveTeams/saveSettings 返回 false，localStorage 内容不变", () => {
    mem.set("psb.teams.v1", "旧值");
    quotaExceeded = true;
    expect(storage.saveTeams({ A: 1 })).toBe(false);
    expect(
      storage.saveSettings({
        animation: true,
        animationSpeed: 420,
        spriteDexSize: false,
        timers: false,
      }),
    ).toBe(false);
    quotaExceeded = false;
    expect(mem.get("psb.teams.v1")).toBe("旧值"); // 未被破坏
    expect(mem.has("psb.settings.v1")).toBe(false);
  });

  it("addToLibrary 满库淘汰：返回被淘汰条目，list 维持 30 套且新档在首位", () => {
    const seed: StoredTeamEntry[] = Array.from({ length: 30 }, (_, i) => ({
      id: `lib-${i}`,
      name: `队伍${i}`,
      savedAt: i,
      sets: [],
    }));
    mem.set("psb.teamLibrary.v1", JSON.stringify(seed));
    const r = storage.addToLibrary("新队伍", []);
    expect(r.saved).toBe(true);
    expect(r.list).toHaveLength(30);
    expect(r.list[0]!.name).toBe("新队伍");
    expect(r.evicted.map((e) => e.name)).toEqual(["队伍29"]); // 最旧存档被淘汰且显性可见
    const persisted = JSON.parse(mem.get("psb.teamLibrary.v1")!) as StoredTeamEntry[];
    expect(persisted).toHaveLength(30); // 已持久化
  });

  it("addToLibrary 配额失败：saved=false，内存态返回但未持久化", () => {
    quotaExceeded = true;
    const r = storage.addToLibrary("孤儿档", []);
    expect(r.saved).toBe(false);
    expect(r.list[0]!.name).toBe("孤儿档"); // 内存态仍给出（调用方负责 toast）
    quotaExceeded = false;
    expect(mem.has("psb.teamLibrary.v1")).toBe(false); // 未写入
  });
});
