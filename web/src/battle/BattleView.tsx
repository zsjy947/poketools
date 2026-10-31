import { useEffect, useMemo, useRef } from "react";
import { useApp } from "./store";
import { confirmBox } from "../components/shared";
import { dexFor } from "../data";
import { TimerBar } from "./TimerBar";
import type { StoredBattleRecord } from "./storage";
import { exportShowdown } from "../team/showdown";
import { BattleStagePane } from "./components/stage";
import { SideCommandPanel } from "./components/command-panel";

/**
 * 对战界面（FR-07/08/09）：单人操控双方（阵营切换 + 锁定态）、仿 Showdown 场地
 * （站位精灵/血条/状态）、招式/换人面板、完整日志回看；动画关闭自动降级信息流。
 *
 * 指令协议（sim/side.ts）：双打每回合每只在场宝可梦各一条指令（逗号连接）；
 * `move <序号> [+目标] [mega|zmove|dynamax|terastallize]`，目标正数=对手槽/负数=己方槽；
 * `team`/`switch` 指令编号均为 1 基。
 */
export function BattleView(): JSX.Element {
  const session = useApp((s) => s.session);
  const snapshot = useApp((s) => s.snapshot);
  const detachSession = useApp((s) => s.detachSession);
  const go = useApp((s) => s.go);
  const finishBattle = useApp((s) => s.finishBattle);
  const settings = useApp((s) => s.settings);
  const updateSettings = useApp((s) => s.updateSettings);
  const format = useApp((s) => s.format);
  const recordedRef = useRef(false);

  useEffect(() => {
    if (session && !snapshot) {
      // 会话快照桥（PreviewPage 已 subscribe，此处兜底重挂）
      session.subscribe((snap) => useApp.getState().pushSnapshot(snap));
    }
  }, [session, snapshot]);

  // 终局记录（FR-10）：seed + 指令序列随日志一并落盘（回放复现三件套）
  useEffect(() => {
    if (snapshot?.phase === "finished" && session && !recordedRef.current) {
      recordedRef.current = true;
      const record: StoredBattleRecord = {
        id: `r-${Date.now()}`,
        formatid: session.formatid,
        playedAt: Date.now(),
        winner: snapshot.winner ?? "未知",
        p1Name: "阵营 A",
        p2Name: "阵营 B",
        // 必须存实局上阵子集（session.battleTeams）：存注册整队会让回放的
        // team 指令命中错误子集，重演状态错位（见 plans/UI-FIXLIST A1）
        p1Team: exportShowdown(session.battleTeams.p1),
        p2Team: exportShowdown(session.battleTeams.p2),
        seed: session.seedUsed ? JSON.stringify(session.seedUsed) : undefined,
        turns: snapshot.turn,
        log: session.deterministicLog(),
        choices: [...session.choiceLog],
      };
      finishBattle(record);
    }
  }, [snapshot?.phase, snapshot?.winner, session, finishBattle, snapshot?.turn]);

  const dex = useMemo(() => dexFor(format?.mod ?? "gen9"), [format]);

  if (!session || !snapshot) {
    return (
      <div className="page">
        <h1>对战</h1>
        <p className="muted">当前没有进行中的对局。请从主页选择赛制 → 队伍编辑 → 上阵预览开始。</p>
        <button onClick={() => go("preview")}>前往上阵预览</button>
      </div>
    );
  }

  return (
    <div className="page page-battle">
      <div className="page-head-row">
        <h1>
          对战 · <span className="muted">{session.formatid}</span> · 第 {snapshot.turn} 回合
        </h1>
        <div className="grow" />
        <label className="anim-toggle">
          <input
            type="checkbox"
            checked={settings.animation}
            onChange={(e) => updateSettings({ animation: e.target.checked })}
          />
          动画演出
        </label>
        <button
          onClick={() => {
            // 未分出胜负的弃局不入对局记录——明示，避免误触丢局无感知
            if (
              snapshot.phase !== "finished" &&
              !confirmBox("本局尚未分出胜负，结束后不会保存到对局记录。确定结束？", "结束本局")
            ) {
              return;
            }
            detachSession();
            go("preview");
          }}
        >
          结束本局
        </button>
      </div>
      {settings.timers && snapshot.phase !== "finished" && (
        <TimerBar session={session} snapshot={snapshot} />
      )}

      {/* 一屏三栏：左右 = 阵营指令面板占全列高（无需下拉），中列 = 场地（上）+ 日志（下，居中收窄）。
          双侧指令面板同屏常驻，可同时为双方出招（引擎按侧收指令，两个独立输入通道） */}
      <div className="battle-stage">
        <div className="stage-side stage-side-p1">
          <SideCommandPanel side="p1" snapshot={snapshot} dex={dex} />
        </div>
        <div className="stage-mid">
          <BattleStagePane
            snapshot={snapshot}
            session={session}
            dex={dex}
            animation={settings.animation}
            animationSpeed={settings.animationSpeed}
          />
        </div>
        <div className="stage-side stage-side-p2">
          <SideCommandPanel side="p2" snapshot={snapshot} dex={dex} />
        </div>
      </div>
    </div>
  );
}

/**
 * 对战舞台中列（场地 + 回合日志）：实时对局与回放共用。
 * 内聚动画队列/引擎窥视/悬浮框/倒计时 chip；回放侧传完整记录日志（logLines）与
 * 当前回合高亮（highlightTurn），实时对局用快照 logTail。
 */

export { BattleStagePane } from "./components/stage";
export { liveMoveSlots } from "./components/command-panel";
