/**
 * BattleSession —— 单机单人对战核心（plans/00 §4.3）。
 *
 * 同一进程内同时持有 p1/p2 两条输入流（BattleStream 直连），由 UI 的「当前操作阵营」
 * 决定指令写入哪侧；引擎输出统一解析为事件流，同时驱动信息流 UI 与动画渲染器。
 *
 * 确定性：同 seed + 同指令序列 ⇒ 同结果（金标准对拍基础）；输出中 |t:| 时间戳行
 * 在比对时过滤（parse.isNondeterministicLine）。
 */
import { BattleStream, Teams } from "./vendor/ps-engine.js";
import type { PokemonSet, PokemonLike, BattleLike } from "./vendor/ps-engine.js";
import { isNondeterministicLine, parseLogLine } from "./parse";
import type { BattleEvent } from "./parse";

export type { BattleEvent };

export type SideSlot = "p1" | "p2";
export type BattlePhase = "idle" | "teamPreview" | "awaiting" | "resolving" | "finished";

/** 引擎 request 的选择载荷（协议子集） */
export interface RequestChoice {
  wait?: boolean;
  teamPreview?: boolean;
  maxChosenTeamSize?: number;
  active?: Array<null | {
    moves: Array<{
      move: string;
      id: string;
      pp: number;
      maxpp: number;
      disabled?: boolean;
      target?: string | undefined;
    }>;
    canDynamax?: boolean;
    canGigantamax?: boolean;
    canMegaEvo?: boolean;
    canZMove?: boolean;
    canTerastallize?: boolean;
    trapped?: boolean;
    maybeTrapped?: boolean;
  }>;
  forceSwitch?: Array<boolean | null>;
  side: SidePayload;
}

/** request.side 的载荷（含全场宝可梦状态快照） */
export interface SidePayload {
  name: string;
  id: SideSlot;
  pokemon: Array<{
    ident: string;
    details: string;
    condition: string;
    active: boolean;
    stats: { atk: number; def: number; spa: number; spd: number; spe: number };
    moves: string[];
    baseAbility: string;
    item: string;
    ability: string;
    pokeball: string;
    teraType?: string;
    commanding?: boolean;
    reviving?: boolean;
  }>;
  active?: Array<unknown>;
}

/** UI 侧宝可梦状态（从 request 快照 + 事件流增量维护） */
export interface MonState {
  ident: string;
  details: string;
  hp: number;
  maxhp: number;
  fainted: boolean;
  status?: string | undefined;
  teraType?: string | undefined;
  terastallized?: boolean;
  /** mega/Z/极巨声明状态 */
  mega?: boolean | undefined;
  zmove?: boolean | undefined;
  max?: boolean | undefined;
}

export interface SideState {
  name: string;
  active: string[];
  bench: MonState[];
}

/** 引擎窥视：宝可梦侧（分层约束——UI 不直接接触 vendor 类型，此处重声明表面） */
export interface EngineMonView {
  /** "p1: Garchomp"（与 request.side.pokemon[].ident 同格式） */
  ident: string;
  hp: number;
  maxhp: number;
  fainted: boolean;
  status: string;
  types: string[];
  baseTypes: string[];
  teraType?: string | undefined;
  boosts: Record<string, number>;
  moveSlots: Array<{ id: string; move: string; pp: number; maxpp: number }>;
}

/** 引擎窥视：场地侧（天气/地形/空间/侧壁的引擎权威剩余回合） */
export interface EngineFieldView {
  weather: string;
  weatherDuration?: number | undefined;
  terrain: string;
  terrainDuration?: number | undefined;
  pseudoWeather: Record<string, { duration?: number }>;
  sideConditions: {
    p1: Record<string, { duration?: number }>;
    p2: Record<string, { duration?: number }>;
  };
  turn: number;
}

export interface BattleSessionOptions {
  formatid: string;
  teams: { p1: PokemonSet[]; p2: PokemonSet[] };
  seed?: [number, number, number, number];
  names?: { p1: string; p2: string };
  /** 上阵预览顺位直通（1 基编号）：提供后 team preview 阶段自动下发 team 指令，
   *  UI 不再呈现选择步骤，直达第 1 回合指令界面；引擎侧 team preview 语义保留（OTS 照常） */
  previewOrder?: { p1?: number[]; p2?: number[] };
}

