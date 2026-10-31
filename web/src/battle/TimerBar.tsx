/* TimerBar（RM-05）：VGC 计时训练——每指令 45s / 每局 7min / 总 20min。
 * 指令超时自动为待指令侧下 `pass`（引擎 choosePass 语义）；局/总超时仅横幅提示。
 * 仅在设置页「计时训练」开启时挂载。 */
import { useEffect, useRef, useState } from "react";
import type { BattleSession, SessionSnapshot, SideSlot } from "../engine-adapter";

const TURN_SECONDS = 45;
const BATTLE_SECONDS = 7 * 60;
const TOTAL_SECONDS = 20 * 60;

function fmt(s: number): string {
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

export function TimerBar({
  session,
  snapshot,
}: {
  session: BattleSession;
  snapshot: SessionSnapshot;
}): JSX.Element | null {
  const [turnLeft, setTurnLeft] = useState(TURN_SECONDS);
  const [battleLeft, setBattleLeft] = useState(BATTLE_SECONDS);
  const [totalLeft, setTotalLeft] = useState(TOTAL_SECONDS);
  const pendingKey = snapshot.pending.join(",");
  const lastKeyRef = useRef<string>("");
  const battleStartedRef = useRef(false);
  const passedRef = useRef(false);

  // 新指令请求到达（pending 集合变化且非空）→ 重置指令计时；局计时在第 1 回合启动
  useEffect(() => {
    if (snapshot.pending.length > 0 && pendingKey !== lastKeyRef.current) {
      setTurnLeft(TURN_SECONDS);
      passedRef.current = false;
    }
    lastKeyRef.current = pendingKey;
    if (snapshot.turn >= 1) battleStartedRef.current = true;
  }, [pendingKey, snapshot.pending.length, snapshot.turn]);

  // 指令超时：为所有待指令侧自动 pass（一次）
  useEffect(() => {
    if (turnLeft > 0 || snapshot.pending.length === 0 || passedRef.current) return;
    passedRef.current = true;
    for (const side of snapshot.pending as SideSlot[]) {
      void session.choose(side, "pass");
    }
  }, [turnLeft, snapshot.pending, session]);

  // 秒级 tick：三个倒计时统一推进
  useEffect(() => {
    if (snapshot.phase === "finished") return;
    const iv = window.setInterval(() => {
      setTurnLeft((s) => Math.max(0, s - 1));
      if (battleStartedRef.current) setBattleLeft((s) => Math.max(0, s - 1));
      setTotalLeft((s) => Math.max(0, s - 1));
    }, 1000);
    return () => window.clearInterval(iv);
  }, [snapshot.phase]);

  if (snapshot.phase === "finished") return null;
  const danger = (s: number) => (s <= 10 ? " timer-danger" : "");
  return (
    <div className="timer-bar" title="VGC 计时训练（设置页可关闭）">
      <span className={"timer-chip" + danger(turnLeft)}>
        ⏱ 指令 {fmt(turnLeft)}
        {snapshot.pending.length > 0 && turnLeft === 0 ? "（已自动换人/待机）" : ""}
      </span>
      <span className={"timer-chip" + danger(battleLeft)}>🏳 每局 {fmt(battleLeft)}</span>
      <span className={"timer-chip" + danger(totalLeft)}>⏳ 总计 {fmt(totalLeft)}</span>
      {(battleLeft === 0 || totalLeft === 0) && (
        <span className="timer-chip timer-danger">⏰ 时间到（VGC 口径超时）</span>
      )}
    </div>
  );
}
