/* 努力值查询（游戏上下文内：仅当前版本图鉴宝可梦 + 野外地点列） */
const EvView = {
  template: `
  <div class="ev-page">
    <div class="page-head">
      <span class="page-title">{{ game ? game.name_zh : "" }} · 努力值查询</span>
      <span class="muted-13">击倒该宝可梦可获得的努力值点数（仅当前游戏图鉴，含野外自然出现地点）</span>
    </div>
    <div class="page-head">
      <el-button class="filter-toggle" size="small" @click="showFilters = !showFilters">
        筛选{{ stat ? '' : '' }}<mono-icon name="ev" :size="14" style="margin-left:4px"></mono-icon>
      </el-button>
      <div class="spacer"></div>
      <span class="muted-13">{{ list.length }} 只</span>
    </div>
    <div class="filter-mask" v-if="showFilters" @click="showFilters = false"></div>
    <div class="filter-bar page-head" :class="{open: showFilters}">
      <div class="page-head" style="margin:0">
      <el-select v-model="stat" class="w110">
        <el-option v-for="(v, k) in EV_NAMES" :key="k" :value="k" :label="v" />
      </el-select>
      <el-select v-model="value" class="w130">
        <el-option :value="0" label="任意点数" />
        <el-option v-for="v in [1, 2, 3]" :key="v" :value="v" :label="'+' + v + ' 点'" />
      </el-select>
      <el-input v-model="q" clearable placeholder="搜索名称" class="w160" />
      <el-button size="small" @click="showFilters = false">收起</el-button>
      </div>
    </div>

    <el-table :data="list" size="small" class="ev-table" v-loading="loading"
      @row-click="openDetail" style="cursor:pointer">
      <el-table-column width="80">
        <template #default="{ row }"><poke-img :form-id="row.form_id" :size="56"></poke-img></template>
      </el-table-column>
      <el-table-column label="宝可梦" width="150">
        <template #default="{ row }">
          <div style="font-weight:600">{{ row.name_zh }}</div>
          <div style="font-size:11px;color:#98a1b3">{{ row.name_en }}</div>
        </template>
      </el-table-column>
      <el-table-column label="属性" width="140">
        <template #default="{ row }"><type-badge :types="row.types"></type-badge></template>
      </el-table-column>
      <el-table-column label="努力值" width="230">
        <template #default="{ row }"><ev-badges :ev="row.ev"></ev-badges></template>
      </el-table-column>
      <el-table-column label="野外地点" min-width="260">
        <template #default="{ row }">
          <template v-if="row.locations && row.locations.length">
            <span v-for="(l, i) in shownLocations(row)" :key="i" class="ev-loc">
              <span v-if="versionChip(l.version_label)" class="ev-ver-chip"
                :class="chipClass(l.version_label)">{{ versionChip(l.version_label) }}</span>{{ l.location }}
            </span>
            <el-tooltip v-if="row.locations.length > 3" :content="allLocationsText(row)"
              placement="top" :show-after="300">
              <span class="ev-loc more">+{{ row.locations.length - 3 }}</span>
            </el-tooltip>
          </template>
          <span v-else class="empty-hint">本作无自然出现</span>
        </template>
      </el-table-column>
    </el-table>

    <!-- 移动端卡片流（竖屏；桌面隐藏）：地点折叠为「+N」展开 -->
    <div class="ev-cards">
      <div v-for="row in list" :key="row.species_id" class="ev-card" @click="openDetail(row)">
        <poke-img :form-id="row.form_id" :size="52"></poke-img>
        <div class="evc-info">
          <div class="evc-name">{{ row.name_zh }} <span class="evc-en">{{ row.name_en }}</span></div>
          <type-badge :types="row.types"></type-badge>
          <ev-badges :ev="row.ev"></ev-badges>
          <div class="evc-locs" v-if="row.locations && row.locations.length">
            <template v-for="(l, i) in expanded[row.species_id] ? row.locations : row.locations.slice(0, 2)"
              :key="i">
              <span v-if="versionChip(l.version_label)" class="ev-ver-chip"
                :class="chipClass(l.version_label)">{{ versionChip(l.version_label) }}</span>{{ l.location }}　
            </template>
            <span v-if="row.locations.length > 2" class="evc-more"
              @click.stop="expanded[row.species_id] = !expanded[row.species_id]">
              {{ expanded[row.species_id] ? '收起' : '+' + (row.locations.length - 2) + ' 地点' }}
            </span>
          </div>
          <div class="evc-locs" v-else style="color:#a8b0c0">本作无自然出现</div>
        </div>
      </div>
    </div>
  </div>
  `,
  setup() {
    const { ref, reactive, computed, watch, inject } = Vue;
    const store = inject("store");
    const stat = ref("hp");
    const value = ref(0);
    const q = ref("");
    const showFilters = ref(false);
    const expanded = reactive({});
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
    function shownLocations(row) { return row.locations.slice(0, 3); }
    function allLocationsText(row) {
      return row.locations.map((l) => l.location).join("、");
    }
    /* 版本 chip：单版本独占标「剑/盾/朱/紫」，DLC 行标「扩展票/零之秘宝/异次元」 */
    function versionChip(label) {
      if (!label) return "";
      if (label.includes("扩展票")) return "扩展票";
      if (label.includes("零之秘宝")) return "零之秘宝";
      if (label.includes("异次元")) return "异次元";
      if (label === "剑") return "剑";
      if (label === "盾") return "盾";
      if (label === "朱") return "朱";
      if (label === "紫") return "紫";
      return "";
    }
    function chipClass(label) {
      if (label.includes("扩展票") || label.includes("零之秘宝") || label.includes("异次元")) return "dlc";
      return "ver";
    }
    watch([stat, value], load);
    watch(() => store.gameId, load);
    let qt;
    watch(q, () => { clearTimeout(qt); qt = setTimeout(load, 300); });
    load();
    return { store, stat, value, q, list, loading, game, EV_NAMES, openDetail,
             shownLocations, allLocationsText, versionChip, chipClass,
             showFilters, expanded };
  },
};
