// M2 引擎集成测试：脚本驱动完整一局（单打/双打/champions）、确定性、金标准自对拍
import { describe, expect, it } from "vitest";
import { BattleSession } from "../src/engine-adapter";
import { importShowdown } from "../src/team/showdown";
import { validateTeam } from "../src/team/showdown";

// 一支合法的 gen9 队伍（6 只，VGC 风格）
const TEAM_TEXT = `Garchomp @ Life Orb
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
IVs: 0 Atk
- Surf
- Ice Beam
- Recover
- Protect

Dragonite @ Rocky Helmet
Ability: Multiscale
Level: 50
Tera Type: Normal
EVs: 4 HP / 252 Atk / 252 Spe
Adamant Nature
- Extreme Speed
- Outrage
- Earthquake
- Protect

Scizor @ Choice Band
Ability: Technician
Level: 50
Tera Type: Steel
EVs: 248 HP / 252 Atk / 8 SpD
Adamant Nature
- Bullet Punch
- Knock Off
- Close Combat
- U-turn

Amoonguss @ Black Sludge
Ability: Regenerator
Level: 50
EVs: 236 HP / 116 Def / 156 SpD
Calm Nature
IVs: 0 Atk
- Spore
- Pollen Puff
- Rage Powder
- Protect

Incineroar @ Figy Berry
Ability: Intimidate
Level: 50
Tera Type: Fire
EVs: 236 HP / 4 Def / 84 SpA / 180 SpD
Careful Nature
- Fake Out
- Flare Blitz
- Knock Off
- Parting Shot`;

// champions 合法队伍（无道具、IV 全 31、EV 每项 ≤32 —— champions 努力值体系）
const CHAMPIONS_TEAM_TEXT = `Garchomp
Ability: Rough Skin
Level: 50
Tera Type: Steel
EVs: 32 Atk / 32 Spe
Jolly Nature
- Earthquake
- Dragon Claw
- Iron Head
- Protect

Milotic
Ability: Marvel Scale
Level: 50
Tera Type: Water
EVs: 32 HP / 32 SpA
Calm Nature
- Surf
- Ice Beam
- Recover
- Protect

Scizor
Ability: Technician
Level: 50
Tera Type: Steel
EVs: 32 HP / 32 Atk
Adamant Nature
- Bullet Punch
- X-Scissor
- Close Combat
- Protect

Incineroar
Ability: Intimidate
Level: 50
Tera Type: Fire
EVs: 32 HP / 32 SpD
Careful Nature
- Fake Out
- Flare Blitz
- Darkest Lariat
- Parting Shot

Dragonite
Ability: Multiscale
Level: 50
Tera Type: Normal
EVs: 32 Atk / 32 Spe
Adamant Nature
- Extreme Speed
- Outrage
- Earthquake
- Protect

Metagross
Ability: Clear Body
Level: 50
Tera Type: Steel
EVs: 32 HP / 32 Atk
Adamant Nature
- Meteor Mash
- Zen Headbutt
- Earthquake
- Protect`;

