/* 伤害计算器页（自 Vue calc.js 迁移；U10 下拉限流+首入占位、U11 表头等级列、
 * U12 击中要害撑满行、U13 场地区紧凑、U14 面板描边加深+轻投影） */
import { useCallback, useEffect, useMemo, useRef, useState, Fragment } from "react";
import { apiGet, apiSend, TYPE_LIST, STAT_KEYS, STAT_ZH } from "../data/api";
import { BATTLE_ITEM_IDS } from "../data/battle-items";
import { TypeBadge, formDisplayName, koTextFromKo, toast } from "../pkt/shared";

/* U17/U20：下拉只列对战相关可携带道具（champions 合法，静态清单见 data/battle-items.ts），
 * 超级进化石（随形态自动锁定）不进下拉；完整 items 表仍供 findStone/Z 纯晶自动装备查找 */
/* showdown 的 item.id 为去连字符的 ID 形式（choiceband），比对前先归一 */
const itemIdOf = (ident: string): string => ident.toLowerCase().replace(/[^a-z0-9]/g, "");
/* 超级进化石随形态自动锁定、Z 纯晶随 Z 标记自动装备——均不进下拉 */
const isAutoEquipStone = (ident: string): boolean =>
  ident !== "eviolite" &&
  (/ite(-[xyz])?$/.test(ident) || ident === "keystone" || ident.endsWith("-z"));

/* ---- 模块级 meta 缓存 + 预热 ---- */
interface MetaCache {
  species: any[] | null;
  items: any[] | null;
  abilities: string[] | null;
  zMoves: any | null;
  maxMoves: any[] | null;
  gmaxMoves: any[] | null;
  natures: any[] | null;
}
const _metaCache: MetaCache = {
  species: null,
  items: null,
  abilities: null,
  zMoves: null,
  maxMoves: null,
  gmaxMoves: null,
  natures: null,
};
const _metaPromises: Record<string, Promise<any>> = {};
const META_URLS: Record<keyof MetaCache, string> = {
  species: "/api/meta/species",
  items: "/api/meta/items",
  abilities: "/api/meta/abilities",
  zMoves: "/api/meta/z-moves",
  maxMoves: "/api/meta/max-moves",
  gmaxMoves: "/api/meta/gmax-moves",
  natures: "/api/meta/natures",
};
function warmMeta(key: keyof MetaCache, url?: string): Promise<any> {
  if (_metaCache[key]) return Promise.resolve(_metaCache[key]);
  if (!_metaPromises[key]) {
    _metaPromises[key] = apiGet(url || META_URLS[key]).then((r) => {
      (_metaCache as any)[key] = r;
      delete _metaPromises[key];
      return r;
    });
  }
  return _metaPromises[key];
}
export function warmCalcMeta(): void {
  /* U10：常驻预热——进入应用即开始加载，首入计算器有现成数据 */
  warmMeta("species", "/api/meta/species");
  warmMeta("items", "/api/meta/items");
  warmMeta("abilities", "/api/meta/abilities");
  warmMeta("zMoves", "/api/meta/z-moves");
  warmMeta("maxMoves", "/api/meta/max-moves");
  warmMeta("gmaxMoves", "/api/meta/gmax-moves");
  warmMeta("natures", "/api/meta/natures");
  for (const src of [
    "/assets/mechanism/dynamax.png",
    ...TYPE_LIST.map((t) => `/assets/mechanism/tera_${t}.png`),
    "/assets/mechanism/tera_星晶.png",
  ]) {
    new Image().src = src;
  }
}

/* forms/moves 每物种缓存（FIFO 24） */
const _speciesCache = new Map<number, { forms: any[]; moves: any[] }>();
async function fetchSpeciesData(sid: number) {
  if (_speciesCache.has(sid)) return _speciesCache.get(sid)!;
  const [forms, moves] = await Promise.all([
    apiGet("/api/calc/forms", { species_id: sid }),
    apiGet("/api/calc/moves", { species_id: sid }),
  ]);
  const data = { forms, moves };
  _speciesCache.set(sid, data);
  if (_speciesCache.size > 24) _speciesCache.delete(_speciesCache.keys().next().value!);
  return data;
}

function isMegaForm(f: any): boolean {
  return !!(f && (f.is_mega || /-(mega|primal)/.test(f.identifier || "")));
}
function isGmaxForm(f: any): boolean {
  return !!(f && /-gmax/.test(f.identifier || ""));
}

interface SideState {
  speciesId: number | null;
  formId: number | null;
  forms: any[];
  nameZh: string;
  level: number;
  nature: string;
  evs: Record<string, number>;
  ivs: Record<string, number>;
  boosts: Record<string, number>;
  ability: string;
  item: string;
  teraOn: boolean;
  teraType: string;
  maxOn: boolean;
  zMarks: boolean[];
  zLocked: string | null;
  moves: Array<number | null>;
  varPowers: Record<number, number>;
  moveOptions: any[];
  moveResults: any[];
  lastStats: any;
  hazardHp?: number;
  burn: boolean;
  crit: boolean;
  helping: boolean;
  statuses: string[];
  screen: string;
  friendGuard: boolean;
  flowerGift: boolean;
  steely: boolean;
  battery: boolean;
  powerSpot: boolean;
  foresight: boolean;
  tailwind: boolean;
  powerTrick: boolean;
  switching: boolean;
  hazards: { rocks: boolean; spikes: number; saltCure: boolean; leechSeed: boolean };
}

function blankSide(): SideState {
  return {
    speciesId: null,
    formId: null,
    forms: [],
    nameZh: "",
    level: 50,
    nature: "hardy",
    evs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
    ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 },
    boosts: { atk: 0, spa: 0, def: 0, spd: 0 },
    ability: "",
    item: "",
    teraOn: false,
    teraType: "一般",
    maxOn: false,
    zMarks: [false, false, false, false],
    zLocked: null,
    moves: [null, null, null, null],
    varPowers: {},
    moveOptions: [],
    moveResults: [null, null, null, null],
    lastStats: null,
    burn: false,
    crit: false,
    helping: false,
    statuses: [],
    screen: "",
    friendGuard: false,
    flowerGift: false,
    steely: false,
    battery: false,
    powerSpot: false,
    foresight: false,
    tailwind: false,
    powerTrick: false,
    switching: false,
    hazards: { rocks: false, spikes: 0, saltCure: false, leechSeed: false },
  };
}

async function loadSpeciesInto(
  setSide: (s: SideState) => void,
  getSide: () => SideState,
  sid: number,
): Promise<SideState> {
  const names = _metaCache.species
    ? Object.fromEntries(_metaCache.species.map((x) => [x.id, x.name_zh]))
    : {};
  const data = await fetchSpeciesData(sid);
  const s = { ...getSide() };
  s.speciesId = sid;
  s.nameZh = names[sid] || "";
  s.zMarks = [false, false, false, false];
  s.zLocked = null;
  s.teraOn = false;
  s.maxOn = false;
  s.forms = data.forms;
  s.formId = s.forms.length ? s.forms[0].id : null;
  const f = s.forms.find((x) => x.id === s.formId);
  pickDefaultAbility(s, f);
  s.moveOptions = data.moves;
  /* 默认四招：优先 STAB 高威力 */
  const types = new Set(((f && f.types) || "").split(",").filter(Boolean));
  const damaging = s.moveOptions.filter((m) => m.power).sort((a, b) => b.power - a.power);
  const stab = damaging.filter((m) => types.has(m.type_zh));
  const rest = damaging.filter((m) => !types.has(m.type_zh));
  const picked = [...stab, ...rest].slice(0, 4).map((m) => m.move_id);
  s.moves = [0, 1, 2, 3].map((i) => (picked[i] != null ? picked[i]! : null));
  syncFormDerived(s);
  setSide(s);
  return s;
}

