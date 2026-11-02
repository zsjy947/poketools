/* 对战分区懒加载兜底（F-02）：根级 ErrorBoundary 只兜 chunk 加载失败——
 * 统一壳的 BattleApp 懒加载（RM-13）失败时（升级后缓存失效/安装不完整/离线首入），
 * 无兜底会整树白屏。分区内部渲染异常仍由 BattleApp 内的 BattleErrorBoundary
 * 兜底，二者职责不重叠（内层先接，接不住才轮到本层）。 */
import { Component, Suspense, lazy } from "react";
import type { ComponentType, ReactNode } from "react";
import type { ErrorInfo } from "react";

/** 分区加载器（默认 = 动态 import 对战分区；注入点供测试替换） */
export type SectionLoader = () => Promise<{ default: ComponentType }>;

export const loadBattleApp: SectionLoader = () =>
  import("../battle/BattleApp").then((m) => ({ default: m.BattleApp as ComponentType }));

interface BoundaryState {
  error: Error | null;
  Lazy: ComponentType;
}

/** 重试转移（纯函数便于单测）：错误清零并**重建 lazy 实例**——React.lazy 会缓存
 *  reject 的 Promise，复用旧实例重试永远失败，必须换新实例重新发起 import。 */
export function retryBoundaryState(loader: SectionLoader): BoundaryState {
  return { error: null, Lazy: lazy(loader) };
}

/** 加载失败 fallback：中文提示 + 重试按钮（重试 = 重置错误并重新 import 分区） */
export function BattleSectionLoadError({
  error,
  onRetry,
}: {
  error: Error;
  onRetry: () => void;
}): JSX.Element {
  return (
    <div className="page" style={{ padding: 24 }}>
      <h1>对战分区加载失败</h1>
      <p className="muted">
        对战引擎资源未能加载（可能为安装不完整或存储异常）：{String(error?.message || error)}
      </p>
      <button className="primary" onClick={onRetry}>
        重试
      </button>
    </div>
  );
}

export class BattleSectionBoundary extends Component<{ loader?: SectionLoader }, BoundaryState> {
  constructor(props: { loader?: SectionLoader }) {
    super(props);
    this.state = { error: null, Lazy: lazy(props.loader ?? loadBattleApp) };
  }

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[对战分区加载失败]", error, info.componentStack);
  }

  retry = () => this.setState(() => retryBoundaryState(this.props.loader ?? loadBattleApp));

  render(): ReactNode {
    if (this.state.error) {
      return <BattleSectionLoadError error={this.state.error} onRetry={this.retry} />;
    }
    const Lazy = this.state.Lazy;
    return (
      <Suspense fallback={<div className="page">对战引擎加载中…</div>}>
        <Lazy />
      </Suspense>
    );
  }
}
