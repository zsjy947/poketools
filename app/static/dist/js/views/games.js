/* 游戏中心（批次三）：原首页的游戏宫格整体迁入，enter() 逻辑不变 */
const GamesView = {
  template: `
  <div>
    <div class="home-hero">
      <h1>游戏中心</h1>
    </div>
    <div class="game-grid">
      <div v-for="g in games" :key="g.id" class="game-card" @click="enter(g)">
        <game-icons :gid="g.id" :h="46" class="game-icon-imgs"></game-icons>
        <div class="game-name">{{ g.name_zh }}</div>
        <div class="game-sub">{{ g.generation === 9 ? "第九世代" : "第八世代" }} ·
          {{ g.dexes.length }} 个图鉴 / {{ g.dexes.reduce((a, d) => a + d.total, 0) }} 只</div>
      </div>
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
    return { games, enter };
  },
};