export type RequestMap = { p1?: RequestChoice | undefined; p2?: RequestChoice | undefined };

export interface SessionSnapshot {
  phase: BattlePhase;
  turn: number;
  /** 当前等待输入的阵营（双侧同时待指令时为两个） */
  pending: SideSlot[];
  requests: RequestMap;
  sides: Record<SideSlot, SideState>;
  winner?: string | undefined;
  logTail: string[];
  events: BattleEvent[];
  /** 最近一次无效指令（引擎 |error| 侧更新；UI 据此复位并提示重新下达） */
  lastError?: { side: SideSlot; message: string } | undefined;
}

/**
 * 一局对战。用法：
 *   const s = new BattleSession({ formatid, teams });
 *   await s.start();
 *   s.choose('p1', 'move 1');
 *   s.subscribe(snap => ...);   // 状态快照（zustand 桥接）
 */
export class BattleSession {
  readonly formatid: string;
  private stream: InstanceType<typeof BattleStream> | null = null;
  private omniscient: InstanceType<typeof BattleStream> | null = null;
  private done = false;
  private reading = false;
  private subscribers = new Set<(snap: SessionSnapshot) => void>();

  phase: BattlePhase = "idle";
  turn = 0;
  pending: SideSlot[] = [];
  requests: RequestMap = {};
  sides: Record<SideSlot, SideState> = {
    p1: { name: "阵营A", active: [], bench: [] },
    p2: { name: "阵营B", active: [], bench: [] },
  };
  winner: string | undefined;
  events: BattleEvent[] = [];
  logTail: string[] = [];
  lastError: { side: SideSlot; message: string } | undefined;
  /** 指令录制（回放持久化）：每次 choose 按提交序记录（含预览直通的 team 指令） */
  choiceLog: Array<{ side: SideSlot; input: string; turn: number }> = [];
  /** 原始流帧解析：sideupdate 行之后的 p1/p2 行指示该帧所属侧 */
  private channelSide: SideSlot | null = null;
  private expectSideLine = false;
  private lastSideRequested: SideSlot = "p1";
  private readonly opts: BattleSessionOptions;

  constructor(opts: BattleSessionOptions) {
    this.formatid = opts.formatid;
    this.opts = opts;
    this.autoTeamOrder = {};
    if (opts.previewOrder?.p1) this.autoTeamOrder.p1 = [...opts.previewOrder.p1];
    if (opts.previewOrder?.p2) this.autoTeamOrder.p2 = [...opts.previewOrder.p2];
  }

  /** 预览顺位直通（一次性）：收到 teamPreview 请求时自动下发 team 指令 */
  private autoTeamOrder: { p1?: number[] | undefined; p2?: number[] | undefined } = {};

  subscribe(fn: (snap: SessionSnapshot) => void): () => void {
    this.subscribers.add(fn);
    return () => {
      this.subscribers.delete(fn);
    };
  }

  private emit(): void {
    const snap: SessionSnapshot = {
      phase: this.phase,
      turn: this.turn,
      pending: [...this.pending],
      requests: { p1: this.requests.p1, p2: this.requests.p2 },
      sides: { p1: this.sides.p1, p2: this.sides.p2 },
      winner: this.winner,
      logTail: [...this.logTail],
      events: [...this.events],
      lastError: this.lastError,
    };
    for (const fn of this.subscribers) fn(snap);
  }

  async start(): Promise<void> {
    const stream = new BattleStream();
    this.stream = stream;
    this.omniscient = stream; // 主流直读（getPlayerStreams 的子流在本环境无输出）
    await stream.write(
      `>start ${JSON.stringify({ formatid: this.formatid, seed: this.opts.seed })}`,
    );
    await stream.write(
      `>player p1 ${JSON.stringify({ name: this.opts.names?.p1 ?? "阵营A", team: packedTeam(this.opts.teams.p1) })}`,
    );
    await stream.write(
      `>player p2 ${JSON.stringify({ name: this.opts.names?.p2 ?? "阵营B", team: packedTeam(this.opts.teams.p2) })}`,
    );
    this.phase = "awaiting";
    void this.pump();
  }

