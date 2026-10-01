/* 地区图鉴页（游戏上下文内）：卡片 + 精灵球捕捉交互。
   M1：卡片不再变色（捕捉状态只看右上角精灵球）；批量操作带确认；
   标记模式点卡片直接切换；同游戏图鉴自动双向同步。 */
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
      <span class="mark-mode">
        <span class="lbl">标记模式</span>
        <el-switch v-model="markMode" size="small"></el-switch>
      </span>
      <el-dropdown @command="onBatch">
        <el-button size="small" type="primary" plain>
          批量操作<el-icon style="margin-left:4px"><arrow-down /></el-icon>
        </el-button>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item command="mark-filter">标记当前筛选（{{ entries.length }} 只）</el-dropdown-item>
            <el-dropdown-item command="clear-filter">清除当前筛选标记（{{ entries.length }} 只）</el-dropdown-item>
            <el-dropdown-item divided command="mark-all">标记整本图鉴（{{ curDex ? curDex.total : 0 }} 只）</el-dropdown-item>
            <el-dropdown-item command="clear-all">清空整本图鉴</el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
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
      <span class="muted-13">显示 {{ entries.length }} 只</span>
    </div>

    <div class="dex-grid" v-loading="loading">
      <div v-for="e in entries" :key="e.species_id" class="dex-card"
        :class="{markable: markMode}" @click="onCardClick(e)">
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
    const markMode = ref(false);

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

    async function refreshCounts() {
      try {
        counts.value = await apiGet("/api/state/counts", { profile: store.profileId });
      } catch (_) { /* 计数失败不阻塞 */ }
    }
    async function loadDex() {
      if (!dexId.value) return;
      loading.value = true;
      try {
        const data = await apiGet("/api/dex/" + dexId.value, { profile: store.profileId });
        raw.value = data.entries;
        await refreshCounts();
      } finally { loading.value = false; }
    }
    function countOf(dex) {
      return counts.value[dex] || 0;
    }
    async function toggle(e) {
      const prev = e.caught;
      e.caught = !prev;                       // 乐观更新
      try {
        await apiSend("PUT", "/api/state", {
          profile_id: store.profileId, dex_id: dexId.value,
          species_id: e.species_id, caught: e.caught,
        });
        refreshCounts();
      } catch (err) {
        e.caught = prev;                      // 失败回滚
        if (!err._toasted) store.toast("标记失败：" + (err.message || err), "error");
      }
    }
    async function bulkSet(ids, caught, label) {
      try {
        await ElMessageBox.confirm(
          `${label}：将影响 ${ids.length} 只宝可梦（同游戏各图鉴将自动同步）`, "确认操作",
          { confirmButtonText: "确定", cancelButtonText: "取消", type: "warning" });
      } catch (_) { return; }
      try {
        await apiSend("POST", "/api/state/bulk", {
          profile_id: store.profileId, dex_id: dexId.value, caught, species_ids: ids,
        });
        await loadDex();
        store.toast(caught ? `已标记 ${ids.length} 只` : `已清除 ${ids.length} 只标记`, "success");
      } catch (err) {
        if (!err._toasted) store.toast("批量操作失败：" + (err.message || err), "error");
      }
    }
    async function onBatch(cmd) {
      if (cmd === "mark-filter") return bulkSet(entries.value.map((e) => e.species_id), true, "标记当前筛选");
      if (cmd === "clear-filter") return bulkSet(entries.value.map((e) => e.species_id), false, "清除当前筛选标记");
      if (cmd === "mark-all") {
        return bulkSet(raw.value.map((e) => e.species_id), true, "标记整本图鉴");
      }
      if (cmd === "clear-all") {
        const total = curDex.value ? curDex.value.total : 0;
        const n = (counts.value[dexId.value] || 0);
        if (!n) { store.toast("当前图鉴没有已标记的宝可梦"); return; }
        return bulkSet(raw.value.filter((e) => e.caught).map((e) => e.species_id),
                       false, `清空整本图鉴（已捕捉 ${n}/${total}）`);
      }
    }
    function onCardClick(e) {
      if (markMode.value) { toggle(e); return; }
      openDetail(e);
    }
    function openDetail(e) {
      location.hash = "#/pokemon/" + e.species_id + "?game=" + store.gameId + "&dex=" + dexId.value;
    }
    watch(dexId, () => {
      if (dexId.value) sessionStorage.setItem("poketools-dex-" + store.gameId, dexId.value);
      loadDex();
    });
    watch(() => store.profileId, loadDex);
    watch(() => store.games, () => initDex(), { immediate: true });

    /* 初始化当前图鉴 tab：hash 参数 > sessionStorage > 第一个 */
    function initDex() {
      if (dexId.value || !game.value || !game.value.dexes.length) return;
      const fromHash = new URLSearchParams((location.hash.split("?")[1] || "")).get("dex");
      const saved = sessionStorage.getItem("poketools-dex-" + store.gameId);
      const valid = (id) => game.value.dexes.some((x) => x.id === id);
      dexId.value = valid(fromHash) ? fromHash : (valid(saved) ? saved : game.value.dexes[0].id);
    }
    initDex();
    refreshCounts();

    return {
      store, dexId, filter, typeFilter, q, loading, entries, markMode,
      game, progressText, progressPct, counts, TYPE_LIST, countOf,
      toggle, onBatch, onCardClick,
    };
  },
};
