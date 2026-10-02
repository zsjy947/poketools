// M2 金标准对拍：官方 replay 结构合法性核验（tests/replays/*.log，来自 replay.pokemonshowdown.com）
//
// 官方日志不含 seed/inputlog，无法逐行重放；对拍口径为**真实对局数据核验**：
// ① 赛制与队伍物种存在性（图鉴口径一致）
// ② 使用的每个招式 ∈ 该物种本世代可学池（getMovePool，学习表口径一致）
// ③ 属性克制标注（|-supereffective|/|-resisted|/|-immune|）与本地属性表计算一致
//    （逐事件快照太晶/天气/地形状态；环境变换类招式按快照还原实际属性）
// 道具/能力存在性一并核验。物种局内变形（mega/detailschange）逐事件跟踪。
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { Dex, toID } from "../src/engine-adapter";
import { dexFor } from "../src/data";

const REPLAY_DIR = join(dirname(fileURLToPath(import.meta.url)), "replays");

/** 实际属性随环境变化的招式：按快照还原；无法静态还原的跳过 */
const WEATHER_BALL_TYPES: Record<string, string> = {
  SunnyDay: "Fire",
  DesolateLand: "Fire",
  RainDance: "Water",
  PrimordialSea: "Water",
  Sandstorm: "Rock",
  Snow: "Ice",
  Hail: "Ice",
};
const ENV_TYPED_SKIP = new Set([
  "terrainpulse",
  "tera blast",
  "terastarstorm",
  "judgment",
  "multiattack",
  "technoblast",
  "naturalgift",
  "hiddenpower",
]);

interface MoveEvent {
  user: string;
  userSpecies: string | undefined;
  userTera: string | undefined;
  moveName: string;
  target: string;
  targetSpecies: string | undefined;
  targetTera: string | undefined;
  targetUntyped: boolean;
  weather: string | undefined;
  effect?: "supereffective" | "resisted" | "immune";
  /** 标注行自带的受击者 ident（spread 招式与 primary target 可能不同） */
  effectTarget?: string | undefined;
  effectFrom?: string | undefined;
  /** 受击者已揭示的道具/特性（免疫与倍率修饰跳过依据） */
  targetItem?: string | undefined;
  targetAbility?: string | undefined;
}

interface ParsedReplay {
  formatid: string;
  teams: { p1: string[]; p2: string[] };
  identSpecies: Map<string, string>;
  identItem: Map<string, string>;
  identAbility: Map<string, string>;
  moves: MoveEvent[];
  items: string[];
  abilities: string[];
}

/** 会改写属性克制结果的特性/道具（出现即跳过该受击者的克制核验） */
const MODIFYING_ABILITIES = new Set([
  "Good as Gold",
  "Tera Shell",
  "Levitate",
  "Fluffy",
  "Thick Fat",
  "Sap Sipper",
  "Water Absorb",
  "Volt Absorb",
  "Lightning Rod",
  "Motor Drive",
  "Storm Drain",
  "Flash Fire",
  "Wind Rider",
  "Earth Eater",
  "Purifying Salt",
  "Well-Baked Body",
  "Dry Skin",
  "Heatproof",
  "Water Bubble",
  "Wonder Guard",
  "Filter",
  "Solid Rock",
  "Neuroforce",
  "Sniper",
  "Prism Armor",
  "Shadow Shield",
  "Multiscale",
  "Ice Face",
  "Disguise",
  "Embody Aspect (Teal)",
  "Embody Aspect (Wellspring)",
  "Embody Aspect (Hearthflame)",
  "Embody Aspect (Cornerstone)",
]);
const MODIFYING_ITEMS = new Set(["Air Balloon", "Ring Target", "Terrain Extender"]);

/** "Clefairy, L50, F, shiny" → "Clefairy"（保留形态后缀如 Ogerpon-Wellspring） */
function speciesOf(detail: string): string {
  return (detail.split(",")[0] ?? "").trim();
}

