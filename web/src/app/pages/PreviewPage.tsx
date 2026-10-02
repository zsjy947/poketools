import { useMemo } from "react";
import { useApp } from "../store";
import { dexFor, displayName, itemView, moveView, speciesView, TYPE_ZH } from "../../data";
import { BattleSession } from "../../engine-adapter";
import type { PokemonSet } from "../../engine-adapter";
import { validateTeam } from "../../team/showdown";

/** 上阵预览（FR-06）：按赛制 6 选 4 / 6 选 3 的**有序**上阵选择（点击顺序 = 上阵顺位，
 * 上移/下移调整）+ OTS 信息展示 + 开局。顺位语义：单打第 1 只 = 首发、双打前 2 只 = 首发、
 * 末位存活者 = 索罗亚克幻觉伪装目标（按顺位打包发送引擎）。
 * 开赛校验 = 有序上阵数量 == 本局上阵数（bss 3 / 双打 4 / 其余整队）+
 * 对上阵子集的引擎条款校验（忽略 champions Flat Rules 的 Min Team Size —— 那是注册要求）。 */
export function PreviewPage(): JSX.Element {
  const format = useApp((s) => s.format);
  const teams = useApp((s) => s.teams);
  const picks = useApp((s) => s.picks);
  const togglePick = useApp((s) => s.togglePick);
  const movePick = useApp((s) => s.movePick);
  const attachSession = useApp((s) => s.attachSession);
  const go = useApp((s) => s.go);

  const maxPick = useMemo(() => {
    if (!format) return 4;
    if (format.id.includes("bss")) return 3;
    if (format.gameType === "双打" && format.pick === "自定义") return 6;
    if (format.gameType === "双打") return 4;
    if (format.pick === "自定义") return 6; // 自由对战整队（无上限语义按 6 展示）
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
    // 有序上阵子集（按顺位打包发送引擎）
    const p1 = pickSets(teams.A.sets, picks.p1);
    const p2 = pickSets(teams.B.sets, picks.p2);
    // 引擎条款校验（Min Team Size 是注册要求：上阵子集按本局上阵数放行）
    const [ok1, ok2] = await Promise.all([
      validatePickedSubset(format.id, pickSets(teams.A.sets, picks.p1)),
      validatePickedSubset(format.id, pickSets(teams.B.sets, picks.p2)),
    ]);
    if (!ok1.ok || !ok2.ok) {
      alert(`上阵阵容校验未通过：\n${[...ok1.errors, ...ok2.errors].join("\n")}`);
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
          disabled={picks.p1.length !== maxPick || picks.p2.length !== maxPick}
          onClick={() => void start()}
        >
          开始对战（OTS：双方阵容互见）
        </button>
      </div>
      <p className="muted pick-hint">
        点击顺序即上阵顺位：单打第 1 只 / 双打前 2
        只为首发；顺位末位存活者将作为索罗亚克「幻觉」的伪装目标。
      </p>
      <div className="preview-grid">
        {(["A", "B"] as const).map((k) => {
          const side = k === "A" ? "p1" : "p2";
          const dex = dexFor(format.mod);
          return (
            <div key={k} className={"preview-side side-" + side}>
              <h2>
                阵营 {k}（本局上阵 {picks[side].length}/{maxPick}
                <span className="muted"> · 已注册 {teams[k].sets.length} 只</span>）
              </h2>
              <div className="preview-list">
                {teams[k].sets.map((s, i) => {
                  const sp = speciesView(dex, s.species);
                  const order = picks[side].indexOf(i);
                  const on = order >= 0;
                  return (
                    <button
                      key={i}
                      className={"preview-mon" + (on ? " on" : "")}
                      onClick={() => togglePick(side, i, maxPick)}
                    >
                      <span className="name">
                        {order >= 0 && <b className="pick-order">{order + 1}.</b>}
                        {displayName(dex, s.species, s.name)}
                      </span>
                      <span className="muted">
                        {(sp?.types ?? []).map((t: string) => TYPE_ZH[t] ?? t).join("/")}
                      </span>
                      <span className="muted">
                        {s.item ? (itemView(dex, s.item)?.zhName ?? s.item) : "无道具"}
                      </span>
                      <span className="muted">
                        {(s.moves ?? [])
                          .filter(Boolean)
                          .map((m) => moveView(dex, m)?.zhName ?? m)
                          .join(" · ")}
                      </span>
                      {on && (
                        <span
                          className="pick-ops"
                          onClick={(e) => e.stopPropagation()}
                          role="group"
                          aria-label="顺位调整"
                        >
                          <button
                            className="mini"
                            disabled={order === 0}
                            onClick={() => movePick(side, i, -1)}
                          >
                            ↑
                          </button>
                          <button
                            className="mini"
                            disabled={order === picks[side].length - 1}
                            onClick={() => movePick(side, i, 1)}
                          >
                            ↓
                          </button>
                        </span>
                      )}
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

/** 有序上阵子集（点击顺序 = 顺位，不再排序） */
function pickSets(sets: PokemonSet[], picked: number[]): PokemonSet[] {
  if (picked.length === 0) return sets;
  return picked.map((i) => sets[i]).filter((x): x is PokemonSet => !!x);
}

/** 引擎条款校验（上阵子集）：忽略 Min Team Size（注册语义）与 bring at least（由本局上阵数把关） */
async function validatePickedSubset(
  formatId: string,
  sets: PokemonSet[],
): Promise<{ ok: boolean; errors: string[] }> {
  const r = await validateTeam(formatId, sets);
  if (r.ok) return r;
  const errors = r.errors.filter((e) => !e.includes("队伍至少需要"));
  return { ok: errors.length === 0, errors };
}

async function recordSeed(session: BattleSession): Promise<void> {
  // 开局即把会话桥到 store 快照流（BattleView 订阅）
  const { useApp: app } = await import("../store");
  const push = app.getState().pushSnapshot;
  session.subscribe(push);
}
