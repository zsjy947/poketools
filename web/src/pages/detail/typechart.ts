/* 属性相性纯函数（RM-19 第一步自 DetailPage.tsx 拆出，无行为变更）：
 * 防守面分组 / 攻击面分组 / 倍率 CSS 类。数据源 damage.ts 的 CHART 与 defenseMultipliers。 */
import { CHART, TYPES } from "../../data/damage";
import { defenseMultipliers } from "../../components/games";

export interface EffGroup {
  m: string;
  types: string[];
}

/** 防守面：当前属性组合 → 按倍率分组的进攻属性（4/2/1/0.5/0.25/0 序） */
export function defenseGroups(myTypes: string[]): EffGroup[] | null {
  if (!myTypes.length) return null;
  const mult = defenseMultipliers(myTypes);
  if (!mult) return null;
  const groups: Record<string, string[]> = {};
  for (const [atk, m] of Object.entries(mult)) {
    const key = String(m);
    (groups[key] = groups[key] || []).push(atk);
  }
  const order = ["4", "2", "1", "0.5", "0.25", "0"];
  return order.filter((k) => groups[k]).map((k) => ({ m: k, types: groups[k]! }));
}

/** 攻击面：给定进攻属性 → 按倍率分组的防守属性（2/0.5/0 序） */
export function attackGroups(atkType: string): EffGroup[] {
  const groups: Record<string, string[]> = {};
  for (const def of TYPES) {
    const m = (CHART[atkType] || {})[def] ?? 1;
    const key = String(m);
    (groups[key] = groups[key] || []).push(def);
  }
  const order = ["2", "0.5", "0"];
  return order.filter((k) => groups[k]).map((k) => ({ m: k, types: groups[k]! }));
}

/** 倍率 → 相性徽章 CSS 类 */
export function effClass(mm: string): string {
  if (mm === "4" || mm === "2") return "bad";
  if (mm === "1") return "neutral";
  if (mm === "0") return "immune";
  return "good";
}
