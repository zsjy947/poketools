/* state.golden.test.ts —— 用户状态端点黄金用例（原 tools/static-check/state.test.mjs 的
 * vitest 移植；localStorage 键与 Vue 版一致，用户数据零迁移）。 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, beforeEach, describe, it, expect } from "vitest";
import { setLoader } from "../src/data/core";
import {
  setState,
  setStateBulk,
  stateCounts,
  listCustomRecipes,
  addCustomRecipe,
  delCustomRecipe,
  exportAll,
  importAll,
} from "../src/state/user";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const DATA = path.join(ROOT, "web", "public", "data");

// Node 环境 localStorage mock（键值与浏览器一致）
const mem = new Map<string, string>();
viLocalStorage();
function viLocalStorage(): void {
  (globalThis as any).localStorage = {
    getItem: (k: string) => (mem.has(k) ? mem.get(k)! : null),
    setItem: (k: string, v: string) => void mem.set(k, String(v)),
    removeItem: (k: string) => void mem.delete(k),
  };
}

beforeAll(() => {
  setLoader((rel) => Promise.resolve(JSON.parse(readFileSync(path.join(DATA, rel), "utf-8"))));
});
beforeEach(() => {
  mem.clear();
});

async function throws(fn: () => any, msg?: string): Promise<void> {
  try {
    await fn();
  } catch (e) {
    if (msg && !String((e as Error).message).includes(msg)) {
      throw new Error(`异常文案不含「${msg}」：${(e as Error).message}`, { cause: e });
    }
    return;
  }
  throw new Error("预期抛错但未抛");
}

describe("用户状态端点", () => {
  it("PUT /api/state：帕底亚标记 906 → 同游戏图鉴同步", async () => {
    const r = await setState({ profile_id: 1, dex_id: "paldea", species_id: 906, caught: true });
    expect(r.ok).toBe(true);
    expect(r.synced_dexes.includes("paldea")).toBe(true);
  });

  it("GET counts / 取消标记归零 / bulk 批量", async () => {
    await setState({ profile_id: 1, dex_id: "paldea", species_id: 906, caught: true });
    expect((stateCounts() as any).paldea).toBeTruthy();
    await setState({ profile_id: 1, dex_id: "paldea", species_id: 906, caught: false });
    expect((stateCounts() as any).paldea || 0).toBe(0);
    const r = await setStateBulk({
      profile_id: 1,
      dex_id: "paldea",
      species_ids: [906, 907, 908],
      caught: true,
    });
    expect(r).toEqual({ ok: true, count: 3 });
    expect((stateCounts() as any).paldea).toBe(3);
  });

  it("PUT 校验：未知 dex_id 拒绝", async () => {
    await throws(() => setState({ dex_id: "nope", species_id: 1, caught: 1 }), "dex_id 无效");
  });

  it("custom-recipes：非法游戏/缺调味料/Z-A 数量拒绝", async () => {
    await throws(
      () =>
        addCustomRecipe({
          profile_id: 1,
          game: "sword-shield",
          name: "x",
          effects: [{ power: "蛋蛋力", level: 1 }],
          ingredients: [{ name: "a", count: 1 }],
          seasonings: [{ name: "b", count: 1 }],
        }),
      "不支持自定义食谱",
    );
    await throws(
      () =>
        addCustomRecipe({
          profile_id: 1,
          game: "scarlet-violet",
          name: "x",
          effects: [{ power: "蛋蛋力", level: 1 }],
          ingredients: [{ name: "辣香肠", count: 1 }],
        }),
      "必填",
    );
    await throws(
      () =>
        addCustomRecipe({
          profile_id: 1,
          game: "legends-za",
          name: "x",
          effects: [{ power: "蛋蛋力", level: 1 }],
          ingredients: [{ name: "欧蔓果", count: 2 }],
        }),
      "3~8",
    );
  });

  it("custom-recipes：朱紫带数量写入 → 列表（倒序）→ 删除", async () => {
    const r = addCustomRecipe({
      profile_id: 1,
      game: "scarlet-violet",
      name: "测试三明治",
      effects: [{ power: "龙之力", type: "龙", level: 2 }],
      ingredients: [
        { name: "辣香肠", count: 2 },
        { name: "生菜", count: 1 },
      ],
      seasonings: [
        { name: "盐", count: 1 },
        { name: "胡椒", count: 3 },
      ],
    });
    expect(r.ingredients).toEqual([
      { name: "辣香肠", count: 2 },
      { name: "生菜", count: 1 },
    ]);
    const list = listCustomRecipes({ game: "scarlet-violet" });
    expect(list.length).toBe(1);
    expect(list[0]!.id).toBe(r.id);
    expect(await delCustomRecipe(r.id)).toEqual({ ok: true });
    expect(listCustomRecipes({}).length).toBe(0);
  });

  it("custom-recipes：旧格式（字符串数组）localStorage 兼容读取", async () => {
    mem.set(
      "pkt.custom_recipes.v1",
      JSON.stringify([
        {
          id: 990,
          game: "scarlet-violet",
          name: "旧格式食谱",
          effects: [{ power: "蛋蛋力", level: 1 }],
          ingredients: ["辣香肠", "生菜"],
          seasonings: ["盐"],
        },
      ]),
    );
    const list = listCustomRecipes({ game: "scarlet-violet" });
    expect(list.length).toBe(1);
    expect(list[0]!.ingredients).toEqual(["辣香肠", "生菜"]);
    mem.delete("pkt.custom_recipes.v1");
  });

  it("exportAll/importAll：迁移兜底往返无损", async () => {
    await setState({ profile_id: 1, dex_id: "paldea", species_id: 25, caught: true });
    await addCustomRecipe({
      profile_id: 1,
      game: "scarlet-violet",
      name: "迁移",
      effects: [{ power: "遭遇力", type: "一般", level: 1 }],
      ingredients: [{ name: "辣香肠", count: 1 }],
      seasonings: [{ name: "盐", count: 1 }],
    });
    const snapshot = exportAll();
    mem.clear();
    expect(exportAll().caught_state).toEqual({});
    importAll(snapshot);
    expect(exportAll()).toEqual(snapshot);
    expect((stateCounts() as any).paldea).toBe(1);
  });
});
