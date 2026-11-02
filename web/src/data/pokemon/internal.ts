/* 模块内共享常量与辅助（自 data/pokemon.ts 拆出：排序/形态/特性文案等非端点逻辑） */
import { table, type Row } from "../core";

const GAME_ORDER = [
  "sword-shield",
  "brilliant-diamond-shining-pearl",
  "legends-arceus",
  "scarlet-violet",
  "legends-za",
];
const GAME_RANK = new Map(GAME_ORDER.map((x, i) => [x, i]));

const TRIGGER_ZH: Record<string, string> = {
  "level-up": "等级提升",
  trade: "连接交换",
  "use-item": "使用道具",
  shed: "脱皮",
  spin: "旋转",
  "tower-of-darkness": "恶之塔",
  "three-critical-hits": "3次会心",
  "damage-location": "特定地点受伤",
  "agile-style-move": "迅疾招式",
  "strong-style-move": "刚猛招式",
  "recoil-damage": "反动伤害",
};
const _NATURE_ZH: Record<number, string> = {
  1: "勤奋",
  2: "怕寂寞",
  3: "勇敢",
  4: "固执",
  5: "顽皮",
  6: "大胆",
  7: "坦率",
  8: "悠闲",
  9: "淘气",
  10: "乐天",
  11: "胆小",
  12: "急躁",
  13: "认真",
  14: "爽朗",
  15: "天真",
  16: "内敛",
  17: "慢吞吞",
  18: "冷静",
  19: "害羞",
  20: "马虎",
  21: "温和",
  22: "温顺",
  23: "自大",
  24: "慎重",
  25: "浮躁",
};
export const FORM_MARKER_TO_SUFFIX: Record<string, string> = {
  A: "alola",
  G: "galar",
  H: "hisui",
  P: "paldea",
  W: "white-striped",
  B: "blue-striped",
  D: "dusk",
  Mn: "midnight",
  N: "midday",
  L: "low-key",
  F: "female",
  M: "male",
  GM: "gmax",
  PA: "paldea-combat-breed",
  PB: "paldea-blaze-breed",
  PC: "paldea-aqua-breed",
};
const SUFFIX_REGION_ZH: Record<string, string> = {
  alola: "阿罗拉",
  galar: "伽勒尔",
  hisui: "洗翠",
  paldea: "帕底亚",
};
export const GAME_MOVE_CONFIG: Record<
  string,
  { vg: number; tm_vgs: number[]; tabs: Array<[string, string]> }
> = {
  "sword-shield": {
    vg: 20,
    tm_vgs: [20],
    tabs: [
      ["level", "升级"],
      ["machine", "招式学习器"],
      ["egg", "蛋招式"],
      ["tutor", "教授"],
    ],
  },
  "brilliant-diamond-shining-pearl": {
    vg: 23,
    tm_vgs: [23],
    tabs: [
      ["level", "升级"],
      ["machine", "招式学习器"],
      ["egg", "蛋招式"],
      ["tutor", "教授"],
    ],
  },
  "legends-arceus": {
    vg: 24,
    tm_vgs: [],
    tabs: [
      ["level", "升级"],
      ["tutor", "教授"],
    ],
  },
  "scarlet-violet": {
    vg: 25,
    tm_vgs: [25],
    tabs: [
      ["level", "升级"],
      ["evolution-recall", "进化&回忆"],
      ["machine", "招式学习器"],
      ["egg", "蛋招式"],
    ],
  },
  "legends-za": {
    vg: 30,
    tm_vgs: [30, 31],
    tabs: [
      ["level", "升级"],
      ["machine", "招式学习器"],
    ],
  },
};
const EVOLUTION_RECALL_GAMES = new Set(["scarlet-violet"]);
const TYPE_ORDER = [
  "一般",
  "火",
  "水",
  "电",
  "草",
  "冰",
  "格斗",
  "毒",
  "地面",
  "飞行",
  "超能力",
  "虫",
  "岩石",
  "幽灵",
  "龙",
  "恶",
  "钢",
  "妖精",
];

export function typeSort(types: string | undefined): string {
  const parts = (types || "").split(",").filter(Boolean);
  parts.sort((a, b) => {
    const ra = TYPE_ORDER.indexOf(a),
      rb = TYPE_ORDER.indexOf(b);
    return (ra === -1 ? 99 : ra) - (rb === -1 ? 99 : rb);
  });
  return parts.join(",");
}
export function cmpStr(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
export function gameOrderCmp(a: string, b: string): number {
  return (GAME_RANK.get(a) ?? 99) - (GAME_RANK.get(b) ?? 99);
}

// ---- 形态工具 ----
export async function formsOfSpecies(sid: number): Promise<Row[]> {
  // 克隆：detail 会往 form 行挂 ability_list，不得污染 core 表缓存
  const forms = (await table("forms"))
    .filter((f) => f.species_id === sid)
    .map((f) => Object.assign({}, f));
  forms.sort((a, b) => b.is_default - a.is_default || a.id - b.id);
  return forms;
}
export function formBySuffix(speciesForms: Row[], suffix: string): Row | null {
  if (!suffix) {
    return speciesForms.find((f) => f.is_default) || null;
  }
  const cands = speciesForms.filter(
    (f) =>
      (f.identifier || "").endsWith("-" + suffix) ||
      (f.identifier || "").includes("-" + suffix + "-"),
  );
  cands.sort((a, b) => (a.identifier || "").length - (b.identifier || "").length);
  return cands[0] || null;
}

// ---- 特性文案 ----
export async function abilitiesOf(form: Row) {
  const abils = (form.abilities || "").split(",").filter(Boolean);
  const hidden = new Set((form.hidden_abilities || "").split(",").filter(Boolean));
  const prose = new Map((await table("abilities")).map((r) => [r.name_zh, r]));
  return abils.map((a: string) => {
    const p = prose.get(a) || ({} as Row);
    return {
      name: a,
      hidden: hidden.has(a),
      intro: p.intro || "",
      effect: p.effect || "",
      extra: p.extra ? JSON.parse(p.extra || "[]") : [],
    };
  });
}

// ---- 进化条件文本（_evo_condition 移植） ----
export function decodeNatures(mask: any): string[] {
  const m = parseInt(mask, 10);
  if (!Number.isFinite(m)) return [];
  const out: string[] = [];
  for (let i = 0; i < 25; i++) if (m & (1 << i)) out.push(_NATURE_ZH[i + 1]!);
  return out;
}
export { SUFFIX_REGION_ZH, TRIGGER_ZH, EVOLUTION_RECALL_GAMES };
