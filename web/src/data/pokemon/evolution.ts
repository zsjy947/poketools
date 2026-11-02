/* 进化家族树（自 data/pokemon.ts 拆出：EvolutionTree / evoCondition / evolutionChain） */
import { table, type Row } from "../core";
import { TRIGGER_ZH, SUFFIX_REGION_ZH, decodeNatures, formBySuffix } from "./internal";

// ---- 进化条件文本（_evo_condition 移植） ----
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
  game = "",
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
  /* 条件行按游戏选（伊布的叶/冰伊布：珍钻=苔藓/冰岩石的特殊地区进化，其余游戏=叶/冰之石）。
     PokeAPI 对这类进化只留一行位置行且位置名取最新作（树荫丛林/拉纳基拉山），珍钻需校正回岩石名 */
  const prefersLocation = game === "brilliant-diamond-shining-pearl";
  const condRank = (row: Row): number =>
    row.trigger === "use-item"
      ? prefersLocation
        ? 1
        : 0
      : prefersLocation && row.location
        ? 0
        : 1;
  const best: Record<string, { rank: number; cond: string }> = {};
  for (const r of evolutions) {
    if (family.has(r.from_species) && family.has(r.to_species)) {
      const key = `${r.from_species}|${r.to_species}`;
      children[r.from_species] = children[r.from_species] || [];
      if (!children[r.from_species]!.includes(r.to_species)) {
        children[r.from_species]!.push(r.to_species);
      }
      const rank = condRank(r);
      const cur = best[key];
      if (
        !cur ||
        rank < cur.rank ||
        (rank === cur.rank && evoCondition(r).length > cur.cond.length)
      ) {
        best[key] = { rank, cond: evoCondition(r) };
      }
    }
  }
  for (const [key, v] of Object.entries(best)) {
    conds[key] = prefersLocation
      ? v.cond
          .replace(/树荫丛林/g, "苔藓岩石")
          .replace(/拉纳基拉山/g, "冰岩石")
          .replace(/在苔藓岩石，在苔藓岩石附近/g, "在苔藓岩石附近")
          .replace(/在冰岩石，在冰岩石附近/g, "在冰岩石附近")
      : v.cond;
  }
  /* U25：传说阿尔宙斯的叶/冰伊布双途径（道具或洗翠定点岩石）——PokeAPI 无 LA 专属行，条件级覆盖 */
  if (game === "legends-arceus") {
    if (conds["133|470"]) conds["133|470"] = "使用叶之石，或在苔藓岩石附近升级";
    if (conds["133|471"]) conds["133|471"] = "使用冰之石，或在冰岩石附近升级";
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
