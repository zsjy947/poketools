/* replay-feed.test.ts —— 回放指令推进控制器：单调前进 / 并发目标合流 / 世代失效。 */
import { describe, expect, it } from "vitest";
import { ReplayFeedController } from "../src/battle/replay-feed";
import type { FeedChoice, FeedSession } from "../src/battle/replay-feed";

function mkChoices(spec: Array<[string, "p1" | "p2", number]>): FeedChoice[] {
  return spec.map(([input, side, turn]) => ({ side, input, turn }));
}

function fakeSession(log: string[], delay = 0): FeedSession {
  return {
    async choose(side, input) {
      if (delay) await new Promise((r) => setTimeout(r, delay));
      log.push(`${side}:${input}`);
    },
  };
}

const tick = () => new Promise((r) => setTimeout(r, 0));

describe("ReplayFeedController", () => {
  it("单调前进：按回合消费且不重复", async () => {
    const ctl = new ReplayFeedController();
    const log: string[] = [];
    const s = fakeSession(log);
    const choices = mkChoices([
      ["team 1,2", "p1", 0],
      ["team 1,2", "p2", 0],
      ["move 1", "p1", 1],
      ["move 1", "p2", 1],
      ["move 2", "p1", 2],
      ["move 2", "p2", 2],
    ]);
    const e = ctl.epochNow;
    await ctl.feed(s, choices, 1, e);
    expect(ctl.consumed).toBe(4);
    await ctl.feed(s, choices, 2, e);
    expect(ctl.consumed).toBe(6);
    expect(log).toHaveLength(6);
  });

  it("并发推进目标合流：每条指令恰好消费一次", async () => {
    const ctl = new ReplayFeedController();
    const log: string[] = [];
    const s = fakeSession(log, 10);
    const choices = mkChoices([
      ["a", "p1", 0],
      ["b", "p2", 0],
      ["c", "p1", 1],
      ["d", "p2", 1],
      ["e", "p1", 2],
      ["f", "p2", 2],
    ]);
    const e = ctl.epochNow;
    const slow = ctl.feed(s, choices, 1, e); // 在途慢速推进
    const merge = ctl.feed(s, choices, 3, e); // 快速再点：目标合流（无 turn 3 → 全量）
    await Promise.all([slow, merge]);
    expect(ctl.consumed).toBe(6);
    expect(log).toHaveLength(6);
  });

  it("换代失效：reset 后旧世代在途循环退出且不触碰新游标", async () => {
    const ctl = new ReplayFeedController();
    const gate = { resolve: null as null | (() => void) };
    const s: FeedSession = {
      choose: () =>
        new Promise<void>((res) => {
          gate.resolve = res;
        }),
    };
    const choices = mkChoices([
      ["a", "p1", 0],
      ["b", "p2", 0],
      ["c", "p1", 1],
    ]);
    const e0 = ctl.epochNow;
    const inFlight = ctl.feed(s, choices, 1, e0);
    await tick();
    // 放行第 1 条指令（游标应推进到 1），随后立即换代重建
    gate.resolve!();
    gate.resolve = null;
    await tick();
    const e1 = ctl.reset();
    expect(e1).toBe(e0 + 1);
    expect(ctl.consumed).toBe(0); // 游标已随重建清零
    // 旧循环挂在第 2 个 choose 上：放行后应在 await 边界发现世代不符并退出
    const secondGate = gate.resolve as (() => void) | null;
    expect(secondGate).toBeTruthy();
    secondGate!();
    await inFlight;
    expect(ctl.consumed).toBe(0); // 旧循环不再推进共享游标
    // 新世代从 0 正常前进
    const log: string[] = [];
    const s2 = fakeSession(log);
    await ctl.feed(s2, choices, 0, e1);
    expect(ctl.consumed).toBe(2);
    expect(log).toEqual(["p1:a", "p2:b"]);
  });

  it("旧世代的迟到 feed 直接作废", async () => {
    const ctl = new ReplayFeedController();
    const log: string[] = [];
    const s = fakeSession(log);
    const choices = mkChoices([["a", "p1", 0]]);
    const e0 = ctl.epochNow;
    const e1 = ctl.reset();
    await ctl.feed(s, choices, 0, e0); // 迟到调用：世代不符
    expect(ctl.consumed).toBe(0);
    expect(log).toEqual([]);
    await ctl.feed(s, choices, 0, e1);
    expect(ctl.consumed).toBe(1);
  });
});
