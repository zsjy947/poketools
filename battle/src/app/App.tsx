/* 应用壳（M0 空壳）：页面流 = 主页(赛制选择) → 队伍编辑 → 预览上阵 → 对战 → 记录/设置。
   里程碑推进时逐页落地：M1 数据层 → M2 引擎 → M3 队伍 → M4 信息流 → M5 动画。 */

export function App(): JSX.Element {
  return (
    <main style={{ fontFamily: "system-ui, sans-serif", padding: 24 }}>
      <h1>宝可梦模拟对战</h1>
      <p>完全本地 · 单人操控双方 · 离线可用</p>
      <p style={{ color: "#888" }}>M0 脚手架：赛制选择将在 M1 数据层完成后接入。</p>
    </main>
  );
}
