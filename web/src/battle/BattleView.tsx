import { useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "./store";
import type { MonState, SideSlot } from "../engine-adapter";
import type { RequestChoice } from "../engine-adapter/session";
import { dexFor, moveView, speciesView, TYPE_ZH, STATUS_ZH, zhLine } from "../data";
import { spriteUrl } from "./sprites";
import { useBattleAnim } from "./anim";
import type { AnimKind } from "./anim";
import { fieldConditions, condLabel, STATUS_ICON } from "./field";
import type { StoredBattleRecord } from "./storage";
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
  const detachSession = useApp((s) => s.detachSession);
  const go = useApp((s) => s.go);
  const finishBattle = useApp((s) => s.finishBattle);
  const settings = useApp((s) => s.settings);
  const updateSettings = useApp((s) => s.updateSettings);
  const format = useApp((s) => s.format);
  const teams = useApp((s) => s.teams);
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
  // 动画演出态（ident → 当前演出；关闭时恒空 = 降级信息流）。
  // 开关单源 settings.animation（设置页与对战页同源读写——本地副本曾与设置页脱钩，多次切换后语义反转）
  const animMap = useBattleAnim(
    snapshot?.events ?? [],
    settings.animation,
    settings.animationSpeed,
  );
  // 场地状态（天气/地形/空间/侧壁）：从事件流推导
  const conds = useMemo(() => fieldConditions(snapshot?.events ?? []), [snapshot?.events]);

  if (!session || !snapshot) {
    return (
      <div className="page">
        <h1>对战</h1>
        <p className="muted">当前没有进行中的对局。请从主页选择赛制 → 队伍编辑 → 上阵预览开始。</p>
        <button onClick={() => go("preview")}>前往上阵预览</button>
      </div>
    );
  }

  return (
    <div className="page page-battle">
      <div className="page-head-row">
        <h1>
          对战 · <span className="muted">{session.formatid}</span> · 第 {snapshot.turn} 回合
        </h1>
        <div className="grow" />
        <label className="anim-toggle">
          <input
            type="checkbox"
            checked={settings.animation}
            onChange={(e) => updateSettings({ animation: e.target.checked })}
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

      {/* 一屏三栏：左右 = 阵营指令面板占全列高（无需下拉），中列 = 场地（上）+ 日志（下，居中收窄）。
          双侧指令面板同屏常驻，可同时为双方出招（引擎按侧收指令，两个独立输入通道） */}
      <div className="battle-stage">
        <div className="stage-side stage-side-p1">
          <SideCommandPanel side="p1" snapshot={snapshot} dex={dex} />
        </div>
        <div className="stage-mid">
          <div className={"stage-field" + (conds.weather ? " w-" + conds.weather : "")}>
            <SideBoard
              side="p2"
              snapshot={snapshot}
              dex={dex}
              animated={settings.animation}
              animMap={animMap}
            />
            <div className="field-strip">
              <div className="field-conds">
                {conds.weather && (
                  <span className="cond cond-weather">{condLabel(conds.weather)}</span>
                )}
                {conds.terrain && (
                  <span className="cond cond-terrain">{condLabel(conds.terrain)}</span>
                )}
                {conds.fieldMoves.map((f) => (
                  <span key={f} className="cond cond-room">
                    {condLabel(f)}
                  </span>
                ))}
                {conds.sideStatus.p1.map((s) => (
                  <span key={"p1" + s} className="cond cond-side p1">
                    A·{condLabel(s)}
                  </span>
                ))}
                {conds.sideStatus.p2.map((s) => (
                  <span key={"p2" + s} className="cond cond-side p2">
                    B·{condLabel(s)}
                  </span>
                ))}
              </div>
              <div className="field-mid">
                <span>{snapshot.events.slice(-1)[0]?.value ?? ""}</span>
              </div>
            </div>
            <SideBoard
              side="p1"
              snapshot={snapshot}
              dex={dex}
              animated={settings.animation}
              animMap={animMap}
              back
            />
          </div>
          {/* 信息流日志（FR-09）—— 中列下半（唯一内部滚动区） */}
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
        <div className="stage-side stage-side-p2">
          <SideCommandPanel side="p2" snapshot={snapshot} dex={dex} />
        </div>
      </div>
    </div>
  );
}

