import { useEffect, useState } from "react";
import { useApp } from "../store";

/** 设置（FR-12）：动画开关/速度、素材清晰度、数据版本与更新指引（RM-09）。 */
export function SettingsPage(): JSX.Element {
  const settings = useApp((s) => s.settings);
  const update = useApp((s) => s.updateSettings);
  const [dataVersion, setDataVersion] = useState<string>("");

  useEffect(() => {
    // 数据版本 = 静态分片 manifest 的行数指纹（构建期注入，离线可读）
    fetch("/data/manifest.json")
      .then((r) => r.json())
      .then((m) => setDataVersion(String(m.data_version ?? "")))
      .catch(() => setDataVersion(""));
  }, []);

  return (
    <div className="page page-settings">
      <h1>设置</h1>
      <div className="settings-block">
        <label className="set-row">
          <input
            type="checkbox"
            checked={settings.animation}
            onChange={(e) => update({ animation: e.target.checked })}
          />
          <span>动画演出（关闭后对局以信息流呈现，不中断对局）</span>
        </label>
        <label className="set-row">
          <span>演出节奏：{settings.animationSpeed}ms/事件</span>
          <input
            type="range"
            min={120}
            max={1200}
            step={60}
            value={settings.animationSpeed}
            onChange={(e) => update({ animationSpeed: Number(e.target.value) })}
          />
        </label>
        <label className="set-row">
          <input
            type="checkbox"
            checked={settings.spriteDexSize}
            onChange={(e) => update({ spriteDexSize: e.target.checked })}
          />
          <span>使用图鉴大图（默认现代静态图）</span>
        </label>
        <label className="set-row">
          <input
            type="checkbox"
            checked={settings.timers}
            onChange={(e) => update({ timers: e.target.checked })}
          />
          <span>计时训练（每指令 45s / 每局 7min / 总 20min，指令超时自动待机）</span>
        </label>
      </div>
      <div className="settings-block muted">
        <p>数据版本：{dataVersion || "未知"}（图鉴/招式/特性等静态分片的行数指纹）。</p>
        <p>
          数据更新：按 AGENTS.md「数据管线」段联网重跑 （build_db → build_z_moves → build_db →
          scrape_52poke → export_static_data）后重新打包； 应用本体完全离线，不做自动检测。
        </p>
        <p>数据来源：smogon/pokemon-showdown（MIT；供应商化引擎包，含 champions 赛制 mod）。</p>
        <p>精灵图来源：Showdown 官方打包素材（仅个人本地使用，不分发；详见 NOTICE）。</p>
        <p>界面语言：简体中文（首版仅中文）。</p>
      </div>
    </div>
  );
}
