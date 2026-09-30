import { useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "../app/store";
import type { MonState, SideSlot } from "../engine-adapter";
import type { RequestChoice } from "../engine-adapter/session";
import { dexFor, moveView, speciesView, TYPE_ZH, STATUS_ZH } from "../data";
import { spriteUrl } from "./sprites";
import { useBattleAnim } from "./anim";
import type { AnimKind } from "./anim";
import type { StoredBattleRecord } from "../app/storage";
import { exportShowdown } from "../team/showdown";

type Dex = ReturnType<typeof dexFor>;
type ActiveSlotData = NonNullable<NonNullable<RequestChoice["active"]>[number]>;

/**
 * 对战界面（FR-07/08/09）：单人操控双方（阵营切换 + 锁定态）、仿 Showdown 场地
 * （站位精灵/血条/状态）、招式/换人面板、完整日志回看；动画关闭自动降级信息流。
 *
 * 指令协议（sim/side.ts）：双打每回合每只在场宝可梦各一条指令（逗号连接）；
 * `move <序号> [+目标] [mega|zmove|dynamax|terastallize]`，目标正数=对手槽/负数=己方槽；
 * `team`/`switch` 指令编号均为 1 基。
 */
export function BattleView(): JSX.Element {
  const session = useApp((s) => s.session);
  const snapshot = useApp((s) => s.snapshot);
  const activeSide = useApp((s) => s.activeSide);
  const setActiveSide = useApp((s) => s.setActiveSide);
  const detachSession = useApp((s) => s.detachSession);
  const go = useApp((s) => s.go);
  const finishBattle = useApp((s) => s.finishBattle);
  const settings = useApp((s) => s.settings);
  const format = useApp((s) => s.format);
  const teams = useApp((s) => s.teams);
  const [animated, setAnimated] = useState(settings.animation);
  const recordedRef = useRef(false);
  const logEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (session && !snapshot) {
      // 会话快照桥（PreviewPage 已 subscribe，此处兜底重挂）
      session.subscribe((snap) => useApp.getState().pushSnapshot(snap));
    }
  }, [session, snapshot]);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ block: "end" });
  }, [snapshot?.logTail.length]);

  // 终局记录（FR-10）
  useEffect(() => {
    if (snapshot?.phase === "finished" && session && !recordedRef.current) {
      recordedRef.current = true;
      const record: StoredBattleRecord = {
        id: `r-${Date.now()}`,
        formatid: session.formatid,
        playedAt: Date.now(),
        winner: snapshot.winner ?? "未知",
        p1Name: "阵营 A",
        p2Name: "阵营 B",
        p1Team: exportShowdown(teams.A.sets),
        p2Team: exportShowdown(teams.B.sets),
        turns: snapshot.turn,
        log: session.deterministicLog(),
      };
      finishBattle(record);
    }
  }, [snapshot?.phase, snapshot?.winner, session, finishBattle, snapshot, teams, snapshot?.turn]);

  const dex = useMemo(() => dexFor(format?.mod ?? "gen9"), [format]);
  // 动画演出态（ident → 当前演出；关闭时恒空 = 降级信息流）
  const animMap = useBattleAnim(snapshot?.events ?? [], animated, settings.animationSpeed);

  if (!session || !snapshot) {
    return (
      <div className="page">
        <h1>对战</h1>
        <p className="muted">当前没有进行中的对局。请从主页选择赛制 → 队伍编辑 → 上阵预览开始。</p>
        <button onClick={() => go("preview")}>前往上阵预览</button>
      </div>
    );
  }

  const req = snapshot.requests[activeSide];
  const awaitingThis = snapshot.pending.includes(activeSide);

  const choose = (choice: string) => {
    void session.choose(activeSide, choice);
  };
  const doTeamPreview = (order: number[]) => {
    choose(`team ${order.join(",")}`);
  };

  return (
    <div className={"page page-battle side-active-" + activeSide}>
      <div className="page-head-row">
        <h1>
          对战 · <span className="muted">{session.formatid}</span> · 第 {snapshot.turn} 回合
        </h1>
        <div className="grow" />
        <label className="anim-toggle">
          <input
            type="checkbox"
            checked={animated}
            onChange={(e) => setAnimated(e.target.checked)}
          />
          动画演出
        </label>
        <button
          onClick={() => {
            detachSession();
            go("preview");
          }}
        >
          结束本局
        </button>
      </div>

      {/* 阵营切换（防误操作：全屏配色联动 + 横幅） */}
      <div className="side-switch">
        <span className="banner">
          正在为<b>{activeSide === "p1" ? "阵营 A" : "阵营 B"}</b>下令
        </span>
        {(["p1", "p2"] as SideSlot[]).map((s) => (
          <button key={s} className={activeSide === s ? "on" : ""} onClick={() => setActiveSide(s)}>
            阵营 {s === "p1" ? "A" : "B"}
            {snapshot.pending.includes(s) ? " ⏳待指令" : ""}
          </button>
        ))}
      </div>

      {/* 场地：上=对方(p2 正面)，下=己方(p1 背面)；双打各显示两只 */}
      <div className="battle-field">
        <SideBoard
          side="p2"
          snapshot={snapshot}
          dex={dex}
          animated={animated}
          active={activeSide === "p2"}
          animMap={animMap}
        />
        <div className="field-mid">
          <span>{snapshot.events.slice(-1)[0]?.value ?? ""}</span>
        </div>
        <SideBoard
          side="p1"
          snapshot={snapshot}
          dex={dex}
          animated={animated}
          active={activeSide === "p1"}
          animMap={animMap}
          back
        />
      </div>

      {/* 指令面板：仅当前操作阵营可操作（另一侧锁定态） */}
      <div className="control-panel">
        {snapshot.lastError && snapshot.lastError.side === activeSide && (
          <div className="alert warn">
            <b>指令未被接受：</b>
            {snapshot.lastError.message}（已复位，请重新下达）
          </div>
        )}
        {snapshot.phase === "finished" ? (
          <div className="battle-result">
            <b>对局结束：{snapshot.winner}</b>
            <button
              onClick={() => {
                detachSession();
                go("home");
              }}
            >
              返回主页
            </button>
            <button onClick={() => go("records")}>查看记录</button>
          </div>
        ) : awaitingThis && req ? (
          <div className={"choices choices-" + activeSide}>
            {req.teamPreview && <TeamPreviewChoice req={req} onChoose={doTeamPreview} />}
            {req.forceSwitch && <ForceSwitchChoice req={req} onChoose={choose} />}
            {req.active && (
              <MoveOrders
                req={req}
                dex={dex}
                onChoose={choose}
                animated={animated}
                speed={settings.animationSpeed}
              />
            )}
          </div>
        ) : (
          <div className="choices locked">等待另一阵营下达指令…（上方切换阵营查看）</div>
        )}
      </div>

      {/* 信息流日志（FR-09） */}
      <div className="battle-log">
        <h3>战斗日志（可回看）</h3>
        <div className="log-scroll">
          {snapshot.logTail.map((l: string, i: number) => (
            <LogLine key={i} line={l} />
          ))}
          <div ref={logEndRef} />
        </div>
      </div>
    </div>
  );
}