function parseReplay(text: string): ParsedReplay {
  const out: ParsedReplay = {
    formatid: "",
    teams: { p1: [], p2: [] },
    identSpecies: new Map(),
    identItem: new Map(),
    identAbility: new Map(),
    moves: [],
    items: [],
    abilities: [],
  };
  const identTera = new Map<string, string>();
  const untypedIdents = new Set<string>();
  let weather: string | undefined;
  let lastMove: MoveEvent | null = null;
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line.startsWith("|")) continue;
    const p = line.split("|");
    const kind = p[1] ?? "";
    switch (kind) {
      case "poke": {
        const side = p[2] === "p2" ? "p2" : "p1";
        out.teams[side].push(speciesOf(p[3] ?? ""));
        break;
      }
      case "replace":
      case "switch":
      case "drag":
      case "detailschange":
      case "-formechange": {
        out.identSpecies.set(p[2] ?? "", speciesOf(p[3] ?? ""));
        break;
      }
      case "-terastallize": {
        identTera.set(p[2] ?? "", p[3] ?? "");
        break;
      }
      case "-weather": {
        const w = toID(p[2] ?? "");
        weather = w && w !== "none" && w !== "upkeep" ? String(w) : undefined;
        break;
      }
      case "-fieldstart":
      case "-fieldend": {
        // 地形（Electric Terrain 等）—— Terrain Pulse 已在跳过名单
        break;
      }
      case "-start": {
        const what = toID(p[3] ?? "");
        if (what.includes("typechange") || what === "protosynthesis" || what === "quarkdrive") {
          untypedIdents.add(p[2] ?? "");
        }
        break;
      }
      case "move": {
        const user = p[2] ?? "";
        const target = p[4] ?? "";
        lastMove = {
          user,
          userSpecies: out.identSpecies.get(user),
          userTera: identTera.get(user),
          moveName: p[3] ?? "",
          target,
          targetSpecies: out.identSpecies.get(target),
          targetTera: identTera.get(target),
          targetUntyped: untypedIdents.has(target),
          weather,
        };
        out.moves.push(lastMove);
        break;
      }
      case "-supereffective":
      case "-resisted":
      case "-immune": {
        if (!lastMove) break;
        lastMove.effect =
          kind === "-supereffective"
            ? "supereffective"
            : kind === "-resisted"
              ? "resisted"
              : "immune";
        lastMove.effectTarget = p[2] ?? undefined;
        lastMove.effectFrom = p.slice(3).some((x) => (x ?? "").startsWith("[from]"))
          ? "from"
          : undefined;
        break;
      }
      case "-item": {
        out.items.push(p[3] ?? "");
        out.identItem.set(p[2] ?? "", p[3] ?? "");
        break;
      }
      case "-ability": {
        if (!(p[4] ?? "").startsWith("[from]")) {
          out.abilities.push(p[3] ?? "");
          out.identAbility.set(p[2] ?? "", p[3] ?? "");
        }
        break;
      }
      default:
        break;
    }
  }
  return out;
}

/** 环境快照下招式的实际攻击属性（undefined = 无法静态还原） */
function effectiveType(dex: ReturnType<typeof dexFor>, ev: MoveEvent): string | undefined {
  const mv = dex.moves.get(ev.moveName);
  if (!mv.exists) return undefined;
  const id = String(toID(ev.moveName));
  if (id === "weatherball") return ev.weather ? WEATHER_BALL_TYPES[ev.weather] : mv.type;
  if (id === "terablast") return ev.userTera && ev.userTera !== "Stellar" ? ev.userTera : mv.type;
  if (ENV_TYPED_SKIP.has(id)) return undefined;
  return mv.type;
}

