// PokéTools APK 壳（路线 B 终态）：无自定义命令，前端完全本地
// （数据分片与精灵图随 dist 内嵌；api.js 自动本地模式，无任何网络请求）。
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    poketools_app_lib::run()
}
