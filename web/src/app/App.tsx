import { useMemo, useRef } from "react";
import { version } from "../../package.json";
import { parseHash, useHash, navigate } from "./router";
import { BattleApp } from "./BattleApp";
import { UnifiedHomePage } from "../pages/UnifiedHomePage";

/**
 * 统一壳：hash 路由分区（#/home #/games #/game/:id/:feature #/pokemon/:id #/calc #/battle）。
 * 模拟对战分区首次进入后保持挂载（隐藏不卸载），队伍/会话状态跨分区保留。
 */
export function App(): JSX.Element {
  const hash = useHash();
  const route = useMemo(() => parseHash(hash), [hash]);

  // battle 分区 keep-alive：首次访问后常驻 DOM（display:none 隐藏），状态不丢
  const visitedBattle = useRef(false);
  if (route.name === "battle") visitedBattle.current = true;

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
      <main className="app-main">
        {route.name === "home" && <UnifiedHomePage />}
        {route.name === "games" && <SectionPlaceholder title="游戏中心" />}
        {route.name === "game" && (
          <SectionPlaceholder title={`游戏功能：${route.gameId} / ${route.feature}`} />
        )}
        {route.name === "pokemon" && (
          <SectionPlaceholder title={`宝可梦详情 #${route.speciesId}`} />
        )}
        {route.name === "calc" && <SectionPlaceholder title="伤害计算器" />}
        {route.name === "not-found" && <SectionPlaceholder title={`未找到页面：${route.hash}`} />}
        <div hidden={route.name !== "battle"}>{visitedBattle.current ? <BattleApp /> : null}</div>
      </main>
    </div>
  );
}

/** 阶段占位：poketools 各页在数据层 TS 化（阶段 2）完成后逐一以 React 实现（阶段 3） */
function SectionPlaceholder({ title }: { title: string }): JSX.Element {
  return (
    <div className="page">
      <h1>{title}</h1>
      <p className="muted">页面迁移中 —— 统一壳骨架已就绪，本页将在前端迁移阶段实现。</p>
    </div>
  );
}
