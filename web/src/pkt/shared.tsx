/* pkt 共享组件与工具（自 Vue components.js/utils.js 移植；U1 双剑图标按 monoline 规范重绘） */
import { useMemo, useState, type ReactNode } from "react";
import { apiGet } from "../data/api";

/* ---- toast（轻量替代 ElMessage） ---- */
let toastSeq = 0;
type Toast = { id: number; msg: string; type: string };
const toastListeners = new Set<(t: Toast[]) => void>();
let toasts: Toast[] = [];
export function toast(msg: string, type = "info"): void {
  const t = { id: ++toastSeq, msg, type };
  toasts = [...toasts, t];
  for (const fn of toastListeners) fn(toasts);
  setTimeout(() => {
    toasts = toasts.filter((x) => x.id !== t.id);
    for (const fn of toastListeners) fn(toasts);
  }, 2200);
}

export function ToastHost(): JSX.Element {
  const [list, setList] = useState<Toast[]>([]);
  useState(() => {
    toastListeners.add(setList);
    return null;
  });
  return (
    <div className="pkt-toast-host">
      {list.map((t) => (
        <div key={t.id} className={"pkt-toast t-" + t.type}>
          {t.msg}
        </div>
      ))}
    </div>
  );
}

/* ---- games / typeChart 全局缓存（对应 Vue store） ---- */
export interface GameDex {
  id: string;
  name_zh: string;
  name_en: string;
  total: number;
}
export interface GameRow {
  id: string;
  name_zh: string;
  name_en: string;
  generation: number;
  features: string[];
  dexes: GameDex[];
  [k: string]: any;
}
export interface PktStore {
  games: GameRow[];
  profileId: 1;
  gameId: string;
  typeChart: { types: string[]; chart: Record<string, Record<string, number>> } | null;
  gamesPromise: Promise<GameRow[]> | null;
}
export const pktStore: PktStore = {
  games: [],
  profileId: 1,
  gameId: "",
  typeChart: null,
  gamesPromise: null,
};

export function loadGames(): Promise<GameRow[]> {
  if (!pktStore.gamesPromise) {
    pktStore.gamesPromise = apiGet("/api/games").then((r) => {
      pktStore.games = r as GameRow[];
      return pktStore.games;
    });
  }
  return pktStore.gamesPromise;
}

export function loadTypeChart(): Promise<PktStore["typeChart"]> {
  if (pktStore.typeChart) return Promise.resolve(pktStore.typeChart);
  return apiGet("/api/meta/typechart").then((r) => {
    pktStore.typeChart = r;
    return r;
  });
}

/* 属性相性计算（防守方视角） */
export function defenseMultipliers(types: string[]): Record<string, number> | null {
  const chart = pktStore.typeChart;
  if (!chart) return null;
  const out: Record<string, number> = {};
  for (const atk of chart.types) {
    let m = 1;
    for (const t of types) {
      m *= (chart.chart[atk] || {})[t] ?? 1;
    }
    out[atk] = m;
  }
  return out;
}

/* ---- 功能注册表 ---- */
export const FEATURES: Record<string, { key: string; label: string; icon: string; desc: string }> =
  {
    dex: { key: "dex", label: "地区图鉴", icon: "dex", desc: "图鉴进度追踪与捕捉方式" },
    ev: { key: "ev", label: "努力值查询", icon: "ev", desc: "按努力值筛选当前游戏宝可梦" },
    sandwich: {
      key: "sandwich",
      label: "三明治食谱",
      icon: "sandwich",
      desc: "食力筛选 · 食材调味料 · 自由录入",
    },
    donut: {
      key: "donut",
      label: "甜甜圈工房",
      icon: "donut",
      desc: "特殊配方 · 树果效果 · 风味力量",
    },
    curry: { key: "curry", label: "咖喱图鉴", icon: "curry", desc: "咖喱品种图鉴与介绍" },
  };

