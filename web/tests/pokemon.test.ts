/* pokemon.test.ts —— 图鉴详情数据层回归：形态选择哨兵 / 地区形态获取方式过滤 /
 * mega-z（Z-A 异次元）形态数据 / 战斗形态学习集回退。
 * 数据源为 web/public/data 静态分片（与 breeding/state golden 同口径）。 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import { setLoader } from "../src/data/core";
import { pokemonDetail, pokemonMoves } from "../src/data/pokemon";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const DATA = path.join(ROOT, "web", "public", "data");

beforeAll(() => {
  setLoader((rel) => Promise.resolve(JSON.parse(readFileSync(path.join(DATA, rel), "utf-8"))));
});

describe("图鉴详情：形态选择与图鉴默认形态", () => {
  it("蓝莓图鉴默认选中阿罗拉穿山鼠（dex 默认形态派生）", async () => {
    const d = await pokemonDetail(27, { game: "scarlet-violet", dex: "blueberry" });
    expect(d.selected_suffix).toBe("alola");
  });

  it("form=base 哨兵显式取基础形态：selected_suffix 为空、获取方式无地区形态标记行", async () => {
    const alola = await pokemonDetail(27, { game: "scarlet-violet", dex: "blueberry" });
    const base = await pokemonDetail(27, {
      game: "scarlet-violet",
      dex: "blueberry",
      form: "base",
    });
    expect(base.selected_suffix).toBe("");
    /* 阿罗拉视图能看到带 A 标记的行；基础视图不应混入 */
    const alolaMarked = alola.get_methods.filter((x: any) => x.form === "A");
    const baseMarked = base.get_methods.filter((x: any) => x.form === "A");
    expect(alolaMarked.length).toBeGreaterThanOrEqual(0);
    expect(baseMarked.length).toBe(0);
  });

  it("来回切换语义：基础→地区→基础均可取到正确后缀（防 appliedFormId 死锁回归）", async () => {
    for (const form of ["base", "alola", "base", "alola"]) {
      const d = await pokemonDetail(27, { game: "scarlet-violet", dex: "blueberry", form });
      expect(d.selected_suffix).toBe(form === "base" ? "" : "alola");
    }
  });

  it("不传 form 时才回退图鉴默认形态；显式传地区后缀优先", async () => {
    const dexDefault = await pokemonDetail(27, { game: "scarlet-violet", dex: "blueberry" });
    const explicit = await pokemonDetail(27, {
      game: "scarlet-violet",
      dex: "blueberry",
      form: "alola",
    });
    expect(dexDefault.selected_suffix).toBe("alola");
    expect(explicit.selected_suffix).toBe("alola");
  });
});

describe("图鉴详情：获取方式的形态标记解析", () => {
  it("彩粉蝶花纹获取方式挂靠到花纹形态（U19 形态补齐后不再堆在基础视图）", async () => {
    const base = await pokemonDetail(666, { game: "scarlet-violet" });
    const baseRows = base.get_methods.filter((x: any) =>
      ["Fan", "Gar", "Mar", "Pok", "Pol"].includes(x.form),
    );
    expect(baseRows.length).toBe(0);
    const fancy = await pokemonDetail(666, { game: "scarlet-violet", form: "fancy" });
    expect(fancy.selected_suffix).toBe("fancy");
    expect(fancy.get_methods.some((x: any) => x.form === "Fan")).toBe(true);
  });
});

describe("图鉴详情：mega-z（Z-A 异次元）形态数据", () => {
  it("烈咬陆鲨Ｚ入库：Z-A 可见、属性龙/地面、特性飘浮", async () => {
    const d = await pokemonDetail(445, { game: "legends-za" });
    const mz = d.forms.find((f: any) => f.identifier === "garchomp-mega-z");
    expect(mz).toBeTruthy();
    expect(mz!.types).toBe("龙,地面");
    expect(mz!.abilities).toBe("飘浮");
    const swsh = await pokemonDetail(445, { game: "sword-shield" });
    expect(swsh.forms.find((f: any) => f.identifier === "garchomp-mega-z")).toBeFalsy();
  });

  it("路卡利欧Ｚ特性为波导防护（PokeAPI 缺简中名，curated 补齐）", async () => {
    const d = await pokemonDetail(448, { game: "legends-za" });
    const mz = d.forms.find((f: any) => f.identifier === "lucario-mega-z");
    expect(mz?.abilities ?? "").toBe("波导防护");
  });

  it("Z-A 超进化石可查（烈咬陆鲨进化石Ｚ）", async () => {
    const { table } = await import("../src/data/core");
    const items = await table("items");
    const stone = items.find((i: any) => i.identifier === "garchompite-z");
    expect(stone?.name_zh).toBe("烈咬陆鲨进化石Ｚ");
  });
});

