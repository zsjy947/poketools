import { useApp } from "../store";

/** 设置（FR-12）：动画开关/速度、素材清晰度、数据版本说明。 */
export function SettingsPage(): JSX.Element {
  const settings = useApp((s) => s.settings);
  const update = useApp((s) => s.updateSettings);

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
      </div>
      <div className="settings-block muted">
        <p>数据来源：smogon/pokemon-showdown（MIT；供应商化引擎包，含 champions 赛制 mod）。</p>
        <p>精灵图来源：Showdown 官方打包素材（仅个人本地使用，不分发；详见 NOTICE）。</p>
        <p>界面语言：简体中文（首版仅中文）。</p>
      </div>
    </div>
  );
}
