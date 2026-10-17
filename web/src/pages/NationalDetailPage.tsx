/* 全国图鉴·单只宝可梦详情页（national 语境专用布局）
   与地区图鉴 DetailPage 完全隔离：独立组件 + nd- 前缀样式，不触碰 DetailPage 与
   地区图鉴既有样式；共享的只有纯展示组件（PokeImg/TypeBadge/AbilityList/EvoChain 等）
   与数据层。布局目标：中轴英雄卡 + 双栏均衡（左=种族值/能力值，右=进化/特性/相性）
   + 全宽图鉴介绍，消除旧两栏"左重右轻"。 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { apiGet, STAT_KEYS, STAT_ZH } from "../data/api";
import { TYPES, CHART } from "../data/damage";
import {
  formDisplayName,
  TypeBadge,
  PokeImg,
  EvBadges,
  FlavorList,
  AbilityList,
  EvoChain,
  defenseMultipliers,
  loadTypeChart,
} from "../components/shared";

/** 移动端分段锚点（基本/种族值/进化·特性/相性/图鉴介绍） */
const SEC_CHIPS = [
  { key: "basic", label: "基本", sel: "#nd-basic" },
  { key: "stats", label: "种族值", sel: "#nd-stats" },
  { key: "evo", label: "进化·特性", sel: "#nd-evo" },
  { key: "eff", label: "相性", sel: "#nd-eff" },
  { key: "flavor", label: "图鉴介绍", sel: "#nd-flavor" },
];

const FLAVOR_PREVIEW = 8;

