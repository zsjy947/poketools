/* app-error-boundary.test.tsx —— F-02：对战分区懒加载兜底。
 * 仓库测试口径为 Node 无 DOM（UI=浏览器实测）：fallback 标记用 react-dom/server 断言，
 * 错误捕获/重试转移用类静态方法与纯函数断言（lazy 包装可注入，loader 由用例替换）。 */
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  BattleSectionBoundary,
  BattleSectionLoadError,
  loadBattleApp,
  retryBoundaryState,
} from "../src/app/ErrorBoundary";

describe("对战分区懒加载兜底（F-02）", () => {
  it("fallback 渲染中文提示与重试按钮", () => {
    const html = renderToStaticMarkup(
      <BattleSectionLoadError
        error={new Error("Loading chunk battle failed")}
        onRetry={() => {}}
      />,
    );
    expect(html).toContain("对战分区加载失败");
    expect(html).toContain("重试");
  });

  it("getDerivedStateFromError 记录错误（进入 fallback 分支）", () => {
    const err = new Error("Loading chunk 1 failed");
    expect(BattleSectionBoundary.getDerivedStateFromError(err)).toMatchObject({ error: err });
  });

  it("重试转移：错误清空且重建 lazy 实例（lazy 缓存 reject 的 Promise，复用旧实例不会重试）", () => {
    const prev = { error: new Error("chunk fail"), Lazy: () => <div>旧实例</div> };
    const next = retryBoundaryState(loadBattleApp);
    expect(next.error).toBeNull();
    expect(next.Lazy).not.toBe(prev.Lazy);
  });

  it("边界实例 retry()：setState 收到重试转移结果（点重试后恢复为 children 分支）", () => {
    const inst = new BattleSectionBoundary({
      loader: () => Promise.resolve({ default: () => <i>替身分区</i> }),
    });
    inst.state = { error: new Error("chunk fail"), Lazy: () => <div>旧实例</div> };
    let captured: { error: Error | null; Lazy: unknown } | null = null;
    inst.setState = ((fn: (prev: typeof inst.state) => typeof inst.state) => {
      captured = fn(inst.state);
    }) as typeof inst.setState;
    inst.retry();
    expect(captured!.error).toBeNull();
    expect(captured!.Lazy).not.toBe(inst.state.Lazy);
  });
});
