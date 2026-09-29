/* 首页·功能宫格（批次三）：游戏中心 / 伤害计算器 / 模拟对战（预留置灰） */
const HomeView = {
  template: `
  <div>
    <div class="home-hero">
      <h1>宝可梦工具助手</h1>
    </div>
    <div class="feature-grid">
      <div class="feature-card" @click="enter('#/games')">
        <mono-icon name="games" :size="48"></mono-icon>
        <div class="feature-name">游戏中心</div>
        <div class="feature-desc">五作图鉴 · 努力值 · 特化功能</div>
      </div>
      <div class="feature-card" @click="enter('#/calc')">
        <mono-icon name="calc" :size="48"></mono-icon>
        <div class="feature-name">伤害计算器</div>
        <div class="feature-desc">现代公式 · 双向对算 · 场地状态</div>
      </div>
      <div class="feature-card disabled" title="建设中">
        <mono-icon name="battle" :size="48"></mono-icon>
        <div class="feature-name">模拟对战</div>
        <div class="feature-desc">建设中</div>
      </div>
    </div>
  </div>
  `,
  setup() {
    function enter(hash) { location.hash = hash; }
    return { enter };
  },
};
