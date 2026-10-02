import { useState } from "react";
import { useApp } from "../store";
import { FORMAT_CATALOG, FORMAT_SECTIONS, verifyFormats } from "../../data/formats";
import type { FormatMeta } from "../../data/formats";

/** 主页：赛制选择（FR-01）+ 规则摘要 + 一键进入队伍编辑。按大类分组（单打/双打小类）。 */
export function HomePage(): JSX.Element {
  const format = useApp((s) => s.format);
  const setFormat = useApp((s) => s.setFormat);
  const go = useApp((s) => s.go);
  const [verify] = useState<{ ok: boolean; missing: string[] }>(() => verifyFormats());
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  return (
    <div className="page page-home">
      <h1>选择赛制</h1>
      <p className="muted">
        完全本地 · 单人操控双方 · 离线可用。数据源：上游 pokemon-showdown（
        {verify && !verify.ok ? `缺失：${verify.missing.join(", ")}` : "赛制校验通过"}）
      </p>
      {FORMAT_SECTIONS.map((section) => {
        const items = FORMAT_CATALOG.filter((f) => f.section === section);
        const singles = items.filter((f) => f.gameType === "单打");
        const doubles = items.filter((f) => f.gameType === "双打");
        const isCollapsed = collapsed[section];
        return (
          <section key={section} className="format-section">
            <button
              className="format-section-head"
              onClick={() => setCollapsed({ ...collapsed, [section]: !isCollapsed })}
            >
              <span className="format-section-name">{section}</span>
              <span className="format-section-count muted">{items.length} 个赛制</span>
              <span className="acc-arrow">{isCollapsed ? "›" : "⌄"}</span>
            </button>
            {!isCollapsed && (
              <>
                {[
                  { label: "双打", list: doubles },
                  { label: "单打", list: singles },
                ].map(
                  ({ label, list }) =>
                    list.length > 0 && (
                      <div key={label} className="format-subgroup">
                        <div className="format-subgroup-title muted">{label}</div>
                        <div className="format-grid">
                          {list.map((f) => (
                            <FormatCard
                              key={f.id}
                              f={f}
                              selected={format?.id === f.id}
                              onPick={() => setFormat(f)}
                            />
                          ))}
                        </div>
                      </div>
                    ),
                )}
              </>
            )}
          </section>
        );
      })}
      <div className="home-actions">
        <button className="primary" disabled={!format} onClick={() => go("team")}>
          {format ? `进入队伍编辑（${format.zhName}）` : "请先选择赛制"}
        </button>
      </div>
    </div>
  );
}

function FormatCard({
  f,
  selected,
  onPick,
}: {
  f: FormatMeta;
  selected: boolean;
  onPick: () => void;
}): JSX.Element {
  return (
    <button className={"format-card" + (selected ? " on" : "")} onClick={onPick}>
      <div className="format-name">{f.zhName}</div>
      <div className="format-en muted">{f.name}</div>
      <div className="format-rules">
        {f.gameType} · {f.pick} · Lv.{f.level}
      </div>
      <div className="format-rules muted">{f.rulesZh}</div>
    </button>
  );
}

/** 供测试导出：校验当前赛制下示例队伍 */
export async function quickValidate(
  formatId: string,
  sets: import("../../engine-adapter").PokemonSet[],
): Promise<string[] | null> {
  const { TeamValidator: TV, Dex } = await import("../../engine-adapter");
  Dex.includeFormats();
  return TV.get(Dex.formats.get(formatId) as never).validateTeam(sets);
}
