/* 版本主题色、形态标签与文本格式化纯函数（自 components/shared.tsx 拆出） */

/* ---- 版本主题色 / 形态标签 ---- */
const VERSION_COLORS: Record<string, string> = {
  剑: "#3a6fd8",
  "剑·扩展票": "#3a6fd8",
  盾: "#d0392e",
  "盾·扩展票": "#d0392e",
  "剑/盾": "#4a5b82",
  "剑/盾·扩展票": "#4a5b82",
  晶灿钻石: "#1fa9a0",
  明亮珍珠: "#d76aa8",
  "晶灿钻石/明亮珍珠": "#7b8bb0",
  朱: "#e3342f",
  "朱·零之秘宝": "#e3342f",
  紫: "#8a3fd0",
  "紫·零之秘宝": "#8a3fd0",
  "朱/紫": "#a04d7a",
  "朱/紫·零之秘宝": "#a04d7a",
  洗翠: "#3f8f7d",
  "传说 阿尔宙斯": "#3f8f7d",
  "Z-A": "#c99a1e",
  "传说 Z-A": "#c99a1e",
  "Z-A·异次元": "#c99a1e",
  "晶钻/明珍": "#7b8bb0",
};
export function versionColor(label: string): string {
  if (!label) return "#909399";
  if (VERSION_COLORS[label]) return VERSION_COLORS[label]!;
  if (label.startsWith("剑")) return VERSION_COLORS["剑"]!;
  if (label.startsWith("盾")) return VERSION_COLORS["盾"]!;
  if (label.startsWith("朱")) return VERSION_COLORS["朱"]!;
  if (label.startsWith("紫")) return VERSION_COLORS["紫"]!;
  if (label.startsWith("晶灿") || label.startsWith("晶钻")) return VERSION_COLORS["晶灿钻石"]!;
  if (label.startsWith("明亮") || label.startsWith("明珍")) return VERSION_COLORS["明亮珍珠"]!;
  return "#909399";
}

const FORM_LABEL_ZH: Record<string, string> = {
  attack: "攻击形态",
  defense: "防御形态",
  speed: "速度形态",
  heat: "加热",
  wash: "清洗",
  frost: "结冰",
  fan: "旋转",
  mow: "切割",
  sunny: "晴天",
  rainy: "雨水",
  snowy: "雪云",
  sandy: "砂土蓑衣",
  trash: "垃圾蓑衣",
  zen: "达摩模式",
  pirouette: "舞步形态",
  small: "小",
  large: "大",
  super: "特大",
  female: "雌性",
  male: "雄性",
  "totem-alola": "霸主",
  "alola-cap": "阿罗拉帽子",
  // 帽子/扮相皮卡丘（PokeAPI form_label 为英文，中文名对照 52poke）
  "original-cap": "初代帽子",
  "hoenn-cap": "丰缘帽子",
  "sinnoh-cap": "神奥帽子",
  "unova-cap": "合众帽子",
  "kalos-cap": "卡洛斯帽子",
  "partner-cap": "搭档帽子",
  "world-cap": "世界帽子",
  cosplay: "扮相",
  "rock-star": "摇滚明星",
  belle: "贵妇",
  "pop-star": "流行明星",
  phd: "博士",
  libre: "摔跤手",
  "blue-striped": "蓝条纹",
  "white-striped": "白条纹",
  origin: "起源形态",
  altered: "另形态",
};
export function formDisplayName(f: any): string {
  if (!f) return "";
  const label = f.form_label || "";
  if (label && /[\u4e00-\u9fff]/.test(label)) return label;
  return FORM_LABEL_ZH[label] || label;
}

/* ---- 工具 ---- */
export function versionChip(label: string): string {
  if (!label) return "";
  if (label.includes("扩展票")) return "扩展票";
  if (label.includes("零之秘宝")) return "零之秘宝";
  if (label.includes("异次元")) return "异次元";
  if (["剑", "盾", "朱", "紫"].includes(label)) return label;
  return "";
}
export function chipClass(label: string): string {
  return label.includes("扩展票") || label.includes("零之秘宝") || label.includes("异次元")
    ? "dlc"
    : "ver";
}

export function koTextFromKo(ko: any): string {
  if (!ko) return "";
  const p = ko.probs || {};
  const p1 = p["1"] || 0,
    p2 = p["2"] || 0,
    p4 = p["4"] || 0;
  if (p1 >= 100) return "1 回合击倒（确定）";
  if (p1 > 0) return `${Math.round(p1)}% 1 回合击倒`;
  if (p2 >= 100) return "2 回合内击倒（确定）";
  if (p2 > 0) return `${Math.round(p2)}% 2 回合内击倒`;
  if (p4 >= 100) return "4 回合内击倒（确定）";
  if (p4 > 0) return `${Math.round(p4)}% 4 回合内击倒`;
  return "4 回合内无法击倒";
}
