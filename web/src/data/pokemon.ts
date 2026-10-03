/* 图鉴/详情端点（唯一实现，自 app/routers/pokemon.py + dex.py 逐行移植的 JS 版 TS 化）。
 * 分片来自 tables/*（行序=SQLite rowid 序，与 SQL 查询序一致性由导出门禁把关）。 */
import { table, encountersOf, learnsetsByVg, type Row } from "./core";
import { caughtMap } from "../state/user";

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
function cmpStr(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
function gameOrderCmp(a: string, b: string): number {
  return (GAME_RANK.get(a) ?? 99) - (GAME_RANK.get(b) ?? 99);
}

// ---- 形态工具 ----
async function formsOfSpecies(sid: number): Promise<Row[]> {
  // 克隆：detail 会往 form 行挂 ability_list，不得污染 core 表缓存
  const forms = (await table("forms"))
    .filter((f) => f.species_id === sid)
    .map((f) => Object.assign({}, f));
  forms.sort((a, b) => b.is_default - a.is_default || a.id - b.id);
  return forms;
}
function formBySuffix(speciesForms: Row[], suffix: string): Row | null {
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
async function abilitiesOf(form: Row) {
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
function decodeNatures(mask: any): string[] {
  const m = parseInt(mask, 10);
  if (!Number.isFinite(m)) return [];
  const out: string[] = [];
  for (let i = 0; i < 25; i++) if (m & (1 << i)) out.push(_NATURE_ZH[i + 1]!);
  return out;
}
function evoCondition(row: Row): string {
  const trig = row.trigger;
  const parts: string[] = [];
  if (trig === "level-up") parts.push(row.min_level ? `Lv.${row.min_level}` : "升级");
  else if (trig === "use-item") parts.push(row.item ? `使用${row.item}` : "使用道具");
  else if (trig === "trade")
    parts.push(row.trade_species ? `与${row.trade_species}交换` : "连接交换");
  else parts.push(TRIGGER_ZH[trig as string] !== undefined ? TRIGGER_ZH[trig as string]! : trig);
  if (row.held_item) parts.push(`携带${row.held_item}`);
  if (row.min_happiness) parts.push(`亲密度≥${row.min_happiness}`);
  if (row.min_affection) parts.push(`友好度≥${row.min_affection}`);
  if (row.known_move) parts.push(`学会${row.known_move}`);
  if (row.time_of_day) {
    parts.push(
      ({ day: "白天", night: "夜晚", dusk: "黄昏" } as Record<string, string>)[row.time_of_day] ||
        row.time_of_day,
    );
  }
  if (row.needs_overworld_rain) parts.push("下雨时");
  if (row.turn_upside_down) parts.push("倒置主机");
  if (row.location) parts.push(`在${row.location}`);
  if (row.region) parts.push(`在${row.region}地区`);
  if (row.gender) parts.push(`${row.gender}限定`);
  if (row.known_move_type) parts.push(`学会${row.known_move_type}属性招式`);
  if (row.relative_physical_stats !== null && row.relative_physical_stats !== undefined) {
    parts.push(
      ({ 1: "攻击>防御", 0: "攻击=防御", "-1": "攻击<防御" } as Record<string, string>)[
        String(row.relative_physical_stats)
      ] || "",
    );
  }
  if (row.party_species) parts.push(`队伍中有${row.party_species}`);
  if (row.party_type) parts.push(`队伍中有${row.party_type}属性宝可梦`);
  if (row.near_special_rock) {
    parts.push(row.to_species === 471 ? "在冰岩石附近" : "在苔藓岩石附近");
  }
  if (row.min_beauty) parts.push(`美丽≥${row.min_beauty}`);
  if (row.needs_multiplayer) parts.push("联机游玩时");
  if (row.min_move_count) parts.push(`特定招式累计使用${row.min_move_count}次`);
  if (row.min_steps) parts.push(`同行走${row.min_steps}步`);
  if (row.min_damage_taken) parts.push(`累计受到伤害≥${row.min_damage_taken}`);
  if (row.nature_bitmask) parts.push("性格：" + decodeNatures(row.nature_bitmask).join("、"));
  return parts.filter(Boolean).join("，");
}

export interface EvolutionTree {
  root: number | null;
  nodes: Record<number, any>;
  children: Record<number, number[]>;
  conds: Record<string, string>;
  branched?: boolean;
}

// ---- 进化家族树（_evolution_chain 移植） ----
export async function evolutionChain(
  speciesId: number,
  formSuffix: string,
): Promise<EvolutionTree> {
  const speciesRows = await table("species");
  const byId = new Map(speciesRows.map((s) => [s.id, s]));
  const sp = byId.get(speciesId);
  if (!sp) return { root: null, nodes: {}, children: {}, conds: {} };
  const seen = new Set([speciesId]);
  let cur = sp;
  while (cur.evolves_from) {
    if (seen.has(cur.evolves_from)) break;
    seen.add(cur.evolves_from);
    const next = byId.get(cur.evolves_from);
    if (!next) break;
    cur = next;
  }
  const root = cur.id;

  const allForms = await table("forms");
  const formsOf = (sid: number) => allForms.filter((f) => f.species_id === sid);
  const evolutions = await table("evolutions");
  /* 家族全集（含根及其全部后代）——curated 分支键是分支基（如皮卡丘 25），
     不一定是真正的家族根（皮丘 172），因此按成员集合匹配而非只比根 */
  const family = new Set<number>([root]);
  const queue = [root];
  while (queue.length) {
    const sid = queue.pop()!;
    for (const r of evolutions) {
      if (r.from_species === sid && !family.has(r.to_species)) {
        family.add(r.to_species);
        queue.push(r.to_species);
      }
    }
  }

  // 地区形态分支（curated）
  const branches = new Map<string, Array<[number, string]>>();
  for (const r of await table("evo_branches")) {
    if (!family.has(Number(r.family_key))) continue;
    if (!branches.has(r.branch)) branches.set(r.branch, []);
    branches.get(r.branch)!.push([r.species_id, r.form_suffix]);
  }
  if (branches.size) {
    const sel = [speciesId, formSuffix || ""];
    let chosen: Array<[number, string]> | null = null;
    for (const toks of branches.values()) {
      if (toks.some((t) => t[0] === sel[0] && t[1] === sel[1])) {
        chosen = toks;
        break;
      }
    }
    if (chosen === null) {
      for (const toks of branches.values()) {
        if (toks.length && toks[0]![1] === "") {
          chosen = toks;
          break;
        }
      }
    }
    if (chosen !== null) {
      const nodes: Record<number, any> = {},
        children: Record<number, number[]> = {},
        conds: Record<string, string> = {};
      const chosenIds = [...new Set(chosen.map((t) => t[0]))];
      let prev: [number, string] | null = null;
      const baseSuf = chosen[0]![1];
      for (const [sid, suf] of chosen) {
        const f = formBySuffix(formsOf(sid), suf);
        nodes[sid] = {
          species_id: sid,
          name: (byId.get(sid) || { name_zh: String(sid) }).name_zh,
          form_id: f ? f.id : 0,
          types: f ? f.types || "" : "",
          form_suffix: suf,
        };
        if (prev !== null) {
          (children[prev[0]] = children[prev[0]] || []).push(sid);
          /* PokeAPI 对地区形态进化常只建一行（region=阿罗拉等）：默认分支要选无地区行，
             地区分支选 region 匹配行；都没有时回退首行并剥掉条件文本里的地区后缀 */
          const cand = evolutions.filter(
            (e) => e.from_species === prev![0] && e.to_species === sid,
          );
          const sufRegion = SUFFIX_REGION_ZH[suf];
          const picked = sufRegion
            ? cand.find((e) => e.region === sufRegion) ||
              cand.find((e) => !e.region) ||
              cand[0] ||
              null
            : cand.find((e) => !e.region) || null;
          let cond = picked ? evoCondition(picked) : cand.length ? evoCondition(cand[0]!) : "进化";
          /* 默认分支：条件文本一律剥掉地区后缀（PokeAPI 地区形态单行缺陷） */
          if (!sufRegion) {
            cond = cond.replace(/，?在[\u4e00-\u9fa5]+地区/g, "");
          }
          const regionSuf = SUFFIX_REGION_ZH[suf] ? suf : SUFFIX_REGION_ZH[baseSuf] ? baseSuf : "";
          if (
            regionSuf &&
            (!picked || !picked.region) &&
            !cond.includes(SUFFIX_REGION_ZH[regionSuf]!)
          ) {
            const prefix = `在${SUFFIX_REGION_ZH[regionSuf]!}地区`;
            cond = cond && cond !== "进化" ? `${prefix}，${cond}` : `${prefix}进化`;
          }
          conds[`${prev[0]}|${sid}`] = cond;
        }
        prev = [sid, suf];
      }
      void chosenIds;
      return { root: chosen[0]![0], nodes, children, conds, branched: true };
    }
  }

  // 常规家族：根向下 BFS（evolutions/family 已在上方装载）
  const nodes: Record<number, any> = {},
    children: Record<number, number[]> = {},
    conds: Record<string, string> = {};
  for (const sid of family) {
    const s = byId.get(sid);
    const f = formsOf(sid).find((x) => x.is_default) || null;
    nodes[sid] = {
      species_id: sid,
      name: s ? s.name_zh : String(sid),
      form_id: f ? f.id : 0,
      types: f ? f.types || "" : "",
    };
  }
  for (const r of evolutions) {
    if (family.has(r.from_species) && family.has(r.to_species)) {
      (children[r.from_species] = children[r.from_species] || []).push(r.to_species);
      const cond = evoCondition(r);
      const key = `${r.from_species}|${r.to_species}`;
      /* 同一进化多行时（PokeAPI 地区形态行带 region）：优先无地区行，其次保留更长文本 */
      if (
        conds[key] === undefined ||
        (conds[key]!.includes("地区") && !cond.includes("地区")) ||
        (!cond.includes("地区") &&
          !conds[key]!.includes("地区") &&
          cond.length > conds[key]!.length)
      ) {
        conds[key] = cond;
      }
    }
  }
  /* 常规链（无 curated 分支）：当前物种节点按所选形态切图（一家鼠/土龙节节/鬃岩狼人等
     同种多形态进化，进化前无对应形态） */
  if (formSuffix) {
    const f = formBySuffix(formsOf(speciesId), formSuffix);
    if (f && nodes[speciesId]) {
      nodes[speciesId] = {
        ...nodes[speciesId],
        form_id: f.id,
        types: f.types || "",
      };
    }
  }
  return { root, nodes, children, conds };
}

// ---- GET /api/games ----
export async function games(): Promise<any[]> {
  const gamesRows = (await table("games")).slice().sort((a, b) => a.sort - b.sort);
  const dexes = await table("regional_dexes");
  const entries = await table("dex_entries");
  const out = [];
  for (const gm of gamesRows) {
    let features: string[];
    try {
      features = JSON.parse(gm.features || "[]");
    } catch {
      features = [];
    }
    const myDexes = dexes
      .filter((d) => d.game_id === gm.id)
      .sort((a, b) => a.sort - b.sort)
      .map((d) => ({
        id: d.id,
        name_zh: d.name_zh,
        name_en: d.name_en,
        total: entries.filter((e) => e.dex_id === d.id).length,
      }));
    const row = Object.assign({}, gm);
    delete row.features;
    out.push(Object.assign(row, { features, dexes: myDexes }));
  }
  return out;
}

// ---- GET /api/dex/{dex_id} ----
export async function dexEntries(dexId: string, params?: any) {
  const p = params || {};
  const filter = p.filter || "all";
  const dexes = await table("regional_dexes");
  const gamesRows = await table("games");
  const dex = dexes.find((d) => d.id === dexId);
  if (!dex) throw new Error("dex not found");
  const game = gamesRows.find((x) => x.id === dex.game_id);
  const overrideMap = new Map(
    (await table("dex_default_forms"))
      .filter((r) => r.dex_id === dexId)
      .map((r) => [r.species_id, r.form_id]),
  );
  const allForms = await table("forms");
  const typesMap = new Map<number, [number, string]>();
  for (const f of allForms) {
    if (f.is_default) typesMap.set(f.species_id, [f.id, f.types || ""]);
  }
  const caught = caughtMap(dexId);
  const speciesRows = await table("species");
  const spById = new Map(speciesRows.map((s) => [s.id, s]));
  const entryRows = (await table("dex_entries"))
    .filter((e) => e.dex_id === dexId)
    .sort((a, b) => a.ndex - b.ndex);
  const qLower = (p.q || "").trim().toLowerCase();
  let entries = entryRows.map((e) => {
    const sp = spById.get(e.species_id) || ({} as Row);
    let [fid, tp] = typesMap.get(e.species_id) || [0, ""];
    const ofid = overrideMap.get(e.species_id);
    if (ofid) {
      const frow = allForms.find((f) => f.id === ofid);
      fid = ofid;
      tp = frow ? frow.types || "" : "";
    }
    return {
      ndex: e.ndex,
      species_id: e.species_id,
      name_zh: sp.name_zh,
      name_en: sp.name_en,
      types: typeSort(tp),
      form_id: fid,
      caught: caught.get(e.species_id) || false,
    };
  });
  if (filter === "caught") entries = entries.filter((e) => e.caught);
  else if (filter === "uncaught") entries = entries.filter((e) => !e.caught);
  if (p.type) entries = entries.filter((e) => e.types.split(",").includes(p.type));
  if (qLower) {
    entries = entries.filter((e) =>
      qLower.includes
        ? (e.name_zh || "").toLowerCase().includes(qLower) ||
          (e.name_en || "").toLowerCase().includes(qLower) ||
          qLower === String(e.ndex)
        : true,
    );
  }
  return {
    id: dex.id,
    name_zh: dex.name_zh,
    name_en: dex.name_en,
    game_id: dex.game_id,
    game_zh: game ? game.name_zh : null,
    total: entries.length,
    entries,
  };
}

// ---- GET /api/pokemon/{species_id} ----
export async function pokemonDetail(speciesId: number, params?: any) {
  const p = params || {};
  const game = p.game || "";
  const form = p.form || "";
  const dexParam = p.dex || "";
  const speciesRows = await table("species");
  const sp = speciesRows.find((s) => s.id === speciesId);
  if (!sp) throw new Error("species not found");

  let forms = await formsOfSpecies(speciesId);
  let defaultForm = forms.find((f) => f.is_default) || forms[0] || null;

  let dexDefaultSuffix = "";
  if (dexParam) {
    const ddf = (await table("dex_default_forms")).find(
      (r) => r.dex_id === dexParam && r.species_id === speciesId,
    );
    if (ddf) {
      const frow = forms.find((f) => f.id === ddf.form_id);
      if (frow) {
        const parts = (frow.identifier || "").split("-");
        dexDefaultSuffix = parts.length > 1 ? parts[parts.length - 1]! : "";
      }
    }
  }

  if (game) {
    const avail = new Map<number, Set<string>>();
    for (const r of await table("form_game_availability")) {
      if (!avail.has(r.form_id)) avail.set(r.form_id, new Set());
      avail.get(r.form_id)!.add(r.game_id);
    }
    const visible = forms.filter((f) => !avail.has(f.id) || avail.get(f.id)!.has(game));
    if (visible.length) forms = visible;
    else {
      forms = await formsOfSpecies(speciesId);
      defaultForm = forms.find((f) => f.is_default) || forms[0] || null;
    }
  }

  const flavorAll = (await table("dex_flavor"))
    .filter((r) => r.species_id === speciesId)
    .sort(
      (a, b) =>
        gameOrderCmp(a.game, b.game) || cmpStr(a.version_label || "", b.version_label || ""),
    );
  const speciesFormIds = new Set(forms.map((f) => f.id));
  const formFlavorAll = (await table("form_flavor"))
    .filter((r) => speciesFormIds.has(r.form_id))
    .sort(
      (a, b) =>
        gameOrderCmp(a.game, b.game) || cmpStr(a.version_label || "", b.version_label || ""),
    );
  const gmAll = (await table("get_methods"))
    .filter((r) => r.species_id === speciesId)
    .sort(
      (a, b) =>
        gameOrderCmp(a.game, b.game) || cmpStr(a.version_label || "", b.version_label || ""),
    );

  let flavor = flavorAll.map((r) => ({
    game: r.game,
    version_label: r.version_label,
    text: r.text,
  }));
  let formFlavor = new Map<number, any[]>();
  for (const r of formFlavorAll) {
    if (!formFlavor.has(r.form_id)) formFlavor.set(r.form_id, []);
    formFlavor.get(r.form_id)!.push({ game: r.game, version_label: r.version_label, text: r.text });
  }
  let gm = gmAll.map((r) => ({
    game: r.game,
    version_label: r.version_label,
    location: r.location,
    method: r.method,
    note: r.note,
    form: r.form,
  }));

  if (game) {
    flavor = flavor.filter((f) => f.game === game);
    formFlavor = new Map(
      [...formFlavor.entries()]
        .map(([fid, rows]) => [fid, rows.filter((r) => r.game === game)] as [number, any[]])
        .filter(([, rows]) => rows.length),
    );
    gm = gm.filter((x) => x.game === game);
  }

  /* form="base" 为显式基础形态哨兵（apiGet 会丢弃空串参数）：仅在不传时才回退图鉴默认形态 */
  const selSuffix = form === "base" ? "" : form.trim() || dexDefaultSuffix;
  /* 获取方式的 52poke 形态标记 → 本种形态后缀。同一字母在不同物种含义不同
     （L=呆呆王 low-key / 铁废 limited-build；E=海兔 east-sea / 花叶蒂 eternal），
     故先查全局映射，再按本种形态后缀精确/唯一前缀匹配；仍无法归属的行
     （如 LA 头目、彩粉蝶花纹——PokeAPI 无对应形态行）在基础形态视图下保留，不静默丢弃 */
  const speciesSuffixes = forms
    .map((f) => (f.identifier || "").split("-").slice(1).join("-"))
    .filter(Boolean);
  const resolveMarker = (marker: string): string | null => {
    const g = FORM_MARKER_TO_SUFFIX[marker];
    if (g && speciesSuffixes.includes(g)) return g;
    const low = marker.toLowerCase();
    if (speciesSuffixes.includes(low)) return low;
    const hits = speciesSuffixes.filter((s) => s.startsWith(low));
    return hits.length === 1 ? hits[0]! : null;
  };
  gm = gm.filter((x) => {
    if (!x.form) return true;
    const suf = resolveMarker(x.form);
    if (suf) return suf === selSuffix;
    return selSuffix === "";
  });

  const gamesWithGm = new Set(gm.map((x) => x.game));
  let enc: Row[] = [];
  if (!game || game === "sword-shield") {
    const encRows = (await encountersOf(speciesId))
      .filter((r) => !game || r.game_id === game)
      .sort((a, b) => a.vg - b.vg || cmpStr(a.location_en, b.location_en))
      .slice(0, 60);
    enc = encRows.filter((r) => !gamesWithGm.has(r.game_id));
  }
  const seen = new Set<string>();
  const encDedup: Row[] = [];
  for (const e of enc) {
    const key = `${e.game_id}|${e.location_en}|${e.min_level}|${e.max_level}`;
    if (!seen.has(key)) {
      seen.add(key);
      encDedup.push(e);
    }
  }

  const dexes = await table("regional_dexes");
  const gamesRows = await table("games");
  const dexList = (await table("dex_entries"))
    .filter((e) => e.species_id === speciesId)
    .map((e) => {
      const d = dexes.find((x) => x.id === e.dex_id);
      if (!d) return null;
      const gm2 = gamesRows.find((x) => x.id === d.game_id);
      return {
        dex_id: e.dex_id,
        ndex: e.ndex,
        dex_zh: d.name_zh,
        game_id: d.game_id,
        game_zh: gm2 ? gm2.name_zh : null,
      };
    })
    .filter(Boolean as any)
    .sort(
      (a: any, b: any) =>
        (a.game_id === game ? 0 : 1) - (b.game_id === game ? 0 : 1) ||
        dexes.find((x) => x.id === a.dex_id)!.sort - dexes.find((x) => x.id === b.dex_id)!.sort,
    );

  const evolution = await evolutionChain(speciesId, selSuffix);

  if (defaultForm) {
    for (const f of forms) f.ability_list = await abilitiesOf(f);
  }

  return {
    species: sp,
    default_form: defaultForm,
    forms,
    selected_suffix: selSuffix,
    ev: defaultForm
      ? Object.fromEntries(
          ["hp", "atk", "def", "spa", "spd", "spe"].map((k) => [k, defaultForm["ev_" + k]]),
        )
      : {},
    base_stats: defaultForm
      ? Object.fromEntries(
          ["hp", "atk", "def", "spa", "spd", "spe"].map((k) => [k, defaultForm[k]]),
        )
      : {},
    flavor,
    form_flavor: Object.fromEntries(formFlavor.entries()),
    get_methods: gm,
    encounters_api: encDedup,
    dex_list: dexList,
    evolution,
    game: game || null,
  };
}

// ---- GET /api/pokemon/{species_id}/moves ----
export async function pokemonMoves(speciesId: number, params?: any) {
  const p = params || {};
  const game = p.game;
  const cfg = GAME_MOVE_CONFIG[game as string];
  if (!cfg) throw new Error("unknown game");
  const speciesRows = await table("species");
  const sp = speciesRows.find((s) => s.id === speciesId);
  if (!sp) throw new Error("species not found");
  const vg = cfg.vg;

  const forms = await formsOfSpecies(speciesId);
  let form = p.form_id ? forms.find((f) => f.id === parseInt(p.form_id, 10)) : null;
  if (!form) form = forms[0] || null;

  const movesRows = await table("moves");
  const moveById = new Map(movesRows.map((m) => [m.id, m]));
  /* 学习集按形态挂靠；战斗形态（超级进化/超极巨/原始回归等）无独立学习集时回落默认形态 */
  const allLs = await learnsetsByVg(vg);
  let lsRows = allLs.filter((l) => l.form_id === form!.id);
  if (!lsRows.length && !form!.is_default) {
    const defForm = forms.find((f) => f.is_default) || forms[0];
    if (defForm && defForm.id !== form!.id) {
      lsRows = allLs.filter((l) => l.form_id === defForm.id);
    }
  }
  const rows: any[] = lsRows
    .map((l) => {
      const m = moveById.get(l.move_id)!;
      return {
        method: l.method,
        level: l.level,
        mastery: l.mastery,
        move_id: m.id,
        name_zh: m.name_zh,
        type_zh: m.type_zh,
        damage_class: m.damage_class,
        power: m.power,
        accuracy: m.accuracy,
        pp: m.pp,
        priority: m.priority,
      };
    })
    .sort((a, b) => a.move_id - b.move_id);

  const machines = new Map<number, Map<number, [number, string]>>();
  if (cfg.tm_vgs.length) {
    const allMachines = (await table("machines"))
      .filter((r) => cfg.tm_vgs.includes(r.vg))
      .sort((a, b) => a.vg - b.vg || a.machine_number - b.machine_number);
    for (const r of allMachines) {
      if (!machines.has(r.move_id)) machines.set(r.move_id, new Map());
      machines.get(r.move_id)!.set(r.machine_number, [r.vg, r.item_identifier || ""]);
    }
  }
  const tmHow = new Map<string, { how: string; materials: string }>();
  for (const r of await table("tm_how")) {
    tmHow.set(`${r.vg}|${r.machine_number}`, {
      how: (r.how || "").replace(/\r/g, "").replace(/\n/g, " ").trim(),
      materials: (r.materials || "").replace(/\r/g, "").replace(/\n/g, " ").trim(),
    });
  }
  function tmInfo(moveId: number) {
    const byNum = machines.get(moveId);
    if (!byNum) return [];
    return [...byNum.keys()]
      .sort((a, b) => a - b)
      .map((num) => {
        const [vgnum, itemIdent] = byNum.get(num)!;
        const h = tmHow.get(`${vgnum}|${num}`) || ({} as { how?: string; materials?: string });
        return {
          number: num,
          kind: (itemIdent || "").toLowerCase().startsWith("tr") ? "TR" : "TM",
          how: h.how || "",
          materials: h.materials || "",
        };
      });
  }

  const groups: Record<string, any[]> = {};
  for (const [key] of cfg.tabs) groups[key] = [];
  const methodKey: Record<string, string> = {
    "level-up": "level",
    machine: "machine",
    egg: "egg",
    tutor: "tutor",
  };
  const seenSet = new Set<string>();
  for (const r of rows) {
    const d = Object.assign({}, r);
    d.tm = d.method === "machine" ? tmInfo(d.move_id) : [];
    let mkey = methodKey[d.method] !== undefined ? methodKey[d.method]! : d.method;
    if (EVOLUTION_RECALL_GAMES.has(game)) {
      if (mkey === "tutor") {
        mkey = "evolution-recall";
        d.level = null;
        d.recall = true;
      } else if (mkey === "level" && (d.level || 0) === 0) {
        mkey = "evolution-recall";
        d.evolution = true;
      }
    } else if (mkey === "level" && (d.level || 0) === 0) {
      d.evolution = true;
    }
    const key = `${mkey}|${d.move_id}`;
    if (seenSet.has(key) || !(mkey in groups)) continue;
    seenSet.add(key);
    groups[mkey]!.push(d);
  }
  groups.level!.sort(
    (a, b) =>
      (a.recall === true ? 1 : 0) - (b.recall === true ? 1 : 0) ||
      ((a.level || 0) === 0 ? 0 : 1) - ((b.level || 0) === 0 ? 0 : 1) ||
      (a.level || 0) - (b.level || 0) ||
      a.move_id - b.move_id,
  );
  for (const k of Object.keys(groups)) {
    if (k !== "level") {
      groups[k]!.sort(
        (a, b) => (a.evolution ? 0 : 1) - (b.evolution ? 0 : 1) || cmpStr(a.name_zh, b.name_zh),
      );
    }
  }

  const gamesRows = await table("games");
  const gmRow = gamesRows.find((x) => x.id === game);
  return {
    species: { id: sp.id, name_zh: sp.name_zh },
    form,
    game,
    vg,
    has_breeding: gmRow ? Boolean(gmRow.has_breeding) : false,
    tabs: cfg.tabs.map(([k, lbl]) => ({ key: k, label: lbl })),
    groups,
  };
}
