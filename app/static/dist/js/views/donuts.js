/* Z-A 甜甜圈工房：特殊配方 / 基础类型 / 树果效果 / 风味力量 / 自由录入 */
const FLAVOR_NAMES = { sweet: "甜", spicy: "辣", sour: "酸", bitter: "苦", fresh: "鲜" };

const DonutView = {
  template: `
  <div v-loading="loading">
    <div class="page-head">
      <span class="page-title">甜甜圈工房</span>
      <el-tag size="small" type="warning" effect="plain">传说 Z-A</el-tag>
      <span style="color:#888;font-size:13px">旅馆Ｚ安馨儿的甜甜圈店 · 树果配方与风味力量</span>
    </div>

    <template v-if="d">
    <el-alert type="info" :closable="false" style="margin-bottom:12px"
      :title="d.intro || '在旅馆Ｚ的安馨儿的甜甜圈店可以制作甜甜圈。'"
      description="最初使用 3 个树果和密阿雷黄油；获得异次元黄油后最多可使用 8 个树果。特殊甜甜圈可打开通往传说宝可梦的扭洞。" show-icon />

    <el-tabs v-model="tabName">
      <el-tab-pane :label="'特殊配方 (' + d.special.length + ')'" name="special">
        <div class="sand-grid">
          <div v-for="s in d.special" :key="s.name" class="sand-card donut-card">
            <div class="donut-img-wrap">
              <img class="donut-img" :src="'/assets/donut_' + s.name + '.png'" loading="lazy"
                onerror="this.style.display='none'">
            </div>
            <h4>🍩 {{ s.name }}</h4>
            <div class="flavor-row">
              <span v-for="(v, k) in FLAVOR_NAMES" :key="k" class="flavor-chip"
                :class="'fl-' + k" :style="{opacity: s[k] ? 1 : 0.25}">{{ v }} {{ s[k] }}</span>
            </div>
            <div class="ing"><b>食材：</b>{{ s.ingredients }}</div>
            <div class="ing"><b>风味力量：</b>{{ s.power }}</div>
            <div class="ing"><b>失控超级进化：</b>{{ s.target }}</div>
            <div class="ing"><b>扭洞：</b>{{ s.rift }}</div>
            <div class="ing"><b>位置：</b>{{ s.location }}</div>
            <div class="ing desc">{{ s.desc }}</div>
          </div>
        </div>
      </el-tab-pane>

      <el-tab-pane :label="'基础甜甜圈 (' + d.types.length + ')'" name="types">
        <div class="sand-grid">
          <div v-for="t in d.types" :key="t.name" class="sand-card">
            <div class="donut-img-wrap small">
              <img class="donut-img" :src="'/assets/donut_' + t.name + '甜甜圈.png'" loading="lazy"
                onerror="this.style.display='none'">
            </div>
            <h4><span class="flavor-chip" :class="flClass(t.flavor)">{{ t.flavor }}</span>{{ t.name }}</h4>
            <div class="ing desc">{{ t.desc }}</div>
            <div class="ing" style="color:#98a1b3">树果 ×N（0→★5，风味随树果变化）</div>
          </div>
        </div>
      </el-tab-pane>

      <el-tab-pane :label="'树果效果 (' + d.berries.length + ')'" name="berries">
        <div class="page-head">
          <el-input v-model="berryQ" clearable placeholder="搜索树果" style="width:160px" />
          <div class="spacer"></div>
          <span style="font-size:13px;color:#888">{{ filteredBerries.length }} 种</span>
        </div>
        <el-table :data="filteredBerries" size="small" height="520">
          <el-table-column label="树果" min-width="110">
            <template #default="{ row }"><b>{{ row.name }}</b></template>
          </el-table-column>
          <el-table-column v-for="(v, k) in FLAVOR_NAMES" :key="k" :label="v" width="70">
            <template #default="{ row }">
              <span :style="{color: row[k] ? '#333' : '#c8cedb', fontWeight: row[k] >= 15 ? 700 : 400}">{{ row[k] || "·" }}</span>
            </template>
          </el-table-column>
          <el-table-column prop="boost" label="增幅等级" width="90" />
          <el-table-column prop="energy" label="饱腹能量" width="90" sortable />
        </el-table>
      </el-tab-pane>

      <el-tab-pane :label="'风味力量 (' + d.flavor_powers.length + ')'" name="powers">
        <el-table :data="d.flavor_powers" size="small" height="560">
          <el-table-column label="风味" width="70">
            <template #default="{ row }">
              <span class="flavor-chip" :class="flClass(row.flavor)">{{ row.flavor }}</span>
            </template>
          </el-table-column>
          <el-table-column prop="power" label="力量" width="130" />
          <el-table-column prop="effect" label="说明" min-width="260" />
          <el-table-column prop="lv1" label="Lv.1" min-width="130" />
          <el-table-column prop="lv2" label="Lv.2" min-width="130" />
          <el-table-column prop="lv3" label="Lv.3" min-width="150" />
          <el-table-column prop="prefix" label="前缀" width="130" />
        </el-table>
      </el-tab-pane>

      <el-tab-pane :label="'我的配方 (' + customList.length + ')'" name="custom">
        <div class="page-head">
          <span style="color:#888;font-size:13px">自由组合记录</span>
          <div class="spacer"></div>
          <el-button type="primary" size="small" @click="openEditor">＋ 录入配方</el-button>
        </div>
        <div class="sand-grid" v-if="customList.length">
          <div v-for="r in customList" :key="r.id" class="sand-card custom">
            <h4>🍩 {{ r.name }}
              <el-button size="small" text type="danger" style="float:right"
                @click="removeCustom(r)">删除</el-button>
            </h4>
            <div>
              <span v-for="(e, i) in r.effects" :key="i" class="power-badge"
                :style="{'--p': POWER_COLORS[e.power] || '#909399'}">
                {{ e.power }}<template v-if="e.type">：{{ e.type }}</template> Lv.{{ e.level }}
              </span>
            </div>
            <div class="ing"><b>树果：</b>{{ Array.isArray(r.ingredients) ? r.ingredients.join("、") : r.ingredients }}</div>
          </div>
        </div>
        <div v-else class="empty-hint" style="padding:30px">还没有自定义配方</div>
      </el-tab-pane>
    </el-tabs>

    <el-dialog v-model="editorDlg" title="录入自定义甜甜圈配方" width="520px">
      <el-form label-width="80px">
        <el-form-item label="名称">
          <el-input v-model="editor.name" placeholder="可选" maxlength="24" />
        </el-form-item>
        <el-form-item label="风味力量" required>
          <div v-for="(e, i) in editor.effects" :key="i" class="fld-row">
            <el-select v-model="e.power" size="small" filterable style="width:140px" placeholder="力量">
              <el-option v-for="p in powerNames" :key="p" :value="p" :label="p" />
            </el-select>
            <el-select v-model="e.type" size="small" clearable style="width:100px" placeholder="属性">
              <el-option v-for="t in TYPE_LIST" :key="t" :value="t" :label="t" />
            </el-select>
            <el-select v-model="e.level" size="small" style="width:80px">
              <el-option v-for="v in [1, 2, 3]" :key="v" :value="v" :label="'Lv.' + v" />
            </el-select>
            <el-button size="small" text type="danger" @click="editor.effects.splice(i, 1)">删</el-button>
          </div>
          <el-button size="small" text type="primary"
            @click="editor.effects.push({power: '', type: '', level: 1})">＋ 添加</el-button>
        </el-form-item>
        <el-form-item label="树果" required>
          <div style="width:100%">
            <el-select v-model="editor.ingredients" multiple filterable
              placeholder="搜索并选择树果（3~8 个）" style="width:100%">
              <el-option v-for="b in d.berries" :key="b.name" :value="b.name" :label="b.name" />
            </el-select>
            <div class="berry-count" :class="{bad: editor.ingredients.length > 0 && (editor.ingredients.length < 3 || editor.ingredients.length > 8)}">
              已选 {{ editor.ingredients.length }} / 8 个（最少 3 个；黄油随剧情固定，无需选择）
            </div>
            <!-- 风味预览 -->
            <div v-if="flavorPreview" class="flavor-preview">
              <div class="fp-row">
                <span class="fp-lbl">风味合计</span>
                <span v-for="e in flavorPreview.sums" :key="e[0]" class="flavor-chip"
                  :class="flClass(FLAVOR_NAMES[e[0]])" :style="{opacity: e[1] > 0 ? 1 : .35}">
                  {{ FLAVOR_NAMES[e[0]] }} {{ e[1] }}
                </span>
              </div>
              <div class="fp-row">
                <span class="fp-lbl">风味级别</span>
                <span class="fp-star">{{ "★".repeat(flavorPreview.star) }}<template v-if="flavorPreview.star < 5">{{ "☆".repeat(5 - flavorPreview.star) }}</template></span>
                <span v-if="flavorPreview.star >= 3" style="color:#67c23a">达到 3★，将产生风味力量</span>
                <span v-else style="color:#98a1b3">未达 3★，不产生风味力量</span>
              </div>
              <div class="fp-row" v-if="flavorPreview.star >= 3">
                <span class="fp-lbl">预期力量</span>
                <span style="font-size:12.5px;color:#555">
                  由最大风味「{{ FLAVOR_NAMES[flavorPreview.maxFlavor] }}」决定（次高「{{ FLAVOR_NAMES[flavorPreview.second[0]] }} {{ flavorPreview.second[1] }}」影响具体种类）：
                  <el-tag v-for="pw in flavorPreview.powers" :key="pw" size="small" style="margin:2px 4px 2px 0">{{ pw }}</el-tag>
                </span>
              </div>
            </div>
          </div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="editorDlg = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="saveCustom">保存</el-button>
      </template>
    </el-dialog>
    </template>
  </div>
  `,
  setup() {
    const { ref, reactive, computed, inject } = Vue;
    const store = inject("store");
    const loading = ref(true);
    const d = ref(null);
    const tabName = ref("special");
    const berryQ = ref("");
    const customList = ref([]);
    const editorDlg = ref(false);
    const saving = ref(false);
    const editor = reactive({ name: "", effects: [{ power: "", type: "", level: 1 }],
      ingredients: [] });

    const filteredBerries = computed(() => d.value
      ? d.value.berries.filter((b) => !berryQ.value || b.name.includes(berryQ.value))
      : []);
    const powerNames = computed(() => {
      if (!d.value) return [];
      const names = d.value.flavor_powers.map((f) => f.power.replace(/·.+/, ""));
      return [...new Set(names)];
    });

    async function loadCustom() {
      customList.value = await apiGet("/api/custom-recipes",
        { profile: store.profileId, game: "legends-za" });
    }
    function openEditor() {
      editor.name = "";
      editor.effects = [{ power: "", type: "", level: 1 }];
      editor.ingredients = [];
      editorDlg.value = true;
    }

    /* 风味预览：五维求和 → 最大风味对照阈值定★（0/120/240/350/700/960）→
       3★ 起产生风味力量，由最大 1~2 项风味决定种类（次高风味影响具体种类） */
    const STAR_THRESHOLDS = [120, 240, 350, 700, 960];
    const flavorPreview = computed(() => {
      if (!d.value || !editor.ingredients.length) return null;
      const sums = { sweet: 0, spicy: 0, sour: 0, bitter: 0, fresh: 0 };
      for (const name of editor.ingredients) {
        const b = d.value.berries.find((x) => x.name === name);
        if (b) for (const k of Object.keys(sums)) sums[k] += b[k] || 0;
      }
      const entries = Object.entries(sums).sort((a, b) => b[1] - a[1]);
      const star = STAR_THRESHOLDS.filter((th) => entries[0][1] >= th).length;
      const powers = [];
      if (star >= 3) {
        const zh = FLAVOR_NAMES[entries[0][0]];
        const seen = new Set();
        for (const fp of d.value.flavor_powers) {
          if (fp.flavor === zh && !seen.has(fp.power)) { seen.add(fp.power); powers.push(fp.power); }
        }
      }
      return { sums: entries, star, maxFlavor: entries[0][0], second: entries[1], powers };
    });
    async function saveCustom() {
      const effects = editor.effects.filter((e) => e.power);
      if (!effects.length) { store.toast("风味力量为必填", "warning"); return; }
      if (editor.ingredients.length < 3 || editor.ingredients.length > 8) {
        store.toast("树果需要 3~8 个", "warning");
        return;
      }
      saving.value = true;
      try {
        await apiSend("POST", "/api/custom-recipes", {
          profile_id: store.profileId, game: "legends-za",
          name: editor.name, effects, ingredients: editor.ingredients, seasonings: [],
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
    }
    function flClass(flavor) {
      return { "甜": "fl-sweet", "辣": "fl-spicy", "酸": "fl-sour", "苦": "fl-bitter", "鲜": "fl-fresh" }[flavor] || "";
    }

    apiGet("/api/donuts").then((r) => { d.value = r; loading.value = false; });
    loadCustom();

    return {
      loading, d, tabName, berryQ, filteredBerries, customList,
      editorDlg, editor, saving, openEditor, saveCustom, removeCustom, flavorPreview,
      powerNames, flClass, FLAVOR_NAMES, TYPE_LIST, POWER_COLORS,
    };
  },
};
