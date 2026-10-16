/* 全国图鉴页（独立于游戏）：1025 物种全量形态的收集网格。
 * 标记为物种级（形态共享），经 user.ts 全局传播与各地区图鉴自动双向同步；
 * 卡片点击跳详情 national 模式（裁剪图鉴介绍/获取方式/招式表三区）。 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { apiGet, apiSend, TYPE_LIST } from "../data/api";
import { stateCounts, NATIONAL_DEX } from "../state/user";
import type { FormBadge } from "../data/pokemon";
import { TypeBadge, PokeToggle, PokeImg, toast, confirmBox } from "../components/shared";

interface NatEntry {
  ndex: number;
  species_id: number;
  name_zh: string;
  name_en: string;
  types: string;
  form_id: number;
  form_count: number;
  generation: number;
  badges: FormBadge[];
  caught: boolean;
}

const BADGE_ZH: Record<FormBadge, string> = {
  region: "地区形态",
  mega: "Mega",
  gmax: "超极巨化",
  cosmetic: "外观形态",
};
const GEN_ZH = ["一", "二", "三", "四", "五", "六", "七", "八", "九"];

export function NationalDexPage(): JSX.Element {
  const [loading, setLoading] = useState(false);
  const [raw, setRaw] = useState<NatEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [filter, setFilter] = useState<"all" | "caught" | "uncaught">("all");
  const [typeFilter, setTypeFilter] = useState("");
  const [badgeFilter, setBadgeFilter] = useState("");
  const [genFilter, setGenFilter] = useState("");
  const [q, setQ] = useState("");
  const [markMode, setMarkMode] = useState(false);

  const refreshCounts = useCallback(() => setCounts(stateCounts()), []);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    apiGet("/api/national")
      .then((data) => {
        if (!alive) return;
        setRaw(data.entries as NatEntry[]);
        setTotal(data.total);
        refreshCounts();
      })
      .catch(() => {
        /* 空列表由占位文案兜底 */
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [refreshCounts]);

  const entries = useMemo(() => {
    let list = raw;
    if (filter === "caught") list = list.filter((e) => e.caught);
    if (filter === "uncaught") list = list.filter((e) => !e.caught);
    if (typeFilter) list = list.filter((e) => e.types.split(",").includes(typeFilter));
    if (badgeFilter) list = list.filter((e) => e.badges.includes(badgeFilter as FormBadge));
    if (genFilter) list = list.filter((e) => String(e.generation) === genFilter);
    const kw = q.trim().toLowerCase();
    if (kw)
      list = list.filter(
        (e) =>
          e.name_zh.toLowerCase().includes(kw) ||
          (e.name_en || "").toLowerCase().includes(kw) ||
          String(e.ndex) === kw.replace(/^#/, ""),
      );
    return list;
  }, [raw, filter, typeFilter, badgeFilter, genFilter, q]);

  const caughtCount = counts[NATIONAL_DEX] || 0;
  const progressPct = total ? Math.round((caughtCount / total) * 100) : 0;

  async function toggle(e: NatEntry): Promise<void> {
    const prev = e.caught;
    setRaw((rows) =>
      rows.map((x) => (x.species_id === e.species_id ? { ...x, caught: !prev } : x)),
    );
    try {
      await apiSend("PUT", "/api/state", {
        profile_id: 1,
        dex_id: NATIONAL_DEX,
        species_id: e.species_id,
        caught: !prev,
      });
      refreshCounts();
    } catch (err) {
      setRaw((rows) =>
        rows.map((x) => (x.species_id === e.species_id ? { ...x, caught: prev } : x)),
      );
      toast("标记失败：" + (err as Error).message, "error");
    }
  }

  async function bulkSet(ids: number[], caught: boolean, label: string): Promise<void> {
    const ok = confirmBox(`${label}：将影响 ${ids.length} 只宝可梦（各地区图鉴将自动同步）`);
    if (!ok) return;
    try {
      await apiSend("POST", "/api/state/bulk", {
        profile_id: 1,
        dex_id: NATIONAL_DEX,
        caught,
        species_ids: ids,
      });
      const data = await apiGet("/api/national");
      setRaw(data.entries as NatEntry[]);
      refreshCounts();
      toast(caught ? `已标记 ${ids.length} 只` : `已清除 ${ids.length} 只标记`, "success");
    } catch (err) {
      toast("批量操作失败：" + (err as Error).message, "error");
    }
  }

  function onCardClick(e: NatEntry): void {
    if (markMode) {
      void toggle(e);
      return;
    }
    location.hash = `#/pokemon/${e.species_id}?national=1`;
  }

  return (
    <div className="pkt-page">
      <div className="page-head">
        <span className="page-title">全国图鉴 · 收集追踪</span>
        <div className="dex-progress">
          <svg width="52" height="52" viewBox="0 0 52 52">
            <circle cx="26" cy="26" r="22" fill="none" stroke="#e4e8f0" strokeWidth="6" />
            <circle
              cx="26"
              cy="26"
              r="22"
              fill="none"
              stroke="#67c23a"
              strokeWidth="6"
              strokeDasharray={`${((138.2 * progressPct) / 100).toFixed(1)} 138.2`}
              strokeLinecap="round"
              transform="rotate(-90 26 26)"
            />
            <text x="26" y="30" textAnchor="middle" fontSize="12" fill="#555">
              {progressPct}%
            </text>
          </svg>
          <div className="dex-progress-txt">
            <b>
              {caughtCount}/{total}
            </b>
            <br />
            <span style={{ color: "#98a1b3", fontSize: 12 }}>已收集 / 全物种</span>
          </div>
        </div>
        <div className="spacer" />
        <span className="muted-13" style={{ marginRight: 10 }}>
          与各地区图鉴自动同步
        </span>
        <span className="mark-mode">
          <span className="lbl">标记模式</span>
          <label className="pkt-switch">
            <input
              type="checkbox"
              checked={markMode}
              onChange={(e) => setMarkMode(e.target.checked)}
            />
            <span className="slider" />
          </label>
        </span>
        <div className="pkt-dropdown">
          <button className="pkt-btn primary-plain pkt-btn-sm">批量操作 ▾</button>
          <div className="pkt-dropdown-menu">
            <div
              onClick={() =>
                void bulkSet(
                  entries.map((e) => e.species_id),
                  true,
                  "标记当前筛选",
                )
              }
            >
              标记当前筛选（{entries.length} 只）
            </div>
            <div
              onClick={() =>
                void bulkSet(
                  entries.map((e) => e.species_id),
                  false,
                  "清除当前筛选标记",
                )
              }
            >
              清除当前筛选标记（{entries.length} 只）
            </div>
            <div
              className="divided"
              onClick={() =>
                void bulkSet(
                  raw.map((e) => e.species_id),
                  true,
                  "标记全部物种",
                )
              }
            >
              标记全部物种（{total} 只）
            </div>
            <div
              onClick={() => {
                if (!caughtCount) {
                  toast("当前没有已收集的物种");
                  return;
                }
                void bulkSet(
                  raw.filter((e) => e.caught).map((e) => e.species_id),
                  false,
                  `清空全部收集（已收集 ${caughtCount}/${total}）`,
                );
              }}
            >
              清空全部收集
            </div>
          </div>
        </div>
      </div>

      <div className="page-head">
        <div className="pkt-radio-group">
          {(
            [
              ["all", "全部"],
              ["caught", "已收集"],
              ["uncaught", "未收集"],
            ] as const
          ).map(([v, t]) => (
            <button
              key={v}
              className={"pkt-radio" + (filter === v ? " on" : "")}
              onClick={() => setFilter(v)}
            >
              {t}
            </button>
          ))}
        </div>
        <select
          className="pkt-select"
          style={{ width: 110 }}
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
        >
          <option value="">属性</option>
          {TYPE_LIST.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <select
          className="pkt-select"
          style={{ width: 120 }}
          value={badgeFilter}
          onChange={(e) => setBadgeFilter(e.target.value)}
        >
          <option value="">形态类别</option>
          {(Object.keys(BADGE_ZH) as FormBadge[]).map((b) => (
            <option key={b} value={b}>
              {BADGE_ZH[b]}
            </option>
          ))}
        </select>
        <select
          className="pkt-select"
          style={{ width: 120 }}
          value={genFilter}
          onChange={(e) => setGenFilter(e.target.value)}
        >
          <option value="">世代</option>
          {GEN_ZH.map((g, i) => (
            <option key={i + 1} value={String(i + 1)}>
              第{g}世代
            </option>
          ))}
        </select>
        <input
          className="pkt-input"
          style={{ width: 180 }}
          placeholder="搜索名称/编号"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <div className="spacer" />
        <span className="muted-13">显示 {entries.length} 只</span>
      </div>

      <div className={"dex-grid" + (loading ? " loading" : "")}>
        {entries.map((e) => (
          <div
            key={e.species_id}
            className={"dex-card" + (markMode ? " markable" : "")}
            onClick={() => onCardClick(e)}
          >
            <div className="card-top">
              <span className="ndex">#{String(e.ndex).padStart(4, "0")}</span>
              <PokeToggle caught={e.caught} onToggle={() => void toggle(e)} />
            </div>
            <PokeImg formId={e.form_id} size={88} />
            <div className="pname">{e.name_zh}</div>
            <div className="en">{e.name_en}</div>
            <TypeBadge types={e.types} />
            {e.badges.length > 0 && (
              <div className="nat-badges">
                {e.badges.map((b) => (
                  <span key={b} className={"nat-badge nb-" + b}>
                    {BADGE_ZH[b]}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
        {!loading && !entries.length && (
          <div className="empty-hint" style={{ gridColumn: "1/-1", padding: 40 }}>
            没有符合条件的宝可梦
          </div>
        )}
      </div>
    </div>
  );
}