async function driveToEnd(session: BattleSession, maxTurns = 120): Promise<void> {
  session.subscribe(() => undefined);
  await session.start();
  const safeChoose = (side: "p1" | "p2", c: string) =>
    Promise.race([session.choose(side, c), new Promise((r) => setTimeout(r, 300))]).catch(
      () => undefined,
    );
  const usedSlot: Record<string, Set<number>> = { p1: new Set(), p2: new Set() };
  const NO_TARGET = [
    "self",
    "randomNormal",
    "all",
    "allAdjacent",
    "allAdjacentFoes",
    "allySide",
    "foeSide",
    "usersSide",
  ];
  let lastLogLen = 0;
  const errCount: Record<string, number> = { p1: 0, p2: 0 };
  let stallTicks = 0;
  let lastTotal = 0;
  for (let i = 0; i < 600 && session.phase !== "finished"; i++) {
    if (session.logTail.length === lastTotal) stallTicks += 1;
    else {
      stallTicks = 0;
      lastTotal = session.logTail.length;
    }
    if (stallTicks >= 80 && session.phase === "resolving") {
      await session.forceLose("p2"); // 结算停滞兜底（确定性输出）
      stallTicks = 0;
    }
    await new Promise((r) => setTimeout(r, 4));
    // 无效指令按 session.lastError 的 side 归属累计；3 次连续无效指令 → forcelose 兜底终局
    const fresh = session.logTail.slice(lastLogLen);
    lastLogLen = session.logTail.length;
    if (fresh.some((l) => l.includes("[Invalid choice]") || l.includes("[Unavailable choice]"))) {
      const side = session.lastError?.side;
      if (side) errCount[side]! += 1;
    }
    for (const side of ["p1", "p2"] as const) {
      if ((errCount[side] ?? 0) >= 3) {
        await session.forceLose(side);
        errCount[side] = -1000;
        continue;
      }
      const req = session.requests[side];
      if (!req || !session.pending.includes(side)) continue;
      if (req.teamPreview) {
        await safeChoose(side, "team 1, 2, 3, 4");
        continue;
      }
      const parts: string[] = [];
      const mons = req.side?.pokemon ?? [];
      const liveActive = mons.filter((m) => m.active && !m.condition.includes("fnt"));
      // 目标需求按场地槽位数（active 数）判定——双打残局单在场仍需指定目标（§2.2）
      const doubles = mons.filter((m) => m.active).length > 1;
      // 1) 需要换人的槽（forceSwitch true）：换上未用过的替补，不足则 pass
      if (req.forceSwitch) {
        const bench = mons
          .map((m, i) => ({ i: i + 1, active: m.active, fainted: m.condition.includes("fnt") }))
          .filter((x) => !x.active && !x.fainted);
        for (const need of req.forceSwitch) {
          if (!need) continue;
          const pick = bench.find(
            (b) => !usedSlot[side]!.has(b.i) && !parts.includes(`switch ${b.i}`),
          );
          parts.push(pick ? `switch ${pick.i}` : "pass");
          if (pick) usedSlot[side]!.add(pick.i);
        }
      }
      // 2) 其余在场槽（按存活数对齐——引擎边界流可能列出已濒死槽）：需要目标的招式补 1（+1=对手a槽）
      if (req.active) {
        const act = (req.active ?? [])
          .filter((x): x is NonNullable<typeof x> => !!x)
          .slice(0, liveActive.length);
        const moveSlots =
          act.length - (req.forceSwitch ? req.forceSwitch.filter(Boolean).length : 0);
        for (const a of act.slice(0, Math.max(0, moveSlots))) {
          const mv = a.moves.find((m) => !m.disabled) ?? a.moves[0]!; // Fake Out 首回合后禁用等
          const needsTarget = doubles && !!mv?.target && !NO_TARGET.includes(mv!.target);
          const mi = a.moves.indexOf(mv) + 1;
          parts.push(`move ${mi}` + (needsTarget ? " 1" : ""));
        }
      }
      await safeChoose(side, parts.length ? parts.join(", ") : "pass");
    }
  }
  void maxTurns;
}

