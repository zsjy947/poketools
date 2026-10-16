import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "./store";
import type {
  MonState,
  SideSlot,
  EngineMonView,
  EngineFieldView,
  SessionSnapshot,
  BattleSession,
} from "../engine-adapter";
import type { RequestChoice } from "../engine-adapter/session";
import { dexFor, moveView, speciesView, TYPE_ZH, STATUS_ZH, zhLine } from "../data";
import { spriteUrl } from "./sprites";
import { useBattleAnimQueue, normAnimIdent } from "./anim";
import type { AnimRuntime, AnimPopup } from "./anim";
import { fieldConditions, condLabel, STATUS_ICON } from "./field";
import { lastLogText, TurnLogView } from "./turnLog";
import { buildMonInfo, HoverHost, MonHoverCard } from "./MonHover";
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

  useEffect(() => {
    if (session && !snapshot) {
      // 会话快照桥（PreviewPage 已 subscribe，此处兜底重挂）
      session.subscribe((snap) => useApp.getState().pushSnapshot(snap));
    }
  }, [session, snapshot]);

  // 终局记录（FR-10）：seed + 指令序列随日志一并落盘（回放复现三件套）
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
        seed: session.seedUsed ? JSON.stringify(session.seedUsed) : undefined,
        turns: snapshot.turn,
        log: session.deterministicLog(),
        choices: [...session.choiceLog],
      };
      finishBattle(record);
    }
  }, [snapshot?.phase, snapshot?.winner, session, finishBattle, snapshot, teams, snapshot?.turn]);

  const dex = useMemo(() => dexFor(format?.mod ?? "gen9"), [format]);

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
          <BattleStagePane
            snapshot={snapshot}
            session={session}
            dex={dex}
            animation={settings.animation}
            animationSpeed={settings.animationSpeed}
          />
        </div>
        <div className="stage-side stage-side-p2">
          <SideCommandPanel side="p2" snapshot={snapshot} dex={dex} />
        </div>
      </div>
    </div>
  );
}

/**
 * 对战舞台中列（场地 + 回合日志）：实时对局与回放共用。
 * 内聚动画队列/引擎窥视/悬浮框/倒计时 chip；回放侧传完整记录日志（logLines）与
 * 当前回合高亮（highlightTurn），实时对局用快照 logTail。
 */
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
        {/* 伤害/回复飘字（M4 P2）：数值取自事件 HP 段差量，会心/效果着色 */}
        {(popups?.length ?? 0) > 0 && (
          <div className="popup-layer" aria-hidden="true">
            {popups!.map((p) => (
              <span key={p.key} className={"dmg-popup tone-" + p.tone}>
                {p.text}
                {p.tone === "crit" && <em>会心</em>}
                {p.tone === "super" && <em>拔群</em>}
                {p.tone === "resisted" && <em>不佳</em>}
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

function zhNameOf(dex: Dex, speciesId: string): string {
  return speciesView(dex, speciesId)?.zhName ?? speciesId;
}

function zhMoveName(dex: Dex, id: string, fallback: string): string {
  return moveView(dex, id)?.zhName ?? fallback;
}
