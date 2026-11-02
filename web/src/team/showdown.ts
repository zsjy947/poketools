/**
 * 队伍层 —— Showdown 文本导入/导出/剪贴板（FR-04）与合法性校验（FR-05）。
 * 解析/序列化复用引擎 Teams；校验复用 TeamValidator（错误文案翻译为简中）。
 */
import { Dex, TeamValidator, Teams, toID } from "../engine-adapter";
import { TYPE_ZH, zhLine, zhText } from "../data";
import { ZH_ITEMS_GEN, ZH_SPECIES_GEN } from "../data/zh-gen";
import type { Format, PokemonSet } from "../engine-adapter";

export type { PokemonSet };

export interface TeamSlot {
  /** 槽位标识（阵营 A / B） */
  key: "A" | "B";
  name: string;
  sets: PokemonSet[];
  updatedAt: number;
}

export function emptyTeam(key: "A" | "B"): TeamSlot {
  return {
    key,
    name: key === "A" ? "阵营 A 队伍" : "阵营 B 队伍",
    sets: [],
    updatedAt: Date.now(),
  };
}

/** Showdown 队伍文本 → sets。返回 null 表示无法解析任何「物种真实存在」的条目
    （PS 解析器宽松：任意首行都会被当作物种名，需用 Dex 存在性过滤垃圾文本）。
    昵称对模拟对战无意义：导入时静默丢弃（引擎显示名恒为种名）。 */

/* ---- RM-21：中文 PokePaste 导入（中文名 → 引擎可解析名 的行级预处理） ---- */

/** 性格中文 → identifier（构建期自 data/natures 表生成，25 条） */
export const ZH_NATURE_ID: Record<string, string> = {
  勤奋: "hardy",
  大胆: "bold",
  内敛: "modest",
  温和: "calm",
  胆小: "timid",
  怕寂寞: "lonely",
  坦率: "docile",
  慢吞吞: "mild",
  温顺: "gentle",
  急躁: "hasty",
  固执: "adamant",
  淘气: "impish",
  害羞: "bashful",
  慎重: "careful",
  马虎: "rash",
  爽朗: "jolly",
  顽皮: "naughty",
  乐天: "lax",
  浮躁: "quirky",
  天真: "naive",
  勇敢: "brave",
  悠闲: "relaxed",
  冷静: "quiet",
  自大: "sassy",
  认真: "serious",
};

interface ZhMaps {
  species: Map<string, string>;
  moves: Map<string, string>;
  items: Map<string, string>;
  abilities: Map<string, string>;
  types: Map<string, string>;
}

let ZH_MAPS: ZhMaps | null = null;

function zhMaps(): ZhMaps {
  if (ZH_MAPS) return ZH_MAPS;
  const species = new Map<string, string>();
  const moves = new Map<string, string>();
  const items = new Map<string, string>();
  const abilities = new Map<string, string>();
  const types = new Map<string, string>();
  const put = (map: Map<string, string>, name: string, id: string) => {
    const txt = String(name || "");
    if (/[一-鿿]/.test(txt) && id && !map.has(txt)) map.set(txt, id);
  };
  // loadTextData 未进 vendor d.ts 表面——此处经 any 收窄（引擎运行时可用，zh-cn 全量名）
  const td = (
    Dex as unknown as {
      loadTextData?: (lang: string) => {
        Pokedex: Record<string, { name?: string }>;
        Moves: Record<string, { name?: string }>;
        Items: Record<string, { name?: string }>;
        Abilities: Record<string, { name?: string }>;
      };
    }
  ).loadTextData?.("zh-cn");
  if (td) {
    for (const [id, row] of Object.entries(td.Pokedex)) put(species, row.name ?? "", id);
    for (const [id, row] of Object.entries(td.Moves)) put(moves, row.name ?? "", id);
    for (const [id, row] of Object.entries(td.Items)) put(items, row.name ?? "", id);
    for (const [id, row] of Object.entries(td.Abilities)) put(abilities, row.name ?? "", id);
  }
  for (const [id, zhName] of Object.entries(ZH_SPECIES_GEN)) {
    if (!species.has(zhName)) species.set(zhName, id);
  }
  // 进化石等引擎 zh-cn 占位道具（zh-gen curated 反向补）
  for (const [id, zhName] of Object.entries(ZH_ITEMS_GEN)) {
    if (!items.has(zhName)) items.set(zhName, id);
  }
  for (const [en, zhName] of Object.entries(TYPE_ZH)) {
    if (/[一-鿿]/.test(zhName)) types.set(zhName, en);
  }
  ZH_MAPS = { species, moves, items, abilities, types };
  return ZH_MAPS;
}

