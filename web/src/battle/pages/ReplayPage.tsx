/**
 * 对战回放（M4 P3）：
 * - 本局记录（含 seed + choices）：确定性复现——同种子同队伍新建 session，按提交序
 *   重放指令，引擎逐步结算驱动 BattleStagePane（舞台演出/悬浮框/倒计时全部复用）；
 * - 官方日志导入（无 choices）：日志揭示模式——按回合步进展开记录日志（TurnLogView），
 *   舞台区不重演（无引擎重放数据）；
 * - 播放器：播放/暂停、逐回合步进、回合进度条、倍速（复用设置页动画速度）。
 * 只读：不呈现任何指令面板。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "../store";
import { BattleSession } from "../../engine-adapter";
import type { SessionSnapshot } from "../../engine-adapter";
import type { StoredBattleRecord } from "../storage";
import { importShowdown } from "../../team/showdown";
import { dexFor } from "../../data";
import { BattleStagePane } from "../BattleView";
import { turnGroups, TurnLogView } from "../turnLog";

/** 记录的最大回合（进度条上界：choices 模式按指令回合，日志模式按分组数） */
function maxTurnOf(record: StoredBattleRecord): number {
  if (record.choices?.length) {
    return Math.max(record.turns, ...record.choices.map((c) => c.turn), 1);
  }
  const groups = turnGroups(record.log);
  return Math.max(1, ...groups.map((g) => g.turn ?? 0));
}

/** formatid（如 gen9vgc2025regi）→ mod（gen9） */
function modOf(formatid: string): string {
  const m = /^(gen\d+)/.exec(formatid);
  return m ? m[1]! : "gen9";
}