  /** 读取泵：消费 omniscient 输出流直到结束（每块批量 emit，避免逐行 React 全量重渲染） */
  private async pump(): Promise<void> {
    if (this.reading || !this.omniscient) return;
    this.reading = true;
    try {
      for (;;) {
        const chunk = await this.omniscient.read();
        if (chunk === null) break;
        for (const line of chunk.split("\n")) {
          if (!line) continue;
          this.handleLine(line);
        }
        this.emit();
        if (this.done) break;
      }
    } finally {
      this.reading = false;
    }
  }

  private handleLine(line: string): void {
    // 供 UI 展示的原文日志（时间戳保留给回放，对拍另行过滤）；
    // 传输帧（update/sideupdate/p1/p2/|request| JSON）非战斗事件，不进日志区
    if (!isTransportFrame(line)) {
      this.logTail.push(line);
      if (this.logTail.length > 400) this.logTail.splice(0, this.logTail.length - 400);
    }

    // 原始流帧（battle-stream pushMessage）：sideupdate\n<p1|p2>\n… / update\n…
    if (line === "sideupdate") {
      this.expectSideLine = true;
    } else if (this.expectSideLine) {
      this.channelSide = line === "p2" ? "p2" : "p1";
      this.expectSideLine = false;
    }

    const ev = parseLogLine(line);
    if (ev.kind !== "raw" || (!line.startsWith("|j|") && !line.startsWith("|l|"))) {
      this.events.push(ev);
    }
    this.applyEvent(ev);

    if (ev.kind === "win" || ev.kind === "tie") {
      this.done = true;
      this.phase = "finished";
      this.winner = ev.kind === "win" ? ev.value : "平局";
      this.pending = [];
      return;
    }
    // 无效指令（引擎只回 |error| 不重发请求）：标回待指令并克隆请求触发 UI 复位
    if (line.startsWith("|error|") && this.channelSide) {
      const side = this.channelSide;
      this.lastError = { side, message: line.slice("|error|".length) };
      if (this.requests[side]) {
        this.requests[side] = { ...this.requests[side]! };
        if (!this.pending.includes(side)) this.pending.push(side);
        if (this.phase !== "finished") this.phase = "awaiting";
      }
    }
    if (line.startsWith("|request|")) {
      this.handleRequest(line.slice("|request|".length));
    }
  }

  private handleRequest(payload: string): void {
    // omniscient 流的 request 带 side 前缀：|request|SIDE|{json}？——实测为 |request|{json}，
    // 通过 side.id 区分。
    let req: RequestChoice;
    try {
      const firstBrace = payload.indexOf("{");
      req = JSON.parse(firstBrace > 0 ? payload.slice(firstBrace) : payload) as RequestChoice;
    } catch {
      return;
    }
    const side = req.side?.id === "p2" ? "p2" : "p1";
    this.requests[side] = req;
    this.syncSideFromRequest(side, req);
    this.lastSideRequested = side;
    // 预览顺位直通：teamPreview 请求若带预设顺位，立即代发 team 指令（1 基编号），
    // 不把该请求暴露给 UI；指令被拒时 |error| 恢复逻辑照常兜底（请求对象已存）
    if (req.teamPreview && this.autoTeamOrder[side]?.length) {
      const order = this.autoTeamOrder[side]!;
      this.autoTeamOrder[side] = undefined as number[] | undefined;
      void this.choose(side, `team ${order.join(",")}`);
      return;
    }
    if (!req.wait) {
      if (!this.pending.includes(side)) this.pending.push(side);
    } else {
      this.pending = this.pending.filter((s) => s !== side);
    }
    if (this.pending.length > 0) this.phase = "awaiting";
  }

