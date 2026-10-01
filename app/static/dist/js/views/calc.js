/* 伤害计算器（对齐 pokestats.top/calc 布局）：
   对战场：左右摘要卡（顶部太晶/极巨图标标记 + 特性 + EVs 概览 + 实际值）+ 竖列 4 招式按钮
   结果条：伤害区间 + 16 rolls + KO 回合表述
   编辑面板：宝可梦/形态（超级进化·超极巨化在此选择）→ 特性（全量）→ 太晶属性 → 道具（全量+图标）
     → 4 招式（威力自动带出）→ 种族值（只读）→ 努力值 → 性格 → 能力升降 → 等级
   招式显示名：极巨/Z/超极巨按官方名查表替换（属性→极巨名、泛用 Z 名、gmax 专属名、专属 Z 名）；
   场地区：完全复刻参考站（左右宝可梦对称状态列 8 行 × 中间场地 7 行，无列标题/组名/说明文字，
   左右列固定绑定左右宝可梦，攻守由上方招式选择决定）；「切换」= 换下场状态（被追打威力 ×2）；
   气势披带为道具（场地区不出现，由道具选择自动派生 defender_sash）。
   机制互斥：形态派生（超进化/超极巨化）与太晶/极巨/Z 标记互斥；Z 一场战斗仅一次。
   常驻性能：模块级 meta/species 缓存 + 启动预热（app 启动即发请求）+ 两侧并行初始化。 */

const MECH_LABELS = { z: "Z招式", max: "极巨化", tera: "太晶化" };

/* ---- 模块级 meta 缓存 + 启动预热（index.html 启动即加载本脚本 → 顶层立即发起，共享同一 Promise） ---- */
const _metaCache = {
  species: null, items: null, abilities: null, zMoves: null,
  maxMoves: null, gmaxMoves: null, natures: null,
};
const _metaPromises = {};
function warmMeta(key, url) {
  if (_metaCache[key]) return Promise.resolve(_metaCache[key]);
  if (!_metaPromises[key]) {
    _metaPromises[key] = apiGet(url).then((r) => {
      _metaCache[key] = r;
      delete _metaPromises[key];
      return r;
    });
  }
  return _metaPromises[key];
}
warmMeta("species", "/api/meta/species").then((r) => {
  window.__speciesNames = Object.fromEntries(r.map((x) => [x.id, x.name_zh]));
});
warmMeta("items", "/api/meta/items");
warmMeta("abilities", "/api/meta/abilities");
warmMeta("zMoves", "/api/meta/z-moves");
warmMeta("maxMoves", "/api/meta/max-moves");
warmMeta("gmaxMoves", "/api/meta/gmax-moves");
warmMeta("natures", "/api/meta/natures").then((r) => { window.__naturesCache = r; });

/* 机制图标预热（dynamax + 18 属性 + 星晶 = 20 张小图）：首次进入即现，不回源 */
for (const src of ["/assets/mechanism/dynamax.png",
  ...TYPE_LIST.map((t) => "/assets/mechanism/tera_" + t + ".png"),
  "/assets/mechanism/tera_星晶.png"]) {
  new Image().src = src;
}

/* forms/moves 每物种缓存（FIFO 上限 24；切换物种不重复回源） */
const _speciesCache = new Map();
async function fetchSpeciesData(sid) {
  if (_speciesCache.has(sid)) return _speciesCache.get(sid);
  const [forms, moves] = await Promise.all([
    apiGet("/api/calc/forms", { species_id: sid }),
    apiGet("/api/calc/moves", { species_id: sid }),
  ]);
  const data = { forms, moves };
  _speciesCache.set(sid, data);
  if (_speciesCache.size > 24) _speciesCache.delete(_speciesCache.keys().next().value);
  return data;
}

/* 物种装载（编辑面板与初始对局共用；两侧并行调用） */
async function loadSpeciesInto(s, sid) {
  s.speciesId = sid;
  s.nameZh = (window.__speciesNames || {})[sid] || "";
  s.moves = [null, null, null, null];
  s.zMarks = [false, false, false, false];
  s.moveResults = [null, null, null, null];
  s.zLocked = null;                 // 道具锁定来源："z" | "mega" | null
  s.teraOn = false;
  s.maxOn = false;
  const data = await fetchSpeciesData(sid);
  s.forms = data.forms;
  s.formId = s.forms.length ? s.forms[0].id : null;
  const f = s.forms.find(x => x.id === s.formId);
  pickDefaultAbility(s, f);
  s.moveOptions = data.moves;
  // 默认四招：优先本属性（STAB）高威力，不足补其他高威力
  const types = new Set(((f && f.types) || "").split(",").filter(Boolean));
  const damaging = s.moveOptions.filter(m => m.power).sort((a, b) => b.power - a.power);
  const stab = damaging.filter(m => types.has(m.type_zh));
  const rest = damaging.filter(m => !types.has(m.type_zh));
  const picked = [...stab, ...rest].slice(0, 4).map(m => m.move_id);
  s.moves = [0, 1, 2, 3].map(i => picked[i] != null ? picked[i] : null);
  syncFormDerived(s);
}

/* 形态派生机制：mega/超极巨化/原始回归；超极巨化自动点亮极巨化标记 */
function isMegaForm(f) { return !!(f && (f.is_mega || /-(mega|primal)/.test(f.identifier || ""))); }
function isGmaxForm(f) { return !!(f && /-gmax/.test(f.identifier || "")); }
function syncFormDerived(s) {
  const f = s.forms.find(x => x.id === s.formId);
  if (!f) return;
  if (isGmaxForm(f)) s.maxOn = true;
  if (isMegaForm(f)) { s.teraOn = false; s.maxOn = false; s.zMarks = [false, false, false, false]; }
}

function pickDefaultAbility(s, f) {
  if (!f || !f.ability_list || !f.ability_list.length) { s.ability = ""; return; }
  const own = f.ability_list.find(a => !a.hidden);
  s.ability = (own || f.ability_list[0]).name;
}

/* 专属 Z 命中（含形态后缀校验，与后端 _z_of 同语义：后缀不匹配回退泛用） */
function exclusiveZHit(s, move, zMeta) {
  const ex = ((zMeta && zMeta.exclusive) || []).find(x =>
    x.species_id === s.speciesId && x.base_move_id === move.move_id);
  if (!ex) return null;
  const suf = ex.form_suffix || "";
  if (suf) {
    const f = s.forms.find(x => x.id === s.formId);
    const ident = (f && f.identifier) || "";
    const ok = suf.split(",").some(p => {
      const q = p.trim();
      return q && (ident.endsWith("-" + q) || ident.includes("-" + q + "-"));
    });
    if (!ok) return null;
  }
  return ex;
}

