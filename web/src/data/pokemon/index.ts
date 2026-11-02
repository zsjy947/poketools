/* 图鉴/详情端点（唯一实现，自 app/routers/pokemon.py + dex.py 逐行移植的 JS 版 TS 化）。
 * 分片来自 tables/*（行序=SQLite rowid 序，与 SQL 查询序一致性由导出门禁把关）。
 * 自 data/pokemon.ts 目录化拆出：internal 常量辅助 / evolution 进化链 / dex 图鉴 /
 * detail 详情；本文件按原单文件导出面原样再导出，既有导入方零改动。 */
export { FORM_MARKER_TO_SUFFIX, GAME_MOVE_CONFIG, typeSort } from "./internal";
export { evolutionChain } from "./evolution";
export type { EvolutionTree } from "./evolution";
export { games, dexEntries, nationalFormBadges, nationalDex } from "./dex";
export type { FormBadge } from "./dex";
export { pokemonDetail, pokemonMoves } from "./detail";
