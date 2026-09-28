// Tauri 2 壳：M3 队伍存档将挂 fs / plugin-store 权限（capabilities/default.json）
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
