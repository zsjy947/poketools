/* 剑盾咖喱图鉴 */
const CurryView = {
  template: `
  <div v-loading="loading">
    <div class="page-head">
      <span class="page-title">咖喱图鉴</span>
      <el-tag size="small" type="warning" effect="plain">剑／盾</el-tag>
      <span style="color:#888;font-size:13px">露营咖喱 · 收集全部 151 种解锁奖励</span>
    </div>

    <el-alert type="info" :closable="false" style="margin-bottom:12px" show-icon
      title="咖喱等级与奖励"
      description="与宝可梦一起露营制作咖喱。咖喱等级由食材与宝可梦的好感度决定（★★~★★★★★）；大份咖喱能让宝可梦回复更多。收集咖喱图鉴达到一定数量可在集汇空地的咖喱店主处获得奖励。" />

    <div class="page-head">
      <el-input v-model="q" clearable placeholder="搜索咖喱名/关键食材" style="width:200px" />
      <el-select v-model="ingredient" clearable filterable placeholder="关键食材" style="width:160px">
        <el-option v-for="i in ingredients" :key="i" :value="i" :label="i" />
      </el-select>
      <div class="spacer"></div>
      <span style="font-size:13px;color:#888">{{ filtered.length }} / {{ list.length }} 种</span>
    </div>

    <div class="curry-grid">
      <div v-for="c in filtered" :key="c.no" class="curry-card">
        <div class="curry-no">#{{ String(c.no).padStart(3, "0") }}</div>
        <div class="curry-name">{{ c.name }}</div>
        <el-tag size="small" effect="plain" type="info">{{ c.key_ingredient }}</el-tag>
        <div class="curry-desc">{{ c.desc }}</div>
      </div>
    </div>
    <div v-if="!loading && !filtered.length" class="empty-hint" style="padding:40px">没有符合条件的咖喱</div>
  </div>
  `,
  setup() {
    const { ref, computed } = Vue;
    const loading = ref(true);
    const list = ref([]);
    const q = ref("");
    const ingredient = ref("");

    const ingredients = computed(() =>
      [...new Set(list.value.map((c) => c.key_ingredient).filter(Boolean))].sort());
    const filtered = computed(() => list.value.filter((c) =>
      (!q.value || c.name.includes(q.value) || c.key_ingredient.includes(q.value))
      && (!ingredient.value || c.key_ingredient === ingredient.value)));

    apiGet("/api/curries").then((r) => { list.value = r; loading.value = false; });
    return { loading, list, q, ingredient, ingredients, filtered };
  },
};