const CalcView = {
  template: `
  <div>
    <div class="page-head">
      <span class="page-title">伤害计算器</span>
      <div class="spacer"></div>
    </div>

    <!-- 对战场 -->
    <div class="battlefield">
      <summary-card :side="A" :is-defender="atkSide === D" :z-meta="zMeta" :items="items"
        :max-meta="maxMeta" :gmax-meta="gmaxMeta"
        :dmg="atkSide === D ? activeResult : null"
        :active-move-idx="atkSide === A ? activeMoveIdx : -1"
        @pick-move="pickMove(A, $event)"
        @toggle-mech="toggleMechMark(A, $event)"
        @toggle-z="onZ(A, $event)"></summary-card>
      <div class="vs-badge">VS</div>
      <summary-card :side="D" :is-defender="atkSide === A" :z-meta="zMeta" :items="items"
        :max-meta="maxMeta" :gmax-meta="gmaxMeta"
        :dmg="atkSide === A ? activeResult : null"
        :active-move-idx="atkSide === D ? activeMoveIdx : -1"
        @pick-move="pickMove(D, $event)"
        @toggle-mech="toggleMechMark(D, $event)"
        @toggle-z="onZ(D, $event)"></summary-card>
    </div>

    <!-- 结果条 -->
    <div class="block result-bar" v-if="activeResult">
      <template v-if="activeResult.error">
        <el-alert type="warning" :closable="false"
          :title="activeResult.error === 'status_or_no_power'
            ? (zOnForActive ? 'Z 变化招式：状态效果不参与伤害计算' : '变化招式或缺少威力，无法计算伤害')
            : activeResult.error" />
        <div v-if="zOnForActive && activeZNote" class="z-effect-note">{{ activeZNote }}</div>
      </template>
      <template v-else>
        <div class="res-desc">{{ resultDesc }}</div>
        <div class="res-rolls">
          <span v-for="(v, i) in activeResult.rolls" :key="i" class="roll"
            :class="{lo: v === activeResult.min, hi: v === activeResult.max}">{{ v }}</span>
        </div>
        <div class="res-line">
          <el-tag effect="dark" size="small" :type="koTagType">{{ koText }}</el-tag>
          <el-tag size="small" effect="plain" style="margin-left:6px">{{ activeResult.label }}</el-tag>
          <span v-if="activeZName" class="z-effect-note" style="margin-left:10px">Z：{{ activeZName }}</span>
          <span style="margin-left:10px;color:#666">16 种随机伤害；防御方 HP {{ activeHpText }}</span>
        </div>
      </template>
    </div>

    <!-- 编辑面板（每侧）+ 场地与状态区（下部）；移动端折叠为「我方/对手/场地」手风琴 -->
    <div class="calc-editors">
      <div class="acc-item" :class="{open: acc.A}">
        <div class="acc-head" @click="acc.A = !acc.A">
          <span>我方 · {{ A.nameZh || "未选择" }}</span><span class="acc-arrow">›</span>
        </div>
        <div class="acc-body">
          <side-editor :side="A" :label="'左侧编辑 · ' + (A.nameZh || '未选择')" :species-list="speciesList"
            :items="items" :abilities="allAbilities" :z-meta="zMeta"
            @changed="onSideChanged" @mech="onMechChange"></side-editor>
        </div>
      </div>
      <div class="acc-item" :class="{open: acc.D}">
        <div class="acc-head" @click="acc.D = !acc.D">
          <span>对手 · {{ D.nameZh || "未选择" }}</span><span class="acc-arrow">›</span>
        </div>
        <div class="acc-body">
          <side-editor :side="D" :label="'右侧编辑 · ' + (D.nameZh || '未选择')" :species-list="speciesList"
            :items="items" :abilities="allAbilities" :z-meta="zMeta"
            @changed="onSideChanged" @mech="onMechChange"></side-editor>
        </div>
      </div>
      <div class="acc-item field-wrap" :class="{open: acc.F}">
        <div class="acc-head" @click="acc.F = !acc.F">
          <span>场地与状态</span><span class="acc-arrow">›</span>
        </div>
        <div class="acc-body">
          <field-panel :field="field" :sides="{atk: A, dfd: D}"
            @changed="onSideChanged"></field-panel>
        </div>
      </div>
    </div>
  </div>
  `,
  setup() {
    const { ref, reactive, computed, watch } = Vue;
    const speciesList = ref([]);
    const items = ref([]);              // [{identifier, name_zh}]
    const allAbilities = ref([]);
    const zMeta = ref({ generic: [], exclusive: [] });
    const maxMeta = ref([]);            // 极巨招式官方名 [{identifier,name_zh,type_zh,damage_class}]
    const gmaxMeta = ref([]);           // 超极巨专属 [{species_id,form_identifier,gmax_move_name,type_zh,power}]
    const atkSide = ref(null);
    const activeMoveIdx = ref(0);
    const field = reactive({ mode: "doubles", weather: "", terrain: "",
                             auras: { fairy: false, dark: false, break: false },
                             ruin: { sword: false, beads: false, tablets: false, vessel: false },
                             gravity: false, magic_room: false, wonder_room: false });

    function blankSide() {
      return reactive({
        speciesId: null, formId: null, forms: [],
        level: 50, nature: "hardy",
        evs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
        ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 },
        boosts: { atk: 0, spa: 0, def: 0, spd: 0 },
        ability: "", item: "",
        teraOn: false, teraType: "一般",
        maxOn: false, zMarks: [false, false, false, false],
        zLocked: null,                   // "z" | "mega" | null
        moves: [null, null, null, null],
        varPowers: {},
        moveOptions: [],
        moveResults: [null, null, null, null],
        lastStats: null,
        /* 场地两侧状态（气势披带 = 道具派生，不在场地区） */
        burn: false, crit: false, helping: false,
        statuses: [],                    // 中毒/剧毒/冰冻/睡眠/麻痹（仅展示）
        screen: "", friendGuard: false,
        flowerGift: false, steely: false, battery: false, powerSpot: false,
        foresight: false, tailwind: false, powerTrick: false, switching: false,
        hazards: { rocks: false, spikes: 0, saltCure: false, leechSeed: false },
      });
    }
    const A = blankSide();
    const D = blankSide();

    warmMeta("species").then((r) => { speciesList.value = r; });
    warmMeta("items").then((r) => { items.value = r; });
    warmMeta("abilities").then((r) => { allAbilities.value = r; });
    warmMeta("zMoves").then((r) => { zMeta.value = r; });
    warmMeta("maxMoves").then((r) => { maxMeta.value = r; });
    warmMeta("gmaxMoves").then((r) => { gmaxMeta.value = r; });
    const { onMounted } = Vue;
    onMounted(() => Promise.all([loadSpeciesInto(A, 445), loadSpeciesInto(D, 143)]));
    // 两侧名字兜底（species 名表预热晚于装载完成时）
    warmMeta("species").then(() => {
      A.nameZh = A.nameZh || (window.__speciesNames || {})[A.speciesId] || "";
      D.nameZh = D.nameZh || (window.__speciesNames || {})[D.speciesId] || "";
    });

    const activeResult = computed(() => {
      const s = atkSide.value;
      if (!s || s.moveResults[activeMoveIdx.value] === undefined) return null;
      return s.moveResults[activeMoveIdx.value];
    });
    const zOnForActive = computed(() => {
      const s = atkSide.value;
      return !!(s && s.zMarks[activeMoveIdx.value]);
    });
    const activeZName = computed(() => {
      const r = activeResult.value;
      return r && r.z_info && r.z_info.name ? r.z_info.name : "";
    });
    const activeZNote = computed(() => {
      const r = activeResult.value;
      return r && r.z_info && r.z_info.note ? r.z_info.note : "";
    });
    const koTagType = computed(() => {
      const r = activeResult.value;
      if (!r || r.error) return "info";
      return r.ohko ? "danger" : (r.ko && r.ko.probs && r.ko.probs[2] >= 100) ? "warning" : "info";
    });
    const koText = computed(() => {
      const r = activeResult.value;
      if (!r || r.error) return "";
      const ko = r.ko || { guaranteed_turns: null, probs: {} };
      const g = ko.guaranteed_turns;
      if (r.ohko) return "确定一击击倒";
      if (g && g > 0) return `确定 ${g} 回合击倒`;
      const p2 = ko.probs[2] || 0, p3 = ko.probs[3] || 0, p4 = ko.probs[4] || 0;
      if (p4 >= 100) return `4 回合内必击倒（保证 4 回合）`;
      if (p4 > 0) return `${Math.round(p4)}% 4 回合内击倒`;
      return "4 回合内无法击倒";
    });
    const activeHpText = computed(() => {
      const s = atkSide.value;
      if (!s) return "";
      const dfd = s === A ? D : A;
      const full = dfd.lastStats ? dfd.lastStats.hp : null;
      const r = activeResult.value;
      if (r && full && r.hp != null && r.hp < full) return `${r.hp}（钉子等进场扣减后，满血 ${full}）`;
      return full || (r ? r.hp : "");
    });

    /* 完整中文描述：性格 + 努力值 + 道具 + 攻方 招式 VS. 防守方 */
    const resultDesc = computed(() => {
      const r = activeResult.value;
      const atk = atkSide.value;
      if (!r || r.error || !atk) return "";
      const dfd = atk === A ? D : A;
      const nat = (window.__naturesCache || []).find(n => n.identifier === atk.nature);
      const move = currentMove(atk, activeMoveIdx.value);
      const physical = move && move.damage_class === "physical";
      const evTxt = (physical ? atk.evs.atk : atk.evs.spa) > 0
        ? ((physical ? atk.evs.atk : atk.evs.spa) + (physical ? "攻" : "特攻")) : "";
      const parts = [nat ? nat.name_zh : "", evTxt, atk.item, mechText(atk), sideName(atk)].filter(Boolean);
      const defEv = dfd.evs.hp > 0 ? dfd.evs.hp + "HP" : "";
      const defParts = [defEv, mechText(dfd), sideName(dfd)].filter(Boolean);
      const pct = r.pct_min === r.pct_max ? r.pct_min + "%" : r.pct_min + "~" + r.pct_max + "%";
      return parts.join(" ") + " " + (move ? move.name_zh : "") + " VS. " + defParts.join(" ")
        + "：" + r.min + "~" + r.max + "（" + pct + "）";
    });

    function sideName(s) {
      if (!s.nameZh) return "";
      const f = s.forms.find(x => x.id === s.formId);
      const fl = f ? formDisplayName(f) : "";
      return fl && f && !f.is_default && fl !== "默认形态" ? s.nameZh + "·" + fl : s.nameZh;
    }
    function mechText(s) {
      const out = [];
      if (s.teraOn) out.push("太晶(" + s.teraType + ")");
      if (s.maxOn) out.push("极巨化");
      if (s.zMarks.some(Boolean)) out.push("Z招式");
      return out.join("·");
    }
    function currentMove(side, idx) {
      return side.moveOptions.find(m => m.move_id === side.moves[idx]) || null;
    }

    function sidePayload(s) {
      return {
        species_id: s.speciesId, form_id: s.formId, level: s.level,
        nature: s.nature, evs: s.evs, ivs: s.ivs,
        boosts: s.boosts, ability: s.ability, item: s.item,
        is_dynamax: s.maxOn,
        tera_type: s.teraOn ? (s.teraType || "一般") : "",
      };
    }
    function sideFlags(s) {
      return {
        burn: s.burn, crit: s.crit, helping: s.helping,
        z_moves: s.zMarks.map(Boolean),
        screen: s.screen,
        sash: s.item === "气势披带",          // 披带为道具：由装备自动派生
        friend_guard: s.friendGuard,
        flower_gift: s.flowerGift, steely: s.steely, battery: s.battery,
        power_spot: s.powerSpot, foresight: s.foresight, power_trick: s.powerTrick,
        switching: s.switching,               // 换下场状态：被追打威力 ×2
        hazards: {
          rocks: s.hazards.rocks, spikes: s.hazards.spikes || 0,
          salt_cure: s.hazards.saltCure, leech_seed: s.hazards.leechSeed,
        },
      };
    }

    /* ---- 全量重算（batch：一次 8 招） ---- */
    let recalcTimer = null;
    let recalcToken = 0;
    function scheduleRecalc() { clearTimeout(recalcTimer); recalcTimer = setTimeout(recalcAll, 400); }
    async function recalcAll() {
      const token = ++recalcToken;
      if (!A.speciesId || !D.speciesId) return;
      try {
        const resp = await apiSend("POST", "/api/calc/batch", {
          attacker: sidePayload(A), defender: sidePayload(D),
          moves: {
            atk: A.moves.map((x, i) => x ? { id: x, power: A.varPowers[x] || undefined } : null),
            dfd: D.moves.map((x, i) => x ? { id: x, power: D.varPowers[x] || undefined } : null),
          },
          field: {
            mode: field.mode, weather: field.weather, terrain: field.terrain,
            auras: field.auras.fairy || field.auras.dark || field.auras.break ? field.auras : undefined,
            ruin: Object.values(field.ruin).some(Boolean) ? field.ruin : undefined,
            gravity: field.gravity || undefined,
            magic_room: field.magic_room || undefined,
            wonder_room: field.wonder_room || undefined,
          },
          sides: { atk: sideFlags(A), dfd: sideFlags(D) },
        });
        if (token !== recalcToken) return;
        A.moveResults = resp.atk.results;
        D.moveResults = resp.dfd.results;
        A.lastStats = resp.atk.stats;
        D.lastStats = resp.dfd.stats;
        A.hazardHp = resp.hazard_hp.atk;
        D.hazardHp = resp.hazard_hp.dfd;
      } catch (e) {
        if (token === recalcToken) {
          const msg = String(e.message || e);
          [A, D].forEach(s => s.moveResults = s.moveResults.map(() => ({ error: msg })));
        }
      }
      if (token === recalcToken && !atkSide.value && A.moves[0] != null) {
        atkSide.value = A;
        activeMoveIdx.value = 0;
      }
    }
    function pickMove(side, idx) {
      atkSide.value = side;
      activeMoveIdx.value = idx;
    }
    function onSideChanged() { scheduleRecalc(); }
    function onMechChange(s) { scheduleRecalc(); }

    watch(field, scheduleRecalc, { deep: true });
    watch(A, scheduleRecalc, { deep: true });
    watch(D, scheduleRecalc, { deep: true });

    /* 移动端手风琴开合（桌面忽略） */
    const acc = reactive({ A: false, D: false, F: false });
    return {
      A, D, field, speciesList, items, allAbilities, zMeta, maxMeta, gmaxMeta,
      acc, atkSide, activeMoveIdx, activeResult, activeZName, activeZNote, zOnForActive,
      resultDesc, koText, koTagType, activeHpText,
      pickMove, onSideChanged, onMechChange, MECH_LABELS,
      toggleMechMark, onZ: (s, idx) => { toggleZMark(s, idx, items.value, zMeta.value); scheduleRecalc(); },
    };
  },
};

