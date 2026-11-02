/* 图鉴端点（自 data/pokemon.ts 拆出：games / dexEntries / nationalDex 及全国形态徽章） */
import { table, type Row } from "../core";
import { caughtMap } from "../../state/user";
import { typeSort } from "./internal";

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

// ---- GET /api/national（全国图鉴：1025 物种全量形态，物种级收集） ----
export type FormBadge = "region" | "mega" | "gmax" | "cosmetic";
const REGION_SUFFIXES = ["alola", "galar", "hisui", "paldea"];
const NATIONAL_COSMETIC_BASE = 900000; // build_db 合成外观形态行起点

export function nationalFormBadges(forms: Row[]): FormBadge[] {
  const out = new Set<FormBadge>();
  for (const f of forms) {
    const ident = f.identifier || "";
    if (f.is_mega === 1 || ident.endsWith("-primal")) out.add("mega");
    if (ident.endsWith("-gmax")) out.add("gmax");
    /* 仅匹配结尾后缀：pikachu-alola-cap（阿罗拉帽子）这类外观形态不是地区形态 */
    if (REGION_SUFFIXES.some((s) => ident.endsWith("-" + s))) out.add("region");
    if (f.id >= NATIONAL_COSMETIC_BASE) out.add("cosmetic");
  }
  return (["region", "mega", "gmax", "cosmetic"] as FormBadge[]).filter((k) => out.has(k));
}

export async function nationalDex(): Promise<{
  total: number;
  entries: Array<{
    ndex: number;
    species_id: number;
    name_zh: string;
    name_en: string;
    types: string;
    form_id: number;
    form_count: number;
    generation: number;
    badges: FormBadge[];
    caught: boolean;
  }>;
}> {
  const caught = caughtMap("national");
  const speciesRows = ((await table("species")) as Row[]).slice().sort((a, b) => a.id - b.id);
  const formsRows = await table("forms");
  const bySp = new Map<number, Row[]>();
  for (const f of formsRows) {
    let arr = bySp.get(f.species_id);
    if (!arr) {
      arr = [];
      bySp.set(f.species_id, arr);
    }
    arr.push(f);
  }
  const entries = speciesRows.map((sp) => {
    // 全国图鉴默认一般形态：is_default 行（不套用 dex_default_forms 的地区口径）
    const forms = (bySp.get(sp.id) || [])
      .slice()
      .sort((a, b) => b.is_default - a.is_default || a.id - b.id);
    const def = forms.find((f) => f.is_default) || forms[0] || ({} as Row);
    return {
      ndex: sp.id,
      species_id: sp.id,
      name_zh: sp.name_zh,
      name_en: sp.name_en,
      types: typeSort(def.types || ""),
      form_id: def.id || 0,
      form_count: forms.length,
      generation: sp.generation,
      badges: nationalFormBadges(forms),
      caught: caught.get(sp.id) || false,
    };
  });
  return { total: entries.length, entries };
}
