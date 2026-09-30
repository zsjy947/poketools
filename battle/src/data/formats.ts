/**
 * 赛制目录（plans/00 §3.2 P0 清单 + P1 归档）。
 * id 以上游 config/formats.ts 实际导出为准（存在命名漂移，验收以显示名为准）。
 */
import { Dex } from "../engine-adapter";

export interface FormatMeta {
  id: string;
  /** 官方显示名（Showdown 客户端口径） */
  name: string;
  /** 简中界面名 */
  zhName: string;
  gameType: "单打" | "双打";
  /** 上阵规则描述 */
  pick: string;
  level: number;
  rulesZh: string;
  mod: "gen9" | "champions" | "championsregmb";
  priority: "P0" | "P1";
}

export const FORMAT_CATALOG: FormatMeta[] = [
  {
    id: "gen9championsvgc2026regmc",
    name: "[Gen 9 Champions] VGC 2026 Reg M-C",
    zhName: "宝可梦冠军 VGC 2026 Reg M-C（当前赛季）",
    gameType: "双打",
    pick: "6 选 4",
    level: 50,
    rulesZh: "物种/道具条款 · OTS · 超级进化合法 · VGC 计时 · 超时判和",
    mod: "champions",
    priority: "P0",
  },
  {
    id: "gen9championsbssregmc",
    name: "[Gen 9 Champions] BSS Reg M-C",
    zhName: "宝可梦冠军 BSS Reg M-C",
    gameType: "单打",
    pick: "6 选 3",
    level: 50,
    rulesZh: "Flat Rules · VGC 计时",
    mod: "champions",
    priority: "P0",
  },
  {
    id: "gen9vgc2025regi",
    name: "[Gen 9] VGC 2025 Reg I",
    zhName: "朱紫 VGC 2025 Reg I（朱紫终结规则）",
    gameType: "双打",
    pick: "6 选 4",
    level: 50,
    rulesZh: "能限 2 · OTS · Min Source Gen 9",
    mod: "gen9",
    priority: "P0",
  },
  {
    id: "gen9bssregi",
    name: "[Gen 9] BSS Reg I",
    zhName: "朱紫 BSS Reg I",
    gameType: "单打",
    pick: "6 选 3",
    level: 50,
    rulesZh: "能限 2 · VGC 计时",
    mod: "gen9",
    priority: "P0",
  },
  {
    id: "gen9ou",
    name: "[Gen 9] OU",
    zhName: "朱紫 OU（Smogon 单打标准）",
    gameType: "单打",
    pick: "6 只整队",
    level: 100,
    rulesZh: "Smogon OU 分级条款（自由练习用）",
    mod: "gen9",
    priority: "P0",
  },
  {
    id: "gen9customgame",
    name: "Custom Game",
    zhName: "自定义对战（自由练习）",
    gameType: "单打",
    pick: "自定义",
    level: 100,
    rulesZh: "无限制（调试用；可在设置中切单双打）",
    mod: "gen9",
    priority: "P0",
  },
  {
    id: "gen9championsvgc2026regmcbo3",
    name: "[Gen 9 Champions] VGC 2026 Reg M-C (Bo3)",
    zhName: "冠军 VGC Reg M-C 三局两胜",
    gameType: "双打",
    pick: "6 选 4",
    level: 50,
    rulesZh: "三局两胜 · 局间可调整队伍",
    mod: "champions",
    priority: "P1",
  },
  {
    id: "gen9championsvgc2026regmb",
    name: "[Gen 9 Champions] VGC 2026 Reg M-B",
    zhName: "冠军 VGC 2026 Reg M-B（2026 世界赛归档）",
    gameType: "双打",
    pick: "6 选 4",
    level: 50,
    rulesZh: "归档规则",
    mod: "championsregmb",
    priority: "P1",
  },
];

/** 按目录逐项校验赛制在上游存在（构建期校验 fail fast：脚本 verify-data 也调用）。 */
export function verifyFormats(): { ok: boolean; missing: string[] } {
  Dex.includeFormats();
  const all = new Set<string>(Dex.formats.all().map((f) => String(f.id)));
  // Bo3 变体 id 可能带 bo3 后缀漂移，单独探测
  const missing = FORMAT_CATALOG.filter((f) => !all.has(f.id)).map((f) => f.id);
  return { ok: missing.length === 0, missing };
}
