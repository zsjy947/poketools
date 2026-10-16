/**
 * 回合分组日志（Showdown 式）：以 |turn|n 为锚点把协议日志切成回合块，
 * 回合头 + 行动块缩进渲染；BattleView 实时区与 RecordsPage/回放器共用。
 * renderLine/LogLine 系渲染函数自 BattleView 提取至此（唯一实现）。
 */
import { useEffect, useRef, useState } from "react";
import { zhLine } from "../data";

export interface TurnGroup {
  /** 回合号；null = 开局段（回合 1 之前的换人提示/规则行） */
  turn: number | null;
  lines: string[];
}

/** 以 |turn|n 为锚点分组；保留原始行序，pre 段归第 0 组。纯函数可单测。 */
export function turnGroups(lines: string[]): TurnGroup[] {
  const out: TurnGroup[] = [];
  let cur: TurnGroup = { turn: null, lines: [] };
  for (const line of lines) {
    const m = /^\|turn\|(\d+)/.exec(line);
    if (m) {
      if (cur.lines.length || out.length === 0) out.push(cur);
      cur = { turn: Number(m[1]), lines: [] };
    } else {
      cur.lines.push(line);
    }
  }
  out.push(cur);
  // 末组可能为空（日志恰好以 |turn|n 结尾、行动尚未发生）——保留空组以显示回合头
  return out;
}

/** 日志不渲染的协议噪音（连接/元数据行；裸 p1/p2 系 sideupdate 残行用正则） */
const LOG_HIDDEN = new Set([
  "player",
  "seed",
  "rated",
  "start",
  "clearpoke",
  "poke",
  "teampreview",
  "t:",
  "gametype",
  "gen",
  "format",
  "tier",
  "uptime",
  "split",
  "tee",
  "view",
  "c",
  "chat",
  "j",
  "l",
  "prompt",
]);
const LOG_HIDDEN_RE = /^p[12]( \d+)?$/;

export function LogLine(props: { line: string }): JSX.Element | null {
  const { line } = props;
  // 战斗事件行一律以 | 开头；无前缀的裸行是流帧残留（挑战按钮/帧头等），不渲染
  if (!line.startsWith("|")) return null;
  const parts = line.split("|");
  const kind = parts[1] ?? "";
  if (LOG_HIDDEN.has(kind) || LOG_HIDDEN_RE.test(kind)) return null;
  // raw 行里的服务端交互控件（OTS 请求按钮等）不进日志
  if (kind === "raw" && /<button|otsrequest/i.test(line)) return null;
  const text = zhLine(renderLine(kind, parts.slice(2)));
  if (!text) return null;
  return <div className={"log-line log-" + kind.replace(/[^a-z-]/g, "")}>{text}</div>;
}

/** 协议 ident（"p1a: Garchomp"）去掉槽位前缀，只留可读名（zhLine 再翻专名） */
function who(ident: string | undefined): string {
  return (ident ?? "").replace(/^p[12][ab]?: /, "");
}

/** 最近一条可渲染日志的中文文本（场地 ticker 用，复用日志渲染规则） */
export function lastLogText(logTail: string[]): string {
  for (let i = logTail.length - 1; i >= 0; i--) {
    const line = logTail[i]!;
    if (!line.startsWith("|")) continue;
    const parts = line.split("|");
    const kind = parts[1] ?? "";
    if (LOG_HIDDEN.has(kind) || LOG_HIDDEN_RE.test(kind)) continue;
    if (kind === "raw" && /<button|otsrequest/i.test(line)) continue;
    const t = zhLine(renderLine(kind, parts.slice(2)));
    if (t) return t;
  }
  return "";
}

