/**
 * 统一首页：三入口宫格（游戏中心 / 伤害计算器 / 模拟对战）。
 * monoline 图标规范：viewBox 24 / stroke 2 / round / fill none / currentColor。
 */
import { navigate } from "../app/router";

function IconGames(): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
      strokeLinecap="round" strokeLinejoin="round" className="pkt-home-ic">
      <path d="M6 9h4M8 7v4" />
      <circle cx="15.5" cy="8.5" r="1" />
      <circle cx="18" cy="11" r="1" />
      <path d="M17.3 5H6.7a4.7 4.7 0 0 0-4.6 5.6l.9 4.9A3.6 3.6 0 0 0 8 17.3l1-1.3h6l1 1.3a3.6 3.6 0 0 0 5-1.8l.9-4.9A4.7 4.7 0 0 0 17.3 5Z" />
    </svg>
  );
}

function IconCalc(): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
      strokeLinecap="round" strokeLinejoin="round" className="pkt-home-ic">
      <rect x="4" y="2.5" width="16" height="19" rx="2.5" />
      <path d="M8 7h8" />
      <path d="M8.5 12h.01M12 12h.01M15.5 12h.01M8.5 16h.01M12 16h.01M15.5 16h.01" />
    </svg>
  );
}

function IconBattle(): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
      strokeLinecap="round" strokeLinejoin="round" className="pkt-home-ic">
      <path d="M3.5 3.5 14 14" />
      <path d="m18.5 6.5-8 8-2.5-2.5 8-8 2.5 2.5Z" />
      <path d="M6 18l-2.5 2.5" />
      <path d="m4.5 15.5 4 4" />
      <path d="m20.5 20.5-5.8-5.8" />
      <path d="M14.8 12.2 12 15l-3-3 2.8-2.8" />
    </svg>
  );
}

export function UnifiedHomePage(): JSX.Element {
  const cards = [
    {
      key: "games",
      title: "游戏中心",
      desc: "五作图鉴 · 努力值 · 特化功能",
      icon: <IconGames />,
      go: "#/games",
    },
    {
      key: "calc",
      title: "伤害计算器",
      desc: "现代公式 · 双向对算 · 场地状态",
      icon: <IconCalc />,
      go: "#/calc",
    },
    {
      key: "battle",
      title: "模拟对战",
      desc: "单人操控双方 · 引擎级规则 · 离线可用",
      icon: <IconBattle />,
      go: "#/battle",
    },
  ];
  return (
    <div className="page pkt-home">
      <h1>宝可梦工具助手</h1>
      <p className="muted">剑盾 · 晶灿钻石/明亮珍珠 · 传说 阿尔宙斯 · 朱紫 · 传说 Z-A</p>
      <div className="pkt-home-grid">
        {cards.map((c) => (
          <button key={c.key} className="pkt-home-card" onClick={() => navigate(c.go)}>
            <span className="pkt-home-ic-wrap">{c.icon}</span>
            <span className="pkt-home-title">{c.title}</span>
            <span className="pkt-home-desc muted">{c.desc}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
