/* 舞台组件（RM-12 自 BattleView.tsx 纯位移拆出，无行为变更）：
 * BattleStagePane / CondChip / SideBoard / MonStage / SIDE_COND_ICON */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  EngineFieldView,
  EngineMonView,
  SessionSnapshot,
  BattleSession,
} from "../../engine-adapter";
import type { MonState } from "../../engine-adapter/session";
import { dexFor, moveView, STATUS_ZH } from "../../data";
import type { Dex } from "../../data/dex-types";
import { zhNameOf } from "./command-panel";
import { spriteUrl } from "../sprites";
import { useBattleAnimQueue, normAnimIdent } from "../anim";
import type { AnimRuntime, AnimPopup } from "../anim";
import { fieldConditions, condLabel, STATUS_ICON } from "../field";
import { buildMonInfo, HoverHost, MonHoverCard } from "../MonHover";
import { lastLogText, TurnLogView } from "../turnLog";
import { useApp } from "../store";

export function BattleStagePane(props: {
  snapshot: SessionSnapshot;
  session: BattleSession;
  dex: Dex;
  animation: boolean;
  /** ms/事件（设置页口径） */
  animationSpeed: number;
  /** 日志行（默认 snapshot.logTail；回放传完整记录日志） */
  logLines?: string[] | undefined;
  /** 高亮并滚动定位的回合（回放进度） */
  highlightTurn?: number | null;
}): JSX.Element {
  const { snapshot, session, dex, animation } = props;
  // 闪回：点击回合指示/天气 chip → 日志面板滚动至该回合块并高亮（2.5s 后熄灭）
  const [flashTurn, setFlashTurn] = useState<number | null>(null);
  useEffect(() => {
    if (flashTurn == null) return;
    const t = window.setTimeout(() => setFlashTurn(null), 2500);
    return () => window.clearTimeout(t);
  }, [flashTurn]);
  // 速度：设置为 ms/事件（基准 420），动画契约为倍率——420ms→1x，越大越慢
  const animSpeed = props.animationSpeed > 0 ? 420 / props.animationSpeed : 1;
  // 飘字 HP 种子：首个带完整 bench 且尚无 HP 事件的快照（一次性捕获开局血量）
  const initialHpRef = useRef<Record<string, [number, number]> | null>(null);
  if (
    !initialHpRef.current &&
    snapshot.sides.p1.bench.length > 0 &&
    !snapshot.events.some((e) => e.kind === "damage" || e.kind === "heal")
  ) {
    const m: Record<string, [number, number]> = {};
    for (const side of ["p1", "p2"] as const)
      for (const mon of snapshot.sides[side].bench) m[mon.ident] = [mon.hp, mon.maxhp];
    initialHpRef.current = m;
  }
  // 招式类别缓存（位移风格分化：物理突进/特殊蓄能/变化低幅）
  const catCacheRef = useRef(new Map<string, "physical" | "special" | "status" | undefined>());
  const categoryOf = useCallback(
    (moveName: string): "physical" | "special" | "status" | undefined => {
      const key = moveName.toLowerCase().replace(/[^a-z0-9]/g, "");
      if (!key) return undefined;
      if (!catCacheRef.current.has(key)) {
        catCacheRef.current.set(key, moveView(dex, key)?.category);
      }
      return catCacheRef.current.get(key);
    },
    [dex],
  );
  const { anims: animMap, popups: animPopups } = useBattleAnimQueue(
    snapshot.events,
    animation,
    animSpeed,
    { initialHp: initialHpRef.current, categoryOf },
  );
  // 场地状态（天气/地形/空间/侧壁）：从事件流推导
  const conds = useMemo(() => fieldConditions(snapshot.events), [snapshot.events]);
  // 引擎窥视（每次快照即时消费，不缓存）：悬浮框数据 + 场地剩余回合的引擎权威值
  const engine = useMemo(() => session.enginePeek(), [session, snapshot]);
  const engineMons = useMemo(() => {
    const m: Record<string, EngineMonView> = {};
    for (const side of ["p1", "p2"] as const)
      for (const p of engine?.mons[side] ?? []) m[p.ident] = p;
    return m;
  }, [engine]);

  return (
    <>
      <div className={"stage-field" + (conds.weather ? " w-" + conds.weather : "")}>
        {conds.weather && <div className={"fx fx-" + conds.weather} aria-hidden="true" />}
        <SideBoard
          side="p2"
          snapshot={snapshot}
          dex={dex}
          animated={animation}
          animMap={animMap}
          sideConds={conds.sideStatus.p2}
          engineMons={engineMons}
          popups={animPopups}
          engineField={engine?.field ?? null}
        />
        <div className="field-strip">
          <div className="field-conds">
            <CondChip
              cls="cond-weather"
              id={conds.weather}
              turns={engine ? engine.field.weatherDuration : undefined}
              onClick={conds.weather ? () => setFlashTurn(snapshot.turn) : undefined}
            />
            <CondChip
              cls="cond-terrain"
              id={conds.terrain}
              turns={engine ? engine.field.terrainDuration : undefined}
            />
            {conds.fieldMoves.map((f) => (
              <CondChip
                key={f}
                cls="cond-room"
                id={f}
                turns={engine ? engine.field.pseudoWeather[f]?.duration : undefined}
              />
            ))}
            {conds.sideStatus.p1.map((s) => (
              <CondChip
                key={"p1" + s}
                cls="cond-side p1"
                id={s}
                label={"A·" + condLabel(s)}
                turns={engine ? engine.field.sideConditions.p1[s]?.duration : undefined}
              />
            ))}
            {conds.sideStatus.p2.map((s) => (
              <CondChip
                key={"p2" + s}
                cls="cond-side p2"
                id={s}
                label={"B·" + condLabel(s)}
                turns={engine ? engine.field.sideConditions.p2[s]?.duration : undefined}
              />
            ))}
          </div>
          <div className="field-mid">
            <button
              className="turn-indicator"
              title="点击在日志中定位当前回合"
              onClick={() => setFlashTurn(snapshot.turn)}
            >
              回合 {snapshot.turn}
            </button>
            <span className="ticker">{lastLogText(snapshot.logTail)}</span>
          </div>
        </div>
        <SideBoard
          side="p1"
          snapshot={snapshot}
          dex={dex}
          animated={animation}
          animMap={animMap}
          sideConds={conds.sideStatus.p1}
          engineMons={engineMons}
          popups={animPopups}
          engineField={engine?.field ?? null}
          back
        />
        {snapshot.phase === "finished" && (
          <div className="victory-banner" aria-hidden="true">
            {snapshot.winner ? `🏆 ${snapshot.winner} 获胜！` : "平局"}
          </div>
        )}
      </div>
      {/* 信息流日志（FR-09）—— 中列下半（唯一内部滚动区）：Showdown 式回合分组 */}
      <div className="battle-log">
        <h3>战斗日志（可回看）</h3>
        <TurnLogView
          lines={props.logLines ?? snapshot.logTail}
          highlightTurn={flashTurn ?? props.highlightTurn ?? null}
        />
      </div>
    </>
  );
}

