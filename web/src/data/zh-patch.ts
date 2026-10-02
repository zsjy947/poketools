/**
 * 中文补丁表与整行兜底翻译（zhLine）：引擎 zh-cn 文本缺失条目的显示补齐。
 * 键 = Showdown id；加载顺序 = 引擎 zh-cn → 本补丁（同 id 唯一值，不覆盖引擎非空译名）。
 * 覆盖：Gmax/Mega 形态名、超级石等道具名、无特性、champions mod 新增条目。
 */
import { Dex } from "../engine-adapter";
import type { NamedText } from "./index";

/** 常用对战道具中文说明（itemView.desc 优先取此表；其余回退英文，缺口见 docs/BATTLE.md 数据缺口节） */
export const ZH_ITEM_DESC: Record<string, string> = {
  leftovers: "每回合结束回复 1/16 最大 HP。",
  lifeorb: "招式伤害 ×1.3（4915/4096），每次攻击损失 10% 最大 HP。",
  choicespecs: "特攻 ×1.5，只能使用入场后选择的第一个招式。",
  choiceband: "攻击 ×1.5，只能使用入场后选择的第一个招式。",
  choicescarf: "速度 ×1.5，只能使用入场后选择的第一个招式。",
  focusband: "满血时承受致命伤害必定残留 1 HP（每场一次）。",
  focussash: "满血时承受致命伤害必定残留 1 HP（一次性）。",
  assaultvest: "特防 ×1.5，不能选择变化招式。",
  eviolite: "未最终进化的宝可梦防御与特防 ×1.5。",
  heavydutyboots: "免疫隐形岩/撒菱/毒菱等进场陷阱。",
  utilityumbrella: "免疫天气（晴天/雨天/大日照/大雨）的影响。",
  clearamulet: "无视对手特性带来的能力下降。",
  covertcloak: "无视对手招式的追加效果。",
  boosterenergy: "古代/未来种特性启动（无场地/天气时激活）。",
  loadeddice: "多段攻击招式段数更倾向高段（2~5 段按 3 段以上加权）。",
};

/** 静态补丁：champions mod 新增 / 引擎恒缺条目 */
export const ZH_PATCH: Record<string, string> = {
  noability: "无特性",
  // 原始回归宝珠（champions mod 允许原始回归）
  redorb: "红色宝珠",
  blueorb: "蓝色宝珠",
  // 极巨汤/超极巨相关道具（champions）
  maxsoup: "极巨汤",
  // Z 相关
  zring: "Z手环",
  // 常用机制词条兜底（日志/校验里的英文残留）
  megastone: "超级石",
};

export interface ZhTable {
  /** id → 中文（引擎 zh-cn + 补丁） */
  zhById: Map<string, string>;
  /** 英文显示名 → 中文（兜底整行替换用，长名优先） */
  zhByName: Map<string, string>;
}

let tableCache: ZhTable | null = null;

