/* 指令面板组件（RM-12 自 BattleView.tsx 纯位移拆出，无行为变更）：
 * SideCommandPanel / liveMoveSlots / MoveOrders / ForceSwitchChoice /
 * TeamPreviewChoice / describeChoice 及其助手 */

import { useEffect, useState } from "react";
import { useApp } from "../store";
import type { SideSlot } from "../../engine-adapter";
import type { RequestChoice } from "../../engine-adapter/session";
import { dexFor, moveView, speciesView, TYPE_ZH, zhLine } from "../../data";
import type { Dex } from "../../data/dex-types";

type ActiveSlotData = NonNullable<NonNullable<RequestChoice["active"]>[number]>;

export function SideCommandPanel(props: {
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
/** 招式回合可行动槽位：req.active[i] 与场上第 i 只（含濒死，按槽序）对齐，
 *  只保留**该槽位宝可梦存活**的槽。不能按「前 N 个」截取——左侧（槽 0）阵亡时
 *  前槽恰好是濒死者的招式数据，会出现「名字=右侧存活者、招式=左侧阵亡者」的错位；
 *  引擎对濒死槽自动 pass（getChoiceIndex），指令仍按存活槽的场地序拼装。 */
export function liveMoveSlots(req: RequestChoice): Array<{
  a: ActiveSlotData;
  /** 场地槽位（0=左/单打位，1=右）；目标缺省与「左/右」标签按它取值 */
  i: number;
  mon: NonNullable<RequestChoice["side"]>["pokemon"][number];
}> {
  const mons = req.side?.pokemon ?? [];
  const onField = mons.filter((m) => m.active);
  const out: ReturnType<typeof liveMoveSlots> = [];
  (req.active ?? []).forEach((a, i) => {
    const mon = onField[i];
    if (a && mon && !mon.condition.includes("fnt")) out.push({ a, i, mon });
  });
  return out;
}

function MoveOrders(props: {
  req: RequestChoice;
  dex: Dex;
  onChoose: (c: string) => void;
  side: SideSlot;
}): JSX.Element {
  const { req, dex, onChoose } = props;
  const mons = req.side?.pokemon ?? [];
  // 引擎对濒死槽自动 pass（side.getChoiceIndex）：只渲染存活宝可梦对应的槽，
  // 多发指令会被拒（You sent more choices than unfainted Pokémon）
  const slots = liveMoveSlots(req);
  // hooks 一律无条件调用：无可行动槽的早退转为渲染分支（原 return 位于 useState 之前
  // 违反 hooks 规则；当前不可达纯防御，整理后行为不变）
  const noSlots = slots.length === 0;
  // 目标选择取决于场地槽位数（双打残局单在场仍需指定目标），而非存活数
  const doubles = mons.filter((m) => m.active).length > 1;
  const [sel, setSel] = useState<Record<number, SlotChoice>>({});
  /** 机制声明独立于招式选择（槽位 → mega/zmove/dynamax/terastallize）：
   *  先点机制再选招、或先选招再点机制均生效（引擎指令为 move N + mech 的后缀） */
  const [mechSel, setMechSel] = useState<Record<number, string | undefined>>({});
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    setSel({});
    setMechSel({});
    setSubmitted(false);
  }, [req]);

  const benchOf = (req.side?.pokemon ?? [])
    .map((p, i) => ({ p, i }))
    .filter((x) => !x.p.active && !x.p.condition.includes("fnt"));

  const toggleMech = (slot: number, mech: string) => {
    setMechSel((prev) => ({ ...prev, [slot]: prev[slot] === mech ? undefined : mech }));
  };

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
      const mech = mechSel[s.i];
      if (mech) part += ` ${mech}`;
      return part;
    });
    setSubmitted(true);
    onChoose(parts.join(", "));
  };

  if (noSlots) {
    return (
      <div>
        <p className="muted">没有可行动的宝可梦。</p>
        <button className="primary" onClick={() => onChoose("pass")}>
          跳过（换人）
        </button>
      </div>
    );
  }

  return (
    <div className="orders">
      {slots.map((s) => {
        const cur = sel[s.i];
        // 槽位级目标行：作用于当前选中的招式（未选招 / 全体类招式时整行置灰）
        const curMove = cur?.kind === "move" ? s.a.moves[cur.moveIdx] : undefined;
        const targetUsable = doubles && !!curMove?.target && !NO_TARGET.includes(curMove.target);
        return (
          <div key={s.i} className="order-slot">
            <div className="slot-head">
              <b>{slots.length > 1 ? (s.i === 0 ? "左侧" : "右侧") : "行动"}</b>
              <span className="muted">{zhDetails(s.mon.details, dex)}</span>
              {cur && (
                <span className="muted">
                  → {describeChoice(cur, s.a.moves, dex, doubles, mechSel[s.i])}
                </span>
              )}
            </div>
            <div className="move-grid">
              {s.a.moves.map((m, i) => {
                // 走 data 层 moveView（category 已归一小写；直读引擎的首字母大写会让分类全落「变化」）
                const mv = moveView(dex, m.id);
                const on = cur?.kind === "move" && cur.moveIdx === i;
                return (
                  <div key={i} className="move-cell">
                    <button
                      disabled={m.disabled}
                      className={"move-btn" + (on ? " on" : "")}
                      onClick={() =>
                        setSlot(s.i, {
                          kind: "move",
                          moveIdx: i,
                          target: defaultTarget(m.target, s.i),
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
                  mechBtn(
                    mechSel[s.i],
                    "terastallize",
                    "太晶化",
                    () => toggleMech(s.i, "terastallize"),
                    {
                      icon: `/assets/mechanism/tera_${teraTypeOf(req, s.i) ?? "一般"}.png`,
                    },
                  )}
                {s.a.canDynamax &&
                  mechBtn(mechSel[s.i], "dynamax", "极巨化", () => toggleMech(s.i, "dynamax"), {
                    icon: "/assets/mechanism/dynamax.png",
                  })}
                {s.a.canGigantamax &&
                  mechBtn(mechSel[s.i], "dynamax", "超极巨化", () => toggleMech(s.i, "dynamax"), {
                    icon: "/assets/mechanism/dynamax.png",
                  })}
                {s.a.canMegaEvo &&
                  mechBtn(mechSel[s.i], "mega", "超级进化", () => toggleMech(s.i, "mega"))}
                {s.a.canZMove &&
                  mechBtn(mechSel[s.i], "zmove", "Z 招式", () => toggleMech(s.i, "zmove"))}
              </div>
            )}
            {/* 槽位级目标选择：双打常驻一行（作用于已选招式；其余置灰） */}
            {doubles && (
              <div className={"target-row slot-target" + (targetUsable ? "" : " off")}>
                <span className="muted">目标</span>
                {[1, 2, -1, -2].map((loc) => (
                  <button
                    key={loc}
                    disabled={!targetUsable}
                    className={
                      "mini" +
                      (targetUsable && cur?.kind === "move" && cur.target === loc ? " on" : "")
                    }
                    onClick={() => {
                      if (cur?.kind === "move") setSlot(s.i, { ...cur, target: loc });
                    }}
                  >
                    {loc > 0 ? `对手${loc === 1 ? "左" : "右"}` : `己方${loc === -1 ? "左" : "右"}`}
                  </button>
                ))}
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

/** 机制按钮：点亮 = 启用（对齐计算器交互）；同一槽位机制互斥（mechSel 单值）。
 *  与选招顺序无关——先点机制再选招、或先选招再点机制，提交时统一作为 move 指令后缀。
 *  太晶/极巨走图标（/assets/mechanism，点亮提亮），Mega/Z 为文字按钮。 */
function mechBtn(
  current: string | undefined,
  mech: string,
  label: string,
  toggle: () => void,
  opts?: { icon?: string },
): JSX.Element {
  const on = current === mech;
  return (
    <button
      className={"mech-btn mini" + (on ? " on" : "")}
      title={`${label}${on ? "（已点亮：出招时附加）" : ""}`}
      onClick={toggle}
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
  mechSel?: string | undefined,
): string {
  if (c.kind === "switch") return "换人";
  const m = moves[c.moveIdx];
  const name = m ? zhMoveName(dex, m.id, m.move) : "";
  const mech =
    mechSel === "terastallize"
      ? "（太晶）"
      : mechSel === "dynamax"
        ? "（极巨）"
        : mechSel === "mega"
          ? "（超级进化）"
          : mechSel === "zmove"
            ? "（Z）"
            : "";
  const target =
    doubles && c.target !== undefined
      ? `→${c.target > 0 ? "对手" : "己方"}${Math.abs(c.target) === 1 ? "左" : "右"}`
      : "";
  return name + mech + target;
}

/** 目标缺省值（getAtLoc：正=对手槽，负=己方槽；adjacentAlly 系招式缺省指向同伴/自己） */
/** 目标缺省值（getAtLoc：正=对手槽，负=己方槽；slotOrdinal 为**场地槽位**：
 *  左槽(0)的同伴=右槽(-2)，右槽(1)的同伴/自己=左槽(-1)；adjacentAlly 系招式按此缺省） */
function defaultTarget(target: string | undefined, slotOrdinal: number): number | undefined {
  if (!target) return undefined;
  if (target === "adjacentAlly") return slotOrdinal === 0 ? -2 : -1;
  if (target === "adjacentAllyOrSelf") return slotOrdinal === 0 ? -1 : -2;
  return 1;
}

function zhDetails(details: string, dex: Dex): string {
  // "Garchomp, L50, M" → 物种段转中文名（其余保留）
  const seg = details.split(",")[0]?.trim() ?? "";
  const rest = details.includes(",") ? details.slice(details.indexOf(",")) : "";
  const id = seg.toLowerCase().replace(/ /g, "-");
  return (speciesView(dex, id)?.zhName ?? seg) + rest;
}

export function zhNameOf(dex: Dex, speciesId: string): string {
  return speciesView(dex, speciesId)?.zhName ?? speciesId;
}

function zhMoveName(dex: Dex, id: string, fallback: string): string {
  return moveView(dex, id)?.zhName ?? fallback;
}
