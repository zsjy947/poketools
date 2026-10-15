/* battle-list-zh.test.ts —— 模拟对战选择列表回归（U24 全中文 + 名册/形态过滤与展示名规范）。
 * champions dex 的选择列表不允许出现无中文回退的英文名（形态种/超级进化石走 zh-gen 生成表）；
 * 列表 = 赛制名册 − 对战临时形态 − 等值重复形态，展示名「种名-形态短名」（battle/data/roster.ts）。 */
import { describe, expect, it } from "vitest";
import { dexFor, itemList, moveView, speciesList } from "../src/data";
import { rosterSpecies, speciesLabel } from "../src/battle/data/roster";

describe("模拟对战列表全中文（U24）", () => {
  it("champions 物种选择列表全中文", () => {
    const list = speciesList(dexFor("champions"));
    expect(list.length).toBeGreaterThan(300);
    const bad = list.filter((s) => !/[\u4e00-\u9fff]/.test(s.zhName));
    expect(bad, JSON.stringify(bad.map((b) => b.id + "|" + b.zhName))).toHaveLength(0);
  });

  it("champions 道具选择列表全中文", () => {
    const list = itemList(dexFor("champions"));
    expect(list.length).toBeGreaterThan(150);
    const bad = list.filter((s) => !/[\u4e00-\u9fff]/.test(s.zhName));
    expect(bad, JSON.stringify(bad.map((b) => b.id + "|" + b.zhName))).toHaveLength(0);
  });
});

