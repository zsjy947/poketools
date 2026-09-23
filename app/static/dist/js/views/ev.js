/* 努力值查询（游戏上下文内：仅当前版本图鉴宝可梦） */
const EvView = {
  template: `
  <div>
    <div class="page-head">
      <span class="page-title">{{ game ? game.name_zh : "" }} · 努力值查询</span>
      <span style="color:#888;font-size:13px">击倒该宝可梦可获得的努力值点数（仅当前游戏图鉴）</span>
    </div>
    <div class="page-head">
      <el-select v-model="stat" style="width:110px">
        <el-option v-for="(v, k) in EV_NAMES" :key="k" :value="k" :label="v" />
      </el-select>
      <el-select v-model="value" style="width:130px">
        <el-option :value="0" label="任意点数" />
        <el-option v-for="v in [1, 2, 3]" :key="v" :value="v" :label="'+' + v + ' 点'" />
      </el-select>
      <el-input v-model="q" clearable placeholder="搜索名称" style="width:160px" />
      <div class="spacer"></div>
      <span style="font-size:13px;color:#888">{{ list.length }} 只</span>
    </div>

    <el-table :data="list" size="small" height="calc(100vh - 220px)" v-loading="loading"
      @row-click="openDetail" style="cursor:pointer">
      <el-table-column width="80">
        <template #default="{ row }"><poke-img :form-id="row.form_id" :size="56"></poke-img></template>
      </el-table-column>
      <el-table-column label="宝可梦" min-width="150">
        <template #default="{ row }">
          <div style="font-weight:600">{{ row.name_zh }}</div>
          <div style="font-size:11px;color:#98a1b3">{{ row.name_en }}</div>
        </template>
      </el-table-column>
      <el-table-column label="属性" width="130">
        <template #default="{ row }"><type-badge :types="row.types"></type-badge></template>
      </el-table-column>
      <el-table-column label="努力值" width="260">
        <template #default="{ row }"><ev-badges :ev="row.ev"></ev-badges></template>
      </el-table-column>
    </el-table>
  </div>
  `,
  setup() {
    const { ref, computed, watch, inject } = Vue;
    const store = inject("store");
    const stat = ref("hp");
    const value = ref(0);
    const q = ref("");
    const list = ref([]);
    const loading = ref(false);

    const game = computed(() => store.games.find((g) => g.id === store.gameId));

    async function load() {
      loading.value = true;
      try {
        list.value = await apiGet("/api/ev", {
          stat: stat.value, value: value.value, game: store.gameId, q: q.value,
        });
      } finally { loading.value = false; }
    }
    function openDetail(row) {
      location.hash = "#/pokemon/" + row.species_id + "?game=" + store.gameId;
    }
    watch([stat, value], load);
    let qt;
    watch(q, () => { clearTimeout(qt); qt = setTimeout(load, 300); });
    load();
    return { store, stat, value, q, list, loading, game, EV_NAMES, openDetail };
  },
};
