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
  seed?: string;
  turns: number;
  log: string[];
}

export interface StoredSettings {
  animation: boolean;
  animationSpeed: number; // ms/事件
  spriteDexSize: boolean; // true=图鉴大图
}

const KEY = {
  teams: "psb.teams.v1",
  settings: "psb.settings.v1",
  records: "psb.records.v1",
} as const;

const DEFAULT_SETTINGS: StoredSettings = {
  animation: true,
  animationSpeed: 420,
  spriteDexSize: false,
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

export const storage = {
  loadTeams: <T>(): T | null => readJson<T>(KEY.teams),
  saveTeams: (v: unknown) => writeJson(KEY.teams, v),
  loadSettings: (): StoredSettings => ({
    ...DEFAULT_SETTINGS,
    ...readJson<Partial<StoredSettings>>(KEY.settings),
  }),
  saveSettings: (v: StoredSettings) => writeJson(KEY.settings, v),
  loadRecords: (): StoredBattleRecord[] => readJson<StoredBattleRecord[]>(KEY.records) ?? [],
  saveRecords: (v: StoredBattleRecord[]) => writeRecords(v),
  deleteRecord: (id: string): StoredBattleRecord[] => {
    const next = (readJson<StoredBattleRecord[]>(KEY.records) ?? []).filter((r) => r.id !== id);
    return writeRecords(next);
  },
};
