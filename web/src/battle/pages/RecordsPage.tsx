import { useEffect, useState } from "react";
import { useApp } from "../store";
import type { StoredBattleRecord } from "../storage";

/** 对局记录（FR-10）：列表查看、日志回看、删除。 */
export function RecordsPage(): JSX.Element {
  const records = useApp((s) => s.records);
  const loadRecords = useApp((s) => s.loadRecords);
  const removeRecord = useApp((s) => s.removeRecord);
  const [viewing, setViewing] = useState<StoredBattleRecord | null>(null);

  useEffect(() => {
    loadRecords();
  }, [loadRecords]);

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
          <div className="log-scroll">
            {viewing.log.map((l, i) => (
              <div key={i} className="log-raw">
                {l}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page page-records">
      <h1>对局记录</h1>
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
