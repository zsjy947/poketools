import { useState } from "react";
import { useApp } from "../store";
import { FORMAT_CATALOG, verifyFormats } from "../../data/formats";
import type { PokemonSet } from "../../engine-adapter";

/** 主页：赛制选择（FR-01）+ 规则摘要 + 一键进入队伍编辑。 */
export function HomePage(): JSX.Element {
  const format = useApp((s) => s.format);
  const setFormat = useApp((s) => s.setFormat);
  const go = useApp((s) => s.go);
  const [verify] = useState<{ ok: boolean; missing: string[] }>(() => verifyFormats());
  const formats = FORMAT_CATALOG;

  return (
    <div className="page page-home">
      <h1>选择赛制</h1>
      <p className="muted">
        完全本地 · 单人操控双方 · 离线可用。数据源：上游 pokemon-showdown（
        {verify && !verify.ok ? `缺失：${verify.missing.join(", ")}` : "赛制校验通过"}）
      </p>
      <div className="format-grid">
        {formats.map((f) => (
          <button
            key={f.id}
            className={"format-card" + (format?.id === f.id ? " on" : "")}
            onClick={() => setFormat(f)}
          >
            <div className="format-name">{f.zhName}</div>
            <div className="format-en muted">{f.name}</div>
            <div className="format-rules">
              {f.gameType} · {f.pick} · Lv.{f.level}
            </div>
            <div className="format-rules muted">{f.rulesZh}</div>
            <span className={"format-prio prio-" + f.priority}>{f.priority}</span>
          </button>
        ))}
      </div>
      <div className="home-actions">
        <button className="primary" disabled={!format} onClick={() => go("team")}>
          {format ? `进入队伍编辑（${format.zhName}）` : "请先选择赛制"}
        </button>
      </div>
    </div>
  );
}

/** 供测试导出：校验当前赛制下示例队伍 */
export async function quickValidate(
  formatId: string,
  sets: PokemonSet[],
): Promise<string[] | null> {
  const { TeamValidator: TV, Dex } = await import("../../engine-adapter");
  Dex.includeFormats();
  return TV.get(Dex.formats.get(formatId) as never).validateTeam(sets);
}
