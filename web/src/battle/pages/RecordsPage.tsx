import { useEffect, useState } from "react";
import { useApp } from "../store";
import type { StoredBattleRecord } from "../storage";
import { TurnLogView } from "../turnLog";

/** 对局记录（FR-10）：列表查看、日志回看（Showdown 式回合分组）、回放（M4 P3）、删除。 */
export function RecordsPage(): JSX.Element {
  const records = useApp((s) => s.records);
  const loadRecords = useApp((s) => s.loadRecords);
  const removeRecord = useApp((s) => s.removeRecord);
  const openReplay = useApp((s) => s.openReplay);
  const [viewing, setViewing] = useState<StoredBattleRecord | null>(null);
  const [importText, setImportText] = useState("");
  const [importOpen, setImportOpen] = useState(false);

  useEffect(() => {
    loadRecords();
  }, [loadRecords]);

  /** 官方/外部日志导入 → 组装同构记录（无 choices → 回放页走日志揭示模式） */
  const importLog = () => {
    const lines = importText
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    if (!lines.some((l) => l.startsWith("|turn|"))) {
      alert("导入的日志不含回合行（|turn|），无法解析。");
      return;
    }
    const fmt = /^\|format\|(.+)$/m.exec(importText)?.[1] ?? "导入对局";
    const winner = /^\|win\|(.+)$/m.exec(importText)?.[1] ?? "未知";
    let turns = 0;
    for (const l of lines) {
      const m = /^\|turn\|(\d+)/.exec(l);
      if (m) turns = Math.max(turns, Number(m[1]));
    }
    const record: StoredBattleRecord = {
      id: `import-${Date.now()}`,
      formatid: fmt.trim(),
      playedAt: Date.now(),
      winner: winner.trim(),
      p1Name: "导入方 A",
      p2Name: "导入方 B",
      p1Team: "",
      p2Team: "",
      turns,
      log: lines,
    };
    setImportOpen(false);
    setImportText("");
    openReplay(record);
  };

  if (viewing) {
    return (
      <div className="page">
        <div className="page-head-row">
          <h1>
            记录回看 · <span className="muted">{viewing.formatid}</span>
          </h1>
          <div className="grow" />
          <button onClick={() => setViewing(null)}>返回列表</button>
        </div>
        <div className="battle-log standalone">
          <TurnLogView lines={viewing.log} />
        </div>
      </div>
    );
  }

  return (
    <div className="page page-records">
      <div className="page-head-row">
        <h1>对局记录</h1>
        <div className="grow" />
        <button onClick={() => setImportOpen((v) => !v)}>导入官方日志</button>
      </div>
      {importOpen && (
        <div className="import-box">
          <p className="muted">
            粘贴 Showdown 官方对局日志（协议行以 | 开头）。外部日志无指令序列，
            回放为日志揭示模式（逐回合展开，不重演舞台）。
          </p>
          <textarea
            rows={6}
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
            placeholder={"|player|p1|…\n|turn|1\n|move|…"}
          />
          <button className="primary" onClick={importLog}>
            导入并回放
          </button>
        </div>
      )}
      {records.length === 0 && <p className="muted">暂无记录——打完一局后自动保存。</p>}
      <table className="records-table">
        <thead>
          <tr>
            <th>时间</th>
            <th>赛制</th>
            <th>回合</th>
            <th>胜者</th>
            <th>双方</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {records.map((r) => (
            <tr key={r.id}>
              <td>{new Date(r.playedAt).toLocaleString("zh-CN")}</td>
              <td>{r.formatid}</td>
              <td>{r.turns}</td>
              <td>
                <b>{r.winner}</b>
              </td>
              <td className="muted">
                {r.p1Name} vs {r.p2Name}
              </td>
              <td>
                <button
                  className="mini"
                  disabled={!r.seed || !r.choices?.length}
                  title={
                    r.seed && r.choices?.length ? "" : "待补充：旧记录缺少指令序列/种子，无法重演"
                  }
                  onClick={() => openReplay(r)}
                >
                  回放
                </button>{" "}
                <button className="mini" onClick={() => setViewing(r)}>
                  日志
                </button>{" "}
                <button className="mini danger" onClick={() => removeRecord(r.id)}>
                  删除
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
