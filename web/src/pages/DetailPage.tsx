/* 宝可梦详情页（自 Vue detail.js 迁移；含 U4 修复语义、U6 攻击面徽章定宽、U7 能力卡移左栏） */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiGet } from "../data/api";
import {
  loadGames,
  loadTypeChart,
  defenseMultipliers,
  formDisplayName,
  TypeBadge,
  MoveClassBadge,
  PokeImg,
  EvBadges,
  FlavorList,
  GetMethodList,
  AbilityList,
  EvoChain,
  STAT_KEYS,
  STAT_ZH,
  Modal,
  type GameRow,
} from "../pkt/shared";

const SEC_CHIPS = [
  { key: "basic", label: "基本", sel: "#sec-basic" },
  { key: "ability", label: "能力", sel: "#sec-ability" },
  { key: "get", label: "获取", sel: "#sec-get" },
  { key: "moves", label: "招式", sel: "#sec-moves" },
];

export function DetailPage({
  speciesId,
  query,
}: {
  speciesId: number;
  query: URLSearchParams;
}): JSX.Element {
  const [loading, setLoading] = useState(true);
  const [d, setD] = useState<any>(null);
  const [formId, setFormId] = useState<number | null>(null);
  const [moves, setMoves] = useState<any>(null);
  const [tab, setTab] = useState("level");
  const [natures, setNatures] = useState<any[]>([]);
  const [effMode, setEffMode] = useState<"defend" | "attack">("defend");
  const [activeSec, setActiveSec] = useState("basic");
  const [game, setGameRow] = useState<GameRow | null>(null);
  const [expandedTm, setExpandedTm] = useState<Record<number, boolean>>({});

  /* 生蛋链弹层 */
  const [chainDlg, setChainDlg] = useState(false);
  const [chainLoading, setChainLoading] = useState(false);
  const [chains, setChains] = useState<any>(null);
  const [chainTitle, setChainTitle] = useState("");

  const gameId = query.get("game") || "";
  const backParams = useRef(query);

  /* ---- U4 修复语义：appliedFormId 跳过 load 自身触发的 watch 联动 ---- */
  const appliedFormId = useRef<number | null>(null);

  /* ---- 能力值计算器状态 ---- */
  const [sc, setSc] = useState({
    level: 50,
    nature: "hardy",
    ev: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 } as Record<string, number>,
    iv: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 } as Record<string, number>,
  });

  /* ---- 图鉴内翻页导航 ---- */
  const [navList, setNavList] = useState<number[]>([]);
  const navIdx = navList.indexOf(speciesId);
  const prevId = navIdx > 0 ? navList[navIdx - 1]! : 0;
  const nextId = navIdx >= 0 && navIdx < navList.length - 1 ? navList[navIdx + 1]! : 0;

  const noAbilities = gameId === "legends-arceus" || gameId === "legends-za";

  useEffect(() => {
    let alive = true;
    loadGames().then((gs) => {
      if (alive) setGameRow(gs.find((g) => g.id === gameId) || null);
    });
    loadTypeChart().catch(() => {});
    return () => {
      alive = false;
    };
  }, [gameId]);

  const loadMovesFor = useCallback(
    async (sid: number, fid: number | null, gid: string) => {
      if (!gid) {
        setMoves(null);
        return;
      }
      try {
        const res = await apiGet(`/api/pokemon/${sid}/moves`, {
          game: gid,
          form_id: fid || undefined,
        });
        setMoves(res);
        if (res.tabs.length && !res.tabs.some((t: any) => t.key === tab)) {
          setTab(res.tabs[0].key);
        }
      } catch {
        setMoves(null);
      }
    },
    [tab],
  );

  useEffect(() => {
    let alive = true;
    setLoading(true);
    (async () => {
      try {
        const data = await apiGet(`/api/pokemon/${speciesId}`, {
          game: gameId || undefined,
          form: query.get("form") || undefined,
          dex: backParams.current.get("dex") || undefined,
        });
        if (!alive) return;
        setD(data);
        const wantSuffix = data.selected_suffix || "";
        const want = wantSuffix
          ? data.forms.find((f: any) => (f.identifier || "").endsWith("-" + wantSuffix))
          : null;
        appliedFormId.current = (want || data.default_form || data.forms[0] || {}).id || null;
        setFormId(appliedFormId.current);
        await Promise.all([
          loadMovesFor(speciesId, appliedFormId.current, gameId),
          (async () => {
            if (!natures.length) setNatures(await apiGet("/api/meta/natures"));
          })(),
        ]);
      } catch {
        if (alive) setD(null);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [speciesId, gameId, query.get("dex"), query.get("form")]);

  /* 图鉴导航列表 + 回顶 */
  useEffect(() => {
    const dex = backParams.current.get("dex");
    if (!dex) {
      setNavList([]);
      return;
    }
    apiGet("/api/dex/" + dex)
      .then((data) => {
        setNavList((data.entries as any[]).map((e) => e.species_id));
      })
      .catch(() => {
        /* 导航缺失不影响详情 */
      });
    document.querySelector(".game-main")?.scrollTo({ top: 0, behavior: "smooth" });
  }, [speciesId]);

  /* 切换形态：招式表重载；后缀变化时详情重载（获取方式/进化链按形态过滤） */
  const onFormChange = (fid: number) => {
    if (fid === appliedFormId.current) return;
    setFormId(fid);
    const f = (d.forms || []).find((x: any) => x.id === fid);
    const ident = (f && f.identifier) || "";
    const suffix = f && f.is_default ? "" : ident.split("-").slice(1).join("-");
    const curSuffix = d.selected_suffix || "";
    if (suffix !== curSuffix) {
      /* 形态专属内容重载（非冗余：过滤条件不同） */
      void (async () => {
        const data = await apiGet(`/api/pokemon/${speciesId}`, {
          game: gameId || undefined,
          form: suffix || undefined,
          dex: backParams.current.get("dex") || undefined,
        });
        setD(data);
        appliedFormId.current = fid;
      })();
    }
    void loadMovesFor(speciesId, fid, gameId);
  };

  const curForm = useMemo(() => {
    if (!d) return { types: "", ability_list: [], height: 0, weight: 0, id: 0 } as any;
    return d.forms.find((f: any) => f.id === formId) || d.default_form;
  }, [d, formId]);
  const curFlavor = useMemo(() => {
    if (!d) return [];
    const ff = d.form_flavor || {};
    return ff[curForm.id] || d.flavor;
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
  const curDex = useMemo(() => {
    if (!d || !game) return null;
    return d.dex_list.find((x: any) => x.game_id === game.id) || null;
  }, [d, game]);
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
  const STAT_BAR_COLOR = "#5a9be0";

  /* ---- 属性相性 ---- */
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
    const chart = (window as any).__pktChart;
    if (!chart) return [];
    const groups: Record<string, string[]> = {};
    for (const def of chart.types) {
      const m = (chart.chart[t] || {})[def] ?? 1;
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

  function goBack(): void {
    if (gameId) {
      location.hash =
        `#/game/${gameId}/dex` +
        (backParams.current.get("dex") ? `?dex=${backParams.current.get("dex")}` : "");
    } else {
      location.hash = "#/home";
    }
  }
  function goNeighbor(id: number): void {
    if (!id) return;
    const dex = backParams.current.get("dex");
    location.hash = `#/pokemon/${id}?game=${gameId}` + (dex ? `&dex=${dex}` : "");
  }
  function scrollSec(sec: (typeof SEC_CHIPS)[number]): void {
    setActiveSec(sec.key);
    const el = document.querySelector(sec.sel);
    if (el) el.scrollIntoView({ behavior: "instant" as ScrollBehavior, block: "start" });
  }
  async function showChains(row: any): Promise<void> {
    setChainDlg(true);
    setChainLoading(true);
    setChains(null);
    setChainTitle(`生蛋链：「${row.name_zh}」 → ${d.species.name_zh}`);
    try {
      setChains(
        await apiGet("/api/breed-chains", {
          species_id: speciesId,
          move_id: row.move_id,
          game: gameId,
        }),
      );
    } finally {
      setChainLoading(false);
    }
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

  return (
    <div className={"pkt-page" + (loading ? " loading" : "")}>
      <div className="page-head">
        <button className="pkt-btn pkt-btn-sm" onClick={goBack}>
          ← 返回图鉴
        </button>
        {navList.length > 0 && (
          <>
            <button
              className="pkt-btn pkt-btn-sm"
              disabled={!prevId}
              onClick={() => goNeighbor(prevId)}
            >
              ← 上一只
            </button>
            <button
              className="pkt-btn pkt-btn-sm"
              disabled={!nextId}
              onClick={() => goNeighbor(nextId)}
            >
              下一只 →
            </button>
          </>
        )}
        {game && <span className="pkt-chip">{game.name_zh}</span>}
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
          {curForm && !curForm.is_default && d.default_form && (
            <button
              className="pkt-btn pkt-btn-sm plain"
              style={{ alignSelf: "center" }}
              onClick={() => onFormChange(d.default_form.id)}
            >
              还原默认形态
            </button>
          )}
        </div>
      )}

      <div className="detail-cols">
        {/* 左栏：头部 / 图鉴介绍 / 特性 / 属性相性 / 种族值与能力值（U7 移入左栏） */}
        <div className="dcol">
          <div className="detail-head" id="sec-basic">
            <div className="detail-art">
              <PokeImg formId={curForm.id} size={176} />
            </div>
            <div className="meta">
              <div className="names">
                <h2>{d.species.name_zh}</h2>
                <span className="en">{d.species.name_en}</span>
                <span className="en">#{String(d.species.id).padStart(4, "0")}</span>
              </div>
              <div
                style={{
                  marginTop: 8,
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  flexWrap: "wrap",
                }}
              >
                <TypeBadge types={curForm.types} />
                <span className="pkt-chip">{d.species.genus_zh}</span>
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
              {curDex ? (
                <div className="kv">
                  <span className="pkt-chip success">
                    {game!.name_zh}·{curDex.dex_zh} #{curDex.ndex}
                  </span>
                </div>
              ) : (
                d.dex_list.length > 0 && (
                  <div className="kv">
                    <span>
                      <b>图鉴收录：</b>
                      {d.dex_list.map((x: any) => (
                        <span key={x.dex_id} className="pkt-chip" style={{ marginRight: 6 }}>
                          {x.game_zh}·{x.dex_zh} #{x.ndex}
                        </span>
                      ))}
                    </span>
                  </div>
                )
              )}
            </div>
          </div>

          <div className="block">
            <h3>图鉴介绍{game ? `（${game.name_zh}）` : ""}</h3>
            <FlavorList flavor={curFlavor} />
          </div>

          {!noAbilities && (
            <div className="block">
              <h3>特性</h3>
              <AbilityList abilities={curForm.ability_list} />
            </div>
          )}

          <div className="block">
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
                    {/* U6：攻击面属性徽章固定宽 70px 内容居中 */}
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

          {/* U7：种族值与能力值卡（自右栏移至左栏末，锚点同步保留 #sec-ability） */}
          <div className="block" id="sec-ability">
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
                    <div
                      className="stat-fill"
                      style={{ width: pct(baseStats[k]), background: STAT_BAR_COLOR }}
                    />
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
                    onChange={(e) =>
                      setSc({ ...sc, ev: { ...sc.ev, [k]: Number(e.target.value) } })
                    }
                  />
                  <span className="mini">个体值</span>
                  <input
                    type="number"
                    className="pkt-input w96"
                    min={0}
                    max={31}
                    value={sc.iv[k]}
                    onChange={(e) =>
                      setSc({ ...sc, iv: { ...sc.iv, [k]: Number(e.target.value) } })
                    }
                  />
                  <span className="mini result">
                    = <b>{computedStats[k] ?? "—"}</b>
                  </span>
                </div>
              ))}
            </details>
          </div>
        </div>

        {/* 右栏：进化链 / 获取方式 / 招式表 */}
        <div className="dcol">
          <div className="block">
            <h3>进化链</h3>
            <EvoChain evo={d.evolution} current={speciesId} gameId={gameId} />
          </div>

          <div className="block" id="sec-get">
            <h3>获取方式{game ? `（${game.name_zh}）` : ""}</h3>
            <GetMethodList rows={d.get_methods} extra={d.encounters_api} />
          </div>

          <div className="block" id="sec-moves">
            <h3>招式表{game ? `（${game.name_zh}）` : ""}</h3>
            {moves && (
              <>
                <div className="pkt-tabs">
                  {moves.tabs.map((t: any) => (
                    <button
                      key={t.key}
                      className={"pkt-tab" + (tab === t.key ? " on" : "")}
                      onClick={() => setTab(t.key)}
                    >
                      {t.label} ({(moves.groups[t.key] || []).length})
                    </button>
                  ))}
                </div>
                <div className="pkt-table-wrap" style={{ maxHeight: 480, overflow: "auto" }}>
                  <table className="pkt-table pkt-table-sm">
                    <thead>
                      <tr>
                        {(tab === "level" || tab === "evolution-recall") && (
                          <th style={{ width: 96 }}>等级</th>
                        )}
                        {tab === "machine" && <th style={{ width: 44 }} />}
                        {tab === "machine" && <th style={{ width: 140 }}>编号</th>}
                        <th style={{ minWidth: 120 }}>招式</th>
                        <th style={{ width: 96 }}>属性</th>
                        <th style={{ width: 76 }}>分类</th>
                        <th style={{ width: 66 }}>威力</th>
                        <th style={{ width: 66 }}>命中</th>
                        <th style={{ width: 60 }}>PP</th>
                        <th style={{ width: 70 }}>优先度</th>
                        {tab === "egg" && <th style={{ width: 120 }}>生蛋链</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {(moves.groups[tab] || []).map((row: any) => (
                        <tr key={row.move_id}>
                          {(tab === "level" || tab === "evolution-recall") && (
                            <td>
                              {row.recall ? (
                                <span className="mastery">回忆</span>
                              ) : row.evolution ? (
                                <span className="mastery">进化</span>
                              ) : (
                                <>
                                  Lv.{row.level}
                                  {row.mastery != null && (
                                    <span className="mastery">精通+{row.mastery}</span>
                                  )}
                                </>
                              )}
                            </td>
                          )}
                          {tab === "machine" && (
                            <td>
                              <button
                                className="pkt-btn pkt-btn-sm"
                                onClick={() =>
                                  setExpandedTm((s) => ({ ...s, [row.move_id]: !s[row.move_id] }))
                                }
                              >
                                {expandedTm[row.move_id] ? "▾" : "▸"}
                              </button>
                            </td>
                          )}
                          {tab === "machine" && (
                            <td>
                              {(row.tm || []).map((t2: any) => (
                                <span
                                  key={t2.number}
                                  className={"pkt-chip " + (t2.kind === "TR" ? "warning" : "info")}
                                  style={{ marginRight: 4 }}
                                >
                                  {t2.kind}
                                  {String(t2.number).padStart(3, "0")}
                                </span>
                              ))}
                              {expandedTm[row.move_id] && (
                                <div className="tm-how-list">
                                  {(row.tm || []).map((t2: any) => (
                                    <div key={t2.number} className="tm-how">
                                      <b>
                                        {t2.kind} {String(t2.number).padStart(3, "0")}
                                      </b>
                                      {t2.how && (
                                        <>
                                          <br />
                                          获取：{t2.how}
                                        </>
                                      )}
                                      {t2.materials && (
                                        <>
                                          <br />
                                          制作材料：{t2.materials}
                                        </>
                                      )}
                                      {!t2.how && !t2.materials && (
                                        <>
                                          <br />
                                          获取方式待补充
                                        </>
                                      )}
                                    </div>
                                  ))}
                                  {!(row.tm || []).length && (
                                    <div className="tm-how">获取方式待补充</div>
                                  )}
                                </div>
                              )}
                            </td>
                          )}
                          <td>{row.name_zh}</td>
                          <td>
                            <TypeBadge types={row.type_zh} />
                          </td>
                          <td>
                            <MoveClassBadge cls={row.damage_class} />
                          </td>
                          <td>{row.power ?? "—"}</td>
                          <td>{row.accuracy ?? "—"}</td>
                          <td>{row.pp}</td>
                          <td>{row.priority > 0 ? "+" + row.priority : row.priority}</td>
                          {tab === "egg" && (
                            <td>
                              <button
                                className="pkt-btn pkt-btn-sm primary-plain"
                                onClick={() => void showChains(row)}
                              >
                                计算繁殖链
                              </button>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {tab === "egg" && !moves.has_breeding && (
                  <div className="empty-hint">
                    当前游戏没有生蛋孵化机制（{game ? game.name_zh : ""}）
                  </div>
                )}
              </>
            )}
            {!moves && <div className="empty-hint">招式表加载中…</div>}
          </div>
        </div>
      </div>

      {/* 生蛋链弹层 */}
      <Modal open={chainDlg} title={chainTitle} width={720} onClose={() => setChainDlg(false)}>
        {chainLoading ? (
          <div className="empty-hint" style={{ padding: 30 }}>
            计算中…
          </div>
        ) : chains?.ok ? (
          <>
            <div className="pkt-alert info">
              最短需 {chains.min_length} 次繁殖，共找到 {chains.chain_count} 条最短路线
            </div>
            {chains.chains.slice(0, 30).map((c: any, i: number) => (
              <div key={i} className="block" style={{ marginBottom: 10 }}>
                <div className="chain-step">
                  <div className="chain-box">
                    <div className="nm">{c.steps[0].from.name}</div>
                    <div className="sub">{c.steps[0].from.learn}</div>
                  </div>
                  {c.steps.map((s: any, j: number) => (
                    <div key={j} style={{ display: "contents" }}>
                      <div className="chain-arrow">→</div>
                      <div
                        className={"chain-box" + (j === c.steps.length - 1 ? " chain-target" : "")}
                      >
                        <div className="nm">{s.to.name}</div>
                        <div className="sub">
                          {j === c.steps.length - 1
                            ? `同蛋组：${s.shared_groups.join("、")}`
                            : `${s.to.learn}；同蛋组：${s.shared_groups.join("、")}`}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            <div style={{ fontSize: 12, color: "#999" }}>
              {chains.note}
              {chains.truncated ? "（仅展示前 30 条）" : ""}
            </div>
          </>
        ) : chains ? (
          <div className="pkt-alert warn">{chains.reason}</div>
        ) : null}
      </Modal>
    </div>
  );
}
