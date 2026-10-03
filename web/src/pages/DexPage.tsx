/* 地区图鉴页（自 Vue dex.js 迁移）：卡片 + 精灵球捕捉交互 + 批量操作 + 进度环 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { apiGet, apiSend } from "../data/api";
import { stateCounts } from "../state/user";
import {
  loadGames,
  TYPE_LIST,
  TypeBadge,
  PokeToggle,
  PokeImg,
  toast,
  confirmBox,
  type GameRow,
} from "../pkt/shared";

interface DexEntry {
  ndex: number;
  species_id: number;
  name_zh: string;
  name_en: string;
  types: string;
  form_id: number;
  caught: boolean;
}

/* U18：进出详情保持图鉴滚动位置（按 gameId+dex 记忆，模块级跨挂载存活） */
const dexScrollMem: Record<string, number> = {};

export function DexPage({ gameId }: { gameId: string }): JSX.Element {
  const [game, setGameRow] = useState<GameRow | null>(null);
  const [dexId, setDexId] = useState("");
  const [filter, setFilter] = useState<"all" | "caught" | "uncaught">("all");
  const [typeFilter, setTypeFilter] = useState("");
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [raw, setRaw] = useState<DexEntry[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [markMode, setMarkMode] = useState(false);

  /* 记录滚动 + 挂载时恢复（数据渲染后再恢复一次，防高度不足被钳在顶部） */
  useEffect(() => {
    const el = document.querySelector(".game-main");
    if (!el) return;
    const key = gameId + ":" + dexId;
    const onScroll = () => {
      dexScrollMem[key] = el.scrollTop;
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    el.scrollTop = dexScrollMem[key] || 0;
    return () => el.removeEventListener("scroll", onScroll);
  }, [gameId, dexId]);
  useEffect(() => {
    if (loading || !raw.length) return;
    const el = document.querySelector(".game-main");
    if (!el) return;
    const target = dexScrollMem[gameId + ":" + dexId] || 0;
    el.scrollTop = target;
    /* 精灵图懒加载使内容高度后变，位置会被钳住——短周期重锚定，用户主动滚动即停 */
    const stopPin = () => {
      window.clearInterval(iv);
      window.removeEventListener("wheel", stopPin);
      window.removeEventListener("touchstart", stopPin);
    };
    const iv = window.setInterval(() => {
      if (document.querySelector(".game-main") === el) el.scrollTop = target;
    }, 250);
    window.addEventListener("wheel", stopPin, { passive: true, once: true });
    window.addEventListener("touchstart", stopPin, { passive: true, once: true });
    window.setTimeout(stopPin, 2000);
    return () => stopPin();
  }, [loading, raw.length, gameId, dexId]);

  /* 初始化当前图鉴 tab：hash 参数 > sessionStorage > 第一个 */
  const initDex = useCallback((g: GameRow | null) => {
    setDexId((cur) => {
      if (cur || !g || !g.dexes.length) return cur;
      const fromHash = new URLSearchParams(location.hash.split("?")[1] || "").get("dex");
      const saved = sessionStorage.getItem("poketools-dex-" + g.id);
      const valid = (id: string | null) => id && g.dexes.some((x) => x.id === id);
      return valid(fromHash) ? fromHash! : valid(saved) ? saved! : g.dexes[0]!.id;
    });
  }, []);

  useEffect(() => {
    let alive = true;
    loadGames().then((gs) => {
      if (!alive) return;
      const g = gs.find((x) => x.id === gameId) || null;
      setGameRow(g);
      initDex(g);
    });
    return () => {
      alive = false;
    };
  }, [gameId, initDex]);

  const refreshCounts = useCallback(() => {
    setCounts(stateCounts());
  }, []);

  useEffect(() => {
    if (!dexId) return;
    sessionStorage.setItem("poketools-dex-" + gameId, dexId);
    let alive = true;
    setLoading(true);
    apiGet("/api/dex/" + dexId)
      .then((data) => {
        if (!alive) return;
        setRaw(data.entries as DexEntry[]);
        refreshCounts();
      })
      .catch(() => {
        /* 计数失败不阻塞 */
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [dexId, gameId, refreshCounts]);

  const entries = useMemo(() => {
    let list = raw;
    if (filter === "caught") list = list.filter((e) => e.caught);
    if (filter === "uncaught") list = list.filter((e) => !e.caught);
    if (typeFilter) list = list.filter((e) => e.types.split(",").includes(typeFilter));
    const kw = q.trim().toLowerCase();
    if (kw)
      list = list.filter(
        (e) =>
          e.name_zh.toLowerCase().includes(kw) ||
          (e.name_en || "").toLowerCase().includes(kw) ||
          String(e.ndex) === kw.replace(/^#/, ""),
      );
    return list;
  }, [raw, filter, typeFilter, q]);

  const curDex = useMemo(
    () => (game ? game.dexes.find((d) => d.id === dexId) || null : null),
    [game, dexId],
  );
  const progressPct = curDex ? Math.round(((counts[dexId] || 0) / curDex.total) * 100) : 0;

  async function toggle(e: DexEntry): Promise<void> {
    const prev = e.caught;
    setRaw((rows) =>
      rows.map((x) => (x.species_id === e.species_id ? { ...x, caught: !prev } : x)),
    );
    try {
      await apiSend("PUT", "/api/state", {
        profile_id: 1,
        dex_id: dexId,
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
    const ok = confirmBox(`${label}：将影响 ${ids.length} 只宝可梦（同游戏各图鉴将自动同步）`);
    if (!ok) return;
    try {
      await apiSend("POST", "/api/state/bulk", {
        profile_id: 1,
        dex_id: dexId,
        caught,
        species_ids: ids,
      });
      const data = await apiGet("/api/dex/" + dexId);
      setRaw(data.entries as DexEntry[]);
      refreshCounts();
      toast(caught ? `已标记 ${ids.length} 只` : `已清除 ${ids.length} 只标记`, "success");
    } catch (err) {
      toast("批量操作失败：" + (err as Error).message, "error");
    }
  }

  function onCardClick(e: DexEntry): void {
    if (markMode) {
      void toggle(e);
      return;
    }
    location.hash = `#/pokemon/${e.species_id}?game=${gameId}&dex=${dexId}`;
  }

  return (
    <div className="pkt-page">
      <div className="page-head">
        <span className="page-title">{game ? game.name_zh : ""} · 图鉴追踪</span>
        {game && (
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
                {counts[dexId] || 0}/{curDex ? curDex.total : 0}
              </b>
              <br />
              <span style={{ color: "#98a1b3", fontSize: 12 }}>已捕捉 / 总数</span>
            </div>
          </div>
        )}
        <div className="spacer" />
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
                  "标记整本图鉴",
                )
              }
            >
              标记整本图鉴（{curDex ? curDex.total : 0} 只）
            </div>
            <div
              onClick={() => {
                const n = counts[dexId] || 0;
                if (!n) {
                  toast("当前图鉴没有已标记的宝可梦");
                  return;
                }
                void bulkSet(
                  raw.filter((e) => e.caught).map((e) => e.species_id),
                  false,
                  `清空整本图鉴（已捕捉 ${n}/${curDex ? curDex.total : 0}）`,
                );
              }}
            >
              清空整本图鉴
            </div>
          </div>
        </div>
      </div>

      {game && (
        <div className="dex-tabs">
          {game.dexes.map((d) => (
            <div
              key={d.id}
              className={"dex-tab" + (d.id === dexId ? " active" : "")}
              onClick={() => setDexId(d.id)}
            >
              {d.name_zh}
              <span className="cnt">
                {counts[d.id] || 0}/{d.total}
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="page-head">
        <div className="pkt-radio-group">
          {(
            [
              ["all", "全部"],
              ["caught", "已捕捉"],
              ["uncaught", "未捕捉"],
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
