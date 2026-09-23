/* 游戏中心首页：按游戏入口 */
const HomeView = {
  template: `
  <div>
    <div class="home-hero">
      <div class="home-title">
        <h1>宝可梦工具助手</h1>
        <p>选择游戏进入对应工具 · 数据来自 52poke Wiki 与 PokéAPI · 完全离线</p>
      </div>
    </div>
    <div class="game-grid">
      <div v-for="g in games" :key="g.id" class="game-card" @click="enter(g)">
        <div class="game-icon">{{ GAME_ICONS[g.id] || "🎮" }}</div>
        <div class="game-name">{{ g.name_zh }}</div>
        <div class="game-sub">{{ g.generation === 9 ? "第九世代" : "第八世代" }} ·
          {{ g.dexes.length }} 个图鉴 / {{ g.dexes.reduce((a, d) => a + d.total, 0) }} 只</div>
        <div class="game-feats">
          <span v-for="f in g.features" :key="f" class="feat-chip">{{ (FEATURES[f] || {}).label || f }}</span>
        </div>
      </div>
    </div>

    <div class="home-calc" @click="location.hash = '#/calc'">
      <div class="game-icon">🧮</div>
      <div>
        <div class="game-name">伤害计算器</div>
        <div class="game-sub">跨世代 · 全形态对比 · 太晶化 / Z招式 / 极巨化</div>
      </div>
      <span style="margin-left:auto;color:#98a1b3">全局工具 →</span>
    </div>
  </div>
  `,
  setup() {
    const { computed } = Vue;
    const games = computed(() => store.games);
    function enter(g) {
      store.gameId = g.id;
      location.hash = "#/game/" + g.id + "/dex";
    }
    return { games, enter, FEATURES, GAME_ICONS, location };
  },
};
