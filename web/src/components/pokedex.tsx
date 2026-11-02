/* 图鉴展示组件：精灵球/立绘/努力值/图鉴描述/获取方式/特性/进化链（自 components/shared.tsx 拆出） */
import { useMemo } from "react";
import { EV_NAMES } from "../data/constants";
import { versionColor } from "./format";
import { TypeBadge } from "./badges";

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
  extraQuery,
}: {
  evo: any;
  current: number;
  gameId: string;
  /** 附加到节点跳转 hash 的额外 query（如全国图鉴语境传 "national=1"；不传行为不变） */
  extraQuery?: string | undefined;
}): JSX.Element {
  if (!evo || !evo.root) return <div className="empty-hint">不进化</div>;
  return (
    <div className="evo-wrap">
      <div className="evo-node-list">
        <EvoNode
          sid={evo.root}
          evo={evo}
          current={current}
          gameId={gameId}
          extraQuery={extraQuery}
        />
      </div>
    </div>
  );
}

function EvoNode({
  sid,
  evo,
  current,
  gameId,
  extraQuery,
}: {
  sid: number;
  evo: any;
  current: number;
  gameId: string;
  extraQuery?: string | undefined;
}): JSX.Element {
  const node = (evo.nodes || {})[sid] || {};
  const children: number[] = (evo.children || {})[sid] || [];
  return (
    <div className="evo-branch">
      <div
        className={"evo-node" + (sid === current ? " cur" : "")}
        onClick={() => {
          const extra = extraQuery ? "&" + extraQuery : "";
          location.hash = `#/pokemon/${sid}?game=${gameId || ""}${extra}`;
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
              <EvoNode
                sid={c}
                evo={evo}
                current={current}
                gameId={gameId}
                extraQuery={extraQuery}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
