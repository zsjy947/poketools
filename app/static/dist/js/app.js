/* 应用根组件 + 哈希路由（按游戏入口） */
const App = {
  template: `
  <div class="layout">
    <div class="sidebar">
      <div class="logo" @click="go('#/home')">Poké<span>Tools</span></div>
      <div class="menu">
        <div class="menu-item" :class="{active: route.page === 'home'}" @click="go('#/home')">
          <span>🏠</span><span>游戏中心</span>
        </div>
        <template v-if="game">
          <div class="menu-sep"></div>
          <div class="menu-game"><game-icons :gid="game.id" :h="20"></game-icons> {{ game.name_zh }}</div>
          <div v-for="f in gameFeatures" :key="f.key" class="menu-item sub"
            :class="{active: route.page === 'game' && route.feature === f.key}"
            @click="go('#/game/' + game.id + '/' + f.key)">
            <span>{{ f.icon }}</span><span>{{ f.label }}</span>
          </div>
        </template>
        <div class="menu-sep"></div>
        <div class="menu-item" :class="{active: route.page === 'calc'}" @click="go('#/calc')">
          <span>🧮</span><span>伤害计算器</span>
        </div>
      </div>
      <div class="sidebar-footer">
        <div style="margin-bottom:6px">档案</div>
        <el-select v-model="store.profileId" size="small" style="width:100%">
          <el-option v-for="p in store.profiles" :key="p.id" :value="p.id" :label="p.name" />
        </el-select>
        <el-button size="small" text style="color:#8a93a8; margin-top:6px; padding:0"
          @click="addProfile">＋ 新建档案</el-button>
      </div>
    </div>
    <div class="main">
      <home-view v-if="route.page === 'home'"></home-view>
      <template v-else-if="route.page === 'game'">
        <dex-view v-if="route.feature === 'dex'" :key="'dex-' + route.gameId"></dex-view>
        <ev-view v-else-if="route.feature === 'ev'" :key="'ev-' + route.gameId"></ev-view>
        <sandwich-view v-else-if="route.feature === 'sandwich'"></sandwich-view>
        <donut-view v-else-if="route.feature === 'donut'"></donut-view>
        <curry-view v-else-if="route.feature === 'curry'"></curry-view>
      </template>
      <detail-view v-else-if="route.page === 'pokemon'" v-bind:key="route.hash"></detail-view>
      <calc-view v-else-if="route.page === 'calc'"></calc-view>
    </div>
  </div>
  `,
  setup() {
    const { reactive, computed, onMounted, provide, watch } = Vue;
    const { ElMessageBox } = ElementPlus;
    const route = reactive({ page: "home", gameId: "", feature: "", hash: "" });

    const game = computed(() => store.games.find((g) => g.id === route.gameId) || null);
    const gameFeatures = computed(() =>
      (game.value ? game.value.features : [])
        .map((k) => FEATURES[k]).filter(Boolean));

    function parseHash() {
      const hsh = location.hash || "#/home";
      const parts = hsh.replace(/^#\//, "").split("?")[0].split("/");
      route.hash = hsh;
      if (parts[0] === "game" && parts.length >= 3) {
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
      } else {
        route.page = "home";
      }
    }
    function go(hash) { location.hash = hash; }
    async function addProfile() {
      const { value } = await ElMessageBox.prompt("输入新档案名称（如：剑盾真结局、闪光猎手）", "新建档案", {
        confirmButtonText: "创建", cancelButtonText: "取消",
        inputPattern: /.+/, inputErrorMessage: "名称不能为空",
      });
      const p = await apiSend("POST", "/api/profiles", { name: value.trim() });
      store.profiles.push(p);
      store.profileId = p.id;
      store.toast("已创建档案：" + p.name, "success");
    }

    provide("store", store);
    window.addEventListener("hashchange", parseHash);
    window.addEventListener("api-error", (e) => store.toast("请求失败：" + e.detail, "error"));
    onMounted(async () => {
      store.games = await apiGet("/api/games");
      store.profiles = await apiGet("/api/profiles");
      store.typeChart = await apiGet("/api/meta/typechart");
      parseHash();
    });

    return { store, route, game, gameFeatures, go, addProfile };
  },
};

const app = Vue.createApp(App);
app.use(ElementPlus, { locale: ElementPlusLocaleZhCn });
for (const [name, comp] of Object.entries(ElementPlusIconsVue)) {
  app.component(name, comp);
}
registerGlobalComponents(app);
app.component("home-view", HomeView);
app.component("dex-view", DexView);
app.component("detail-view", DetailView);
app.component("ev-view", EvView);
app.component("sandwich-view", SandwichView);
app.component("donut-view", DonutView);
app.component("curry-view", CurryView);
app.component("calc-view", CalcView);
app.component("empty", Empty);
app.mount("#app");
