/* 手机原生图鉴组件（mx- 前缀）：列表行 / 进度头 / 筛选抽屉 / 批量操作条。
 * 仅在 useIsMobile() 分支渲染，桌面端不出现这些 DOM；样式见 mobile-native.css。 */
import type { ReactNode } from "react";
import { TYPE_LIST } from "../data/api";
import type { FormBadge } from "../data/pokemon";
import { TypeBadge } from "./badges";
import { PokeImg, PokeToggle } from "./pokedex";

/** 图鉴条目（地区/全国共用字段子集） */
export interface MxEntry {
  ndex: number;
  species_id: number;
  name_zh: string;
  name_en: string;
  types: string;
  form_id: number;
  caught: boolean;
}

/** 紧凑进度头：标题 + 计数 + 线性进度条（替代桌面进度环，省竖屏空间） */
export function MxHead({
  title,
  caught,
  total,
  hint,
}: {
  title: string;
  caught: number;
  total: number;
  hint?: string;
}) {
  const pct = total ? Math.round((caught / total) * 100) : 0;
  return (
    <div className="mx-head">
      <div className="mx-head-row">
        <span className="mx-head-title">{title}</span>
        <span className="mx-head-num">
          <b>{caught}</b>/{total}
        </span>
      </div>
      <div className="mx-head-bar">
        <span style={{ width: pct + "%" }} />
      </div>
      {hint && <div className="mx-head-hint">{hint}</div>}
    </div>
  );
}

/** 图鉴列表行：编号 + 官方绘图 + 名称/属性 + 精灵球标记（批量模式下变为选择框） */
export function MxRow({
  e,
  markMode,
  checked,
  badges,
  extra,
  onToggle,
  onClick,
}: {
  e: MxEntry;
  markMode: boolean;
  checked?: boolean;
  badges?: Array<{ k: FormBadge; label: string }>;
  extra?: ReactNode;
  onToggle: () => void;
  onClick: () => void;
}) {
  return (
    <div
      className={"mx-row" + (markMode ? " markable" : "") + (checked ? " checked" : "")}
      onClick={onClick}
    >
      <span className="mx-ndex">#{String(e.ndex).padStart(4, "0")}</span>
      <PokeImg formId={e.form_id} size={52} />
      <span className="mx-info">
        <span className="mx-name">{e.name_zh}</span>
        <span className="mx-sub">
          {e.name_en}
          <TypeBadge types={e.types} plain />
          {badges && badges.length > 0 && (
            <span className="mx-badges">
              {badges.map((b) => (
                <span key={b.k} className={"nat-badge nb-" + b.k}>
                  {b.label}
                </span>
              ))}
            </span>
          )}
          {extra}
        </span>
      </span>
      {markMode ? (
        <span className={"mx-check" + (checked ? " on" : "")}>✓</span>
      ) : (
        <PokeToggle caught={e.caught} onToggle={onToggle} />
      )}
    </div>
  );
}

/** 底部抽屉（属性/世代筛选、整本批量入口） */
export function MxSheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  if (!open) return null;
  return (
    <>
      <div className="mx-mask" onClick={onClose} />
      <div className="mx-sheet">
        <div className="mx-sheet-head">
          <span>{title}</span>
          <button className="mx-sheet-x" onClick={onClose}>
            ✕
          </button>
        </div>
        {children}
      </div>
    </>
  );
}

/** 属性 chips 网格（点击选中再点取消；选中态着属性本色 --t） */
export function MxTypeGrid({ value, onPick }: { value: string; onPick: (t: string) => void }) {
  return (
    <div className="mx-chip-grid">
      {TYPE_LIST.map((t) => (
        <button
          key={t}
          className={"mx-type-chip" + (value === t ? " on" : "")}
          style={{ ["--t" as string]: `var(--type-${t})` }}
          onClick={() => onPick(value === t ? "" : t)}
        >
          {t}
        </button>
      ))}
    </div>
  );
}

/** 批量操作条（标记模式下吸底，位于底部导航之上） */
export function MxBulkBar({
  selected,
  total,
  onSelectAll,
  onBulk,
  onDone,
}: {
  selected: number;
  total: number;
  onSelectAll: () => void;
  onBulk: (caught: boolean) => void;
  onDone: () => void;
}) {
  return (
    <div className="mx-bulkbar">
      <span className="mx-bulkbar-num">
        已选 {selected}/{total}
      </span>
      <div className="mx-bulkbar-btns">
        <button className="mx-btn" onClick={onSelectAll}>
          {selected === total ? "取消全选" : "全选"}
        </button>
        <button className="mx-btn primary" disabled={!selected} onClick={() => onBulk(true)}>
          标记
        </button>
        <button className="mx-btn" disabled={!selected} onClick={() => onBulk(false)}>
          清除
        </button>
        <button className="mx-btn primary" onClick={onDone}>
          完成
        </button>
      </div>
    </div>
  );
}