/* ---- Monoline 图标（viewBox 24 / stroke 2 / round / fill none / currentColor） ---- */
const MONO_ICONS: Record<string, string> = {
  dex:
    '<path d="M12 7C10 5.4 7.2 4.8 4 4.8v13.4c3.2 0 6 .6 8 2.2 2-1.6 4.8-2.2 8-2.2V4.8c-3.2 0-6 .6-8 2.2z"/>' +
    '<path d="M12 7v13.4"/><circle cx="12" cy="12.6" r="1.6"/>',
  ev:
    '<path d="M4 20.2h16"/><rect x="5" y="13.6" width="3.6" height="6.6" rx="1"/>' +
    '<rect x="10.2" y="9.6" width="3.6" height="10.6" rx="1"/>' +
    '<rect x="15.4" y="5.6" width="3.6" height="14.6" rx="1"/>',
  sandwich:
    '<rect x="4" y="4.8" width="16" height="4.6" rx="2.3"/>' +
    '<rect x="5.6" y="10.8" width="12.8" height="2.8" rx="1.4"/>' +
    '<rect x="4" y="15" width="16" height="4.6" rx="2.3"/>',
  donut:
    '<circle cx="12" cy="12.6" r="8.4"/><circle cx="12" cy="12.6" r="3.2"/>' +
    '<path d="M6.6 8.4a6.6 6.6 0 0 1 10.8 0"/>',
  curry:
    '<path d="M4 10.2h16v2.8a7 7 0 0 1-7 7h-2a7 7 0 0 1-7-7z"/>' +
    '<path d="M1.8 10.2h2.8M19.4 10.2h2.8"/><path d="M9.4 4.2c.7.7.7 1.6 0 2.3M13.6 4.2c.7.7.7 1.6 0 2.3M11.5 2.6v1.2"/>',
  calc:
    '<rect x="5" y="3" width="14" height="18" rx="2"/>' +
    '<rect x="7.6" y="5.6" width="8.8" height="3.4" rx="0.8"/>' +
    '<path d="M8.8 13.2v.01M15.2 13.2v.01M8.8 17.4v.01M15.2 17.4v.01"/>',
  /* U1：完整交叉双剑（护手/剑柄/双刃交叉，密度对齐 games/calc） */
  battle:
    '<path d="M4.2 3.2 5.6 3l10.9 10.9 2.3-2.3 2 2-2.2 2.2 2.2 2.2-1.4 1.4-2.2-2.2-2.2 2.2-2-2 2.3-2.3L4.4 4.6z" fill="currentColor" stroke="none"/>' +
    '<path d="M3.2 19.8l3.2-3.2M6.4 16.6l1.8 1.8"/>',
  games:
    '<rect x="2.6" y="7.2" width="18.8" height="10.4" rx="5.2"/>' +
    '<path d="M7.2 10.2v4.2M5.1 12.3h4.2"/><path d="M15.4 10.8v.01M17.6 13.6v.01"/>',
  home: '<path d="M3.8 11.2L12 4l8.2 7.2"/><path d="M5.8 9.6V20h12.4V9.6"/><path d="M10 20v-5.4h4V20"/>',
  back: '<path d="M19 12H5"/><path d="M11 5.4L4.4 12l6.6 6.6"/>',
};

export function MonoIcon({ name, size = 22 }: { name: string; size?: number }): JSX.Element {
  return (
    <svg
      className="mono-icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      dangerouslySetInnerHTML={{ __html: MONO_ICONS[name] || "" }}
    />
  );
}

/* ---- 官方简中商标图标（双版本游戏两枚；U2 竖排形态由 CSS 控制） ---- */
const GAME_ICONS: Record<string, string[]> = {
  "sword-shield": ["sword", "shield"],
  "brilliant-diamond-shining-pearl": ["diamond", "pearl"],
  "legends-arceus": ["arceus"],
  "scarlet-violet": ["scarlet", "violet"],
  "legends-za": ["za"],
};