/* ---- 对战场摘要卡 ---- */
const SummaryCard = {
  props: ["side", "isDefender", "dmg", "activeMoveIdx", "zMeta", "items", "maxMeta", "gmaxMeta"],
  emits: ["pick-move", "toggle-mech", "toggle-z"],
  template: `
  <div class="sum-card" :class="{defending: isDefender}">
    <div class="sum-top">
      <div class="sum-art">
        <img v-if="side.formId" class="poke-img" :key="side.formId" :src="'/sprites/' + side.formId + '.png'"
          :style="{width: '96px', height: '96px'}" loading="lazy"
          onerror="this.classList.add('img-missing')">
      </div>
      <div class="sum-info">
        <div class="sum-name">{{ sideName || "选择宝可梦" }}</div>
        <type-badge :types="types"></type-badge>
        <div class="sum-marks">
          <img class="mech-icon" :class="{on: side.teraOn}" :src="teraIcon" :title="'太晶化 · ' + side.teraType"
            @click="$emit('toggle-mech', 'tera')">
          <img class="mech-icon" :class="{on: side.maxOn}" src="/assets/mechanism/dynamax.png"
            title="极巨化" @click="$emit('toggle-mech', 'max')">
        </div>
        <div class="sum-tags">
          <el-tag v-if="side.ability" size="small" effect="plain">{{ side.ability }}</el-tag>
          <el-tag v-if="side.item" size="small" effect="plain" type="warning">{{ side.item }}</el-tag>
          <el-tag v-if="side.teraOn" size="small" effect="dark"
            :style="{background: 'var(--type-' + side.teraType + ')', borderColor: 'var(--type-' + side.teraType + ')'}">
            太晶·{{ side.teraType }}</el-tag>
          <el-tag v-if="side.maxOn" size="small" effect="dark" type="danger">极巨化</el-tag>
        </div>
        <div class="sum-ev" v-if="evSummary">{{ evSummary }}</div>
        <div class="sum-stats" v-if="side.lastStats">Lv.{{ side.level }}：
          <span v-for="k in STAT_KEYS" :key="k" class="ss">{{ STAT_ZH[k] }}{{ side.lastStats[k] }}{{ boostMark(k) }}</span>
        </div>
        <div class="hp-bar" v-if="isDefender && dmg && !dmg.error">
          <div class="hp-fill" :style="{right: (100 - Math.min(100, dmg.pct_max)) + '%'}"></div>
          <span class="hp-txt" v-if="dmg.pct_max >= 100">击倒！</span>
        </div>
      </div>
    </div>
    <div class="sum-moves">
      <div v-for="(m, i) in 4" :key="i" class="move-btn" :class="{active: activeMoveIdx === i}"
        @click="$emit('pick-move', i)">
        <move-chip :side="side" :idx="i" :z-meta="zMeta" :items="items"
          :max-meta="maxMeta" :gmax-meta="gmaxMeta"
          @toggle-z="$emit('toggle-z', $event)"></move-chip>
      </div>
    </div>
  </div>
  `,
  setup(props, { emit }) {
    const { computed } = Vue;
    const sideName = computed(() => {
      const s = props.side;
      if (!s.nameZh) return "";
      const f = s.forms.find(x => x.id === s.formId);
      const fl = f ? formDisplayName(f) : "";
      const isDefault = f && f.is_default;
      return fl && !isDefault && fl !== "默认形态" ? s.nameZh + "·" + fl : s.nameZh;
    });
    const types = computed(() => {
      const f = props.side.forms.find(x => x.id === props.side.formId);
      return (f && f.types) || "";
    });
    const teraIcon = computed(() => {
      const t = props.side.teraType === "星晶" ? "星晶" : props.side.teraType;
      return "/assets/mechanism/tera_" + t + ".png";
    });
    /* EV 摘要行：252攻/196+/0- 风格（+/- 为性格升降） */
    const evSummary = computed(() => {
      const s = props.side;
      const n = (window.__naturesCache || []).find(x => x.identifier === s.nature);
      return STAT_KEYS.map(k => {
        const mark = n && n.up === k ? "+" : n && n.down === k ? "-" : "";
        const ev = s.evs[k] ? s.evs[k] : "";
        return ev + mark || mark || "";
      }).filter(Boolean).join(" / ");
    });
    function boostMark(k) {
      const b = props.side.boosts;
      const v = k === "atk" ? b.atk : k === "spa" ? b.spa : k === "def" ? b.def : k === "spd" ? b.spd : 0;
      return v > 0 ? "(+" + v + ")" : v < 0 ? "(" + v + ")" : "";
    }
    return { sideName, types, teraIcon, evSummary, boostMark, STAT_KEYS, STAT_ZH };
  },
};

