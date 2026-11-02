/* zh-import.test.ts —— RM-21：中文 PokePaste 导入（行级预处理 + 引擎解析闭环）。 */
import { describe, expect, it } from "vitest";
import { exportShowdown, importShowdown, importShowdownDetailed } from "../src/team/showdown";

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
    expect((sets![0]!.item ?? "").replace(/[^a-z0-9]/gi, "").toLowerCase()).toContain(
      "choicescarf",
    );
    expect(sets![0]!.moves.map((m) => m.replace(/[^a-z0-9]/gi, "").toLowerCase())).toContain(
      "eruption",
    );
    expect(sets![1]!.species.toLowerCase()).toContain("salamence");
    expect((sets![1]!.item ?? "").replace(/[^a-z0-9]/gi, "").toLowerCase()).toContain(
      "salamencite",
    );
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

describe("PK-R1-01/02 中文导入回退与失败显性化", () => {
  it("昵称行「物种 (昵称) @ 道具」物种正确转换，不产出 undefined", () => {
    const r = importShowdownDetailed(`皮卡丘 (团子) @ 剩饭\nAbility: 静电\nLevel: 50\n- 十万伏特`);
    expect(r).not.toBeNull();
    expect(r!.failedLines).toHaveLength(0);
    expect(r!.sets[0]!.species.toLowerCase()).toBe("pikachu");
    // 引擎侧已知问题：道具中文名后的 item 段有独立回退，此处只看物种段不再污染
    expect(JSON.stringify(r!.sets)).not.toContain("undefined");
  });

  it("昵称在前（PS 标准 Nick (Species)）的行取括号内真名", () => {
    const r = importShowdownDetailed(
      `小肥龙 (卡比兽) @ 剩饭\nAbility: 免疫\nLevel: 50\n- 舍身冲撞`,
    );
    expect(r).not.toBeNull();
    expect(r!.sets[0]!.species.toLowerCase()).toBe("snorlax");
  });

  it("未收录物种行进 failedLines 且不入队，其余成员保留", () => {
    const r = importShowdownDetailed(
      `皮卡丘 (团子) @ 剩饭\nAbility: 静电\nLevel: 50\n- 十万伏特\n\n胖丁鸭 @ 剩饭\nAbility: 危险预知\nLevel: 50\n- 唱歌`,
    );
    expect(r).not.toBeNull();
    expect(r!.sets.map((s) => s.species.toLowerCase())).toEqual(["pikachu"]);
    expect(r!.failedLines).toHaveLength(1);
    expect(r!.failedLines[0]).toContain("胖丁鸭");
  });

  it("英文文本路径不受影响（无失败行、解析结果与旧口径一致）", () => {
    const en = `Garchomp @ Life Orb\nAbility: Rough Skin\nLevel: 50\n- Earthquake`;
    const r = importShowdownDetailed(en);
    expect(r).not.toBeNull();
    expect(r!.failedLines).toHaveLength(0);
    expect(r!.sets[0]!.species.toLowerCase()).toBe("garchomp");
  });

  it("importShowdown 薄包装口径不变：全灭返回 null，部分失败保留合法成员", () => {
    expect(importShowdown("胖丁鸭 @ 剩饭\nAbility: 危险预知\n- 唱歌")).toBeNull();
    const mixed = importShowdown(
      `皮卡丘 @ 剩饭\nAbility: 静电\nLevel: 50\n- 十万伏特\n\n胖丁鸭 @ 剩饭\n- 唱歌`,
    );
    expect(mixed).not.toBeNull();
    expect(mixed).toHaveLength(1);
  });
});
