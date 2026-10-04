/* SummaryCard（自 CalcPage.tsx 机械抽出，纯位移） */
import { STAT_KEYS, STAT_ZH } from "../../data/api";
import { TypeBadge, formDisplayName } from "../../pkt/shared";
import { SideState } from "./model";
import { MoveChip } from "./MoveChip";

export function SummaryCard({
  side,
  which,
  isDefender,
  dmg,
  activeMoveIdx,
  zMeta,
  items,
  maxMeta,
  gmaxMeta,
  natures,
  onPickMove,
  onToggleMech,
  onToggleZ,
}: {
  side: SideState;
  which: "A" | "D";
  isDefender: boolean;
  dmg: any;
  activeMoveIdx: number;
  zMeta: any;
  items: any[];
  maxMeta: any[];
  gmaxMeta: any[];
  natures: any[];
  onPickMove: (which: "A" | "D", idx: number) => void;
  onToggleMech: (which: "A" | "D", mech: "tera" | "max") => void;
  onToggleZ: (which: "A" | "D", idx: number) => void;
}): JSX.Element {
  const f = side.forms.find((x) => x.id === side.formId);
  const fl = f ? formDisplayName(f) : "";
  const sideName = !side.nameZh
    ? ""
    : fl && f && !f.is_default && fl !== "默认形态"
      ? `${side.nameZh}·${fl}`
      : side.nameZh;
  const evSummary = (() => {
    const n = (natures || []).find((x) => x.identifier === side.nature);
    return STAT_KEYS.map((k) => {
      const mark = n && n.up === k ? "+" : n && n.down === k ? "-" : "";
      const ev = side.evs[k] ? String(side.evs[k]) : "";
      return ev + mark || mark || "";
    })
      .filter(Boolean)
      .join(" / ");
  })();
  function boostMark(k: string): string {
    const v = side.boosts[k] || 0;
    return v > 0 ? `(+${v})` : v < 0 ? `(${v})` : "";
  }
  return (
    <div className={"sum-card" + (isDefender ? " defending" : "")}>
      <div className="sum-top">
        <div className="sum-art">
          {side.formId && (
            <img
              className="poke-img"
              key={side.formId}
              src={`/pkt/${side.formId}.png`}
              style={{ width: 96, height: 96 }}
              loading="lazy"
              onError={(e) => (e.target as HTMLElement).classList.add("img-missing")}
            />
          )}
        </div>
        <div className="sum-info">
          <div className="sum-name">{sideName || "选择宝可梦"}</div>
          <TypeBadge types={(f && f.types) || ""} />
          <div className="sum-marks">
            <img
              className={"mech-icon" + (side.teraOn ? " on" : "")}
              src={`/assets/mechanism/tera_${side.teraType === "星晶" ? "星晶" : side.teraType}.png`}
              title={`太晶化 · ${side.teraType}`}
              onClick={() => onToggleMech(which, "tera")}
            />
            <img
              className={"mech-icon" + (side.maxOn ? " on" : "")}
              src="/assets/mechanism/dynamax.png"
              title="极巨化"
              onClick={() => onToggleMech(which, "max")}
            />
          </div>
          <div className="sum-tags">
            {side.ability && <span className="pkt-chip">{side.ability}</span>}
            {side.item && <span className="pkt-chip warning">{side.item}</span>}
            {side.teraOn && (
              <span
                className="pkt-chip dark"
                style={{ background: `var(--type-${side.teraType})` }}
              >
                太晶·{side.teraType}
              </span>
            )}
            {side.maxOn && <span className="pkt-chip dark t-danger">极巨化</span>}
          </div>
          {evSummary && <div className="sum-ev">{evSummary}</div>}
          {side.lastStats && (
            <div className="sum-stats">
              Lv.{side.level}：
              {STAT_KEYS.map((k) => (
                <span key={k} className="ss">
                  {STAT_ZH[k]}
                  {side.lastStats[k]}
                  {boostMark(k)}
                </span>
              ))}
            </div>
          )}
          {isDefender && dmg && !dmg.error && (
            <div className="hp-bar">
              <div className="hp-fill" style={{ right: `${100 - Math.min(100, dmg.pct_max)}%` }} />
              {dmg.pct_max >= 100 && <span className="hp-txt">击倒！</span>}
            </div>
          )}
        </div>
      </div>
      <div className="sum-moves">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className={"move-btn" + (activeMoveIdx === i ? " active" : "")}
            onClick={() => onPickMove(which, i)}
          >
            <MoveChip
              side={side}
              idx={i}
              zMeta={zMeta}
              items={items}
              maxMeta={maxMeta}
              gmaxMeta={gmaxMeta}
              onToggleZ={() => onToggleZ(which, i)}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---- 招式槽 ---- */
