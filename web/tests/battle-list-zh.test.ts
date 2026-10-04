/* battle-list-zh.test.ts —— 模拟对战宝可梦/道具列表全中文回归（U24）。
 * champions dex 的选择列表不允许出现无中文回退的英文名（形态种/超级进化石走 zh-gen 生成表）。 */
import { describe, expect, it } from "vitest";
import { dexFor, itemList, speciesList } from "../src/data";

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
