import { useEffect, useMemo, useState } from "react";
import { useApp } from "../store";
import {
  abilityList,
  abilityView,
  dexFor,
  itemList,
  learnableMoves,
  natureList,
  speciesList,
  speciesView,
  STAT_ZH,
  TYPE_ZH,
} from "../../data";
import type { AbilityView, MoveView, SpeciesView } from "../../data";
import type { PokemonSet } from "../../engine-adapter";
import { blankSet, exportShowdown, validateTeam } from "../../team/showdown";
import type { ValidationResult } from "../../team/showdown";

/**
 * 队伍构建器（FR-02~05）：A/B 双槽位；编辑器（等级/IV/EV/性格/特性/道具/招式/太晶）；
 * Showdown 文本导入导出；按赛制实时合法性校验（中文错误提示）。
 */
export function TeamBuilderPage(): JSX.Element {
  const format = useApp((s) => s.format);
  const teams = useApp((s) => s.teams);
  const setTeam = useApp((s) => s.setTeam);
  const importTeam = useApp((s) => s.importTeam);
  const go = useApp((s) => s.go);
  const [slot, setSlot] = useState<"A" | "B">("A");
  const [editing, setEditing] = useState<number>(0);
  const [importText, setImportText] = useState("");
  const [showImport, setShowImport] = useState(false);
  const [validation, setValidation] = useState<Record<"A" | "B", ValidationResult | null>>({
    A: null,
    B: null,
  });

  const mod = format?.mod ?? "gen9";
  const dex = useMemo(() => dexFor(mod), [mod]);

  const species = useMemo(() => speciesList(dex), [dex]);
  const items = useMemo(() => itemList(dex), [dex]);
  const abilities = useMemo(() => abilityList(dex), [dex]);
  const natures = useMemo(() => natureList(), []);

  const team = teams[slot];
  const current = team.sets[editing] ?? null;

  useEffect(() => {
    void (async () => {
      if (!format) return;
      const [va, vb] = await Promise.all([
        validateTeam(format.id, teams.A.sets),
        validateTeam(format.id, teams.B.sets),
      ]);
      setValidation({ A: va, B: vb });
    })();
  }, [format, teams]);

  const patchSet = (patch: Partial<PokemonSet>) => {
    if (!current) return;
    const sets = team.sets.map((s, i) => (i === editing ? { ...s, ...patch } : s));
    setTeam(slot, sets);
  };

  const patchIv = (k: string, v: number) => {
    if (!current) return;
    patchSet({ ivs: { ...current.ivs, [k]: v } });
  };
  const patchEv = (k: string, v: number) => {
    if (!current) return;
    patchSet({ evs: { ...current.evs, [k]: v } });
  };

  const copySlot = (from: "A" | "B") => {
    const other = from === "A" ? "B" : "A";
    setTeam(
      other,
      teams[from].sets.map((s) => ({ ...s })),
    );
  };
  const clearSlot = () => setTeam(slot, []);

  const currentSpecies = current ? speciesView(dex, current.species) : null;
  const currentMoves: MoveView[] = useMemo(
    () => (current ? learnableMoves(dex, current.species) : []),
    [dex, current?.species],
  );

  if (!format) {
    return (
      <div className="page">
        <h1>队伍编辑</h1>
        <p className="muted">请先在主页选择赛制。</p>
        <button onClick={() => go("home")}>返回主页</button>
      </div>
    );
  }

  return (
    <div className="page page-team">
      <div className="page-head-row">
        <h1>
          队伍编辑 · <span className="muted">{format.zhName}</span>
        </h1>
        <div className="slot-tabs">
          {(["A", "B"] as const).map((k) => (
            <button
              key={k}
              className={slot === k ? "on" : ""}
              onClick={() => {
                setSlot(k);
                setEditing(0);
              }}
            >
              阵营 {k}（{teams[k].sets.length} 只）
              {validation[k] && (validation[k] as ValidationResult).ok ? " ✓" : ""}
            </button>
          ))}
        </div>
        <div className="grow" />
        <button onClick={() => copySlot(slot)}>复制到另一槽</button>
        <button onClick={clearSlot}>清空</button>
        <button className="primary" onClick={() => go("preview")}>
          下一步：上阵预览
        </button>
      </div>

      {(validation[slot]?.errors.length ?? 0) > 0 && (
        <div className="alert warn">
          <b>合法性校验（{format.zhName}）：</b>
          <ul>
            {validation[slot]?.errors.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="team-layout">
        <div className="team-list">
          {team.sets.map((s, i) => {
            const sp = speciesView(dex, s.species);
            return (
              <div
                key={i}
                className={"team-mon" + (i === editing ? " on" : "")}
                onClick={() => setEditing(i)}
              >
                <span className="idx">{i + 1}</span>
                <span className="name">{sp?.zhName ?? s.species}</span>
                <span className="muted">{s.item ? `@ ${itemLabel(dex, s.item)}` : ""}</span>
                <button
                  className="mini danger"
                  onClick={(e) => {
                    e.stopPropagation();
                    setTeam(
                      slot,
                      team.sets.filter((_, j) => j !== i),
                    );
                    if (editing >= team.sets.length - 1) setEditing(Math.max(0, editing - 1));
                  }}
                >
                  删除
                </button>
              </div>
            );
          })}
          {team.sets.length < 6 && (
            <button className="team-add" onClick={() => setTeam(slot, [...team.sets, blankSet()])}>
              + 添加宝可梦
            </button>
          )}
          <div className="io-row">
            <button
              onClick={() => {
                void navigator.clipboard?.writeText(exportShowdown(team.sets));
              }}
            >
              导出到剪贴板
            </button>
            <button onClick={() => setShowImport(!showImport)}>导入 / 粘贴</button>
            <button
              onClick={() => {
                const blob = new Blob([exportShowdown(team.sets)], { type: "text/plain" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `team-${slot}.txt`;
                a.click();
                URL.revokeObjectURL(url);
              }}
            >
              导出文件
            </button>
          </div>
          {showImport && (
            <div className="import-box">
              <textarea
                value={importText}
                onChange={(e) => setImportText(e.target.value)}
                placeholder="粘贴 Showdown 队伍文本（PokePaste 格式）…"
                rows={8}
              />
              <button
                className="primary"
                onClick={() => {
                  if (importTeam(slot, importText)) {
                    setShowImport(false);
                    setImportText("");
                  } else alert("导入失败：无法解析队伍文本");
                }}
              >
                导入
              </button>
            </div>
          )}
        </div>

        {current && currentSpecies ? (
          <div className="mon-editor">
            <div className="ed-row">
              <label>宝可梦</label>
              <select
                value={current.species}
                onChange={(e) =>
                  patchSet({ species: e.target.value, ability: "", moves: ["", "", "", ""] })
                }
              >
                {species
                  .filter((s) => !s.isMega || format.mod !== "gen9")
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.zhName}（{s.num}）
                    </option>
                  ))}
              </select>
            </div>
            <div className="ed-row">
              <label>昵称</label>
              <input
                value={current.name ?? ""}
                onChange={(e) => patchSet({ name: e.target.value })}
                placeholder="默认为物种名"
              />
              <label>等级</label>
              <input
                type="number"
                min={1}
                max={100}
                value={current.level ?? 50}
                onChange={(e) => patchSet({ level: Number(e.target.value) || 50 })}
              />
            </div>
            <div className="ed-row">
              <label>特性</label>
              <select
                value={current.ability}
                onChange={(e) => patchSet({ ability: e.target.value })}
              >
                <option value="">（选择特性）</option>
                {abilityOptions(dex, currentSpecies, abilities).map((a) => (
                  <option key={a.id} value={a.name}>
                    {a.zhName}
                  </option>
                ))}
              </select>
            </div>
            <div className="ed-row">
              <label>道具</label>
              <select
                value={current.item ?? ""}
                onChange={(e) => patchSet({ item: e.target.value })}
              >
                <option value="">（无道具）</option>
                {items.map((it) => (
                  <option key={it.id} value={it.name}>
                    {it.zhName}
                  </option>
                ))}
              </select>
              <label>太晶属性</label>
              <select
                value={current.teraType ?? ""}
                onChange={(e) => patchSet({ teraType: e.target.value })}
              >
                <option value="">（无）</option>
                {Object.values(TYPE_ZH).map((t) => (
                  <option key={t} value={reverseType(t)}>
                    {t}
                  </option>
                ))}
              </select>
            </div>

            <div className="ed-moves">
              {[0, 1, 2, 3].map((i) => (
                <div className="ed-row" key={i}>
                  <label>招式 {i + 1}</label>
                  <select
                    value={current.moves[i] ?? ""}
                    onChange={(e) => {
                      const moves = [...current.moves];
                      moves[i] = e.target.value;
                      patchSet({ moves });
                    }}
                  >
                    <option value="">（空）</option>
                    {currentMoves.map((m) => (
                      <option key={m.id} value={m.name}>
                        {m.zhName}（{m.type}·
                        {m.category === "physical"
                          ? "物理"
                          : m.category === "special"
                            ? "特殊"
                            : "变化"}
                        ·威力 {m.basePower || "—"}）
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>

            <div className="ed-stats">
              <div className="st-head">
                <span />
                <span>种族</span>
                <span>个体值</span>
                <span>努力值</span>
              </div>
              {(["hp", "atk", "def", "spa", "spd", "spe"] as const).map((k) => (
                <div className="st-line" key={k}>
                  <span className="st-k">{STAT_ZH[k]}</span>
                  <span className="st-base">{currentSpecies.baseStats[k]}</span>
                  <input
                    type="number"
                    min={0}
                    max={31}
                    value={current.ivs?.[k] ?? 31}
                    onChange={(e) => patchIv(k, Number(e.target.value) || 0)}
                  />
                  <input
                    type="number"
                    min={0}
                    max={252}
                    step={4}
                    value={current.evs?.[k] ?? 0}
                    onChange={(e) => patchEv(k, Number(e.target.value) || 0)}
                  />
                </div>
              ))}
              <div className="st-line">
                <span className="st-k">性格</span>
                <select
                  value={current.nature ?? "Serious"}
                  onChange={(e) => patchSet({ nature: e.target.value })}
                >
                  {natures.map((n) => (
                    <option key={n.id} value={n.name}>
                      {n.zhName}
                      {n.plus ? `（+${n.plus} -${n.minus}）` : ""}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        ) : (
          <div className="mon-editor empty muted">从左侧选择或添加一只宝可梦开始编辑。</div>
        )}
      </div>
    </div>
  );
}

function abilityOptions(
  dex: ReturnType<typeof import("../../data").dexFor>,
  sp: SpeciesView,
  all: AbilityView[],
): AbilityView[] {
  const spAbilities = sp.abilities
    .map((a) => abilityView(dex, a.toLowerCase().replace(/ /g, "")))
    .filter(Boolean) as AbilityView[];
  if (spAbilities.length > 0) return spAbilities;
  return all.slice(0, 50);
}

function itemLabel(dex: ReturnType<typeof import("../../data").dexFor>, itemName: string): string {
  const it = itemList(dex).find(
    (i) => i.name === itemName || i.id === itemName.toLowerCase().replace(/ /g, ""),
  );
  return it?.zhName ?? itemName;
}

function reverseType(zh: string): string {
  const entry = Object.entries(TYPE_ZH).find(([, v]) => v === zh);
  return entry?.[0] ?? zh;
}