function SideBoard(props: {
  side: "p1" | "p2";
  snapshot: NonNullable<ReturnType<typeof useApp.getState>["snapshot"]>;
  dex: ReturnType<typeof dexFor>;
  animated: boolean;
  active: boolean;
  animMap: Record<string, AnimKind>;
  back?: boolean;
}): JSX.Element {
  const { side, snapshot, dex, animated, back, animMap } = props;
  const state = snapshot.sides[side];
  const actives = state.active
    .map((ident) => state.bench.find((m) => m.ident === ident))
    .filter((m): m is MonState => !!m);
  return (
    <div className={"side-board sb-" + side + (back ? " back-view" : "")}>
      <div className="board-head">
        <span>{state.name}</span>
        <span className="muted">
          {state.bench.filter((m) => !m.fainted).length}/{state.bench.length} 存活
        </span>
      </div>
      <div className="side-actives">
        {actives.length > 0 ? (
          actives.map((m) => (
            <MonStage
              key={m.ident}
              mon={m}
              dex={dex}
              animated={animated}
              side={side}
              back={!!back}
              anim={animMap[m.ident]}
            />
          ))
        ) : (
          <div className="mon-stage empty muted">（无在场宝可梦）</div>
        )}
      </div>
      <div className="bench-row">
        {state.bench.map((m) => (
          <span
            key={m.ident}
            className={"bench-ball" + (m.fainted ? " fainted" : "")}
            title={`${m.details}${m.status ? `（${STATUS_ZH[m.status] ?? m.status}）` : ""}`}
          >
            {m.fainted ? "×" : "●"}
          </span>
        ))}
      </div>
    </div>
  );
}

