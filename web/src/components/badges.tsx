/* Monoline 图标、游戏商标图标与属性/招式分类徽章（自 components/shared.tsx 拆出） */

/* ---- Monoline 图标（viewBox 24 / stroke 2 / round / fill none / currentColor） ---- */
const MONO_ICONS: Record<string, string> = {
  dex:
    '<path d="M12 7C10 5.4 7.2 4.8 4 4.8v13.4c3.2 0 6 .6 8 2.2 2-1.6 4.8-2.2 8-2.2V4.8c-3.2 0-6 .6-8 2.2z"/>' +
    '<path d="M12 7v13.4"/><circle cx="12" cy="12.6" r="1.6"/>',
  ev:
    '<path d="M4 20.2h16"/><rect x="5" y="13.6" width="3.6" height="6.6" rx="1"/>' +
    '<rect x="10.2" y="9.6" width="3.6" height="10.6" rx="1"/>' +
    '<rect x="15.4" y="5.6" width="3.6" height="14.6" rx="1"/>',
  sandwich:
    '<rect x="4" y="4.8" width="16" height="4.6" rx="2.3"/>' +
    '<rect x="5.6" y="10.8" width="12.8" height="2.8" rx="1.4"/>' +
    '<rect x="4" y="15" width="16" height="4.6" rx="2.3"/>',
  donut:
    '<circle cx="12" cy="12.6" r="8.4"/><circle cx="12" cy="12.6" r="3.2"/>' +
    '<path d="M6.6 8.4a6.6 6.6 0 0 1 10.8 0"/>',
  curry:
    '<path d="M4 10.2h16v2.8a7 7 0 0 1-7 7h-2a7 7 0 0 1-7-7z"/>' +
    '<path d="M1.8 10.2h2.8M19.4 10.2h2.8"/><path d="M9.4 4.2c.7.7.7 1.6 0 2.3M13.6 4.2c.7.7.7 1.6 0 2.3M11.5 2.6v1.2"/>',
  calc:
    '<rect x="5" y="3" width="14" height="18" rx="2"/>' +
    '<rect x="7.6" y="5.6" width="8.8" height="3.4" rx="0.8"/>' +
    '<path d="M8.8 13.2v.01M15.2 13.2v.01M8.8 17.4v.01M15.2 17.4v.01"/>',
  /* U1：完整交叉双剑（护手/剑柄/双刃交叉，密度对齐 games/calc） */
  battle:
    '<path d="M4.2 3.2 5.6 3l10.9 10.9 2.3-2.3 2 2-2.2 2.2 2.2 2.2-1.4 1.4-2.2-2.2-2.2 2.2-2-2 2.3-2.3L4.4 4.6z" fill="currentColor" stroke="none"/>' +
    '<path d="M3.2 19.8l3.2-3.2M6.4 16.6l1.8 1.8"/>',
  games:
    '<rect x="2.6" y="7.2" width="18.8" height="10.4" rx="5.2"/>' +
    '<path d="M7.2 10.2v4.2M5.1 12.3h4.2"/><path d="M15.4 10.8v.01M17.6 13.6v.01"/>',
  home: '<path d="M3.8 11.2L12 4l8.2 7.2"/><path d="M5.8 9.6V20h12.4V9.6"/><path d="M10 20v-5.4h4V20"/>',
  back: '<path d="M19 12H5"/><path d="M11 5.4L4.4 12l6.6 6.6"/>',
};

export function MonoIcon({ name, size = 22 }: { name: string; size?: number }): JSX.Element {
  return (
    <svg
      className="mono-icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      dangerouslySetInnerHTML={{ __html: MONO_ICONS[name] || "" }}
    />
  );
}

/* ---- 官方简中商标图标（双版本游戏两枚；U2 竖排形态由 CSS 控制） ---- */
const GAME_ICONS: Record<string, string[]> = {
  "sword-shield": ["sword", "shield"],
  "brilliant-diamond-shining-pearl": ["diamond", "pearl"],
  "legends-arceus": ["arceus"],
  "scarlet-violet": ["scarlet", "violet"],
  "legends-za": ["za"],
};

export function GameIcons({ gid, h = 22 }: { gid: string; h?: number }): JSX.Element {
  return (
    <span className="game-icons" style={{ height: h + "px" }}>
      {(GAME_ICONS[gid] || []).map((k) => (
        <img
          key={k}
          className="game-logo"
          src={`/assets/games/${k}.webp`}
          style={{ height: h + "px" }}
          alt={gid}
          loading="lazy"
          onError={(e) => {
            (e.target as HTMLElement).style.display = "none";
          }}
        />
      ))}
    </span>
  );
}
export function isDualGame(gid: string): boolean {
  return (
    gid === "sword-shield" || gid === "brilliant-diamond-shining-pearl" || gid === "scarlet-violet"
  );
}

/* ---- 属性徽章（雪碧图图标） ---- */
export const TYPE_ICON_POS: Record<string, number> = {
  一般: 0,
  格斗: 1,
  飞行: 2,
  毒: 3,
  地面: 4,
  岩石: 5,
  虫: 6,
  幽灵: 7,
  钢: 8,
  火: 9,
  水: 10,
  草: 11,
  电: 12,
  超能力: 13,
  冰: 14,
  龙: 15,
  恶: 16,
  妖精: 17,
};
const MOVE_CLASS_ICON_POS: Record<string, number> = { physical: 18, special: 19, status: 20 };

export function TypeBadge({
  types,
  plain,
}: {
  types: string | undefined;
  plain?: boolean;
}): JSX.Element {
  const list = (types || "").split(",").filter(Boolean);
  return (
    <span>
      {list.map((t) => (
        <span
          key={t}
          className={"type-badge" + (plain ? " plain" : "")}
          style={{ ["--t" as string]: `var(--type-${t})` }}
        >
          {TYPE_ICON_POS[t] != null && (
            <span className="ti" style={{ ["--iy" as string]: TYPE_ICON_POS[t] }} />
          )}
          {t}
        </span>
      ))}
    </span>
  );
}

export function MoveClassBadge({ cls }: { cls: string | undefined }): JSX.Element {
  const label =
    ({ physical: "物理", special: "特殊", status: "变化" } as Record<string, string>)[cls || ""] ||
    "-";
  return (
    <span className={"mcls-badge mc-" + (cls || "")}>
      {cls != null && cls in MOVE_CLASS_ICON_POS && (
        <span className="ti" style={{ ["--iy" as string]: MOVE_CLASS_ICON_POS[cls]! }} />
      )}
      {label}
    </span>
  );
}
