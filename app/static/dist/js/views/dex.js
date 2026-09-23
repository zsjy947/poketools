/* 地区图鉴页（游戏上下文内）：卡片 + 精灵球捕捉交互 */
const DexView = {
  template: `
  <div>
    <div class="page-head">
      <span class="page-title">{{ game ? game.name_zh : "" }} · 图鉴追踪</span>
      <div class="dex-progress" v-if="game">
        <svg width="52" height="52" viewBox="0 0 52 52">
          <circle cx="26" cy="26" r="22" fill="none" stroke="#e4e8f0" stroke-width="6"/>
          <circle cx="26" cy="26" r="22" fill="none" stroke="#67c23a" stroke-width="6"
            :stroke-dasharray="(138.2 * progressPct / 100).toFixed(1) + ' 138.2'"
            stroke-linecap="round" transform="rotate(-90 26 26)"/>
          <text x="26" y="30" text-anchor="middle" font-size="12" fill="#555">{{ progressPct }}%</text>
        </svg>
        <div class="dex-progress-txt">
          <b>{{ progressText }}</b><br>
          <span style="color:#98a1b3;font-size:12px">已捕捉 / 总数</span>
        </div>
      </div>
      <div class="spacer"></div>
      <el-button size="small" @click="markAll(true)">本筛选全标记</el-button>
      <el-button size="small" @click="invert()">反选未捕捉</el-button>
    </div>

    <div class="dex-tabs" v-if="game">
      <div v-for="d in game.dexes" :key="d.id" class="dex-tab"
        :class="{active: d.id === dexId}" @click="dexId = d.id">
        {{ d.name_zh }}<span class="cnt">{{ countOf(d.id) }}/{{ d.total }}</span>
      </div>
    </div>

    <div class="page-head">
      <el-radio-group v-model="filter" size="small">
        <el-radio-button value="all">全部</el-radio-button>
        <el-radio-button value="caught">已捕捉</el-radio-button>
        <el-radio-button value="uncaught">未捕捉</el-radio-button>
      </el-radio-group>
      <el-select v-model="typeFilter" size="small" clearable placeholder="属性" style="width: 110px">
        <el-option v-for="t in TYPE_LIST" :key="t" :value="t" :label="t" />
      </el-select>
      <el-input v-model="q" size="small" clearable placeholder="搜索名称/编号" style="width: 180px" />
      <div class="spacer"></div>
      <span style="font-size:13px;color:#888">显示 {{ entries.length }} 只</span>
    </div>

    <div class="dex-grid" v-loading="loading">
      <div v-for="e in entries" :key="e.species_id" class="dex-card"
        :class="{caught: e.caught}" @click="openDetail(e)">
        <div class="card-top">
          <span class="ndex">#{{ String(e.ndex).padStart(4, "0") }}</span>
          <poke-toggle :caught="e.caught" @toggle="toggle(e)"></poke-toggle>
        </div>
        <poke-img :form-id="e.form_id" :size="88"></poke-img>
        <div class="pname">{{ e.name_zh }}</div>
        <div class="en">{{ e.name_en }}</div>
        <type-badge :types="e.types"></type-badge>
      </div>
      <div v-if="!loading && !entries.length" class="empty-hint" style="grid-column:1/-1;padding:40px">
        没有符合条件的宝可梦
      </div>
    </div>
  </div>
  `,
  setup() {
    const { ref, computed, watch, inject } = Vue;
    const { ElMessageBox } = ElementPlus;
    const store = inject("store");
    const dexId = ref("");
    const filter = ref("all");
    const typeFilter = ref("");
    const q = ref("");
    const loading = ref(false);
    const raw = ref([]);
    const counts = ref({});

    const game = computed(() => store.games.find((g) => g.id === store.gameId));
    const entries = computed(() => {
      let list = raw.value;
      if (filter.value === "caught") list = list.filter((e) => e.caught);
      if (filter.value === "uncaught") list = list.filter((e) => !e.caught);
      if (typeFilter.value) list = list.filter((e) => e.types.split(",").includes(typeFilter.value));
      const kw = q.value.trim().toLowerCase();
      if (kw) list = list.filter((e) => e.name_zh.toLowerCase().includes(kw)
        || (e.name_en || "").toLowerCase().includes(kw)
        || String(e.ndex) === kw.replace(/^#/, ""));
      return list;
    });
    const curDex = computed(() =>
      game.value ? game.value.dexes.find((d) => d.id === dexId.value) || null : null);
    const progressText = computed(() => {
      const c = counts.value[dexId.value] || 0;
      return c + "/" + (curDex.value ? curDex.value.total : 0);
    });
    const progressPct = computed(() => {
      const t = curDex.value ? curDex.value.total : 0;
      return t ? Math.round(((counts.value[dexId.value] || 0) / t) * 100) : 0;
    });

    async function loadDex() {
      if (!dexId.value) return;
      loading.value = true;
      try {
        const data = await apiGet("/api/dex/" + dexId.value, { profile: store.profileId });
        raw.value = data.entries;
        recount();
      } finally { loading.value = false; }
    }
    function recount() {
      counts.value[dexId.value] = raw.value.filter((e) => e.caught).length;
    }
    function countOf(dex) {
      return counts.value[dex] || 0;
    }
    async function toggle(e) {
      e.caught = !e.caught;
      await apiSend("PUT", "/api/state", {
        profile_id: store.profileId, dex_id: dexId.value,
        species_id: e.species_id, caught: e.caught,
      });
      recount();
    }
    async function markAll(caught) {
      const ids = entries.value.map((e) => e.species_id);
      if (!ids.length) return;
      await apiSend("POST", "/api/state/bulk", {
        profile_id: store.profileId, dex_id: dexId.value, caught, species_ids: ids,
      });
      entries.value.forEach((e) => (e.caught = caught));
      recount();
      store.toast(caught ? "已标记" : "已清除", "success");
    }
    async function invert() {
      const list = entries.value;
      const ids = list.filter((e) => !e.caught).map((e) => e.species_id);
      if (!ids.length) { store.toast("当前筛选下没有未捕捉的宝可梦"); return; }
      await apiSend("POST", "/api/state/bulk", {
        profile_id: store.profileId, dex_id: dexId.value, caught: true, species_ids: ids,
      });
      list.forEach((e) => { if (!e.caught) e.caught = true; });
      recount();
      store.toast("已将未捕捉的 " + ids.length + " 只标记为捕捉", "success");
    }
    function openDetail(e) {
      location.hash = "#/pokemon/" + e.species_id + "?game=" + store.gameId + "&dex=" + dexId.value;
    }

    watch(dexId, loadDex);
    watch(() => store.profileId, loadDex);
    watch(() => store.games, () => {
      if (!dexId.value && game.value && game.value.dexes.length) {
        dexId.value = game.value.dexes[0].id;
      }
    }, { immediate: true });
    if (!dexId.value && game.value && game.value.dexes.length) {
      dexId.value = game.value.dexes[0].id;
    }

    return {
      store, dexId, filter, typeFilter, q, loading, entries,
      game, progressText, progressPct, counts, TYPE_LIST, countOf,
      toggle, markAll, invert, openDetail,
    };
  },
};
