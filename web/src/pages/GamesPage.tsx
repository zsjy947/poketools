/* 游戏中心：五作宫格 + 全国图鉴独立入口（自 Vue games.js 迁移）。
 * 手机端（≤768）走 mx- 原生分支：全宽横幅卡。 */
import { useEffect, useState } from "react";
import { loadGames, type GameRow } from "../components/games";
import { GameIcons, MonoIcon } from "../components/badges";
import { useIsMobile } from "../lib/useIsMobile";

export function GamesPage(): JSX.Element {
  const [games, setGames] = useState<GameRow[]>([]);
  const isMobile = useIsMobile();
  useEffect(() => {
    loadGames()
      .then(setGames)
      .catch(() => setGames([]));
  }, []);
  const enter = (g: GameRow) => {
    location.hash = `#/game/${g.id}/dex`;
  };
  /* ===== 手机端（≤768）原生分支：全宽横幅卡 ===== */
  if (isMobile)
    return (
      <div className="pkt-page mx-page">
        <button className="back-btn mx-back" onClick={() => (location.hash = "#/home")}>
          ← 返回首页
        </button>
        <h1 className="mx-page-title">游戏中心</h1>
        <div className="mx-games">
          {games.map((g) => (
            <div key={g.id} className="mx-game-card" onClick={() => enter(g)}>
              <div className="mx-game-logo">
                <GameIcons gid={g.id} h={44} />
              </div>
              <div className="mx-game-info">
                <div className="mx-game-name">{g.name_zh}</div>
                <div className="mx-game-sub">
                  {g.generation === 9 ? "第九世代" : "第八世代"} · {g.dexes.length} 个图鉴 /{" "}
                  {g.dexes.reduce((a, d) => a + d.total, 0)} 只
                </div>
              </div>
              <span className="mx-game-arrow">›</span>
            </div>
          ))}
          <div className="mx-game-card national" onClick={() => (location.hash = "#/national")}>
            <div className="mx-game-logo national">
              <MonoIcon name="dex" size={40} />
            </div>
            <div className="mx-game-info">
              <div className="mx-game-name">全国图鉴</div>
              <div className="mx-game-sub">全 1025 种 · 形态收集 · 与各地区图鉴同步</div>
            </div>
            <span className="mx-game-arrow">›</span>
          </div>
        </div>
      </div>
    );
  return (
    <div className="pkt-page">
      <button className="back-btn" onClick={() => (location.hash = "#/home")}>
        ← 返回首页
      </button>
      <div className="home-hero">
        <h1>游戏中心</h1>
      </div>
      <div className="game-grid">
        {games.map((g) => (
          <div key={g.id} className="game-card" onClick={() => enter(g)}>
            <GameIcons gid={g.id} h={46} />
            <div className="game-name">{g.name_zh}</div>
            <div className="game-sub">
              {g.generation === 9 ? "第九世代" : "第八世代"} · {g.dexes.length} 个图鉴 /{" "}
              {g.dexes.reduce((a, d) => a + d.total, 0)} 只
            </div>
          </div>
        ))}
        <div className="game-card national-card" onClick={() => (location.hash = "#/national")}>
          <span className="national-ic-wrap">
            <MonoIcon name="dex" size={44} />
          </span>
          <div className="game-name">全国图鉴</div>
          <div className="game-sub">全 1025 种 · 形态收集 · 与各地区图鉴同步</div>
        </div>
      </div>
    </div>
  );
}
