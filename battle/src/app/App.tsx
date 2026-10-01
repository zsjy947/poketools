import { Component, useEffect } from "react";
import type { ErrorInfo, ReactNode } from "react";
import { useApp, hydrateTeams } from "./store";
import { HomePage } from "./pages/HomePage";
import { TeamBuilderPage } from "./pages/TeamBuilderPage";
import { PreviewPage } from "./pages/PreviewPage";
import { BattleView } from "../battle/BattleView";
import { RecordsPage } from "./pages/RecordsPage";
import { SettingsPage } from "./pages/SettingsPage";
import { version } from "../../package.json";

/** 渲染异常兜底：显示错误信息而非整树卸载白屏（错误详情进 console 便于排查） */
class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[UI 渲染异常]", error, info.componentStack);
  }
  render() {
    if (this.state.error) {
      return (
        <div className="page" style={{ padding: 24 }}>
          <h1>页面渲染出错</h1>
          <p className="muted">{String(this.state.error?.message ?? this.state.error)}</p>
          <button
            className="primary"
            onClick={() => {
              this.setState({ error: null });
              useApp.getState().go("home");
            }}
          >
            返回主页
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

/**
 * 应用壳：页面流 = 主页(赛制选择) → 队伍编辑 → 预览上阵 → 对战 → 记录/设置。
 * 全中文界面；阵营 A 蓝系 / 阵营 B 红系（对战页防误操作配色）。
 */
export function App(): JSX.Element {
  const page = useApp((s) => s.page);
  const go = useApp((s) => s.go);

  useEffect(() => {
    hydrateTeams();
    useApp.getState().loadRecords();
  }, []);

  const NAV: Array<{ id: typeof page; label: string }> = [
    { id: "home", label: "主页" },
    { id: "team", label: "队伍编辑" },
    { id: "preview", label: "上阵预览" },
    { id: "records", label: "对局记录" },
    { id: "settings", label: "设置" },
  ];

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-title" onClick={() => go("home")}>
          宝可梦模拟对战 <span className="app-sub">Pokémon Solo Battle</span>
        </div>
        <nav className="app-nav">
          {NAV.map((n) => (
            <button key={n.id} className={page === n.id ? "on" : ""} onClick={() => go(n.id)}>
              {n.label}
            </button>
          ))}
        </nav>
        <span className="app-version">v{version}</span>
      </header>
      <main className="app-main">
        <ErrorBoundary>
          {page === "home" && <HomePage />}
          {page === "team" && <TeamBuilderPage />}
          {page === "preview" && <PreviewPage />}
          {page === "battle" && <BattleView />}
          {page === "records" && <RecordsPage />}
          {page === "settings" && <SettingsPage />}
        </ErrorBoundary>
      </main>
    </div>
  );
}
