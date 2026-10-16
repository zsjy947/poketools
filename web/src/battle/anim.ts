/**
 * 动画演出（FR-08 → M4 P2 重构）：事件流 → 演出步骤**队列串播**（CSS 关键帧驱动）。
 *
 * - eventsToSteps/linesToSteps 纯函数映射可单测（事件序 = 演出序，逐条串播）；
 * - useBattleAnimQueue 组件侧按队列顺序消费：当前步骤挂类 → 到时摘类 → 下一步骤，
 *   节奏对齐 Showdown 客户端演出观感（可整体跳过：动画关闭直落终态）；
 * - 位移风格（style）：按招式类别（物理=突进/特殊=蓄能/变化=低幅起手），
 *   方向由精灵 data-side 决定（CSS 侧）；
 * - 伤害飘字（popup）：从事件流的 HP 段（"82/194"）与 initialHp 种子推每次扣/回血量，
 *   命中要害/效果拔群/收效甚微/无效着色（-crit/-supereffective/-resisted/-immune 后置关联）。
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { BattleEvent } from "../engine-adapter";
import { parseLogLine } from "../engine-adapter";

export type AnimKind =
  | "lunge" // 出手（物理突进/特殊蓄能按 style 细分）
  | "hit" // 受击闪红
  | "faint" // 濒死坠落
  | "switch-in" // 换上入场
  | "heal" // 回复绿光
  | "status" // 异常状态脉冲
  | "tera" // 太晶辉光
  | "mega" // 超进化爆发
  | "max" // 极巨大体型
  | "zmove"; // Z 力量汇聚

/** 位移风格：lunge 演出按招式类别分化（CSS 变体类） */
export type AnimStyle = "lunge" | "cast" | "chant";

export type PopupTone = "dmg" | "heal" | "crit" | "super" | "resisted" | "immune";

export interface AnimPopup {
  key: number;
  ident: string;
  text: string;
  tone: PopupTone;
}

/** 组件侧演出态：kind 驱动 keyframe，style 细分 lunge 位移（物理/特殊/变化） */
export interface AnimRuntime {
  kind: AnimKind;
  style?: AnimStyle | undefined;
}

