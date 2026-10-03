/* breeding.golden.test.ts —— 生蛋链算法黄金用例（原 tests/test_breeding.py 用例移植）。
 * 数据走 web/public/data 分片（导出门禁保证与 DB 一致）。 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, it, expect } from "vitest";
import { setLoader, table } from "../src/data/core";
import { breedChains } from "../src/data/lookup";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const DATA = path.join(ROOT, "web", "public", "data");

beforeAll(() => {
  setLoader((rel) => Promise.resolve(JSON.parse(readFileSync(path.join(DATA, rel), "utf-8"))));
});

async function moveId(name: string): Promise<number> {
  const m = (await table("moves")).find((x) => x.name_zh === name);
  if (!m) throw new Error(`move ${name} not found`);
  return m.id;
}

function validate(data: any): void {
  /** 校验链结构：steps 非空、首环自学、相邻可交配、末步到达目标。 */
  for (const c of data.chains) {
    expect(c.steps.length, "链为空").toBeGreaterThan(0);
    expect(c.length, "存在非最短路径").toBe(data.min_length);
    expect(c.steps[0]!.from.learn, "首环必须能自学招式").not.toBe("蛋招式（需由上一环遗传）");
    for (const s of c.steps) {
      const ga = new Set(s.from.groups as string[]);
      const gb = new Set(s.to.groups as string[]);
      const overlap = [...ga].some((x) => gb.has(x));
      expect(overlap || ga.has("百变怪") || gb.has("百变怪"), "相邻物种必须可交配").toBe(true);
    }
    const last = c.steps[c.steps.length - 1]!;
    expect(last.to.species_id, "末步必须到达目标").toBe(data.target.species_id);
  }
}

describe("生蛋链算法（breedChains）", () => {
  it("直接链：新叶喵 × 寄生种子（朱紫）最短 1 次繁殖", async () => {
    const data = await breedChains(906, await moveId("寄生种子"), "scarlet-violet");
    expect(data.ok).toBe(true);
    expect(data.min_length).toBe(1);
    expect(data.chain_count).toBeGreaterThanOrEqual(1);
    validate(data);
  });

  it("多级链：新叶喵 × 交换场地（朱紫）≥2 次繁殖", async () => {
    const data = await breedChains(906, await moveId("交换场地"), "scarlet-violet");
    expect(data.ok).toBe(true);
    expect(data.min_length).toBeGreaterThanOrEqual(2);
    expect(data.chain_count).toBeGreaterThanOrEqual(1);
    validate(data);
  });

  it("未发现蛋组（固拉多）拒绝", async () => {
    const data = await breedChains(383, await moveId("剑舞"), "scarlet-violet");
    expect(data.ok).toBe(false);
    expect(String(data.reason)).toContain("未发现");
  });
});