export function GameIcons({ gid, h = 22 }: { gid: string; h?: number }): JSX.Element {
  return (
    <span className="game-icons" style={{ height: h + "px" }}>
      {(GAME_ICONS[gid] || []).map((k) => (
        <img
          key={k}
          className="game-logo"
          src={`/assets/games/${k}.webp`}
          style={{ height: h + "px" }}
          alt={gid}
          loading="lazy"
          onError={(e) => {
            (e.target as HTMLElement).style.display = "none";
          }}
        />
      ))}
    </span>
  );
}
export function isDualGame(gid: string): boolean {
  return (
    gid === "sword-shield" || gid === "brilliant-diamond-shining-pearl" || gid === "scarlet-violet"
  );
}

/* ---- 属性徽章（雪碧图图标） ---- */
export const TYPE_ICON_POS: Record<string, number> = {
  一般: 0,
  格斗: 1,
  飞行: 2,
  毒: 3,
  地面: 4,
  岩石: 5,
  虫: 6,
  幽灵: 7,
  钢: 8,
  火: 9,
  水: 10,
  草: 11,
  电: 12,
  超能力: 13,
  冰: 14,
  龙: 15,
  恶: 16,
  妖精: 17,
};
const MOVE_CLASS_ICON_POS: Record<string, number> = { physical: 18, special: 19, status: 20 };

export function TypeBadge({
  types,
  plain,
}: {
  types: string | undefined;
  plain?: boolean;
}): JSX.Element {
  const list = (types || "").split(",").filter(Boolean);
  return (
    <span>
      {list.map((t) => (
        <span
          key={t}
          className={"type-badge" + (plain ? " plain" : "")}
          style={{ ["--t" as string]: `var(--type-${t})` }}
        >
          {TYPE_ICON_POS[t] != null && (
            <span className="ti" style={{ ["--iy" as string]: TYPE_ICON_POS[t] }} />
          )}
          {t}
        </span>
      ))}
    </span>
  );
}

export function MoveClassBadge({ cls }: { cls: string | undefined }): JSX.Element {
  const label =
    ({ physical: "物理", special: "特殊", status: "变化" } as Record<string, string>)[cls || ""] ||
    "-";
  return (
    <span className={"mcls-badge mc-" + (cls || "")}>
      {cls != null && cls in MOVE_CLASS_ICON_POS && (
        <span className="ti" style={{ ["--iy" as string]: MOVE_CLASS_ICON_POS[cls]! }} />
      )}
      {label}
    </span>
  );
}

/* ---- 版本主题色 / 形态标签 ---- */
const VERSION_COLORS: Record<string, string> = {
  剑: "#3a6fd8",
  "剑·扩展票": "#3a6fd8",
  盾: "#d0392e",
  "盾·扩展票": "#d0392e",
  "剑/盾": "#4a5b82",
  "剑/盾·扩展票": "#4a5b82",
  晶灿钻石: "#1fa9a0",
  明亮珍珠: "#d76aa8",
  "晶灿钻石/明亮珍珠": "#7b8bb0",
  朱: "#e3342f",
  "朱·零之秘宝": "#e3342f",
  紫: "#8a3fd0",
  "紫·零之秘宝": "#8a3fd0",
  "朱/紫": "#a04d7a",
  "朱/紫·零之秘宝": "#a04d7a",
  洗翠: "#3f8f7d",
  "传说 阿尔宙斯": "#3f8f7d",
  "Z-A": "#c99a1e",
  "传说 Z-A": "#c99a1e",
  "Z-A·异次元": "#c99a1e",
  "晶钻/明珍": "#7b8bb0",
};
export function versionColor(label: string): string {
  if (!label) return "#909399";
  if (VERSION_COLORS[label]) return VERSION_COLORS[label]!;
  if (label.startsWith("剑")) return VERSION_COLORS["剑"]!;
  if (label.startsWith("盾")) return VERSION_COLORS["盾"]!;
  if (label.startsWith("朱")) return VERSION_COLORS["朱"]!;
  if (label.startsWith("紫")) return VERSION_COLORS["紫"]!;
  if (label.startsWith("晶灿") || label.startsWith("晶钻")) return VERSION_COLORS["晶灿钻石"]!;
  if (label.startsWith("明亮") || label.startsWith("明珍")) return VERSION_COLORS["明亮珍珠"]!;
  return "#909399";
}

