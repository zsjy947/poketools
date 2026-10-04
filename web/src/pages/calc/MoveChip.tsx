/* MoveChip（自 CalcPage.tsx 机械抽出，纯位移） */
import { SideState, exclusiveZHit } from "./model";

export function MoveChip({
  side,
  idx,
  zMeta,
  items,
  maxMeta,
  gmaxMeta,
  onToggleZ,
}: {
  side: SideState;
  idx: number;
  zMeta: any;
  items: any[];
  maxMeta: any[];
  gmaxMeta: any[];
  onToggleZ: () => void;
}): JSX.Element {
  void items;
  const move = side.moveOptions.find((m) => m.move_id === side.moves[idx]) || null;
  const zOn = !!side.zMarks[idx];
  const res = side.moveResults[idx];
  const maxNameMap: Record<string, string> = {};
  for (const m of maxMeta || []) maxNameMap[m.type_zh] = m.name_zh;
  const gmaxInfo = (() => {
    const f = side.forms.find((x) => x.id === side.formId);
    const ident = (f && f.identifier) || "";
    if (!ident.endsWith("-gmax")) return null;
    return (gmaxMeta || []).find((g) => g.form_identifier === ident) || null;
  })();
  const ex = move ? exclusiveZHit(side, move, zMeta) : null;
  const displayName = (() => {
    if (!move) return "";
    if (side.maxOn) {
      if (move.damage_class === "status") return "极巨防壁";
      if (gmaxInfo && gmaxInfo.type_zh === move.type_zh) return gmaxInfo.gmax_move_name;
      return maxNameMap[move.type_zh] || move.name_zh;
    }
    if (side.zMarks[idx] && move.power) {
      if (ex) return ex.z_move_name;
      const gz = ((zMeta && zMeta.generic) || []).find((x: any) => x.type === move.type_zh);
      if (gz) return gz.z_move_name;
    }
    return move.name_zh;
  })();
  const powerLabel = (() => {
    if (!move) return "";
    if (!move.power) return move.damage_class === "status" ? "变化" : "—";
    if (side.maxOn) return "威力自动";
    if (side.zMarks[idx]) {
      if (ex && ex.power) return ex.power;
      return "威力自动";
    }
    return move.power;
  })();
  const zIcon = (() => {
    if (!move) return "";
    if (ex && ex.crystal_identifier) return `/assets/items/${ex.crystal_identifier}.png`;
    const g = ((zMeta && zMeta.generic) || []).find((x: any) => x.type === move.type_zh);
    return g ? `/assets/items/${g.crystal_identifier}.png` : "";
  })();
  return (
    <div className={"move-chip" + (!move ? " empty" : "")}>
      {move ? (
        <>
          {zIcon && (
            <img
              className={"z-mark" + (zOn ? " on" : "")}
              src={zIcon}
              title={zOn ? "Z 招式已点亮（点击熄灭）" : "点亮 Z 招式（自动装备对应 Z 纯晶）"}
              onClick={(e) => {
                e.stopPropagation();
                onToggleZ();
              }}
            />
          )}
          <div className="mc-main">
            <span className="mc-name">{displayName}</span>
            <span className="mc-meta">
              {move.type_zh} {powerLabel}
            </span>
          </div>
          {res && !res.error ? (
            <span className="mc-dmg">
              {res.pct_min === res.pct_max ? `${res.pct_max}%` : `${res.pct_min}~${res.pct_max}%`}
            </span>
          ) : res && res.error ? (
            <span className="mc-dmg miss">—</span>
          ) : (
            <span className="mc-dmg" />
          )}
        </>
      ) : (
        <span className="mc-empty">招式 {idx + 1}</span>
      )}
    </div>
  );
}

/* ---- 编辑面板（U11：删平铺升降行，能力值表头加「等级」列） ---- */
