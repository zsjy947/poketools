/**
 * 动画演出（FR-08）：事件流 → 演出步骤队列（CSS 关键帧驱动）。
 * 纯函数映射可单测；useBattleAnim 驱动组件侧「当前演出态」。
 * 动画关闭时 UI 不挂任何演出类，自动降级为纯信息流。
 */
import { useEffect, useRef, useState } from "react";
import type { BattleEvent } from "../engine-adapter";
import { parseLogLine } from "../engine-adapter";

export type AnimKind =
  | "lunge" // 出手突进
  | "hit" // 受击闪红
  | "faint" // 濒死坠落
  | "switch-in" // 换上入场
  | "heal" // 回复绿光
  | "status" // 异常状态脉冲
  | "tera" // 太晶辉光
  | "mega" // 超进化爆发
  | "max" // 极巨大体型
  | "zmove"; // Z 力量汇聚

export interface AnimStep {
  kind: AnimKind;
  /** 宝可梦 ident（p1a: Garchomp） */
  ident: string;
  durMs: number;
}

/** 各演出基准时长（ms），speed 倍率缩放（settings.animationSpeed） */
export const ANIM_BASE_MS: Record<AnimKind, number> = {
  lunge: 340,
  hit: 420,
  faint: 700,
  "switch-in": 420,
  heal: 420,
  status: 380,
  tera: 600,
  mega: 600,
  max: 600,
  zmove: 520,
};

/** 事件 → 演出步骤（招式出手/受击/濒死/换人/回复/异常/太晶/超进化/极巨/Z）。 */
export function eventsToSteps(events: BattleEvent[], speed = 1): AnimStep[] {
  const out: AnimStep[] = [];
  const scale = speed > 0 ? speed : 1;
  const push = (kind: AnimKind, ident: string | undefined) => {
    if (!ident) return;
    out.push({ kind, ident, durMs: Math.round(ANIM_BASE_MS[kind] / scale) });
  };
  for (const ev of events) {
    switch (ev.kind) {
      case "move": {
        push("lunge", ev.from);
        // 招式的目标受击由后续 damage/effectiveness 事件补充；直接攻击的 hit 也挂在目标上
        push("hit", ev.to);
        break;
      }
      case "damage":
        push("hit", ev.from);
        break;
      case "heal":
        push("heal", ev.from);
        break;
      case "faint":
        push("faint", ev.from);
        break;
      case "switch":
        push("switch-in", ev.from);
        break;
      case "status":
        push("status", ev.from);
        break;
      case "tera":
        push("tera", ev.from);
        break;
      case "mega":
        push("mega", ev.from);
        break;
      case "max":
        push("max", ev.from);
        break;
      case "zmove":
        push("zmove", ev.from);
        break;
      default:
        break;
    }
  }
  return out;
}

/** 协议行（外部日志/回放）同样可映射 */
export function linesToSteps(lines: string[], speed = 1): AnimStep[] {
  return eventsToSteps(lines.map(parseLogLine), speed);
}

/** 组件侧演出态：ident → 当前演出（到时自动清除）。
 *  计时器 fire-and-forget（不清除）：兼容 StrictMode 双挂载与快照重放。 */
export function useBattleAnim(
  events: BattleEvent[],
  enabled: boolean,
  speed = 1,
): Record<string, AnimKind> {
  const [active, setActive] = useState<Record<string, AnimKind>>({});
  const processedRef = useRef(0);
  useEffect(() => {
    if (!enabled) {
      processedRef.current = events.length;
      return;
    }
    if (events.length <= processedRef.current) return;
    const fresh = events.slice(processedRef.current);
    processedRef.current = events.length;
    for (const step of eventsToSteps(fresh, speed)) {
      setTimeout(() => {
        setActive((prev) => ({ ...prev, [step.ident]: step.kind }));
      }, 0);
      setTimeout(() => {
        setActive((prev) => {
          if (prev[step.ident] !== step.kind) return prev;
          const next = { ...prev };
          delete next[step.ident];
          return next;
        });
      }, step.durMs);
    }
  }, [events, enabled, speed]);
  return active;
}
