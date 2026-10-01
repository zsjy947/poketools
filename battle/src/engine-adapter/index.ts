/**
 * engine-adapter —— 对战引擎适配层（plans/00 §4.1）。
 *
 * 引擎来源对上层透明：当前为供应商化上游包（vendor/ps-engine.js，含 champions mod，
 * scripts/build-engine.mjs 重建）；若未来 @pkmn/sim 发布含 champions 的版本，仅需替换
 * 本文件的重导出来源（三级策略第 1 级），UI 与测试不感知。
 *
 * 分层约束（00 §6.5）：不得向 UI 泄漏引擎内部类型 —— 对外类型一律在本层重声明。
 */
export {
  Dex,
  Teams,
  TeamValidator,
  BattleStream,
  getPlayerStreams,
  toID,
} from "./vendor/ps-engine.js";
export type {
  PokemonSet,
  StatsTable,
  SpeciesData,
  MoveData,
  ItemData,
  AbilityData,
  Format,
  FormatData,
  ModdedDex,
  PRNGSeed,
} from "./vendor/ps-engine.js";

export { BattleSession } from "./session";
export type {
  SideSlot,
  BattlePhase,
  RequestChoice,
  BattleEvent,
  MonState,
  SideState,
  SessionSnapshot,
} from "./session";
export { parseLogLine } from "./parse";
