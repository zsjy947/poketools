import { useEffect, useMemo, useState } from "react";
import { useApp } from "../store";
import {
  abilityList,
  abilityView,
  dexFor,
  itemList,
  learnableMoves,
  moveView,
  natureList,
  speciesView,
  STAT_ZH,
  TYPE_ZH,
} from "../../data";
import type { AbilityView, MoveView, SpeciesView } from "../../data";
import { FilterSelect } from "../../components/FilterSelect";
import { isHiddenFromRoster, rosterSpecies, speciesLabel } from "../data/roster";
import type { PokemonSet } from "../../engine-adapter";
import { blankSet, exportShowdown, normalizeLevelInput, validateTeam } from "../../team/showdown";
import type { ValidationResult } from "../../team/showdown";

/**
 * 队伍构建器（FR-02~05）：A/B 双槽位；编辑器（等级/IV/EV/性格/特性/道具/招式/太晶）；
 * Showdown 文本导入导出；按赛制实时合法性校验（中文错误提示）。
 * 选择器全部为可搜索列表（FilterSelect：名称包含即命中）；物种列表 = 赛制名册 −
 * 对战临时形态 − 等值重复形态（battle/data/roster.ts 单源），展示名「种名-形态短名」。
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

  /** 自由对战（customgame）引擎校验放行名册外物种，列表同步放开（仅排除临时/等值/机制形态） */
  const unrestricted = !!format && /customgame/.test(format.id);
  const roster = useMemo(() => rosterSpecies(dex, unrestricted), [dex, unrestricted]);
  const items = useMemo(() => itemList(dex), [dex]);
  const abilities = useMemo(() => abilityList(dex), [dex]);
  const natures = useMemo(() => natureList(), []);

  const team = teams[slot];
  const current = team.sets[editing] ?? null;
  const defaultLevel = format?.level ?? 50;

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
  /** 被过滤形态（临时/等值/名册外）：保留原数据仅禁止重选，给出可见中文提示 */
  const speciesHidden = !!currentSpecies && isHiddenFromRoster(currentSpecies, unrestricted);
  /** B10：宝可梦冠军赛制（Champions mod）无太晶机制，编辑器不渲染太晶下拉 */
  const hasTera = format?.mod === "gen9";
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

      <p className="muted" style={{ margin: "4px 0 0", fontSize: 12 }}>
        此处按「注册整队（最多 6
        只）」做官方全量校验；本局上阵数量与顺位在下一步「上阵预览」把关（单打 6 选 3 / 双打 6 选
        4）。
      </p>
      {(validation[slot]?.errors.length ?? 0) > 0 && (
        <div className="alert warn">
          <b>合法性校验（{format.zhName}，注册口径 = 整队 6 只）：</b>
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
            return (
              <div
                key={i}
                className={"team-mon" + (i === editing ? " on" : "")}
                onClick={() => setEditing(i)}
              >
                <span className="idx">{i + 1}</span>
                <span className="name">{speciesLabel(dex, s.species)}</span>
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
            <button
              className="team-add"
              onClick={() => {
                setTeam(slot, [...team.sets, blankSet("garchomp", defaultLevel)]);
                setEditing(team.sets.length);
              }}
            >
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
                  } else alert("导入失败：无法解析队伍文本（未识别到任何宝可梦）");
                }}
              >
                导入
              </button>
            </div>
          )}
        </div>

        {current && currentSpecies ? (
          <div className="mon-editor">
            {speciesHidden && (
              <div className="alert warn roster-hidden-tip">
                当前宝可梦（{speciesLabel(dex, current.species)}）不在该赛制的可选列表中
                （对战临时形态 / 等值重复形态 /
                名册外物种）：已有数据保留可用，重新选择后将切换为列表内形态。
              </div>
            )}
            {/* 基本信息两列紧凑网格：字段卡（label 上 / 控件下），不再一控件占满一行 */}
            <div className="ed-basic">
              <div className="ed-field ed-field-wide">
                <label>宝可梦</label>
                <FilterSelect
                  value={currentSpecies?.id ?? current.species}
                  onChange={(v) => {
                    // 切换物种：特性/招式随物种重置；昵称已移除，显示名恒为中文种名
                    patchSet({
                      species: String(v),
                      ability: "",
                      moves: ["", "", "", ""],
                      name: "",
                    });
                  }}
                  options={roster}
                  displayOf={(v) => speciesLabel(dex, String(v))}
                  render={(s: SpeciesView) => {
                    const label = speciesLabel(dex, s.id);
                    return { value: s.id, label, search: `${label} ${s.zhName} ${s.name}` };
                  }}
                  placeholder="搜索宝可梦…"
                />
              </div>
              <div className="ed-field">
                <label>性别</label>
                {/* 性别影响个别招式判定（如魅惑仅对异性生效）；导出为 PokePaste 的 (M)/(F) 后缀 */}
                <select
                  value={current.gender ?? ""}
                  onChange={(e) => patchSet({ gender: e.target.value })}
                >
                  <option value="">（默认）</option>
                  <option value="M">♂ 雄性</option>
                  <option value="F">♀ 雌性</option>
                </select>
              </div>
              <div className="ed-field">
                <label>
                  等级<span className="muted">（赛制默认 Lv.{defaultLevel}）</span>
                </label>
                {/* 非受控 + 编辑目标切换重建：键入即时生效（显示由浏览器持有，不受渲染快照回写）；
                    store 值随 onChange 同步归一写入（1~100 clamp，空串回赛制默认）。等级不随物种
                    切换变化，key 仅绑槽位即可（绑物种会在事件后渲染快照下重建并吞掉键入） */}
                <input
                  key={`lv-${slot}-${editing}`}
                  type="number"
                  min={1}
                  max={100}
                  defaultValue={current.level ?? defaultLevel}
                  onChange={(e) => {
                    patchSet({ level: normalizeLevelInput(e.target.value, defaultLevel) });
                  }}
                />
              </div>
              <div className="ed-field">
                <label>特性</label>
                <FilterSelect
                  value={current.ability}
                  onChange={(v) => patchSet({ ability: String(v) })}
                  options={abilityOptions(dex, currentSpecies, abilities)}
                  displayOf={(v) => abilityView(dex, String(v))?.zhName ?? String(v)}
                  render={(a: AbilityView) => ({ value: a.name, label: a.zhName })}
                  placeholder="搜索特性…"
                />
              </div>
              <div className="ed-field">
                <label>道具</label>
                <FilterSelect
                  value={current.item ?? ""}
                  onChange={(v) => patchSet({ item: String(v) })}
                  options={items}
                  displayOf={(v) => itemLabel(dex, String(v))}
                  render={(it) => ({
                    value: it.name,
                    label: (
                      <span className="item-opt">
                        <img
                          src={`/assets/items/${it.id}.png`}
                          alt=""
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = "none";
                          }}
                        />
                        {it.zhName}
                      </span>
                    ),
                    search: `${it.zhName} ${it.name}`,
                  })}
                  placeholder="搜索道具…"
                />
              </div>
              {hasTera && (
                <div className="ed-field">
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
              )}
            </div>

            <div className="ed-moves">
              {[0, 1, 2, 3].map((i) => (
                <div className="ed-field" key={i}>
                  <label>招式 {i + 1}</label>
                  <FilterSelect
                    value={current.moves[i] ?? ""}
                    onChange={(v) => {
                      const moves = [...current.moves];
                      moves[i] = String(v);
                      patchSet({ moves });
                    }}
                    options={currentMoves}
                    displayOf={(v) => moveLabel(dex, String(v))}
                    render={(m: MoveView) => ({
                      value: m.name,
                      label: (
                        <span className="mv-opt">
                          <span className="mv-opt-name">{m.zhName}</span>
                          <span className="mv-opt-meta muted">
                            <span className="mv-opt-type">{m.type}</span>
                            <span className="mv-opt-cat">{CATEGORY_ZH[m.category]}</span>
                            <span className="mv-opt-power">{m.basePower || "—"}</span>
                          </span>
                        </span>
                      ),
                      search: `${m.zhName} ${m.name}`,
                    })}
                    placeholder="搜索招式…"
                  />
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

const CATEGORY_ZH: Record<string, string> = {
  physical: "物理",
  special: "特殊",
  status: "变化",
};

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

/** 招式显示名（FilterSelect 收起态回显）：value 是招式英文名，反查中文 */
function moveLabel(dex: ReturnType<typeof import("../../data").dexFor>, moveName: string): string {
  const id = moveName.toLowerCase().replace(/ /g, "");
  return moveView(dex, id)?.zhName ?? moveName;
}

function reverseType(zh: string): string {
  const entry = Object.entries(TYPE_ZH).find(([, v]) => v === zh);
  return entry?.[0] ?? zh;
}
