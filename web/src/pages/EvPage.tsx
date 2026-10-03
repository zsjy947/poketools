/* 努力值查询页（自 Vue ev.js 迁移）：筛选 + 野外地点列（+N 折叠）+ 移动卡片流 */
import { useEffect, useState } from "react";
import { apiGet } from "../data/api";
import { TypeBadge, PokeImg, EvBadges, EV_NAMES, versionChip, chipClass } from "../pkt/shared";

export function EvPage({ gameId }: { gameId: string }): JSX.Element {
  const [stat, setStat] = useState("hp");
  const [value, setValue] = useState(0);
  const [q, setQ] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});
  const [list, setList] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    const t = setTimeout(
      () => {
        apiGet("/api/ev", { stat, value, game: gameId, q })
          .then((r) => {
            if (alive) setList(r);
          })
          .finally(() => {
            if (alive) setLoading(false);
          });
      },
      q ? 300 : 0,
    );
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [stat, value, gameId, q]);

  function openDetail(row: any): void {
    location.hash = `#/pokemon/${row.species_id}?game=${gameId}`;
  }

  return (
    <div className="pkt-page ev-page">
      <div className="page-head">
        <span className="page-title">努力值查询</span>
        <span className="muted-13">
          击倒该宝可梦可获得的努力值点数（仅当前游戏图鉴，含野外自然出现地点）
        </span>
      </div>
      <div className="page-head">
        <button
          className="pkt-btn pkt-btn-sm filter-toggle"
          onClick={() => setShowFilters(!showFilters)}
        >
          筛选
        </button>
        <div className="spacer" />
        <span className="muted-13">{list.length} 只</span>
      </div>
      <div className={"filter-bar page-head" + (showFilters ? " open" : "")}>
        <div className="page-head" style={{ margin: 0 }}>
          <select
            className="pkt-select"
            style={{ width: 110 }}
            value={stat}
            onChange={(e) => setStat(e.target.value)}
          >
            {Object.entries(EV_NAMES).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
          <select
            className="pkt-select"
            style={{ width: 130 }}
            value={value}
            onChange={(e) => setValue(Number(e.target.value))}
          >
            <option value={0}>任意点数</option>
            {[1, 2, 3].map((v) => (
              <option key={v} value={v}>
                +{v} 点
              </option>
            ))}
          </select>
          <input
            className="pkt-input"
            style={{ width: 160 }}
            placeholder="搜索名称"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <button className="pkt-btn pkt-btn-sm" onClick={() => setShowFilters(false)}>
            收起
          </button>
        </div>
      </div>

      {/* 桌面表格 */}
      <div className={"pkt-table-wrap ev-table" + (loading ? " loading" : "")}>
        <table className="pkt-table pkt-table-sm" style={{ cursor: "pointer" }}>
          <thead>
            <tr>
              <th style={{ width: 80 }} />
              <th style={{ width: 150 }}>宝可梦</th>
              <th style={{ width: 140 }}>属性</th>
              <th style={{ width: 230 }}>努力值</th>
              <th style={{ minWidth: 260 }}>野外地点</th>
            </tr>
          </thead>
          <tbody>
            {list.map((row) => (
              <tr key={row.species_id} onClick={() => openDetail(row)}>
                <td>
                  <PokeImg formId={row.form_id} size={56} />
                </td>
                <td>
                  <div style={{ fontWeight: 600 }}>{row.name_zh}</div>
                  <div style={{ fontSize: 11, color: "#98a1b3" }}>{row.name_en}</div>
                </td>
                <td>
                  <TypeBadge types={row.types} />
                </td>
                <td>
                  <EvBadges ev={row.ev} />
                </td>
                <td>
                  {row.locations && row.locations.length ? (
                    <>
                      {(expanded[row.species_id] ? row.locations : row.locations.slice(0, 3)).map(
                        (l: any, i: number) => (
                          <span key={i} className="ev-loc">
                            {versionChip(l.version_label) && (
                              <span className={"ev-ver-chip " + chipClass(l.version_label)}>
                                {versionChip(l.version_label)}
                              </span>
                            )}
                            {l.location}
                          </span>
                        ),
                      )}
                      {row.locations.length > 3 && (
                        <span
                          className={"ev-loc more"}
                          title={row.locations.map((l: any) => l.location).join("、")}
                          onClick={(e) => {
                            e.stopPropagation();
                            setExpanded((s) => ({ ...s, [row.species_id]: !s[row.species_id] }));
                          }}
                        >
                          {expanded[row.species_id] ? "收起" : `+${row.locations.length - 3}`}
                        </span>
                      )}
                    </>
                  ) : (
                    <span className="empty-hint">本作无自然出现</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 移动端卡片流 */}
      <div className="ev-cards">
        {list.map((row) => (
          <div key={row.species_id} className="ev-card" onClick={() => openDetail(row)}>
            <PokeImg formId={row.form_id} size={52} />
            <div className="evc-info">
              <div className="evc-name">
                {row.name_zh} <span className="evc-en">{row.name_en}</span>
              </div>
              <TypeBadge types={row.types} />
              <EvBadges ev={row.ev} />
              {row.locations && row.locations.length ? (
                <div className="evc-locs">
                  {(expanded[row.species_id] ? row.locations : row.locations.slice(0, 2)).map(
                    (l: any, i: number) => (
                      <span key={i}>
                        {versionChip(l.version_label) && (
                          <span className={"ev-ver-chip " + chipClass(l.version_label)}>
                            {versionChip(l.version_label)}
                          </span>
                        )}
                        {l.location}
                      </span>
                    ),
                  )}
                  {row.locations.length > 2 && (
                    <span
                      className="evc-more"
                      onClick={(e) => {
                        e.stopPropagation();
                        setExpanded((s) => ({ ...s, [row.species_id]: !s[row.species_id] }));
                      }}
                    >
                      {expanded[row.species_id] ? "收起" : `+${row.locations.length - 2} 地点`}
                    </span>
                  )}
                </div>
              ) : (
                <div className="evc-locs" style={{ color: "#a8b0c0" }}>
                  本作无自然出现
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
