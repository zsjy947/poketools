/* data/names.ts —— 图鉴命名共享类型（叶子模块）。
 * 原定义在 index.ts，zh-patch.ts 为 type 导入反向依赖 index 造成
 * index ↔ zh-patch 类型级循环；下沉到叶子模块后两文件各自单向导入。 */

/** 引擎 zh-cn 文本包的形状（Dex.loadTextData 的受控子集） */
export interface NamedText {
  Pokedex: Record<string, { name?: string }>;
  Moves: Record<string, { name?: string; shortDesc?: string; desc?: string }>;
  Abilities: Record<string, { name?: string }>;
  Items: Record<string, { name?: string }>;
}