function MonStage(props: {
  mon: MonState;
  dex: ReturnType<typeof dexFor>;
  animated: boolean;
  side: "p1" | "p2";
  back: boolean;
  anim?: AnimKind | undefined;
}): JSX.Element {
  const { mon, dex, animated, side, back, anim } = props;
  // 精灵文件名 = 引擎 spriteid（官方 dump 口径：garchomp-mega/hooh/muk-alola）；中文名按物种 id 查
  const spName = mon.details.split(",")[0]?.trim() ?? "";
  const sp = dex.species.get(spName);
  const nameId = sp.exists ? sp.id : spName.toLowerCase().replace(/ /g, "-");
  const spriteId = sp.exists ? sp.spriteid : nameId;
  // 三级回退：静态 → 动画 → 官方绘图（dex）；全部缺失时占位隐藏（dump 个别缺口兜底）
  const [srcIdx, setSrcIdx] = useState(0);
  const candidates = (
    animated
      ? [spriteUrl(spriteId, { back, animated: true }), spriteUrl(spriteId, { dex: true })]
      : [
          spriteUrl(spriteId, { back }),
          spriteUrl(spriteId, { back, animated: true }),
          spriteUrl(spriteId, { dex: true }),
        ]
  ).filter(Boolean);
  const url = candidates[srcIdx] ?? null;
  const pct = mon.maxhp > 0 ? Math.round((mon.hp / mon.maxhp) * 100) : 0;
  const animCls = anim ? " anim-" + anim : "";
  return (
    <div className="mon-stage">
      <div className="hp-panel">
        <span className="hp-name">{zhNameOf(dex, nameId)}</span>
        {mon.status && (
          <span className={"status st-" + mon.status}>{STATUS_ZH[mon.status] ?? mon.status}</span>
        )}
        {mon.terastallized && <span className="tera-badge">太晶·{mon.teraType}</span>}
        {mon.mega && <span className="mega-badge">MEGA</span>}
        {mon.max && <span className="max-badge">极巨</span>}
        <div className="hp-bar">
          <div className={"hp-fill hp-" + hpBand(pct)} style={{ width: pct + "%" }} />
        </div>
        <span className="hp-num">
          {mon.hp}/{mon.maxhp}
        </span>
      </div>
      {url ? (
        <img
          className={"mon-sprite" + (mon.fainted ? " fainted" : "") + animCls}
          data-side={side}
          src={url}
          alt={mon.details}
          onError={(e) => {
            if (srcIdx + 1 < candidates.length) setSrcIdx(srcIdx + 1);
            else (e.target as HTMLImageElement).style.visibility = "hidden";
          }}
        />
      ) : (
        <div className="mon-sprite placeholder" />
      )}
    </div>
  );
}

/** 无需目标选择的招式 target 值 */
const NO_TARGET = [
  "self",
  "randomNormal",
  "all",
  "allAdjacent",
  "allAdjacentFoes",
  "allySide",
  "foeSide",
  "usersSide",
  "allyTeam",
  "scripted",
];

interface SlotSel {
  kind: "move";
  moveIdx: number;
  mech?: string | undefined;
  target?: number | undefined;
}
interface SlotSwitch {
  kind: "switch";
  benchIdx: number; // req.side.pokemon 0 基索引
}
type SlotChoice = SlotSel | SlotSwitch;

/**
 * 招式回合指令（多槽合成）：双打时每只在场宝可梦一条指令，逐槽选择后统一「下达指令」。
 * 支持机制按钮（mega/Z/极巨/太晶，随槽声明）、目标选择（双打需目标的招式）、主动换人。
 */
