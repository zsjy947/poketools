/* 朱紫三明治食谱：筛选 + 食材调味料表 + 自由录入 */
const SandwichView = {
  template: `
  <div>
    <div class="page-head">
      <span class="page-title">三明治食谱</span>
      <el-tag size="small" type="warning" effect="plain">朱／紫</el-tag>
      <span style="color:#888;font-size:13px">按食力筛选 · 自由模式可录入自己的配方</span>
    </div>

    <div class="hero-banner">
      <img src="/assets/sandwich_hero.png" onerror="this.parentNode.style.display='none'">
    </div>

    <el-tabs v-model="tabName">
      <el-tab-pane label="食谱列表" name="recipes">
        <div class="page-head">
          <el-select v-model="power" clearable placeholder="食力类型" style="width:130px">
            <el-option v-for="p in POWER_LIST" :key="p" :value="p" :label="p" />
          </el-select>
          <el-select v-model="ptype" clearable placeholder="目标属性" style="width:110px">
            <el-option v-for="t in TYPE_LIST" :key="t" :value="t" :label="t" />
          </el-select>
          <el-select v-model="level" clearable placeholder="等级" style="width:100px">
            <el-option v-for="v in [1, 2, 3]" :key="v" :value="v" :label="'Lv.' + v" />
          </el-select>
          <el-radio-group v-model="sort" size="small">
            <el-radio-button value="no">按编号</el-radio-button>
            <el-radio-button value="power">按效果</el-radio-button>
            <el-radio-button value="level">按等级</el-radio-button>
          </el-radio-group>
          <el-input v-model="q" clearable placeholder="搜索名称/食材" style="width:170px" />
          <div class="spacer"></div>
          <span style="font-size:13px;color:#888">{{ list.length }} 个食谱</span>
        </div>
        <div class="sand-grid" v-loading="loading">
          <div v-for="r in list" :key="r.no" class="sand-card">
            <img class="sand-img" loading="lazy"
              :src="'/assets/sandwiches/sandwich_' + String(r.no).padStart(3, '0') + '.webp'"
              onerror="this.style.display='none'">
            <h4><span class="no">#{{ r.no }}</span>{{ r.name }}</h4>
            <div>
              <span v-for="(e, i) in r.effects" :key="i" class="power-badge"
                :style="{'--p': POWER_COLORS[e.power] || '#909399'}">
                {{ e.power }}<template v-if="e.type">：{{ e.type }}</template> Lv.{{ e.level }}
              </span>
            </div>
            <div class="ing"><b>食材：</b>{{ r.ingredients || "—" }}</div>
            <div class="ing"><b>调味料：</b>{{ r.seasonings || "—" }}</div>
            <div class="ing"><b>获得：</b>{{ r.how || "—" }}</div>
          </div>
        </div>
      </el-tab-pane>

      <el-tab-pane label="食材与调味料" name="items">
        <div class="page-head">
          <el-radio-group v-model="itemKind" size="small">
            <el-radio-button value="">全部</el-radio-button>
            <el-radio-button value="食材">食材</el-radio-button>
            <el-radio-button value="调味料">调味料</el-radio-button>
          </el-radio-group>
          <el-input v-model="itemQ" clearable placeholder="搜索" style="width:160px" />
          <div class="spacer"></div>
          <span style="font-size:13px;color:#888">{{ filteredItems.length }} 项</span>
        </div>
        <el-table :data="filteredItems" size="small" height="520">
          <el-table-column label="名称" min-width="130">
            <template #default="{ row }">
              <b>{{ row.name }}</b>
              <el-tag size="small" style="margin-left:6px" effect="plain"
                :type="row.kind === '调味料' ? 'warning' : 'success'">{{ row.kind }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="说明" min-width="320" prop="desc" />
          <el-table-column label="获得方式" min-width="200">
            <template #default="{ row }">{{ row.how || "待补充" }}</template>
          </el-table-column>
          <el-table-column label="价格" width="90">
            <template #default="{ row }">{{ row.price ? "￥" + row.price : "—" }}</template>
          </el-table-column>
        </el-table>
      </el-tab-pane>

      <el-tab-pane :label="'我的食谱 (' + customList.length + ')'" name="custom">
        <div class="page-head">
          <span style="color:#888;font-size:13px">自由模式配方记录（效果/食材/调味料必填）</span>
          <div class="spacer"></div>
          <el-button type="primary" size="small" @click="openEditor">＋ 录入食谱</el-button>
        </div>
        <div class="sand-grid" v-if="customList.length">
          <div v-for="r in customList" :key="r.id" class="sand-card custom">
            <h4><mono-icon name="sandwich" :size="18" style="vertical-align:-3px"></mono-icon> {{ r.name }}
              <el-button size="small" text type="danger" style="float:right"
                @click="removeCustom(r)">删除</el-button>
            </h4>
            <div>
              <span v-for="(e, i) in r.effects" :key="i" class="power-badge"
                :style="{'--p': POWER_COLORS[e.power] || '#909399'}">
                {{ e.power }}<template v-if="e.type">：{{ e.type }}</template> Lv.{{ e.level }}
              </span>
            </div>
            <div class="ing"><b>食材：</b>{{ fmtList(r.ingredients) }}</div>
            <div class="ing"><b>调味料：</b>{{ fmtList(r.seasonings) }}</div>
          </div>
        </div>
        <div v-else class="empty-hint" style="padding:30px">还没有自定义食谱，点击右上角「录入食谱」开始记录</div>
      </el-tab-pane>
    </el-tabs>

    <!-- 录入对话框 -->
    <el-dialog v-model="editorDlg" title="录入自定义食谱" width="560px">
      <el-form label-width="80px">
        <el-form-item label="名称">
          <el-input v-model="editor.name" placeholder="可选，如「闪光猎手三明治」" maxlength="24" />
        </el-form-item>
        <el-form-item label="效果" required>
          <div v-for="(e, i) in editor.effects" :key="i" class="fld-row">
            <el-select v-model="e.power" size="small" style="width:110px" placeholder="食力">
              <el-option v-for="p in POWER_LIST" :key="p" :value="p" :label="p" />
            </el-select>
            <el-select v-model="e.type" size="small" clearable style="width:100px" placeholder="属性">
              <el-option v-for="t in TYPE_LIST" :key="t" :value="t" :label="t" />
            </el-select>
            <el-select v-model="e.level" size="small" style="width:80px" placeholder="等级">
              <el-option v-for="v in [1, 2, 3]" :key="v" :value="v" :label="'Lv.' + v" />
            </el-select>
            <el-button size="small" text type="danger" @click="editor.effects.splice(i, 1)">删除</el-button>
          </div>
          <el-button size="small" text type="primary" @click="editor.effects.push({power: '', type: '', level: 1})">＋ 添加效果</el-button>
        </el-form-item>
        <el-form-item label="食材" required>
          <div style="width:100%">
            <el-select :model-value="null" filterable placeholder="搜索并添加食材" style="width:100%"
              @change="addItem(editor.ingredients, $event)">
              <el-option v-for="i in itemOptions('食材')" :key="i" :value="i" :label="i"
                :disabled="editor.ingredients.some(x => x.name === i)" />
            </el-select>
            <div v-for="(it, i) in editor.ingredients" :key="it.name" class="qty-row">
              <span class="qty-name">{{ it.name }}</span>
              <el-input-number v-model="it.count" :min="1" :max="99" size="small" style="width:96px" />
              <el-button size="small" text type="danger" @click="editor.ingredients.splice(i, 1)">删除</el-button>
            </div>
          </div>
        </el-form-item>
        <el-form-item label="调味料" required>
          <div style="width:100%">
            <el-select :model-value="null" filterable placeholder="搜索并添加调味料" style="width:100%"
              @change="addItem(editor.seasonings, $event)">
              <el-option v-for="i in itemOptions('调味料')" :key="i" :value="i" :label="i"
                :disabled="editor.seasonings.some(x => x.name === i)" />
            </el-select>
            <div v-for="(it, i) in editor.seasonings" :key="it.name" class="qty-row">
              <span class="qty-name">{{ it.name }}</span>
              <el-input-number v-model="it.count" :min="1" :max="99" size="small" style="width:96px" />
              <el-button size="small" text type="danger" @click="editor.seasonings.splice(i, 1)">删除</el-button>
            </div>
          </div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="editorDlg = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="saveCustom">保存</el-button>
      </template>
    </el-dialog>
  </div>
  `,
  setup() {
    const { ref, reactive, computed, watch, inject } = Vue;
    const store = inject("store");
    const tabName = ref("recipes");
    const power = ref("");
    const ptype = ref("");
    const level = ref(null);
    const sort = ref("no");
    const q = ref("");
    const list = ref([]);
    const loading = ref(false);

    const itemKind = ref("");
    const itemQ = ref("");
    const items = ref([]);
    const customList = ref([]);
    const editorDlg = ref(false);
    const saving = ref(false);
    const editor = reactive({ name: "", effects: [{ power: "", type: "", level: 1 }],
      ingredients: [], seasonings: [] });

    const filteredItems = computed(() => items.value.filter((p) =>
      p.kind !== "咖喱食材"
      && (!itemKind.value || p.kind === itemKind.value)
      && (!itemQ.value || p.name.includes(itemQ.value) || (p.desc || "").includes(itemQ.value))));

    async function load() {
      loading.value = true;
      try {
        list.value = await apiGet("/api/sandwiches", {
          power: power.value, ptype: ptype.value, level: level.value || 0,
          sort: sort.value, q: q.value,
        });
      } finally { loading.value = false; }
    }
    async function loadCustom() {
      customList.value = await apiGet("/api/custom-recipes",
        { profile: store.profileId, game: "scarlet-violet" });
    }
    function openEditor() {
      editor.name = "";
      editor.effects = [{ power: "", type: "", level: 1 }];
      editor.ingredients = [];   // [{name, count}]
      editor.seasonings = [];
      editorDlg.value = true;
    }
    function itemOptions(kind) {
      return items.value.filter((p) => p.kind === kind).map((p) => p.name);
    }
    function addItem(list, name) {
      if (name && !list.some((x) => x.name === name)) list.push({ name, count: 1 });
    }
    async function saveCustom() {
      const effects = editor.effects.filter((e) => e.power);
      if (!effects.length || !editor.ingredients.length || !editor.seasonings.length) {
        store.toast("效果、食材、调味料均为必填", "warning");
        return;
      }
      const totalIng = editor.ingredients.reduce((a, b) => a + b.count, 0);
      if (totalIng > 30) { store.toast("食材总数过多", "warning"); return; }
      saving.value = true;
      try {
        await apiSend("POST", "/api/custom-recipes", {
          profile_id: store.profileId, game: "scarlet-violet",
          name: editor.name, effects, ingredients: editor.ingredients, seasonings: editor.seasonings,
        });
        editorDlg.value = false;
        await loadCustom();
        store.toast("已保存", "success");
      } catch (e) {
        store.toast(String(e.message || e), "error");
      } finally { saving.value = false; }
    }
    async function removeCustom(r) {
      await apiSend("DELETE", "/api/custom-recipes/" + r.id + "?profile=" + store.profileId);
      await loadCustom();
      store.toast("已删除", "success");
    }

    watch([power, ptype, level, sort], load);
    let qt;
    watch(q, () => { clearTimeout(qt); qt = setTimeout(load, 300); });
    load();
    apiGet("/api/picnic-items").then((r) => (items.value = r));
    loadCustom();

    function fmtList(v) {
      if (Array.isArray(v)) {
        return v.map((x) => (typeof x === "object" ? `${x.name} ×${x.count}` : x)).join("、");
      }
      return v || "—";
    }

    return {
      tabName, power, ptype, level, sort, q, list, loading,
      itemKind, itemQ, items, filteredItems, itemOptions,
      customList, editorDlg, editor, saving,
      openEditor, saveCustom, removeCustom, fmtList,
      POWER_LIST, TYPE_LIST, POWER_COLORS,
    };
  },
};
