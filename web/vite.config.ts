import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Tauri 2 推荐配置：固定端口（devUrl 与 tauri.conf.json 对齐）、相对基址便于 WebView 打包
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
  },
  build: {
    // es2020：安卓老 WebView 兼容下限（AOSP 镜像 Chromium 83 不支持 ??= 等 ES2021 语法，
    // 2026-11-03 实机冒烟修正）；桌面 WebView2 常青内核向后兼容，无回退代价
    target: "es2020",
  },
  test: {
    coverage: {
      // 口径：自研可单测核心（引擎适配/数据/队伍/演出/精灵）；UI=浏览器实测、vendor=上游引擎、scripts=构建工具
      include: [
        "src/engine-adapter/{index,session,parse}.ts",
        "src/data/**/*.ts",
        "src/team/**/*.ts",
        "src/battle/**/*.ts",
      ],
    },
  },
});
