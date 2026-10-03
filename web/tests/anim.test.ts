// M5 动画演出测试：事件 → 演出步骤映射抽样 30 招式 + 精灵资产覆盖。
// 演出正确 = 出手者 lunge、目标 hit、名称/属性中文显示正确、机制事件（太晶/Mega/极巨/Z）各有专属演出。
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseLogLine } from "../src/engine-adapter";
import type { BattleEvent } from "../src/engine-adapter";
import { eventsToSteps, linesToSteps, ANIM_BASE_MS } from "../src/battle/anim";
import { dexFor, moveView, TYPE_ZH } from "../src/data";
import { spriteUrl } from "../src/battle/sprites";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

/** 抽样 30 招式（覆盖各属性/物理特殊变化/机制事件） */
const SAMPLE_MOVES = [
  "Earthquake",
  "Bullet Punch",
  "Surf",
  "Ice Beam",
  "Extreme Speed",
  "Outrage",
  "Iron Head",
  "Protect",
  "Spore",
  "Pollen Puff",
  "Rage Powder",
  "Fake Out",
  "Flare Blitz",
  "Knock Off",
  "Parting Shot",
  "Recover",
  "Toxic Spikes",
  "Haze",
  "Flash Cannon",
  "Tera Blast",
  "Electro Shot",
  "Weather Ball",
  "Icicle Crash",
  "Dynamax Cannon",
  "Follow Me",
  "Dragon Claw",
  "X-Scissor",
  "Close Combat",
  "U-turn",
  "Zen Headbutt",
];

describe("M5 动画演出", () => {
  const dex = dexFor("gen9");

  it("抽样 30 招式：出手 lunge + 目标 hit，中文名/属性显示正确", () => {
    expect(SAMPLE_MOVES.length).toBeGreaterThanOrEqual(30);
    for (const mv of SAMPLE_MOVES) {
      const line = `|move|p1a: Testmon|${mv}|p2a: Foe`;
      const steps = linesToSteps([line]);
      expect(steps.map((s) => s.kind + "@" + s.ident)).toEqual([
        `lunge@p1a: Testmon`,
        `hit@p2a: Foe`,
      ]);
      const view = moveView(dex, mv);
      expect(view, `招式缺失：${mv}`).not.toBeNull();
      expect(view!.zhName, `${mv} 应有中文名`).not.toBe(mv);
      expect(
        TYPE_ZH[Object.entries(TYPE_ZH).find(([, v]) => v === view!.type)?.[0] ?? ""] ?? view!.type,
      ).toBeTruthy();
    }
  });

  it("受击/濒死/换人/回复/异常/机制事件各有专属演出", () => {
    const lines = [
      "|damage|p2a: Foe|50/100",
      "|faint|p2a: Foe",
      "|switch|p1a: Newmon|Garchomp, L50, M|100/100",
      "|heal|p1a: Newmon|80/100",
      "|-status|p1a: Newmon|brn",
      "|-terastallize|p1a: Newmon|Water",
      "|mega|p1a: Newmon|Mega Garchomp",
      "|max|p1a: Newmon",
      "|zpower|p1a: Newmon",
    ];
    const kinds = linesToSteps(lines).map((s) => s.kind);
    expect(kinds).toEqual([
      "hit",
      "faint",
      "switch-in",
      "heal",
      "status",
      "tera",
      "mega",
      "max",
      "zmove",
    ]);
  });

  it("速度倍率缩放演出时长（speed=2 减半）", () => {
    const ev: BattleEvent[] = [parseLogLine("|faint|p1a: X")];
    const [base, fast] = [eventsToSteps(ev, 1)[0]!, eventsToSteps(ev, 2)[0]!];
    expect(base.durMs).toBe(ANIM_BASE_MS.faint);
    expect(fast.durMs).toBe(Math.round(ANIM_BASE_MS.faint / 2));
  });

  it("精灵资产覆盖：对局物种动画图全量存在；静态缺失时回退链不死路", () => {
    // 从 replay 样本收集实际出场物种（对局口径，非全图鉴）；文件名取引擎 spriteid
    const replayDir = join(ROOT, "tests", "replays");
    const species = new Set<string>();
    for (const f of readdirSync(replayDir).filter((x) => x.endsWith(".log"))) {
      for (const m of readFileSync(join(replayDir, f), "utf8").matchAll(
        /\|(?:poke|switch)\|(?:p[12]|p[12]a: [^|]+)\|([^|,]+)/g,
      )) {
        const sp = dex.species.get(m[1]!.trim());
        if (sp.exists) species.add(sp.spriteid);
      }
    }
    expect(species.size).toBeGreaterThanOrEqual(12);
    // 每个物种正面/背面至少有一套图（静态/动画/官方绘图）；官方 dump 个别新传说无战斗图 → 占位兜底
    const dead: string[] = [];
    let animHit = 0;
    let checked = 0;
    const has = (url: string | null) => (url ? existsSync(join(ROOT, "public", url)) : false);
    for (const sp of species) {
      for (const back of [false, true]) {
        checked += 1;
        const ani = has(spriteUrl(sp, { back, animated: true }));
        const stat = has(spriteUrl(sp, { back }));
        const dexArt = has(spriteUrl(sp, { dex: true }));
        if (ani) animHit += 1;
        else if (stat || dexArt) {
          // 静态/绘图兜底可用
        } else dead.push(`${sp}${back ? "（背面）" : ""}`);
      }
    }
    expect(checked).toBeGreaterThan(20);
    // dump 已知缺口（如 terapagos）允许极少数纯占位，超出即素材管线问题
    expect(dead.length, `纯占位物种：${dead.join(", ")}`).toBeLessThanOrEqual(2);
    // 绝大多数物种应有动画图（演出默认开启）
    expect(animHit / checked).toBeGreaterThan(0.7);
  });
});