function pickDefaultAbility(s: SideState, f: any): void {
  if (!f || !f.ability_list || !f.ability_list.length) {
    s.ability = "";
    return;
  }
  const own = f.ability_list.find((a: any) => !a.hidden);
  s.ability = (own || f.ability_list[0]).name;
}
function syncFormDerived(s: SideState): void {
  const f = s.forms.find((x) => x.id === s.formId);
  if (!f) return;
  if (isGmaxForm(f)) s.maxOn = true;
  if (isMegaForm(f)) {
    s.teraOn = false;
    s.maxOn = false;
    s.zMarks = [false, false, false, false];
  }
}

function exclusiveZHit(s: SideState, move: any, zMeta: any): any | null {
  const ex = ((zMeta && zMeta.exclusive) || []).find(
    (x: any) => x.species_id === s.speciesId && x.base_move_id === move.move_id,
  );
  if (!ex) return null;
  const suf = ex.form_suffix || "";
  if (suf) {
    const f = s.forms.find((x) => x.id === s.formId);
    const ident = (f && f.identifier) || "";
    const ok = suf.split(",").some((p: string) => {
      const qq = p.trim();
      return qq && (ident.endsWith("-" + qq) || ident.includes("-" + qq + "-"));
    });
    if (!ok) return null;
  }
  return ex;
}

function zCrystalFor(s: SideState, move: any, items: any[], zMeta: any): string {
  if (!items || !zMeta) return "";
  const ex = exclusiveZHit(s, move, zMeta);
  const ident = ex
    ? ex.crystal_identifier
    : (() => {
        const g = (zMeta.generic || []).find((x: any) => x.type === move.type_zh);
        return g ? g.crystal_identifier : "";
      })();
  if (!ident) return "";
  const hit = items.find((i) => i.identifier === ident);
  return hit ? hit.name_zh : "";
}

/* U10：下拉「过滤 + 可见上限」通用选择器 */
function FilterSelect({
  value,
  onChange,
  options,
  render,
  placeholder,
  limit = 80,
  style,
  displayOf,
  adornment,
}: {
  value: any;
  onChange: (v: any) => void;
  options: any[];
  render: (o: any) => { value: any; label: React.ReactNode; search?: string };
  placeholder?: string;
  limit?: number;
  style?: React.CSSProperties;
  /** 收起态回显文本（value 非自描述时必传，如物种 id → 中文名） */
  displayOf?: (v: any) => string;
  /** 框内右缘固定饰件（如 mega 锁图标），不随输入变化、不占外部宽度 */
  adornment?: React.ReactNode;
}): JSX.Element {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const filtered = useMemo(() => {
    if (!q) return options.slice(0, limit);
    const kw = q.toLowerCase();
    return options
      .filter((o) => {
        const r = render(o);
        return (
          String(r.search ?? String(r.value))
            .toLowerCase()
            .includes(kw) ||
          String(typeof r.label === "string" ? r.label : (r.search ?? "")).includes(q)
        );
      })
      .slice(0, limit);
  }, [options, q, limit, render]);
  return (
    <div className="fselect" style={style}>
      <input
        className={"pkt-input w-full" + (adornment ? " fselect-input-adorn" : "")}
        placeholder={placeholder || "搜索…"}
        value={open ? q : displayOf ? displayOf(value) : String(value ?? "")}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
      />
      {adornment}
      {open && (
        <div className="fselect-list">
          {/* 选项带 grp 字段时按组渲染非交互分组头（如特性：自身特性/其他特性） */}
          {filtered.map((o, i) => {
            const r = render(o);
            const showGrp = o.grp && (i === 0 || filtered[i - 1]!.grp !== o.grp);
            return (
              <Fragment key={String(r.value)}>
                {showGrp && <div className="fselect-grp">{o.grp}</div>}
                <div
                  className={"fselect-opt" + (r.value === value ? " on" : "")}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    onChange(r.value);
                    setOpen(false);
                    setQ("");
                  }}
                >
                  {r.label}
                </div>
              </Fragment>
            );
          })}
          {!filtered.length && <div className="fselect-opt empty">无匹配项</div>}
        </div>
      )}
    </div>
  );
}