/** 单侧指令面板：常驻一侧，含 ⏳待指令标识、指令被拒黄条（标明所属侧）与请求组件 */
function SideCommandPanel(props: {
  side: SideSlot;
  snapshot: NonNullable<ReturnType<typeof useApp.getState>["snapshot"]>;
  dex: ReturnType<typeof dexFor>;
}): JSX.Element {
  const { side, snapshot, dex } = props;
  const session = useApp((s) => s.session);
  const req = snapshot.requests[side];
  const awaiting = snapshot.pending.includes(side);
  const label = side === "p1" ? "阵营 A" : "阵营 B";
  const choose = (choice: string) => {
    if (session) void session.choose(side, choice);
  };

  return (
    <div className={"side-panel sp-" + side + (awaiting ? " awaiting" : "")}>
      <div className="side-panel-head">
        <b>{label}</b>
        <span className="muted">{awaiting ? "⏳待指令" : "已下达 / 等待结算"}</span>
      </div>
      {snapshot.lastError && snapshot.lastError.side === side && (
        <div className="alert warn">
          <b>指令未被接受：</b>
          {zhLine(snapshot.lastError.message)}（已复位，请重新下达）
        </div>
      )}
      {snapshot.phase === "finished" ? (
        <div className="battle-result">
          <b>对局结束：{snapshot.winner}</b>
          <button
            onClick={() => {
              useApp.getState().detachSession();
              useApp.getState().go("home");
            }}
          >
            返回主页
          </button>
          <button onClick={() => useApp.getState().go("records")}>查看记录</button>
        </div>
      ) : awaiting && req ? (
        <div className={"choices choices-" + side}>
          {req.teamPreview && (
            <TeamPreviewChoice
              req={req}
              dex={dex}
              onChoose={(order) => choose(`team ${order.join(",")}`)}
            />
          )}
          {req.forceSwitch && <ForceSwitchChoice req={req} dex={dex} onChoose={choose} />}
          {req.active && <MoveOrders req={req} dex={dex} onChoose={choose} side={side} />}
        </div>
      ) : (
        <div className="choices locked">等待该阵营收到新指令请求…</div>
      )}
    </div>
  );
}

