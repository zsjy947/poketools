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
});