export interface AnimStep {
  kind: AnimKind;
  /** 宝可梦 ident（p1a: Garchomp） */
  ident: string;
  durMs: number;
  /** lunge 的位移风格（物理/特殊/变化） */
  style?: AnimStyle | undefined;
  /** 目标 ident（预留方向化位移） */
  target?: string | undefined;
  /** 伤害/回复飘字（数值来自 HP 段差量） */
  popup?: { text: string; tone: PopupTone } | undefined;
  /** 纯飘字步骤（要害/效果关联修正，不阻塞演出节奏太久） */
  markerOnly?: boolean;
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

export const POPUP_MS = 950;

export interface StepOpts {
  /** 开局 HP 种子（ident → [hp, maxhp]，request 快照；首击差量依赖它） */
  initialHp?: Record<string, [number, number]> | null;
  /** 招式名 → 类别（物理/特殊/变化；BattleView 注入 dex 查询） */
  categoryOf?: (moveName: string) => "physical" | "special" | "status" | undefined;
}

/** "82/194" / "0 fnt" HP 段 → [当前, 最大]（无最大段返回 cur,undefined） */
function parseHpSeg(seg: string | undefined): [number, number | undefined] {
  const first = (seg ?? "").split(" ")[0] ?? "";
  const nums = first.split("/").map(Number);
  const a = nums[0];
  const b = nums[1];
  if (a !== undefined && Number.isFinite(a)) {
    const max = b !== undefined && Number.isFinite(b) ? b : undefined;
    return [a, max] as [number, number | undefined];
  }
  return [NaN, undefined] as [number, number | undefined];
}

/** 事件 → 演出步骤（含位移风格与伤害飘字）。串行播放：数组序即演出序。 */
export function eventsToSteps(events: BattleEvent[], speed = 1, opts?: StepOpts): AnimStep[] {
  const scale = speed > 0 ? speed : 1;
  const dur = (k: AnimKind) => Math.round(ANIM_BASE_MS[k] / scale);
  const out: AnimStep[] = [];
  // HP 追踪：种子（开局 request）+ 事件序内更新 → 每次扣/回血差量
  const hp = new Map<string, { cur: number; max: number }>();
  for (const [ident, pair] of Object.entries(opts?.initialHp ?? {}))
    hp.set(ident, { cur: pair[0], max: pair[1] });
  // 飘字着色后置关联：-crit/-supereffective… 跟在 -damage 之后 → 回填最近一条飘字
  const lastPopupIdx = new Map<string, number>();

  const push = (step: AnimStep) => {
    out.push(step);
    if (step.popup) lastPopupIdx.set(normAnimIdent(step.ident), out.length - 1);
  };

  for (const ev of events) {
    switch (ev.kind) {
      case "move": {
        const cat = opts?.categoryOf?.(ev.value ?? "");
        const style: AnimStyle = cat === "special" ? "cast" : cat === "status" ? "chant" : "lunge";
        push({ kind: "lunge", ident: ev.from!, durMs: dur("lunge"), style, target: ev.to });
        // 直接攻击的受击挂目标（实际伤害由 -damage 事件补充独立 hit 步骤；无目标招式跳过）
        if (ev.to) push({ kind: "hit", ident: ev.to, durMs: dur("hit") });
        break;
      }
      case "damage": {
        const [after, max] = parseHpSeg(ev.parts[3]);
        const prev = hp.get(normAnimIdent(ev.from ?? ""));
        let delta: number | undefined;
        if (prev && Number.isFinite(after)) delta = Math.max(0, prev.cur - after);
        if (Number.isFinite(after))
          hp.set(normAnimIdent(ev.from ?? ""), { cur: after, max: max ?? prev?.max ?? after });
        push({
          kind: "hit",
          ident: ev.from!,
          durMs: dur("hit"),
          popup: delta != null ? { text: `-${delta}`, tone: "dmg" } : undefined,
        });
        break;
      }
      case "heal": {
        const [after, max] = parseHpSeg(ev.parts[3]);
        const prev = hp.get(normAnimIdent(ev.from ?? ""));
        let delta: number | undefined;
        if (prev && Number.isFinite(after)) delta = Math.max(0, after - prev.cur);
        if (Number.isFinite(after))
          hp.set(normAnimIdent(ev.from ?? ""), { cur: after, max: max ?? prev?.max ?? after });
        push({
          kind: "heal",
          ident: ev.from!,
          durMs: dur("heal"),
          popup: delta != null && delta > 0 ? { text: `+${delta}`, tone: "heal" } : undefined,
        });
        break;
      }
      case "faint":
        push({ kind: "faint", ident: ev.from!, durMs: dur("faint") });
        break;
      case "switch": {
        // 换人行自带 HP 段（parts[4]，"100/100"；replay 为百分比）：刷新 HP 追踪（替补首现即播种）
        const [hpAfter, hpMax] = parseHpSeg(ev.parts[4]);
        if (Number.isFinite(hpAfter))
          hp.set(normAnimIdent(ev.from ?? ""), { cur: hpAfter, max: hpMax ?? hpAfter });
        push({ kind: "switch-in", ident: ev.from!, durMs: dur("switch-in") });
        break;
      }
      case "status":
        push({ kind: "status", ident: ev.from!, durMs: dur("status") });
        break;
      case "tera":
        push({ kind: "tera", ident: ev.from!, durMs: dur("tera") });
        break;
      case "mega":
        push({ kind: "mega", ident: ev.from!, durMs: dur("mega") });
        break;
      case "max":
        push({ kind: "max", ident: ev.from!, durMs: dur("max") });
        break;
      case "zmove":
        push({ kind: "zmove", ident: ev.from!, durMs: dur("zmove") });
        break;
      case "crit": {
        // 后置关联：修正最近一条该 ident 的飘字（要害 > 效果着色）
        const idx = lastPopupIdx.get(normAnimIdent(ev.from ?? ""));
        if (idx != null && out[idx]?.popup) {
          out[idx]!.popup = { text: out[idx]!.popup!.text, tone: "crit" };
        }
        break;
      }
      case "effectiveness": {
        const idx = lastPopupIdx.get(normAnimIdent(ev.from ?? ""));
        if (idx != null && out[idx]?.popup && out[idx]!.popup!.tone === "dmg") {
          const tone = ev.eff === "super" ? "super" : ev.eff === "resisted" ? "resisted" : "immune";
          out[idx]!.popup = { text: out[idx]!.popup!.text, tone };
        } else if (ev.eff === "immune") {
          // 无 -damage 行的免疫：独立飘字
          push({
            kind: "hit",
            ident: ev.from!,
            durMs: 160,
            markerOnly: true,
            popup: { text: "无效", tone: "immune" },
          });
        }
        break;
      }
      default:
        break;
    }
  }
  return out;
}

/** 协议行（外部日志/回放）同样可映射 */
export function linesToSteps(lines: string[], speed = 1, opts?: StepOpts): AnimStep[] {
  return eventsToSteps(lines.map(parseLogLine), speed, opts);
}

/** ident 归一：飘字/演出键与 session 同口径（"p1a: X" ↔ "p1: X"） */
export function normAnimIdent(ident: string): string {
  return ident.replace(/^(p[12])[ab]?:/, "$1:");
}

/**
 * 组件侧演出队列：ident → 当前演出（串播到时自动摘除）+ 活跃飘字。
 * - 队列顺序消费（一步演完再演下一步，节奏对齐 Showdown 观感）；
 * - 动画关闭：游标直落当前末尾、演出/飘字清空（纯信息流直落终态）；
 * - 首次挂载游标初始化为当前事件数（补挂不重播整局，StrictMode 双挂载安全）；
 * - 计时器经 mountedRef 兜底（卸载后不再 setState）。
 */
export function useBattleAnimQueue(
  events: BattleEvent[],
  enabled: boolean,
  speed = 1,
  opts?: StepOpts,
): { anims: Record<string, AnimRuntime>; popups: AnimPopup[] } {
  const [anims, setAnims] = useState<Record<string, AnimRuntime>>({});
  const [popups, setPopups] = useState<AnimPopup[]>([]);
  const cursorRef = useRef(-1);
  if (cursorRef.current === -1) cursorRef.current = events.length;
  const queueRef = useRef<AnimStep[]>([]);
  const playingRef = useRef(false);
  const popupKeyRef = useRef(0);
  const mountedRef = useRef(true);
  const optsRef = useRef(opts);
  optsRef.current = opts;
  const speedRef = useRef(speed);
  speedRef.current = speed;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const pump = useCallback(() => {
    if (playingRef.current) return;
    const step = queueRef.current.shift();
    if (!step) return;
    playingRef.current = true;
    const hold = step.markerOnly ? Math.min(step.durMs, 200) : step.durMs;
    // 键归一：事件行 "p1a: X" → "p1: X"（与 request/MonState 同口径，消费侧直接命中）
    const key = normAnimIdent(step.ident);
    setAnims((prev) => ({ ...prev, [key]: { kind: step.kind, style: step.style } }));
    if (step.popup) {
      const pk = ++popupKeyRef.current;
      const popup: AnimPopup = {
        key: pk,
        ident: key,
        text: step.popup.text,
        tone: step.popup.tone,
      };
      setPopups((prev) => [...prev.slice(-5), popup]);
      const live = Math.max(
        500,
        Math.round(POPUP_MS / (speedRef.current > 0 ? speedRef.current : 1)),
      );
      setTimeout(() => {
        if (!mountedRef.current) return;
        setPopups((prev) => prev.filter((p) => p.key !== pk));
      }, live);
    }
    setTimeout(
      () => {
        if (!mountedRef.current) return;
        setAnims((prev) => {
          if (prev[key]?.kind !== step.kind) return prev;
          const next = { ...prev };
          delete next[key];
          return next;
        });
        playingRef.current = false;
        pump();
      },
      Math.max(40, hold),
    );
  }, []);

  useEffect(() => {
    if (!enabled) {
      cursorRef.current = events.length;
      queueRef.current = [];
      playingRef.current = false;
      setAnims({});
      setPopups([]);
      return;
    }
    if (events.length <= cursorRef.current) return;
    const fresh = events.slice(cursorRef.current);
    cursorRef.current = events.length;
    queueRef.current.push(...eventsToSteps(fresh, speed, optsRef.current));
    pump();
  }, [events, enabled, speed, pump]);

  return { anims, popups };
}

/** 旧名兼容（M3 前调用面）：仅返回演出态映射（kind 文本） */
export function useBattleAnim(
  events: BattleEvent[],
  enabled: boolean,
  speed = 1,
  opts?: StepOpts,
): Record<string, string> {
  const { anims } = useBattleAnimQueue(events, enabled, speed, opts);
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(anims)) out[k] = v.kind;
  return out;
}