/* 招式槽（名称 + Z 标记纯晶图标 + 伤害百分比区间）
   显示名规则（对齐 @smogon/calc 查表替换）：极巨=属性→极巨官方名（变化招=极巨防壁），
   gmax 形态属性命中→超极巨官方名；Z（伤害招）=专属命中→专属名，否则泛用属性名。 */
const MoveChip = {
  props: ["side", "idx", "zMeta", "items", "maxMeta", "gmaxMeta"],
  template: `
  <div class="move-chip" :class="{empty: !move}">
    <template v-if="move">
      <img class="z-mark" :class="{on: zOn}" :src="zIcon" :title="zTitle" @click.stop="$emit('toggle-z', idx)">
      <div class="mc-main">
        <span class="mc-name">{{ displayName }}</span>
        <span class="mc-meta">{{ move.type_zh }} {{ powerLabel }}</span>
      </div>
      <span class="mc-dmg" v-if="res && !res.error">{{ res.pct_min === res.pct_max ? res.pct_max + "%" : res.pct_min + "~" + res.pct_max + "%" }}</span>
      <span class="mc-dmg miss" v-else-if="res && res.error">—</span>
      <span class="mc-dmg" v-else></span>
    </template>
    <span v-else class="mc-empty">招式 {{ idx + 1 }}</span>
  </div>`,
  emits: ["toggle-z"],
  setup(props) {
    const { computed } = Vue;
    const move = computed(() =>
      props.side.moveOptions.find(m => m.move_id === props.side.moves[props.idx]) || null);
    const zOn = computed(() => !!props.side.zMarks[props.idx]);
    const res = computed(() => props.side.moveResults[props.idx]);
    /* 极巨名映射：type_zh → 官方名（max-guard status/极巨攻击 一般共用「一般」键，status 单判） */
    const maxNameMap = computed(() => {
      const map = {};
      for (const m of (props.maxMeta || [])) map[m.type_zh] = m.name_zh;
      return map;
    });
    /* 本侧 gmax 专属（形态 identifier 命中） */
    const gmaxInfo = computed(() => {
      const s = props.side;
      const f = s.forms.find(x => x.id === s.formId);
      const ident = (f && f.identifier) || "";
      if (!ident.endsWith("-gmax")) return null;
      return (props.gmaxMeta || []).find(g => g.form_identifier === ident) || null;
    });
    const exclusiveZ = computed(() => {
      const m = move.value;
      return m ? exclusiveZHit(props.side, m, props.zMeta) : null;
    });
    const displayName = computed(() => {
      const m = move.value;
      const s = props.side;
      if (!m) return "";
      if (s.maxOn) {
        if (m.damage_class === "status") return "极巨防壁";
        const g = gmaxInfo.value;
        if (g && g.type_zh === m.type_zh) return g.gmax_move_name;
        return maxNameMap.value[m.type_zh] || m.name_zh;
      }
      if (s.zMarks[props.idx] && m.power) {
        const ex = exclusiveZ.value;
        if (ex) return ex.z_move_name;
        const gz = ((props.zMeta && props.zMeta.generic) || []).find(x => x.type === m.type_zh);
        if (gz) return gz.z_move_name;
      }
      return m.name_zh;
    });
    const powerLabel = computed(() => {
      const m = move.value;
      const s = props.side;
      if (!m) return "";
      if (!m.power) return m.damage_class === "status" ? "变化" : "—";
      if (s.maxOn) return "威力自动";
      if (s.zMarks[props.idx]) {
        const ex = exclusiveZ.value;
        if (ex && ex.power) return ex.power;
        return "威力自动";
      }
      return m.power;
    });
    /* Z 纯晶图标：专属命中（含后缀校验）→ 专属纯晶；否则按招式属性的泛用纯晶 */
    const zIcon = computed(() => {
      const meta = props.zMeta || { generic: [], exclusive: [] };
      const m = move.value;
      if (!m) return "";
      const ex = exclusiveZ.value;
      if (ex && iconOf(ex.crystal_identifier)) return iconOf(ex.crystal_identifier);
      const g = (meta.generic || []).find(x => x.type === m.type_zh);
      return iconOf(g ? g.crystal_identifier : "");
    });
    function iconOf(ident) {
      return ident ? "/sprites/items/" + ident + ".png" : "";
    }
    const zTitle = computed(() => zOn.value ? "Z 招式已点亮（点击熄灭）" : "点亮 Z 招式（自动装备对应 Z 纯晶）");
    return { move, zOn, res, displayName, powerLabel, zIcon, zTitle };
  },
};

