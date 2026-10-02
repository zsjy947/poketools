/**
 * 极简 hash 路由（统一壳）：#/section/... 形式，无依赖。
 * 路由表：
 *   #/home                      统一首页（游戏中心 / 伤害计算器 / 模拟对战 宫格）
 *   #/games                     游戏中心（五作列表）
 *   #/game/:gameId/:feature     游戏功能页（dex/ev/sandwich/donut/curry）
 *   #/pokemon/:speciesId        宝可梦详情（query: game / dex / form）
 *   #/calc                      伤害计算器（全局入口）
 *   #/battle/*                  模拟对战（内部页面流仍由 zustand store 驱动）
 */
import { useSyncExternalStore } from "react";

export type Route =
  | { name: "home" }
  | { name: "games" }
  | { name: "game"; gameId: string; feature: string }
  | { name: "pokemon"; speciesId: number }
  | { name: "calc" }
  | { name: "battle"; rest: string }
  | { name: "not-found"; hash: string };

export function parseHash(hash: string): Route {
  const clean = hash.replace(/^#/, "");
  const parts = clean.split("/").filter(Boolean).map(decodeURIComponent);
  const [head, a, b] = parts;
  switch (head) {
    case undefined:
    case "":
    case "home":
      return { name: "home" };
    case "games":
      return { name: "games" };
    case "game":
      return a ? { name: "game", gameId: a, feature: b || "dex" } : { name: "games" };
    case "pokemon":
      return a && /^\d+$/.test(a)
        ? { name: "pokemon", speciesId: Number(a) }
        : { name: "not-found", hash: clean };
    case "calc":
      return { name: "calc" };
    case "battle":
      return { name: "battle", rest: parts.slice(1).join("/") };
    default:
      return { name: "not-found", hash: clean };
  }
}

/** 当前 hash 的 query 参数（?a=b 形式，兼容 Vue 版链接 #/pokemon/25?game=...） */
export function routeQuery(hash: string): URLSearchParams {
  const q = hash.indexOf("?");
  return new URLSearchParams(q >= 0 ? hash.slice(q + 1) : "");
}

function currentHash(): string {
  return typeof location === "undefined" ? "#/home" : location.hash || "#/home";
}

const listeners = new Set<() => void>();
let cachedHash = currentHash();
if (typeof location !== "undefined") {
  addEventListener("hashchange", () => {
    cachedHash = currentHash();
    for (const fn of listeners) fn();
  });
}

export function navigate(hash: string): void {
  if (typeof location === "undefined") return;
  const next = hash.startsWith("#") ? hash : `#${hash}`;
  if (location.hash === next) {
    cachedHash = next;
    for (const fn of listeners) fn();
    return;
  }
  location.hash = next;
}

/** 订阅式路由 hook：hash 变化触发重渲染（返回原始 hash，解析由调用方 memo） */
export function useHash(): string {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => cachedHash,
    () => "#/home",
  );
}
