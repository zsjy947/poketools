/* 宝可梦详情页：按当前游戏裁剪（介绍/获取/招式）+ 进化链 + 种族值计算 + 属性相性 */
const DetailView = {
  template: `
  <div v-loading="loading">
    <div class="page-head">
      <el-button size="small" @click="goBack">← 返回图鉴</el-button>
      <el-tag v-if="game" size="small" effect="plain">{{ game.name_zh }}</el-tag>
      <div class="spacer"></div>
      <el-select v-if="d && d.forms.length > 1" v-model="formId" size="small" style="width:220px">
        <el-option v-for="f in d.forms" :key="f.id" :value="f.id"
          :label="(f.form_label || f.identifier) + (f.is_default ? '（默认）' : '')" />
      </el-select>
    </div>

    <template v-if="d">
    <!-- 头部信息 -->
    <div class="detail-head">
      <div class="detail-art">
        <poke-img :form-id="curForm.id" :size="168"></poke-img>
      </div>
      <div class="meta">
        <div class="names">
          <h2>{{ d.species.name_zh }}</h2>
          <span class="en">{{ d.species.name_en }}</span>
          <span class="en">#{{ String(d.species.id).padStart(4, "0") }}</span>
        </div>
        <div style="margin-top:6px;display:flex;align-items:center;gap:10px;flex-wrap:wrap">
          <type-badge :types="curForm.types"></type-badge>
          <span class="genus">{{ d.species.genus_zh }}宝可梦</span>
        </div>
        <div class="kv">
          <span><b>特性：</b><ability-list :abilities="curForm.ability_list"></ability-list>
            <i class="hidden-hint">★ = 隐藏特性</i></span>
        </div>
        <div class="kv">
          <span v-if="d.species.egg_groups && d.species.egg_groups !== '未发现'">
            <b>蛋组：</b>{{ d.species.egg_groups }}</span>
          <span><b>捕获率：</b>{{ d.species.capture_rate }}</span>
          <span><b>身高/体重：</b>{{ (curForm.height / 10).toFixed(1) }}m / {{ (curForm.weight / 10).toFixed(1) }}kg</span>
          <span><b>击倒努力值：</b><ev-badges :ev="curEv"></ev-badges></span>
        </div>
        <div class="kv" v-if="curDex">
          <span><b>当前图鉴：</b><el-tag size="small" effect="plain" type="success">
            {{ game.name_zh }}·{{ curDex.dex_zh }} #{{ curDex.ndex }}</el-tag></span>
        </div>
        <div class="kv" v-else-if="d.dex_list.length">
          <span><b>图鉴收录：</b>
            <el-tag v-for="x in d.dex_list" :key="x.dex_id" size="small" style="margin-right:6px"
              effect="plain">{{ x.game_zh }}·{{ x.dex_zh }} #{{ x.ndex }}</el-tag>
          </span>
        </div>
      </div>
    </div>

    <!-- 进化链 -->
    <div class="block">
      <h3>进化链</h3>
      <evo-chain :evo="d.evolution" :current="sid"></evo-chain>
    </div>

    <!-- 当前版本图鉴介绍 -->
    <div class="block">
      <h3>图鉴介绍<template v-if="game">（{{ game.name_zh }}）</template></h3>
      <flavor-list :flavor="d.flavor"></flavor-list>
    </div>

    <!-- 获取方式（本体/DLC/独占分组） -->
    <div class="block">
      <h3>获取方式<template v-if="game">（{{ game.name_zh }}）</template></h3>
      <get-method-list :rows="d.get_methods" :extra="d.encounters_api"></get-method-list>
    </div>

    <!-- 种族值 + 能力值计算器 -->
    <div class="block">
      <h3>种族值与能力值计算</h3>
      <div class="calc-stat-wrap">
        <div style="flex:1;min-width:280px">
          <stat-bars :stats="baseStats" :max="255"></stat-bars>
          <div class="stat-sum">种族值合计：<b>{{ statSum }}</b></div>
        </div>
        <div class="stat-calc-panel">
          <div class="fld-row">
            <span class="lbl">等级</span>
            <el-input-number v-model="sc.level" :min="1" :max="100" size="small" style="width:100px" />
            <span class="lbl">性格</span>
            <el-select v-model="sc.nature" size="small" style="width:130px">
              <el-option v-for="n in natures" :key="n.identifier" :value="n.identifier"
                :label="n.name_zh + (n.up ? '（+' + STAT_ZH[n.up] + ' -' + STAT_ZH[n.down] + '）' : '')" />
            </el-select>
          </div>
          <div class="fld-row" v-for="k in ['hp','atk','def','spa','spd','spe']" :key="k">
            <span class="lbl">{{ STAT_ZH[k] }}</span>
            <span class="mini">努力值</span>
            <el-input-number v-model="sc.ev[k]" :min="0" :max="252" :step="4" size="small" style="width:96px" />
            <span class="mini">个体值</span>
            <el-input-number v-model="sc.iv[k]" :min="0" :max="31" size="small" style="width:96px" />
            <span class="mini result">= <b>{{ computedStats[k] }}</b></span>
          </div>
          <div style="font-size:12px;color:#98a1b3">努力值合计 {{ evSum }}/510</div>
        </div>
      </div>
    </div>

    <!-- 属性相性（防守方视角） -->
    <div class="block">
      <h3>属性相性（防守）</h3>
      <div class="eff-groups" v-if="effGroups">
        <div v-for="g in effGroups" :key="g.m" class="eff-group">
          <span class="eff-m" :class="effClass(g.m)">×{{ g.m }}</span>
          <type-badge v-for="t in g.types" :key="t" :types="t"></type-badge>
        </div>
      </div>
      <div v-else class="empty-hint">加载中…</div>
    </div>

    <!-- 招式表 -->
    <div class="block">
      <div class="page-head">
        <h3 style="margin:0">招式表<template v-if="game">（{{ game.name_zh }}）</template></h3>
        <span v-if="curForm && d.forms.length > 1" style="font-size:12px;color:#98a1b3">
          当前形态：{{ curForm.form_label || curForm.identifier }}</span>
      </div>
      <el-tabs v-model="tab" v-if="moves">
        <el-tab-pane v-for="t in moves.tabs" :key="t.key"
          :label="t.label + ' (' + (moves.groups[t.key] || []).length + ')'" :name="t.key">
          <el-table :data="moves.groups[t.key]" size="small" height="420" row-key="move_id">
            <el-table-column v-if="t.key === 'level'" label="等级" width="90" sortable prop="level">
              <template #default="{ row }">
                Lv.{{ row.level }}<template v-if="row.mastery != null">
                  <span class="mastery">精通+{{ row.mastery }}</span></template>
              </template>
            </el-table-column>
            <el-table-column v-if="t.key === 'machine'" type="expand">
              <template #default="{ row }">
                <div v-for="t2 in row.tm" :key="t2.number" class="tm-how">
                  <b>{{ t2.kind }} {{ String(t2.number).padStart(3, "0") }}</b>
                  <template v-if="t2.how"><br>获取：{{ t2.how }}</template>
                  <template v-if="t2.materials"><br>制作材料：{{ t2.materials }}</template>
                  <template v-if="!t2.how && !t2.materials"><br>获取方式待补充</template>
                </div>
                <div v-if="!row.tm.length" class="tm-how">获取方式待补充</div>
              </template>
            </el-table-column>
            <el-table-column v-if="t.key === 'machine'" label="编号" width="140">
              <template #default="{ row }">
                <el-tag v-for="t2 in row.tm" :key="t2.number" size="small" style="margin-right:4px"
                  :effect="t2.kind === 'TR' ? 'plain' : 'plain'" :type="t2.kind === 'TR' ? 'warning' : 'info'">
                  {{ t2.kind }}{{ String(t2.number).padStart(3, "0") }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="招式" min-width="120" sortable prop="name_zh">
              <template #default="{ row }">{{ row.name_zh }}</template>
            </el-table-column>
            <el-table-column label="属性" width="96">
              <template #default="{ row }"><type-badge :types="row.type_zh"></type-badge></template>
            </el-table-column>
            <el-table-column label="分类" width="72">
              <template #default="{ row }"><move-class-badge :cls="row.damage_class"></move-class-badge></template>
            </el-table-column>
            <el-table-column prop="power" label="威力" width="66" sortable />
            <el-table-column prop="accuracy" label="命中" width="66" sortable>
              <template #default="{ row }">{{ row.accuracy ?? "—" }}</template>
            </el-table-column>
            <el-table-column prop="pp" label="PP" width="60" />
            <el-table-column label="优先度" width="70" sortable prop="priority">
              <template #default="{ row }">{{ row.priority > 0 ? "+" + row.priority : row.priority }}</template>
            </el-table-column>
            <el-table-column v-if="t.key === 'egg'" label="生蛋链" width="120">
              <template #default="{ row }">
                <el-button size="small" type="primary" plain @click="showChains(row)">计算繁殖链</el-button>
              </template>
            </el-table-column>
          </el-table>
          <empty v-if="t.key === 'egg' && !moves.has_breeding">
            当前游戏没有生蛋孵化机制（{{ game ? game.name_zh : "" }}）
          </empty>
        </el-tab-pane>
      </el-tabs>
    </div>

    <el-dialog v-model="chainDlg" :title="chainTitle" width="720px">
      <div v-loading="chainLoading">
        <template v-if="chains && chains.ok">
          <el-alert type="info" :closable="false" style="margin-bottom:10px"
            :title="'最短需 ' + chains.min_length + ' 次繁殖，共找到 ' + chains.chain_count + ' 条最短路线'" />
          <div v-for="(c, i) in chains.chains.slice(0, 30)" :key="i" class="block" style="margin-bottom:10px">
            <div class="chain-step">
              <div class="chain-box">
                <div class="nm">{{ c.steps[0].from.name }}</div>
                <div class="sub">{{ c.steps[0].from.learn }}</div>
              </div>
              <template v-for="(s, j) in c.steps" :key="j">
                <div class="chain-arrow">→</div>
                <div class="chain-box" :class="{ 'chain-target': j === c.steps.length - 1 }">
                  <div class="nm">{{ s.to.name }}</div>
                  <div class="sub">
                    <template v-if="j === c.steps.length - 1">同蛋组：{{ s.shared_groups.join("、") }}</template>
                    <template v-else>{{ s.to.learn }}；同蛋组：{{ s.shared_groups.join("、") }}</template>
                  </div>
                </div>
              </template>
            </div>
          </div>
          <div style="font-size:12px;color:#999">{{ chains.note }}
            <template v-if="chains.truncated">（仅展示前 30 条）</template></div>
        </template>
        <template v-else-if="chains">
          <el-alert type="warning" :closable="false" :title="chains.reason" />
        </template>
      </div>
    </el-dialog>
    </template>
  </div>
  `,
  setup() {
    const { ref, reactive, computed, inject } = Vue;
    const store = inject("store");
    const loading = ref(true);
    const d = ref(null);
    const formId = ref(null);
    const moves = ref(null);
    const tab = ref("level");
    const chainDlg = ref(false);
    const chainLoading = ref(false);
    const chains = ref(null);
    const chainTitle = ref("");
    const natures = ref([]);

    const m = location.hash.match("#/pokemon/(\\d+)\\??(.*)");
    const sid = m ? parseInt(m[1]) : 0;
    const backParams = m && m[2] ? new URLSearchParams(m[2].split("?").pop()) : new URLSearchParams();
    const gameId = backParams.get("game") || store.gameId || "";

    const game = computed(() => store.games.find((g) => g.id === gameId) || null);
    const curForm = computed(() => {
      if (!d.value) return { types: "", ability_list: [], height: 0, weight: 0, id: 0 };
      return d.value.forms.find((f) => f.id === formId.value) || d.value.default_form;
    });
    /* 努力值随形态切换（forms 行自带 ev_* 列） */
    const curEv = computed(() => {
      const f = curForm.value;
      const pick = (k) => (f["ev_" + k] != null ? f["ev_" + k] : (d.value.ev || {})[k] || 0);
      return { hp: pick("hp"), atk: pick("atk"), def: pick("def"),
               spa: pick("spa"), spd: pick("spd"), spe: pick("spe") };
    });
    const curDex = computed(() => {
      if (!d.value || !game.value) return null;
      return d.value.dex_list.find((x) => x.game_id === game.value.id) || null;
    });
    const baseStats = computed(() => {
      const f = curForm.value;
      if (!f || f.hp == null) return {};
      return { hp: f.hp, atk: f.atk, def: f.def, spa: f.spa, spd: f.spd, spe: f.spe };
    });
    const statSum = computed(() =>
      Object.values(baseStats.value).reduce((a, b) => a + (b || 0), 0));

    /* 能力值计算器状态 */
    const sc = reactive({
      level: 50, nature: "hardy",
      ev: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
      iv: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 },
    });
    const natureMult = computed(() => {
      const n = natures.value.find((x) => x.identifier === sc.nature);
      return (k) => {
        if (!n || !n.up) return 1.0;
        if (n.up === k && n.down !== k) return 1.1;
        if (n.down === k && n.up !== k) return 0.9;
        return 1.0;
      };
    });
    const computedStats = computed(() => {
      const b = baseStats.value;
      const L = sc.level;
      const out = {};
      if (!b.hp) return out;
      out.hp = b.hp === 1 ? 1
        : Math.floor((2 * b.hp + sc.iv.hp + Math.floor(sc.ev.hp / 4)) * L / 100) + L + 10;
      for (const k of ["atk", "def", "spa", "spd", "spe"]) {
        const v = Math.floor((2 * b[k] + sc.iv[k] + Math.floor(sc.ev[k] / 4)) * L / 100) + 5;
        out[k] = Math.floor(v * natureMult.value(k));
      }
      return out;
    });
    const evSum = computed(() => Object.values(sc.ev).reduce((a, b) => a + b, 0));

    /* 属性相性 */
    const effGroups = computed(() => {
      if (!store.typeChart || !curForm.value.types) return null;
      const mult = defenseMultipliers(curForm.value.types.split(",").filter(Boolean));
      const groups = {};
      for (const [atk, m] of Object.entries(mult)) {
        const key = String(m);
        (groups[key] = groups[key] || []).push(atk);
      }
      const order = ["4", "2", "1", "0.5", "0.25", "0"];
      return order.filter((k) => groups[k])
        .map((k) => ({ m: k === "1" ? "1" : k, types: groups[k] }));
    });
    function effClass(mm) {
      const v = parseFloat(mm);
      if (v >= 2) return "bad";
      if (v === 1) return "neutral";
      if (v === 0) return "immune";
      return "good";
    }

    async function load() {
      loading.value = true;
      try {
        d.value = await apiGet("/api/pokemon/" + sid, { game: gameId });
        formId.value = d.value.default_form ? d.value.default_form.id : null;
        await Promise.all([loadMoves(), loadNatures()]);
      } finally { loading.value = false; }
    }
    const { watch } = Vue;
    /* 切换形态时重载该形态的招式表 */
    watch(formId, () => { if (formId.value) loadMoves(); });
    async function loadNatures() {
      if (!natures.value.length) {
        if (!window.__naturesCache) {
          window.__naturesCache = await apiGet("/api/meta/natures");
        }
        natures.value = window.__naturesCache;
      }
    }
    async function loadMoves() {
      if (!gameId) return;
      moves.value = await apiGet("/api/pokemon/" + sid + "/moves",
        { game: gameId, form_id: formId.value || undefined });
      if (moves.value.tabs.length && !moves.value.tabs.some((t) => t.key === tab.value)) {
        tab.value = moves.value.tabs[0].key;
      }
    }
    async function showChains(row) {
      chainDlg.value = true;
      chainLoading.value = true;
      chains.value = null;
      chainTitle.value = "生蛋链：「" + row.name_zh + "」 → " + d.value.species.name_zh;
      try {
        chains.value = await apiGet("/api/breed-chains", {
          species_id: sid, move_id: row.move_id, game: gameId,
        });
      } finally { chainLoading.value = false; }
    }
    function goBack() {
      if (gameId) {
        location.hash = "#/game/" + gameId + "/dex";
      } else {
        location.hash = "#/home";
      }
    }

    load();
    return {
      store, loading, d, sid, formId, curForm, curEv, curDex, game, gameId,
      moves, tab, chainDlg, chainLoading, chains, chainTitle,
      showChains, goBack, baseStats, statSum,
      sc, natures, computedStats, evSum, STAT_ZH,
      effGroups, effClass,
    };
  },
};