/* ---- 编辑面板 ---- */
const SideEditor = {
  props: ["side", "label", "speciesList", "items", "abilities", "zMeta"],
  emits: ["changed", "mech"],
  template: `
  <div class="block side-editor">
    <h3>{{ label }}</h3>
    <div class="fld-row">
      <el-select :model-value="side.speciesId" filterable placeholder="搜索宝可梦（全图鉴）"
        style="flex:1" @change="onSpecies">
        <el-option v-for="s in speciesList" :key="s.id" :value="s.id"
          :label="s.name_zh + ' #' + String(s.id).padStart(4, '0')">
          <span>{{ s.name_zh }}</span>
          <span style="float:right;color:#999;font-size:12px">#{{ String(s.id).padStart(4, '0') }}</span>
        </el-option>
      </el-select>
    </div>
    <div class="fld-row" v-if="side.forms.length > 1">
      <span class="lbl">形态</span>
      <el-select v-model="side.formId" size="small" style="flex:1" @change="onForm">
        <el-option v-for="f in side.forms" :key="f.id" :value="f.id"
          :label="formLabel(f)" />
      </el-select>
      <span v-if="megaStone" class="stone-lock" :title="'超级进化形态自动装备：' + megaStone">🔒 {{ megaStone }}</span>
    </div>

    <div class="fld-row">
      <span class="lbl">特性</span>
      <el-select v-model="side.ability" size="small" filterable clearable style="flex:1" @change="onItemOrAbility">
        <el-option-group label="自身特性">
          <el-option v-for="a in ownAbilities" :key="'o' + a.name" :value="a.name"
            :label="a.name + (a.hidden ? '（隐藏）' : '')" />
        </el-option-group>
        <el-option-group label="全部特性">
          <el-option v-for="a in abilities" :key="a" :value="a" :label="a" />
        </el-option-group>
      </el-select>
    </div>
    <div class="fld-row">
      <span class="lbl">太晶属性</span>
      <el-select v-model="side.teraType" size="small" style="width:110px" @change="$emit('changed')">
        <el-option v-for="t in TYPE_LIST" :key="t" :value="t" :label="t" />
        <el-option value="星晶" label="星晶" />
      </el-select>
      <span class="lbl" style="margin-left:8px">道具</span>
      <el-select v-model="side.item" size="small" clearable filterable style="flex:1"
        :filter-method="filterItems" @change="onItemChange" @visible-change="onItemsOpen">
        <el-option v-for="i in shownItems" :key="i.identifier" :value="i.name_zh" :label="i.name_zh">
          <img class="item-icon" :src="'/sprites/items/' + i.identifier + '.png'"
            onerror="this.style.visibility='hidden'">
          <span>{{ i.name_zh }}</span>
        </el-option>
      </el-select>
    </div>

    <div class="editor-moves">
      <div v-for="i in 4" :key="i" class="fld-row">
        <span class="lbl">招式{{ i }}</span>
        <el-select :model-value="side.moves[i - 1]" filterable clearable size="small"
          style="flex:1" placeholder="搜索招式（含变化招式）" @change="setMove(i - 1, $event)"
          @focus="ensureMoves">
          <el-option v-for="m in side.moveOptions" :key="m.move_id" :value="m.move_id"
            :label="m.name_zh">
            <span>{{ m.name_zh }}</span>
            <span style="float:right;color:#999;font-size:12px">{{ m.type_zh }} · {{ clsName(m.damage_class) }} · {{ m.power || (m.damage_class === 'status' ? '变化' : '—') }} · 世代{{ m.gens.join(",") }}</span>
          </el-option>
        </el-select>
        <el-input-number v-if="needsPower(side.moves[i - 1])" size="small" style="width:96px"
          :min="1" :max="250" v-model="side.varPowers[side.moves[i - 1]]" placeholder="威力"
          @change="$emit('changed')" />
        <span v-else class="mv-power">{{ movePowerOf(side.moves[i - 1]) }}</span>
      </div>
    </div>

    <div class="stat-table">
      <div class="st-head"><span></span><span>种族</span><span>努力值</span><span>实际值</span></div>
      <div v-for="k in STAT_KEYS" :key="k" class="st-row">
        <span class="st-k">{{ STAT_ZH[k] }}</span>
        <span class="st-base">{{ baseOf(k) ?? "—" }}</span>
        <el-slider v-model="side.evs[k]" :min="0" :max="252" :step="4" :show-tooltip="false"
          style="flex:1;margin:0 8px" @change="$emit('changed')"></el-slider>
        <span class="st-ev">{{ side.evs[k] }}</span>
        <span class="st-actual">{{ side.lastStats ? side.lastStats[k] : "—" }}</span>
      </div>
      <div class="ev-left">剩余努力值 {{ evLeft }}/510</div>
    </div>

    <div class="fld-row">
      <span class="lbl">性格</span>
      <el-select v-model="side.nature" size="small" filterable style="flex:1" @change="$emit('changed')">
        <el-option v-for="n in natures" :key="n.identifier" :value="n.identifier"
          :label="n.name_zh + (n.up && n.up !== n.down ? '（+' + STAT_ZH[n.up] + ' -' + STAT_ZH[n.down] + '）' : '')" />
      </el-select>
      <span class="lbl" style="margin-left:8px">等级</span>
      <el-input-number v-model="side.level" :min="1" :max="100" size="small" style="width:92px" @change="$emit('changed')" />
    </div>
    <div class="fld-row">
      <span class="lbl">攻击升降</span>
      <el-select :model-value="side.boosts.atk" size="small" style="width:72px"
        @update:model-value="setBoost('atk', $event)">
        <el-option v-for="k in BOOST_RANGE" :key="k" :value="k" :label="k > 0 ? '+' + k : k" />
      </el-select>
      <span class="lbl">特攻</span>
      <el-select :model-value="side.boosts.spa" size="small" style="width:72px"
        @update:model-value="setBoost('spa', $event)">
        <el-option v-for="k in BOOST_RANGE" :key="k" :value="k" :label="k > 0 ? '+' + k : k" />
      </el-select>
      <span class="lbl">防御</span>
      <el-select :model-value="side.boosts.def" size="small" style="width:72px"
        @update:model-value="setBoost('def', $event)">
        <el-option v-for="k in BOOST_RANGE" :key="k" :value="k" :label="k > 0 ? '+' + k : k" />
      </el-select>
      <span class="lbl">特防</span>
      <el-select :model-value="side.boosts.spd" size="small" style="width:72px"
        @update:model-value="setBoost('spd', $event)">
        <el-option v-for="k in BOOST_RANGE" :key="k" :value="k" :label="k > 0 ? '+' + k : k" />
      </el-select>
    </div>
  </div>
  `,
  setup(props, { emit }) {
    const { ref, computed } = Vue;
    const natures = ref([]);
    warmMeta("natures").then((r) => { natures.value = r; });
    const itemQuery = ref("");
    const shownItems = ref([]);   // 过滤后渲染的子集（2127 全量渲染会卡）
    function resetItems() {
      shownItems.value = (props.items || []).slice(0, 80);
    }
    function filterItems(q) {
      itemQuery.value = q || "";
      const all = props.items || [];
      if (!q) { resetItems(); return; }
      const s = q.toLowerCase();
      shownItems.value = all.filter(i => i.name_zh.includes(q) || i.identifier.toLowerCase().includes(s)).slice(0, 80);
    }
    function onItemsOpen(open) { if (open && !itemQuery.value) resetItems(); }
    resetItems();

    const ownAbilities = computed(() => {
      const f = props.side.forms.find(x => x.id === props.side.formId);
      return (f && f.ability_list) || [];
    });
    /* 超级进化形态 → 进化石道具名（按「{种族名}进化石」模糊匹配；烈空坐无石不锁） */
    const megaStone = computed(() => {
      const s = props.side;
      const f = s.forms.find(x => x.id === s.formId);
      if (!f || !isMegaForm(f) || (f.identifier || "").startsWith("rayquaza")) return "";
      if (s.zLocked !== "mega") return "";
      return s.item || "";
    });

    async function onSpecies(sid) {
      await loadSpeciesInto(props.side, sid);
      emit("changed");
    }
    function onForm() {
      const s = props.side;
      const f = s.forms.find(x => x.id === s.formId);
      pickDefaultAbility(s, f);
      // 超级进化形态：自动锁定对应进化石（烈空坐例外——校验画龙点睛）
      s.zLocked = null;
      if (f && isMegaForm(f) && !(f.identifier || "").startsWith("rayquaza")) {
        const stone = findStone(f);
        if (stone) { s.item = stone; s.zLocked = "mega"; }
      } else if (f && (f.identifier || "").startsWith("rayquaza-mega")) {
        ensureDragonAscent(s);
      }
      syncFormDerived(s);
      pruneMoves(s);
      emit("changed");
      if (s.maxOn) emit("mech", s);
    }
    /* 进化石按「{种族名}进化石(Ｘ/Ｙ)」匹配；Z-A 新超进化无石数据不锁定 */
    function findStone(f) {
      const sp = props.side.nameZh;
      if (!sp) return "";
      const suf = /mega-x$/.test(f.identifier || "") ? "Ｘ"
        : /mega-y$/.test(f.identifier || "") ? "Ｙ" : "";
      const hit = (props.items || []).find(i =>
        i.name_zh === sp + "进化石" + suf || (suf === "" && i.name_zh === sp + "进化石"));
      return hit ? hit.name_zh : "";
    }
    function ensureDragonAscent(s) {
      const has = s.moveOptions.some(m => m.name_zh === "画龙点睛")
        && s.moves.some(id => s.moveOptions.some(m => m.move_id === id && m.name_zh === "画龙点睛"));
      if (!has) {
        const da = s.moveOptions.find(m => m.name_zh === "画龙点睛");
        if (da) {
          s.moves[0] = da.move_id;
          ElementPlus.ElMessage({ message: "烈空座超级进化需要「画龙点睛」，已自动替换招式 1", type: "warning", duration: 2500 });
        }
      }
    }
    function onItemChange() {
      // 手动改道具：解除 Z/进化石锁定（Z 标记随之熄灭）
      const s = props.side;
      if (s.zLocked === "z") s.zMarks = [false, false, false, false];
      if (s.zLocked === "z" || s.zLocked === "mega") s.zLocked = null;
      emit("changed");
    }
    function pruneMoves(s) {
      s.moves = s.moves.map(id => (id != null && s.moveOptions.some(m => m.move_id === id)) ? id : null);
    }
    function ensureMoves() {
      if (!props.side.moveOptions.length && props.side.speciesId) {
        fetchSpeciesData(props.side.speciesId).then((d) => {
          if (!props.side.moveOptions.length) props.side.moveOptions = d.moves;
        });
      }
    }
    function setMove(idx, mid) {
      props.side.moves[idx] = mid;
      emit("changed");
    }
    function setBoost(k, v) { props.side.boosts[k] = v; emit("changed"); }
    function baseOf(k) {
      const f = props.side.forms.find(x => x.id === props.side.formId);
      return f ? f[k] : null;
    }
    function movePowerOf(mid) {
      const m = props.side.moveOptions.find(x => x.move_id === mid);
      if (!m) return "";
      return m.power ? ("威力 " + m.power) : (m.damage_class === "status" ? "变化" : "变动威力");
    }
    function needsPower(mid) {
      const m = props.side.moveOptions.find(x => x.move_id === mid);
      return !!(m && !m.power && m.damage_class !== "status");
    }
    function formLabel(f) {
      const fl = formDisplayName(f);
      return (fl && fl !== "默认形态" ? fl : "默认形态") + (f.is_mega || /-mega|-gmax|-primal/.test(f.identifier || "") ? " ⭐" : "");
    }
    function clsName(c) { return { physical: "物理", special: "特殊", status: "变化" }[c] || c; }
    const evLeft = computed(() => 510 - Object.values(props.side.evs).reduce((a, b) => a + b, 0));
    return {
      natures, shownItems, ownAbilities, megaStone,
      onSpecies, onForm, onItemChange, setMove, setBoost, ensureMoves, needsPower,
      baseOf, movePowerOf, formLabel, clsName, filterItems, onItemsOpen, evLeft,
      STAT_KEYS, STAT_ZH, TYPE_LIST, formDisplayName,
      BOOST_RANGE: [-6, -5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5, 6],
    };
  },
};