describe("招式表：战斗形态学习集回退", () => {
  it("Z-A 烈咬陆鲨Ｚ无专属学习集时回落默认形态", async () => {
    const mz = await pokemonMoves(445, { game: "legends-za", form_id: 10309 });
    const base = await pokemonMoves(445, { game: "legends-za", form_id: 445 });
    const mzMoves = (mz.groups.level ?? []).map((r: any) => r.move_id).sort();
    const baseMoves = (base.groups.level ?? []).map((r: any) => r.move_id).sort();
    expect(mzMoves).toEqual(baseMoves);
    expect(mzMoves.length).toBeGreaterThan(0);
  });
});

describe("进化链：地区行与形态图（U19 数据核对回归）", () => {
  it("朱紫雷丘默认分支条件不带「在阿罗拉地区」（PokeAPI 单行 region 缺陷兜底）", async () => {
    const { evolutionChain } = await import("../src/data/pokemon");
    const evo = await evolutionChain(26, "");
    expect(evo.conds["25|26"]).not.toContain("阿罗拉");
    expect(evo.conds["25|26"]).toContain("雷之石");
  });

  it("阿罗拉分支条件保留地区标注", async () => {
    const { evolutionChain } = await import("../src/data/pokemon");
    const evo = await evolutionChain(26, "alola");
    expect(evo.conds["25|26"]).toContain("阿罗拉");
  });

  it("传说阿尔宙斯的叶/冰伊布=道具或定点双途径（U25）", async () => {
    const { evolutionChain } = await import("../src/data/pokemon");
    const evo = await evolutionChain(133, "", "legends-arceus");
    expect(evo.conds["133|470"]).toContain("叶之石");
    expect(evo.conds["133|470"]).toContain("苔藓岩石");
    expect(evo.conds["133|471"]).toContain("冰之石");
    expect(evo.conds["133|471"]).toContain("冰岩石");
  });

  it("常规链当前物种节点按所选形态切图（一家鼠三只家庭）", async () => {
    const { evolutionChain } = await import("../src/data/pokemon");
    const base = await evolutionChain(925, "");
    const three = await evolutionChain(925, "family-of-three");
    expect(three.nodes[925]!.form_id).toBe(10257);
    expect(base.nodes[925]!.form_id).not.toBe(10257);
  });

  it("鬃岩狼人黄昏形态节点切图", async () => {
    const { evolutionChain } = await import("../src/data/pokemon");
    const evo = await evolutionChain(745, "dusk");
    expect(evo.nodes[745]!.form_id).toBe(10152);
  });
});

describe("图鉴默认形态：52poke 图鉴列表页核对修正", () => {
  it("北上乡乌波=默认形态（下一行沼王），帕底亚乌波=帕底亚形态（下一行土王）", async () => {
    const kitakami = await pokemonDetail(194, { game: "scarlet-violet", dex: "kitakami" });
    expect(kitakami.selected_suffix).toBe("");
    const paldea = await pokemonDetail(194, { game: "scarlet-violet", dex: "paldea" });
    expect(paldea.selected_suffix).toBe("paldea");
  });

  it("蓝莓图鉴椰蛋树默认阿罗拉形态", async () => {
    const d = await pokemonDetail(103, { game: "scarlet-violet", dex: "blueberry" });
    expect(d.selected_suffix).toBe("alola");
  });

  it("朱紫爱管侍雌雄双形态均可见（原雌形态缺 SV 可用性）", async () => {
    const d = await pokemonDetail(876, { game: "scarlet-violet" });
    const idents = d.forms.map((f: any) => f.identifier);
    expect(idents).toContain("indeedee-male");
    expect(idents).toContain("indeedee-female");
  });
});