describe("M2 金标准对拍：官方 replay 数据核验", () => {
  const files = readdirSync(REPLAY_DIR).filter((f) => f.endsWith(".log"));
  it("样本 ≥3 条（VGC 双打 / BSS 单打 / OU）", () => {
    expect(files.length).toBeGreaterThanOrEqual(3);
  });

  for (const file of files) {
    const formatid = file.replace(/-\d+\.log$/, "").replace(/^smogtours-/, "");
    it(`${file}：赛制/图鉴/学习表/属性克制一致`, () => {
      const replay = parseReplay(readFileSync(join(REPLAY_DIR, file), "utf8"));
      Dex.includeFormats();
      expect(
        (Dex.formats.get(formatid) as { exists?: boolean }).exists,
        `赛制缺失：${formatid}`,
      ).toBe(true);
      const dex = dexFor(Dex.formats.get(formatid).mod ?? "gen9");

      // ① 队伍物种存在
      const all = [...replay.teams.p1, ...replay.teams.p2, ...replay.identSpecies.values()];
      for (const sp of all) {
        expect(dex.species.get(sp).exists, `物种不存在：${sp}`).toBe(true);
      }

      // ② 招式 ∈ 可学池（Struggle 等边界白名单）
      const WHITELIST = new Set(["struggle"]);
      const pools = new Map<string, Set<string>>();
      const poolOf = (species: string): Set<string> => {
        const sp = dex.species.get(species);
        if (!pools.has(sp.id)) pools.set(sp.id, new Set(dex.species.getMovePool(sp.id)));
        return pools.get(sp.id)!;
      };
      const moveViolations: string[] = [];
      for (const ev of replay.moves) {
        if (!ev.userSpecies) continue;
        const moveid = String(toID(ev.moveName));
        if (WHITELIST.has(moveid)) continue;
        if (!poolOf(ev.userSpecies).has(moveid))
          moveViolations.push(`${ev.user}(${ev.userSpecies}) → ${ev.moveName}`);
      }
      expect(moveViolations, `学习表缺口：\n${moveViolations.join("\n")}`).toEqual([]);

      // ③ 属性克制标注一致（[from]/修饰特性道具/局内变形/星晶太晶跳过——属性表口径之外的行为层）
      const mismatches: string[] = [];
      let checked = 0;
      let skippedModifiers = 0;
      for (const ev of replay.moves) {
        if (!ev.effect || ev.effectFrom) continue;
        // 标注行自带受击者（spread 招式与 primary target 不同）；缺省回退招式目标
        const defender = ev.effectTarget ?? ev.target;
        const defenderSpecies = replay.identSpecies.get(defender);
        if (!defenderSpecies) continue;
        const defenderTera = ev.targetTera;
        if (
          MODIFYING_ABILITIES.has(replay.identAbility.get(defender) ?? "") ||
          MODIFYING_ITEMS.has(replay.identItem.get(defender) ?? "") ||
          defenderTera === "Stellar" ||
          defenderSpecies.startsWith("Terapagos")
        ) {
          skippedModifiers += 1;
          continue;
        }
        const atkType = effectiveType(dex, ev);
        if (!atkType) continue;
        const types = defenderTera
          ? [defenderTera]
          : (dex.species.get(defenderSpecies).types ?? []);
        const immune = !dex.getImmunity(atkType, types);
        const eff = dex.getEffectiveness(atkType, types);
        const ours = immune
          ? "immune"
          : eff > 0
            ? "supereffective"
            : eff < 0
              ? "resisted"
              : "neutral";
        if (ours !== ev.effect) {
          mismatches.push(
            `${ev.moveName}(${atkType}) → ${defenderSpecies}[${types.join("/")}]${defenderTera ? "太晶" : ""}：官方=${ev.effect} 本地=${ours}`,
          );
        }
        checked += 1;
      }
      expect(checked, "可核验的克制样本数为 0（解析异常？）").toBeGreaterThan(0);
      expect(mismatches, `属性表不一致：\n${mismatches.join("\n")}`).toEqual([]);

      // ④ 道具/特性存在（「As One」为日志显示名，图鉴按变体收录）
      for (const it of replay.items) {
        expect(dex.items.get(it).exists, `道具不存在：${it}`).toBe(true);
      }
      for (const ab of replay.abilities) {
        const ok =
          dex.abilities.get(ab).exists ||
          (ab === "As One" &&
            (dex.abilities.get("As One (Glastrier)").exists ||
              dex.abilities.get("As One (Spectrier)").exists));
        expect(ok, `特性不存在：${ab}`).toBe(true);
      }
    }, 60000);
  }
});