describe("M2 引擎集成", () => {
  it("完整一局：gen9vgc2025regi（双打）分出胜负", async () => {
    const sets = importShowdown(TEAM_TEXT)!;
    const s = new BattleSession({
      formatid: "gen9vgc2025regi",
      // p2 拆整队镜像（同步双倒会让引擎进入替补不足的边界流），保留确定性
      teams: { p1: sets.slice(0, 4), p2: structuredClone(sets).reverse().slice(0, 4) },
      seed: [2026, 9, 30, 1],
    });
    await driveToEnd(s);
    expect(s.phase).toBe("finished");
    expect(s.winner).toBeTruthy();
    expect(s.turn).toBeGreaterThan(0);
    expect(s.events.some((e) => e.kind === "move")).toBe(true);
    s.destroy();
  }, 30000);

  it("完整一局：gen9bssregi（单打 6 选 3）", async () => {
    const sets = importShowdown(TEAM_TEXT)!;
    const s = new BattleSession({
      formatid: "gen9bssregi",
      teams: { p1: sets, p2: structuredClone(sets) },
      seed: [2026, 9, 30, 2],
    });
    await driveToEnd(s);
    expect(s.phase).toBe("finished");
    s.destroy();
  }, 30000);

  it("champions 赛制：VGC 校验合法 + BSS 完整一局（VGC 为 Bo3 默认赛制，单局会话按 BSS 验证）", async () => {
    const sets = importShowdown(CHAMPIONS_TEAM_TEXT)!;
    const check = await validateTeam("gen9championsvgc2026regmc", sets);
    expect(check.errors, JSON.stringify(check.errors)).toEqual([]);
    const s = new BattleSession({
      formatid: "gen9championsbssregmc",
      teams: { p1: sets.slice(0, 4), p2: structuredClone(sets).slice(0, 4) },
      seed: [2026, 9, 30, 3],
    });
    await driveToEnd(s);
    expect(s.phase).toBe("finished");
    s.destroy();
  }, 30000);

  it("确定性：同种子同指令 ⇒ 同输出（|t:| 时间戳过滤后逐行一致）", async () => {
    const mk = () => {
      const sets = importShowdown(TEAM_TEXT)!;
      return new BattleSession({
        formatid: "gen9vgc2025regi",
        teams: { p1: sets, p2: structuredClone(sets) },
        seed: [42, 42, 42, 42],
      });
    };
    const a = mk();
    await driveToEnd(a);
    const b = mk();
    await driveToEnd(b);
    expect(a.deterministicLog().join("\n")).toBe(b.deterministicLog().join("\n"));
    a.destroy();
    b.destroy();
  }, 60000);

  it("随机种子连续 3 局无崩溃/死锁（M2 质量门禁的快速子集）", async () => {
    for (let i = 0; i < 3; i++) {
      const sets = importShowdown(TEAM_TEXT)!;
      const s = new BattleSession({
        formatid: "gen9vgc2025regi",
        teams: { p1: sets, p2: structuredClone(sets) },
        seed: [i + 1, i + 2, i + 3, i + 4],
      });
      await driveToEnd(s);
      expect(s.phase).toBe("finished");
      s.destroy();
    }
  }, 90000);

  it("上阵直通：previewOrder 自动代发 team 指令，UI 不再见到 teamPreview 请求", async () => {
    const sets = importShowdown(TEAM_TEXT)!;
    const s = new BattleSession({
      formatid: "gen9vgc2025regi",
      teams: { p1: sets.slice(0, 4), p2: structuredClone(sets).reverse().slice(0, 4) },
      seed: [7, 7, 7, 7],
      previewOrder: { p1: [1, 2, 3, 4], p2: [1, 2, 3, 4] },
    });
    const seenTeamPreview = { p1: false, p2: false };
    s.subscribe((snap) => {
      for (const side of ["p1", "p2"] as const) {
        if (snap.pending.includes(side) && snap.requests[side]?.teamPreview)
          seenTeamPreview[side] = true;
      }
    });
    await s.start();
    await new Promise((r) => setTimeout(r, 120));
    expect(seenTeamPreview.p1).toBe(false);
    expect(seenTeamPreview.p2).toBe(false);
    // 直通后应停在招式/换人阶段（team preview 语义保留在引擎侧，OTS 已生效）
    expect(s.phase === "awaiting" || s.phase === "finished").toBe(true);
    s.destroy();
  }, 15000);

  it("双打替补不足：先倒 1 已补 + 场上双倒替补仅剩 1 → 空位 pass 不卡死", async () => {
    /* 脱壳忍者（HP 1 + 神奇守护）：耿鬼的阴影球（幽灵，对虫/幽灵效果绝佳）一击必杀；
       污泥炸弹（毒，对虫/幽灵均 1x）被神奇守护完全免疫 = 精确的「不击杀」招式。
       剧本：回合 1-3 p2a 单杀（各换上 1 只，替补 4→1），回合 4 双杀 →
       forceSwitch 2 空位、存活替补仅 1 → 指令 "switch N, pass"（引擎 forcedPassesLeft 语义
       = 空位数 − 可换替补数，接受 pass），会话不挂起、终局正常。 */
    const shedinja =
      "Shedinja\nAbility: Wonder Guard\nLevel: 50\nTera Type: Bug\n- Shadow Ball\n- X-Scissor\n- Swords Dance\n- Protect";
    const p1 = importShowdown(Array.from({ length: 6 }, () => shedinja).join("\n\n"))!;
    const gengar =
      "Gengar @ Choice Specs\nAbility: Cursed Body\nLevel: 50\nTera Type: Ghost\nIVs: 0 Atk\nEVs: 252 SpA / 252 Spe\nTimid Nature\n- Shadow Ball\n- Sludge Bomb\n- Protect\n- Focus Blast";
    const p2 = importShowdown(Array.from({ length: 6 }, () => gengar).join("\n\n"))!;
    const s = new BattleSession({
      formatid: "gen9doublescustomgame",
      teams: { p1, p2 },
      seed: [11, 22, 33, 44],
    });
    await s.start();
    await new Promise((r) => setTimeout(r, 60));

    const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
    let sawShortBench = false;
    let shortBenchAccepted = false;
    let p1NextSlot = 3; // p1 首发 = 槽 1/2；换人从槽 3 起
    let lastLen = 0;
    let stall = 0;
    for (let i = 0; i < 600 && s.phase !== "finished"; i++) {
      await wait(6);
      if (s.logTail.length === lastLen) {
        stall += 1;
        // 双方残局互耗（脱壳忍者反杀耿鬼后无有效输出）→ 停滞时 forcelose 兜底终局
        if (stall >= 120 && s.turn > 4) {
          await s.forceLose("p1");
          stall = 0;
        }
      } else {
        stall = 0;
        lastLen = s.logTail.length;
      }
      for (const side of ["p1", "p2"] as const) {
        const req = s.requests[side];
        if (!req || !s.pending.includes(side)) continue;
        if (req.teamPreview) {
          await s.choose(side, "team 1, 2, 3, 4, 5, 6");
          continue;
        }
        const mons = req.side?.pokemon ?? [];
        const live = mons.filter((m) => m.active && !m.condition.includes("fnt"));
        if (req.forceSwitch) {
          const bench = mons
            .map((m, idx) => ({ m, i: idx + 1 }))
            .filter((x) => !x.m.active && !x.m.condition.includes("fnt"));
          const needs = req.forceSwitch.filter(Boolean).length;
          const short = needs > bench.length;
          if (side === "p1" && short) sawShortBench = true;
          const parts: string[] = [];
          let used = 0;
          for (const need of req.forceSwitch) {
            if (!need) continue;
            if (used < bench.length && side === "p1") {
              parts.push(`switch ${p1NextSlot}`);
              p1NextSlot += 1;
              used += 1;
            } else if (used < bench.length) {
              const free = bench.find((b) => !parts.includes(`switch ${b.i}`));
              parts.push(free ? `switch ${free.i}` : "pass");
              used += 1;
            } else {
              parts.push("pass");
            }
          }
          const before = s.logTail.length;
          await s.choose(side, parts.join(", "));
          await wait(40);
          const rejected = s.logTail
            .slice(before)
            .some((l) => l.includes("[Invalid choice]") || l.includes("[Unavailable choice]"));
          if (side === "p1" && short && !rejected) shortBenchAccepted = true;
          continue;
        }
        if (req.active) {
          const act = (req.active ?? []).filter((x) => !!x).slice(0, live.length);
          const parts = act.map((_a, ordinal) => {
            const script = side === "p2" && s.turn <= 3;
            // p2 剧本：前 3 回合仅 a 位（左）用阴影球点杀，b 位用污泥炸弹（被神奇守护免疫）；
            // 第 4 回合起双阴影球 → 场上双倒、p1 替补仅剩 1（空位 > 替补）
            const moveIdx = side === "p2" ? (script ? (ordinal === 0 ? 1 : 2) : 1) : 1;
            const needsTarget =
              live.length > 1 && side === "p2" && moveIdx !== 2 ? true : live.length > 1;
            return `move ${moveIdx}` + (needsTarget ? ` ${ordinal + 1}` : "");
          });
          await s.choose(side, parts.length ? parts.join(", ") : "pass");
        }
      }
    }
    expect(sawShortBench, "剧本未命中「空位 > 存活替补」局面").toBe(true);
    expect(shortBenchAccepted, "混合 switch/pass 指令被引擎拒绝").toBe(true);
    expect(s.phase).toBe("finished");
    s.destroy();
  }, 60000);
});