export function CalcPage(): JSX.Element {
  const [A, setA] = useState<SideState>(blankSide);
  const [D, setD] = useState<SideState>(blankSide);
  const [speciesList, setSpeciesList] = useState<any[]>([]);
  const [items, setItems] = useState<any[]>([]);
  const [allAbilities, setAllAbilities] = useState<string[]>([]);
  const [zMeta, setZMeta] = useState<any>({ generic: [], exclusive: [] });
  const [maxMeta, setMaxMeta] = useState<any[]>([]);
  const [gmaxMeta, setGmaxMeta] = useState<any[]>([]);
  const [natures, setNatures] = useState<any[]>([]);
  const [atkWhich, setAtkWhich] = useState<"A" | "D" | null>(null);
  const [activeMoveIdx, setActiveMoveIdx] = useState(0);
  const [acc, setAcc] = useState({ A: false, D: false, F: false });
  const [field, setField] = useState<any>({
    mode: "doubles",
    weather: "",
    terrain: "",
    auras: { fairy: false, dark: false, break: false },
    ruin: { sword: false, beads: false, tablets: false, vessel: false },
    gravity: false,
    magic_room: false,
    wonder_room: false,
  });
  /* U10：首入 loading 占位（至首个 batch 返回） */
  const [firstLoading, setFirstLoading] = useState(true);

  const recalcTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recalcToken = useRef(0);
  const stateRef = useRef({ A, D, field });
  stateRef.current = { A, D, field };

  useEffect(() => {
    warmMeta("species").then(setSpeciesList);
    warmMeta("items").then(setItems);
    warmMeta("abilities").then(setAllAbilities);
    warmMeta("zMoves").then(setZMeta);
    warmMeta("maxMoves").then(setMaxMeta);
    warmMeta("gmaxMoves").then(setGmaxMeta);
    warmMeta("natures").then(setNatures);
  }, []);

  const scheduleRecalc = useCallback((immediate = false) => {
    if (recalcTimer.current) clearTimeout(recalcTimer.current);
    recalcTimer.current = setTimeout(recalcAll, immediate ? 0 : 400);
  }, []);

  const recalcAll = useCallback(async () => {
    const token = ++recalcToken.current;
    const { A: a, D: dd, field: f } = stateRef.current;
    if (!a.speciesId || !dd.speciesId) return;
    const sidePayload = (s: SideState) => ({
      species_id: s.speciesId,
      form_id: s.formId,
      level: s.level,
      nature: s.nature,
      evs: s.evs,
      ivs: s.ivs,
      boosts: s.boosts,
      ability: s.ability,
      item: s.item,
      is_dynamax: s.maxOn,
      tera_type: s.teraOn ? s.teraType || "一般" : "",
    });
    const sideFlags = (s: SideState) => ({
      burn: s.burn,
      crit: s.crit,
      helping: s.helping,
      z_moves: s.zMarks.map(Boolean),
      screen: s.screen,
      sash: s.item === "气势披带",
      friend_guard: s.friendGuard,
      flower_gift: s.flowerGift,
      steely: s.steely,
      battery: s.battery,
      power_spot: s.powerSpot,
      foresight: s.foresight,
      power_trick: s.powerTrick,
      switching: s.switching,
      hazards: {
        rocks: s.hazards.rocks,
        spikes: s.hazards.spikes || 0,
        salt_cure: s.hazards.saltCure,
        leech_seed: s.hazards.leechSeed,
      },
    });
    try {
      const resp = await apiSend("POST", "/api/calc/batch", {
        attacker: sidePayload(a),
        defender: sidePayload(dd),
        moves: {
          atk: a.moves.map((x) => (x ? { id: x, power: a.varPowers[x] || undefined } : null)),
          dfd: dd.moves.map((x) => (x ? { id: x, power: dd.varPowers[x] || undefined } : null)),
        },
        field: {
          mode: f.mode,
          weather: f.weather,
          terrain: f.terrain,
          auras: f.auras.fairy || f.auras.dark || f.auras.break ? f.auras : undefined,
          ruin: Object.values(f.ruin).some(Boolean) ? f.ruin : undefined,
          gravity: f.gravity || undefined,
          magic_room: f.magic_room || undefined,
          wonder_room: f.wonder_room || undefined,
        },
        sides: { atk: sideFlags(a), dfd: sideFlags(dd) },
      });
      if (token !== recalcToken.current) return;
      setA((s) => ({
        ...s,
        moveResults: resp.atk.results,
        lastStats: resp.atk.stats,
        hazardHp: resp.hazard_hp.atk,
      }));
      setD((s) => ({
        ...s,
        moveResults: resp.dfd.results,
        lastStats: resp.dfd.stats,
        hazardHp: resp.hazard_hp.dfd,
      }));
    } catch (e) {
      if (token === recalcToken.current) {
        const msg = String((e as Error).message || e);
        const errResults = [0, 0, 0, 0].map(() => ({ error: msg }));
        setA((s) => ({ ...s, moveResults: errResults }));
        setD((s) => ({ ...s, moveResults: errResults.map(() => ({ error: msg })) }));
      }
    }
    setFirstLoading(false);
    if (token === recalcToken.current) {
      setAtkWhich((cur) => cur || (stateRef.current.A.moves[0] != null ? "A" : cur));
      setActiveMoveIdx(0);
    }
  }, []);

  /* 初始化装载双方 */
  const bootRef = useRef(false);
  useEffect(() => {
    if (bootRef.current) return;
    bootRef.current = true;
    void (async () => {
      const [aNew, dNew] = await Promise.all([
        loadSpeciesInto(setA, () => stateRef.current.A, 445),
        loadSpeciesInto(setD, () => stateRef.current.D, 143),
      ]);
      await warmMeta("species");
      const names = Object.fromEntries((_metaCache.species || []).map((x) => [x.id, x.name_zh]));
      aNew.nameZh = aNew.nameZh || names[aNew.speciesId!] || "";
      dNew.nameZh = dNew.nameZh || names[dNew.speciesId!] || "";
      /* React 渲染未 flush 时 recalcAll 会读到旧 stateRef——手动同步后再首算 */
      stateRef.current = { A: aNew, D: dNew, field: stateRef.current.field };
      setA(aNew); /* 同一对象引用：atkSide === A 的侧判定依赖标识 */
      setD(dNew);
      recalcAll(); /* U10：首算跳过防抖 */
    })();
  }, [recalcAll]);

  /* ---- 结果派生 ---- */
  const atkSide = atkWhich === "A" ? A : atkWhich === "D" ? D : null;
  const dfdSide = atkWhich === "A" ? D : atkWhich === "D" ? A : null;
  const activeResult = useMemo(() => {
    const s = atkSide;
    if (!s || s.moveResults[activeMoveIdx] === undefined) return null;
    return s.moveResults[activeMoveIdx];
  }, [atkSide, activeMoveIdx]);
  const zOnForActive = !!(atkSide && atkSide.zMarks[activeMoveIdx]);
  const activeZName = activeResult?.z_info?.name || "";
  const activeZNote = activeResult?.z_info?.note || "";
  const koTagType =
    !activeResult || activeResult.error
      ? "info"
      : activeResult.ohko
        ? "danger"
        : activeResult.ko?.probs?.["2"] >= 100
          ? "warning"
          : "info";
  const koText = koTextFromKo(activeResult?.ko);
  const activeHpText = useMemo(() => {
    if (!atkSide || !dfdSide) return "";
    const full = dfdSide.lastStats ? dfdSide.lastStats.hp : null;
    const r = activeResult;
    if (r && full && r.hp != null && r.hp < full)
      return `${r.hp}（钉子等进场扣减后，满血 ${full}）`;
    return full || (r ? r.hp : "");
  }, [atkSide, activeResult, D.lastStats, A.lastStats]);

  const resultDesc = useMemo(() => {
    const r = activeResult;
    const atk = atkSide;
    const dfd = dfdSide;
    if (!r || r.error || !atk || !dfd) return "";
    const nat = natures.find((n) => n.identifier === atk.nature);
    const move = atk.moveOptions.find((m) => m.move_id === atk.moves[activeMoveIdx]);
    const physical = move && move.damage_class === "physical";
    const evVal = (physical ? atk.evs.atk : atk.evs.spa) ?? 0;
    const evTxt = evVal > 0 ? `${evVal}${physical ? "攻" : "特攻"}` : "";
    const mechText = (s: SideState) => {
      const out: string[] = [];
      if (s.teraOn) out.push(`太晶(${s.teraType})`);
      if (s.maxOn) out.push("极巨化");
      if (s.zMarks.some(Boolean)) out.push("Z招式");
      return out.join("·");
    };
    const sideName = (s: SideState) => {
      if (!s.nameZh) return "";
      const f = s.forms.find((x) => x.id === s.formId);
      const fl = f ? formDisplayName(f) : "";
      return fl && f && !f.is_default && fl !== "默认形态" ? `${s.nameZh}·${fl}` : s.nameZh;
    };
    const parts = [nat ? nat.name_zh : "", evTxt, atk.item, mechText(atk), sideName(atk)].filter(
      Boolean,
    );
    const defEv = (dfd.evs.hp ?? 0) > 0 ? dfd.evs.hp + "HP" : "";
    const defParts = [defEv, mechText(dfd), sideName(dfd)].filter(Boolean);
    const pct2 = r.pct_min === r.pct_max ? `${r.pct_min}%` : `${r.pct_min}~${r.pct_max}%`;
    return `${parts.join(" ")} ${move ? move.name_zh : ""} VS. ${defParts.join(" ")}：${r.min}~${r.max}（${pct2}）`;
  }, [activeResult, atkSide, natures, activeMoveIdx, A, D]);

  /* ---- 机制切换 ---- */
  function toggleMechMark(which: "A" | "D", mech: "tera" | "max"): void {
    const set = which === "A" ? setA : setD;
    set((s) => {
      const f = s.forms.find((x) => x.id === s.formId);
      if (isMegaForm(f)) {
        toast("已选择超级进化形态，与该机制互斥：请先改回普通形态", "warning");
        return s;
      }
      if (mech === "tera") {
        if (s.maxOn || s.zMarks.some(Boolean)) {
          toast("极巨化/Z招式与太晶化同侧互斥：请先关闭当前机制", "warning");
          return s;
        }
        return { ...s, teraOn: !s.teraOn };
      }
      if (s.teraOn || s.zMarks.some(Boolean)) {
        toast("太晶化/Z招式与极巨化同侧互斥：请先关闭当前机制", "warning");
        return s;
      }
      return { ...s, maxOn: !s.maxOn };
    });
    scheduleRecalc();
  }

  function onZ(which: "A" | "D", idx: number): void {
    const set = which === "A" ? setA : setD;
    set((s) => {
      const f = s.forms.find((x) => x.id === s.formId);
      if (isMegaForm(f) || isGmaxForm(f)) {
        toast("已选择超级进化/超极巨化形态，与 Z 招式互斥：请先改回普通形态", "warning");
        return s;
      }
      if (s.maxOn || s.teraOn) {
        toast("极巨化/太晶化与 Z 招式同侧互斥：请先关闭当前机制", "warning");
        return s;
      }
      const on = !s.zMarks[idx];
      if (on) {
        const marks = [false, false, false, false];
        marks[idx] = true;
        const m = s.moveOptions.find((x) => x.move_id === s.moves[idx]);
        if (m) {
          const stone = zCrystalFor(s, m, items, zMeta);
          if (stone) return { ...s, zMarks: marks, item: stone, zLocked: "z" };
        }
        return { ...s, zMarks: marks };
      }
      const unlocked = s.zLocked === "z" ? { item: "", zLocked: null } : {};
      const marks = [...s.zMarks];
      marks[idx] = false;
      return { ...s, zMarks: marks, ...unlocked };
    });
    scheduleRecalc();
  }

  const pickMove = (which: "A" | "D", idx: number) => {
    setAtkWhich(which);
    setActiveMoveIdx(idx);
  };

  const fieldSet = (patch: any) => {
    setField((f: any) => ({ ...f, ...patch }));
    scheduleRecalc();
  };
  const sideSet = (
    which: "A" | "D",
    patch: Partial<SideState> | ((s: SideState) => Partial<SideState>),
  ) => {
    const fn = (s: SideState): SideState => ({
      ...s,
      ...(typeof patch === "function" ? patch(s) : patch),
    });
    if (which === "A") setA(fn);
    else setD(fn);
    scheduleRecalc();
  };

  return (
    <div className="pkt-page calc-page">
      <div className="page-head">
        <button className="back-btn" onClick={() => (location.hash = "#/home")}>
          ← 返回首页
        </button>
        <span className="page-title">伤害计算器</span>
        <div className="spacer" />
      </div>

      {firstLoading ? (
        /* U10：首次进入 loading 占位（meta 装载 + 首个 batch） */
        <div className="calc-first-loading">
          <div className="spinner" />
          <div>计算器数据装载中（图鉴 / 招式 / 道具 / Z 纯晶…）</div>
        </div>
      ) : (
        <>
          {/* 对战场 */}
          <div className="battlefield">
            <SummaryCard
              side={A}
              which="A"
              isDefender={atkWhich === "D"}
              zMeta={zMeta}
              items={items}
              maxMeta={maxMeta}
              gmaxMeta={gmaxMeta}
              dmg={atkWhich === "D" ? activeResult : null}
              activeMoveIdx={atkWhich === "A" ? activeMoveIdx : -1}
              natures={natures}
              onPickMove={pickMove}
              onToggleMech={toggleMechMark}
              onToggleZ={onZ}
            />
            <div className="vs-badge">VS</div>
            <SummaryCard
              side={D}
              which="D"
              isDefender={atkWhich === "A"}
              zMeta={zMeta}
              items={items}
              maxMeta={maxMeta}
              gmaxMeta={gmaxMeta}
              dmg={atkWhich === "A" ? activeResult : null}
              activeMoveIdx={atkWhich === "D" ? activeMoveIdx : -1}
              natures={natures}
              onPickMove={pickMove}
              onToggleMech={toggleMechMark}
              onToggleZ={onZ}
            />
          </div>

          {/* 结果条 */}
          {activeResult && (
            <div className="block result-bar">
              {activeResult.error ? (
                <>
                  <div className="pkt-alert warn">
                    {activeResult.error === "status_or_no_power"
                      ? zOnForActive
                        ? "Z 变化招式：状态效果不参与伤害计算"
                        : "变化招式或缺少威力，无法计算伤害"
                      : activeResult.error}
                  </div>
                  {zOnForActive && activeZNote && (
                    <div className="z-effect-note">{activeZNote}</div>
                  )}
                </>
              ) : (
                <>
                  <div className="res-desc">{resultDesc}</div>
                  <div className="res-rolls">
                    {activeResult.rolls.map((v: number, i: number) => (
                      <span
                        key={i}
                        className={
                          "roll" +
                          (v === activeResult.min ? " lo" : v === activeResult.max ? " hi" : "")
                        }
                      >
                        {v}
                      </span>
                    ))}
                  </div>
                  <div className="res-line">
                    <span className={"pkt-chip dark t-" + koTagType}>{koText}</span>
                    <span className="pkt-chip">{activeResult.label}</span>
                    {activeZName && (
                      <span className="z-effect-note" style={{ marginLeft: 10 }}>
                        Z：{activeZName}
                      </span>
                    )}
                    <span style={{ marginLeft: 10, color: "#666" }}>
                      16 种随机伤害；防御方 HP {activeHpText}
                    </span>
                  </div>
                </>
              )}
            </div>
          )}

          {/* 编辑面板 + 场地（移动端手风琴；U14 面板描边加深+轻投影） */}
          <div className="calc-editors">
            <div className={"acc-item" + (acc.A ? " open" : "")}>
              <div className="acc-head" onClick={() => setAcc({ ...acc, A: !acc.A })}>
                <span>我方 · {A.nameZh || "未选择"}</span>
                <span className="acc-arrow">›</span>
              </div>
              <div className="acc-body">
                <SideEditor
                  side={A}
                  which="A"
                  label={"左侧编辑 · " + (A.nameZh || "未选择")}
                  speciesList={speciesList}
                  items={items}
                  abilities={allAbilities}
                  natures={natures}
                  setSide={sideSet}
                />
              </div>
            </div>
            <div className={"acc-item" + (acc.D ? " open" : "")}>
              <div className="acc-head" onClick={() => setAcc({ ...acc, D: !acc.D })}>
                <span>对手 · {D.nameZh || "未选择"}</span>
                <span className="acc-arrow">›</span>
              </div>
              <div className="acc-body">
                <SideEditor
                  side={D}
                  which="D"
                  label={"右侧编辑 · " + (D.nameZh || "未选择")}
                  speciesList={speciesList}
                  items={items}
                  abilities={allAbilities}
                  natures={natures}
                  setSide={sideSet}
                />
              </div>
            </div>
            <div className={"acc-item field-wrap" + (acc.F ? " open" : "")}>
              <div className="acc-head" onClick={() => setAcc({ ...acc, F: !acc.F })}>
                <span>场地与状态</span>
                <span className="acc-arrow">›</span>
              </div>
              <div className="acc-body">
                <FieldPanel
                  field={field}
                  fieldSet={fieldSet}
                  sides={{ atk: { side: A, set: sideSet }, dfd: { side: D, set: sideSet } }}
                />
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/* ---- 摘要卡 ---- */
function SummaryCard({
  side,
  which,
  isDefender,
  dmg,
  activeMoveIdx,
  zMeta,
  items,
  maxMeta,
  gmaxMeta,
  natures,
  onPickMove,
  onToggleMech,
  onToggleZ,
}: {
  side: SideState;
  which: "A" | "D";
  isDefender: boolean;
  dmg: any;
  activeMoveIdx: number;
  zMeta: any;
  items: any[];
  maxMeta: any[];
  gmaxMeta: any[];
  natures: any[];
  onPickMove: (which: "A" | "D", idx: number) => void;
  onToggleMech: (which: "A" | "D", mech: "tera" | "max") => void;
  onToggleZ: (which: "A" | "D", idx: number) => void;
}): JSX.Element {
  const f = side.forms.find((x) => x.id === side.formId);
  const fl = f ? formDisplayName(f) : "";
  const sideName = !side.nameZh
    ? ""
    : fl && f && !f.is_default && fl !== "默认形态"
      ? `${side.nameZh}·${fl}`
      : side.nameZh;
  const evSummary = (() => {
    const n = (natures || []).find((x) => x.identifier === side.nature);
    return STAT_KEYS.map((k) => {
      const mark = n && n.up === k ? "+" : n && n.down === k ? "-" : "";
      const ev = side.evs[k] ? String(side.evs[k]) : "";
      return ev + mark || mark || "";
    })
      .filter(Boolean)
      .join(" / ");
  })();
  function boostMark(k: string): string {
    const v = side.boosts[k] || 0;
    return v > 0 ? `(+${v})` : v < 0 ? `(${v})` : "";
  }
  return (
    <div className={"sum-card" + (isDefender ? " defending" : "")}>
      <div className="sum-top">
        <div className="sum-art">
          {side.formId && (
            <img
              className="poke-img"
              key={side.formId}
              src={`/pkt/${side.formId}.png`}
              style={{ width: 96, height: 96 }}
              loading="lazy"
              onError={(e) => (e.target as HTMLElement).classList.add("img-missing")}
            />
          )}
        </div>
        <div className="sum-info">
          <div className="sum-name">{sideName || "选择宝可梦"}</div>
          <TypeBadge types={(f && f.types) || ""} />
          <div className="sum-marks">
            <img
              className={"mech-icon" + (side.teraOn ? " on" : "")}
              src={`/assets/mechanism/tera_${side.teraType === "星晶" ? "星晶" : side.teraType}.png`}
              title={`太晶化 · ${side.teraType}`}
              onClick={() => onToggleMech(which, "tera")}
            />
            <img
              className={"mech-icon" + (side.maxOn ? " on" : "")}
              src="/assets/mechanism/dynamax.png"
              title="极巨化"
              onClick={() => onToggleMech(which, "max")}
            />
          </div>
          <div className="sum-tags">
            {side.ability && <span className="pkt-chip">{side.ability}</span>}
            {side.item && <span className="pkt-chip warning">{side.item}</span>}
            {side.teraOn && (
              <span
                className="pkt-chip dark"
                style={{ background: `var(--type-${side.teraType})` }}
              >
                太晶·{side.teraType}
              </span>
            )}
            {side.maxOn && <span className="pkt-chip dark t-danger">极巨化</span>}
          </div>
          {evSummary && <div className="sum-ev">{evSummary}</div>}
          {side.lastStats && (
            <div className="sum-stats">
              Lv.{side.level}：
              {STAT_KEYS.map((k) => (
                <span key={k} className="ss">
                  {STAT_ZH[k]}
                  {side.lastStats[k]}
                  {boostMark(k)}
                </span>
              ))}
            </div>
          )}
          {isDefender && dmg && !dmg.error && (
            <div className="hp-bar">
              <div className="hp-fill" style={{ right: `${100 - Math.min(100, dmg.pct_max)}%` }} />
              {dmg.pct_max >= 100 && <span className="hp-txt">击倒！</span>}
            </div>
          )}
        </div>
      </div>
      <div className="sum-moves">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className={"move-btn" + (activeMoveIdx === i ? " active" : "")}
            onClick={() => onPickMove(which, i)}
          >
            <MoveChip
              side={side}
              idx={i}
              zMeta={zMeta}
              items={items}
              maxMeta={maxMeta}
              gmaxMeta={gmaxMeta}
              onToggleZ={() => onToggleZ(which, i)}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---- 招式槽 ---- */
function MoveChip({
  side,
  idx,
  zMeta,
  items,
  maxMeta,
  gmaxMeta,
  onToggleZ,
}: {
  side: SideState;
  idx: number;
  zMeta: any;
  items: any[];
  maxMeta: any[];
  gmaxMeta: any[];
  onToggleZ: () => void;
}): JSX.Element {
  void items;
  const move = side.moveOptions.find((m) => m.move_id === side.moves[idx]) || null;
  const zOn = !!side.zMarks[idx];
  const res = side.moveResults[idx];
  const maxNameMap: Record<string, string> = {};
  for (const m of maxMeta || []) maxNameMap[m.type_zh] = m.name_zh;
  const gmaxInfo = (() => {
    const f = side.forms.find((x) => x.id === side.formId);
    const ident = (f && f.identifier) || "";
    if (!ident.endsWith("-gmax")) return null;
    return (gmaxMeta || []).find((g) => g.form_identifier === ident) || null;
  })();
  const ex = move ? exclusiveZHit(side, move, zMeta) : null;
  const displayName = (() => {
    if (!move) return "";
    if (side.maxOn) {
      if (move.damage_class === "status") return "极巨防壁";
      if (gmaxInfo && gmaxInfo.type_zh === move.type_zh) return gmaxInfo.gmax_move_name;
      return maxNameMap[move.type_zh] || move.name_zh;
    }
    if (side.zMarks[idx] && move.power) {
      if (ex) return ex.z_move_name;
      const gz = ((zMeta && zMeta.generic) || []).find((x: any) => x.type === move.type_zh);
      if (gz) return gz.z_move_name;
    }
    return move.name_zh;
  })();
  const powerLabel = (() => {
    if (!move) return "";
    if (!move.power) return move.damage_class === "status" ? "变化" : "—";
    if (side.maxOn) return "威力自动";
    if (side.zMarks[idx]) {
      if (ex && ex.power) return ex.power;
      return "威力自动";
    }
    return move.power;
  })();
  const zIcon = (() => {
    if (!move) return "";
    if (ex && ex.crystal_identifier) return `/assets/items/${ex.crystal_identifier}.png`;
    const g = ((zMeta && zMeta.generic) || []).find((x: any) => x.type === move.type_zh);
    return g ? `/assets/items/${g.crystal_identifier}.png` : "";
  })();
  return (
    <div className={"move-chip" + (!move ? " empty" : "")}>
      {move ? (
        <>
          {zIcon && (
            <img
              className={"z-mark" + (zOn ? " on" : "")}
              src={zIcon}
              title={zOn ? "Z 招式已点亮（点击熄灭）" : "点亮 Z 招式（自动装备对应 Z 纯晶）"}
              onClick={(e) => {
                e.stopPropagation();
                onToggleZ();
              }}
            />
          )}
          <div className="mc-main">
            <span className="mc-name">{displayName}</span>
            <span className="mc-meta">
              {move.type_zh} {powerLabel}
            </span>
          </div>
          {res && !res.error ? (
            <span className="mc-dmg">
              {res.pct_min === res.pct_max ? `${res.pct_max}%` : `${res.pct_min}~${res.pct_max}%`}
            </span>
          ) : res && res.error ? (
            <span className="mc-dmg miss">—</span>
          ) : (
            <span className="mc-dmg" />
          )}
        </>
      ) : (
        <span className="mc-empty">招式 {idx + 1}</span>
      )}
    </div>
  );
}

/* ---- 编辑面板（U11：删平铺升降行，能力值表头加「等级」列） ---- */
function SideEditor({
  side,
  which,
  label,
  speciesList,
  items,
  abilities,
  natures,
  setSide,
}: {
  side: SideState;
  which: "A" | "D";
  label: string;
  speciesList: any[];
  items: any[];
  abilities: string[];
  natures: any[];
  setSide: (
    which: "A" | "D",
    patch: Partial<SideState> | ((s: SideState) => Partial<SideState>),
  ) => void;
}): JSX.Element {
  const ownAbilities = side.forms.find((x) => x.id === side.formId)?.ability_list || [];
  /* 特性下拉分组：自身特性在前，其余为「其他特性」（特性互换/复制等场景），去掉重复项 */
  const ownAbilityNames = ownAbilities.map((a: any) => a.name);
  const abilityOptions = [
    ...ownAbilities.map((a: any) => ({ name: a.name, hidden: a.hidden, grp: "自身特性" })),
    ...abilities
      .filter((a) => !ownAbilityNames.includes(a))
      .map((a) => ({ name: a, hidden: false, grp: "其他特性" })),
  ];
  /* U20：下拉只列对战相关道具并剔除超级进化石（自动锁定）；items 完整表供自动装备查找 */
  const itemOptions = useMemo(
    () =>
      items.filter(
        (i) => BATTLE_ITEM_IDS.has(itemIdOf(i.identifier)) && !isAutoEquipStone(i.identifier),
      ),
    [items],
  );
  const megaStone = (() => {
    const f = side.forms.find((x) => x.id === side.formId);
    if (!f || !isMegaForm(f) || (f.identifier || "").startsWith("rayquaza")) return "";
    if (side.zLocked !== "mega") return "";
    return side.item || "";
  })();
  const evLeft = 510 - Object.values(side.evs).reduce((a, b) => a + b, 0);

  async function onSpecies(sid: number): Promise<void> {
    await loadSpeciesInto(
      (s) => setSide(which, s),
      () => side,
      sid,
    );
  }
  function onForm(fid: number): void {
    const f = side.forms.find((x) => x.id === fid);
    const patch: Partial<SideState> = { formId: fid, zLocked: null };
    if (f && isMegaForm(f) && !(f.identifier || "").startsWith("rayquaza")) {
      const stone = findStone(f);
      if (stone) {
        patch.item = stone;
        patch.zLocked = "mega";
      }
    }
    /* 超级进化形态重置互斥机制 */
    if (f && isMegaForm(f)) {
      patch.teraOn = false;
      patch.maxOn = false;
      patch.zMarks = [false, false, false, false];
    }
    if (f && isGmaxForm(f)) patch.maxOn = true;
    /* 换形态重选默认特性（首个非隐藏） */
    patch.ability =
      f && f.ability_list && f.ability_list.length
        ? (f.ability_list.find((a: any) => !a.hidden) || f.ability_list[0]).name
        : "";
    setSide(which, (s) => ({
      ...patch,
      moves: s.moves.map((id) =>
        id != null && s.moveOptions.some((m) => m.move_id === id) ? id : null,
      ),
    }));
    if ((f?.identifier || "").startsWith("rayquaza-mega")) ensureDragonAscent();
  }
  function findStone(f: any): string {
    const sp = side.nameZh;
    if (!sp) return "";
    const suf = /mega-x$/.test(f.identifier || "")
      ? "Ｘ"
      : /mega-y$/.test(f.identifier || "")
        ? "Ｙ"
        : /mega-z$/.test(f.identifier || "")
          ? "Ｚ"
          : "";
    const hit = (items || []).find(
      (i) => i.name_zh === sp + "进化石" + suf || (suf === "" && i.name_zh === sp + "进化石"),
    );
    return hit ? hit.name_zh : "";
  }
  function ensureDragonAscent(): void {
    const has =
      side.moveOptions.some((m) => m.name_zh === "画龙点睛") &&
      side.moves.some((id) =>
        side.moveOptions.some((m) => m.move_id === id && m.name_zh === "画龙点睛"),
      );
    if (!has) {
      const da = side.moveOptions.find((m) => m.name_zh === "画龙点睛");
      if (da) {
        setSide(which, (s) => ({ ...s, moves: [da.move_id, ...s.moves.slice(1)] }));
        toast("烈空座超级进化需要「画龙点睛」，已自动替换招式 1", "warning");
      }
    }
  }
  function onItemChange(v: string): void {
    setSide(which, (s) => {
      const patch: Partial<SideState> = { item: v };
      if (s.zLocked === "z") patch.zMarks = [false, false, false, false];
      if (s.zLocked === "z" || s.zLocked === "mega") patch.zLocked = null;
      return patch;
    });
  }
  function baseOf(k: string): number | null {
    const f = side.forms.find((x) => x.id === side.formId);
    return f ? f[k] : null;
  }
  function movePowerOf(mid: number | null | undefined): string {
    const m = side.moveOptions.find((x) => x.move_id === mid);
    if (!m) return "";
    return m.power ? `威力 ${m.power}` : m.damage_class === "status" ? "变化" : "变动威力";
  }
  function needsPower(mid: number | null | undefined): boolean {
    const m = side.moveOptions.find((x) => x.move_id === mid);
    return !!(m && !m.power && m.damage_class !== "status");
  }
  function formLabel(f: any): string {
    const fl = formDisplayName(f);
    return (
      (fl && fl !== "默认形态" ? fl : "默认形态") +
      (f.is_mega || /-mega|-gmax|-primal/.test(f.identifier || "") ? " ⭐" : "")
    );
  }

  return (
    <div className="block side-editor">
      <h3>{label}</h3>
      {/* U15：宝可梦/性格/特性/等级 同一行（选择框收窄，flex-wrap 兜底） */}
      <div className="fld-row">
        {/* U10：物种下拉 = 过滤 + 上限 80 + 编号右浮 */}
        <FilterSelect
          value={side.speciesId}
          onChange={(v) => void onSpecies(v)}
          options={speciesList}
          displayOf={(v) => speciesList.find((x) => x.id === v)?.name_zh ?? String(v ?? "")}
          placeholder="搜索宝可梦（全图鉴）"
          style={{ flex: "1 1 150px", minWidth: 140 }}
          render={(s) => ({
            value: s.id,
            search: `${s.name_zh} ${s.id}`,
            label: (
              <span style={{ display: "flex", justifyContent: "space-between" }}>
                <span>{s.name_zh}</span>
                <span style={{ color: "#999", fontSize: 12 }}>
                  #{String(s.id).padStart(4, "0")}
                </span>
              </span>
            ),
          })}
        />
        <span className="fld-pair">
          <span className="lbl">性格</span>
          <select
            className="pkt-select"
            style={{ width: 110 }}
            value={side.nature}
            onChange={(e) => setSide(which, { nature: e.target.value })}
          >
            {natures.map((n) => (
              <option key={n.identifier} value={n.identifier}>
                {n.name_zh}
                {n.up && n.up !== n.down ? `（+${STAT_ZH[n.up]} -${STAT_ZH[n.down]}）` : ""}
              </option>
            ))}
          </select>
        </span>
        <span className="fld-pair">
          <span className="lbl">特性</span>
          {/* U10：全量特性下拉 = 过滤 + 上限 80；U15：自身特性/其他特性分组 */}
          <FilterSelect
            value={side.ability}
            onChange={(v) => setSide(which, { ability: v })}
            options={abilityOptions}
            placeholder="搜索特性"
            style={{ width: 120 }}
            render={(a: any) => ({
              value: a.name,
              search: a.name,
              label: a.grp === "自身特性" && a.hidden ? a.name + "（隐藏）" : a.name,
            })}
          />
        </span>
        <span className="fld-pair">
          <span className="lbl">等级</span>
          <input
            type="number"
            className="pkt-input"
            style={{ width: 64 }}
            min={1}
            max={100}
            value={side.level}
            onChange={(e) => setSide(which, { level: Number(e.target.value) })}
          />
        </span>
      </div>
      {/* U15：形态/太晶属性/道具 同一行 */}
      <div className="fld-row">
        {side.forms.length > 1 && (
          <span className="fld-pair">
            <span className="lbl">形态</span>
            <select
              className="pkt-select"
              style={{ flex: 1, minWidth: 130 }}
              value={side.formId ?? undefined}
              onChange={(e) => onForm(Number(e.target.value))}
            >
              {side.forms.map((f) => (
                <option key={f.id} value={f.id}>
                  {formLabel(f)}
                </option>
              ))}
            </select>
          </span>
        )}
        <span className="fld-pair">
          <span className="lbl">太晶属性</span>
          <select
            className="pkt-select"
            style={{ width: 110 }}
            value={side.teraType}
            onChange={(e) => setSide(which, { teraType: e.target.value })}
          >
            {TYPE_LIST.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
            <option value="星晶">星晶</option>
          </select>
        </span>
        <span className="fld-pair" style={{ flex: 1, minWidth: 170 }}>
          <span className="lbl">道具</span>
          {/* U10/U20：道具下拉 = 对战相关可携带道具（无超级进化石）+ 过滤上限 80 + 图标 */}
          <FilterSelect
            value={side.item}
            onChange={onItemChange}
            options={itemOptions}
            limit={600}
            placeholder="搜索道具"
            style={{ flex: 1, minWidth: 90 }}
            adornment={
              megaStone ? (
                <span className="fselect-lock" title={`超级进化形态自动装备：${megaStone}`}>
                  🔒
                </span>
              ) : null
            }
            render={(i) => ({
              value: i.name_zh,
              search: `${i.name_zh} ${i.identifier}`,
              label: (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                  <img
                    className="item-icon"
                    src={`/assets/items/${i.identifier}.png`}
                    width={18}
                    height={18}
                    onError={(e) => ((e.target as HTMLElement).style.visibility = "hidden")}
                  />
                  {i.name_zh}
                </span>
              ),
            })}
          />
        </span>
      </div>

      <div className="editor-moves">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="fld-row">
            <span className="lbl">招式{i + 1}</span>
            <FilterSelect
              value={side.moves[i]}
              onChange={(v) =>
                setSide(which, (s: SideState) => {
                  const moves = [...s.moves];
                  moves[i] = v;
                  return { moves };
                })
              }
              options={side.moveOptions}
              displayOf={(v) =>
                side.moveOptions.find((x) => x.move_id === v)?.name_zh ?? String(v ?? "")
              }
              placeholder="搜索招式（含变化招式）"
              render={(m) => ({
                value: m.move_id,
                search: `${m.name_zh} ${m.type_zh}`,
                label: (
                  <span style={{ display: "flex", justifyContent: "space-between" }}>
                    <span>{m.name_zh}</span>
                    <span style={{ color: "#999", fontSize: 12 }}>
                      {m.type_zh} ·{" "}
                      {
                        (
                          { physical: "物理", special: "特殊", status: "变化" } as Record<
                            string,
                            string
                          >
                        )[m.damage_class]
                      }
                      {" · "}
                      {m.power || (m.damage_class === "status" ? "变化" : "—")} · 世代
                      {m.gens.join(",")}
                    </span>
                  </span>
                ),
              })}
            />
            {needsPower(side.moves[i]) ? (
              <input
                type="number"
                className="pkt-input w96"
                min={1}
                max={250}
                placeholder="威力"
                value={side.varPowers[side.moves[i]!] ?? ""}
                onChange={(e) =>
                  setSide(which, (s: SideState) => ({
                    varPowers: { ...s.varPowers, [s.moves[i]!]: Number(e.target.value) },
                  }))
                }
              />
            ) : (
              <span className="mv-power">{movePowerOf(side.moves[i])}</span>
            )}
          </div>
        ))}
      </div>

      {/* U16：能力值表 —— 表头与单元格对齐（努力值跨滑条+数字两列）；等级变化列移到最后 */}
      <div className="stat-table">
        <div className="st-head">
          <span /> <span>种族</span>
          <span style={{ gridColumn: "3 / span 2" }}>努力值</span>
          <span>实际值</span>
          <span>等级变化</span>
        </div>
        {STAT_KEYS.map((k) => (
          <div key={k} className="st-row">
            <span className="st-k">{STAT_ZH[k]}</span>
            <span className="st-base">{baseOf(k) ?? "—"}</span>
            {/* U11：收窄努力值滑条 */}
            <input
              type="range"
              className="st-slider"
              min={0}
              max={252}
              step={4}
              value={side.evs[k]}
              onChange={(e) =>
                setSide(which, (s) => ({ evs: { ...s.evs, [k]: Number(e.target.value) } }))
              }
            />
            <span className="st-ev">{side.evs[k]}</span>
            <span className="st-actual">{side.lastStats ? side.lastStats[k] : "—"}</span>
            {k === "atk" || k === "spa" || k === "def" || k === "spd" ? (
              <select
                className="pkt-select st-boost"
                value={side.boosts[k]}
                onChange={(e) =>
                  setSide(which, (s) => ({ boosts: { ...s.boosts, [k]: Number(e.target.value) } }))
                }
              >
                {[-6, -5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5, 6].map((v) => (
                  <option key={v} value={v}>
                    {v > 0 ? `+${v}` : v}
                  </option>
                ))}
              </select>
            ) : (
              <span className="st-boost">—</span>
            )}
          </div>
        ))}
        <div className="ev-left">剩余努力值 {evLeft}/510</div>
      </div>
    </div>
  );
}

/* ---- 场地与状态区（U12 击中要害撑满行；U13 gap 收紧 8px） ---- */
const SCREENS = [
  { v: "reflect", t: "反射壁" },
  { v: "light_screen", t: "光墙" },
  { v: "aurora", t: "极光幕" },
];
const SHOW_STATUSES = ["中毒", "剧毒", "冰冻", "睡眠", "麻痹"];

function FieldPanel({
  field,
  fieldSet,
  sides,
}: {
  field: any;
  fieldSet: (patch: any) => void;
  sides: {
    atk: { side: SideState; set: (which: "A" | "D", patch: any) => void };
    dfd: { side: SideState; set: (which: "A" | "D", patch: any) => void };
  };
}): JSX.Element {
  const WEATHER4 = [
    { v: "sun", t: "晴天" },
    { v: "rain", t: "雨天" },
    { v: "sand", t: "沙暴" },
    { v: "snow", t: "雪天" },
  ];
  const WEATHER3 = [
    { v: "harsh_sun", t: "大日照" },
    { v: "harsh_rain", t: "大雨" },
    { v: "air", t: "乱流" },
  ];
  const TERRAINS = [
    { v: "electric", t: "电气场地" },
    { v: "grassy", t: "青草场地" },
    { v: "psychic", t: "精神场地" },
    { v: "mist", t: "薄雾场地" },
  ];
  const AURAS = [
    { v: "break", t: "气场破坏" },
    { v: "fairy", t: "妖精气场" },
    { v: "dark", t: "暗黑气场" },
  ];
  const RUINS = [
    { v: "sword", t: "灾祸之剑", eff: "(-防御)" },
    { v: "beads", t: "灾祸之玉", eff: "(-特防)" },
    { v: "tablets", t: "灾祸之简", eff: "(-攻击)" },
    { v: "vessel", t: "灾祸之鼎", eff: "(-特攻)" },
  ];

  return (
    <div className="block field-panel">
      <div className="fp-grid5">
        <SideStatusCol side={sides.atk.side} which="A" set={sides.atk.set} />
        <div className="fp-col fp-center">
          <div className="fp-row">
            <div className="fp-seg fp-grow">
              <button
                className={"fp-btn seg" + (field.mode === "singles" ? " on" : "")}
                onClick={() => fieldSet({ mode: "singles" })}
              >
                单打
              </button>
              <button
                className={"fp-btn seg" + (field.mode === "doubles" ? " on" : "")}
                onClick={() => fieldSet({ mode: "doubles" })}
              >
                双打
              </button>
            </div>
          </div>
          <div className="fp-row">
            {WEATHER4.map((w) => (
              <button
                key={w.v}
                className={"fp-btn" + (field.weather === w.v ? " on" : "")}
                onClick={() => fieldSet({ weather: field.weather === w.v ? "" : w.v })}
              >
                {w.t}
              </button>
            ))}
          </div>
          <div className="fp-row fp-inset">
            {WEATHER3.map((w) => (
              <button
                key={w.v}
                className={"fp-btn" + (field.weather === w.v ? " on" : "")}
                onClick={() => fieldSet({ weather: field.weather === w.v ? "" : w.v })}
              >
                {w.t}
              </button>
            ))}
          </div>
          <div className="fp-row">
            {TERRAINS.map((t) => (
              <button
                key={t.v}
                className={"fp-btn" + (field.terrain === t.v ? " on" : "")}
                onClick={() => fieldSet({ terrain: field.terrain === t.v ? "" : t.v })}
              >
                {t.t}
              </button>
            ))}
          </div>
          <div className="fp-row">
            {AURAS.map((a) => (
              <button
                key={a.v}
                className={"fp-btn" + (field.auras[a.v] ? " on" : "")}
                onClick={() => fieldSet({ auras: { ...field.auras, [a.v]: !field.auras[a.v] } })}
              >
                {a.t}
              </button>
            ))}
          </div>
          <div className="fp-row">
            {RUINS.map((r) => (
              <button
                key={r.v}
                className={"fp-btn fp-btn-2l" + (field.ruin[r.v] ? " on" : "")}
                onClick={() => fieldSet({ ruin: { ...field.ruin, [r.v]: !field.ruin[r.v] } })}
              >
                <span className="l1">{r.t}</span>
                <span className="l2">{r.eff}</span>
              </button>
            ))}
          </div>
          <div className="fp-row">
            <button
              className={"fp-btn" + (field.gravity ? " on" : "")}
              onClick={() => fieldSet({ gravity: !field.gravity })}
            >
              重力
            </button>
            <button
              className={"fp-btn" + (field.magic_room ? " on" : "")}
              onClick={() => fieldSet({ magic_room: !field.magic_room })}
            >
              魔法空间
            </button>
            <button
              className={"fp-btn" + (field.wonder_room ? " on" : "")}
              onClick={() => fieldSet({ wonder_room: !field.wonder_room })}
            >
              奇妙空间
            </button>
          </div>
        </div>
        <SideStatusCol side={sides.dfd.side} which="D" set={sides.dfd.set} />
      </div>
    </div>
  );
}

function SideStatusCol({
  side,
  which,
  set,
}: {
  side: SideState;
  which: "A" | "D";
  set: (which: "A" | "D", patch: any) => void;
}): JSX.Element {
  const s = side;
  const toggleStatus = (st: string) =>
    set(which, (cur: SideState) => ({
      statuses: cur.statuses.includes(st)
        ? cur.statuses.filter((x) => x !== st)
        : [...cur.statuses, st],
    }));
  return (
    <div className="fp-col">
      <div className="fp-row">
        <button
          className={"fp-btn" + (s.burn ? " on" : "")}
          onClick={() => set(which, (cur: SideState) => ({ burn: !cur.burn }))}
        >
          灼伤
        </button>
        {SHOW_STATUSES.map((st) => (
          <button
            key={st}
            className={"fp-btn" + (s.statuses.includes(st) ? " on" : "")}
            onClick={() => toggleStatus(st)}
          >
            {st}
          </button>
        ))}
      </div>
      <div className="fp-row">
        {SCREENS.map((x) => (
          <button
            key={x.v}
            className={"fp-btn" + (s.screen === x.v ? " on" : "")}
            onClick={() =>
              set(which, (cur: SideState) => ({ screen: cur.screen === x.v ? "" : x.v }))
            }
          >
            {x.t}
          </button>
        ))}
        <button
          className={"fp-btn" + (s.friendGuard ? " on" : "")}
          onClick={() => set(which, (cur: SideState) => ({ friendGuard: !cur.friendGuard }))}
        >
          友情防守
        </button>
      </div>
      {/* U16：击中要害回归普通按钮（弹性撑高会让三列高度失衡） */}
      <div className="fp-row">
        <button
          className={"fp-btn" + (s.crit ? " on" : "")}
          onClick={() => set(which, (cur: SideState) => ({ crit: !cur.crit }))}
        >
          击中要害
        </button>
      </div>
      <div className="fp-row">
        <button
          className={"fp-btn" + (s.helping ? " on" : "")}
          onClick={() => set(which, (cur: SideState) => ({ helping: !cur.helping }))}
        >
          帮助
        </button>
        <button
          className={"fp-btn" + (s.steely ? " on" : "")}
          onClick={() => set(which, (cur: SideState) => ({ steely: !cur.steely }))}
        >
          钢之意志
        </button>
        <button
          className={"fp-btn" + (s.battery ? " on" : "")}
          onClick={() => set(which, (cur: SideState) => ({ battery: !cur.battery }))}
        >
          蓄电池
        </button>
        <button
          className={"fp-btn" + (s.powerSpot ? " on" : "")}
          onClick={() => set(which, (cur: SideState) => ({ powerSpot: !cur.powerSpot }))}
        >
          能量点
        </button>
      </div>
      <div className="fp-row">
        <button
          className={"fp-btn fp-w55" + (s.hazards.rocks ? " on" : "")}
          onClick={() =>
            set(which, (cur: SideState) => ({
              hazards: { ...cur.hazards, rocks: !cur.hazards.rocks },
            }))
          }
        >
          隐形岩
        </button>
        <div className="fp-seg fp-grow">
          <span className="fp-seg-label">撒菱</span>
          {[1, 2, 3].map((n) => (
            <button
              key={n}
              className={"fp-btn seg" + (s.hazards.spikes === n ? " on" : "")}
              onClick={() =>
                set(which, (cur: SideState) => ({
                  hazards: { ...cur.hazards, spikes: cur.hazards.spikes === n ? 0 : n },
                }))
              }
            >
              {n}
            </button>
          ))}
        </div>
      </div>
      <div className="fp-row">
        <button
          className={"fp-btn" + (s.hazards.leechSeed ? " on" : "")}
          onClick={() =>
            set(which, (cur: SideState) => ({
              hazards: { ...cur.hazards, leechSeed: !cur.hazards.leechSeed },
            }))
          }
        >
          寄生种子
        </button>
        <button
          className={"fp-btn" + (s.hazards.saltCure ? " on" : "")}
          onClick={() =>
            set(which, (cur: SideState) => ({
              hazards: { ...cur.hazards, saltCure: !cur.hazards.saltCure },
            }))
          }
        >
          盐淹
        </button>
      </div>
      <div className="fp-row">
        <button
          className={"fp-btn" + (s.powerTrick ? " on" : "")}
          onClick={() => set(which, (cur: SideState) => ({ powerTrick: !cur.powerTrick }))}
        >
          力量戏法
        </button>
        <button
          className={"fp-btn" + (s.foresight ? " on" : "")}
          onClick={() => set(which, (cur: SideState) => ({ foresight: !cur.foresight }))}
        >
          被识破
        </button>
      </div>
      <div className="fp-row">
        <button
          className={"fp-btn" + (s.flowerGift ? " on" : "")}
          onClick={() => set(which, (cur: SideState) => ({ flowerGift: !cur.flowerGift }))}
        >
          花之礼
        </button>
        <button
          className={"fp-btn" + (s.tailwind ? " on" : "")}
          onClick={() => set(which, (cur: SideState) => ({ tailwind: !cur.tailwind }))}
        >
          顺风
        </button>
        <button
          className={"fp-btn" + (s.switching ? " on" : "")}
          onClick={() => set(which, (cur: SideState) => ({ switching: !cur.switching }))}
        >
          切换
        </button>
      </div>
    </div>
  );
}