describe("对战选择列表清理（名册/临时形态/等值形态/展示名）", () => {
  const dexChamp = dexFor("champions");
  const dexGen9 = dexFor("gen9");
  const champ = rosterSpecies(dexChamp, false).map((s) => s.id);
  const gen9 = rosterSpecies(dexGen9, false).map((s) => s.id);

  it("名册过滤：Reg M-C（champions）下列表无厄诡椪/败露球菇", () => {
    expect(champ).not.toContain("ogerpon");
    expect(champ).not.toContain("amoonguss");
    expect(champ).toContain("garchomp");
  });

  it("对战临时形态全部隐藏（引擎 battleOnly + 手工兜底）", () => {
    const hidden = [
      "mimikyubusted",
      "castformsunny",
      "castformrainy",
      "castformsnowy",
      "aegislashblade",
      "eiscuenoice",
      "palafinhero",
      "morpekohangry",
      "cramorantgulping",
      "cramorantgorging",
      "meloettapirouette",
      "miniormeteor",
      "cherrimsunshine",
      "wishiwashischool",
      "ogerpontealtera",
      "ogerponwellspringtera",
      "ogerponhearthflametera",
      "ogerponcornerstonetera",
      "terapagosterastal",
      "floettemega", // 永恒之花的超进化形态（battleOnly）
    ];
    for (const id of hidden) {
      expect(champ, `champions 列表不应含 ${id}`).not.toContain(id);
      expect(gen9, `gen9 列表不应含 ${id}`).not.toContain(id);
    }
    // 基础形态保留（champions 名册内；gen9 中 castform 系为 Past=朱紫名册外、eiscue 反之）
    expect(champ).toContain("castform");
    expect(champ).toContain("mimikyu");
    expect(gen9).toContain("eiscue");
    expect(champ).toContain("palafin");
    // 永恒之花：champions 可选特殊形态（可超进化），gen9（朱紫）名册外
    expect(champ).toContain("floetteeternal");
    expect(gen9).not.toContain("floetteeternal");
    expect(speciesLabel(dexChamp, "floetteeternal")).toBe("花叶蒂-永恒之花");
  });

  it("等值合并组只保留基础条目", () => {
    expect(champ).toContain("vivillon");
    expect(champ.filter((id) => id.startsWith("vivillon"))).toEqual(["vivillon"]);
    expect(champ.filter((id) => id.startsWith("maushold"))).toEqual(["maushold"]);
    expect(champ.filter((id) => id.startsWith("alcremie"))).toEqual(["alcremie"]);
    expect(champ.filter((id) => id.startsWith("gourgeist"))).toEqual(["gourgeist"]);
    expect(champ.filter((id) => id.startsWith("sinistcha"))).toEqual(["sinistcha"]);
    expect(champ.filter((id) => id.startsWith("squawkabilly"))).toEqual(["squawkabilly"]);
  });

  it("不设默认组全部带短后缀且无裸名项", () => {
    expect(speciesLabel(dexChamp, "basculegion")).toBe("幽尾玄鱼-雄性");
    expect(speciesLabel(dexChamp, "basculegionf")).toBe("幽尾玄鱼-雌性");
    expect(speciesLabel(dexChamp, "lycanroc")).toBe("鬃岩狼人-白昼");
    expect(speciesLabel(dexChamp, "lycanrocmidnight")).toBe("鬃岩狼人-黑夜");
    expect(speciesLabel(dexChamp, "lycanrocdusk")).toBe("鬃岩狼人-黄昏");
    expect(speciesLabel(dexChamp, "meowstic")).toBe("超能妙喵-雄性");
    expect(speciesLabel(dexChamp, "meowsticf")).toBe("超能妙喵-雌性");
    expect(speciesLabel(dexChamp, "rotom")).toBe("洛托姆-普通");
    expect(speciesLabel(dexChamp, "rotomheat")).toBe("洛托姆-加热");
    expect(speciesLabel(dexChamp, "rotomwash")).toBe("洛托姆-洗涤");
    expect(speciesLabel(dexChamp, "rotomfan")).toBe("洛托姆-旋转");
    expect(speciesLabel(dexChamp, "rotommow")).toBe("洛托姆-切割");
    expect(speciesLabel(dexChamp, "rotomfrost")).toBe("洛托姆-冷冻");
    const labels = new Set(
      [
        "basculegion",
        "basculegionf",
        "lycanroc",
        "lycanrocmidnight",
        "lycanrocdusk",
        "meowstic",
        "meowsticf",
        "rotom",
        "rotomheat",
        "rotomwash",
        "rotomfan",
        "rotommow",
        "rotomfrost",
      ].map((id) => speciesLabel(dexChamp, id)),
    );
    expect([...labels].every((l) => l.includes("-"))).toBe(true);
  });

  it("地区形态保留默认裸名 + 地区短后缀", () => {
    expect(speciesLabel(dexChamp, "stunfisk")).toBe("泥巴鱼");
    expect(speciesLabel(dexChamp, "stunfiskgalar")).toBe("泥巴鱼-伽勒尔");
    expect(speciesLabel(dexGen9, "arcaninehisui")).toBe("风速狗-洗翠");
    expect(speciesLabel(dexGen9, "zoroarkhisui")).toBe("索罗亚克-洗翠");
    expect(speciesLabel(dexGen9, "samurotthisui")).toBe("大剑鬼-洗翠");
    expect(speciesLabel(dexGen9, "ninetalesalola")).toBe("九尾-阿罗拉");
    expect(speciesLabel(dexGen9, "raichualola")).toBe("雷丘-阿罗拉");
    expect(speciesLabel(dexGen9, "slowbrogalar")).toBe("呆壳兽-伽勒尔");
    expect(speciesLabel(dexGen9, "slowkinggalar")).toBe("呆呆王-伽勒尔");
    expect(speciesLabel(dexGen9, "taurospaldeacombat")).toBe("肯泰罗-斗战种");
  });

  it("自由对战（unrestricted）放开名册外物种，但仍排除临时/等值/机制形态", () => {
    const free = rosterSpecies(dexGen9, true).map((s) => s.id);
    expect(free).toContain("amoonguss"); // 名册外物种放开
    expect(free).toContain("aegislash"); // gen9 标 Past 但自由对战可用
    expect(free).not.toContain("aegislashblade");
    expect(free).not.toContain("mimikyubusted");
    expect(free).not.toContain("charizardmegax"); // 机制形态（超进化）
    expect(free).not.toContain("gengargmax"); // 机制形态（极巨化）
    expect(free).toContain("yanmega"); // 不误伤：巨螳萤 id 以 mega 结尾但非超进化
    void champ;
  });

  it("机制形态（超进化/极巨化/原始回归）不进入列表", () => {
    expect(champ).not.toContain("garchompmega");
    expect(champ).toContain("garchomp");
  });

  it("招式分类抽样：物理/特殊/变化（引擎首字母大写归一修复回归）", () => {
    const dex = dexChamp;
    expect(moveView(dex, "earthquake")?.category).toBe("physical");
    expect(moveView(dex, "waterfall")?.category).toBe("physical");
    expect(moveView(dex, "bravebird")?.category).toBe("physical");
    expect(moveView(dex, "thunderbolt")?.category).toBe("special");
    expect(moveView(dex, "shadowball")?.category).toBe("special");
    expect(moveView(dex, "dazzlinggleam")?.category).toBe("special");
    expect(moveView(dex, "protect")?.category).toBe("status");
    expect(moveView(dex, "swordsdance")?.category).toBe("status");
    expect(moveView(dex, "thunderwave")?.category).toBe("status");
  });
});