const FORM_LABEL_ZH: Record<string, string> = {
  attack: "攻击形态",
  defense: "防御形态",
  speed: "速度形态",
  heat: "加热",
  wash: "清洗",
  frost: "结冰",
  fan: "旋转",
  mow: "切割",
  sunny: "晴天",
  rainy: "雨水",
  snowy: "雪云",
  sandy: "砂土蓑衣",
  trash: "垃圾蓑衣",
  zen: "达摩模式",
  pirouette: "舞步形态",
  small: "小",
  large: "大",
  super: "特大",
  female: "雌性",
  male: "雄性",
  "totem-alola": "霸主",
  "alola-cap": "阿罗拉帽子",
  "blue-striped": "蓝条纹",
  "white-striped": "白条纹",
  origin: "起源形态",
  altered: "另形态",
};
export function formDisplayName(f: any): string {
  if (!f) return "";
  const label = f.form_label || "";
  if (label && /[\u4e00-\u9fff]/.test(label)) return label;
  return FORM_LABEL_ZH[label] || label;
}

/* ---- 精灵球切换 / 官方绘图 ---- */
export function PokeToggle({
  caught,
  onToggle,
}: {
  caught: boolean;
  onToggle: () => void;
}): JSX.Element {
  return (
    <span
      className={"poke-toggle" + (caught ? " caught" : "")}
      title={caught ? "已捕捉（点击取消标记）" : "标记为已捕捉"}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
    >
      <svg viewBox="0 0 24 24" width="24" height="24">
        <circle cx="12" cy="12" r="10" fill={caught ? "#f5f6f8" : "none"} opacity={0.95} />
        {caught ? (
          <path d="M2.6 12a10 10 0 0 1 20 0z" fill="#e5484d" />
        ) : (
          <path d="M2.6 12a10 10 0 0 1 20 0z" fill="#f5f6f8" opacity={0.35} />
        )}
        {caught && <path d="M2.6 12a10 10 0 0 0 20 0z" fill="#f5f6f8" />}
        <rect x="2.6" y="11" width="20" height="2" fill="#24292f" />
        <circle
          cx="12"
          cy="12"
          r="3.6"
          fill={caught ? "#f5f6f8" : "rgba(0,0,0,0)"}
          stroke="#24292f"
          strokeWidth="1.6"
        />
        <circle cx="12" cy="12" r="1.4" fill={caught ? "#e5484d" : "#c0c6d0"} />
      </svg>
    </span>
  );
}

export function PokeImg({ formId, size = 96 }: { formId: number; size?: number }): JSX.Element {
  return (
    <img
      className="poke-img"
      src={`/pkt/${formId}.png`}
      loading="lazy"
      style={{ width: size + "px", height: size + "px" }}
      onError={(e) => (e.target as HTMLElement).classList.add("img-missing")}
    />
  );
}

export const EV_NAMES: Record<string, string> = {
  hp: "HP",
  atk: "攻击",
  def: "防御",
  spa: "特攻",
  spd: "特防",
  spe: "速度",
};

export function EvBadges({ ev }: { ev: Record<string, number> | undefined }): JSX.Element {
  const items = ev || {};
  const hasEv = Object.values(items).some((v) => v > 0);
  return (
    <span>
      {Object.entries(items).map(([k, v]) =>
        v > 0 ? (
          <span key={k} className="ev-badge">
            {EV_NAMES[k]} +{v}
          </span>
        ) : null,
      )}
      {!hasEv && <span className="empty-hint">无</span>}
    </span>
  );
}

export function FlavorList({ flavor }: { flavor: any[] }): JSX.Element {
  return (
    <div>
      {(flavor || []).map((f, i) => (
        <div key={i} className="flavor-item">
          <span className="flavor-tag" style={{ background: versionColor(f.version_label) }}>
            {f.version_label}
          </span>
          {f.text}
        </div>
      ))}
      {!(flavor && flavor.length) && (
        <div className="empty-hint">当前版本暂无图鉴描述（待补充）</div>
      )}
    </div>
  );
}

