/**
 * 队伍层 —— Showdown 文本导入/导出/剪贴板（FR-04）与合法性校验（FR-05）。
 * 解析/序列化复用引擎 Teams；校验复用 TeamValidator（错误文案翻译为简中）。
 */
import { Dex, TeamValidator, Teams, toID } from "../engine-adapter";
import { zhLine, zhText } from "../data";
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
    （PS 解析器宽松：任意首行都会被当作物种名，需用 Dex 存在性过滤垃圾文本）。 */
export function importShowdown(text: string): PokemonSet[] | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  try {
    const sets = Teams.import(trimmed);
    if (!sets || sets.length === 0) return null;
    const real = sets.filter((s) => Dex.forFormat("gen9").species.get(s.species).exists);
    return real.length > 0 ? sets : null;
  } catch {
    return null;
  }
}

/** sets → Showdown 队伍文本（导出）。 */
export function exportShowdown(sets: PokemonSet[]): string {
  if (sets.length === 0) return "";
  try {
    return Teams.export(sets).trim();
  } catch {
    return sets.map((s) => Teams.export([s]).trim()).join("\n\n");
  }
}

/** 单只默认模板（编辑器新建起点；物种用小写 id，与选择器 option value 一致） */
export function blankSet(species = "garchomp"): PokemonSet {
  return {
    name: "",
    species,
    item: "",
    ability: "",
    moves: ["", "", "", ""],
    nature: "Serious",
    evs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
    ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 },
    level: 50,
  };
}

const VALIDATOR_MSG_ZH: Array<[RegExp, string]> = [
  [
    /You must bring at least (\d+) Pokémon \(your team has (\d+)\)\./,
    "队伍至少需要 $1 只（当前 $2 只）",
  ],
  [/(.+) needs to have an ability\./, "$1 未选择特性"],
  [/(.+?) has more than (\d+) Stat Points in (\w+)/, "$1 的$3努力值超过 $2 点上限"],
  [
    /IVs are not maxed out, but this format requires all IVs to be 31/,
    "的个体值必须全为 31（该赛制不支持 IV 调整）",
  ],
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
    /has exactly 0 Stat Points - did you forget to invest it\? \(If this was intentional, change your Nature to a different neutral Nature, which won't change its stats but will tell us that it wasn't a mistake\)\.?/,
    "努力值合计为 0——是否忘记分配？（如确有意为之，请把性格改为其他中立性格，效果不变但能表明非遗漏）",
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
    /(.+?) has exactly 0 Stat Points - did you forget to invest it\? If this was intentional, change its Nature to a different neutral Nature, which won't change its stats but will tell us that it wasn't a mistake\./,
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

/** 校验消息里的英文专名（$1 捕获值）转中文：物种/道具/特性/招式名查表，未命中保留原文 */
function zhCapture(raw: string): string {
  const id = toID(raw);
  if (!id) return raw;
  const zh = zhText();
  const hit =
    zh.Pokedex[id]?.name ?? zh.Items[id]?.name ?? zh.Abilities[id]?.name ?? zh.Moves[id]?.name;
  return hit || raw;
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
