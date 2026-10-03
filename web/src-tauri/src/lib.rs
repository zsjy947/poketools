// Tauri 2 壳：移动端（Android）入口留待 archived/android 分支合回；桌面端走 main.rs
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
