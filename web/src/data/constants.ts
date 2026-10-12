/**
 * 领域常量单源（UI 面向的枚举/标签/配色）：
 * 此前 data/api.ts、data/index.ts、components/shared.tsx 三处各持一份副本，收敛于此。
 * data/api.ts 与 data/index.ts 转为 re-export，既有消费方 import 路径不变。
 */

export const TYPE_LIST = [
  "一般",
  "火",
  "水",
  "电",
  "草",
  "冰",
  "格斗",
  "毒",
  "地面",
  "飞行",
  "超能力",
  "虫",
  "岩石",
  "幽灵",
  "龙",
  "恶",
  "钢",
  "妖精",
];
export const STAT_KEYS = ["hp", "atk", "def", "spa", "spd", "spe"] as const;
export const STAT_ZH: Record<string, string> = {
  hp: "HP",
  atk: "攻击",
  def: "防御",
  spa: "特攻",
  spd: "特防",
  spe: "速度",
};
export const EV_NAMES: Record<string, string> = {
  hp: "HP",
  atk: "攻击",
  def: "防御",
  spa: "特攻",
  spd: "特防",
  spe: "速度",
};
export const POWER_LIST = [
  "蛋蛋力",
  "遭遇力",
  "闪光力",
  "捕获力",
  "大大力",
  "小小力",
  "经验力",
  "掉物力",
  "团战力",
  "称号力",
];
export const POWER_COLORS: Record<string, string> = {
  蛋蛋力: "#f6a5c8",
  遭遇力: "#7bc86c",
  闪光力: "#f2d24b",
  捕获力: "#e8834a",
  大大力: "#e05a5a",
  小小力: "#6fc7e8",
  经验力: "#8f7ff0",
  掉物力: "#63b0a2",
  团战力: "#5a9be0",
  称号力: "#c8a2d8",
};
