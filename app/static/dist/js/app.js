/* 应用根组件 + 哈希路由（批次三导航重构）：
   首页=功能宫格（游戏中心/伤害计算器/模拟对战预留）；游戏中心=五作宫格；
   进入游戏后出现 64px 图标窄栏（无文字）；详情与计算器全画面；左上角返回上一级。
   calc 视图首次进入后 v-show 常驻（CALC-FIX §2）。 */
const App = {
  template: `
  <div class="layout">
    <rail-nav v-if="route.page === 'game'" :game="game" :features="gameFeatures"
      :active-feature="route.feature"
      @go-feature="goFeature"></rail-nav>
    <div class="main">
      <back-btn v-if="backTarget" :label="backTarget.label"
        @click="go(backTarget.hash)"></back-btn>
      <home-view v-if="route.page === 'home'"></home-view>
      <games-view v-else-if="route.page === 'games'"></games-view>
      <template v-else-if="route.page === 'game'">
        <dex-view v-if="route.feature === 'dex'" :key="'dex-' + route.gameId"></dex-view>
        <ev-view v-else-if="route.feature === 'ev'" :key="'ev-' + route.gameId"></ev-view>
        <sandwich-view v-else-if="route.feature === 'sandwich'"></sandwich-view>
        <donut-view v-else-if="route.feature === 'donut'"></donut-view>
        <curry-view v-else-if="route.feature === 'curry'"></curry-view>
      </template>
      <detail-view v-else-if="route.page === 'pokemon'"></detail-view>
      <!-- 计算器视图首次进入后常驻（v-show 隐藏）：状态保留、零请求、图片不回源 -->
      <calc-view v-if="visited.calc" v-show="route.page === 'calc'"></calc-view>
    </div>
    <!-- 移动端竖屏底部 Tab（桌面 CSS 隐藏；游戏内由窄栏底部变体承担，详情页用返回键） -->
    <tab-bar v-if="['home', 'games', 'calc'].includes(route.page)" :active="route.page"></tab-bar>
  </div>
  `,
  setup() {
    const { reactive, computed, onMounted, provide } = Vue;
    const route = reactive({ page: "home", gameId: "", feature: "", hash: "" });
    const visited = reactive({ calc: false });

    const game = computed(() => store.games.find((g) => g.id === route.gameId) || null);
    const gameFeatures = computed(() =>
      (game.value ? game.value.features : [])
        .map((k) => FEATURES[k]).filter(Boolean));

    /* 返回层级（静态映射，不依赖 history；详情页返回由 detail.js 自带逻辑处理） */
    const backTarget = computed(() => {
      if (route.page === "games") return { hash: "#/home", label: "返回首页" };
      if (route.page === "game") return { hash: "#/games", label: "返回游戏中心" };
      if (route.page === "calc") return { hash: "#/home", label: "返回首页" };
      return null;
    });

    function parseHash() {
      const hsh = location.hash || "#/home";
      const parts = hsh.replace(/^#\//, "").split("?")[0].split("/");
      route.hash = hsh;
      if (parts[0] === "games") {
        route.page = "games";
      } else if (parts[0] === "game" && parts.length >= 3) {
        route.page = "game";
        route.gameId = parts[1];
        route.feature = parts[2] || "dex";
        store.gameId = route.gameId;
      } else if (parts[0] === "pokemon") {
        route.page = "pokemon";
        const q = new URLSearchParams(hsh.split("?")[1] || "");
        store.gameId = q.get("game") || store.gameId;
      } else if (parts[0] === "calc") {
        route.page = "calc";
        visited.calc = true;
      } else {
        route.page = "home";
      }
    }
    function go(hash) { location.hash = hash; }
    function goFeature(key) { go("#/game/" + route.gameId + "/" + key); }

    provide("store", store);
    window.addEventListener("hashchange", parseHash);
    window.addEventListener("api-error", (e) => store.toast("请求失败：" + e.detail, "error"));
    onMounted(async () => {
      store.games = await apiGet("/api/games");
      store.typeChart = await apiGet("/api/meta/typechart");
      parseHash();
    });

    return { store, route, visited, game, gameFeatures, backTarget, go, goFeature };
  },
};

const app = Vue.createApp(App);
app.use(ElementPlus, { locale: ElementPlusLocaleZhCn });
for (const [name, comp] of Object.entries(ElementPlusIconsVue)) {
  app.component(name, comp);
}
registerGlobalComponents(app);
app.component("home-view", HomeView);
app.component("games-view", GamesView);
app.component("dex-view", DexView);
app.component("detail-view", DetailView);
app.component("ev-view", EvView);
app.component("sandwich-view", SandwichView);
app.component("donut-view", DonutView);
app.component("curry-view", CurryView);
app.component("calc-view", CalcView);
app.component("empty", Empty);
app.mount("#app");
