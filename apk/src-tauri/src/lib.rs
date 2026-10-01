// 壳库：仅启动 WebView 装载内嵌前端（app/static/dist + 静态数据分片 + 精灵图）。
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
