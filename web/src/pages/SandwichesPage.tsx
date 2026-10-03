/* 朱紫三明治食谱页（自 Vue sandwiches.js 迁移；U9 行为等价：食材/调味料逐条添加并设数量） */
import { useCallback, useEffect, useMemo, useState } from "react";
import { apiGet, apiSend, TYPE_LIST, POWER_LIST, POWER_COLORS } from "../data/api";
import { MonoIcon, toast, Modal } from "../pkt/shared";

interface RecipeItem {
  name: string;
  count: number;
}

export function SandwichesPage(): JSX.Element {
  const [tab, setTab] = useState("recipes");
  const [power, setPower] = useState("");
  const [ptype, setPtype] = useState("");
  const [level, setLevel] = useState(0);
  const [sort, setSort] = useState("no");
  const [q, setQ] = useState("");
  const [list, setList] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [itemKind, setItemKind] = useState("");
  const [itemQ, setItemQ] = useState("");
  const [items, setItems] = useState<any[]>([]);
  const [customList, setCustomList] = useState<any[]>([]);
  const [editorDlg, setEditorDlg] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editor, setEditor] = useState({
    name: "",
    effects: [{ power: "", type: "", level: 1 }],
    ingredients: [] as RecipeItem[],
    seasonings: [] as RecipeItem[],
  });

  const load = useCallback(() => {
    setLoading(true);
    apiGet("/api/sandwiches", {
      power: power || undefined,
      ptype: ptype || undefined,
      level: level || undefined,
      sort,
      q: q || undefined,
    })
      .then((r) => setList(r))
      .finally(() => setLoading(false));
  }, [power, ptype, level, sort, q]);

  useEffect(() => {
    const t = setTimeout(load, q ? 300 : 0);
    return () => clearTimeout(t);
  }, [load, q]);

  useEffect(() => {
    apiGet("/api/picnic-items")
      .then(setItems)
      .catch(() => {});
  }, []);

  const loadCustom = useCallback(() => {
    apiGet("/api/custom-recipes", { game: "scarlet-violet" })
      .then(setCustomList)
      .catch(() => setCustomList([]));
  }, []);
  useEffect(() => {
    loadCustom();
  }, [loadCustom]);

  const filteredItems = items.filter(
    (p) => (!itemKind || p.kind === itemKind) && (!itemQ || (p.name || "").includes(itemQ)),
  );

  function openEditor(): void {
    setEditor({
      name: "",
      effects: [{ power: "", type: "", level: 1 }],
      ingredients: [],
      seasonings: [],
    });
    setEditorDlg(true);
  }

  function addItem(list2: RecipeItem[], name: string): RecipeItem[] {
    if (name && !list2.some((x) => x.name === name)) return [...list2, { name, count: 1 }];
    return list2;
  }

  async function saveCustom(): Promise<void> {
    const effects = editor.effects.filter((e) => e.power);
    if (!effects.length || !editor.ingredients.length || !editor.seasonings.length) {
      toast("效果、食材、调味料均为必填", "warning");
      return;
    }
    const totalIng = editor.ingredients.reduce((a, b) => a + b.count, 0);
    if (totalIng > 30) {
      toast("食材总数过多", "warning");
      return;
    }
    setSaving(true);
    try {
      await apiSend("POST", "/api/custom-recipes", {
        profile_id: 1,
        game: "scarlet-violet",
        name: editor.name,
        effects,
        ingredients: editor.ingredients,
        seasonings: editor.seasonings,
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

  function fmtList(v: any): string {
    if (Array.isArray(v)) {
      return v.map((x) => (typeof x === "object" ? `${x.name} ×${x.count}` : x)).join("、");
    }
    return v || "—";
  }

  return (
    <div className="pkt-page">
      <div className="page-head">
        <span className="page-title">三明治食谱</span>
        <span className="pkt-chip warning">朱／紫</span>
        <span className="muted-13">按食力筛选 · 自由模式可录入自己的配方</span>
      </div>

      <div className="hero-banner">
        <img
          src="/assets/sandwich_hero.png"
          onError={(e) =>
            (((e.target as HTMLElement).parentElement as HTMLElement).style.display = "none")
          }
        />
      </div>

      <div className="pkt-tabs">
        <button
          className={"pkt-tab" + (tab === "recipes" ? " on" : "")}
          onClick={() => setTab("recipes")}
        >
          食谱列表
        </button>
        <button
          className={"pkt-tab" + (tab === "items" ? " on" : "")}
          onClick={() => setTab("items")}
        >
          食材与调味料
        </button>
        <button
          className={"pkt-tab" + (tab === "custom" ? " on" : "")}
          onClick={() => setTab("custom")}
        >
          我的食谱 ({customList.length})
        </button>
      </div>

      {tab === "recipes" && (
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
              <select
                className="pkt-select"
                style={{ width: 130 }}
                value={power}
                onChange={(e) => setPower(e.target.value)}
              >
                <option value="">食力类型</option>
                {POWER_LIST.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
              <select
                className="pkt-select"
                style={{ width: 110 }}
                value={ptype}
                onChange={(e) => setPtype(e.target.value)}
              >
                <option value="">目标属性</option>
                {TYPE_LIST.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
              <select
                className="pkt-select"
                style={{ width: 100 }}
                value={level}
                onChange={(e) => setLevel(Number(e.target.value))}
              >
                <option value={0}>等级</option>
                {[1, 2, 3].map((v) => (
                  <option key={v} value={v}>
                    Lv.{v}
                  </option>
                ))}
              </select>
              <div className="pkt-radio-group">
                {(
                  [
                    ["no", "按编号"],
                    ["power", "按效果"],
                    ["level", "按等级"],
                  ] as const
                ).map(([v, t]) => (
                  <button
                    key={v}
                    className={"pkt-radio" + (sort === v ? " on" : "")}
                    onClick={() => setSort(v)}
                  >
                    {t}
                  </button>
                ))}
              </div>
              <input
                className="pkt-input"
                style={{ width: 170 }}
                placeholder="搜索名称/食材"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
              <div className="spacer" />
              <span className="muted-13">{list.length} 个食谱</span>
            </div>
          </div>
          <div className={"sand-grid" + (loading ? " loading" : "")}>
            {list.map((r) => (
              <div key={r.no} className="sand-card">
                <img
                  className="sand-img"
                  loading="lazy"
                  src={`/assets/sandwiches/sandwich_${String(r.no).padStart(3, "0")}.webp`}
                  onError={(e) => ((e.target as HTMLElement).style.display = "none")}
                />
                <h4>
                  <span className="no">#{r.no}</span>
                  {r.name}
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
                  <b>食材：</b>
                  {r.ingredients || "—"}
                </div>
                <div className="ing">
                  <b>调味料：</b>
                  {r.seasonings || "—"}
                </div>
                <div className="ing">
                  <b>获得：</b>
                  {r.how || "—"}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {tab === "items" && (
        <>
          <div className="page-head">
            <div className="pkt-radio-group">
              {(
                [
                  ["", "全部"],
                  ["食材", "食材"],
                  ["调味料", "调味料"],
                ] as const
              ).map(([v, t]) => (
                <button
                  key={v}
                  className={"pkt-radio" + (itemKind === v ? " on" : "")}
                  onClick={() => setItemKind(v)}
                >
                  {t}
                </button>
              ))}
            </div>
            <input
              className="pkt-input"
              style={{ width: 160 }}
              placeholder="搜索"
              value={itemQ}
              onChange={(e) => setItemQ(e.target.value)}
            />
            <div className="spacer" />
            <span className="muted-13">{filteredItems.length} 项</span>
          </div>
          <div className="pkt-table-wrap" style={{ maxHeight: 520 }}>
            <table className="pkt-table pkt-table-sm">
              <thead>
                <tr>
                  <th style={{ minWidth: 130 }}>名称</th>
                  <th style={{ minWidth: 320 }}>说明</th>
                  <th style={{ minWidth: 200 }}>获得方式</th>
                  <th style={{ width: 90 }}>价格</th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.map((row) => (
                  <tr key={row.no_rowid}>
                    <td>
                      <b>{row.name}</b>
                      <span
                        className={"pkt-chip " + (row.kind === "调味料" ? "warning" : "success")}
                        style={{ marginLeft: 6 }}
                      >
                        {row.kind}
                      </span>
                    </td>
                    <td>{row.desc}</td>
                    <td>{row.how || "待补充"}</td>
                    <td>{row.price ? `￥${row.price}` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === "custom" && (
        <>
          <div className="page-head">
            <span className="muted-13">自由模式配方记录（效果/食材/调味料必填）</span>
            <div className="spacer" />
            <button className="pkt-btn pkt-btn-sm primary" onClick={openEditor}>
              ＋ 录入食谱
            </button>
          </div>
          {customList.length ? (
            <div className="sand-grid">
              {customList.map((r) => (
                <div key={r.id} className="sand-card custom">
                  <h4>
                    <MonoIcon name="sandwich" size={18} /> {r.name}
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
                    <b>食材：</b>
                    {fmtList(r.ingredients)}
                  </div>
                  <div className="ing">
                    <b>调味料：</b>
                    {fmtList(r.seasonings)}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-hint" style={{ padding: 30 }}>
              还没有自定义食谱，点击右上角「录入食谱」开始记录
            </div>
          )}
        </>
      )}

      <Modal
        open={editorDlg}
        title="录入自定义食谱"
        width={560}
        onClose={() => setEditorDlg(false)}
      >
        <div className="pkt-form">
          <div className="pkt-form-row">
            <span className="lbl">名称</span>
            <input
              className="pkt-input flex1"
              placeholder="可选，如「闪光猎手三明治」"
              maxLength={24}
              value={editor.name}
              onChange={(e) => setEditor({ ...editor, name: e.target.value })}
            />
          </div>
          <div className="pkt-form-row">
            <span className="lbl">效果</span>
            <div className="flex1">
              {editor.effects.map((e2, i) => (
                <div key={i} className="fld-row">
                  <select
                    className="pkt-select"
                    style={{ width: 110 }}
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
                    <option value="">食力</option>
                    {POWER_LIST.map((p) => (
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
                    删除
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
                ＋ 添加效果
              </button>
            </div>
          </div>

          {(
            [
              ["ingredients", "食材"],
              ["seasonings", "调味料"],
            ] as const
          ).map(([key, label]) => (
            <div className="pkt-form-row" key={key}>
              <span className="lbl">{label}</span>
              <div className="flex1">
                <ItemPicker
                  options={items.filter((p) => p.kind === label).map((p) => p.name)}
                  placeholder={`搜索并添加${label}`}
                  onAdd={(name) => setEditor({ ...editor, [key]: addItem(editor[key], name) })}
                />
                {editor[key].map((it, i) => (
                  <div key={it.name} className="qty-row">
                    <span className="qty-name">{it.name}</span>
                    <input
                      type="number"
                      className="pkt-input w96"
                      min={1}
                      max={99}
                      value={it.count}
                      onChange={(ev) =>
                        setEditor({
                          ...editor,
                          [key]: editor[key].map((x, j) =>
                            j === i ? { ...x, count: Number(ev.target.value) } : x,
                          ),
                        })
                      }
                    />
                    <button
                      className="pkt-btn pkt-btn-sm danger-text"
                      onClick={() =>
                        setEditor({ ...editor, [key]: editor[key].filter((_, j) => j !== i) })
                      }
                    >
                      删除
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}
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

/* 搜索添加选择器（替代 el-select :model-value=null + @change 一次性添加） */
function ItemPicker({
  options,
  placeholder,
  onAdd,
}: {
  options: string[];
  placeholder: string;
  onAdd: (name: string) => void;
}): JSX.Element {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const filtered = useMemo(
    () => (q ? options.filter((x) => x.includes(q)) : options),
    [options, q],
  );
  return (
    <div className="item-picker">
      <input
        className="pkt-input w-full"
        placeholder={placeholder}
        value={q}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
      />
      {open && filtered.length > 0 && (
        <div className="item-picker-list">
          {filtered.slice(0, 40).map((name) => (
            <div
              key={name}
              className="item-picker-opt"
              onClick={() => {
                onAdd(name);
                setQ("");
                setOpen(false);
              }}
            >
              {name}
            </div>
          ))}
          {filtered.length > 40 && (
            <div className="item-picker-more">…共 {filtered.length} 项，输入关键词缩小范围</div>
          )}
        </div>
      )}
    </div>
  );
}