export function GetMethodList({ rows, extra }: { rows: any[]; extra?: any[] }): JSX.Element {
  const grouped = useMemo(() => {
    const order: string[] = [];
    const map: Record<string, any[]> = {};
    (rows || []).forEach((r) => {
      const key = r.version_label || "—";
      if (!(key in map)) {
        map[key] = [];
        order.push(key);
      }
      map[key]!.push(r);
    });
    return order.map((k) => ({ label: k, rows: map[k]! }));
  }, [rows]);
  return (
    <div>
      {grouped.map((g, i) => (
        <div key={i}>
          <div className="gm-group">
            <span className="gm-tag" style={{ background: versionColor(g.label), color: "#fff" }}>
              {g.label}
            </span>
          </div>
          {g.rows.map((r, j) => (
            <div key={j} className="gm-row">
              <span className="gm-loc">{r.location || "—"}</span>
              <span className="gm-method">{r.method}</span>
              {r.note && <span className="gm-note">{r.note}</span>}
            </div>
          ))}
        </div>
      ))}
      {(extra || []).length > 0 && (
        <div>
          <div className="gm-group">
            <span className="gm-tag" style={{ background: "#a8b0c0", color: "#fff" }}>
              地点数据（未翻译）
            </span>
          </div>
          {(extra || []).map((e, j) => (
            <div key={j} className="gm-row">
              <span className="gm-loc">{e.location_en}</span>
              <span className="gm-method">
                Lv.{e.min_level}~{e.max_level}
              </span>
            </div>
          ))}
        </div>
      )}
      {!grouped.length && !(extra || []).length && (
        <div className="empty-hint">当前版本暂无捕捉数据（待补充）</div>
      )}
    </div>
  );
}

/* ---- 特性列表 ---- */
export function AbilityList({ abilities }: { abilities: any[] }): JSX.Element {
  return (
    <div className="ab-list">
      {(abilities || []).map((a, i) => (
        <div key={i} className={"ab-card" + (a.hidden ? " hidden" : "")}>
          <div className="ab-head">
            <span className="ab-name">{a.name}</span>
            {a.hidden && <span className="ab-hidden-chip">隐藏特性</span>}
          </div>
          {a.effect && <div className="ab-effect">{a.effect}</div>}
          {a.intro && <div className="ab-intro">{a.intro}</div>}
          {a.extra && a.extra.length > 0 && (
            <details className="ab-extra-wrap">
              <summary>详细介绍（{a.extra.length}）</summary>
              <ul className="ab-extra">
                {a.extra.map((e: string, j: number) => (
                  <li key={j}>{e}</li>
                ))}
              </ul>
            </details>
          )}
          {!a.effect && !a.intro && !(a.extra && a.extra.length) && (
            <div className="empty-hint">待补充</div>
          )}
        </div>
      ))}
      {!(abilities && abilities.length) && <div className="empty-hint">待补充</div>}
    </div>
  );
}

/* ---- 进化链（递归） ---- */
export function EvoChain({
  evo,
  current,
  gameId,
}: {
  evo: any;
  current: number;
  gameId: string;
}): JSX.Element {
  if (!evo || !evo.root) return <div className="empty-hint">不进化</div>;
  return (
    <div className="evo-wrap">
      <div className="evo-node-list">
        <EvoNode sid={evo.root} evo={evo} current={current} gameId={gameId} />
      </div>
    </div>
  );
}

