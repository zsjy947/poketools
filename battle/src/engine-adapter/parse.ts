/**
 * Showdown 协议日志解析：原始 |line| → 结构化 UI 事件（信息流 + 动画渲染共用输入）。
 * 协议参考上游 PROTOCOL.md；只解析 UI 消费的子集，未识别行原样透传（infoflow 显示）。
 */

export interface BattleEvent {
  /** 事件类型（UI 状态机输入） */
  kind:
    | "start"
    | "turn"
    | "move"
    | "switch"
    | "damage"
    | "heal"
    | "faint"
    | "mega"
    | "zmove"
    | "max"
    | "tera"
    | "weather"
    | "terrain"
    | "fieldstart"
    | "status"
    | "curestatus"
    | "boost"
    | "unboost"
    | "effectiveness"
    | "crit"
    | "win"
    | "tie"
    | "error"
    | "raw"
    | "player"
    | "rule"
    | "rated"
    | "seed"
    | "hint"
    | "inactive";
  /** 事件发起方 p1/p2（如适用） */
  side?: "p1" | "p2" | undefined;
  /** 宝可梦 ident（如 p1a: Garchomp） */
  from?: string | undefined;
  to?: string | undefined;
  /** move/damage 主体（招式名/数值等） */
  value?: string | undefined;
  /** 伤害/回复量（HP 变化事件） */
  amount?: number | undefined;
  /** 效果标识（效果绝佳/不是非常有效/无效） */
  eff?: "super" | "resisted" | "immune" | undefined;
  /** 原始协议行（infoflow 与未识别事件兜底） */
  raw: string;
  /** 附加段（协议 | 分段） */
  parts: string[];
}

/** 把一条协议行解析为事件；未识别的协议类型归为 raw。 */
export function parseLogLine(line: string): BattleEvent {
  const parts = line.split("|");
  // parts[0] 恒为空串；parts[1] 为协议类型
  const kind = parts[1] ?? "";
  const p = parts.slice(2);
  type EventPatch = { [K in keyof BattleEvent]?: BattleEvent[K] | undefined };
  const ev = (o: EventPatch): BattleEvent => ({ ...o, kind: o.kind ?? "raw", raw: line, parts });

  const sideOf = (ident?: string): "p1" | "p2" | undefined =>
    ident?.startsWith("p1") ? "p1" : ident?.startsWith("p2") ? "p2" : undefined;

  switch (kind) {
    case "player":
      return ev({ kind: "player", side: p[0] as "p1" | "p2", value: p[1] });
    case "turn":
      return ev({ kind: "turn", value: p[0] });
    case "move":
      return ev({ kind: "move", side: sideOf(p[0]), from: p[0], value: p[1], to: p[3] });
    case "switch":
    case "drag":
      return ev({ kind: "switch", side: sideOf(p[0]), from: p[0], value: p[1] });
    case "replace":
      return ev({ kind: "switch", side: sideOf(p[0]), from: p[0], value: p[1] });
    case "damage":
      return ev({
        kind: "damage",
        side: sideOf(p[0]),
        from: p[0],
        amount: Number(p[1]) || undefined,
      });
    case "heal":
      return ev({
        kind: "heal",
        side: sideOf(p[0]),
        from: p[0],
        amount: Number(p[1]) || undefined,
      });
    case "faint":
      return ev({ kind: "faint", side: sideOf(p[0]), from: p[0] });
    case "mega":
      return ev({ kind: "mega", side: sideOf(p[0]), from: p[0], value: p[1] });
    case "zpower":
    case "zmove":
      return ev({ kind: "zmove", side: sideOf(p[0]), from: p[0] });
    case "max":
      return ev({ kind: "max", side: sideOf(p[0]), from: p[0] });
    case "terastallize":
    case "-terastallize":
      return ev({ kind: "tera", side: sideOf(p[0]), from: p[0], value: p[1] });
    case "weather":
      return ev({ kind: "weather", value: p[0] });
    case "-fieldstart":
    case "fieldstart":
      return ev({ kind: "fieldstart", value: p[0] });
    case "upkeep":
    case "-singleturn":
    case "-singlemove":
      return ev({ kind: "raw", raw: line, parts });
    case "-status":
      return ev({ kind: "status", from: p[0], side: sideOf(p[0]), value: p[1] });
    case "-curestatus":
      return ev({ kind: "curestatus", from: p[0], side: sideOf(p[0]), value: p[1] });
    case "-boost":
      return ev({ kind: "boost", from: p[0], side: sideOf(p[0]), value: `${p[1]} +${p[2]}` });
    case "-unboost":
      return ev({ kind: "unboost", from: p[0], side: sideOf(p[0]), value: `${p[1]} -${p[2]}` });
    case "-supereffective":
      return ev({ kind: "effectiveness", eff: "super", from: p[0], side: sideOf(p[0]) });
    case "-resisted":
      return ev({ kind: "effectiveness", eff: "resisted", from: p[0], side: sideOf(p[0]) });
    case "-immune":
      return ev({ kind: "effectiveness", eff: "immune", from: p[0], side: sideOf(p[0]) });
    case "-crit":
      return ev({ kind: "crit", from: p[0], side: sideOf(p[0]) });
    case "win":
      return ev({ kind: "win", value: p[0] });
    case "tie":
      return ev({ kind: "tie" });
    case "error":
      return ev({ kind: "error", value: p.join("|") });
    case "rule":
      return ev({ kind: "rule", value: p.join(": ") });
    case "seed":
      return ev({ kind: "seed", value: p.join(",") });
    case "hint":
      return ev({ kind: "hint", value: p.join(" ") });
    case "inactive":
      return ev({ kind: "inactive", value: p[0] });
    default:
      // '-damage'/'-heal' 等带 - 前缀的已在上方；其余（-ability/-item/-enditem 等）透传
      return ev({ kind: "raw" });
  }
}

/** 过滤时间戳等非确定性行（金标准对拍必须先过滤，否则同种子也不同输出）。 */
export function isNondeterministicLine(line: string): boolean {
  return line.startsWith("|t:|") || line.startsWith("|c|") || line.startsWith("|chat");
}
