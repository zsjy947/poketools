/**
 * 精灵图路径解析：Showdown sprites 目录 → 本地 assets/sprites/{dir}/{spriteId}.{ext}。
 * 缺失素材时返回 null（UI 显示占位，不崩溃——M5 降级要求）。
 */

export type SpriteDir =
  "" | "back" | "shiny" | "back-shiny" | "ani" | "ani-back" | "ani-shiny" | "dex";

const ANIMATED_EXT = ".gif";
const STATIC_EXT = ".png";

/** 从协议 details/species 推导 sprite id（与 Showdown 命名一致，如 garchomp / garchomp-gmax / charizard-mega） */
export function spriteIdOf(speciesId: string): string {
  return String(speciesId).replace(/ /g, "-").toLowerCase();
}

/**
 * 解析精灵图 URL（Vite 静态资源直引 assets 目录）。
 * @param speciesId 引擎物种 id（如 'garchomp'）
 * @param opts.back 背面视角（己方）；animated 动画帧（gen5）；shiny 闪光
 */
export function spriteUrl(
  speciesId: string,
  opts?: { back?: boolean; shiny?: boolean; animated?: boolean; dex?: boolean },
): string | null {
  const id = spriteIdOf(speciesId);
  if (!id) return null;
  let dir = "";
  if (opts?.dex) dir = "dex";
  else if (opts?.animated && opts?.back && opts?.shiny) dir = "ani-shiny";
  else if (opts?.animated && opts?.back) dir = "ani-back";
  else if (opts?.animated) dir = "ani";
  else if (opts?.back && opts?.shiny) dir = "back-shiny";
  else if (opts?.back) dir = "back";
  else if (opts?.shiny) dir = "shiny";
  const ext = opts?.animated ? ANIMATED_EXT : STATIC_EXT;
  const base = dir ? `sprites/${dir}` : "sprites";
  return `${base}/${id}${ext}`;
}

/** 图标（小图）路径 */
export function iconUrl(speciesId: string): string | null {
  const id = spriteIdOf(speciesId);
  return id ? `sprites/icons/${id}.png` : null;
}

export const SPRITE_FALLBACK_BG = "#dde3ee";
