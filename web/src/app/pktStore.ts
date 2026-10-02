/**
 * poketools 分区全局态：当前游戏/功能页/档案。
 * 档案模型与 Vue 版一致（固定默认档案 id=1，UI 已移除切换）；
 * gameId/feature 持久化到 localStorage，重开应用回到上次浏览位置。
 */
import { create } from "zustand";

export type GameId =
  | "sword-shield"
  | "brilliant-diamond-shining-pearl"
  | "legends-arceus"
  | "scarlet-violet"
  | "legends-za";

export type GameFeature = "dex" | "ev" | "sandwich" | "donut" | "curry";

const K_CTX = "pkt.ctx.v1";

interface Ctx {
  gameId: GameId | "";
  feature: GameFeature;
}

function loadCtx(): Ctx {
  try {
    const raw = localStorage.getItem(K_CTX);
    if (raw) {
      const v = JSON.parse(raw) as Partial<Ctx>;
      if (v.gameId && v.feature) {
        return { gameId: v.gameId as GameId, feature: v.feature as GameFeature };
      }
    }
  } catch {
    /* 损坏数据忽略 */
  }
  return { gameId: "", feature: "dex" };
}

interface PktState {
  gameId: GameId | "";
  feature: GameFeature;
  /** 固定默认档案（与 userstate.db profiles id=1 对齐） */
  readonly profileId: 1;

  setGame: (gameId: GameId, feature?: GameFeature) => void;
  setFeature: (feature: GameFeature) => void;
}

export const usePkt = create<PktState>((set, get) => ({
  ...loadCtx(),
  profileId: 1,

  setGame: (gameId, feature) => {
    const f = feature ?? get().feature;
    try {
      localStorage.setItem(K_CTX, JSON.stringify({ gameId, feature: f }));
    } catch {
      /* 存储不可用时仅内存态 */
    }
    set({ gameId, feature: f });
  },
  setFeature: (feature) => {
    const { gameId } = get();
    if (gameId) {
      try {
        localStorage.setItem(K_CTX, JSON.stringify({ gameId, feature }));
      } catch {
        /* 同上 */
      }
    }
    set({ feature });
  },
}));