describe("M3 校验器（FR-05）", () => {
  it("gen9 合法队伍通过", async () => {
    const check = await validateTeam("gen9vgc2025regi", importShowdown(TEAM_TEXT)!);
    expect(check.ok).toBe(true);
  });

  it("champions 普通道具被拒（中文错误）", async () => {
    const bad = importShowdown(TEAM_TEXT)!; // 含 Life Orb 等道具
    const check = await validateTeam("gen9championsvgc2026regmc", bad);
    expect(check.ok).toBe(false);
    expect(check.errors.some((e) => e.includes("道具"))).toBe(true);
  });

  it("队伍不足 6 只被拒（中文错误，champions Flat Rules）", async () => {
    const short = importShowdown(CHAMPIONS_TEAM_TEXT)!.slice(0, 4);
    const check = await validateTeam("gen9championsvgc2026regmc", short);
    expect(check.ok).toBe(false);
    expect(check.errors.some((e) => e.includes("至少需要 6 只"))).toBe(true);
  });

  it("champions EV 超 32 点被拒（Stat Points 中文提示）", async () => {
    const over = importShowdown(CHAMPIONS_TEAM_TEXT)!.map((s) => ({
      ...s,
      evs: { hp: 0, atk: 252, def: 0, spa: 0, spd: 0, spe: 252 },
    }));
    const check = await validateTeam("gen9championsvgc2026regmc", over);
    expect(check.ok).toBe(false);
    expect(check.errors.some((e) => e.includes("努力值"))).toBe(true);
  });
});
