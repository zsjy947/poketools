/* zh-import.test.ts —— RM-21：中文 PokePaste 导入（行级预处理 + 引擎解析闭环）。 */
import { describe, expect, it } from "vitest";
import { exportShowdown, importShowdown } from "../src/team/showdown";

const ZH_TEAM = `火暴兽洗翠的样子 @ 讲究围巾
Ability: 猛火
Level: 50
Tera Type: 火
EVs: 4 HP / 252 Atk / 252 Spe
爽朗 Nature
- 喷火
- 鬼火
- 暗影球
- 群魔乱舞

暴飞龙 @ 暴飞龙进化石
Ability: 威吓
Level: 50
Tera Type: 一般
EVs: 4 HP / 252 Atk / 252 Spe
爽朗 Nature
- 巨声
- 喷射火焰
- 龙之波动
- 守住`;

describe("RM-21 中文 PokePaste 导入", () => {
  it("中文名队伍文本可解析且物种/道具/招式正确", () => {
    const sets = importShowdown(ZH_TEAM);
    expect(sets).not.toBeNull();
    expect(sets!.length).toBe(2);
    expect(sets![0]!.species.toLowerCase()).toContain("typhlosion");
    expect((sets![0]!.item ?? "").replace(/[^a-z0-9]/gi, "").toLowerCase()).toContain("choicescarf");
    expect(sets![0]!.moves.map((m) => m.replace(/[^a-z0-9]/gi, "").toLowerCase())).toContain("eruption");
    expect(sets![1]!.species.toLowerCase()).toContain("salamence");
    expect((sets![1]!.item ?? "").replace(/[^a-z0-9]/gi, "").toLowerCase()).toContain("salamencite");
  });

  it("中文导入 → 英文导出 → 再导入 往返无损", () => {
    const sets = importShowdown(ZH_TEAM)!;
    const exported = exportShowdown(sets);
    const again = importShowdown(exported)!;
    expect(again.map((s) => s.species)).toEqual(sets.map((s) => s.species));
    expect(again[0]!.moves).toEqual(sets[0]!.moves);
  });

  it("英文原文零改动直通（无中文字符时预处理不介入）", () => {
    const en = `Garchomp @ Life Orb\nAbility: Rough Skin\nLevel: 50\n- Earthquake`;
    const sets = importShowdown(en);
    expect(sets![0]!.species.toLowerCase()).toBe("garchomp");
  });
});
