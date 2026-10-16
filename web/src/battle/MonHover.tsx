/**
 * 对局内悬浮状态框（M3a）：悬停精灵/血条/替补球 → 延迟浮层展示完整状态。
 * 数据三源合流：request 载荷（特性/道具/招式/种族）+ MonState（HP/异常/机制标记）
 * + 引擎窥视（能力变化/当前属性/招式 PP——事件流推导不出，直读引擎权威值）。
 * buildMonInfo 为纯函数可单测。
 */
import { useRef, useState, type ReactNode } from "react";
import type { MonState, EngineMonView } from "../engine-adapter";
import type { RequestChoice } from "../engine-adapter/session";
import { dexFor, moveView, speciesView, TYPE_ZH, STATUS_ZH, itemView } from "../data";
import { STATUS_ICON, STAT_BOOST_ZH } from "./field";

type Dex = ReturnType<typeof dexFor>;

export interface MonInfo {
  nameZh: string;
  details: string;
  /** "Garchomp, L50, M" 的等级段（"L50"） */
  level: string;
  hp: number;
  maxhp: number;
  fainted: boolean;
  status?: string | undefined;
  /** 当前属性（太晶后 = 引擎 types；替补无引擎行时回落种族属性 + 太晶标记） */
  types: string[];
  teraType?: string | undefined;
  terastallized?: boolean | undefined;
  mega?: boolean | undefined;
  zmove?: boolean | undefined;
  max?: boolean | undefined;
  ability?: string | undefined;
  item?: string | undefined;
  moves: Array<{ zh: string; pp?: number | undefined; maxpp?: number | undefined }>;
  /** 引擎能力变化（atk/def/spa/spd/spe/accuracy/evasion → -6..6）；替补为空 */
  boosts: Record<string, number>;
}

/** 组装悬浮框数据：payload=request 侧载荷行，engineMon=引擎同名列（可缺）。纯函数。 */
export function buildMonInfo(args: {
  dex: Dex;
  mon: MonState;
  payload?: RequestChoice["side"]["pokemon"][number] | undefined;
  engineMon?: EngineMonView | null | undefined;
}): MonInfo {
  const { dex, mon, payload, engineMon } = args;
  const speciesSeg = mon.details.split(",")[0]?.trim() ?? "";
  const sp = dex.species.get(speciesSeg);
  const nameZh =
    speciesView(dex, sp.exists ? sp.id : speciesSeg.toLowerCase())?.zhName ?? speciesSeg;
  const levelSeg =
    mon.details
      .split(",")
      .map((s) => s.trim())
      .find((s) => /^L\d+/.test(s)) ?? "";
  const types = engineMon?.types?.length
    ? engineMon.types.map((t) => TYPE_ZH[t] ?? t)
    : sp.exists
      ? sp.types.map((t) => TYPE_ZH[t] ?? t)
      : [];
  const ppById = new Map((engineMon?.moveSlots ?? []).map((m) => [m.id, m]));
  const moves = (payload?.moves ?? []).map((id) => {
    const mv = moveView(dex, id);
    const slot = ppById.get(id);
    return { zh: mv?.zhName ?? id, pp: slot?.pp, maxpp: slot?.maxpp };
  });
  const boosts: Record<string, number> = {};
  for (const [k, v] of Object.entries(engineMon?.boosts ?? {})) {
    if (v) boosts[k] = v;
  }
  return {
    nameZh,
    details: mon.details,
    level: levelSeg,
    hp: engineMon?.hp ?? mon.hp,
    maxhp: engineMon?.maxhp || mon.maxhp,
    fainted: mon.fainted,
    status: mon.status,
    types,
    teraType: payload?.teraType || mon.teraType || undefined,
    terastallized: mon.terastallized,
    mega: mon.mega,
    zmove: mon.zmove,
    max: mon.max,
    ability: payload?.ability || payload?.baseAbility || undefined,
    item: payload?.item || undefined,
    moves,
    boosts,
  };
}

/** 悬停宿主：~150ms 延迟显示，可移入浮层；离开即收。place 决定浮层向上/向下展开。 */
export function HoverHost(props: {
  place: "up" | "down";
  children: ReactNode;
  panel: ReactNode;
}): JSX.Element {
  const { place, children, panel } = props;
  const [open, setOpen] = useState(false);
  const timer = useRef<number | null>(null);
  const enter = () => {
    if (timer.current != null) return;
    timer.current = window.setTimeout(() => setOpen(true), 150);
  };
  const leave = () => {
    if (timer.current != null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
    setOpen(false);
  };
  return (
    <div
      className={"hover-host " + (place === "up" ? "hover-up" : "hover-down")}
      onMouseEnter={enter}
      onMouseLeave={leave}
    >
      {children}
      {open && <div className="mon-hover-card">{panel}</div>}
    </div>
  );
}

/** 悬浮框内容（buildMonInfo 输出渲染；缺数据标「待补充」） */
export function MonHoverCard(props: { info: MonInfo; dex: Dex }): JSX.Element {
  const { info, dex } = props;
  const itemZh = info.item ? (itemView(dex, info.item)?.zhName ?? info.item) : "";
  const boostEntries = Object.entries(info.boosts).filter(([k]) => STAT_BOOST_ZH[k]);
  return (
    <div className="mhc-body">
      <div className="mhc-head">
        <b>{info.nameZh}</b>
        <span className="muted">{info.level}</span>
        {info.terastallized && (
          <span className="tera-badge">太晶·{TYPE_ZH[info.teraType ?? ""] ?? info.teraType}</span>
        )}
        {info.mega && <span className="mega-badge">超级进化</span>}
        {info.max && <span className="max-badge">极巨</span>}
        {info.zmove && <span className="max-badge">Z</span>}
      </div>
      <div className="mhc-row">
        <span>HP</span>
        <b className={info.fainted ? "muted" : ""}>
          {info.fainted ? "濒死" : `${info.hp}/${info.maxhp}`}
        </b>
        {info.status && (
          <span
            className={"mhc-status st-" + info.status}
            title={STATUS_ZH[info.status] ?? info.status}
          >
            {STATUS_ICON[info.status] ?? STATUS_ZH[info.status] ?? info.status}
          </span>
        )}
      </div>
      <div className="mhc-row">
        <span>属性</span>
        <span>{info.types.join(" / ") || "待补充"}</span>
      </div>
      <div className="mhc-row">
        <span>特性</span>
        <span>{info.ability || "待补充"}</span>
      </div>
      <div className="mhc-row">
        <span>道具</span>
        <span>{itemZh || "无"}</span>
      </div>
      {boostEntries.length > 0 && (
        <div className="mhc-row mhc-boosts">
          <span>能力</span>
          <span>
            {boostEntries.map(([k, v]) => (
              <span key={k} className={"mhc-boost " + (v > 0 ? "up" : "down")}>
                {STAT_BOOST_ZH[k]} {v > 0 ? "+" : ""}
                {v}
              </span>
            ))}
          </span>
        </div>
      )}
      <div className="mhc-moves">
        {info.moves.length
          ? info.moves.map((m, i) => (
              <div key={i} className="mhc-move">
                <span>{m.zh}</span>
                {m.pp != null && (
                  <span className="muted">
                    PP {m.pp}/{m.maxpp}
                  </span>
                )}
              </div>
            ))
          : "招式：待补充"}
      </div>
    </div>
  );
}
