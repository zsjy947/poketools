import { useMemo } from "react";
import { useApp } from "../store";
import { dexFor, speciesView } from "../../data";
import { BattleSession } from "../../engine-adapter";
import type { PokemonSet } from "../../engine-adapter";
import { validateTeam } from "../../team/showdown";

/** 上阵预览（FR-06）：按赛制 6 选 4 / 6 选 3 选择出战成员 + OTS 信息展示 + 开局。 */
export function PreviewPage(): JSX.Element {
  const format = useApp((s) => s.format);
  const teams = useApp((s) => s.teams);
  const picks = useApp((s) => s.picks);
  const togglePick = useApp((s) => s.togglePick);
  const attachSession = useApp((s) => s.attachSession);
  const go = useApp((s) => s.go);

  const maxPick = useMemo(() => {
    if (!format) return 4;
    if (format.id.includes("bss")) return 3;
    if (format.gameType === "双打") return 4;
    return 6;
  }, [format]);

  if (!format) {
    return (
      <div className="page">
        <h1>上阵预览</h1>
        <p className="muted">请先选择赛制。</p>
      </div>
    );
  }

  const start = async () => {
    const p1 = pickSets(teams.A.sets, picks.p1);
    const p2 = pickSets(teams.B.sets, picks.p2);
    // 校验通过才允许开局（校验整队——引擎按全部 6 只校验条款）
    const ok1 = await validateTeam(
      format.id,
      teams.A.sets.filter((_, i) => picks.p1.includes(i)),
    );
    const ok2 = await validateTeam(
      format.id,
      teams.B.sets.filter((_, i) => picks.p2.includes(i)),
    );
    if (!ok1.ok || !ok2.ok) {
      alert(`队伍校验未通过：\n${[...ok1.errors, ...ok2.errors].join("\n")}`);
      return;
    }
    const session = new BattleSession({
      formatid: format.id,
      teams: { p1, p2 },
      names: { p1: "阵营 A", p2: "阵营 B" },
    });
    attachSession(session);
    await session.start();
    void recordSeed(session);
  };

  return (
    <div className="page page-preview">
      <div className="page-head-row">
        <h1>
          上阵预览 ·{" "}
          <span className="muted">
            {format.zhName}（{maxPick === 3 ? "6 选 3" : maxPick === 4 ? "6 选 4" : "整队"}）
          </span>
        </h1>
        <div className="grow" />
        <button onClick={() => go("team")}>返回队伍编辑</button>
        <button
          className="primary"
          disabled={picks.p1.length === 0 || picks.p2.length === 0}
          onClick={() => void start()}
        >
          开始对战（OTS：双方阵容互见）
        </button>
      </div>
      <div className="preview-grid">
        {(["A", "B"] as const).map((k) => {
          const side = k === "A" ? "p1" : "p2";
          const dex = dexFor(format.mod);
          return (
            <div key={k} className={"preview-side side-" + side}>
              <h2>
                阵营 {k}（已选 {picks[side].length}/{maxPick}）
              </h2>
              <div className="preview-list">
                {teams[k].sets.map((s, i) => {
                  const sp = speciesView(dex, s.species);
                  const on = picks[side].includes(i);
                  return (
                    <button
                      key={i}
                      className={"preview-mon" + (on ? " on" : "")}
                      onClick={() => togglePick(side, i, maxPick)}
                    >
                      <span className="name">{sp?.zhName ?? s.species}</span>
                      <span className="muted">{sp?.types.join("/")}</span>
                      <span className="muted">{s.item ?? "无道具"}</span>
                      <span className="muted">{(s.moves ?? []).filter(Boolean).join(" · ")}</span>
                    </button>
                  );
                })}
                {teams[k].sets.length === 0 && (
                  <p className="muted">队伍为空，请先在队伍编辑添加。</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function pickSets(sets: PokemonSet[], picked: number[]): PokemonSet[] {
  if (picked.length === 0) return sets;
  return picked.map((i) => sets[i]).filter((x): x is PokemonSet => !!x);
}

async function recordSeed(session: BattleSession): Promise<void> {
  // 开局即把会话桥到 store 快照流（BattleView 订阅）
  const { useApp: app } = await import("../store");
  const push = app.getState().pushSnapshot;
  session.subscribe(push);
}