function MoveOrders(props: {
  req: RequestChoice;
  dex: Dex;
  onChoose: (c: string) => void;
  animated: boolean;
  speed: number;
}): JSX.Element {
  const { req, dex, onChoose, animated, speed } = props;
  void animated;
  void speed;
  const mons = req.side?.pokemon ?? [];
  const liveActive = mons.filter((m) => m.active && !m.condition.includes("fnt"));
  // 引擎对濒死槽自动 pass（side.getChoiceIndex）：只渲染存活数对应的槽，
  // 多发指令会被拒（You sent more choices than unfainted Pokémon）
  const slots = (req.active ?? [])
    .map((a, i) => ({ a, i }))
    .filter((x): x is { a: ActiveSlotData; i: number } => !!x.a)
    .slice(0, liveActive.length);
  if (slots.length === 0) {
    return (
      <div>
        <p className="muted">没有可行动的宝可梦。</p>
        <button className="primary" onClick={() => onChoose("pass")}>
          跳过（pass）
        </button>
      </div>
    );
  }
  // 目标选择取决于场地槽位数（双打残局单在场仍需指定目标），而非存活数
  const doubles = mons.filter((m) => m.active).length > 1;
  const activesOnField = (req.side?.pokemon ?? []).filter(
    (p) => p.active && !p.condition.includes("fnt"),
  );
  const [sel, setSel] = useState<Record<number, SlotChoice>>({});
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    setSel({});
    setSubmitted(false);
  }, [req]);

  const benchOf = (req.side?.pokemon ?? [])
    .map((p, i) => ({ p, i }))
    .filter((x) => !x.p.active && !x.p.condition.includes("fnt"));

  const setSlot = (slot: number, choice: SlotChoice | undefined) => {
    setSel((prev) => {
      const next = { ...prev };
      if (!choice) delete next[slot];
      else {
        next[slot] = choice;
        // 换人目标互斥：同一替补只能给一个槽
        if (choice.kind === "switch") {
          for (const k of Object.keys(next)) {
            const n = Number(k);
            if (n !== slot && next[n]?.kind === "switch" && next[n].benchIdx === choice.benchIdx)
              delete next[n];
          }
        }
      }
      return next;
    });
  };

  const allChosen = slots.every((s) => sel[s.i]);
  const submit = () => {
    const parts = slots.map((s) => {
      const c = sel[s.i];
      if (!c) return "pass";
      if (c.kind === "switch") return `switch ${c.benchIdx + 1}`;
      let part = `move ${c.moveIdx + 1}`;
      const mv = s.a.moves[c.moveIdx];
      const needsTarget = doubles && !!mv?.target && !NO_TARGET.includes(mv.target);
      if (needsTarget && c.target !== undefined) part += ` ${c.target > 0 ? "+" : ""}${c.target}`;
      if (c.mech) part += ` ${c.mech}`;
      return part;
    });
    setSubmitted(true);
    onChoose(parts.join(", "));
  };

  return (
    <div className="orders">
      {slots.map((s, ordinal) => {
        const mon = activesOnField[ordinal];
        const cur = sel[s.i];
        return (
          <div key={s.i} className="order-slot">
            <div className="slot-head">
              <b>{slots.length > 1 ? `第 ${ordinal + 1} 只` : "行动"}</b>
              <span className="muted">{mon ? zhDetails(mon.details, dex) : ""}</span>
              {cur && (
                <span className="muted">→ {describeChoice(cur, s.a.moves, dex, doubles)}</span>
              )}
            </div>
            <div className="move-grid">
              {s.a.moves.map((m, i) => {
                const mv = dex.moves.get(m.id);
                const on = cur?.kind === "move" && cur.moveIdx === i;
                const needsTarget = doubles && !!m.target && !NO_TARGET.includes(m.target);
                return (
                  <div key={i} className="move-cell">
                    <button
                      disabled={m.disabled}
                      className={"move-btn" + (on ? " on" : "")}
                      onClick={() =>
                        setSlot(s.i, {
                          kind: "move",
                          moveIdx: i,
                          target: defaultTarget(m.target, ordinal),
                          mech: cur?.kind === "move" ? cur.mech : undefined,
                        })
                      }
                      title={mv.exists ? mv.desc || mv.shortDesc || "" : ""}
                    >
                      <span className="mv-name">{zhMoveName(dex, m.id, m.move)}</span>
                      <span className="mv-meta muted">
                        {TYPE_ZH[mv.type] ?? mv.type} ·{" "}
                        {mv.category === "physical"
                          ? "物理"
                          : mv.category === "special"
                            ? "特殊"
                            : "变化"}
                      </span>
                      <span className="mv-pp muted">
                        PP {m.pp}/{m.maxpp}
                      </span>
                    </button>
                    {on && needsTarget && (
                      <div className="target-row">
                        {[1, 2].map((loc) => (
                          <button
                            key={loc}
                            className={"mini" + (cur.target === loc ? " on" : "")}
                            onClick={() =>
                              setSlot(s.i, {
                                kind: "move",
                                moveIdx: i,
                                target: loc,
                                mech: cur.mech,
                              })
                            }
                          >
                            对手{loc === 1 ? "左" : "右"}
                          </button>
                        ))}
                        {[-1, -2].map((loc) => (
                          <button
                            key={loc}
                            className={"mini" + (cur.target === loc ? " on" : "")}
                            onClick={() =>
                              setSlot(s.i, {
                                kind: "move",
                                moveIdx: i,
                                target: loc,
                                mech: cur.mech,
                              })
                            }
                          >
                            己方{loc === -1 ? "左" : "右"}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            {(s.a.canMegaEvo ||
              s.a.canZMove ||
              s.a.canDynamax ||
              s.a.canGigantamax ||
              s.a.canTerastallize) && (
              <div className="mech-row">
                {s.a.canTerastallize && mechBtn(sel, s.i, "terastallize", "太晶化", setSlot)}
                {s.a.canDynamax && mechBtn(sel, s.i, "dynamax", "极巨化", setSlot)}
                {s.a.canGigantamax && mechBtn(sel, s.i, "dynamax", "超极巨化", setSlot)}
                {s.a.canMegaEvo && mechBtn(sel, s.i, "mega", "超级进化", setSlot)}
                {s.a.canZMove && mechBtn(sel, s.i, "zmove", "Z 招式", setSlot)}
              </div>
            )}
            {benchOf.length > 0 && (
              <div className="switch-row">
                {cur?.kind === "switch" ? (
                  <>
                    <span className="muted">换上：</span>
                    {benchOf.map((b) => (
                      <button
                        key={b.i}
                        className={"mini" + (cur.benchIdx === b.i ? " on" : "")}
                        onClick={() => setSlot(s.i, { kind: "switch", benchIdx: b.i })}
                      >
                        {zhDetails(b.p.details, dex)}
                      </button>
                    ))}
                    <button className="mini" onClick={() => setSlot(s.i, undefined)}>
                      取消换人
                    </button>
                  </>
                ) : (
                  <button
                    className="mini"
                    onClick={() => {
                      const free = benchOf.find(
                        (b) =>
                          !Object.values(sel).some(
                            (c) => c.kind === "switch" && c.benchIdx === b.i,
                          ),
                      );
                      if (free) setSlot(s.i, { kind: "switch", benchIdx: free.i });
                    }}
                  >
                    改为换人
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}
      <button className="primary" disabled={!allChosen || submitted} onClick={submit}>
        {submitted ? "已下达，等待结算…" : "下达指令"}
      </button>
    </div>
  );
}

function mechBtn(
  sel: Record<number, SlotChoice>,
  slot: number,
  mech: string,
  label: string,
  setSlot: (slot: number, c: SlotChoice | undefined) => void,
): JSX.Element {
  const cur = sel[slot];
  const on = cur?.kind === "move" && cur.mech === mech;
  return (
    <button
      className={"mech-btn mini" + (on ? " on" : "")}
      onClick={() => {
        if (!cur || cur.kind !== "move") return;
        setSlot(slot, { ...cur, mech: on ? undefined : mech });
      }}
    >
      {label}
      {on ? " ✓" : ""}
    </button>
  );
}

/** 被迫换人（多槽）：forceSwitch 每个槽位一条 switch/pass；替补不足的槽用 pass。 */
function ForceSwitchChoice(props: {
  req: RequestChoice;
  onChoose: (c: string) => void;
}): JSX.Element {
  const { req, onChoose } = props;
  const needs = (req.forceSwitch ?? []).map((n, i) => ({ n: !!n, i })).filter((x) => x.n);
  const benchOf = (req.side?.pokemon ?? [])
    .map((p, i) => ({ p, i }))
    .filter((x) => !x.p.active && !x.p.condition.includes("fnt"));
  const [sel, setSel] = useState<Record<number, number>>({});
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    setSel({});
    setSubmitted(false);
  }, [req]);

  const allChosen = needs.every((x) => benchOf.length === 0 || sel[x.i] !== undefined);
  const submit = () => {
    const parts = needs.map((x) => {
      const pick = sel[x.i];
      return pick === undefined ? "pass" : `switch ${pick + 1}`;
    });
    setSubmitted(true);
    onChoose(parts.join(", "));
  };

  if (benchOf.length === 0) {
    return (
      <div className="switch-grid">
        <b>没有可换上的宝可梦了</b>
        <button className="primary" onClick={() => onChoose(needs.map(() => "pass").join(", "))}>
          放弃行动（pass）
        </button>
      </div>
    );
  }

  return (
    <div className="switch-grid">
      <b>选择换上场的宝可梦{needs.length > 1 ? `（${needs.length} 个槽位）` : ""}：</b>
      {needs.map((x, ordinal) => (
        <div key={x.i} className="order-slot">
          <div className="slot-head">
            <b>{needs.length > 1 ? `第 ${ordinal + 1} 个空位` : "空位"}</b>
          </div>
          <div className="switch-row">
            {benchOf.map((b) => (
              <button
                key={b.i}
                className={"mini" + (sel[x.i] === b.i ? " on" : "")}
                onClick={() =>
                  setSel((prev) => {
                    const next = { ...prev };
                    for (const k of Object.keys(next))
                      if (next[Number(k)] === b.i) delete next[Number(k)];
                    next[x.i] = b.i;
                    return next;
                  })
                }
              >
                {b.p.details}
              </button>
            ))}
          </div>
        </div>
      ))}
      <button className="primary" disabled={!allChosen || submitted} onClick={submit}>
        {submitted ? "已确认，等待结算…" : "确认换人"}
      </button>
    </div>
  );
}

/** 上阵顺序（1 基编号）：按出招顺序排列上阵成员；须选满才能确认（引擎要求完整 pickedTeamSize） */
function TeamPreviewChoice(props: {
  req: RequestChoice;
  onChoose: (order: number[]) => void;
}): JSX.Element {
  const { req, onChoose } = props;
  const [order, setOrder] = useState<number[]>([]);
  const [submitted, setSubmitted] = useState(false);
  useEffect(() => {
    setOrder([]);
    setSubmitted(false);
  }, [req]);
  const mons = req.side.pokemon;
  const max = req.maxChosenTeamSize ?? mons.length;
  return (
    <div className="tp-grid">
      <b>
        上阵预览（{order.length}/{max}，按出招顺序点击）：
      </b>
      {mons.map((p, i) => (
        <button
          key={p.ident}
          className={order.includes(i) ? "on" : ""}
          disabled={submitted}
          onClick={() => {
            const next = order.includes(i)
              ? order.filter((x) => x !== i)
              : order.length >= max
                ? order
                : [...order, i];
            setOrder(next);
          }}
        >
          {p.details}
        </button>
      ))}
      <button
        className="primary"
        disabled={order.length !== max || submitted}
        onClick={() => {
          setSubmitted(true);
          onChoose(order.map((i) => i + 1));
        }}
      >
        {submitted ? "已确认，等待对手…" : "确认上阵"}
      </button>
    </div>
  );
}

function describeChoice(
  c: SlotChoice,
  moves: Array<{ move: string; id: string }>,
  dex: Dex,
  doubles: boolean,
): string {
  if (c.kind === "switch") return "换人";
  const m = moves[c.moveIdx];
  const name = m ? zhMoveName(dex, m.id, m.move) : "";
  const mech =
    c.mech === "terastallize"
      ? "（太晶）"
      : c.mech === "dynamax"
        ? "（极巨）"
        : c.mech === "mega"
          ? "（Mega）"
          : c.mech === "zmove"
            ? "（Z）"
            : "";
  const target =
    doubles && c.target !== undefined
      ? `→${c.target > 0 ? "对手" : "己方"}${Math.abs(c.target) === 1 ? "左" : "右"}`
      : "";
  return name + mech + target;
}

/** 目标缺省值（getAtLoc：正=对手槽，负=己方槽；adjacentAlly 系招式缺省指向同伴/自己） */
function defaultTarget(target: string | undefined, slotOrdinal: number): number | undefined {
  if (!target) return undefined;
  if (target === "adjacentAlly") return slotOrdinal === 0 ? -2 : -1;
  if (target === "adjacentAllyOrSelf") return slotOrdinal === 0 ? -1 : -2;
  return 1;
}

function LogLine(props: { line: string }): JSX.Element {
  const { line } = props;
  if (!line.startsWith("|")) return <div className="log-raw">{line}</div>;
  const parts = line.split("|");
  const kind = parts[1] ?? "";
  const text = renderLine(kind, parts.slice(2));
  return <div className={"log-line log-" + kind.replace(/[^a-z-]/g, "")}>{text}</div>;
}

function renderLine(kind: string, p: string[]): string {
  const clean = (s: string | undefined) =>
    (s ?? "").replace(/\\n/g, " ").replace(/\n/g, " ").trim();
  switch (kind) {
    case "turn":
      return `—— 第 ${p[0]} 回合 ——`;
    case "move":
      return `${p[0]} 使用了 ${p[1]}！`;
    case "switch":
    case "drag":
      return `${p[0]}，就决定是你了！（${p[1]}）`;
    case "damage":
      return `${p[0]} 受到了伤害。`;
    case "heal":
      return `${p[0]} 回复了 HP。`;
    case "faint":
      return `${p[0]} 倒下了！`;
    case "win":
      return `🎉 ${p[0]} 获胜！`;
    case "tie":
      return "平局。";
    case "mega":
      return `${p[0]} 超级进化成了 ${p[1]}！`;
    case "terastallize":
    case "-terastallize":
      return `${p[0]} 太晶化！（${p[1]}）`;
    case "max":
      return `${p[0]} 极巨化了！`;
    case "zpower":
      return `${p[0]} 汇聚了 Z 力量！`;
    case "weather":
      return `天气：${p[0]}`;
    case "-fieldstart":
    case "fieldstart":
      return `场地：${p[0]}`;
    case "-supereffective":
      return "效果绝佳！";
    case "-resisted":
      return "效果不太好…";
    case "-immune":
      return "没有效果…";
    case "-crit":
      return "击中了要害！";
    case "-status":
      return `${p[0]} 陷入了${p[1]}状态。`;
    case "rule":
      return `规则：${p[0]}`;
    case "error":
      return `⚠ ${clean(p.join(" "))}`;
    default:
      return clean(p.filter(Boolean).join(" "));
  }
}

function zhDetails(details: string, dex: Dex): string {
  // "Garchomp, L50, M" → 物种段转中文名（其余保留）
  const seg = details.split(",")[0]?.trim() ?? "";
  const rest = details.includes(",") ? details.slice(details.indexOf(",")) : "";
  const id = seg.toLowerCase().replace(/ /g, "-");
  return (speciesView(dex, id)?.zhName ?? seg) + rest;
}

function zhNameOf(dex: Dex, speciesId: string): string {
  return speciesView(dex, speciesId)?.zhName ?? speciesId;
}

function zhMoveName(dex: Dex, id: string, fallback: string): string {
  return moveView(dex, id)?.zhName ?? fallback;
}

function hpBand(pct: number): string {
  return pct > 50 ? "hi" : pct > 20 ? "mid" : "lo";
}