/** 物种段解析（F-01）：整段查表 →（含 " (" 时）外段、内段依次回退——覆盖中文习惯
 *  「种名 (昵称)」（外段=物种）与 PS 标准「昵称 (种名)」（内段=物种）两种写法；
 *  全部未命中返回 undefined，由调用方保留原文（不得产出 undefined 污染下游）。 */
function resolveZhSpecies(sp: string, m: ZhMaps): string | undefined {
  const whole = m.species.get(sp);
  if (whole) return whole;
  const at = sp.indexOf(" (");
  if (at < 0) return undefined;
  const outer = sp.slice(0, at).trim();
  const inner = sp
    .slice(at + 2)
    .replace(/\)$/, "")
    .trim();
  return m.species.get(outer) ?? m.species.get(inner);
}

/** 行级预处理：物种/道具/招式/特性/太晶属性/性格/性别 中文名 → 引擎可解析形式。 */
export function preprocessChineseTeam(text: string): string {
  if (!/[一-鿿]/.test(text)) return text;
  const m = zhMaps();
  const lines = text.split("\n").map((line) => {
    const t = line.trim();
    if (t.startsWith("Ability:")) {
      const v = t.slice("Ability:".length).trim();
      return "Ability: " + (m.abilities.get(v) ?? v);
    }
    if (t.startsWith("Tera Type:")) {
      const v = t.slice("Tera Type:".length).trim();
      return "Tera Type: " + (m.types.get(v) ?? v);
    }
    if (t.startsWith("Nature:")) {
      const v = t.slice("Nature:".length).trim();
      return "Nature: " + (ZH_NATURE_ID[v] ?? v);
    }
    if (t.startsWith("Gender:")) {
      const v = t.slice("Gender:".length).trim();
      return "Gender: " + (v === "雄性" || v === "公" ? "M" : v === "雌性" || v === "母" ? "F" : v);
    }
    if (t.startsWith("- ")) {
      const mv = t.slice(2).trim();
      return "- " + (m.moves.get(mv) ?? mv);
    }
    if (t.includes(" @ ")) {
      const at = t.indexOf(" @ ");
      const sp = t.slice(0, at).trim();
      const item = t.slice(at + 3).trim();
      return (resolveZhSpecies(sp, m) ?? sp) + " @ " + (m.items.get(item) ?? item);
    }
    if (t && !/^[A-Za-z0-9(]/.test(t)) {
      return resolveZhSpecies(t, m) ?? t;
    }
    return line;
  });
  return lines.join("\n");
}

/** importShowdownDetailed 返回形状（F-01）：sets = 物种真实存在的合法成员；
 *  failedLines = 未识别成员的物种行原文（预处理后文本），不入队、供调用方提示跳过。 */
export interface ImportShowdownResult {
  sets: PokemonSet[];
  failedLines: string[];
}

/** 详细版导入：逐成员区分成功/失败。返回 null 表示整体无法解析；
 *  部分失败时保留合法成员并把失败行收集进 failedLines（不再整队混入垃圾条目）。 */
export function importShowdownDetailed(text: string): ImportShowdownResult | null {
  const trimmed = preprocessChineseTeam(text.trim());
  if (!trimmed) return null;
  try {
    const parsed = Teams.import(trimmed);
    if (!parsed || parsed.length === 0) return null;
    // PokePaste 按空行分块、块首行即物种行——失败成员回溯对应块的首行原文
    const blocks = trimmed
      .split(/\n\s*\n/)
      .map((b) => b.trim())
      .filter(Boolean);
    const dex = Dex.forFormat("gen9");
    const sets: PokemonSet[] = [];
    const failedLines: string[] = [];
    for (let i = 0; i < parsed.length; i++) {
      const s = parsed[i]!;
      if (dex.species.get(s.species).exists) sets.push({ ...s, name: "" });
      else failedLines.push(((blocks[i] ?? s.species) as string).split("\n")[0]!.trim());
    }
    return { sets, failedLines };
  } catch {
    return null;
  }
}

export function importShowdown(text: string): PokemonSet[] | null {
  const r = importShowdownDetailed(text);
  return r && r.sets.length > 0 ? r.sets : null;
}

/** sets → Showdown 队伍文本（导出）。昵称不再产出（统一以中文种名示人）。 */
export function exportShowdown(sets: PokemonSet[]): string {
  const anon = sets.map((s) => ({ ...s, name: "" }));
  if (anon.length === 0) return "";
  try {
    return Teams.export(anon).trim();
  } catch {
    return anon.map((s) => Teams.export([s]).trim()).join("\n\n");
  }
}

/** 单只默认模板（编辑器新建起点；物种用小写 id，与选择器 option value 一致；
 *  等级 = 当前赛制默认（冠军/朱紫系 50，自由对战 100）） */
export function blankSet(species = "garchomp", level = 50): PokemonSet {
  return {
    name: "",
    species,
    item: "",
    ability: "",
    moves: ["", "", "", ""],
    nature: "Serious",
    evs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
    ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 },
    level,
  };
}

