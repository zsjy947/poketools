/**
 * 回合分组日志（Showdown 式）：以 |turn|n 为锚点把协议日志切成回合块，
 * 回合头 + 行动块缩进渲染；BattleView 实时区与 RecordsPage/回放器共用。
 * renderLine/LogLine 系渲染函数自 BattleView 提取至此（唯一实现）。
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { zhLine } from "../data";
import { STAT_BOOST_ZH } from "./field";

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
    case "-boost":
      return `${who(p[0])} 的${STAT_BOOST_ZH[p[1] ?? ""] ?? p[1] ?? "能力"}提升了！（+${p[2]}）`;
    case "-unboost":
      return `${who(p[0])} 的${STAT_BOOST_ZH[p[1] ?? ""] ?? p[1] ?? "能力"}下降了！（-${p[2]}）`;
    case "-item":
      return `${who(p[0])} 的道具「${p[1] ?? ""}」生效了`;
    case "-enditem":
      return `${who(p[0])} 的道具「${p[1] ?? ""}」失效了`;
    case "-prepare":
      return `${who(p[0])} 正在积蓄力量…（${p[1] ?? ""}）`;
    case "-hits":
      return `命中了 ${p[1] ?? "?"} 次！`;
    case "-supereffective":
      return "效果绝佳！";
    case "-resisted":
      return "效果不太好…";
    case "-immune":
      return "没有效果…";
    case "-miss":
      return `${who(p[1])} 避开了攻击！`;
    case "-fail":
      return `${who(p[0])} 的招式没有生效…`;
    case "-notarget":
      return "没有可以攻击的目标…";
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

/** 天气/场地/持续效果段的中文渲染（SunnyDay [from] ability: 日照 [of] p1a: 喷火龙 等） */const FIELD_ZH: Record<string, string> = {
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

/* ===== Showdown 式整合日志（prose）：把逐行协议合并为人类可读的叙事句 =====
 * - 出招句 / 伤害句（损失百分比 + 剩余 + 会心/效果/连击合并为句尾括注）；
 * - HP 百分比追踪跨行推进（switch 段与 damage/heal 段都含 cur/max，按段内比值算百分比，
 *   对绝对值（live "82/194"）与百分比（replay "82/100"）两种口径都不敏感）；
 * - 覆盖不到的事件逐行回落 renderLine（原"原始"视图的单行渲染）。 */

export interface ProseLine {
  text: string;
  /** 复用 .log-line.* 配色类（move/damage/heal/faint/switch/-crit/…） */
  cls: string;
}
export interface ProseTurn {
  turn: number | null;
  lines: ProseLine[];
}

/** "82/194" / "0 fnt" / "100/100" 段 → 剩余百分比（无法解析返回 null） */
function segPct(seg: string | undefined): number | null {
  const first = (seg ?? "").split(" ")[0] ?? "";
  const nums = first.split("/").map(Number);
  const a = nums[0];
  const b = nums[1];
  if (a !== undefined && Number.isFinite(a)) {
    if (b !== undefined && Number.isFinite(b) && b > 0) return Math.round((a / b) * 100);
    return Math.min(100, Math.max(0, Math.round(a)));
  }
  return null;
}

/** 阵营前缀：双打/双侧语境下标明归属（p1=A 阵营，p2=B 阵营） */
function sideTag(ident: string | undefined): string {
  const m = /^p([12])[ab]?: /.exec(ident ?? "");
  return m ? (m[1] === "1" ? "A·" : "B·") : "";
}
function zhWho(ident: string | undefined): string {
  return sideTag(ident) + who(ident);
}

function kindOf(line: string): string {
  return line.startsWith("|") ? (line.split("|")[1] ?? "") : "";
}

/** 整合视图：turnGroups 分组后逐组合并叙事；hp 百分比跨回合持续追踪 */
export function proseTurns(lines: string[]): ProseTurn[] {
  const hp = new Map<string, number>();
  return turnGroups(lines).map((g) => ({ turn: g.turn, lines: proseLines(g.lines, hp) }));
}

function proseLines(raw: string[], hp: Map<string, number>): ProseLine[] {
  const out: ProseLine[] = [];
  let i = 0;
  while (i < raw.length) {
    const line = raw[i]!;
    if (!line.startsWith("|")) {
      i++;
      continue;
    }
    const parts = line.split("|");
    const kind = parts[1] ?? "";
    switch (kind) {
      case "move": {
        out.push({ text: zhLine(`${zhWho(parts[2])} 使用了 ${parts[3] ?? ""}！`), cls: "move" });
        i++;
        // 紧随的落空并入出招（不单独成行）
        if (i < raw.length && kindOf(raw[i]!) === "-miss") {
          const mp = raw[i]!.split("|");
          out.push({ text: zhLine(`${zhWho(mp[3])} 避开了攻击！`), cls: "-miss" });
          i++;
        }
        break;
      }
      case "switch":
      case "drag": {
        const seg = segPct(parts[4]);
        if (parts[2] && seg != null) hp.set(parts[2]!, seg);
        out.push({
          text: zhLine(
            kind === "drag" ? `${zhWho(parts[2])} 被强制换上场了！` : `${zhWho(parts[2])} 上场了！`,
          ),
          cls: "switch",
        });
        i++;
        break;
      }
      case "-damage":
      case "-heal": {
        const ident = parts[2];
        const pct = segPct(parts[3]);
        const prev = ident != null ? hp.get(ident) : undefined;
        if (ident != null && pct != null) hp.set(ident, pct);
        // 吸收紧随标记行：会心/效果/连击次数并入伤害句尾
        let crit = false;
        let eff = "";
        let hits = "";
        let j = i + 1;
        while (j < raw.length) {
          const k = kindOf(raw[j]!);
          if (k === "-crit") {
            crit = true;
            j++;
            continue;
          }
          if (k === "-supereffective") {
            eff = "super";
            j++;
            continue;
          }
          if (k === "-resisted") {
            eff = "resisted";
            j++;
            continue;
          }
          if (k === "-hits") {
            hits = raw[j]!.split("|")[3] ?? "?";
            j++;
            continue;
          }
          break;
        }
        const bits: string[] = [];
        if (kind === "-damage") {
          let text: string;
          if (prev != null && pct != null) {
            const lost = Math.max(0, prev - pct);
            text = `${zhWho(ident)} 损失了 ${lost}% 的 HP（剩余 ${pct}%）`;
          } else {
            text = `${zhWho(ident)} 受到了伤害${pct != null ? `（剩余 ${pct}%）` : ""}`;
          }
          if (hits) bits.push(`连续命中 ${hits} 次`);
          if (crit) bits.push("击中要害");
          if (eff === "super") bits.push("效果绝佳");
          if (eff === "resisted") bits.push("效果不好");
          out.push({
            text: zhLine(bits.length ? `${text}（${bits.join("，")}）` : text),
            cls:
              eff === "super"
                ? "-supereffective"
                : eff === "resisted"
                  ? "-resisted"
                  : crit
                    ? "-crit"
                    : "damage",
          });
        } else {
          let text: string;
          if (prev != null && pct != null) {
            const gain = Math.max(0, pct - prev);
            text = `${zhWho(ident)} 回复了 ${gain}% 的 HP（剩余 ${pct}%）`;
          } else {
            text = `${zhWho(ident)} 回复了 HP${pct != null ? `（剩余 ${pct}%）` : ""}`;
          }
          out.push({ text: zhLine(text), cls: "heal" });
        }
        i = j;
        break;
      }
      case "faint":
        out.push({ text: zhLine(`${zhWho(parts[2])} 倒下了！`), cls: "faint" });
        i++;
        break;
      default: {
        const fb = fallbackProse(kind, line);
        if (fb) out.push(fb);
        i++;
        break;
      }
    }
  }
  return out;
}

/** 未整合事件回落单行渲染（与"原始"视图同一条 renderLine；噪音行返回 null 不渲染） */
function fallbackProse(kind: string, line: string): ProseLine | null {
  if (LOG_HIDDEN.has(kind) || LOG_HIDDEN_RE.test(kind)) return null;
  if (kind === "raw" && /<button|otsrequest/i.test(line)) return null;
  const parts = line.split("|");
  const text = zhLine(renderLine(kind, parts.slice(2)));
  if (!text) return null;
  return { text, cls: kind.replace(/[^a-z-]/g, "") };
}

/**
 * 分组日志视图：回合容器（回合头 + 行动块）+ 自动滚底（用户上翻时不强拉，
 * 出现「回到底部」浮标）。默认「整合」视图（Showdown 式叙事句，proseTurns），
 * 可切换「原始」逐行视图。滚动一律限制在日志容器内（scrollTo），不用
 * scrollIntoView——后者会连带滚动页面级祖先（回放页舞台被顶出视口）。
 * BattleView 传 logTail，RecordsPage/回放传全量 log。回合头可点击（闪回定位钩子）。
 */
export function TurnLogView(props: {
  lines: string[];
  onTurnClick?: ((turn: number) => void) | undefined;
  /** 高亮回合（闪回定位时滚动至该回合块并高亮） */
  highlightTurn?: number | null | undefined;
}): JSX.Element {
  const { lines, onTurnClick, highlightTurn } = props;
  const [mode, setMode] = useState<"prose" | "raw">("prose");
  const groups = useMemo(() => turnGroups(lines), [lines]);
  const prose = useMemo(() => (mode === "prose" ? proseTurns(lines) : null), [lines, mode]);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);
  const [atBottom, setAtBottom] = useState(true);
  const prevCountRef = useRef(0);

  /** 滚动限制在 .log-scroll 容器内（不惊动页面滚动） */
  const scrollToEnd = (smooth = false) => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" });
  };

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
    if (atBottom) scrollToEnd();
  }, [lines.length, atBottom]);

  // 高亮回合到达/变化：滚动到对应块（容器内相对位移，避免 scrollIntoView 连滚页面）
  const turnRefCallback = useRef<Record<number, HTMLDivElement | null>>({});
  useEffect(() => {
    if (highlightTurn == null) return;
    const el = scrollRef.current;
    const target = turnRefCallback.current[highlightTurn];
    if (!el || !target) return;
    const dy = target.getBoundingClientRect().top - el.getBoundingClientRect().top;
    el.scrollTo({ top: Math.max(0, el.scrollTop + dy - 6), behavior: "smooth" });
  }, [highlightTurn, mode]);

  const blocks = prose ?? groups;

  return (
    <div className="turn-log-wrap">
      <div className="log-mode-toggle" role="group" aria-label="日志视图">
        <button
          className={mode === "prose" ? "on" : ""}
          onClick={() => setMode("prose")}
          title="整合为可读的叙事句（Showdown 式）"
        >
          整合
        </button>
        <button
          className={mode === "raw" ? "on" : ""}
          onClick={() => setMode("raw")}
          title="逐行协议渲染"
        >
          原始
        </button>
      </div>
      <div className="log-scroll" ref={scrollRef}>
        {blocks.map((g, gi) => (
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
              {prose
                ? (g as ProseTurn).lines.map((pl, li) => (
                    <div key={li} className={"log-line log-" + pl.cls}>
                      {pl.text}
                    </div>
                  ))
                : (g as TurnGroup).lines.map((l, li) => <LogLine key={li} line={l} />)}
            </div>
          </div>
        ))}
        <div ref={endRef} />
      </div>
      {!atBottom && (
        <button className="log-back-bottom" onClick={() => scrollToEnd(true)}>
          ↓ 回到底部
        </button>
      )}
    </div>
  );
}
