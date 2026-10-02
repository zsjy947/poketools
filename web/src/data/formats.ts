/**
 * 赛制目录：宝可梦冠军 | 朱紫 | 自由对战 三大类，单打/双打小类。
 * id 以上游 config/formats.ts 实际导出为准（本地离线引擎锁定 commit，见 scripts/config.json）。
 *
 * 双打命名说明：上游 Showdown 的 Battle Stadium 系双打以 VGC 命名（Flat Rules + OTS），
 * 不存在 BSD 前缀 id（2026-10 上游核对：Champions 分区仅 BSS 单打 + VGC 双打）——
 * 朱紫双打回退映射 gen9vgc2025regi（原 bsd 系）、冠军双打用 gen9championsvgc2026regm*。
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
  /** 大类（主页分组渲染） */
  section: "宝可梦冠军" | "朱紫" | "自由对战";
}

export const FORMAT_CATALOG: FormatMeta[] = [
  // ---- 宝可梦冠军 ----
  {
    id: "gen9championsvgc2026regmc",
    name: "[Gen 9 Champions] VGC 2026 Reg M-C",
    zhName: "冠军 VGC 2026 Reg M-C",
    gameType: "双打",
    pick: "6 选 4",
    level: 50,
    rulesZh: "Flat Rules · OTS · 超级进化合法 · VGC 计时",
    mod: "champions",
    section: "宝可梦冠军",
  },
  {
    id: "gen9championsbssregmc",
    name: "[Gen 9 Champions] BSS Reg M-C",
    zhName: "冠军 BSS Reg M-C",
    gameType: "单打",
    pick: "6 选 3",
    level: 50,
    rulesZh: "Flat Rules · VGC 计时",
    mod: "champions",
    section: "宝可梦冠军",
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
    section: "宝可梦冠军",
  },
  {
    id: "gen9championsvgc2026regmb",
    name: "[Gen 9 Champions] VGC 2026 Reg M-B",
    zhName: "冠军 VGC Reg M-B",
    gameType: "双打",
    pick: "6 选 4",
    level: 50,
    rulesZh: "Flat Rules · OTS · VGC 计时",
    mod: "championsregmb",
    section: "宝可梦冠军",
  },
  {
    id: "gen9championsbssregmb",
    name: "[Gen 9 Champions] BSS Reg M-B",
    zhName: "冠军 BSS Reg M-B",
    gameType: "单打",
    pick: "6 选 3",
    level: 50,
    rulesZh: "Flat Rules · VGC 计时",
    mod: "championsregmb",
    section: "宝可梦冠军",
  },
  // ---- 朱紫 ----
  {
    id: "gen9vgc2025regi",
    name: "[Gen 9] VGC 2025 Reg I",
    zhName: "朱紫 VGC 2025 Reg I",
    gameType: "双打",
    pick: "6 选 4",
    level: 50,
    rulesZh: "能限 2 · OTS · Min Source Gen 9",
    mod: "gen9",
    section: "朱紫",
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
    section: "朱紫",
  },
  // ---- 自由对战 ----
  {
    id: "gen9customgame",
    name: "Custom Game",
    zhName: "自由对战（单打）",
    gameType: "单打",
    pick: "自定义",
    level: 100,
    rulesZh: "无限制（调试/练习用）",
    mod: "gen9",
    section: "自由对战",
  },
  {
    id: "gen9doublescustomgame",
    name: "Doubles Custom Game",
    zhName: "自由对战（双打）",
    gameType: "双打",
    pick: "自定义",
    level: 100,
    rulesZh: "无限制（调试/练习用）",
    mod: "gen9",
    section: "自由对战",
  },
];

/** 大类渲染顺序 */
export const FORMAT_SECTIONS: Array<FormatMeta["section"]> = ["宝可梦冠军", "朱紫", "自由对战"];

/** 按目录逐项校验赛制在上游存在（构建期校验 fail fast：脚本 verify-data 也调用）。 */
export function verifyFormats(): { ok: boolean; missing: string[] } {
  Dex.includeFormats();
  const all = new Set<string>(Dex.formats.all().map((f) => String(f.id)));
  const missing = FORMAT_CATALOG.filter((f) => !all.has(f.id)).map((f) => f.id);
  return { ok: missing.length === 0, missing };
}
