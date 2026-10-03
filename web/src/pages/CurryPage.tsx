/* 剑盾咖喱图鉴页（自 Vue curry.js 迁移；U5 卡片 flex 纵向：图片区可变高 + 文本块底对齐等高） */
import { useEffect, useMemo, useState } from "react";
import { apiGet } from "../data/api";

export function CurryPage(): JSX.Element {
  const [loading, setLoading] = useState(true);
  const [list, setList] = useState<any[]>([]);
  const [q, setQ] = useState("");
  const [ingredient, setIngredient] = useState("");
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    apiGet("/api/curries")
      .then((r) => setList(r))
      .finally(() => setLoading(false));
  }, []);

  const ingredients = useMemo(
    () => [...new Set(list.map((c) => c.key_ingredient).filter(Boolean))].sort(),
    [list],
  );
  const filtered = list.filter(
    (c) =>
      (!q || c.name.includes(q) || c.key_ingredient.includes(q)) &&
      (!ingredient || c.key_ingredient === ingredient),
  );

  /* 同组咖喱共享组图：组名 = 去掉口味前缀后的名字 */
  function familyName(name: string): string {
    return name.replace(/^(辣味|涩味|甜味|苦味|酸味)/, "");
  }
  function curryImg(c: any): string {
    return "/assets/curry_" + encodeURIComponent(familyName(c.name) + " SWSH.png");
  }

  return (
    <div className={"pkt-page" + (loading ? " loading" : "")}>
      <div className="page-head">
        <span className="page-title">咖喱图鉴</span>
        <span className="pkt-chip warning">剑／盾</span>
        <span className="muted-13">露营咖喱 · 收集全部 151 种解锁奖励</span>
      </div>

      <div className="pkt-alert info">
        <b>咖喱等级与奖励</b>
        <div>
          与宝可梦一起露营制作咖喱。咖喱等级由食材与宝可梦的好感度决定（★★~★★★★★）；大份咖喱能让宝可梦回复更多。收集咖喱图鉴达到一定数量可在集汇空地的咖喱店主处获得奖励。
        </div>
      </div>

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
            style={{ width: 200 }}
            placeholder="搜索咖喱名/关键食材"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <select
            className="pkt-select"
            style={{ width: 160 }}
            value={ingredient}
            onChange={(e) => setIngredient(e.target.value)}
          >
            <option value="">关键食材</option>
            {ingredients.map((i) => (
              <option key={i} value={i}>
                {i}
              </option>
            ))}
          </select>
          <div className="spacer" />
          <span className="muted-13">
            {filtered.length} / {list.length} 种
          </span>
        </div>
      </div>

      <div className="curry-grid">
        {filtered.map((c) => (
          /* U5：flex 纵向——图片区在上可变高（限 max-height），文本块 margin-top:auto 底对齐等高 */
          <div key={c.no} className="curry-card">
            <div className="curry-img-wrap">
              <img
                className="curry-img"
                src={curryImg(c)}
                loading="lazy"
                onError={(e) => ((e.target as HTMLElement).style.display = "none")}
              />
            </div>
            <div className="curry-text">
              <div className="curry-no">#{String(c.no).padStart(3, "0")}</div>
              <div className="curry-name">{c.name}</div>
              <div>
                <span className="pkt-chip info">{c.key_ingredient}</span>
              </div>
              <div className="curry-desc">{c.desc}</div>
            </div>
          </div>
        ))}
      </div>
      {!loading && !filtered.length && (
        <div className="empty-hint" style={{ padding: 40 }}>
          没有符合条件的咖喱
        </div>
      )}
    </div>
  );
}
