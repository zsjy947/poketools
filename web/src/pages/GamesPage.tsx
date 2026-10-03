/* 游戏中心：五作宫格（自 Vue games.js 迁移） */
import { useEffect, useState } from "react";
import { loadGames, GameIcons, type GameRow } from "../pkt/shared";

export function GamesPage(): JSX.Element {
  const [games, setGames] = useState<GameRow[]>([]);
  useEffect(() => {
    loadGames()
      .then(setGames)
      .catch(() => setGames([]));
  }, []);
  const enter = (g: GameRow) => {
    location.hash = `#/game/${g.id}/dex`;
  };
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
      </div>
    </div>
  );
}
