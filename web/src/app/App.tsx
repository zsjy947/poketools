import { useMemo, useRef } from "react";
import { version } from "../../package.json";
import { parseHash, routeQuery, useHash, navigate } from "./router";
import { BattleApp } from "./BattleApp";
import { UnifiedHomePage } from "../pages/UnifiedHomePage";
import { GamesPage } from "../pages/GamesPage";
import { GameSection } from "../pages/GameSection";
import { DetailPage } from "../pages/DetailPage";
import { CalcPage } from "../pages/CalcPage";
import { usePkt } from "./pktStore";

/**
 * 统一壳：hash 路由分区（#/home #/games #/game/:id/:feature #/pokemon/:id #/calc #/battle）。
 * 模拟对战与计算器分区首次进入后保持挂载（隐藏不卸载），队伍/meta 状态跨分区保留。
 */
export function App(): JSX.Element {
  const hash = useHash();
  const route = useMemo(() => parseHash(hash), [hash]);
  const rawQuery = useMemo(() => routeQuery(hash), [hash]);
  const lastGame = usePkt((s) => s.gameId);

  // battle / calc 分区 keep-alive
  const visited = useRef({ battle: false, calc: false });
  if (route.name === "battle") visited.current.battle = true;
  if (route.name === "calc") visited.current.calc = true;

  const NAV = [
    { id: "home", label: "首页", on: route.name === "home" },
    {
      id: "games",
      label: "游戏中心",
      on: route.name === "games" || route.name === "game" || route.name === "pokemon",
    },
    { id: "calc", label: "伤害计算器", on: route.name === "calc" },
    { id: "battle", label: "模拟对战", on: route.name === "battle" },
  ];

  // 详情页 query：hash 未带 game 时回退最近游戏上下文
  const detailQuery = useMemo(() => {
    if (rawQuery.get("game")) return rawQuery;
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
        {route.name === "pokemon" && <DetailPage speciesId={route.speciesId} query={detailQuery} />}
        {route.name === "not-found" && (
          <div className="page">
            <h1>未找到页面</h1>
            <p className="muted">{route.hash}</p>
          </div>
        )}
        <div hidden={route.name !== "calc"}>{visited.current.calc ? <CalcPage /> : null}</div>
        <div hidden={route.name !== "battle"}>{visited.current.battle ? <BattleApp /> : null}</div>
      </main>
    </div>
  );
}
