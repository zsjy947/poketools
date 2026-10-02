import "./styles.css";
/* poketools 分区样式（自 Vue css/ 迁移 + React 控件替代层） */
import "../pkt/base.css";
import "../pkt/dex.css";
import "../pkt/features.css";
import "../pkt/calc.css";
import "../pkt/widgets.css";
import "../pkt/mobile.css";
import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import { ToastHost } from "../pkt/shared";
import { warmCalcMeta } from "../pages/CalcPage";

/* 计算器 meta 预热（U10 常驻缓存：应用启动即装载） */
warmCalcMeta();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
    <ToastHost />
  </React.StrictMode>,
);
