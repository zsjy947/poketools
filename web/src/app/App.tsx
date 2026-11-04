import { useMemo, useRef } from "react";
import { version } from "../../package.json";
import { parseHash, routeQuery, useHash, navigate } from "../lib/router";
// battle 分区懒加载（RM-13）：供应商化引擎 ~12MB 只在对战首入时拉取，图鉴/计算器首屏不背；
// chunk 加载失败由根级 BattleSectionBoundary 兜底（F-02）
import { BattleSectionBoundary } from "./ErrorBoundary";
import { MonoIcon } from "../components/badges";
import { UnifiedHomePage } from "../pages/UnifiedHomePage";
import { GamesPage } from "../pages/GamesPage";
import { GameSection } from "../pages/GameSection";
import { DetailPage } from "../pages/DetailPage";
import { NationalDexPage } from "../pages/NationalDexPage";
import { NationalDetailPage } from "../pages/NationalDetailPage";
import { CalcPage } from "../pages/CalcPage";
import { usePkt } from "../state/game";

/**
 * 统一壳：hash 路由分区（#/home #/games #/game/:id/:feature #/pokemon/:id #/calc #/battle）。
 * 模拟对战与计算器分区首次进入后保持挂载（隐藏不卸载），队伍/meta 状态跨分区保留。
 */
export function App(): JSX.Element {
  const hash = useHash();
  const route = useMemo(() => parseHash(hash), [hash]);
  const rawQuery = useMemo(() => routeQuery(hash), [hash]);
  const lastGame = usePkt((s) => s.gameId);

  // 底部 Tab 图标（移动端）：自绘 SVG 线条图标（与游戏窄栏 rail 同源，badges.MonoIcon）
  const TAB_ICONS: Record<string, string> = {
    games: "games",
    national: "dex",
    calc: "calc",
    battle: "battle",
  };

  // battle / calc 分区 keep-alive
  const visited = useRef({ battle: false, calc: false });
  if (route.name === "battle") visited.current.battle = true;
  if (route.name === "calc") visited.current.calc = true;

  const NAV = [
    { id: "home", label: "首页", on: route.name === "home" },
    {
      id: "games",
      label: "游戏中心",
      on:
        route.name === "games" ||
        route.name === "game" ||
        (route.name === "pokemon" && !rawQuery.get("national")),
    },
    { id: "national", label: "全国图鉴", on: route.name === "national" },
    { id: "calc", label: "伤害计算器", on: route.name === "calc" },
    { id: "battle", label: "模拟对战", on: route.name === "battle" },
  ];
  /* 底部 Tab 只保留四个功能分区：首页对手机端无意义（顶栏点击标题仍可回首页）；
   * 标签用短词防窄屏换行（桌面顶栏导航不受影响，仍走上方 NAV 全量）。 */
  const TABS = NAV.filter((n) => n.id !== "home").map((n) => ({
    ...n,
    tabLabel: { games: "游戏", national: "图鉴", calc: "计算", battle: "对战" }[n.id] ?? n.label,
  }));

  // 详情页 query：hash 未带 game 时回退最近游戏上下文（national 模式不带游戏，保持全量形态）
  const detailQuery = useMemo(() => {
    if (rawQuery.get("game") || rawQuery.get("national")) return rawQuery;
    const rest = hash.includes("?") ? "&" + hash.slice(hash.indexOf("?") + 1) : "";
    return new URLSearchParams(`game=${lastGame}${rest}`);
  }, [rawQuery, hash, lastGame]);

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-title" onClick={() => navigate("#/home")}>
          宝可梦工具助手 <span className="app-sub">Pokétools</span>
        </div>
        <nav className="app-nav">
          {NAV.map((n) => (
            <button key={n.id} className={n.on ? "on" : ""} onClick={() => navigate(`#/${n.id}`)}>
              {n.label}
            </button>
          ))}
        </nav>
        <span className="app-version">v{version}</span>
      </header>
      <main className="app-main pkt-main">
        {route.name === "home" && <UnifiedHomePage />}
        {route.name === "games" && <GamesPage />}
        {route.name === "game" && <GameSection gameId={route.gameId} feature={route.feature} />}
        {route.name === "national" && <NationalDexPage />}
        {route.name === "pokemon" &&
          /* national 语境走专用详情页（与地区图鉴 DetailPage 完全隔离，互不影响） */
          (detailQuery.get("national") === "1" ? (
            <NationalDetailPage speciesId={route.speciesId} query={detailQuery} />
          ) : (
            <DetailPage speciesId={route.speciesId} query={detailQuery} />
          ))}
        {route.name === "not-found" && (
          <div className="page">
            <h1>未找到页面</h1>
            <p className="muted">{route.hash}</p>
          </div>
        )}
        <div hidden={route.name !== "calc"}>{visited.current.calc ? <CalcPage /> : null}</div>
        <div hidden={route.name !== "battle"}>
          {visited.current.battle ? <BattleSectionBoundary /> : null}
        </div>
      </main>
      {/* 移动端底部 Tab（桌面由 mobile.css 隐藏；≤768px 时替代顶栏导航。
       *  游戏分区由窄栏 rail 承担导航，JSX 级互斥——不依赖 :has()（旧 WebView 无此选择器）） */}
      {route.name !== "game" && (
        <nav className="tab-bar">
          {TABS.map((n) => (
            <button
              key={n.id}
              className={"tab-item" + (n.on ? " active" : "")}
              onClick={() => navigate(`#/${n.id}`)}
            >
              <span className="tab-ic">
                <MonoIcon name={TAB_ICONS[n.id] ?? "games"} size={22} />
              </span>
              <span className="tab-label">{n.tabLabel}</span>
            </button>
          ))}
        </nav>
      )}
    </div>
  );
}
