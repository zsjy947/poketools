/* Z-A 甜甜圈工房页（自 Vue donuts.js 迁移：四表 + 我的配方 + 风味加权预览） */
import { useCallback, useEffect, useMemo, useState } from "react";
import { apiGet, apiSend, TYPE_LIST, POWER_COLORS } from "../data/api";
import { MonoIcon, toast, Modal } from "../pkt/shared";

const FLAVOR_NAMES: Record<string, string> = {
  sweet: "甜",
  spicy: "辣",
  sour: "酸",
  bitter: "苦",
  fresh: "鲜",
};
const STAR_THRESHOLDS = [120, 240, 350, 700, 960];

export function DonutsPage(): JSX.Element {
  const [loading, setLoading] = useState(true);
  const [d, setD] = useState<any>(null);
  const [tab, setTab] = useState("special");
  const [berryQ, setBerryQ] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [customList, setCustomList] = useState<any[]>([]);
  const [editorDlg, setEditorDlg] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editor, setEditor] = useState({
    name: "",
    effects: [{ power: "", type: "", level: 1 }],
    ingredients: [] as Array<{ name: string; count: number }>,
  });

  useEffect(() => {
    apiGet("/api/donuts")
      .then(setD)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const loadCustom = useCallback(() => {
    apiGet("/api/custom-recipes", { game: "legends-za" })
      .then(setCustomList)
      .catch(() => setCustomList([]));
  }, []);
  useEffect(() => {
    void loadCustom();
  }, [loadCustom]);

  const filteredBerries = useMemo(
    () => (d ? d.berries.filter((b: any) => !berryQ || b.name.includes(berryQ)) : []),
    [d, berryQ],
  );
  const powerNames = useMemo((): string[] => {
    if (!d) return [];
    const names: string[] = d.flavor_powers.map((f: any) => String(f.power).replace(/·.+/, ""));
    return [...new Set(names)];
  }, [d]);

  function openEditor(): void {
    setEditor({ name: "", effects: [{ power: "", type: "", level: 1 }], ingredients: [] });
    setEditorDlg(true);
  }

  function addBerry(name: string): void {
    if (name && !editor.ingredients.some((x) => x.name === name)) {
      setEditor({ ...editor, ingredients: [...editor.ingredients, { name, count: 1 }] });
    }
  }

  const berryTotal = editor.ingredients.reduce((a, b) => a + b.count, 0);

  function fmtList(v: any): string {
    if (Array.isArray(v)) {
      return v.map((x) => (typeof x === "object" ? `${x.name} ×${x.count}` : x)).join("、");
    }
    return v || "—";
  }

  /* 风味预览：五维求和 → 阈值定★ → 3★ 起产生风味力量 */
  const flavorPreview = useMemo(() => {
    if (!d || !editor.ingredients.length) return null;
    const sums: Record<string, number> = { sweet: 0, spicy: 0, sour: 0, bitter: 0, fresh: 0 };
    for (const it of editor.ingredients) {
      const b = d.berries.find((x: any) => x.name === it.name);
      if (b) for (const k of Object.keys(sums)) sums[k]! += (b[k] || 0) * (it.count || 1);
    }
    const entries: Array<[string, number]> = Object.entries(sums).sort((a, b) => b[1] - a[1]);
    const star = STAR_THRESHOLDS.filter((th) => entries[0]![1] >= th).length;
    const powers: string[] = [];
    if (star >= 3) {
      const zh = FLAVOR_NAMES[entries[0]![0]]!;
      const seen = new Set<string>();
      for (const fp of d.flavor_powers) {
        if (fp.flavor === zh && !seen.has(fp.power)) {
          seen.add(fp.power);
          powers.push(fp.power);
        }
      }
    }
    return { sums: entries, star, maxFlavor: entries[0]![0], second: entries[1]!, powers };
  }, [d, editor.ingredients]);

  async function saveCustom(): Promise<void> {
    const effects = editor.effects.filter((e) => e.power);
    if (!effects.length) {
      toast("风味力量为必填", "warning");
      return;
    }
    const total = editor.ingredients.reduce((a, b) => a + b.count, 0);
    if (total < 3 || total > 8) {
      toast("树果合计需要 3~8 个（同种可多个）", "warning");
      return;
    }
    setSaving(true);
    try {
      await apiSend("POST", "/api/custom-recipes", {
        profile_id: 1,
        game: "legends-za",
        name: editor.name,
        effects,
        ingredients: editor.ingredients,
        seasonings: [],
      });
      setEditorDlg(false);
      await loadCustom();
      toast("已保存", "success");
    } catch (e) {
      toast(String((e as Error).message || e), "error");
    } finally {
      setSaving(false);
    }
  }

  async function removeCustom(r: any): Promise<void> {
    await apiSend("DELETE", `/api/custom-recipes/${r.id}`);
    await loadCustom();
  }

  function flClass(flavor: string): string {
    return (
      (
        {
          甜: "fl-sweet",
          辣: "fl-spicy",
          酸: "fl-sour",
          苦: "fl-bitter",
          鲜: "fl-fresh",
        } as Record<string, string>
      )[flavor] || ""
    );
  }

  if (loading)
    return (
      <div className="pkt-page empty-hint" style={{ padding: 60 }}>
        加载中…
      </div>
    );

  return (
    <div className="pkt-page">
      <div className="page-head">
        <span className="page-title">甜甜圈工房</span>
        <span className="pkt-chip warning">传说 Z-A</span>
        <span className="muted-13">旅馆Ｚ安馨儿的甜甜圈店 · 树果配方与风味力量</span>
      </div>

      {d && (
        <>
          <div className="pkt-alert info">
            <b>{d.intro || "在旅馆Ｚ的安馨儿的甜甜圈店可以制作甜甜圈。"}</b>
            <div>
              最初使用 3 个树果和密阿雷黄油；获得异次元黄油后最多可使用 8
              个树果。特殊甜甜圈可打开通往传说宝可梦的扭洞。
            </div>
          </div>

          <div className="pkt-tabs">
            <button
              className={"pkt-tab" + (tab === "special" ? " on" : "")}
              onClick={() => setTab("special")}
            >
              特殊配方 ({d.special.length})
            </button>
            <button
              className={"pkt-tab" + (tab === "types" ? " on" : "")}
              onClick={() => setTab("types")}
            >
              基础甜甜圈 ({d.types.length})
            </button>
            <button
              className={"pkt-tab" + (tab === "berries" ? " on" : "")}
              onClick={() => setTab("berries")}
            >
              树果效果 ({d.berries.length})
            </button>
            <button
              className={"pkt-tab" + (tab === "powers" ? " on" : "")}
              onClick={() => setTab("powers")}
            >
              风味力量 ({d.flavor_powers.length})
            </button>
            <button
              className={"pkt-tab" + (tab === "custom" ? " on" : "")}
              onClick={() => setTab("custom")}
            >
              我的配方 ({customList.length})
            </button>
          </div>

          {tab === "special" && (
            <div className="sand-grid">
              {d.special.map((s: any) => (
                <div key={s.name} className="sand-card donut-card">
                  <div className="donut-img-wrap">
                    <img
                      className="donut-img"
                      src={`/assets/donut_${s.name}.png`}
                      loading="lazy"
                      onError={(e) => ((e.target as HTMLElement).style.display = "none")}
                    />
                  </div>
                  <h4>
                    <MonoIcon name="donut" size={18} /> {s.name}
                  </h4>
                  <div className="flavor-row">
                    {Object.entries(FLAVOR_NAMES).map(([k, v]) => (
                      <span
                        key={k}
                        className={"flavor-chip fl-" + k}
                        style={{ opacity: s[k] ? 1 : 0.25 }}
                      >
                        {v} {s[k]}
                      </span>
                    ))}
                  </div>
                  <div className="ing">
                    <b>食材：</b>
                    {s.ingredients}
                  </div>
                  <div className="ing">
                    <b>风味力量：</b>
                    {s.power}
                  </div>
                  <div className="ing">
                    <b>失控超级进化：</b>
                    {s.target}
                  </div>
                  <div className="ing">
                    <b>扭洞：</b>
                    {s.rift}
                  </div>
                  <div className="ing">
                    <b>位置：</b>
                    {s.location}
                  </div>
                  <div className="ing desc">{s.desc}</div>
                </div>
              ))}
            </div>
          )}

          {tab === "types" && (
            <div className="sand-grid">
              {d.types.map((t: any) => (
                <div key={t.name} className="sand-card">
                  <div className="donut-img-wrap small">
                    <img
                      className="donut-img"
                      src={`/assets/donut_${t.name}甜甜圈.png`}
                      loading="lazy"
                      onError={(e) => ((e.target as HTMLElement).style.display = "none")}
                    />
                  </div>
                  <h4>
                    <span className={"flavor-chip " + flClass(t.flavor)}>{t.flavor}</span>
                    {t.name}
                  </h4>
                  <div className="ing desc">{t.desc}</div>
                  <div className="ing" style={{ color: "#98a1b3" }}>
                    树果 ×N（0→★5，风味随树果变化）
                  </div>
                </div>
              ))}
            </div>
          )}

          {tab === "berries" && (
            <>
              <div className="page-head" style={{ marginBottom: 8 }}>
                <button
                  className="pkt-btn pkt-btn-sm filter-toggle"
                  onClick={() => setShowFilters(!showFilters)}
                >
                  筛选
                </button>
              </div>
              <div className={"filter-bar" + (showFilters ? " open" : "")}>
                <div className="page-head">
                  <input
                    className="pkt-input"
                    style={{ width: 160 }}
                    placeholder="搜索树果"
                    value={berryQ}
                    onChange={(e) => setBerryQ(e.target.value)}
                  />
                  <div className="spacer" />
                  <span className="muted-13">{filteredBerries.length} 种</span>
                </div>
              </div>
              <div className="pkt-table-wrap" style={{ maxHeight: 520 }}>
                <table className="pkt-table pkt-table-sm">
                  <thead>
                    <tr>
                      <th style={{ minWidth: 110 }}>树果</th>
                      {Object.values(FLAVOR_NAMES).map((v) => (
                        <th key={v} style={{ width: 70 }}>
                          {v}
                        </th>
                      ))}
                      <th style={{ width: 90 }}>增幅等级</th>
                      <th style={{ width: 90 }}>饱腹能量</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredBerries.map((row: any) => (
                      <tr key={row.name}>
                        <td>
                          <b>{row.name}</b>
                        </td>
                        {Object.keys(FLAVOR_NAMES).map((k) => (
                          <td
                            key={k}
                            style={{
                              color: row[k] ? "#333" : "#c8cedb",
                              fontWeight: row[k] >= 15 ? 700 : 400,
                            }}
                          >
                            {row[k] || "·"}
                          </td>
                        ))}
                        <td>{row.boost}</td>
                        <td>{row.energy}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {tab === "powers" && (
            <div className="pkt-table-wrap" style={{ maxHeight: 560 }}>
              <table className="pkt-table pkt-table-sm">
                <thead>
                  <tr>
                    <th style={{ width: 70 }}>风味</th>
                    <th style={{ width: 130 }}>力量</th>
                    <th style={{ minWidth: 260 }}>说明</th>
                    <th style={{ minWidth: 130 }}>Lv.1</th>
                    <th style={{ minWidth: 130 }}>Lv.2</th>
                    <th style={{ minWidth: 150 }}>Lv.3</th>
                    <th style={{ width: 130 }}>前缀</th>
                  </tr>
                </thead>
                <tbody>
                  {d.flavor_powers.map((row: any, i: number) => (
                    <tr key={i}>
                      <td>
                        <span className={"flavor-chip " + flClass(row.flavor)}>{row.flavor}</span>
                      </td>
                      <td>{row.power}</td>
                      <td>{row.effect}</td>
                      <td>{row.lv1}</td>
                      <td>{row.lv2}</td>
                      <td>{row.lv3}</td>
                      <td>{row.prefix}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {tab === "custom" && (
            <>
              <div className="page-head">
                <span className="muted-13">自由组合记录</span>
                <div className="spacer" />
                <button className="pkt-btn pkt-btn-sm primary" onClick={openEditor}>
                  ＋ 录入配方
                </button>
              </div>
              {customList.length ? (
                <div className="sand-grid">
                  {customList.map((r) => (
                    <div key={r.id} className="sand-card custom">
                      <h4>
                        <MonoIcon name="donut" size={18} /> {r.name}
                        <button
                          className="pkt-btn pkt-btn-sm danger-text"
                          style={{ float: "right" }}
                          onClick={() => void removeCustom(r)}
                        >
                          删除
                        </button>
                      </h4>
                      <div>
                        {r.effects.map((e: any, i: number) => (
                          <span
                            key={i}
                            className="power-badge"
                            style={{ ["--p" as string]: POWER_COLORS[e.power] || "#909399" }}
                          >
                            {e.power}
                            {e.type ? `：${e.type}` : ""} Lv.{e.level}
                          </span>
                        ))}
                      </div>
                      <div className="ing">
                        <b>树果：</b>
                        {fmtList(r.ingredients)}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="empty-hint" style={{ padding: 30 }}>
                  还没有自定义配方
                </div>
              )}
            </>
          )}
        </>
      )}

      <Modal
        open={editorDlg}
        title="录入自定义甜甜圈配方"
        width={520}
        onClose={() => setEditorDlg(false)}
      >
        <div className="pkt-form">
          <div className="pkt-form-row">
            <span className="lbl">名称</span>
            <input
              className="pkt-input flex1"
              placeholder="可选"
              maxLength={24}
              value={editor.name}
              onChange={(e) => setEditor({ ...editor, name: e.target.value })}
            />
          </div>
          <div className="pkt-form-row">
            <span className="lbl">风味力量</span>
            <div className="flex1">
              {editor.effects.map((e2, i) => (
                <div key={i} className="fld-row">
                  <select
                    className="pkt-select"
                    style={{ width: 140 }}
                    value={e2.power}
                    onChange={(ev) =>
                      setEditor({
                        ...editor,
                        effects: editor.effects.map((x, j) =>
                          j === i ? { ...x, power: ev.target.value } : x,
                        ),
                      })
                    }
                  >
                    <option value="">力量</option>
                    {powerNames.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                  <select
                    className="pkt-select w100"
                    value={e2.type}
                    onChange={(ev) =>
                      setEditor({
                        ...editor,
                        effects: editor.effects.map((x, j) =>
                          j === i ? { ...x, type: ev.target.value } : x,
                        ),
                      })
                    }
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
                    style={{ width: 80 }}
                    value={e2.level}
                    onChange={(ev) =>
                      setEditor({
                        ...editor,
                        effects: editor.effects.map((x, j) =>
                          j === i ? { ...x, level: Number(ev.target.value) } : x,
                        ),
                      })
                    }
                  >
                    {[1, 2, 3].map((v) => (
                      <option key={v} value={v}>
                        Lv.{v}
                      </option>
                    ))}
                  </select>
                  <button
                    className="pkt-btn pkt-btn-sm danger-text"
                    onClick={() =>
                      setEditor({ ...editor, effects: editor.effects.filter((_, j) => j !== i) })
                    }
                  >
                    删
                  </button>
                </div>
              ))}
              <button
                className="pkt-btn pkt-btn-sm link"
                onClick={() =>
                  setEditor({
                    ...editor,
                    effects: [...editor.effects, { power: "", type: "", level: 1 }],
                  })
                }
              >
                ＋ 添加
              </button>
            </div>
          </div>
          <div className="pkt-form-row">
            <span className="lbl">树果</span>
            <div className="flex1">
              <BerryPicker berries={d ? d.berries : []} onAdd={addBerry} />
              {editor.ingredients.map((it, i) => (
                <div key={it.name} className="qty-row">
                  <span className="qty-name">{it.name}</span>
                  <input
                    type="number"
                    className="pkt-input w96"
                    min={1}
                    max={8}
                    value={it.count}
                    onChange={(ev) =>
                      setEditor({
                        ...editor,
                        ingredients: editor.ingredients.map((x, j) =>
                          j === i ? { ...x, count: Number(ev.target.value) } : x,
                        ),
                      })
                    }
                  />
                  <button
                    className="pkt-btn pkt-btn-sm danger-text"
                    onClick={() =>
                      setEditor({
                        ...editor,
                        ingredients: editor.ingredients.filter((_, j) => j !== i),
                      })
                    }
                  >
                    删
                  </button>
                </div>
              ))}
              <div
                className={
                  "berry-count" +
                  (berryTotal > 0 && (berryTotal < 3 || berryTotal > 8) ? " bad" : "")
                }
              >
                合计 {berryTotal} / 8 个（最少 3 个；黄油随剧情固定，无需选择）
              </div>
              {flavorPreview && (
                <div className="flavor-preview">
                  <div className="fp-row">
                    <span className="fp-lbl">风味合计</span>
                    {flavorPreview.sums.map(([k, v]) => (
                      <span
                        key={k}
                        className={"flavor-chip " + flClass(FLAVOR_NAMES[k]!)}
                        style={{ opacity: v > 0 ? 1 : 0.35 }}
                      >
                        {FLAVOR_NAMES[k]} {v}
                      </span>
                    ))}
                  </div>
                  <div className="fp-row">
                    <span className="fp-lbl">风味级别</span>
                    <span className="fp-star">
                      {"★".repeat(flavorPreview.star)}
                      {flavorPreview.star < 5 ? "☆".repeat(5 - flavorPreview.star) : ""}
                    </span>
                    {flavorPreview.star >= 3 ? (
                      <span style={{ color: "#67c23a" }}>达到 3★，将产生风味力量</span>
                    ) : (
                      <span style={{ color: "#98a1b3" }}>未达 3★，不产生风味力量</span>
                    )}
                  </div>
                  {flavorPreview.star >= 3 && (
                    <div className="fp-row">
                      <span className="fp-lbl">预期力量</span>
                      <span style={{ fontSize: "12.5px", color: "#555" }}>
                        由最大风味「{FLAVOR_NAMES[flavorPreview.maxFlavor]}」决定 （次高「
                        {FLAVOR_NAMES[flavorPreview.second[0]]!} {flavorPreview.second[1]}
                        」影响具体种类）：
                        {flavorPreview.powers.map((pw) => (
                          <span key={pw} className="pkt-chip" style={{ margin: "2px 4px 2px 0" }}>
                            {pw}
                          </span>
                        ))}
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="pkt-modal-foot">
          <button className="pkt-btn" onClick={() => setEditorDlg(false)}>
            取消
          </button>
          <button className="pkt-btn primary" disabled={saving} onClick={() => void saveCustom()}>
            {saving ? "保存中…" : "保存"}
          </button>
        </div>
      </Modal>
    </div>
  );
}

function BerryPicker({
  berries,
  onAdd,
}: {
  berries: any[];
  onAdd: (name: string) => void;
}): JSX.Element {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const filtered = q ? berries.filter((b) => b.name.includes(q)) : berries;
  return (
    <div className="item-picker">
      <input
        className="pkt-input w-full"
        placeholder="搜索并添加树果（同种可多个）"
        value={q}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
      />
      {open && filtered.length > 0 && (
        <div className="item-picker-list">
          {filtered.slice(0, 40).map((b) => (
            <div
              key={b.name}
              className="item-picker-opt"
              onClick={() => {
                onAdd(b.name);
                setQ("");
                setOpen(false);
              }}
            >
              {b.name}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