export function NationalDetailPage({
  speciesId,
  query,
}: {
  speciesId: number;
  query: URLSearchParams;
}): JSX.Element {
  const [loading, setLoading] = useState(true);
  const [d, setD] = useState<any>(null);
  const [formId, setFormId] = useState<number | null>(null);
  const [natures, setNatures] = useState<any[]>([]);
  const [effMode, setEffMode] = useState<"defend" | "attack">("defend");
  const [flavorOpen, setFlavorOpen] = useState(false);
  const [activeSec, setActiveSec] = useState("basic");

  /* 能力值计算器（national 版：与 DetailPage 同公式，独立实现避免联动地区页） */
  const [sc, setSc] = useState({
    level: 50,
    nature: "hardy",
    ev: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 } as Record<string, number>,
    iv: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 } as Record<string, number>,
  });

  useEffect(() => {
    let alive = true;
    loadTypeChart().catch(() => {}); // 属性相性（抗击面）依赖异步加载的相性表
    (async () => {
      try {
        const data = await apiGet(`/api/pokemon/${speciesId}`, {
          form: query.get("form") || undefined,
        });
        if (!alive) return;
        const wantSuffix = data.selected_suffix || "";
        const want = wantSuffix
          ? data.forms.find((f: any) => (f.identifier || "").endsWith("-" + wantSuffix))
          : null;
        setD(data);
        setFormId((want || data.default_form || data.forms[0] || {}).id || null);
      } catch {
        if (alive) setD(null);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    document.querySelector(".game-main")?.scrollTo({ top: 0, behavior: "smooth" });
    return () => {
      alive = false;
    };
  }, [speciesId, query.get("form")]);

  useEffect(() => {
    let alive = true;
    if (!natures.length) {
      apiGet("/api/meta/natures")
        .then((ns) => alive && setNatures(ns))
        .catch(() => {});
    }
    return () => {
      alive = false;
    };
  }, [natures.length]);

  /* 切换形态：后缀变化时详情重载（进化链/形态专属数值按形态过滤） */
  const onFormChange = (fid: number) => {
    if (fid === formId || !d) return;
    setFormId(fid);
    const f = (d.forms || []).find((x: any) => x.id === fid);
    const ident = (f && f.identifier) || "";
    const suffix = f && f.is_default ? "" : ident.split("-").slice(1).join("-");
    if (suffix !== (d.selected_suffix || "")) {
      void (async () => {
        const data = await apiGet(`/api/pokemon/${speciesId}`, { form: suffix || "base" });
        setD(data);
      })();
    }
  };

  const curForm = useMemo(() => {
    if (!d) return { types: "", ability_list: [], height: 0, weight: 0, id: 0 } as any;
    return d.forms.find((f: any) => f.id === formId) || d.default_form;
  }, [d, formId]);
  const curFlavor = useMemo(() => {
    if (!d) return [];
    const ff = d.form_flavor || {};
    return ff[curForm.id] || d.flavor || [];
  }, [d, curForm]);
  const curEv = useMemo(() => {
    const f = curForm;
    const pick = (k: string) => (f["ev_" + k] != null ? f["ev_" + k] : (d?.ev || {})[k] || 0);
    return {
      hp: pick("hp"),
      atk: pick("atk"),
      def: pick("def"),
      spa: pick("spa"),
      spd: pick("spd"),
      spe: pick("spe"),
    };
  }, [curForm, d]);
  const baseStats = useMemo((): Record<string, number> => {
    const f = curForm;
    if (!f || f.hp == null) return {};
    return { hp: f.hp, atk: f.atk, def: f.def, spa: f.spa, spd: f.spd, spe: f.spe };
  }, [curForm]);
  const statSum = useMemo(
    () => Object.values(baseStats).reduce((a, b) => a + (b || 0), 0),
    [baseStats],
  );

  const natureMult = useCallback(
    (k: string) => {
      const n = natures.find((x) => x.identifier === sc.nature);
      if (!n || !n.up || n.up === n.down) return 1.0;
      if (n.up === k) return 1.1;
      if (n.down === k) return 0.9;
      return 1.0;
    },
    [natures, sc.nature],
  );
  const computedStats = useMemo(() => {
    const b = baseStats,
      L = sc.level;
    const out: Record<string, number> = {};
    if (b.hp == null) return out;
    out.hp =
      b.hp === 1
        ? 1
        : Math.floor(((2 * b.hp + sc.iv.hp! + Math.floor(sc.ev.hp! / 4)) * L) / 100) + L + 10;
    for (const k of ["atk", "def", "spa", "spd", "spe"]) {
      const v = Math.floor(((2 * b[k]! + sc.iv[k]! + Math.floor(sc.ev[k]! / 4)) * L) / 100) + 5;
      out[k] = Math.floor(v * natureMult(k));
    }
    return out;
  }, [baseStats, sc, natureMult]);
  const evSum = useMemo(() => Object.values(sc.ev).reduce((a, b) => a + b, 0), [sc.ev]);

  function rangeOf(k: string): string {
    const b = baseStats[k];
    if (b == null) return "—";
    const L = sc.level;
    if (k === "hp") {
      if (b === 1) return "1";
      const lo = Math.floor(((2 * b + 31) * L) / 100) + L + 10;
      const hi = Math.floor(((2 * b + 31 + 63) * L) / 100) + L + 10;
      return `${lo}~${hi}`;
    }
    const lo = Math.floor((Math.floor(((2 * b + 31) * L) / 100) + 5) * 0.9);
    const hi = Math.floor((Math.floor(((2 * b + 31 + 63) * L) / 100) + 5) * 1.1);
    return `${lo}~${hi}`;
  }
  function pct(v?: number): string {
    return Math.min(100, ((v || 0) / 255) * 100) + "%";
  }

  /* ---- 属性相性（同 DetailPage 公式，独立实现） ---- */
  const myTypes = useMemo(() => (curForm.types || "").split(",").filter(Boolean), [curForm]);
  const effGroups = useMemo(() => {
    if (!myTypes.length) return null;
    const mult = defenseMultipliers(myTypes);
    if (!mult) return null;
    const groups: Record<string, string[]> = {};
    for (const [atk, m] of Object.entries(mult)) {
      const key = String(m);
      (groups[key] = groups[key] || []).push(atk);
    }
    const order = ["4", "2", "1", "0.5", "0.25", "0"];
    return order.filter((k) => groups[k]).map((k) => ({ m: k, types: groups[k]! }));
  }, [myTypes]);
  function atkGroupsOf(t: string) {
    const groups: Record<string, string[]> = {};
    for (const def of TYPES) {
      const m = (CHART[t] || {})[def] ?? 1;
      const key = String(m);
      (groups[key] = groups[key] || []).push(def);
    }
    const order = ["2", "0.5", "0"];
    return order.filter((k) => groups[k]).map((k) => ({ m: k, types: groups[k]! }));
  }
  function effClass(mm: string): string {
    if (mm === "4" || mm === "2") return "bad";
    if (mm === "1") return "neutral";
    if (mm === "0") return "immune";
    return "good";
  }

  function scrollSec(sec: (typeof SEC_CHIPS)[number]): void {
    setActiveSec(sec.key);
    const el = document.querySelector(sec.sel);
    if (el) el.scrollIntoView({ behavior: "instant" as ScrollBehavior, block: "start" });
  }

  if (loading && !d)
    return (
      <div className="pkt-page pkt-loading" style={{ padding: 60, textAlign: "center" }}>
        加载中…
      </div>
    );
  if (!d)
    return (
      <div className="pkt-page empty-hint" style={{ padding: 60 }}>
        未找到该宝可梦
      </div>
    );

  const flavorList = curFlavor || [];
  const flavorShown = flavorOpen ? flavorList : flavorList.slice(0, FLAVOR_PREVIEW);

  return (
    <div className={"pkt-page nd-page" + (loading ? " loading" : "")}>
      <div className="page-head">
        <button
          className="pkt-btn pkt-btn-sm"
          onClick={() => {
            location.hash = "#/national";
          }}
        >
          ← 返回全国图鉴
        </button>
        <span className="pkt-chip">全国图鉴</span>
      </div>

      {/* 移动端分段锚点 */}
      <div className="mobile-sec-chips">
        {SEC_CHIPS.map((sec) => (
          <span
            key={sec.key}
            className={"chip-sec" + (activeSec === sec.key ? " on" : "")}
            onClick={() => scrollSec(sec)}
          >
            {sec.label}
          </span>
        ))}
      </div>

      {/* 形态选择 */}
      {d.forms.length > 1 && (
        <div className="form-strip">
          {d.forms.map((f: any) => (
            <div
              key={f.id}
              className={"form-chip" + (f.id === formId ? " active" : "")}
              onClick={() => onFormChange(f.id)}
            >
              <PokeImg formId={f.id} size={52} />
              {!f.is_default && <span className="fname">{formDisplayName(f)}</span>}
            </div>
          ))}
        </div>
      )}

      {/* 英雄卡：立绘 + 基础信息（全宽，中轴） */}
      <div className="nd-hero" id="nd-basic">
        <div className="detail-art">
          <PokeImg formId={curForm.id} size={192} />
        </div>
        <div className="meta">
          <div className="names">
            <h2>{d.species.name_zh}</h2>
            <span className="en">{d.species.name_en}</span>
            <span className="en ndex">#{String(d.species.id).padStart(4, "0")}</span>
          </div>
          <div className="nd-hero-tags">
            <TypeBadge types={curForm.types} />
            {d.species.genus_zh && <span className="pkt-chip">{d.species.genus_zh}</span>}
            {d.species.shape_zh && <span className="pkt-chip">{d.species.shape_zh}</span>}
            {d.species.egg_groups && d.species.egg_groups !== "未发现" && (
              <span className="pkt-chip">{d.species.egg_groups}</span>
            )}
          </div>
          <div className="kv">
            <span>
              <b>捕获率：</b>
              {d.species.capture_rate}
            </span>
            <span>
              <b>身高/体重：</b>
              {(curForm.height / 10).toFixed(1)}m / {(curForm.weight / 10).toFixed(1)}kg
            </span>
            <span style={{ display: "inline-flex", alignItems: "center" }}>
              <b>击倒努力值：</b>
              <EvBadges ev={curEv} />
            </span>
          </div>
        </div>
      </div>

      {/* 双栏主体：左=种族值/能力值，右=进化链/特性/属性相性 */}
      <div className="nd-cols">
        <div className="nd-col">
          <div className="block" id="nd-stats">
            <div className="page-head" style={{ marginBottom: 6 }}>
              <h3 style={{ margin: 0 }}>种族值与能力值</h3>
              <div className="spacer" />
              <span className="stat-level-lbl">Lv.{sc.level}</span>
            </div>
            <input
              type="range"
              min={1}
              max={100}
              value={sc.level}
              onChange={(e) => setSc({ ...sc, level: Number(e.target.value) })}
              style={{ width: "calc(100% - 12px)", margin: "0 6px" }}
            />
            <div className="stat-rows">
              {STAT_KEYS.map((k) => (
                <div key={k} className="stat-row">
                  <span className="stat-k">{STAT_ZH[k]}</span>
                  <span className="stat-base">{baseStats[k] ?? "—"}</span>
                  <div className="stat-track">
                    <div className="stat-fill" style={{ width: pct(baseStats[k]) }} />
                  </div>
                  <span className="stat-range">{rangeOf(k)}</span>
                  {computedStats[k] != null && (
                    <span className="stat-actual">{computedStats[k]}</span>
                  )}
                </div>
              ))}
            </div>
            <div className="stat-sum">
              种族值合计：<b>{statSum}</b>
              {computedStats.hp != null && (
                <span className="stat-actual-hint">Lv.{sc.level} 实际值以蓝色数字显示</span>
              )}
            </div>
            <details className="sc-details">
              <summary>性格 / 努力值 / 个体值（展开后实时重算）</summary>
              <div className="fld-row">
                <span className="lbl">性格</span>
                <select
                  className="pkt-select"
                  style={{ width: 170 }}
                  value={sc.nature}
                  onChange={(e) => setSc({ ...sc, nature: e.target.value })}
                >
                  {natures.map((n) => (
                    <option key={n.identifier} value={n.identifier}>
                      {n.name_zh}
                      {n.up && n.up !== n.down ? `（+${STAT_ZH[n.up]} -${STAT_ZH[n.down]}）` : ""}
                    </option>
                  ))}
                </select>
                <span style={{ fontSize: 12, color: "#98a1b3", marginLeft: "auto" }}>
                  努力值合计 {evSum}/510
                </span>
              </div>
              {STAT_KEYS.map((k) => (
                <div key={k} className="fld-row">
                  <span className="lbl">{STAT_ZH[k]}</span>
                  <span className="mini">努力值</span>
                  <input
                    type="number"
                    className="pkt-input w96"
                    min={0}
                    max={252}
                    step={4}
                    value={sc.ev[k]}
                    onChange={(e) => setSc({ ...sc, ev: { ...sc.ev, [k]: Number(e.target.value) } })}
                  />
                  <span className="mini">个体值</span>
                  <input
                    type="number"
                    className="pkt-input w96"
                    min={0}
                    max={31}
                    value={sc.iv[k]}
                    onChange={(e) => setSc({ ...sc, iv: { ...sc.iv, [k]: Number(e.target.value) } })}
                  />
                  <span className="mini result">
                    = <b>{computedStats[k] ?? "—"}</b>
                  </span>
                </div>
              ))}
            </details>
          </div>

          <div className="block" id="nd-eff">
            <div className="page-head" style={{ marginBottom: 8 }}>
              <h3 style={{ margin: 0 }}>属性相性</h3>
              <div className="pkt-radio-group">
                <button
                  className={"pkt-radio" + (effMode === "defend" ? " on" : "")}
                  onClick={() => setEffMode("defend")}
                >
                  抗击面
                </button>
                <button
                  className={"pkt-radio" + (effMode === "attack" ? " on" : "")}
                  onClick={() => setEffMode("attack")}
                >
                  攻击面
                </button>
              </div>
            </div>
            {effMode === "defend" ? (
              effGroups ? (
                <div className="eff-groups">
                  {effGroups.map((g) => (
                    <div key={g.m} className="eff-group">
                      <span className={"eff-m " + effClass(g.m)}>×{g.m}</span>
                      <div className="eff-types">
                        {g.types.map((t) => (
                          <TypeBadge key={t} types={t} />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="empty-hint">加载中…</div>
              )
            ) : (
              <>
                {myTypes.map((t: string) => (
                  <div key={t} className="eff-group atk-group">
                    <span className="eff-m atk-src">⚔ {t}</span>
                    <div className="eff-atk-list">
                      {atkGroupsOf(t).map((g) => (
                        <span key={g.m} className="eff-inline">
                          <span className={"eff-m " + effClass(g.m)}>×{g.m}</span>
                          <div className="eff-types">
                            {g.types.map((t2) => (
                              <TypeBadge key={t2} types={t2} plain />
                            ))}
                          </div>
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
                {!myTypes.length && <div className="empty-hint">待补充</div>}
              </>
            )}
          </div>
        </div>

        <div className="nd-col">
          <div className="block" id="nd-evo">
            <h3>进化链</h3>
            <EvoChain evo={d.evolution} current={speciesId} gameId="" extraQuery="national=1" />
          </div>

          <div className="block">
            <h3>特性</h3>
            <AbilityList abilities={curForm.ability_list} />
          </div>
        </div>
      </div>

      {/* 图鉴介绍：全世代收录（全宽，默认收起长列表） */}
      <div className="block nd-flavor" id="nd-flavor">
        <div className="page-head" style={{ marginBottom: 8 }}>
          <h3 style={{ margin: 0 }}>图鉴介绍</h3>
          <span className="muted" style={{ fontSize: 12 }}>
            全世代版本收录
          </span>
        </div>
        <FlavorList flavor={flavorShown} />
        {flavorList.length > FLAVOR_PREVIEW && (
          <button
            className="pkt-btn pkt-btn-sm primary-plain nd-flavor-toggle"
            onClick={() => setFlavorOpen((v) => !v)}
          >
            {flavorOpen ? "收起" : `展开全部（${flavorList.length} 条）`}
          </button>
        )}
      </div>
    </div>
  );
}
