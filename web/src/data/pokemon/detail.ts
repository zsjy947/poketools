/* 详情端点（自 data/pokemon.ts 拆出：pokemonDetail / pokemonMoves） */
import { table, encountersOf, learnsetsByVg, type Row } from "../core";
import {
  FORM_MARKER_TO_SUFFIX,
  GAME_MOVE_CONFIG,
  EVOLUTION_RECALL_GAMES,
  cmpStr,
  gameOrderCmp,
  formsOfSpecies,
  abilitiesOf,
} from "./internal";
import { evolutionChain } from "./evolution";

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
    // RM-24：基础段缺失（源站只写形态段，如 Z-A 的 19 种）——回退取形态段作基础行，
    // version_label 标注形态名以示来源；连形态段也没有时维持「待补充」。
    if (flavor.length === 0 && formFlavor.size > 0) {
      const defId = defaultForm?.id;
      const pickId =
        defId != null && formFlavor.has(defId)
          ? defId!
          : [...formFlavor.entries()].sort((a, b) => b[1].length - a[1].length)[0]![0];
      const fname =
        forms.find((f) => f.id === pickId)?.form_label ||
        forms.find((f) => f.id === pickId)?.identifier ||
        "";
      flavor = (formFlavor.get(pickId) || []).map((r) => ({
        game: r.game,
        version_label: r.version_label ? `${r.version_label}（${fname}）` : fname,
        text: r.text,
      }));
    }
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

  const evolution = await evolutionChain(speciesId, selSuffix, game);

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