  private syncSideFromRequest(side: SideSlot, req: RequestChoice): void {
    const prev = new Map(this.sides[side].bench.map((m) => [m.ident, m]));
    const mons: MonState[] = (req.side?.pokemon ?? []).map((p) => {
      const [hp, maxhp] = parseCondition(p.condition);
      // "0 fnt" 行不携带 maxhp：沿用上次已知值，避免濒死者血条变 0/0
      const keepMax = maxhp === 0 ? (prev.get(p.ident)?.maxhp ?? 0) : maxhp;
      return {
        ident: p.ident,
        details: p.details,
        hp: Math.min(hp, keepMax || hp),
        maxhp: keepMax,
        fainted: hp === 0,
        status: parseStatus(p.condition),
        teraType: p.teraType,
      };
    });
    this.sides[side] = {
      name: req.side?.name ?? this.sides[side].name,
      active: (req.side?.pokemon ?? [])
        .map((p, i) => (p.active ? mons[i]?.ident : undefined))
        .filter((x): x is string => !!x),
      bench: mons,
    };
  }

  private applyEvent(ev: BattleEvent): void {
    switch (ev.kind) {
      case "turn":
        this.turn = Number(ev.value) || this.turn + 1;
        break;
      case "damage":
      case "heal": {
        if (ev.from)
          this.updateMonHp(ev.from, ev.kind === "heal" ? (ev.amount ?? 0) : -(ev.amount ?? 0));
        break;
      }
      case "faint": {
        if (ev.from) this.updateMonHp(ev.from, -99999);
        break;
      }
      case "tera": {
        if (ev.from)
          this.updateMonFlag(ev.from, (m) => {
            m.terastallized = true;
            m.teraType = ev.value;
          });
        break;
      }
      case "mega": {
        if (ev.from)
          this.updateMonFlag(ev.from, (m) => {
            m.mega = true;
          });
        break;
      }
      case "max": {
        if (ev.from)
          this.updateMonFlag(ev.from, (m) => {
            m.max = true;
          });
        break;
      }
      case "zmove": {
        if (ev.from)
          this.updateMonFlag(ev.from, (m) => {
            m.zmove = true;
          });
        break;
      }
      case "status": {
        if (ev.from)
          this.updateMonFlag(ev.from, (m) => {
            m.status = ev.value;
          });
        break;
      }
      case "curestatus": {
        if (ev.from && (ev.value === undefined || ev.value !== "tox" || true)) {
          this.updateMonFlag(ev.from, (m) => {
            if (ev.value === undefined || m.status === ev.value) m.status = undefined;
          });
        }
        break;
      }
      default:
        break;
    }
  }

  private updateMonHp(ident: string, delta: number): void {
    const key = normIdent(ident);
    for (const side of ["p1", "p2"] as const) {
      const mon = this.sides[side].bench.find((m) => normIdent(m.ident) === key);
      if (mon) {
        mon.hp = Math.max(0, Math.min(mon.maxhp, mon.hp + delta));
        mon.fainted = mon.hp === 0;
        return;
      }
    }
  }

  private updateMonFlag(ident: string, fn: (m: MonState) => void): void {
    const key = normIdent(ident);
    for (const side of ["p1", "p2"] as const) {
      const mon = this.sides[side].bench.find(
        (m) => normIdent(m.ident) === key || m.details === ident,
      );
      if (mon) {
        fn(mon);
        return;
      }
    }
  }

  /** UI 指令入口：写入指定阵营输入流。
   *  pending/requests 不在此处清除——引擎对无效指令只回 [Invalid choice] 不重发请求，
   *  乐观清除会让 UI 与引擎脱节死锁；两侧状态一律以引擎的下一次 request/wait 驱动。 */
  async choose(side: SideSlot, choice: string): Promise<void> {
    if (!this.stream || this.done) return;
    this.choiceLog.push({ side, input: choice, turn: this.turn });
    await this.stream.write(`>${side} ${choice}`);
  }

  /** 本局实际使用的随机种子（回放确定性复现用；未显式传入时引擎自选） */
  get seedUsed(): [number, number, number, number] | undefined {
    return this.opts.seed;
  }

  /** 是否双方都已下达指令 */
  get awaiting(): SideSlot[] {
    return this.pending;
  }