function EvoNode({
  sid,
  evo,
  current,
  gameId,
}: {
  sid: number;
  evo: any;
  current: number;
  gameId: string;
}): JSX.Element {
  const node = (evo.nodes || {})[sid] || {};
  const children: number[] = (evo.children || {})[sid] || [];
  return (
    <div className="evo-branch">
      <div
        className={"evo-node" + (sid === current ? " cur" : "")}
        onClick={() => {
          location.hash = `#/pokemon/${sid}?game=${gameId || ""}`;
        }}
      >
        <PokeImg formId={node.form_id} size={64} />
        <span className="evo-name">{node.name}</span>
        <TypeBadge types={node.types} plain />
      </div>
      {children.length > 0 && (
        <div className="evo-children">
          {children.map((c) => (
            <div key={c} className="evo-child">
              <div className="evo-step">
                <div className="evo-arrow">➜</div>
                <div className="evo-cond">{(evo.conds || {})[`${sid}|${c}`] || "进化"}</div>
              </div>
              <EvoNode sid={c} evo={evo} current={current} gameId={gameId} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---- 工具 ---- */
export function versionChip(label: string): string {
  if (!label) return "";
  if (label.includes("扩展票")) return "扩展票";
  if (label.includes("零之秘宝")) return "零之秘宝";
  if (label.includes("异次元")) return "异次元";
  if (["剑", "盾", "朱", "紫"].includes(label)) return label;
  return "";
}
export function chipClass(label: string): string {
  return label.includes("扩展票") || label.includes("零之秘宝") || label.includes("异次元")
    ? "dlc"
    : "ver";
}

export function koTextFromKo(ko: any): string {
  if (!ko) return "";
  const p = ko.probs || {};
  const p1 = p["1"] || 0,
    p2 = p["2"] || 0,
    p4 = p["4"] || 0;
  if (p1 >= 100) return "1 回合击倒（确定）";
  if (p1 > 0) return `${Math.round(p1)}% 1 回合击倒`;
  if (p2 >= 100) return "2 回合内击倒（确定）";
  if (p2 > 0) return `${Math.round(p2)}% 2 回合内击倒`;
  if (p4 >= 100) return "4 回合内击倒（确定）";
  if (p4 > 0) return `${Math.round(p4)}% 4 回合内击倒`;
  return "4 回合内无法击倒";
}

export const TYPE_LIST = [
  "一般",
  "火",
  "水",
  "电",
  "草",
  "冰",
  "格斗",
  "毒",
  "地面",
  "飞行",
  "超能力",
  "虫",
  "岩石",
  "幽灵",
  "龙",
  "恶",
  "钢",
  "妖精",
];
export const STAT_KEYS = ["hp", "atk", "def", "spa", "spd", "spe"] as const;
export const STAT_ZH: Record<string, string> = {
  hp: "HP",
  atk: "攻击",
  def: "防御",
  spa: "特攻",
  spd: "特防",
  spe: "速度",
};
export const POWER_LIST = [
  "蛋蛋力",
  "遭遇力",
  "闪光力",
  "捕获力",
  "大大力",
  "小小力",
  "经验力",
  "掉物力",
  "团战力",
  "称号力",
];
export const POWER_COLORS: Record<string, string> = {
  蛋蛋力: "#f6a5c8",
  遭遇力: "#7bc86c",
  闪光力: "#f2d24b",
  捕获力: "#e8834a",
  大大力: "#e05a5a",
  小小力: "#6fc7e8",
  经验力: "#8f7ff0",
  掉物力: "#63b0a2",
  团战力: "#5a9be0",
  称号力: "#c8a2d8",
};

/* 简易确认（替代 ElMessageBox.confirm；返回 true=确认） */
export function confirmBox(message: string, title = "确认操作"): boolean {
  return window.confirm(`${title}\n\n${message}`);
}

/* 弹层容器（替代 el-dialog） */
export function Modal({
  open,
  title,
  width,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  width?: number;
  onClose: () => void;
  children: ReactNode;
}): JSX.Element | null {
  if (!open) return null;
  return (
    <div className="pkt-modal-mask" onClick={onClose}>
      <div
        className="pkt-modal"
        style={{ width: (width || 560) + "px", maxWidth: "94vw" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="pkt-modal-head">
          <span>{title}</span>
          <button className="pkt-modal-x" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="pkt-modal-body">{children}</div>
      </div>
    </div>
  );
}
