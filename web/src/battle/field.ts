/**
 * 场地状态推导（天气 / 地形 / 空间 / 双方侧壁）：从会话事件流推导当前生效状态，
 * 纯函数可单测。事件来源 parseLogLine：weather/fieldstart 已结构化；
 * sideend/fieldend/sidestart 未入解析子集，按原始行前缀匹配（协议稳定）。
 */
import type { BattleEvent } from "../engine-adapter";

export interface FieldConditions {
  /** 天气（sunnyday/raindance/sandstorm/hail/snow） */
  weather?: string | undefined;
  /** 地形（electricterrain/grassyterrain/mistyterrain/psychicterrain） */
  terrain?: string | undefined;
  /** 场地级持续招式（trickroom/gravity/magicroom/wonderroom） */
  fieldMoves: string[];
  /** 双方侧壁（reflect/lightscreen/auroraveil/safeguard/tailwind/mist） */
  sideStatus: { p1: string[]; p2: string[] };
}

const idOf = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/** 剥 "move: " 前缀的显示名段（fieldstart/sidestart 载荷格式） */
const moveNameOf = (seg: string | undefined): string | undefined => {
  if (!seg) return undefined;
  return idOf(seg.replace(/^move:\s*/i, ""));
};

export function fieldConditions(events: BattleEvent[]): FieldConditions {
  const out: FieldConditions = { fieldMoves: [], sideStatus: { p1: [], p2: [] } };
  for (const ev of events) {
    if (ev.kind === "weather") {
      out.weather = ev.value && idOf(ev.value) !== "none" ? idOf(ev.value) : undefined;
      continue;
    }
    if (ev.kind === "fieldstart") {
      const name = moveNameOf(ev.value);
      if (!name) continue;
      if (TERRAINS.includes(name)) out.terrain = name;
      else if (!out.fieldMoves.includes(name)) out.fieldMoves.push(name);
      continue;
    }
    // fieldend/sidestart/sideend 未入 parse 子集，按原始行匹配（行首协议前缀稳定）
    const raw = ev.raw;
    if (raw.startsWith("|-fieldend|")) {
      // |-fieldend|move: X —— 载荷在段 2
      const name = moveNameOf(raw.split("|")[2]);
      if (name === out.terrain) out.terrain = undefined;
      out.fieldMoves = out.fieldMoves.filter((x) => x !== name);
      continue;
    }
    if (raw.startsWith("|-sidestart|")) {
      const segs = raw.split("|");
      const side = segs[2]?.startsWith("p1") ? "p1" : segs[2]?.startsWith("p2") ? "p2" : undefined;
      const name = moveNameOf(segs[3]);
      if (side && name && !out.sideStatus[side].includes(name)) out.sideStatus[side].push(name);
      continue;
    }
    if (raw.startsWith("|-sideend|")) {
      const segs = raw.split("|");
      const side = segs[2]?.startsWith("p1") ? "p1" : segs[2]?.startsWith("p2") ? "p2" : undefined;
      const name = moveNameOf(segs[3]);
      if (side && name) out.sideStatus[side] = out.sideStatus[side].filter((x) => x !== name);
    }
  }
  return out;
}

const TERRAINS = ["electricterrain", "grassyterrain", "mistyterrain", "psychicterrain"];

/** 场地状态中文（chip 文案；未命中保留原文 id） */
export const FIELD_COND_ZH: Record<string, string> = {
  sunnyday: "晴天",
  raindance: "雨天",
  sandstorm: "沙暴",
  hail: "冰雹",
  snow: "下雪",
  electricterrain: "电气场地",
  grassyterrain: "青草场地",
  mistyterrain: "薄雾场地",
  psychicterrain: "精神场地",
  trickroom: "戏法空间",
  gravity: "重力",
  magicroom: "魔法空间",
  wonderroom: "奇妙空间",
  reflect: "反射壁",
  lightscreen: "光墙",
  auroraveil: "极光幕",
  safeguard: "神秘守护",
  tailwind: "顺风",
  mist: "白雾",
};

/** 状态异常图案（emoji 系统字体渲染，离线安全） */
export const STATUS_ICON: Record<string, string> = {
  brn: "🔥",
  par: "⚡",
  psn: "☠️",
  tox: "☣️",
  slp: "💤",
  frz: "❄️",
};

export function condLabel(id: string): string {
  return FIELD_COND_ZH[id] ?? id;
}
