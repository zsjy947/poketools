/**
 * 全局状态（zustand）：页面流、双队伍槽、对局会话桥、记录与设置。
 * 页面流（00 §4.6）：主页(赛制选择) → 队伍编辑(A/B 页签) → 预览上阵 → 对战 → 记录/设置。
 */
import { create } from "zustand";
import type { BattleSession, SessionSnapshot, SideSlot } from "../engine-adapter";
import type { PokemonSet } from "../engine-adapter";
import type { FormatMeta } from "../data/formats";
import { emptyTeam, exportShowdown, importShowdown } from "../team/showdown";
import { storage } from "./storage";
import type { StoredBattleRecord, StoredSettings } from "./storage";

export type Page = "home" | "team" | "preview" | "battle" | "records" | "settings";

export interface TeamState {
  A: { name: string; sets: PokemonSet[] };
  B: { name: string; sets: PokemonSet[] };
}

interface AppState {
  page: Page;
  format: FormatMeta | null;
  teams: TeamState;
  session: BattleSession | null;
  snapshot: SessionSnapshot | null;
  /** 当前操作阵营（单人操控双方；另一侧呈锁定态，FR-07） */
  activeSide: SideSlot;
  records: StoredBattleRecord[];
  settings: StoredSettings;
  /** 上阵预览选择（有序：单打第 1 只 = 首发、双打前 2 只 = 首发位；顺位末位存活者 = 幻觉伪装目标） */
  picks: { p1: number[]; p2: number[] };

  go: (page: Page) => void;
  setFormat: (f: FormatMeta) => void;
  setTeam: (key: "A" | "B", sets: PokemonSet[], name?: string) => void;
  importTeam: (key: "A" | "B", text: string) => boolean;
  teamText: (key: "A" | "B") => string;
  setActiveSide: (s: SideSlot) => void;
  attachSession: (s: BattleSession) => void;
  pushSnapshot: (snap: SessionSnapshot) => void;
  finishBattle: (record: StoredBattleRecord) => void;
  detachSession: () => void;
  loadRecords: () => void;
  removeRecord: (id: string) => void;
  updateSettings: (patch: Partial<StoredSettings>) => void;
  togglePick: (side: "p1" | "p2", index: number, max: number) => void;
  /** 上阵顺位调整（index 为队伍槽位号；dir=-1 上移 / +1 下移） */
  movePick: (side: "p1" | "p2", index: number, dir: -1 | 1) => void;
}

export const useApp = create<AppState>((set, get) => ({
  page: "home",
  format: null,
  teams: { A: { name: emptyTeam("A").name, sets: [] }, B: { name: emptyTeam("B").name, sets: [] } },
  session: null,
  snapshot: null,
  activeSide: "p1",
  records: [],
  settings: storage.loadSettings(),
  picks: { p1: [], p2: [] },

  go: (page) => set({ page }),
  setFormat: (f) => set({ format: f, picks: { p1: [], p2: [] } }),
  setTeam: (key, sets, name) => {
    // 旧版本样例数据曾以大写种名作 species（"Garchomp"）——写入前统一归一为小写 id 并清理同名昵称
    const norm = sets.map((s) => {
      const species = /^[a-z0-9-]+$/.test(s.species) ? s.species : s.species.toLowerCase();
      const nick = s.name && s.name.toLowerCase() === s.species.toLowerCase() ? "" : (s.name ?? "");
      return { ...s, species, name: nick };
    });
    const teams = { ...get().teams, [key]: { name: name ?? get().teams[key].name, sets: norm } };
    set({ teams });
    storage.saveTeams(teams);
  },
  importTeam: (key, text) => {
    const sets = importShowdown(text);
    if (!sets) return false;
    get().setTeam(key, sets);
    return true;
  },
  teamText: (key) => exportShowdown(get().teams[key].sets),
  setActiveSide: (activeSide) => set({ activeSide }),
  attachSession: (session) => set({ session, snapshot: null, page: "battle" }),
  pushSnapshot: (snapshot) => set({ snapshot }),
  finishBattle: (record) => {
    const records = [record, ...get().records].slice(0, 100);
    storage.saveRecords(records);
    set({ records });
  },
  detachSession: () => {
    get().session?.destroy();
    set({ session: null, snapshot: null });
  },
  loadRecords: () => set({ records: storage.loadRecords() }),
  removeRecord: (id) => set({ records: storage.deleteRecord(id) }),
  updateSettings: (patch) => {
    const settings = { ...get().settings, ...patch };
    storage.saveSettings(settings);
    set({ settings });
  },
  togglePick: (side, index, max) => {
    const picks = { ...get().picks };
    const cur = picks[side];
    // 有序：点击顺序即上阵顺位（不再按槽位号排序）
    const next = cur.includes(index)
      ? cur.filter((i) => i !== index)
      : cur.length >= max
        ? cur
        : [...cur, index];
    picks[side] = next;
    set({ picks });
  },
  movePick: (side, index, dir) => {
    const picks = { ...get().picks };
    const cur = [...picks[side]];
    const pos = cur.indexOf(index);
    const target = pos + dir;
    if (pos < 0 || target < 0 || target >= cur.length) return;
    [cur[pos], cur[target]] = [cur[target]!, cur[pos]!];
    picks[side] = cur;
    set({ picks });
  },
}));

/** 启动时恢复持久化队伍。旧版本样例数据曾把 species 存成大写种名（如 "Garchomp"），
 *  导致选择框值对不上、列表显示英文名——装载时统一归一为小写 id 并清掉同 species 名的昵称 */
export function hydrateTeams(): void {
  const stored = storage.loadTeams<TeamState>();
  if (!stored?.A || !stored?.B) return;
  const fixSets = (slot: TeamState["A"]): TeamState["A"] => ({
    ...slot,
    sets: (slot.sets ?? []).map((s) => {
      const species = /^[a-z0-9-]+$/.test(s.species) ? s.species : s.species.toLowerCase();
      const name = s.name && s.name.toLowerCase() === s.species.toLowerCase() ? "" : (s.name ?? "");
      return { ...s, species, name };
    }),
  });
  useApp.setState({ teams: { A: fixSets(stored.A), B: fixSets(stored.B) } });
}
