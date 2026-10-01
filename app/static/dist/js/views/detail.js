/* 宝可梦详情页：PC 两栏布局（左=信息/介绍/特性/相性，右=种族值能力值/进化链/获取/招式表）。
   形态用缩略图 tab 条切换，内容随形态独立变化；翻页原地换数据不整页重建。 */
const DetailView = {
  template: `
  <div v-loading="loading">
    <div class="page-head">
      <el-button size="small" @click="goBack">← 返回图鉴</el-button>
      <template v-if="navList.length">
        <el-button size="small" :disabled="!prevId" @click="goNeighbor(prevId)">← 上一只</el-button>
        <el-button size="small" :disabled="!nextId" @click="goNeighbor(nextId)">下一只 →</el-button>
      </template>
      <el-tag v-if="game" size="small" effect="plain">{{ game.name_zh }}</el-tag>
    </div>

    <template v-if="d">
    <!-- 移动端分段锚点（基本/获取/招式/能力；桌面隐藏） -->
    <div class="mobile-sec-chips">
      <span v-for="sec in SEC_CHIPS" :key="sec.key" class="chip-sec"
        :class="{on: activeSec === sec.key}" @click="scrollSec(sec)">{{ sec.label }}</span>
    </div>
    <!-- 形态选择：缩略图 tab 条（默认形态不带任何标注；选中非默认形态后可还原） -->
    <div v-if="d.forms.length > 1" class="form-strip">
      <div v-for="f in d.forms" :key="f.id" class="form-chip" :class="{active: f.id === formId}"
        @click="formId = f.id">
        <poke-img :form-id="f.id" :size="52"></poke-img>
        <span class="fname" v-if="!f.is_default">{{ formName(f) }}</span>
      </div>
      <el-button v-if="curForm && !curForm.is_default && d.default_form" size="small" plain
        style="align-self:center" @click="formId = d.default_form.id">还原默认形态</el-button>
    </div>

    <div class="detail-cols">
      <!-- 左栏 -->
      <div class="dcol">
        <!-- 头部信息卡 -->
        <div class="detail-head" id="sec-basic">
          <div class="detail-art">
            <poke-img :form-id="curForm.id" :size="176"></poke-img>
          </div>
          <div class="meta">
            <div class="names">
              <h2>{{ d.species.name_zh }}</h2>
              <span class="en">{{ d.species.name_en }}</span>
              <span class="en">#{{ String(d.species.id).padStart(4, "0") }}</span>
            </div>
            <div style="margin-top:8px;display:flex;align-items:center;gap:8px;flex-wrap:wrap">
              <type-badge :types="curForm.types"></type-badge>
              <span class="chip">{{ d.species.genus_zh }}</span>
              <span class="chip" v-if="d.species.shape_zh">{{ d.species.shape_zh }}</span>
              <span class="chip" v-if="d.species.egg_groups && d.species.egg_groups !== '未发现'">
                {{ d.species.egg_groups }}</span>
            </div>
            <div class="kv">
              <span><b>捕获率：</b>{{ d.species.capture_rate }}</span>
              <span><b>身高/体重：</b>{{ (curForm.height / 10).toFixed(1) }}m / {{ (curForm.weight / 10).toFixed(1) }}kg</span>
              <span style="display:inline-flex;align-items:center"><b>击倒努力值：</b><ev-badges :ev="curEv"></ev-badges></span>
            </div>
            <div class="kv" v-if="curDex">
              <span><el-tag size="small" effect="plain" type="success">
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

        <!-- 图鉴介绍（随形态独立） -->
        <div class="block">
          <h3>图鉴介绍<template v-if="game">（{{ game.name_zh }}）</template></h3>
          <flavor-list :flavor="curFlavor"></flavor-list>
        </div>

        <!-- 特性（阿尔宙斯与传说 Z-A 无特性机制，整体不渲染） -->
        <div class="block" v-if="!noAbilities">
          <h3>特性</h3>
          <ability-list :abilities="curForm.ability_list"></ability-list>
        </div>

        <!-- 属性相性（防守 / 攻击切换） -->
        <div class="block">
          <div class="page-head" style="margin-bottom:8px">
            <h3 style="margin:0">属性相性</h3>
            <el-radio-group v-model="effMode" size="small">
              <el-radio-button value="defend">抗击面</el-radio-button>
              <el-radio-button value="attack">攻击面</el-radio-button>
            </el-radio-group>
          </div>
          <template v-if="effMode === 'defend'">
            <div class="eff-groups" v-if="effGroups">
              <div v-for="g in effGroups" :key="g.m" class="eff-group">
                <span class="eff-m" :class="effClass(g.m)">×{{ g.m }}</span>
                <div class="eff-types">
                  <type-badge v-for="t in g.types" :key="t" :types="t"></type-badge>
                </div>
              </div>
            </div>
            <div v-else class="empty-hint">加载中…</div>
          </template>
          <template v-else>
            <div v-for="t in myTypes" :key="t" class="eff-group atk-group">
              <span class="eff-m atk-src">⚔ {{ t }}</span>
              <div class="eff-atk-list">
                <span v-for="g in atkGroupsOf(t)" :key="g.m" class="eff-inline">
                  <span class="eff-m" :class="effClass(g.m)">×{{ g.m }}</span>
                  <div class="eff-types">
                    <type-badge v-for="t2 in g.types" :key="t2" :types="t2" plain></type-badge>
                  </div>
                </span>
              </div>
            </div>
            <div v-if="!myTypes.length" class="empty-hint">待补充</div>
          </template>
        </div>
      </div>

      <!-- 右栏 -->
      <div class="dcol">
        <!-- 种族值 + 能力值（合并一卡） -->
        <div class="block" id="sec-ability">
          <div class="page-head" style="margin-bottom:6px">
            <h3 style="margin:0">种族值与能力值</h3>
            <div class="spacer"></div>
            <span class="stat-level-lbl">Lv.{{ sc.level }}</span>
          </div>
          <el-slider v-model="sc.level" :min="1" :max="100" style="margin:0 6px" />
          <div class="stat-rows">
            <div v-for="k in STAT_KEYS" :key="k" class="stat-row">
              <span class="stat-k">{{ STAT_ZH[k] }}</span>
              <span class="stat-base">{{ baseStats[k] ?? "—" }}</span>
              <div class="stat-track"><div class="stat-fill" :style="{width: pct(baseStats[k]), background: STAT_BAR_COLOR}"></div></div>
              <span class="stat-range">{{ rangeOf(k) }}</span>
              <span v-if="computedStats[k] != null" class="stat-actual">{{ computedStats[k] }}</span>
            </div>
          </div>
          <div class="stat-sum">种族值合计：<b>{{ statSum }}</b>
            <span v-if="computedStats.hp != null" class="stat-actual-hint">
              Lv.{{ sc.level }} 实际值以蓝色数字显示</span></div>
          <el-collapse style="margin-top:6px">
            <el-collapse-item title="性格 / 努力值 / 个体值（展开后实时重算）" name="sc">
              <div class="fld-row">
                <span class="lbl">性格</span>
                <el-select v-model="sc.nature" size="small" class="w170" filterable>
                  <el-option v-for="n in natures" :key="n.identifier" :value="n.identifier"
                    :label="n.name_zh + (n.up && n.up !== n.down ? '（+' + STAT_ZH[n.up] + ' -' + STAT_ZH[n.down] + '）' : '')" />
                </el-select>
                <span style="font-size:12px;color:#98a1b3;margin-left:auto">努力值合计 {{ evSum }}/510</span>
              </div>
              <div class="fld-row" v-for="k in STAT_KEYS" :key="k">
                <span class="lbl">{{ STAT_ZH[k] }}</span>
                <span class="mini">努力值</span>
                <el-input-number v-model="sc.ev[k]" :min="0" :max="252" :step="4" size="small" class="w96" />
                <span class="mini">个体值</span>
                <el-input-number v-model="sc.iv[k]" :min="0" :max="31" size="small" class="w96" />
                <span class="mini result">= <b>{{ computedStats[k] ?? "—" }}</b></span>
              </div>
            </el-collapse-item>
          </el-collapse>
        </div>

        <!-- 进化链 -->
        <div class="block">
          <h3>进化链</h3>
          <evo-chain :evo="d.evolution" :current="sid"></evo-chain>
        </div>

        <!-- 获取方式 -->
        <div class="block" id="sec-get">
          <h3>获取方式<template v-if="game">（{{ game.name_zh }}）</template></h3>
          <get-method-list :rows="d.get_methods" :extra="d.encounters_api"></get-method-list>
        </div>

        <!-- 招式表 -->
        <div class="block" id="sec-moves">
          <h3>招式表<template v-if="game">（{{ game.name_zh }}）</template></h3>
          <el-tabs v-model="tab" v-if="moves">
            <el-tab-pane v-for="t in moves.tabs" :key="t.key"
              :label="t.label + ' (' + (moves.groups[t.key] || []).length + ')'" :name="t.key">
              <el-table :data="moves.groups[t.key]" size="small" height="420" row-key="move_id">
                <el-table-column v-if="t.key === 'level' || t.key === 'evolution-recall'"
                  label="等级" width="96" sortable prop="level">
                  <template #default="{ row }">
                    <span v-if="row.recall" class="mastery">回忆</span>
                    <span v-else-if="row.evolution" class="mastery">进化</span>
                    <template v-else>Lv.{{ row.level }}<template v-if="row.mastery != null">
                      <span class="mastery">精通+{{ row.mastery }}</span></template>
                    </template>
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
                      effect="plain" :type="t2.kind === 'TR' ? 'warning' : 'info'">
                      {{ t2.kind }}{{ String(t2.number).padStart(3, "0") }}</el-tag>
                  </template>
                </el-table-column>
                <el-table-column label="招式" min-width="120" sortable prop="name_zh">
                  <template #default="{ row }">{{ row.name_zh }}</template>
                </el-table-column>
                <el-table-column label="属性" width="96">
                  <template #default="{ row }"><type-badge :types="row.type_zh"></type-badge></template>
                </el-table-column>
                <el-table-column label="分类" width="76">
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
      </div>
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
    const SEC_CHIPS = [
      { key: "basic", label: "基本", sel: "#sec-basic" },
      { key: "ability", label: "能力", sel: "#sec-ability" },
      { key: "get", label: "获取", sel: "#sec-get" },
      { key: "moves", label: "招式", sel: "#sec-moves" },
    ];
    const { ref, reactive, computed, inject, watch, onUnmounted } = Vue;
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
    const effMode = ref("defend");

    /* ---- 路由参数（响应式：翻页/换游戏原地重载，不销毁组件） ---- */
    const sid = ref(0);
    const gameId = ref("");
    let backParams = new URLSearchParams();
    function parseRoute() {
      const m = location.hash.match("#/pokemon/(\\d+)\\??(.*)");
      if (!m) return false;
      const q = new URLSearchParams((m[2] || "").split("?").pop() || "");
      const newSid = parseInt(m[1]);
      const newGame = q.get("game") || store.gameId || "";
      backParams = new URLSearchParams(q);
      const changed = newSid !== sid.value || newGame !== gameId.value;
      sid.value = newSid;
      gameId.value = newGame;
      return changed;
    }
    parseRoute();

    const game = computed(() => store.games.find((g) => g.id === gameId.value) || null);
    const curForm = computed(() => {
      if (!d.value) return { types: "", ability_list: [], height: 0, weight: 0, id: 0 };
      return d.value.forms.find((f) => f.id === formId.value) || d.value.default_form;
    });
    const formName = (f) => (f && f.is_default) ? "" : formDisplayName(f);
    /* 图鉴介绍随形态切换：形态独立介绍优先，否则沿用默认 */
    const curFlavor = computed(() => {
      if (!d.value) return [];
      const ff = d.value.form_flavor || {};
      return ff[curForm.value.id] || d.value.flavor;
    });
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

    /* ---- 种族值 + 能力值合并卡 ---- */
    const sc = reactive({
      level: 50, nature: "hardy",
      ev: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
      iv: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 },
    });
    const natureMult = computed(() => {
      const n = natures.value.find((x) => x.identifier === sc.nature);
      return (k) => {
        if (!n || !n.up || n.up === n.down) return 1.0;
        if (n.up === k) return 1.1;
        if (n.down === k) return 0.9;
        return 1.0;
      };
    });
    const computedStats = computed(() => {
      const b = baseStats.value;
      const L = sc.level;
      const out = {};
      if (b.hp == null) return out;
      out.hp = b.hp === 1 ? 1
        : Math.floor((2 * b.hp + sc.iv.hp + Math.floor(sc.ev.hp / 4)) * L / 100) + L + 10;
      for (const k of ["atk", "def", "spa", "spd", "spe"]) {
        const v = Math.floor((2 * b[k] + sc.iv[k] + Math.floor(sc.ev[k] / 4)) * L / 100) + 5;
        out[k] = Math.floor(v * natureMult.value(k));
      }
      return out;
    });
    const evSum = computed(() => Object.values(sc.ev).reduce((a, b) => a + b, 0));
    /* 该等级下的能力范围（HP：0~252 努力值；其他：0努力+性格负 ~ 252努力+性格正） */
    function rangeOf(k) {
      const b = baseStats.value[k];
      if (b == null) return "—";
      const L = sc.level;
      if (k === "hp") {
        if (b === 1) return "1";
        const lo = Math.floor((2 * b + 31) * L / 100) + L + 10;
        const hi = Math.floor((2 * b + 31 + 63) * L / 100) + L + 10;
        return `${lo}~${hi}`;
      }
      const lo = Math.floor((Math.floor((2 * b + 31) * L / 100) + 5) * 0.9);
      const hi = Math.floor((Math.floor((2 * b + 31 + 63) * L / 100) + 5) * 1.1);
      return `${lo}~${hi}`;
    }
    function pct(v) { return Math.min(100, ((v || 0) / 255) * 100) + "%"; }
    const STAT_BAR_COLOR = "#5a9be0";   /* 统一单色，不再按阈值配色 */

    /* ---- 属性相性 ---- */
    const myTypes = computed(() =>
      (curForm.value.types || "").split(",").filter(Boolean));
    const effGroups = computed(() => {
      if (!store.typeChart || !myTypes.value.length) return null;
      const mult = defenseMultipliers(myTypes.value);
      const groups = {};
      for (const [atk, m] of Object.entries(mult)) {
        const key = String(m);
        (groups[key] = groups[key] || []).push(atk);
      }
      const order = ["4", "2", "1", "0.5", "0.25", "0"];
      return order.filter((k) => groups[k]).map((k) => ({ m: k, types: groups[k] }));
    });
    /* 攻击面：自己每个属性的打击面分组 */
    function atkGroupsOf(t) {
      const chart = store.typeChart;
      if (!chart) return [];
      const groups = {};
      for (const def of chart.types) {
        const m = (chart.chart[t] || {})[def] ?? 1;
        const key = String(m);
        (groups[key] = groups[key] || []).push(def);
      }
      const order = ["2", "0.5", "0"];
      return order.filter((k) => groups[k]).map((k) => ({ m: k, types: groups[k] }));
    }
    function effClass(mm) {
      const v = parseFloat(mm);
      if (v >= 2) return "bad";
      if (v === 1) return "neutral";
      if (v === 0) return "immune";
      return "good";
    }

    /* ---- 数据加载（翻页用预取缓存 + 原地替换） ---- */
    const detailCache = new Map();   // key: sid|game -> detail payload（上限 40 条，先进先出）
    let loadToken = 0;
    async function load(silent = false) {
      const token = ++loadToken;
      if (!silent) loading.value = true;
      try {
        const suffix = pendingSuffix.value;
        const key = sid.value + "|" + gameId.value + (suffix ? "|" + suffix : "");
        if (!detailCache.has(key)) {
          const data = await apiGet("/api/pokemon/" + sid.value,
            { game: gameId.value, form: suffix || undefined,
              dex: backParams.get("dex") || undefined });
          detailCache.set(key, data);
          if (detailCache.size > 40) detailCache.delete(detailCache.keys().next().value);
        }
        if (token !== loadToken) return;
        d.value = detailCache.get(key);
        suppressMoveWatch = true;
        // 默认选中：请求带回的形态 > 默认形态
        const wantSuffix = d.value.selected_suffix || suffix;
        const want = wantSuffix
          ? d.value.forms.find((f) => (f.identifier || "").endsWith("-" + wantSuffix))
          : null;
        formId.value = (want || d.value.default_form || d.value.forms[0] || {}).id || null;
        suppressMoveWatch = false;
        try {
          await Promise.all([loadMoves(), loadNatures()]);
        } catch (_) { moves.value = null; }   // 招式失败不阻塞详情，避免新旧数据混排
      } catch (_) {
        if (token === loadToken && !silent) d.value = null;  // 详情失败显示空态
      } finally { if (token === loadToken && !silent) loading.value = false; }
    }
    function prefetchNeighbors() {
      for (const nid of [prevId.value, nextId.value]) {
        if (!nid) continue;
        const key = nid + "|" + gameId.value;
        if (!detailCache.has(key)) {
          apiGet("/api/pokemon/" + nid, { game: gameId.value })
            .then((data) => detailCache.set(key, data)).catch(() => {});
        }
      }
    }
    async function loadNatures() {
      if (!natures.value.length) {
        if (!window.__naturesCache) {
          window.__naturesCache = await apiGet("/api/meta/natures");
        }
        natures.value = window.__naturesCache;
      }
    }
    let moveToken = 0;
    let suppressMoveWatch = false;
    const pendingSuffix = ref("");   // 当前选中形态的 identifier 后缀（空=默认）
    const noAbilities = computed(() =>
      gameId.value === "legends-arceus" || gameId.value === "legends-za");
    async function loadMoves() {
      if (!gameId.value) { moves.value = null; return; }
      const token = ++moveToken;
      const res = await apiGet("/api/pokemon/" + sid.value + "/moves",
        { game: gameId.value, form_id: formId.value || undefined });
      if (token !== moveToken) return;   // 慢请求过期丢弃，防止旧形态招式表覆盖新形态
      moves.value = res;
      if (moves.value.tabs.length && !moves.value.tabs.some((t) => t.key === tab.value)) {
        tab.value = moves.value.tabs[0].key;
      }
    }
    /* 切换形态：招式表重载 + 后缀变化时详情重载（获取方式/进化链按形态过滤） */
    watch(formId, () => {
      if (!formId.value || suppressMoveWatch || !d.value) return;
      const f = (d.value.forms || []).find((x) => x.id === formId.value);
      const ident = (f && f.identifier) || "";
      const suffix = f && f.is_default ? "" : ident.split("-").slice(1).join("-");
      if (suffix !== pendingSuffix.value) {
        pendingSuffix.value = suffix;
        load(true);
      } else {
        loadMoves().catch(() => {});
      }
    });

    async function showChains(row) {
      chainDlg.value = true;
      chainLoading.value = true;
      chains.value = null;
      chainTitle.value = "生蛋链：「" + row.name_zh + "」 → " + d.value.species.name_zh;
      try {
        chains.value = await apiGet("/api/breed-chains", {
          species_id: sid.value, move_id: row.move_id, game: gameId.value,
        });
      } finally { chainLoading.value = false; }
    }
    function goBack() {
      if (gameId.value) {
        location.hash = "#/game/" + gameId.value + "/dex"
          + (backParams.get("dex") ? "?dex=" + backParams.get("dex") : "");
      } else {
        location.hash = "#/home";
      }
    }

    /* 图鉴内上一只/下一只（按当前图鉴编号顺序） */
    const navList = ref([]);
    const navIdx = computed(() => navList.value.indexOf(sid.value));
    const prevId = computed(() => (navIdx.value > 0 ? navList.value[navIdx.value - 1] : 0));
    const nextId = computed(() =>
      (navIdx.value >= 0 && navIdx.value < navList.value.length - 1)
        ? navList.value[navIdx.value + 1] : 0);
    function goNeighbor(id) {
      if (!id) return;
      const dex = backParams.get("dex");
      location.hash = "#/pokemon/" + id + "?game=" + gameId.value + (dex ? "&dex=" + dex : "");
    }
    async function loadNav() {
      const dex = backParams.get("dex");
      if (!dex) { navList.value = []; return; }
      try {
        const data = await apiGet("/api/dex/" + dex, { profile: store.profileId });
        navList.value = data.entries.map((e) => e.species_id);
      } catch (_) { /* 导航缺失不影响详情 */ }
    }

    /* hash 变化：同组件内原地重载（翻页不闪白），并平滑回顶（卸载时移除监听） */
    function onHashChange() {
      if (!location.hash.startsWith("#/pokemon/")) return;
      const changed = parseRoute();
      if (changed) {
        loadNav().then(prefetchNeighbors);
        load(true);
        const main = document.querySelector(".main");
        if (main) main.scrollTo({ top: 0, behavior: "smooth" });
      }
    }
    window.addEventListener("hashchange", onHashChange);
    onUnmounted(() => window.removeEventListener("hashchange", onHashChange));

    loadNav().then(prefetchNeighbors);
    load();

    /* 移动端分段锚点（基本/能力/获取/招式；桌面 CSS 隐藏锚点条） */
    const activeSec = ref("basic");
    function scrollSec(sec) {
      activeSec.value = sec.key;
      const el = document.querySelector(sec.sel);
      if (el) el.scrollIntoView({ behavior: "instant", block: "start" });
    }
    return {
      loading, d, sid, formId, curForm, formName, curFlavor, curEv, curDex, game, gameId,
      noAbilities,
      moves, tab, chainDlg, chainLoading, chains, chainTitle, showChains, goBack,
      baseStats, statSum, sc, natures, computedStats, evSum, STAT_ZH, STAT_KEYS,
      rangeOf, pct, STAT_BAR_COLOR,
      effMode, effGroups, effClass, myTypes, atkGroupsOf,
      navList, prevId, nextId, goNeighbor,
      SEC_CHIPS, activeSec, scrollSec,
    };
  },
};
