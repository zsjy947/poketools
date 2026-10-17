/**
 * replay-feed.ts —— 回放指令推进控制器（M4 P3）：
 * 把"按提交序向复现会话直灌指令"的推进状态机从 ReplayPage 抽出，可单测。
 * - 单调前进：多次并发 feed 目标合流到最新值，不丢最终回合；
 * - 世代（epoch）失效：引擎不可回卷，向后跳转需要重建会话——重建即换代，
 *   旧世代在途循环在下一个 await 边界自行退出，不再触碰共享游标；
 * - 重建后直灌：rebuild 场景由调用方在 start() 完成后以新世代 feed 到目标回合。
 */
export interface FeedChoice {
  side: "p1" | "p2";
  input: string;
  turn: number;
}

/** 复现会话的最小消费面（BattleSession 结构兼容） */
export interface FeedSession {
  choose(side: "p1" | "p2", input: string): Promise<unknown>;
}

export class ReplayFeedController {
  private cursor = 0; // 已消费的 choices 数
  private pending: number | null = null; // feed 目标合流
  private lock = false;
  private epoch = 0;

  /** 重建复现会话：游标清零、解锁，并换代使旧世代在途循环失效 */
  reset(): number {
    this.epoch += 1;
    this.cursor = 0;
    this.pending = null;
    this.lock = false;
    return this.epoch;
  }

  /** 会话销毁（不重建）：仅换代作废在途循环 */
  invalidate(): void {
    this.epoch += 1;
  }

  get epochNow(): number {
    return this.epoch;
  }

  /** 已消费的 choices 数（诊断/测试用） */
  get consumed(): number {
    return this.cursor;
  }

  /** 消费 choices 直到目标回合（含）——按提交序直灌引擎，双方齐活自然结算 */
  async feed(
    s: FeedSession,
    choices: readonly FeedChoice[],
    upToTurn: number,
    epoch: number,
  ): Promise<void> {
    if (this.epoch !== epoch) return;
    this.pending = Math.max(this.pending ?? 0, upToTurn);
    if (this.lock) return;
    this.lock = true;
    try {
      for (;;) {
        const target: number | null = this.pending;
        if (target == null) break;
        while (this.cursor < choices.length) {
          if (this.epoch !== epoch) return;
          const c = choices[this.cursor]!;
          if (c.turn > target) break;
          await s.choose(c.side, c.input);
          if (this.epoch !== epoch) return;
          this.cursor += 1;
        }
        if (this.pending === target) {
          this.pending = null;
          break;
        }
      }
    } finally {
      if (this.epoch === epoch) this.lock = false;
    }
  }
}