  get lastRequestedSide(): SideSlot {
    return this.lastSideRequested;
  }

  /** 强制判负（驱动器兜底：替补不足等边界流的终局化；对局记录会标注 forcelose） */
  async forceLose(side: SideSlot): Promise<void> {
    if (!this.stream || this.done) return;
    await this.stream.write(`>forcelose ${side}`);
  }

  destroy(): void {
    this.done = true;
    try {
      this.stream?.destroy?.();
    } catch {
      /* 引擎流销毁容错 */
    }
    this.subscribers.clear();
  }

  /** 导出确定性的日志（过滤时间戳/聊天，对拍与回放用） */
  deterministicLog(): string[] {
    return this.logTail.filter((l) => !isNondeterministicLine(l));
  }

  /** 引擎内部只读窥视（悬浮状态框/场地倒计时用）：能力变化、当前属性、招式 PP、
   *  天气/地形/空间与侧壁的**引擎权威剩余回合**（事件推导无法区分来源差异，如特性天气）。
   *  引擎对象随结算原地突变，调用方应在每次快照后即时消费，不要缓存。 */
  enginePeek(): {
    mons: { p1: EngineMonView[]; p2: EngineMonView[] };
    field: EngineFieldView;
  } | null {
    const battle: BattleLike | null | undefined = this.stream?.battle;
    if (!battle) return null;
    const conv = (p: PokemonLike): EngineMonView => ({
      ident: p.fullname,
      hp: p.hp,
      maxhp: p.maxhp,
      fainted: p.fainted,
      status: p.status ?? "",
      types: [...(p.types ?? [])],
      baseTypes: [...(p.baseTypes ?? [])],
      teraType: p.teraType,
      boosts: { ...(p.boosts ?? {}) },
      moveSlots: (p.moveSlots ?? []).map((m) => ({
        id: m.id,
        move: m.move,
        pp: m.pp,
        maxpp: m.maxpp,
      })),
    });
    return {
      mons: {
        p1: (battle.sides[0]?.pokemon ?? []).map(conv),
        p2: (battle.sides[1]?.pokemon ?? []).map(conv),
      },
      field: {
        weather: battle.field.weather ?? "",
        weatherDuration: battle.field.weatherState?.duration,
        terrain: battle.field.terrain ?? "",
        terrainDuration: battle.field.terrainState?.duration,
        pseudoWeather: battle.field.pseudoWeather ?? {},
        sideConditions: {
          p1: battle.sides[0]?.sideConditions ?? {},
          p2: battle.sides[1]?.sideConditions ?? {},
        },
        turn: battle.turn,
      },
    };
  }
}

function packedTeam(sets: PokemonSet[]): string {
  return Teams.pack(sets);
}

/** 流传输帧（battle-stream pushMessage 的封皮与 request 载荷）：日志区不渲染 */
function isTransportFrame(line: string): boolean {
  return (
    line === "update" ||
    line === "sideupdate" ||
    line === "p1" ||
    line === "p2" ||
    line.startsWith("|request|") ||
    line === "|"
  );
}

function parseCondition(cond: string): [number, number] {
  // "187/187" 或 "187/187 tox" 或 "0 fnt"
  const hpPart = cond.split(" ")[0] ?? "";
  if (hpPart === "0" || hpPart === "fnt") return [0, 0];
  const nums = hpPart.split("/").map(Number);
  if (nums.length === 2 && nums[0] !== undefined && nums[1] !== undefined)
    return [nums[0], nums[1]];
  return [0, 0];
}

/** ident 归一：事件行的 "p1a: X"（带槽位字母）与 request 的 "p1: X" 统一成 "p1: X"
 *  （引擎 request 不区分同侧同名分身，属上游口径；比此前「永不匹配」的静默失配好） */
function normIdent(ident: string): string {
  return ident.replace(/^(p[12])[ab]?:/, "$1:");
}

function parseStatus(cond: string): string | undefined {
  const segs = cond.split(" ");
  return segs.find((s) => ["brn", "par", "slp", "psn", "tox", "frz"].includes(s));
}
