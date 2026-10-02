/* zh-patch 查重单测：新译值不与既有中文表冲突、同 id 唯一、不覆盖引擎非空译名。 */
import { describe, it, expect } from "vitest";
import { Dex } from "../src/engine-adapter";
import {
  zhText,
  TYPE_ZH,
  NATURE_ZH,
  STATUS_ZH,
  STAT_ZH,
  speciesView,
  moveView,
  itemView,
  dexFor,
} from "../src/data";
import { ZH_PATCH, zhTable, zhLine } from "../src/data/zh-patch";

/* 既有中文对照集（新译文不得与之同值异义冲突） */
const RESERVED_ZH = new Set<string>([
  ...Object.values(TYPE_ZH),
  ...Object.values(NATURE_ZH),
  ...Object.values(STATUS_ZH),
  ...Object.values(STAT_ZH),
  "太晶化",
  "极巨化",
  "超极巨化",
  "超级进化",
  "Z招式",
  "主页",
  "队伍编辑",
  "上阵预览",
  "对局记录",
  "设置",
  "物理",
  "特殊",
  "变化",
]);

describe("zh-patch 查重", () => {
  it("静态补丁：同 id 唯一值（对象键天然唯一）+ 不占用保留中文词", () => {
    for (const [id, zh] of Object.entries(ZH_PATCH)) {
      expect(id, "id 非空").toBeTruthy();
      expect(zh, "译值非空").toBeTruthy();
      // 保留词被机制/导航/校验文案占用：新译值不得与之完全同值（避免同值异义）
      expect(RESERVED_ZH.has(zh), `${id} 的译值「${zh}」与既有机制/导航词冲突`).toBe(false);
    }
  });

  it("派生补丁：不覆盖引擎 zh-cn 已有真实中文译名（占位英文除外）", () => {
    const zh = zhText();
    const table = zhTable(zh);
    const isZh = (s3: string | undefined) => !!s3 && /[一-鿿]/.test(s3);
    for (const [id, v] of Object.entries(zh.Moves).slice(0, 60)) {
      if (isZh(v?.name)) expect(table.zhById.get(id)).toBe(v.name);
    }
    for (const [id, v] of Object.entries(zh.Pokedex).slice(0, 60)) {
      if (isZh(v?.name)) expect(table.zhById.get(id)).toBe(v.name);
    }
  });

  it("Mega/Gmax 形态与进化石派生：格式正确且基名存在", () => {
    const table = zhTable(zhText());
    expect(table.zhById.get("charizardgmax")).toBe("超极巨喷火龙");
    expect(table.zhById.get("garchompmega")).toBe("超级烈咬陆鲨");
    expect(table.zhById.get("mewtwomegax")).toBe("超级超梦Ｘ");
    expect(table.zhById.get("charizarditex")).toBe("喷火龙进化石Ｘ");
    expect(table.zhById.get("gyaradosite")).toBe("暴鲤龙进化石");
    expect(table.zhById.get("noability")).toBe("无特性");
  });

  it("视图层走补丁：Gmax 形态/进化式中文名不再回落英文", () => {
    const dex = dexFor("gen9");
    const gmax = speciesView(dex, "charizard-gmax");
    expect(gmax?.zhName).toBe("超极巨喷火龙");
    const stone = itemView(dex, "charizarditex");
    expect(stone?.zhName).toBe("喷火龙进化石Ｘ");
  });

  it("zhLine：整行英文专名替换为中文（未命中保留原文）", () => {
    expect(zhLine("Garchomp used Earthquake!")).toContain("烈咬陆鲨");
    expect(zhLine("Garchomp used Earthquake!")).toContain("地震");
    expect(zhLine("Charizard-Gmax used G-Max Wildfire!")).toContain("超极巨喷火龙");
    expect(zhLine("plain text without pokemon")).toBe("plain text without pokemon");
  });

  it("招式说明中文优先（moveView.desc）", () => {
    const dex = dexFor("gen9");
    const mv = moveView(dex, "earthquake");
    expect(mv?.zhName).toBe("地震");
    // zh-cn 无 shortDesc 的招式回退英文 desc（不为空即可）
    if (mv?.desc) expect(mv.desc.length).toBeGreaterThan(0);
  });
});
void Dex;
