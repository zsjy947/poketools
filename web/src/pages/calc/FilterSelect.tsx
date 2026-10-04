/* FilterSelect（自 CalcPage.tsx 机械抽出，纯位移） */
import { Fragment, useMemo, useState } from "react";

export function FilterSelect({
  value,
  onChange,
  options,
  render,
  placeholder,
  limit = 80,
  style,
  displayOf,
  adornment,
}: {
  value: any;
  onChange: (v: any) => void;
  options: any[];
  render: (o: any) => { value: any; label: React.ReactNode; search?: string };
  placeholder?: string;
  limit?: number;
  style?: React.CSSProperties;
  /** 收起态回显文本（value 非自描述时必传，如物种 id → 中文名） */
  displayOf?: (v: any) => string;
  /** 框内右缘固定饰件（如 mega 锁图标），不随输入变化、不占外部宽度 */
  adornment?: React.ReactNode;
}): JSX.Element {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const filtered = useMemo(() => {
    if (!q) return options.slice(0, limit);
    const kw = q.toLowerCase();
    return options
      .filter((o) => {
        const r = render(o);
        return (
          String(r.search ?? String(r.value))
            .toLowerCase()
            .includes(kw) ||
          String(typeof r.label === "string" ? r.label : (r.search ?? "")).includes(q)
        );
      })
      .slice(0, limit);
  }, [options, q, limit, render]);
  return (
    <div className="fselect" style={style}>
      <input
        className={"pkt-input w-full" + (adornment ? " fselect-input-adorn" : "")}
        placeholder={placeholder || "搜索…"}
        value={open ? q : displayOf ? displayOf(value) : String(value ?? "")}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
      />
      {adornment}
      {open && (
        <div className="fselect-list">
          {/* 选项带 grp 字段时按组渲染非交互分组头（如特性：自身特性/其他特性） */}
          {filtered.map((o, i) => {
            const r = render(o);
            const showGrp = o.grp && (i === 0 || filtered[i - 1]!.grp !== o.grp);
            return (
              <Fragment key={String(r.value)}>
                {showGrp && <div className="fselect-grp">{o.grp}</div>}
                <div
                  className={"fselect-opt" + (r.value === value ? " on" : "")}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    onChange(r.value);
                    setOpen(false);
                    setQ("");
                  }}
                >
                  {r.label}
                </div>
              </Fragment>
            );
          })}
          {!filtered.length && <div className="fselect-opt empty">无匹配项</div>}
        </div>
      )}
    </div>
  );
}
