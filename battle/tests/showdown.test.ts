// M3 队伍层测试：Showdown 文本导入/导出/往返无损（DoD ≥10 往返用例）
import { describe, expect, it } from "vitest";
import { exportShowdown, importShowdown, roundtripLossless } from "../src/team/showdown";

const TEAMS: string[] = [
  `Garchomp @ Life Orb
Ability: Rough Skin
Level: 50
Tera Type: Steel
EVs: 4 HP / 252 Atk / 252 Spe
Jolly Nature
- Earthquake
- Dragon Claw
- Iron Head
- Protect`,
  `Charizard @ Heavy-Duty Boots
Ability: Blaze
Level: 50
Shiny: Yes
Tera Type: Fire
EVs: 252 SpA / 4 SpD / 252 Spe
Timid Nature
IVs: 0 Atk
- Flamethrower
- Hurricane
- Focus Blast
- Roost`,
  `Snorlax @ Leftovers
Ability: Thick Fat
Level: 50
EVs: 188 HP / 156 Def / 164 SpD
Careful Nature
- Body Press
- Rest
- Sleep Talk
- Protect`,
  `Milotic @ Sitrus Berry
Ability: Marvel Scale
Level: 50
Tera Type: Water
EVs: 196 HP / 124 Def / 188 SpA
Calm Nature
IVs: 0 Atk
- Surf
- Ice Beam
- Recover
- Protect`,
  `Togekiss @ Rocky Helmet
Ability: Serene Grace
Level: 50
Tera Type: Fairy
EVs: 248 HP / 8 Def / 252 SpA
Calm Nature
IVs: 0 Atk
- Dazzling Gleam
- Air Slash
- Nasty Plot
- Protect`,
  `Scizor @ Choice Band
Ability: Technician
Level: 50
Tera Type: Steel
EVs: 248 HP / 252 Atk / 8 SpD
Adamant Nature
- Bullet Punch
- Knock Off
- Close Combat
- U-turn`,
  `Amoonguss @ Black Sludge
Ability: Regenerator
Level: 50
EVs: 236 HP / 116 Def / 156 SpD
Calm Nature
IVs: 0 Atk
- Spore
- Pollen Puff
- Rage Powder
- Protect`,
  `Incineroar @ Sitrus Berry
Ability: Intimidate
Level: 50
Tera Type: Fire
EVs: 236 HP / 4 Def / 84 SpA / 180 SpD
Careful Nature
- Fake Out
- Flare Blitz
- Knock Off
- Parting Shot`,
  `Urshifu-Rapid-Strike @ Choice Scarf
Ability: Unseen Fist
Level: 50
Tera Type: Water
EVs: 4 HP / 252 Atk / 252 Spe
Jolly Nature
- Surging Strikes
- Close Combat
- U-turn
- Aqua Jet`,
  `Zacian @ Rusted Sword
Ability: Intrepid Sword
Level: 50
Tera Type: Fairy
EVs: 252 Atk / 4 SpD / 252 Spe
Jolly Nature
- Behemoth Blade
- Play Rough
- Close Combat
- Protect`,
  `Dragonite @ Miracle Seed
Ability: Multiscale
Level: 100
EVs: 4 HP / 252 Atk / 252 Spe
Adamant Nature
- Dragon Dance
- Outrage
- Earthquake
- Extreme Speed`,
  `Gengar @ Choice Specs
Ability: Cursed Body
Level: 100
Shiny: Yes
Tera Type: Ghost
EVs: 252 SpA / 4 SpD / 252 Spe
Timid Nature
IVs: 0 Atk / 30 Spe
- Shadow Ball
- Sludge Bomb
- Focus Blast
- Trick`,
];

describe("M3 队伍文本（FR-04）", () => {
  it("导入：解析出正确物种与招式", () => {
    const sets = importShowdown(TEAMS[0]!);
    expect(sets).not.toBeNull();
    expect(sets![0]!.species).toBe("Garchomp");
    expect(sets![0]!.moves).toContain("Earthquake");
    expect(sets![0]!.item).toBe("Life Orb");
  });

  it("导入失败路径：空文本/乱码返回 null", () => {
    expect(importShowdown("")).toBeNull();
    expect(importShowdown("不是队伍文本\n随机内容")).toBeNull();
  });

  it(`导出：结构完整（名称/特性/道具/招式段落）`, () => {
    const sets = importShowdown(TEAMS[1]!)!;
    const text = exportShowdown(sets);
    expect(text).toContain("Charizard");
    expect(text).toContain("Ability: Blaze");
    expect(text).toContain("- Flamethrower");
  });

  it.each(TEAMS.map((t, i) => [`用例 ${i + 1}`, t] as const))("往返无损 %s", (_label, team) => {
    expect(roundtripLossless(team)).toBe(true);
  });

  it("往返用例数 ≥ 10（DoD）", () => {
    expect(TEAMS.length).toBeGreaterThanOrEqual(10);
  });
});