/* ---- 场地与状态区（完全复刻参考站：左状态列 8 行 / 场地 7 行 / 右状态列 8 行） ----
   左右列固定绑定左右宝可梦（不随攻守换边、无任何角色文字）；攻守由上方招式选择决定。
   灼伤参与计算（burn）；中毒/剧毒/冰冻/睡眠/麻痹与顺风为前端展示态（速度序不在伤害模型内）；
   壁与撒菱为单选语义，其余多选；「切换」= 换下场状态（被追打威力 ×2）；
   气势披带不在场地区（道具派生，见 sideFlags）。 */

const SCREENS = [
  { v: "reflect", t: "反射壁" }, { v: "light_screen", t: "光墙" }, { v: "aurora", t: "极光幕" }];
const SHOW_STATUSES = ["中毒", "剧毒", "冰冻", "睡眠", "麻痹"];
function toggleStatus(s, st) {
  const i = s.statuses.indexOf(st);
  if (i >= 0) s.statuses.splice(i, 1);
  else s.statuses.push(st);
}

/* 双侧状态行配置（左右列共用同一份，逐行逐键与参考站一致） */
const SIDE_ROWS = [
  { items: [
    { t: "灼伤", get: s => s.burn, set: s => { s.burn = !s.burn; } },
    ...SHOW_STATUSES.map(st => ({
      t: st, get: s => s.statuses.includes(st), set: s => toggleStatus(s, st) })),
  ]},
  { items: [
    ...SCREENS.map(x => ({ t: x.t, get: s => s.screen === x.v,
      set: s => { s.screen = s.screen === x.v ? "" : x.v; } })),
    { t: "友情防守", get: s => s.friendGuard, set: s => { s.friendGuard = !s.friendGuard; } },
  ]},
  { items: [
    { t: "击中要害", get: s => s.crit, set: s => { s.crit = !s.crit; } },
  ], grow: true },
  { items: [
    { t: "帮助", get: s => s.helping, set: s => { s.helping = !s.helping; } },
    { t: "钢之意志", get: s => s.steely, set: s => { s.steely = !s.steely; } },
    { t: "蓄电池", get: s => s.battery, set: s => { s.battery = !s.battery; } },
    { t: "能量点", get: s => s.powerSpot, set: s => { s.powerSpot = !s.powerSpot; } },
  ]},
  { hazard: true },   // 隐形岩宽按钮 + 撒菱 1|2|3 连体分段
  { items: [
    { t: "寄生种子", get: s => s.hazards.leechSeed, set: s => { s.hazards.leechSeed = !s.hazards.leechSeed; } },
    { t: "盐淹", get: s => s.hazards.saltCure, set: s => { s.hazards.saltCure = !s.hazards.saltCure; } },
  ]},
  { items: [
    { t: "力量戏法", get: s => s.powerTrick, set: s => { s.powerTrick = !s.powerTrick; } },
    { t: "被识破", get: s => s.foresight, set: s => { s.foresight = !s.foresight; } },
  ]},
  { items: [
    { t: "花之礼", get: s => s.flowerGift, set: s => { s.flowerGift = !s.flowerGift; } },
    { t: "顺风", get: s => s.tailwind, set: s => { s.tailwind = !s.tailwind; } },
    { t: "切换", get: s => s.switching, set: s => { s.switching = !s.switching; } },
  ]},
];