export function renderLine(kind: string, p: string[]): string {
  const clean = (s: string | undefined) =>
    (s ?? "").replace(/\\n/g, " ").replace(/\n/g, " ").trim();
  switch (kind) {
    case "turn":
      return `第 ${p[0]} 回合`;
    case "-ability":
      return `${who(p[0])} 的「${p[1]}」发动了`;
    case "move":
      return `${who(p[0])} 使用了 ${p[1]}！`;
    case "switch":
    case "drag":
      return `${who(p[0])}，就决定是你了！（${p[1]}）`;
    case "damage":
      // p[1] 形如 "58/194"（剩余/最大）——参考 Showdown 展示剩余血量
      return p[1] ? `${who(p[0])} 受到了伤害（${p[1]}）` : `${who(p[0])} 受到了伤害。`;
    case "heal":
      return p[1] ? `${who(p[0])} 回复了 HP（${p[1]}）` : `${who(p[0])} 回复了 HP。`;
    case "faint":
      return `${who(p[0])} 倒下了！`;
    case "win":
      return `🎉 ${p[0]} 获胜！`;
    case "tie":
      return "平局。";
    case "mega":
      return `${who(p[0])} 超级进化成了 ${p[1]}！`;
    case "terastallize":
    case "-terastallize":
      return `${who(p[0])} 太晶化！（${p[1]}）`;
    case "max":
      return `${who(p[0])} 极巨化了！`;
    case "zpower":
      return `${who(p[0])} 汇聚了 Z 力量！`;
    case "weather":
    case "-weather":
      return p[0] === "none" ? "天气恢复了。" : `天气：${zhFieldText(p[0] ?? "")}`;
    case "-fieldstart":
    case "fieldstart":
      return `场地：${zhFieldText(p[0] ?? "")}`;
    case "-fieldend":
    case "fieldend":
      return `场地结束：${zhFieldText(p[0] ?? "")}`;
    case "-sidestart":
      return `${who(p[0])}：${zhFieldText(p[1] ?? "")} 展开`;
    case "-sideend":
      return `${who(p[0])}：${zhFieldText(p[1] ?? "")} 结束`;
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
      return `${who(p[0])} 陷入了${p[1]}状态。`;
    case "-curestatus":
      return `${who(p[0])} 的${p[1] ?? "状态"}解除了。`;
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
  Snowscape: "下雪",
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
  // 长键优先（如 Snowscape 先于 Snow），避免短键把长词条截断替换
  const entries = Object.entries(FIELD_ZH).sort((a, b) => b[0].length - a[0].length);
  for (const [en, zh] of entries) out = out.replaceAll(en, zh);
  out = out.replace(/\[upkeep\]/g, "（持续中）");
  out = out.replace(/\[from\] ability: ?/g, "（特性：");
  out = out.replace(/\[from\] ?move: ?/g, "（招式：");
  out = out.replace(/\[of\] ?/g, "——");
  if (out.includes("（特性：") && !out.endsWith("）")) out += "）";
  return out;
}

/**
 * 分组日志视图：回合容器（回合头 + 缩进行动块）+ 自动滚底（用户上翻时不强拉，
 * 出现「回到底部」浮标）。BattleView 传 logTail，RecordsPage/回放传全量 log。
 * 回合头可点击（onTurnClick：M4 闪回定位钩子，可选）。
 */
export function TurnLogView(props: {
  lines: string[];
  onTurnClick?: ((turn: number) => void) | undefined;
  /** 高亮回合（闪回定位时滚动至该回合块并高亮） */
  highlightTurn?: number | null | undefined;
}): JSX.Element {
  const { lines, onTurnClick, highlightTurn } = props;
  const groups = turnGroups(lines);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);
  const [atBottom, setAtBottom] = useState(true);
  const prevCountRef = useRef(0);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => {
      const bottom = el.scrollHeight - el.scrollTop - el.clientHeight < 28;
      setAtBottom(bottom);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  // 自动滚底：仅当用户本来就在底部（不强拉上翻用户）；新回合到达时贴底
  useEffect(() => {
    if (lines.length === prevCountRef.current) return;
    prevCountRef.current = lines.length;
    if (atBottom) endRef.current?.scrollIntoView({ block: "end" });
  }, [lines.length, atBottom]);

  // 高亮回合到达/变化：滚动到对应块
  const turnRefCallback = useRef<Record<number, HTMLDivElement | null>>({});
  useEffect(() => {
    if (highlightTurn == null) return;
    turnRefCallback.current[highlightTurn]?.scrollIntoView({ block: "start" });
  }, [highlightTurn]);

  return (
    <div className="turn-log-wrap">
      <div className="log-scroll" ref={scrollRef}>
        {groups.map((g, gi) => (
          <div
            key={g.turn ?? "pre" + gi}
            ref={(el) => {
              if (g.turn != null) turnRefCallback.current[g.turn] = el;
            }}
            className={
              "turn-block" + (g.turn != null && g.turn === highlightTurn ? " highlight" : "")
            }
          >
            <div
              className={"turn-head" + (g.turn != null && onTurnClick ? " clickable" : "")}
              onClick={g.turn != null ? () => onTurnClick?.(g.turn!) : undefined}
            >
              {g.turn != null ? `回合 ${g.turn}` : "开局"}
            </div>
            <div className="turn-lines">
              {g.lines.map((l, i) => (
                <LogLine key={i} line={l} />
              ))}
            </div>
          </div>
        ))}
        <div ref={endRef} />
      </div>
      {!atBottom && (
        <button
          className="log-back-bottom"
          onClick={() => endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" })}
        >
          ↓ 回到底部
        </button>
      )}
    </div>
  );
}
