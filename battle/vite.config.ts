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
    target: "es2022",
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