function SideBoard(props: {
  side: "p1" | "p2";
  snapshot: NonNullable<ReturnType<typeof useApp.getState>["snapshot"]>;
  dex: ReturnType<typeof dexFor>;
  animated: boolean;
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
    // 竖排舞台单元：名字+血条在精灵头顶，血条宽 ≈ 精灵宽（等宽对齐）
    <div className="mon-stage">
      <div className="hp-panel">
        <div className="hp-head">
          <span className="hp-name">{zhNameOf(dex, nameId)}</span>
          {mon.status && (
            <span className={"status st-" + mon.status}>
              {STATUS_ICON[mon.status] ?? ""}
              {STATUS_ZH[mon.status] ?? mon.status}
            </span>
          )}
          {mon.terastallized && <span className="tera-badge">太晶·{mon.teraType}</span>}
          {mon.mega && <span className="mega-badge">超级进化</span>}
          {mon.max && <span className="max-badge">极巨</span>}
        </div>
        {/* 血条：白轨 + 恒绿存量（扣血露白，更直观） */}
        <div className="hp-bar">
          <div className="hp-fill" style={{ width: pct + "%" }} />
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
 * 支持机制按钮（太晶/极巨用图标点亮，Mega/Z 为文字按钮；同一精灵的机制互斥）、
 * 目标选择（双打需目标的招式）、主动换人。
 */
function MoveOrders(props: {
  req: RequestChoice;
  dex: Dex;
  onChoose: (c: string) => void;
  side: SideSlot;
}): JSX.Element {
  const { req, dex, onChoose } = props;
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
          跳过（换人）
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
                // 走 data 层 moveView（category 已归一小写；直读引擎的首字母大写会让分类全落「变化」）
                const mv = moveView(dex, m.id);
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
                      title={mv?.desc ?? ""}
                    >
                      <span className="mv-name">{zhMoveName(dex, m.id, m.move)}</span>
                      <span className="mv-meta muted">
                        {mv?.type ?? ""} ·{" "}
                        {mv?.category === "physical"
                          ? "物理"
                          : mv?.category === "special"
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
                {s.a.canTerastallize &&
                  mechBtn(sel, s.i, "terastallize", "太晶化", setSlot, {
                    icon: `/assets/mechanism/tera_${teraTypeOf(req, ordinal) ?? "一般"}.png`,
                  })}
                {s.a.canDynamax &&
                  mechBtn(sel, s.i, "dynamax", "极巨化", setSlot, {
                    icon: "/assets/mechanism/dynamax.png",
                  })}
                {s.a.canGigantamax &&
                  mechBtn(sel, s.i, "dynamax", "超极巨化", setSlot, {
                    icon: "/assets/mechanism/dynamax.png",
                  })}
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

/** 机制按钮：点亮 = 启用（对齐计算器交互）；同一槽位机制互斥（sel.mech 单值）。
 *  太晶/极巨走图标（/assets/mechanism，点亮提亮），Mega/Z 为文字按钮。 */
function mechBtn(
  sel: Record<number, SlotChoice>,
  slot: number,
  mech: string,
  label: string,
  setSlot: (slot: number, c: SlotChoice | undefined) => void,
  opts?: { icon?: string },
): JSX.Element {
  const cur = sel[slot];
  const on = cur?.kind === "move" && cur.mech === mech;
  return (
    <button
      className={"mech-btn mini" + (on ? " on" : "")}
      title={`${label}${on ? "（已点亮：出招时附加）" : ""}`}
      onClick={() => {
        if (!cur || cur.kind !== "move") return;
        setSlot(slot, { ...cur, mech: on ? undefined : mech });
      }}
    >
      {opts?.icon && (
        <img
          className={"mech-icon" + (on ? " on" : "")}
          src={opts.icon}
          alt={label}
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = "none";
          }}
        />
      )}
      {label}
      {on ? " ✓" : ""}
    </button>
  );
}

/** 当前槽位宝可梦的太晶属性（太晶图标按属性取 tera_{type}.png；引擎值为英文需转中文文件名） */
function teraTypeOf(req: RequestChoice, slotOrdinal: number): string | undefined {
  const mon = (req.side?.pokemon ?? []).filter((p) => p.active)[slotOrdinal];
  const t = mon?.teraType;
  if (!t) return undefined;
  return TYPE_ZH[t] ?? (t === "Stellar" ? "星晶" : t);
}

/** 被迫换人（多槽）：forceSwitch 每个槽位一条 switch/pass。
 *  替补不足时空位数 > 存活替补数：可交互槽 = 存活替补数（每槽必选），其余空位自动 pass
 *  （引擎 choosePass 的 forcedPassesLeft 语义 = 空位数 − 可换上的替补数），不阻塞确认。 */
function ForceSwitchChoice(props: {
  req: RequestChoice;
  dex: ReturnType<typeof dexFor>;
  onChoose: (c: string) => void;
}): JSX.Element {
  const { req, dex, onChoose } = props;
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

  // 需要交互选择的槽（前 min(空位, 替补) 个）；其余空位提交时自动 pass
  const choosable = needs.slice(0, benchOf.length);
  const passCount = needs.length - choosable.length;

  const allChosen = choosable.every((x) => sel[x.i] !== undefined);
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
      <b>
        选择换上场的宝可梦{needs.length > 1 ? `（${needs.length} 个空位）` : ""}
        {passCount > 0 && <span className="muted">（替补不足：{passCount} 个空位将自动跳过）</span>}
        ：
      </b>
      {choosable.map((x, ordinal) => (
        <div key={x.i} className="order-slot">
          <div className="slot-head">
            <b>{choosable.length > 1 ? `第 ${ordinal + 1} 个空位` : "空位"}</b>
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
                {zhDetails(b.p.details, dex)}
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
  dex: ReturnType<typeof dexFor>;
  onChoose: (order: number[]) => void;
}): JSX.Element {
  const { req, dex, onChoose } = props;
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
          {zhDetails(p.details, dex)}
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
          ? "（超级进化）"
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
  const text = zhLine(renderLine(kind, parts.slice(2)));
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
    case "-weather":
      return `天气：${zhFieldText(p[0] ?? "")}`;
    case "-fieldstart":
    case "fieldstart":
      return `场地：${zhFieldText(p[0] ?? "")}`;
    case "-fieldend":
    case "fieldend":
      return `场地结束：${zhFieldText(p[0] ?? "")}`;
    case "-end":
    case "-singlemove":
    case "-singleturn":
    case "-activate":
      return zhFieldText(clean(p.join(" ")));
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

/** 天气/场地/持续效果段的中文渲染（SunnyDay [from] ability: 日照 [of] p1a: 喷火龙 等） */
const FIELD_ZH: Record<string, string> = {
  SunnyDay: "日照强烈",
  RainDance: "下雨",
  Sandstorm: "沙暴",
  Hail: "冰雹",
  Snow: "下雪",
  ElectricTerrain: "电气场地",
  GrassyTerrain: "青草场地",
  MistyTerrain: "薄雾场地",
  PsychicTerrain: "精神场地",
  TrickRoom: "戏法空间",
  Tailwind: "顺风",
  Reflect: "反射壁",
  LightScreen: "光墙",
  AuroraVeil: "极光幕",
  Safeguard: "神秘守护",
  "move: Sunny Day": "日照强烈",
  "move: Rain Dance": "下雨",
};

function zhFieldText(raw: string): string {
  let out = raw;
  for (const [en, zh] of Object.entries(FIELD_ZH)) out = out.replaceAll(en, zh);
  out = out.replace(/\[upkeep\]/g, "（持续中）");
  out = out.replace(/\[from\] ability: ?/g, "（特性：");
  out = out.replace(/\[from\] ?move: ?/g, "（招式：");
  out = out.replace(/\[of\] ?/g, "——");
  if (out.includes("（特性：") && !out.endsWith("）")) out += "）";
  return out;
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
