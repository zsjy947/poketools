/* ai.ts（RM-04）：轻量随机 AI——把引擎 request 转成一条合法指令。
 * 首版随机即可对局（选择上过滤 disabled/无 PP，双打对需目标的招式随机补目标）；
 * 启发式（换人预判/威胁评估）后续在此文件演进。 */
import type { RequestChoice } from "./session";

/** Showdown target 需要显式 +目标 的取值（双打多槽位语境） */
const NEEDS_TARGET = new Set(["normal", "any", "adjacentAlly", "adjacentFoe"]);

function pick<T>(arr: T[], rng: () => number): T | undefined {
  if (arr.length === 0) return undefined;
  return arr[Math.floor(rng() * arr.length)]!;
}

/** 目标生成上下文：oppAlive=对手场上存活数（残局单对手时目标固定 +1） */
export interface AiContext {
  oppAlive?: number;
}

/** 生成一条指令（多槽位逗号连接）；调用方需保证 req 非空且非 wait。 */
export function aiChoice(
  req: RequestChoice,
  rng: () => number = Math.random,
  ctx: AiContext = {},
): string {
  // 阵容预览（无 previewOrder 直通时）：按可选数量顺序上阵
  if (req.teamPreview) {
    const n = req.maxChosenTeamSize ?? 4;
    return `team ${Array.from({ length: n }, (_, i) => i + 1).join(",")}`;
  }
  // 强制换人：每个待换槽位随机一个存活替补（switch 编号 = 队伍 1 基位置）
  if (req.forceSwitch?.some(Boolean)) {
    // 对齐 UI（BattleView ForceSwitchChoice）：每个 true 槽都要输出——替补不足时
    // 后续槽显式补 pass（引擎对单条 switch 报 Incomplete choice）
    const benchOf = req.side.pokemon
      .map((p, i) => ({ p, i }))
      .filter((x) => !x.p.active && !x.p.condition.includes("fnt"));
    const choosable = Math.min(
      req.forceSwitch.filter(Boolean).length,
      benchOf.length,
    );
    let bi = 0;
    const parts = req.forceSwitch.map((need) => {
      if (!need) return null;
      const c = bi < choosable ? benchOf[bi++] : undefined;
      return c ? `switch ${c.i + 1}` : "pass";
    });
    return parts.filter(Boolean).join(", ");
  }

  const actives = req.active ?? [];
  const doubles = actives.length > 1;
  const parts: string[] = [];
  for (const a of actives) {
    if (!a) continue;
    const usable = a.moves.filter((m) => !m.disabled && (m.maxpp ?? 1) > 0 && (m.pp ?? 1) > 0);
    const m = pick(usable, rng);
    if (!m) {
      parts.push("pass");
      continue;
    }
    let cmd = `move ${a.moves.indexOf(m) + 1}`;
    if (doubles && NEEDS_TARGET.has(m.target || "")) {
      // 对手左/右槽（正数=对手）；残局单对手时固定 +1，避免目标指向空位被引擎拒绝
      const slot = ctx.oppAlive === 1 ? 1 : 1 + Math.floor(rng() * 2);
      cmd += ` +${slot}`;
    }
    parts.push(cmd);
  }
  return parts.join(", ");
}