/** 场地状态 chip：id 缺失不渲染；带引擎剩余回合（≤1 高亮临期） */
function CondChip(props: {
  cls: string;
  id?: string | undefined;
  label?: string | undefined;
  turns?: number | undefined;
  onClick?: (() => void) | undefined;
}): JSX.Element | null {
  const { cls, id, label, turns, onClick } = props;
  if (!id) return null;
  const low = turns != null && turns <= 1;
  return (
    <span
      className={"cond " + cls + (low ? " low" : "") + (onClick ? " clickable" : "")}
      title={condLabel(id) + (turns != null ? `（剩余 ${turns} 回合）` : "")}
      onClick={onClick}
    >
      {label ?? condLabel(id)}
      {turns != null && turns > 0 ? ` ${turns}` : ""}
    </span>
  );
}

/** 单侧指令面板：常驻一侧，含 ⏳待指令标识、指令被拒黄条（标明所属侧）与请求组件 */
function SideBoard(props: {
  side: "p1" | "p2";
  snapshot: NonNullable<ReturnType<typeof useApp.getState>["snapshot"]>;
  dex: ReturnType<typeof dexFor>;
  animated: boolean;
  animMap: Record<string, AnimRuntime>;
  /** 活跃飘字（伤害/回复数值；按 ident 归一匹配本侧宝可梦） */
  popups: AnimPopup[];
  /** 该侧生效的侧壁（reflect/lightscreen/auroraveil/safeguard/tailwind/mist） */
  sideConds: string[];
  /** 引擎窥视（ident → 引擎宝可梦视图；悬浮框数据源） */
  engineMons: Record<string, EngineMonView>;
  engineField: EngineFieldView | null;
  back?: boolean;
}): JSX.Element {
  const { side, snapshot, dex, animated, back, animMap, sideConds, engineMons, popups } = props;
  const state = snapshot.sides[side];
  const payloadOf = (ident: string) =>
    (snapshot.requests[side]?.side?.pokemon ?? []).find((p) => p.ident === ident);
  const actives = state.active
    .map((ident) => state.bench.find((m) => m.ident === ident))
    .filter((m): m is MonState => !!m);
  const popupsOf = (ident: string) => popups.filter((p) => p.ident === normAnimIdent(ident));
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
            <HoverHost
              key={m.ident}
              place={side === "p1" ? "up" : "down"}
              panel={
                <MonHoverCard
                  dex={dex}
                  info={buildMonInfo({
                    dex,
                    mon: m,
                    payload: payloadOf(m.ident),
                    engineMon: engineMons[m.ident],
                  })}
                />
              }
            >
              <MonStage
                mon={m}
                dex={dex}
                animated={animated}
                side={side}
                back={!!back}
                anim={animMap[normAnimIdent(m.ident)]}
                popups={popupsOf(m.ident)}
                sideConds={sideConds}
              />
            </HoverHost>
          ))
        ) : (
          <div className="mon-stage empty muted">（无在场宝可梦）</div>
        )}
      </div>
      <div className="bench-row">
        {state.bench.map((m) => (
          <HoverHost
            key={m.ident}
            place="down"
            panel={
              <MonHoverCard
                dex={dex}
                info={buildMonInfo({
                  dex,
                  mon: m,
                  payload: payloadOf(m.ident),
                  engineMon: engineMons[m.ident],
                })}
              />
            }
          >
            <span
              className={"bench-ball" + (m.fainted ? " fainted" : "")}
              title={`${m.details}${m.status ? `（${STATUS_ZH[m.status] ?? m.status}）` : ""}`}
            >
              {m.fainted ? "×" : "●"}
            </span>
          </HoverHost>
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
  anim?: AnimRuntime | undefined;
  popups?: AnimPopup[] | undefined;
  sideConds?: string[] | undefined;
}): JSX.Element {
  const { mon, dex, animated, side, back, anim, popups, sideConds } = props;
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
  const animCls = anim
    ? " anim-" + anim.kind + (anim.style && anim.kind === "lunge" ? " style-" + anim.style : "")
    : "";
  return (
    // 竖排舞台单元：名字+血条在精灵头顶，血条宽 ≈ 精灵宽（等宽对齐）
    <div className="mon-stage">
      <div className="hp-panel">
        <div className="hp-head">
          <span className="hp-name">{zhNameOf(dex, nameId)}</span>
          {mon.terastallized && <span className="tera-badge">太晶·{mon.teraType}</span>}
          {mon.mega && <span className="mega-badge">超级进化</span>}
          {mon.max && <span className="max-badge">极巨</span>}
        </div>
        {/* 血条 + 状态图标（Showdown 风：异常状态以图标贴血条右侧，悬停出说明） */}
        <div className="hp-row">
          <div className="hp-bar">
            <div className="hp-fill" style={{ width: pct + "%" }} />
          </div>
          {mon.status && (
            <span className={"status st-" + mon.status} title={STATUS_ZH[mon.status] ?? mon.status}>
              {STATUS_ICON[mon.status] ?? STATUS_ZH[mon.status]}
            </span>
          )}
        </div>
        {/* 该侧生效的侧壁（Showdown 风：精灵旁常驻图标 + 呼吸动画，悬停出说明） */}
        {(sideConds?.length ?? 0) > 0 && (
          <div className="side-cond-row">
            {sideConds!.map((sc) => (
              <span key={sc} className={"side-cond sc-" + sc} title={condLabel(sc)}>
                {SIDE_COND_ICON[sc] ?? "🛡"}
              </span>
            ))}
          </div>
        )}
        <span className="hp-num">
          {mon.hp}/{mon.maxhp}
        </span>
      </div>
      <div className="mon-sprite-wrap">
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
        {/* 伤害/回复飘字（M4 P2）：数值取自事件 HP 段差量，会心/效果角标（label）着色 */}
        {(popups?.length ?? 0) > 0 && (
          <div className="popup-layer" aria-hidden="true">
            {popups!.map((p) => (
              <span key={p.key} className={"dmg-popup tone-" + p.tone}>
                {p.text}
                {p.label && <em>{p.label}</em>}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** 侧壁图标（Showdown 风：精灵旁小图标，动画呼吸提示生效中） */
const SIDE_COND_ICON: Record<string, string> = {
  reflect: "🛡",
  lightscreen: "🔆",
  auroraveil: "🌈",
  safeguard: "✨",
  tailwind: "💨",
  mist: "🌫",
};

/** 无需目标选择的招式 target 值 */
