/**
 * 本地持久化（FR-11）：WebView localStorage（Windows 与 Android WebView 行为一致，
 * 数据随应用数据目录持久化）。量小（队伍/设置/对局记录 JSON），单键存储 + 全容错。
 * 注：00 §4.2 原表述为 Tauri fs/plugin-store，落地取 localStorage —— 免插件依赖、
 * 双端语义一致；如未来需要导出为文件再增 fs 通道（T2 录像导出时一并考虑）。
 */

export interface StoredBattleRecord {
  id: string;
  formatid: string;
  playedAt: number;
  winner: string;
  p1Name: string;
  p2Name: string;
  p1Team: string;
  p2Team: string; // Showdown 文本
  seed?: string | undefined; // JSON "[n,n,n,n]"（确定性回放；旧记录无此字段）
  turns: number;
  log: string[];
  /** 指令序列（回放复现）：按提交序记录的双方指令（含预览 team 指令）；旧记录无此字段 */
  choices?: Array<{ side: "p1" | "p2"; input: string; turn: number }> | undefined;
}

export interface StoredSettings {
  animation: boolean;
  animationSpeed: number; // ms/事件
  spriteDexSize: boolean; // true=图鉴大图
  timers: boolean; // RM-05：VGC 计时训练（每指令 45s / 每局 7min / 总 20min）
}

const KEY = {
  teams: "psb.teams.v1",
  settings: "psb.settings.v1",
  records: "psb.records.v1",
  teamLibrary: "psb.teamLibrary.v1",
} as const;

const DEFAULT_SETTINGS: StoredSettings = {
  animation: true,
  animationSpeed: 420,
  spriteDexSize: false,
  timers: false,
};

function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // 存储满等场景静默失败（个人工具，数据可重建；不吞业务错误）
  }
}

/** 队伍库条目（RM-08）：sets 为 PokemonSet[]（本层不引引擎类型，由调用方约束） */
export interface StoredTeamEntry {
  id: string;
  name: string;
  savedAt: number;
  sets: unknown[];
}

/** 记录写入：配额不足时逐条丢弃最旧记录重试（日志体积大，100 条可能超 5MB 配额） */
function writeRecords(records: StoredBattleRecord[]): StoredBattleRecord[] {
  let list = records;
  for (;;) {
    try {
      localStorage.setItem(KEY.records, JSON.stringify(list));
      return list;
    } catch {
      if (list.length <= 1) return list; // 连单条都放不下：放弃并保留内存态
      list = list.slice(0, list.length - 1);
    }
  }
}

/**
 * 回放格式换代分界（RM-23）：2026-10-30（v1.0.2）起对局记录改存实局上阵子集
 * （session.battleTeams）；此前录制的记录 p1Team 为注册整队文本，重演必错位且无法回修——
 * 读取时直接剪枝丢弃（按用户决策，不做兼容提示）。
 */
export const BATTLE_SUBSET_EPOCH = new Date("2026-10-30T00:00:00").getTime();

export function pruneLegacyRecords(records: StoredBattleRecord[]): StoredBattleRecord[] {
  return records.filter((r) => !(r.playedAt < BATTLE_SUBSET_EPOCH));
}

export const storage = {
  loadTeams: <T>(): T | null => readJson<T>(KEY.teams),
  saveTeams: (v: unknown) => writeJson(KEY.teams, v),
  loadSettings: (): StoredSettings => ({
    ...DEFAULT_SETTINGS,
    ...readJson<Partial<StoredSettings>>(KEY.settings),
  }),
  saveSettings: (v: StoredSettings) => writeJson(KEY.settings, v),
  loadRecords: (): StoredBattleRecord[] => {
    const raw = readJson<StoredBattleRecord[]>(KEY.records) ?? [];
    const pruned = pruneLegacyRecords(raw);
    if (pruned.length !== raw.length) {
      writeRecords(pruned); // 剪掉旧格式后回写，避免下次重复过滤
    }
    return pruned;
  },
  saveRecords: (v: StoredBattleRecord[]) => writeRecords(pruneLegacyRecords(v)),
  deleteRecord: (id: string): StoredBattleRecord[] => {
    const next = pruneLegacyRecords(readJson<StoredBattleRecord[]>(KEY.records) ?? []).filter(
      (r) => r.id !== id,
    );
    return writeRecords(next);
  },
  // ---- 队伍库（RM-08）：多队伍命名存档 ----
  loadLibrary: (): StoredTeamEntry[] => readJson<StoredTeamEntry[]>(KEY.teamLibrary) ?? [],
  saveLibrary: (v: StoredTeamEntry[]) => writeJson(KEY.teamLibrary, v),
  addToLibrary: (name: string, sets: unknown[]): StoredTeamEntry[] => {
    const list = readJson<StoredTeamEntry[]>(KEY.teamLibrary) ?? [];
    const entry: StoredTeamEntry = {
      id: `lib-${Date.now()}`,
      name: name.trim() || `队伍 ${list.length + 1}`,
      savedAt: Date.now(),
      sets,
    };
    const next = [entry, ...list].slice(0, 30); // 上限 30 套防配额膨胀
    writeJson(KEY.teamLibrary, next);
    return next;
  },
  removeFromLibrary: (id: string): StoredTeamEntry[] => {
    const next = (readJson<StoredTeamEntry[]>(KEY.teamLibrary) ?? []).filter((e) => e.id !== id);
    writeJson(KEY.teamLibrary, next);
    return next;
  },
};