export function ReplayPage(): JSX.Element {
  const record = useApp((s) => s.replayRecord);
  const closeReplay = useApp((s) => s.closeReplay);
  const settings = useApp((s) => s.settings);
  const format = useApp((s) => s.format);

  const hasSim = !!(record?.seed && record?.choices?.length);
  const [snapshot, setSnapshot] = useState<SessionSnapshot | null>(null);
  const [session, setSession] = useState<BattleSession | null>(null);
  const [curTurn, setCurTurn] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [resetKey, setResetKey] = useState(0); // 重播 = 重建复现会话（引擎不可回退）
  const cursorRef = useRef(0); // 已消费的 choices 数
  const feedLockRef = useRef(false);

  const maxTurn = useMemo(() => (record ? maxTurnOf(record) : 0), [record]);
  const dex = useMemo(
    () => dexFor(record ? modOf(record.formatid) : (format?.mod ?? "gen9")),
    [record, format],
  );

  // 建立/销毁复现会话（仅 choices 模式）
  useEffect(() => {
    if (!record || !hasSim) return;
    const p1 = importShowdown(record.p1Team);
    const p2 = importShowdown(record.p2Team);
    const seed = JSON.parse(record.seed!) as [number, number, number, number];
    if (!p1 || !p2) return;
    const session = new BattleSession({
      formatid: record.formatid,
      teams: { p1, p2 },
      seed,
      names: { p1: record.p1Name, p2: record.p2Name },
    });
    cursorRef.current = 0;
    setCurTurn(0);
    setSnapshot(null);
    setSession(session);
    session.subscribe(setSnapshot);
    void session.start();
    return () => {
      session.destroy();
      setSession(null);
    };
  }, [record, hasSim, resetKey]);

  /** 消费 choices 直到目标回合（含）——按提交序直灌引擎，双方齐活自然结算 */
  const feedTo = useCallback(
    async (upToTurn: number) => {
      const s = session;
      const choices = record?.choices;
      if (!s || !choices) return;
      if (feedLockRef.current) return;
      feedLockRef.current = true;
      try {
        while (cursorRef.current < choices.length) {
          const c = choices[cursorRef.current]!;
          if (c.turn > upToTurn) break;
          await s.choose(c.side, c.input);
          cursorRef.current += 1;
        }
      } finally {
        feedLockRef.current = false;
      }
    },
    [record, session],
  );

  // 播放循环：倍速节拍逐回合推进（动画队列按自身节奏串播，回合推进略超前后台自然追上）
  useEffect(() => {
    if (!playing || !hasSim) return;
    const beat = Math.max(400, settings.animationSpeed * 2.2);
    const iv = window.setInterval(() => {
      setCurTurn((t) => {
        const next = t + 1;
        if (next > maxTurn) {
          setPlaying(false);
          return t;
        }
        void feedTo(next);
        return next;
      });
    }, beat);
    return () => window.clearInterval(iv);
  }, [playing, hasSim, maxTurn, settings.animationSpeed, feedTo]);

  if (!record) {
    return (
      <div className="page">
        <h1>回放</h1>
        <p className="muted">没有可回放的对局记录。</p>
        <button onClick={closeReplay}>返回记录</button>
      </div>
    );
  }

  const step = (delta: number) => {
    setPlaying(false);
    setCurTurn((t) => {
      const next = Math.max(0, Math.min(maxTurn, t + delta));
      if (delta > 0 && hasSim) void feedTo(next);
      return next;
    });
  };
  const jumpTo = (turn: number) => {
    setPlaying(false);
    const next = Math.max(0, Math.min(maxTurn, turn));
    if (hasSim && next === 0 && cursorRef.current > 0) {
      // 引擎不可回退：回到第 0 回合 = 重建复现会话
      setResetKey((k) => k + 1);
      return;
    }
    setCurTurn(next);
    if (hasSim) void feedTo(next);
  };

  const done = curTurn >= maxTurn;

  return (
    <div className="page page-replay">
      <div className="page-head-row">
        <h1>
          回放 · <span className="muted">{record.formatid}</span> · 第 {curTurn}/{maxTurn} 回合
          {!hasSim && <span className="muted">（日志揭示模式：该记录无指令序列，不重演舞台）</span>}
        </h1>
        <div className="grow" />
        <button onClick={closeReplay}>返回记录</button>
      </div>

      {/* 播放器控制条 */}
      <div className="replay-controls">
        <button className="mini" onClick={() => step(-1)} disabled={curTurn <= 0}>
          ◀ 上一回合
        </button>
        <button
          className="primary"
          onClick={() => (done ? jumpTo(0) : setPlaying((p) => !p))}
          title={hasSim ? "" : "旧记录/官方日志无指令序列，仅逐回合步进日志"}
        >
          {done ? "↺ 重播" : playing ? "⏸ 暂停" : "▶ 播放"}
        </button>
        <button className="mini" onClick={() => step(1)} disabled={done}>
          下一回合 ▶
        </button>
        <input
          type="range"
          min={0}
          max={maxTurn}
          value={curTurn}
          onChange={(e) => jumpTo(Number(e.target.value))}
          style={{ flex: 1 }}
        />
        <span className="muted">
          {record.winner} · {record.turns} 回合
        </span>
      </div>

      {hasSim ? (
        session && snapshot ? (
          <div className="battle-stage replay-stage">
            <div className="stage-mid">
              <BattleStagePane
                snapshot={snapshot}
                session={session}
                dex={dex}
                animation={settings.animation}
                animationSpeed={settings.animationSpeed}
                logLines={record.log}
                highlightTurn={curTurn}
              />
            </div>
          </div>
        ) : (
          <div className="empty-hint">复现会话启动中…</div>
        )
      ) : (
        <div className="battle-log standalone replay-log-reveal">
          <TurnLogReveal lines={record.log} uptoTurn={curTurn} />
        </div>
      )}
    </div>
  );
}

/** 日志揭示模式：只显示到当前回合的分组（含之前的全部回合），当前回合高亮 */
function TurnLogReveal(props: { lines: string[]; uptoTurn: number }): JSX.Element {
  const { lines, uptoTurn } = props;
  const shown = useMemo(() => {
    const groups = turnGroups(lines);
    const out: string[] = [];
    for (const g of groups) {
      if (g.turn != null && g.turn > uptoTurn) break;
      out.push(...g.lines);
      if (g.turn != null) out.push(`|turn|${g.turn}`);
    }
    return out;
  }, [lines, uptoTurn]);
  return <TurnLogView lines={shown} highlightTurn={uptoTurn} />;
}
