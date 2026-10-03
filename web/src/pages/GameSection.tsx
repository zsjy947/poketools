/* 游戏功能分区（自 Vue app.js 游戏上下文 + components.js RailNav 迁移；含 U2 侧边栏改造） */
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { navigate } from "../app/router";
import { usePkt, type GameFeature } from "../app/pktStore";
import { loadGames, FEATURES, GameIcons, isDualGame, MonoIcon, type GameRow } from "../pkt/shared";
import { DexPage } from "./DexPage";
import { EvPage } from "./EvPage";
import { SandwichesPage } from "./SandwichesPage";
import { DonutsPage } from "./DonutsPage";
import { CurryPage } from "./CurryPage";

export function GameSection({ gameId, feature }: { gameId: string; feature: string }): JSX.Element {
  const setGame = usePkt((s) => s.setGame);
  const [game, setGameRow] = useState<GameRow | null>(null);
  const [gamesLoaded, setGamesLoaded] = useState(false);

  useEffect(() => {
    setGame(gameId as never, feature as GameFeature);
    loadGames().then((gs) => {
      setGameRow(gs.find((g) => g.id === gameId) || null);
      setGamesLoaded(true);
    });
  }, [gameId, feature, setGame]);

  /* games.features 已含特化功能键（curry/sandwich/donut 随游戏入表），勿再硬编码追加 */
  const features = useMemo(
    () =>
      (game?.features ?? ["dex", "ev"])
        .map((k) => FEATURES[k])
        .filter((f): f is (typeof FEATURES)[string] => Boolean(f)),
    [game],
  );

  const goFeature = (key: string) => {
    navigate(`#/game/${gameId}/${key}`);
  };

  let body: ReactNode;
  switch (feature) {
    case "dex":
      body = <DexPage gameId={gameId} />;
      break;
    case "ev":
      body = <EvPage gameId={gameId} />;
      break;
    case "sandwich":
      body = <SandwichesPage />;
      break;
    case "donut":
      body = <DonutsPage />;
      break;
    case "curry":
      body = <CurryPage />;
      break;
    default:
      body = <DexPage gameId={gameId} />;
  }

  return (
    <div className="game-shell">
      {/* U2：84px 窄栏；双版本游戏商标竖排两枚（h≈26）防溢出 */}
      <nav className="rail">
        <div
          className="rail-game"
          title={game ? game.name_zh : ""}
          onClick={() => goFeature("dex")}
        >
          {game && <GameIcons gid={game.id} h={isDualGame(game.id) ? 26 : 40} />}
        </div>
        <div className="rail-sep" />
        {features.map((f) => (
          <div
            key={f.key}
            className={"rail-item" + (feature === f.key ? " active" : "")}
            title={f.label}
            onClick={() => goFeature(f.key)}
          >
            <MonoIcon name={f.icon} size={22} />
          </div>
        ))}
      </nav>
      <div className="game-main">
        {!gamesLoaded && (
          <div className="empty-hint" style={{ padding: 30 }}>
            加载中…
          </div>
        )}
        {gamesLoaded && !game && (
          <div className="empty-hint" style={{ padding: 30 }}>
            未知游戏：{gameId}
          </div>
        )}
        {gamesLoaded && game && body}
      </div>
    </div>
  );
}