/** 构建联合中文表（惰性一次）：物种/招式/道具/特性 + 形态/进化石派生补丁 */
export function zhTable(baseText: NamedText): ZhTable {
  if (tableCache) return tableCache;
  const zhById = new Map<string, string>();
  const zhByName = new Map<string, string>();

  const put = (id: string, zh: string): void => {
    if (!zh) return;
    if (!zhById.has(id)) zhById.set(id, zh);
  };

  // 引擎英文名表（占位判定用）
  const dex0 = Dex.mod("base") as unknown as {
    data: {
      Pokedex: Record<string, { name?: string }>;
      Moves: Record<string, { name?: string }>;
      Items: Record<string, { name?: string }>;
      Abilities: Record<string, { name?: string }>;
    };
  };
  const enName = new Map<string, string>();
  for (const tbl of [dex0.data.Pokedex, dex0.data.Moves, dex0.data.Items, dex0.data.Abilities]) {
    for (const [id, v] of Object.entries(tbl ?? {})) {
      if (v?.name) enName.set(id, v.name);
    }
  }

  // 引擎 zh-cn 非空译名（值等于英文名 = 未翻译占位，跳过让补丁派生填入）
  const putEngine = (id: string, zh: string | undefined): void => {
    if (!zh || zh === enName.get(id)) return;
    put(id, zh);
  };
  for (const [id, v] of Object.entries(baseText.Pokedex ?? {})) putEngine(id, v?.name);
  for (const [id, v] of Object.entries(baseText.Moves ?? {})) putEngine(id, v?.name);
  for (const [id, v] of Object.entries(baseText.Items ?? {})) putEngine(id, v?.name);
  for (const [id, v] of Object.entries(baseText.Abilities ?? {})) putEngine(id, v?.name);

  // 静态补丁（不覆盖引擎非空译名）
  for (const [id, zh] of Object.entries(ZH_PATCH)) put(id, zh);

  // 形态派生：${base}mega[x|y] → 超级{名}(Ｘ/Ｙ)；${base}gmax → 超极巨{名}
  const dex = dex0 as unknown as {
    data: { Pokedex: Record<string, { name?: string; baseSpecies?: string }> };
  };
  for (const [id, sp] of Object.entries(dex.data.Pokedex ?? {})) {
    // PS 物种 id 不含连字符（charizardmegax / charizardgmax）
    const m = /^(.+?)(megax|megay|mega|gmax)$/.exec(id);
    if (!m) continue;
    const baseId = m[1]!;
    const suffix = m[2]!;
    const baseZh = zhById.get(baseId);
    if (!baseZh) continue;
    if (suffix === "gmax") put(id, `超极巨${baseZh}`);
    else if (suffix === "mega") put(id, `超级${baseZh}`);
    else if (suffix === "megax") put(id, `超级${baseZh}Ｘ`);
    else put(id, `超级${baseZh}Ｙ`);
    void sp;
  }

  // 进化石派生：{species}ite[x|y] → {名}进化石(Ｘ/Ｙ)（含 champions 新超进化石）
  const items = dex0.data.Items ?? {};
  for (const id of Object.keys(items)) {
    if (zhById.has(id)) continue;
    const m = /^(.+?)ite(x|y)?$/.exec(id);
    if (!m) continue;
    const baseId = m[1]!;
    const suffix = m[2] ?? "";
    const baseZh = zhById.get(baseId);
    if (!baseZh) continue;
    put(id, `${baseZh}进化石${suffix === "x" ? "Ｘ" : suffix === "y" ? "Ｙ" : ""}`);
  }

  // 英文名 → 中文（取引擎英文名做键；长名优先由 zhLine 的匹配顺序保证）
  const addByName = (id: string, enName: string | undefined): void => {
    const zh = zhById.get(id);
    if (zh && enName && !zhByName.has(enName)) zhByName.set(enName, zh);
  };
  for (const [id, sp] of Object.entries(dex.data.Pokedex ?? {})) addByName(id, sp.name);
  const moves = dex0.data.Moves ?? {};
  for (const [id, mv] of Object.entries(moves)) addByName(id, mv.name);
  for (const [id, it] of Object.entries(items)) addByName(id, it.name);
  const abilities = dex0.data.Abilities ?? {};
  for (const [id, ab] of Object.entries(abilities)) addByName(id, ab.name);

  tableCache = { zhById, zhByName };
  return tableCache;
}

let lineReCache: RegExp | null = null;
function lineRe(table: ZhTable): RegExp {
  if (lineReCache) return lineReCache;
  const names = [...table.zhByName.keys()]
    .filter((n) => n.length >= 3 && /^[A-Za-z0-9' .-]+$/.test(n))
    .sort((a, b) => b.length - a.length)
    .map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .slice(0, 4000); // 长名优先取前 4000 个（覆盖全部常用词条）
  lineReCache = new RegExp(`\\b(${names.join("|")})\\b`, "g");
  return lineReCache;
}

/** 整行专名最长匹配替换兜底：协议原文行 / 校验消息前缀 / 指令错误等英文残留转中文 */
export function zhLine(line: string): string {
  if (!line) return line;
  const table = zhTable(Dex.mod("base").loadTextData("zh-cn") as unknown as NamedText);
  try {
    return line.replace(lineRe(table), (m) => table.zhByName.get(m) ?? m);
  } catch {
    return line;
  }
}

/** id → 中文（引擎 zh-cn + 补丁；未命中返回 fallback） */
export function zhOfPatched(table: ZhTable, id: string, fallback: string): string {
  return table.zhById.get(id) || fallback;
}
