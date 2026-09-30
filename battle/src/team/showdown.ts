/**
 * 队伍层 —— Showdown 文本导入/导出/剪贴板（FR-04）与合法性校验（FR-05）。
 * 解析/序列化复用引擎 Teams；校验复用 TeamValidator（错误文案翻译为简中）。
 */
import { Dex, TeamValidator, Teams, toID } from "../engine-adapter";
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

/** 单只默认模板（编辑器新建起点） */
export function blankSet(species = "Garchomp"): PokemonSet {
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
  [/has more than (\d+) Stat Points in (\w+)/, "的 $2 努力值超过 $1 点上限"],
  [
    /IVs are not maxed out, but this format requires all IVs to be 31/,
    "的个体值必须全为 31（该赛制不支持 IV 调整）",
  ],
  [/has too many total Stat Points/, "的努力值总和超限"],
  [/'s item (.+) does not exist in Gen 9/, "的道具「$1」在该赛制不可用"],
  [/'s ability (.+) does not exist in Gen 9/, "的特性「$1」在该赛制不可用"],
  [/'s move (.+) does not exist in Gen 9/, "的招式「$1」在该赛制不可用"],
  [/\((.+)\) has evolutions it hasn't evolved to/, "（$1）存在未完成的进化，请使用最终形态"],
  [/is banned by rule (.+)/, "被规则「$1」禁止"],
  [/is not obtainable in this format/, "在该赛制不可获得"],
  [/is restricted to 2 restricted Legendary Pokémon/, "受限传说宝可梦超过 2 只"],
  [/has duplicated items/, "存在重复道具（道具条款）"],
  [/is banned/, "被禁用"],
];

function translateValidatorError(msg: string): string {
  for (const [re, zh] of VALIDATOR_MSG_ZH) {
    const m = msg.match(re);
    if (m) {
      let out = zh;
      for (let i = 1; i < m.length; i++) out = out.replace(`$${i}`, m[i] ?? "");
      return out;
    }
  }
  return msg;
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
    return { ok: false, errors: problems.map(translateValidatorError) };
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