/** 等级输入归一：任意整数键入立即生效（1~100 clamp）；空串/非数字视为中间态回退默认。
 *  受控输入值与显示值恒一致——不做「值等于默认时回退显示」一类的条件分支。 */
export function normalizeLevelInput(raw: string, fallback: number): number {
  if (raw.trim() === "") return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(1, Math.min(100, Math.round(n)));
}

const VALIDATOR_MSG_ZH: Array<[RegExp, string]> = [
  [
    /You must bring at least (\d+) Pokémon \(your team has (\d+)\)\./,
    "队伍至少需要 $1 只（当前 $2 只）",
  ],
  [/(.+) needs to have an ability\./, "$1 未选择特性"],
  [/(.+?) has more than (\d+) Stat Points in (\w+)/, "$1 的$3努力值超过 $2 点上限"],
  [
    /^(.+?)'s IVs are not maxed out, but this format requires all IVs to be 31/,
    "$1 的个体值必须全为 31（该赛制不支持 IV 调整）",
  ],
  [
    /(.+?) is only obtainable from events - it needs to match one of its events:/,
    "$1 只能通过配信活动获得，必须匹配以下活动之一：",
  ],
  [
    /(.+?) must have 31 HP IVs to be from its event #(\d+)\./,
    "$1 的 HP 个体值必须为 31 才能匹配活动 #$2",
  ],
  [/(.+?) can't have (.+?)\.?$/, "$1 不能拥有特性「$2」"],
  [
    /(.+?) has (\d+) total Stat Points, which is more than this format's limit of (\d+)/,
    "$1 努力值总和 $2 点，超过该赛制上限 $3 点",
  ],
  [/(.+?) has too many total Stat Points/, "$1 的努力值总和超限"],
  [
    /(.+?) has exactly (\d+) EVs, but this format does not restrict you to (\d+) EVs/,
    "$1 努力值合计 $2 点为非常规分配（如确有意为之，请分配满 $3 点或在任一项加 1 点）",
  ],
  [/(.+?)'s item (.+?) does not exist in Gen 9/, "$1 的道具「$2」在该赛制不可用"],
  [/(.+?)'s ability (.+?) does not exist in Gen 9/, "$1 的特性「$2」在该赛制不可用"],
  [/(.+?)'s move (.+?) does not exist in Gen 9/, "$1 的招式「$2」在该赛制不可用"],
  [/(.+?) does not exist in Gen 9\./, "$1 在该赛制不存在"],
  [
    /You are limited to 1 of each item by Item Clause\. \(You have more than 1 (.+?)\)/,
    "道具条款：每种道具限 1 个（「$1」重复了）",
  ],
  [/can't learn (.+?)\.?$/, "无法学会招式「$1」"],
  [/\((.+)\) has evolutions it hasn't evolved to/, "（$1）存在未完成的进化，请使用最终形态"],
  [/is banned by rule (.+)/, "被规则「$1」禁止"],
  [/is not obtainable in this format/, "在该赛制不可获得"],
  [/is restricted to 2 restricted Legendary Pokémon/, "受限传说宝可梦超过 2 只"],
  [/has duplicated items/, "存在重复道具（道具条款）"],
  [/is banned/, "被禁用"],
  [
    /has no moves \(it must have at least one to be usable\)\.?/,
    "未选择任何招式（至少需要 1 个才能参战）",
  ],
  [
    /(.+?) has exactly 0 EVs - did you forget to EV it\? \(If this was intentional, add exactly 1 to one of your EVs, which won't change its stats but will tell us that it wasn't a mistake\)\.?/,
    "$1 努力值合计为 0——是否忘记分配？（如确有意为之，请在任一项努力值加 1 点，效果不变但能表明非遗漏）",
  ],
  [/The Pokemon "(.+?)" does not exist\./, "宝可梦「$1」不存在"],
  [/has too many moves/, "招式数量超过上限"],
  [/(.+?) has more than four moves/, "$1 的招式超过 4 个"],
  [/must have exactly four moves/, "必须恰好 4 个招式"],
  [/(.+?) has an illegal move combination/, "$1 存在不合法的招式组合"],
  [/(.+?) is not legal/, "$1 不合法"],
  [
    /(.+?) \((.+?)\) must not be nicknamed a different Pokémon species than what it actually is/,
    "$1 的昵称与实际种名不符（实际为 $2）——请修改昵称或清除昵称",
  ],
  [
    /(.+?) has exactly 0 Stat Points - did you forget to invest it\? \(If this was intentional, change your Nature to a different neutral Nature, which won't change its stats but will tell us that it wasn't a mistake\)\.?/,
    "$1 努力值合计为 0——是否忘记分配？（如确有意为之，请把性格改为其他中立性格，效果不变但能表明非遗漏）",
  ],
  [/^You are limited to 1 of each item by Item Clause\.$/, "道具条款：每种道具限 1 个"],
  [/^\(You have more than 1 (.+?)\)$/, "「$1」重复了（道具条款）"],
  [/(.+?) is an invalid move\./, "招式「$1」无效"],
  [
    /You are limited to one of each Pokémon by Species Clause\. \(You have more than one (.+?)\)/,
    "同种条款：每种宝可梦限 1 只（「$1」重复了）",
  ],
  [/^You are limited to one of each Pokémon by Species Clause\.$/, "同种条款：每种宝可梦限 1 只"],
  [/^\(You have more than one (.+?)\)$/, "「$1」重复（同种条款）"],
];

/** 能力键英文 → 中文（校验消息的 Stat Points in {Special/Speed/...} 捕获值） */
const STAT_KEY_ZH: Record<string, string> = {
  hp: "HP",
  atk: "攻击",
  def: "防御",
  spa: "特攻",
  spd: "特防",
  spe: "速度",
  special: "特攻",
  specialattack: "特攻",
  specialdefense: "特防",
  speed: "速度",
  attack: "攻击",
  defense: "防御",
};

export function translateValidatorError(input: string): string {
  /* 校验器把「昵称 (英文真名)」连写（如 "雷丘 (Garchomp) has …"）——先剥掉英文真名括号，
     消息主体即可被下述模式命中；昵称违规消息的括号内是中文名，不受此影响 */
  const msg = input.replace(/ \([A-Za-z][A-Za-z0-9 -]*\)(?= (?:has |needs |is |can't|must ))/g, "");
  for (const [re, zh] of VALIDATOR_MSG_ZH) {
    const m = msg.match(re);
    if (m) {
      let out = zh;
      for (let i = 1; i < m.length; i++) {
        const raw = m[i] ?? "";
        const cap = STAT_KEY_ZH[raw.toLowerCase()] ?? zhCapture(raw);
        out = out.replace(`$${i}`, cap);
      }
      return out;
    }
  }
  return zhLine(msg);
}

/** 校验消息里的英文专名（$1 捕获值）转中文：生成表优先（引擎 zh-cn 占位值如
 *  Ogerpon-Teal 由生成表覆盖），再查物种/道具/特性/招式引擎表，未命中保留原文 */
function zhCapture(raw: string): string {
  const id = toID(raw);
  if (!id) return raw;
  const gen = ZH_SPECIES_GEN[id] ?? ZH_ITEMS_GEN[id];
  if (gen) return gen;
  const zh = zhText();
  const engine =
    zh.Pokedex[id]?.name ?? zh.Items[id]?.name ?? zh.Abilities[id]?.name ?? zh.Moves[id]?.name;
  if (engine && /[一-鿿]/.test(engine)) return engine;
  return engine || raw;
}

export interface ValidationResult {
  ok: boolean;
  /** 中文错误列表（空 = 合法） */
  errors: string[];
}

/** 按赛制校验队伍（FR-05：物种禁用/能限/条款/等级/学习表合法性，中文提示）。 */
export async function validateTeam(
  formatId: string,
  sets: PokemonSet[],
): Promise<ValidationResult> {
  if (sets.length === 0) return { ok: false, errors: ["队伍为空"] };
  Dex.includeFormats();
  const format = Dex.formats.get(formatId) as Format;
  if (!(format as { exists?: boolean }).exists) {
    return { ok: false, errors: [`赛制不存在：${formatId}`] };
  }
  try {
    const validator = TeamValidator.get(format);
    const problems = await validator.validateTeam(sets);
    if (problems === null) return { ok: true, errors: [] };
    // 空特性会同时触发「No Ability 不存在」与「needs to have an ability」两条，
    // 前者整条含 No Ability 的报错丢弃，只留中文化的未选择特性提示
    const filtered = problems.filter(
      (m) => !/No Ability/.test(m) || !problems.some((x) => /needs to have an ability/.test(x)),
    );
    return { ok: false, errors: filtered.map(translateValidatorError) };
  } catch (e) {
    return { ok: false, errors: [`校验器异常：${String(e)}`] };
  }
}

/** 队伍文本往返无损校验（导入→导出→再导入，DoD ≥10 用例见 tests/） */
export function roundtripLossless(text: string): boolean {
  const first = importShowdown(text);
  if (!first) return false;
  const exported = exportShowdown(first);
  const second = importShowdown(exported);
  if (!second || second.length !== first.length) return false;
  return second.every((s, i) => {
    const a = first[i];
    return (
      !!a &&
      toID(s.species) === toID(a.species) &&
      (s.moves ?? []).map(toID).join(",") === (a.moves ?? []).map(toID).join(",")
    );
  });
}
