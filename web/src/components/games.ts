/* games/typeChart 全局缓存、属性相性派生计算与功能注册表（自 components/shared.tsx 拆出） */
import { apiGet } from "../data/api";

/* ---- games / typeChart 全局缓存（对应 Vue store） ---- */
export interface GameDex {
  id: string;
  name_zh: string;
  name_en: string;
  total: number;
}
export interface GameRow {
  id: string;
  name_zh: string;
  name_en: string;
  generation: number;
  features: string[];
  dexes: GameDex[];
  [k: string]: any;
}
export interface PktStore {
  games: GameRow[];
  profileId: 1;
  gameId: string;
  typeChart: { types: string[]; chart: Record<string, Record<string, number>> } | null;
  gamesPromise: Promise<GameRow[]> | null;
}
export const pktStore: PktStore = {
  games: [],
  profileId: 1,
  gameId: "",
  typeChart: null,
  gamesPromise: null,
};

export function loadGames(): Promise<GameRow[]> {
  if (!pktStore.gamesPromise) {
    pktStore.gamesPromise = apiGet("/api/games").then((r) => {
      pktStore.games = r as GameRow[];
      return pktStore.games;
    });
  }
  return pktStore.gamesPromise;
}

export function loadTypeChart(): Promise<PktStore["typeChart"]> {
  if (pktStore.typeChart) return Promise.resolve(pktStore.typeChart);
  return apiGet("/api/meta/typechart").then((r) => {
    pktStore.typeChart = r;
    return r;
  });
}

/* 属性相性计算（防守方视角） */
export function defenseMultipliers(types: string[]): Record<string, number> | null {
  const chart = pktStore.typeChart;
  if (!chart) return null;
  const out: Record<string, number> = {};
  for (const atk of chart.types) {
    let m = 1;
    for (const t of types) {
      m *= (chart.chart[atk] || {})[t] ?? 1;
    }
    out[atk] = m;
  }
  return out;
}

/* ---- 功能注册表 ---- */
export const FEATURES: Record<string, { key: string; label: string; icon: string; desc: string }> =
  {
    dex: { key: "dex", label: "地区图鉴", icon: "dex", desc: "图鉴进度追踪与捕捉方式" },
    ev: { key: "ev", label: "努力值查询", icon: "ev", desc: "按努力值筛选当前游戏宝可梦" },
    sandwich: {
      key: "sandwich",
      label: "三明治食谱",
      icon: "sandwich",
      desc: "食力筛选 · 食材调味料 · 自由录入",
    },
    donut: {
      key: "donut",
      label: "甜甜圈工房",
      icon: "donut",
      desc: "特殊配方 · 树果效果 · 风味力量",
    },
    curry: { key: "curry", label: "咖喱图鉴", icon: "curry", desc: "咖喱品种图鉴与介绍" },
  };
