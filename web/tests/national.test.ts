/* national.test.ts —— 全国图鉴：收集状态物种级全局同步 + nationalDex 数据函数。 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, beforeEach, describe, it, expect } from "vitest";
import { setLoader } from "../src/data/core";
import { nationalDex, nationalFormBadges } from "../src/data/pokemon";
import { setState, setStateBulk, stateCounts, NATIONAL_DEX } from "../src/state/user";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const DATA = path.join(ROOT, "web", "public", "data");

const mem = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (k: string) => (mem.has(k) ? mem.get(k)! : null),
  setItem: (k: string, v: string) => void mem.set(k, String(v)),
  removeItem: (k: string) => void mem.delete(k),
};

beforeAll(() => {
  setLoader((rel) => Promise.resolve(JSON.parse(readFileSync(path.join(DATA, rel), "utf-8"))));
});
beforeEach(() => {
  mem.clear();
});

describe("收集状态：物种级全局同步（任一地区 ⇔ 全国）", () => {
  it("勾 galar 皮卡丘(25) → 跨游戏全部图鉴 + national 同步", async () => {
    const r = await setState({ dex_id: "galar", species_id: 25, caught: true });
    // 25 所在 7 本图鉴（sinnoh/galar/isle-of-armor/hisui/paldea/kitakami/lumiose-city）+ national
    expect(r.synced_dexes.length).toBe(8);
    expect(r.synced_dexes.includes("paldea")).toBe(true); // 跨游戏（朱紫）
    expect(r.synced_dexes.includes("hisui")).toBe(true); // 跨游戏（阿尔宙斯）
    expect(r.synced_dexes.includes(NATIONAL_DEX)).toBe(true);
    const counts = stateCounts() as Record<string, number>;
    expect(counts[NATIONAL_DEX]).toBe(1);
    expect(counts.paldea).toBe(1);
  });

  it("national 取消 → 全部图鉴取消", async () => {
    await setState({ dex_id: "galar", species_id: 25, caught: true });
    await setState({ dex_id: NATIONAL_DEX, species_id: 25, caught: false });
    const counts = stateCounts() as Record<string, number>;
    expect(counts[NATIONAL_DEX] || 0).toBe(0);
    expect(counts.galar || 0).toBe(0);
    expect(counts.kitakami || 0).toBe(0);
  });

  it("无地区归属种（小拉达 19 不在任何图鉴）仅写 national", async () => {
    const r = await setState({ dex_id: NATIONAL_DEX, species_id: 19, caught: true });
    expect(r.synced_dexes).toEqual([NATIONAL_DEX]);
    expect((stateCounts() as any)[NATIONAL_DEX]).toBe(1);
  });

  it("bulk 同步传播与 national dex_id 校验", async () => {
    await setStateBulk({
      dex_id: NATIONAL_DEX,
      species_ids: [19, 25],
      caught: true,
    });
    const counts = stateCounts() as Record<string, number>;
    expect(counts[NATIONAL_DEX]).toBe(2);
    expect(counts.galar).toBe(1); // 25 传播
    await setStateBulk({ dex_id: NATIONAL_DEX, species_ids: [19, 25], caught: false });
    expect((stateCounts() as any)[NATIONAL_DEX] || 0).toBe(0);
    await expect(setState({ dex_id: "nope", species_id: 1, caught: 1 })).rejects.toThrow(
      "dex_id 无效",
    );
  });
});

describe("nationalDex() 数据函数", () => {
  it("1025 物种按全国编号升序，默认形态为一般形态", async () => {
    const data = await nationalDex();
    expect(data.total).toBe(1025);
    expect(data.entries.length).toBe(1025);
    expect(data.entries[0]!.species_id).toBe(1); // 妙蛙种子
    expect(data.entries[1024]!.species_id).toBe(1025);
    const pika = data.entries.find((e) => e.species_id === 25)!;
    expect(pika.form_id).toBe(25); // 默认形态行 id = 物种 id（pikachu 基础形态）
    expect(pika.form_count).toBeGreaterThan(10);
    expect(pika.badges).toEqual(["gmax"]); // 帽子/cosplay 外观行不冒充地区形态
    expect(pika.generation).toBe(1);
  });

  it("形态类别标记：Mega/Gmax/地区/外观口径", async () => {
    const data = await nationalDex();
    const venusaur = data.entries.find((e) => e.species_id === 3)!;
    expect(venusaur.badges).toEqual(["mega", "gmax"]);
    const raichu = data.entries.find((e) => e.species_id === 26)!;
    expect(raichu.badges).toContain("region"); // raichu-alola
    const groudon = data.entries.find((e) => e.species_id === 383)!;
    expect(groudon.badges).toContain("mega"); // primal 并入 Mega 口径
    const plain = data.entries.find((e) => e.species_id === 1)!;
    expect(plain.badges).toEqual([]);
  });

  it("nationalFormBadges 纯函数：合成外观段 id ≥ 900000", () => {
    expect(nationalFormBadges([{ id: 900001, identifier: "unown-b", is_mega: 0 }])).toEqual([
      "cosmetic",
    ]);
    expect(
      nationalFormBadges([
        { id: 1, identifier: "raticate", is_mega: 0 },
        { id: 10092, identifier: "raticate-alola", is_mega: 0 },
      ]),
    ).toEqual(["region"]);
  });
});
