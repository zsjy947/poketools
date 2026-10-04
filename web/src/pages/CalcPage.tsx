/* 伤害计算器页（自 Vue calc.js 迁移；U10 下拉限流+首入占位、U11 表头等级列、
 * U12 击中要害撑满行、U13 场地区紧凑、U14 面板描边加深+轻投影）。
 * 六个自包含组件与共享模型已拆至 ./calc/（纯位移重构，行为零变更）。 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiSend } from "../data/api";
import { formDisplayName, koTextFromKo, toast } from "../pkt/shared";
import { SideState, _metaCache, blankSide, isGmaxForm, isMegaForm, loadSpeciesInto, warmMeta, zCrystalFor } from "./calc/model";
import { SummaryCard } from "./calc/SummaryCard";
import { SideEditor } from "./calc/SideEditor";
import { FieldPanel } from "./calc/FieldPanel";

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
                  zMeta={zMeta}
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
                  zMeta={zMeta}
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

export { warmCalcMeta } from "./calc/model";
