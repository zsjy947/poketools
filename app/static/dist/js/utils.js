/* 共享纯函数工具（O4 抽取自视图内重复实现；免构建全局脚本） */
const PktUtils = {
  /* identifier → 形态后缀（garchomp-mega → mega；无后缀返回 ""） */
  suffixOf(identifier) {
    const ident = String(identifier || "");
    const i = ident.lastIndexOf("-");
    return i >= 0 ? ident.slice(i + 1) : "";
  },
  /* 52poke 获得方式版本标签 → 独占/DLC chip 文案（ev.js 详情获取行共用口径） */
  versionChip(label) {
    if (!label) return "";
    if (label.includes("扩展票")) return "扩展票";
    if (label.includes("零之秘宝")) return "零之秘宝";
    if (label.includes("异次元")) return "异次元";
    if (["剑", "盾", "朱", "紫"].includes(label)) return label;
    return "";
  },
  chipClass(label) {
    return (label.includes("扩展票") || label.includes("零之秘宝")
      || label.includes("异次元")) ? "dlc" : "ver";
  },
  /* KO 概率分布 → 中文表述（计算器结果条；n 回合内/确定 n 回合） */
  koTextFromKo(ko) {
    if (!ko) return "";
    const p = ko.probs || {};
    const p1 = p["1"] || 0, p2 = p["2"] || 0, p4 = p["4"] || 0;
    if (p1 >= 100) return "1 回合击倒（确定）";
    if (p1 > 0) return `${Math.round(p1)}% 1 回合击倒`;
    if (p2 >= 100) return "2 回合内击倒（确定）";
    if (p2 > 0) return `${Math.round(p2)}% 2 回合内击倒`;
    if (p4 >= 100) return "4 回合内击倒（确定）";
    if (p4 > 0) return `${Math.round(p4)}% 4 回合内击倒`;
    return "4 回合内无法击倒";
  },
};
