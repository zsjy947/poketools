/* 应用入口：样式装载顺序 = 对战分区 → 统一壳 → 组件库（pkt- 前缀类名避撞） */
import "./battle/battle.css";
import "./app/styles.css";
/* poketools 组件库样式（自 Vue css/ 迁移 + React 控件替代层） */
import "./components/base.css";
import "./components/dex.css";
import "./components/features.css";
import "./components/calc.css";
import "./components/widgets.css";
import "./components/mobile.css";
import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./app/App";
import { ToastHost } from "./components/shared";
import { warmCalcMeta } from "./pages/calc/model";

/* 计算器 meta 预热（U10 常驻缓存：应用启动即装载） */
warmCalcMeta();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
    <ToastHost />
  </React.StrictMode>,
);
