/* DamageQuickCheck（RM-06）：上阵预览页内嵌伤害速查——双方首位互算 4 招，
 * 直接复用 data/calc.ts 的 calcBatch（与计算器同一领域实现，无引擎/网络）。 */
import { useState } from "react";
import type { PokemonSet } from "../engine-adapter/vendor/ps-engine.js";
import { table } from "../data/core";
import { calcBatch } from "../data/calc";
import { koTextFromKo } from "../components/format";

type Phase = "idle" | "loading" | "done" | "error";

interface SideRow {
  /** 行归属方：镜像局（双方同一只）时两行 name 相同，React key 需 side 前缀去重（F-17） */
  side: "p1" | "p2";
  name: string;
  results: Array<{ move: string; text: string; cls: string }>;
}

/** PokemonSet（引擎形态）→ calcBatch side payload；物种/招式按中文/英文/id 三路匹配 */
async function setToCalcSide(set: PokemonSet) {
  const [forms, speciesRows, moves, natures] = await Promise.all([
    table("forms"),
    table("species"),
    table("moves"),
    table("natures"),
  ]);
  const full = (set.species || "").toLowerCase();
  let form = forms.find((f) => (f.identifier || "") === full) ?? undefined;
  let speciesId: number;
  if (form) {
    speciesId = form.species_id;
  } else {
    const sp = speciesRows.find((s) => s.identifier === full);
    if (!sp) throw new Error(`未识别宝可梦：${set.species}`);
    speciesId = sp.id;
    form = forms.find((f) => f.species_id === speciesId && f.is_default) ?? undefined;
  }
  let nature = (set.nature || "Serious").toLowerCase();
  if (!natures.some((n: any) => n.identifier === nature)) {
    const byZh = natures.find((n: any) => n.name_zh === set.nature);
    if (byZh) nature = byZh.identifier;
  }
  const resolveMove = (mv: string): number | null => {
    const m = moves.find(
      (x: any) => x.name_zh === mv || x.name_en === mv || x.identifier === mv.toLowerCase(),
    );
    return m ? m.id : null;
  };
  return {
    payload: {
      species_id: speciesId,
      form_id: form?.id,
      level: set.level ?? 50,
      nature,
      evs: set.evs || {},
      ivs: set.ivs || {},
      ability: set.ability || "",
      item: set.item || "",
    },
    moveIds: set.moves.map(resolveMove),
  };
}

function resultLine(r: any, move: string): { move: string; text: string; cls: string } {
  if (!r || r.error) return { move, text: "无法计算", cls: "muted" };
  if (r.pct_max === 0) return { move, text: "没有效果…", cls: "muted" };
  const koTxt = koTextFromKo(r.ko);
  return {
    move,
    text: `${r.min}~${r.max}（${r.pct_min}%~${r.pct_max}%）${koTxt ? "，" + koTxt : ""}`,
    cls: r.pct_max >= 100 ? "dqc-ko" : "",
  };
}

export function DamageQuickCheck({
  p1,
  p2,
}: {
  p1: PokemonSet[];
  p2: PokemonSet[];
}): JSX.Element | null {
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [err, setErr] = useState("");
  const [rows, setRows] = useState<SideRow[]>([]);

  if (p1.length === 0 || p2.length === 0) return null;

  async function run(): Promise<void> {
    setPhase("loading");
    setErr("");
    try {
      const a = await setToCalcSide(p1[0]!);
      const b = await setToCalcSide(p2[0]!);
      const resp = await calcBatch({
        attacker: a.payload,
        defender: b.payload,
        moves: {
          atk: a.moveIds.map((id) => (id ? { id } : null)),
          dfd: b.moveIds.map((id) => (id ? { id } : null)),
        },
      });
      const atkRows: Array<{ move: string; text: string; cls: string }> = resp.atk.results.map(
        (r: any, i: number) => resultLine(r, p1[0]!.moves[i] || ""),
      );
      const dfdRows: Array<{ move: string; text: string; cls: string }> = resp.dfd.results.map(
        (r: any, i: number) => resultLine(r, p2[0]!.moves[i] || ""),
      );
      setRows([
        {
          side: "p1",
          name: `${p1[0]!.name || p1[0]!.species} → ${p2[0]!.name || p2[0]!.species}`,
          results: atkRows,
        },
        {
          side: "p2",
          name: `${p2[0]!.name || p2[0]!.species} → ${p1[0]!.name || p1[0]!.species}`,
          results: dfdRows,
        },
      ]);
      setPhase("done");
    } catch (e) {
      setErr(String((e as Error).message || e));
      setPhase("error");
    }
  }

  return (
    <div className="dqc-block">
      <button className="pkt-btn pkt-btn-sm" onClick={() => setOpen(!open)}>
        {open ? "▾" : "▸"} 伤害速查（双方首发互算）
      </button>
      {open && (
        <div className="dqc-body">
          {phase === "idle" && (
            <button className="pkt-btn pkt-btn-sm primary" onClick={() => void run()}>
              计算（{p1[0]!.name || p1[0]!.species} vs {p2[0]!.name || p2[0]!.species}）
            </button>
          )}
          {phase === "loading" && <span className="muted">计算中…</span>}
          {phase === "error" && <span className="danger-text">速查失败：{err}</span>}
          {phase === "done" &&
            rows.map((side) => (
              <div key={`${side.side}-${side.name}`} className="dqc-side">
                <div className="dqc-head">{side.name}</div>
                {side.results.map((r, i) => (
                  <div key={i} className="dqc-line">
                    <span className="dqc-move">{r.move || "—"}</span>
                    <span className={"dqc-val " + r.cls}>{r.text}</span>
                  </div>
                ))}
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
