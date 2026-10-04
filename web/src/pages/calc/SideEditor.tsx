/* SideEditor（自 CalcPage.tsx 机械抽出，纯位移） */
import { useMemo } from "react";
import { STAT_KEYS, STAT_ZH, TYPE_LIST } from "../../data/api";
import { BATTLE_ITEM_IDS } from "../../data/battle-items";
import { formDisplayName, toast } from "../../pkt/shared";
import { SideState, isAutoEquipStone, isGmaxForm, isMegaForm, itemIdOf, loadSpeciesInto, zCrystalFor } from "./model";
import { FilterSelect } from "./FilterSelect";

export function SideEditor({
  side,
  which,
  label,
  speciesList,
  items,
  abilities,
  natures,
  setSide,
  zMeta,
}: {
  side: SideState;
  which: "A" | "D";
  label: string;
  speciesList: any[];
  items: any[];
  abilities: string[];
  natures: any[];
  setSide: (
    which: "A" | "D",
    patch: Partial<SideState> | ((s: SideState) => Partial<SideState>),
  ) => void;
  zMeta: any;
}): JSX.Element {
  const ownAbilities = side.forms.find((x) => x.id === side.formId)?.ability_list || [];
  /* U21：Z 招式点亮时自动装备的纯晶名（道具框锁标记用） */
  const zMarkIdx = side.zMarks.findIndex(Boolean);
  const zCrystalName =
    zMarkIdx >= 0
      ? zCrystalFor(
          side,
          side.moveOptions.find((m) => m.move_id === side.moves[zMarkIdx]),
          items,
          zMeta,
        )
      : "";
  /* 特性下拉分组：自身特性在前，其余为「其他特性」（特性互换/复制等场景），去掉重复项 */
  const ownAbilityNames = ownAbilities.map((a: any) => a.name);
  const abilityOptions = [
    ...ownAbilities.map((a: any) => ({ name: a.name, hidden: a.hidden, grp: "自身特性" })),
    ...abilities
      .filter((a) => !ownAbilityNames.includes(a))
      .map((a) => ({ name: a, hidden: false, grp: "其他特性" })),
  ];
  /* U20：下拉只列对战相关道具并剔除超级进化石（自动锁定）；items 完整表供自动装备查找 */
  const itemOptions = useMemo(
    () =>
      items.filter(
        (i) => BATTLE_ITEM_IDS.has(itemIdOf(i.identifier)) && !isAutoEquipStone(i.identifier),
      ),
    [items],
  );
  const megaStone = (() => {
    const f = side.forms.find((x) => x.id === side.formId);
    if (!f || !isMegaForm(f) || (f.identifier || "").startsWith("rayquaza")) return "";
    if (side.zLocked !== "mega") return "";
    return side.item || "";
  })();
  const evLeft = 510 - Object.values(side.evs).reduce((a, b) => a + b, 0);

  async function onSpecies(sid: number): Promise<void> {
    await loadSpeciesInto(
      (s) => setSide(which, s),
      () => side,
      sid,
    );
  }
  function onForm(fid: number): void {
    const f = side.forms.find((x) => x.id === fid);
    const patch: Partial<SideState> = { formId: fid, zLocked: null };
    if (f && isMegaForm(f) && !(f.identifier || "").startsWith("rayquaza")) {
      const stone = findStone(f);
      if (stone) {
        patch.item = stone;
        patch.zLocked = "mega";
      }
    }
    /* 超级进化形态重置互斥机制 */
    if (f && isMegaForm(f)) {
      patch.teraOn = false;
      patch.maxOn = false;
      patch.zMarks = [false, false, false, false];
    }
    if (f && isGmaxForm(f)) patch.maxOn = true;
    /* 换形态重选默认特性（首个非隐藏） */
    patch.ability =
      f && f.ability_list && f.ability_list.length
        ? (f.ability_list.find((a: any) => !a.hidden) || f.ability_list[0]).name
        : "";
    setSide(which, (s) => ({
      ...patch,
      moves: s.moves.map((id) =>
        id != null && s.moveOptions.some((m) => m.move_id === id) ? id : null,
      ),
    }));
    if ((f?.identifier || "").startsWith("rayquaza-mega")) ensureDragonAscent();
  }
  function findStone(f: any): string {
    const sp = side.nameZh;
    if (!sp) return "";
    const suf = /mega-x$/.test(f.identifier || "")
      ? "Ｘ"
      : /mega-y$/.test(f.identifier || "")
        ? "Ｙ"
        : /mega-z$/.test(f.identifier || "")
          ? "Ｚ"
          : "";
    const hit = (items || []).find(
      (i) => i.name_zh === sp + "进化石" + suf || (suf === "" && i.name_zh === sp + "进化石"),
    );
    return hit ? hit.name_zh : "";
  }
  function ensureDragonAscent(): void {
    const has =
      side.moveOptions.some((m) => m.name_zh === "画龙点睛") &&
      side.moves.some((id) =>
        side.moveOptions.some((m) => m.move_id === id && m.name_zh === "画龙点睛"),
      );
    if (!has) {
      const da = side.moveOptions.find((m) => m.name_zh === "画龙点睛");
      if (da) {
        setSide(which, (s) => ({ ...s, moves: [da.move_id, ...s.moves.slice(1)] }));
        toast("烈空座超级进化需要「画龙点睛」，已自动替换招式 1", "warning");
      }
    }
  }
  function onItemChange(v: string): void {
    setSide(which, (s) => {
      const patch: Partial<SideState> = { item: v };
      if (s.zLocked === "z") patch.zMarks = [false, false, false, false];
      if (s.zLocked === "z" || s.zLocked === "mega") patch.zLocked = null;
      return patch;
    });
  }
  function baseOf(k: string): number | null {
    const f = side.forms.find((x) => x.id === side.formId);
    return f ? f[k] : null;
  }
  function movePowerOf(mid: number | null | undefined): string {
    const m = side.moveOptions.find((x) => x.move_id === mid);
    if (!m) return "";
    return m.power ? `威力 ${m.power}` : m.damage_class === "status" ? "变化" : "变动威力";
  }
  function needsPower(mid: number | null | undefined): boolean {
    const m = side.moveOptions.find((x) => x.move_id === mid);
    return !!(m && !m.power && m.damage_class !== "status");
  }
  function formLabel(f: any): string {
    const fl = formDisplayName(f);
    return (
      (fl && fl !== "默认形态" ? fl : "默认形态") +
      (f.is_mega || /-mega|-gmax|-primal/.test(f.identifier || "") ? " ⭐" : "")
    );
  }

  return (
    <div className="block side-editor">
      <h3>{label}</h3>
      {/* U15：宝可梦/性格/特性/等级 同一行（选择框收窄，flex-wrap 兜底） */}
      <div className="fld-row">
        {/* U10：物种下拉 = 过滤 + 上限 80 + 编号右浮 */}
        <FilterSelect
          value={side.speciesId}
          onChange={(v) => void onSpecies(v)}
          options={speciesList}
          displayOf={(v) => speciesList.find((x) => x.id === v)?.name_zh ?? String(v ?? "")}
          placeholder="搜索宝可梦（全图鉴）"
          style={{ flex: "1 1 150px", minWidth: 140 }}
          render={(s) => ({
            value: s.id,
            search: `${s.name_zh} ${s.id}`,
            label: (
              <span style={{ display: "flex", justifyContent: "space-between" }}>
                <span>{s.name_zh}</span>
                <span style={{ color: "#999", fontSize: 12 }}>
                  #{String(s.id).padStart(4, "0")}
                </span>
              </span>
            ),
          })}
        />
        <span className="fld-pair">
          <span className="lbl">性格</span>
          <select
            className="pkt-select"
            style={{ width: 110 }}
            value={side.nature}
            onChange={(e) => setSide(which, { nature: e.target.value })}
          >
            {natures.map((n) => (
              <option key={n.identifier} value={n.identifier}>
                {n.name_zh}
                {n.up && n.up !== n.down ? `（+${STAT_ZH[n.up]} -${STAT_ZH[n.down]}）` : ""}
              </option>
            ))}
          </select>
        </span>
        <span className="fld-pair">
          <span className="lbl">特性</span>
          {/* U10：全量特性下拉 = 过滤 + 上限 80；U15：自身特性/其他特性分组 */}
          <FilterSelect
            value={side.ability}
            onChange={(v) => setSide(which, { ability: v })}
            options={abilityOptions}
            placeholder="搜索特性"
            style={{ width: 120 }}
            render={(a: any) => ({
              value: a.name,
              search: a.name,
              label: a.grp === "自身特性" && a.hidden ? a.name + "（隐藏）" : a.name,
            })}
          />
        </span>
        <span className="fld-pair">
          <span className="lbl">等级</span>
          <input
            type="number"
            className="pkt-input"
            style={{ width: 64 }}
            min={1}
            max={100}
            value={side.level}
            onChange={(e) => setSide(which, { level: Number(e.target.value) })}
          />
        </span>
      </div>
      {/* U15：形态/太晶属性/道具 同一行 */}
      <div className="fld-row">
        {side.forms.length > 1 && (
          <span className="fld-pair">
            <span className="lbl">形态</span>
            <select
              className="pkt-select"
              style={{ flex: 1, minWidth: 130 }}
              value={side.formId ?? undefined}
              onChange={(e) => onForm(Number(e.target.value))}
            >
              {side.forms.map((f) => (
                <option key={f.id} value={f.id}>
                  {formLabel(f)}
                </option>
              ))}
            </select>
          </span>
        )}
        <span className="fld-pair">
          <span className="lbl">太晶属性</span>
          <select
            className="pkt-select"
            style={{ width: 110 }}
            value={side.teraType}
            onChange={(e) => setSide(which, { teraType: e.target.value })}
          >
            {TYPE_LIST.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
            <option value="星晶">星晶</option>
          </select>
        </span>
        <span className="fld-pair" style={{ flex: 1, minWidth: 170 }}>
          <span className="lbl">道具</span>
          {/* U10/U20：道具下拉 = 对战相关可携带道具（无超级进化石）+ 过滤上限 80 + 图标 */}
          <FilterSelect
            value={side.item}
            onChange={onItemChange}
            options={itemOptions}
            limit={600}
            placeholder="搜索道具"
            style={{ flex: 1, minWidth: 90 }}
            adornment={
              megaStone ? (
                <span className="fselect-lock" title={`超级进化形态自动装备：${megaStone}`}>
                  🔒
                </span>
              ) : zCrystalName ? (
                <span className="fselect-lock" title={`Z 招式已自动装备：${zCrystalName}`}>
                  🔒
                </span>
              ) : null
            }
            render={(i) => ({
              value: i.name_zh,
              search: `${i.name_zh} ${i.identifier}`,
              label: (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                  <img
                    className="item-icon"
                    src={`/assets/items/${i.identifier}.png`}
                    width={18}
                    height={18}
                    onError={(e) => ((e.target as HTMLElement).style.visibility = "hidden")}
                  />
                  {i.name_zh}
                </span>
              ),
            })}
          />
        </span>
      </div>

      <div className="editor-moves">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="fld-row">
            <span className="lbl">招式{i + 1}</span>
            <FilterSelect
              value={side.moves[i]}
              onChange={(v) =>
                setSide(which, (s: SideState) => {
                  const moves = [...s.moves];
                  moves[i] = v;
                  return { moves };
                })
              }
              options={side.moveOptions}
              displayOf={(v) =>
                side.moveOptions.find((x) => x.move_id === v)?.name_zh ?? String(v ?? "")
              }
              placeholder="搜索招式（含变化招式）"
              render={(m) => ({
                value: m.move_id,
                search: `${m.name_zh} ${m.type_zh}`,
                label: (
                  <span style={{ display: "flex", justifyContent: "space-between" }}>
                    <span>{m.name_zh}</span>
                    <span style={{ color: "#999", fontSize: 12 }}>
                      {m.type_zh} ·{" "}
                      {
                        (
                          { physical: "物理", special: "特殊", status: "变化" } as Record<
                            string,
                            string
                          >
                        )[m.damage_class]
                      }
                      {" · "}
                      {m.power || (m.damage_class === "status" ? "变化" : "—")} · 世代
                      {m.gens.join(",")}
                    </span>
                  </span>
                ),
              })}
            />
            {needsPower(side.moves[i]) ? (
              <input
                type="number"
                className="pkt-input w96"
                min={1}
                max={250}
                placeholder="威力"
                value={side.varPowers[side.moves[i]!] ?? ""}
                onChange={(e) =>
                  setSide(which, (s: SideState) => ({
                    varPowers: { ...s.varPowers, [s.moves[i]!]: Number(e.target.value) },
                  }))
                }
              />
            ) : (
              <span className="mv-power">{movePowerOf(side.moves[i])}</span>
            )}
          </div>
        ))}
      </div>

      {/* U16：能力值表 —— 表头与单元格对齐（努力值跨滑条+数字两列）；等级变化列移到最后 */}
      <div className="stat-table">
        <div className="st-head">
          <span /> <span>种族</span>
          <span style={{ gridColumn: "3 / span 2" }}>努力值</span>
          <span>实际值</span>
          <span>等级变化</span>
        </div>
        {STAT_KEYS.map((k) => (
          <div key={k} className="st-row">
            <span className="st-k">{STAT_ZH[k]}</span>
            <span className="st-base">{baseOf(k) ?? "—"}</span>
            {/* U11：收窄努力值滑条 */}
            <input
              type="range"
              className="st-slider"
              min={0}
              max={252}
              step={4}
              value={side.evs[k]}
              onChange={(e) =>
                setSide(which, (s) => ({ evs: { ...s.evs, [k]: Number(e.target.value) } }))
              }
            />
            <span className="st-ev">{side.evs[k]}</span>
            <span className="st-actual">{side.lastStats ? side.lastStats[k] : "—"}</span>
            {k === "atk" || k === "spa" || k === "def" || k === "spd" ? (
              <select
                className="pkt-select st-boost"
                value={side.boosts[k]}
                onChange={(e) =>
                  setSide(which, (s) => ({ boosts: { ...s.boosts, [k]: Number(e.target.value) } }))
                }
              >
                {[-6, -5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5, 6].map((v) => (
                  <option key={v} value={v}>
                    {v > 0 ? `+${v}` : v}
                  </option>
                ))}
              </select>
            ) : (
              <span className="st-boost">—</span>
            )}
          </div>
        ))}
        <div className="ev-left">剩余努力值 {evLeft}/510</div>
      </div>
    </div>
  );
}

/* ---- 场地与状态区（U12 击中要害撑满行；U13 gap 收紧 8px） ---- */