/* 单侧状态列（左右共用 SIDE_ROWS 渲染，8 行） */
const SideStatusCol = {
  props: ["side"],
  emits: ["changed"],
  template: `
  <div class="fp-col">
    <div v-for="(row, ri) in SIDE_ROWS" :key="ri" class="fp-row" :class="{grow: row.grow}">
      <template v-if="row.hazard">
        <button class="fp-btn fp-w55" :class="{on: side.hazards.rocks}"
          @click="side.hazards.rocks = !side.hazards.rocks; $emit('changed')">隐形岩</button>
        <div class="fp-seg fp-grow">
          <span class="fp-seg-label">撒菱</span>
          <button v-for="n in 3" :key="n" class="fp-btn seg" :class="{on: side.hazards.spikes === n}"
            @click="side.hazards.spikes = side.hazards.spikes === n ? 0 : n; $emit('changed')">{{ n }}</button>
        </div>
      </template>
      <template v-else>
        <button v-for="it in row.items" :key="it.t" class="fp-btn" :class="{on: it.get(side)}"
          @click="it.set(side); $emit('changed')">{{ it.t }}</button>
      </template>
    </div>
  </div>
  `,
  setup() { return { SIDE_ROWS }; },
};

const FieldPanel = {
  props: ["field", "sides"],
  emits: ["changed"],
  template: `
  <div class="block field-panel">
    <div class="fp-grid5">
      <side-status-col :side="sides.atk" @changed="$emit('changed')"></side-status-col>
      <div class="fp-col fp-center">
        <div class="fp-row">
          <div class="fp-seg fp-grow">
            <button class="fp-btn seg" :class="{on: field.mode === 'singles'}"
              @click="field.mode = 'singles'; $emit('changed')">单打</button>
            <button class="fp-btn seg" :class="{on: field.mode === 'doubles'}"
              @click="field.mode = 'doubles'; $emit('changed')">双打</button>
          </div>
        </div>
        <div class="fp-row">
          <button v-for="w in WEATHER4" :key="w.v" class="fp-btn" :class="{on: field.weather === w.v}"
            @click="field.weather = field.weather === w.v ? '' : w.v; $emit('changed')">{{ w.t }}</button>
        </div>
        <div class="fp-row fp-inset">
          <button v-for="w in WEATHER3" :key="w.v" class="fp-btn" :class="{on: field.weather === w.v}"
            @click="field.weather = field.weather === w.v ? '' : w.v; $emit('changed')">{{ w.t }}</button>
        </div>
        <div class="fp-row">
          <button v-for="t in TERRAINS" :key="t.v" class="fp-btn" :class="{on: field.terrain === t.v}"
            @click="field.terrain = field.terrain === t.v ? '' : t.v; $emit('changed')">{{ t.t }}</button>
        </div>
        <div class="fp-row">
          <button v-for="a in AURAS" :key="a.v" class="fp-btn" :class="{on: field.auras[a.v]}"
            @click="field.auras[a.v] = !field.auras[a.v]; $emit('changed')">{{ a.t }}</button>
        </div>
        <div class="fp-row">
          <button v-for="r in RUINS" :key="r.v" class="fp-btn fp-btn-2l" :class="{on: field.ruin[r.v]}"
            @click="field.ruin[r.v] = !field.ruin[r.v]; $emit('changed')">
            <span class="l1">{{ r.t }}</span><span class="l2">{{ r.eff }}</span>
          </button>
        </div>
        <div class="fp-row">
          <button class="fp-btn" :class="{on: field.gravity}"
            @click="field.gravity = !field.gravity; $emit('changed')">重力</button>
          <button class="fp-btn" :class="{on: field.magic_room}"
            @click="field.magic_room = !field.magic_room; $emit('changed')">魔法空间</button>
          <button class="fp-btn" :class="{on: field.wonder_room}"
            @click="field.wonder_room = !field.wonder_room; $emit('changed')">奇妙空间</button>
        </div>
      </div>
      <side-status-col :side="sides.dfd" @changed="$emit('changed')"></side-status-col>
    </div>
  </div>
  `,
  setup() {
    const WEATHER4 = [
      { v: "sun", t: "晴天" }, { v: "rain", t: "雨天" },
      { v: "sand", t: "沙暴" }, { v: "snow", t: "雪天" }];
    const WEATHER3 = [
      { v: "harsh_sun", t: "大日照" }, { v: "harsh_rain", t: "大雨" }, { v: "air", t: "乱流" }];
    const TERRAINS = [
      { v: "electric", t: "电气场地" }, { v: "grassy", t: "青草场地" },
      { v: "psychic", t: "精神场地" }, { v: "mist", t: "薄雾场地" }];
    const AURAS = [
      { v: "break", t: "气场破坏" }, { v: "fairy", t: "妖精气场" }, { v: "dark", t: "暗黑气场" }];
    const RUINS = [
      { v: "sword", t: "灾祸之剑", eff: "(-防御)" },
      { v: "beads", t: "灾祸之玉", eff: "(-特防)" },
      { v: "tablets", t: "灾祸之简", eff: "(-攻击)" },
      { v: "vessel", t: "灾祸之鼎", eff: "(-特攻)" }];
    return { WEATHER4, WEATHER3, TERRAINS, AURAS, RUINS };
  },
};

