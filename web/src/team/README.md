# team（队伍构建）

- `showdown.ts`：Showdown 队伍文本导入/导出/剪贴板与按赛制合法性校验（错误文案翻译简中）；解析/序列化复用引擎 `Teams`/`TeamValidator`（经 `engine-adapter`）。
- 队伍槽位与对局记录持久化在 `app/storage.ts`（localStorage，Web 与 Tauri 双端一致；原 battle 时代设想的 Tauri fs/plugin-store 已弃用，与主应用用户数据（`state/user.ts` 的 `pkt.*` 键）互不干扰）。