/* Z 标记切换（CalcView 统一处理机制互斥） */
function toggleZMark(s, idx, items, zMeta) {
  const f = s.forms.find(x => x.id === s.formId);
  if (isMegaForm(f) || isGmaxForm(f)) {
    ElementPlus.ElMessage({ message: "已选择超级进化/超极巨化形态，与 Z 招式互斥：请先改回普通形态", type: "warning", duration: 2500 });
    return;
  }
  if (s.maxOn || s.teraOn) {
    ElementPlus.ElMessage({ message: "极巨化/太晶化与 Z 招式同侧互斥：请先关闭当前机制", type: "warning", duration: 2500 });
    return;
  }
  const on = !s.zMarks[idx];
  if (on) {
    s.zMarks = [false, false, false, false];   // 一场战斗仅一次 Z 力量
    s.zMarks[idx] = true;
    const m = s.moveOptions.find(x => x.move_id === s.moves[idx]);
    if (m) {
      const stone = zCrystalFor(s, m, items, zMeta);
      if (stone) { s.item = stone; s.zLocked = "z"; }
    }
  } else {
    s.zMarks[idx] = false;
    if (s.zLocked === "z") { s.zLocked = null; s.item = ""; }
  }
}

function zCrystalFor(s, move, items, zMeta) {
  if (!items || !zMeta) return "";
  const ex = exclusiveZHit(s, move, zMeta);
  const ident = ex ? ex.crystal_identifier : (() => {
    const g = (zMeta.generic || []).find(x => x.type === move.type_zh);
    return g ? g.crystal_identifier : "";
  })();
  if (!ident) return "";
  const hit = items.find(i => i.identifier === ident);
  return hit ? hit.name_zh : "";
}

/* 机制标记切换（太晶/极巨；Z 在 MoveChip 层） */
function toggleMechMark(s, mech) {
  const f = s.forms.find(x => x.id === s.formId);
  if (isMegaForm(f)) {
    ElementPlus.ElMessage({ message: "已选择超级进化形态，与" + MECH_LABELS[mech] + "互斥：请先改回普通形态", type: "warning", duration: 2500 });
    return;
  }
  if (mech === "tera") {
    if (s.maxOn || s.zMarks.some(Boolean)) {
      ElementPlus.ElMessage({ message: "极巨化/Z招式与太晶化同侧互斥：请先关闭当前机制", type: "warning", duration: 2500 });
      return;
    }
    s.teraOn = !s.teraOn;
  } else if (mech === "max") {
    if (s.teraOn || s.zMarks.some(Boolean)) {
      ElementPlus.ElMessage({ message: "太晶化/Z招式与极巨化同侧互斥：请先关闭当前机制", type: "warning", duration: 2500 });
      return;
    }
    s.maxOn = !s.maxOn;
  }
}

/* 注册子组件（定义顺序在 CalcView 之后，运行时挂载） */
CalcView.components = {
  "summary-card": SummaryCard,
  "side-editor": SideEditor, "field-panel": FieldPanel,
};
SummaryCard.components = { "move-chip": MoveChip };
FieldPanel.components = { "side-status-col": SideStatusCol };
