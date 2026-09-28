/* 伤害计算器（五期重构，对齐 pokestats.top/calc 布局）：
   对战场：左右摘要卡（顶部太晶/极巨图标标记 + 特性 + EVs 概览 + 实际值）+ 竖列 4 招式按钮
   结果条：伤害区间 + 16 rolls + KO 回合表述
   编辑面板：宝可梦/形态（超级进化·超极巨化在此选择）→ 特性（全量）→ 太晶属性 → 道具（全量+图标）
     → 4 招式（威力自动带出）→ 种族值（只读）→ 努力值 → 性格 → 能力升降 → 等级
   场地区：左/右宝可梦对称状态列（状态异常/壁与守护/攻方加成/钉子/其他，SIDE_GROUPS 单源渲染）
     + 中间场地·全局（单双打/天气/场地/气场/四灾兽/空间重力）
   机制互斥：形态派生（超进化/超极巨化）与太晶/极巨/Z 标记互斥；Z 一场战斗仅一次。 */

const MECH_LABELS = { z: "Z招式", max: "极巨化", tera: "太晶化" };
const MAX_MOVE_LABEL = "超极巨招式";

/* 物种装载（编辑面板与初始对局共用） */
async function loadSpeciesInto(s, sid) {
  s.speciesId = sid;
  s.nameZh = (window.__speciesNames || {})[sid] || "";
  s.moves = [null, null, null, null];
  s.zMarks = [false, false, false, false];
  s.moveResults = [null, null, null, null];
  s.zLocked = null;                 // 道具锁定来源："z" | "mega" | null
  s.teraOn = false;
  s.maxOn = false;
  s.forms = await apiGet("/api/calc/forms", { species_id: sid });
  s.formId = s.forms.length ? s.forms[0].id : null;
  const f = s.forms.find(x => x.id === s.formId);
  pickDefaultAbility(s, f);
  s.moveOptions = await apiGet("/api/calc/moves", { species_id: sid });
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
        :dmg="atkSide === D ? activeResult : null"
        :active-move-idx="atkSide === A ? activeMoveIdx : -1"
        @pick-move="pickMove(A, $event)"
        @toggle-mech="toggleMechMark(A, $event)"
        @toggle-z="onZ(A, $event)"></summary-card>
      <div class="vs-badge">VS</div>
      <summary-card :side="D" :is-defender="atkSide === A" :z-meta="zMeta" :items="items"
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

    <!-- 编辑面板（每侧）+ 场地与状态区（下部） -->
    <div class="calc-editors">
      <side-editor :side="A" label="攻击方编辑" :species-list="speciesList"
        :items="items" :abilities="allAbilities" :z-meta="zMeta"
        @changed="onSideChanged" @mech="onMechChange"></side-editor>
      <side-editor :side="D" label="防守方编辑" :species-list="speciesList"
        :items="items" :abilities="allAbilities" :z-meta="zMeta"
        @changed="onSideChanged" @mech="onMechChange"></side-editor>
      <field-panel :field="field" :sides="{atk: A, dfd: D}" :atk-side="atkSide"
        @changed="onSideChanged"></field-panel>
    </div>
  </div>
  `,
  setup() {
    const { ref, reactive, computed, watch } = Vue;
    const speciesList = ref([]);
    const items = ref([]);              // [{identifier, name_zh}]
    const allAbilities = ref([]);
    const zMeta = ref({ generic: [], exclusive: [] });
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
        /* 场地两侧状态 */
        burn: false, crit: false, helping: false,
        statuses: [],                    // 中毒/剧毒/冰冻/睡眠/麻痹（仅展示）
        screen: "", sash: false, friendGuard: false,
        flowerGift: false, steely: false, battery: false, powerSpot: false,
        foresight: false, tailwind: false, powerTrick: false,
        hazards: { rocks: false, spikes: 0, saltCure: false, leechSeed: false },
      });
    }
    const A = blankSide();
    const D = blankSide();

    apiGet("/api/meta/species").then((r) => {
      speciesList.value = r;
      window.__speciesNames = Object.fromEntries(r.map(x => [x.id, x.name_zh]));
      A.nameZh = A.nameZh || window.__speciesNames[A.speciesId] || "";
      D.nameZh = D.nameZh || window.__speciesNames[D.speciesId] || "";
    });
    apiGet("/api/meta/items").then((r) => { items.value = r; });
    apiGet("/api/meta/abilities").then((r) => { allAbilities.value = r; });
    apiGet("/api/meta/z-moves").then((r) => { zMeta.value = r; });
    const { onMounted } = Vue;
    onMounted(async () => {
      await loadSpeciesInto(A, 445);   // 烈咬陆鲨（深 watch 自动触发首次计算）
      await loadSpeciesInto(D, 143);   // 卡比兽
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
        screen: s.screen, sash: s.sash, friend_guard: s.friendGuard,
        flower_gift: s.flowerGift, steely: s.steely, battery: s.battery,
        power_spot: s.powerSpot, foresight: s.foresight, power_trick: s.powerTrick,
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

    watch(field, scheduleRecalc);
    watch(A, scheduleRecalc);
    watch(D, scheduleRecalc);

    return {
      A, D, field, speciesList, items, allAbilities, zMeta,
      atkSide, activeMoveIdx, activeResult, activeZName, activeZNote, zOnForActive,
      resultDesc, koText, koTagType, activeHpText,
      pickMove, onSideChanged, onMechChange, MECH_LABELS,
      toggleMechMark, onZ: (s, idx) => { toggleZMark(s, idx, items.value, zMeta.value); scheduleRecalc(); },
    };
  },
};

/* ---- 对战场摘要卡 ---- */
const SummaryCard = {
  props: ["side", "isDefender", "dmg", "activeMoveIdx", "zMeta", "items"],
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

/* 招式槽（名称 + Z 标记纯晶图标 + 伤害百分比区间） */
const MoveChip = {
  props: ["side", "idx", "zMeta", "items"],
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
    const displayName = computed(() => {
      if (!move.value) return "";
      if (props.side.maxOn) return move.value.power ? MAX_MOVE_LABEL + "·" + move.value.type_zh : move.value.name_zh;
      return move.value.name_zh;
    });
    const powerLabel = computed(() => {
      if (!move.value) return "";
      if (!move.value.power) return move.value.damage_class === "status" ? "变化" : "—";
      if (props.side.maxOn) return "威力自动";
      return move.value.power;
    });
    /* Z 纯晶图标：专属命中 → 专属纯晶；否则按招式属性的泛用纯晶 */
    const zIcon = computed(() => {
      const meta = props.zMeta || { generic: [], exclusive: [] };
      const m = move.value;
      if (!m) return "";
      const ex = meta.exclusive.find(x =>
        x.species_id === props.side.speciesId && x.base_move_id === m.move_id);
      if (ex && iconOf(meta, ex.crystal_identifier)) return iconOf(meta, ex.crystal_identifier);
      const g = meta.generic.find(x => (x.crystal_name || "").replace("Ｚ", "") === m.type_zh
        || (x.crystal_name || "").replace("Z", "") === m.type_zh);
      return iconOf(meta, g ? g.crystal_identifier : "");
    });
    function iconOf(meta, ident) {
      return ident ? "/sprites/items/" + ident + ".png" : "";
    }
    const zTitle = computed(() => zOn.value ? "Z 招式已点亮（点击熄灭）" : "点亮 Z 招式（自动装备对应 Z 纯晶）");
    return { move, zOn, res, displayName, powerLabel, zIcon, zTitle };
  },
};

/* ---- 编辑面板 ---- */
const _metaCache = { natures: null };   // 性格跨组件缓存（items/abilities/zMeta 由 CalcView 统一拉取）

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
    const natures = ref(_metaCache.natures || []);
    const itemQuery = ref("");
    if (!_metaCache.natures) {
      apiGet("/api/meta/natures").then((r) => {
        natures.value = r; _metaCache.natures = r;
        window.__naturesCache = r;
      });
    }
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
      loadMoveOptions(s).then(() => { pruneMoves(s); emit("changed"); });
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
    async function loadMoveOptions(s) {
      if (!s.speciesId) return;
      s.moveOptions = await apiGet("/api/calc/moves", { species_id: s.speciesId });
    }
    function ensureMoves() {
      if (!props.side.moveOptions.length && props.side.speciesId) loadMoveOptions(props.side);
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

/* ---- 场地与状态区（左状态列 / 场地·全局 / 右状态列） ---- */

/* 双侧状态配置：左右列共用同一份渲染，保证逐项一字不差（伤害计算相互，两侧均需完整列表）。
   灼伤参与计算（burn）；中毒/剧毒/冰冻/睡眠/麻痹与顺风为前端展示态（速度序不在伤害模型内）；
   壁与撒菱为单选语义，其余多选；力量戏法 = 攻防实际值互换（后端 per-side flag）。 */
const SCREENS = [
  { v: "reflect", t: "反射壁" }, { v: "light_screen", t: "光墙" }, { v: "aurora", t: "极光幕" }];
const SHOW_STATUSES = ["中毒", "剧毒", "冰冻", "睡眠", "麻痹"];
function toggleStatus(s, st) {
  const i = s.statuses.indexOf(st);
  if (i >= 0) s.statuses.splice(i, 1);
  else s.statuses.push(st);
}
const SIDE_GROUPS = [
  { name: "状态异常", items: [
    { label: "灼伤", get: s => s.burn, set: s => { s.burn = !s.burn; } },
    ...SHOW_STATUSES.map(st => ({
      label: st, get: s => s.statuses.includes(st), set: s => toggleStatus(s, st) })),
  ]},
  { name: "壁与守护", items: [
    ...SCREENS.map(x => ({ label: x.t, get: s => s.screen === x.v,
      set: s => { s.screen = s.screen === x.v ? "" : x.v; } })),
    { label: "友情防守", get: s => s.friendGuard, set: s => { s.friendGuard = !s.friendGuard; } },
    { label: "气势披带", get: s => s.sash, set: s => { s.sash = !s.sash; } },
  ]},
  { name: "攻方加成", items: [
    { label: "击中要害", get: s => s.crit, set: s => { s.crit = !s.crit; } },
    { label: "帮助", get: s => s.helping, set: s => { s.helping = !s.helping; } },
    { label: "钢之意志", get: s => s.steely, set: s => { s.steely = !s.steely; } },
    { label: "蓄电池", get: s => s.battery, set: s => { s.battery = !s.battery; } },
    { label: "能量点", get: s => s.powerSpot, set: s => { s.powerSpot = !s.powerSpot; } },
  ]},
  { name: "钉子", items: [
    { label: "隐形岩", get: s => s.hazards.rocks, set: s => { s.hazards.rocks = !s.hazards.rocks; } },
    ...[1, 2, 3].map(n => ({ label: "撒菱×" + n, get: s => s.hazards.spikes === n,
      set: s => { s.hazards.spikes = s.hazards.spikes === n ? 0 : n; } })),
    { label: "盐淹", get: s => s.hazards.saltCure, set: s => { s.hazards.saltCure = !s.hazards.saltCure; } },
    { label: "寄生种子", get: s => s.hazards.leechSeed, set: s => { s.hazards.leechSeed = !s.hazards.leechSeed; } },
  ]},
  { name: "其他", items: [
    { label: "被识破", get: s => s.foresight, set: s => { s.foresight = !s.foresight; } },
    { label: "花之礼", get: s => s.flowerGift, set: s => { s.flowerGift = !s.flowerGift; } },
    { label: "顺风", get: s => s.tailwind, set: s => { s.tailwind = !s.tailwind; } },
    { label: "力量戏法", get: s => s.powerTrick, set: s => { s.powerTrick = !s.powerTrick; } },
  ]},
];

/* 单侧状态列（左右共用 SIDE_GROUPS 渲染） */
const SideStatusCol = {
  props: ["side", "title", "mark"],
  emits: ["changed"],
  template: `
  <div class="fp-col">
    <div class="fp-title">{{ mark ? "▶ " : "" }}{{ title }}</div>
    <div v-for="g in SIDE_GROUPS" :key="g.name" class="fp-group">
      <div class="fp-group-name">{{ g.name }}</div>
      <div class="fp-tags">
        <el-check-tag v-for="it in g.items" :key="it.label" :checked="it.get(side)"
          @change="it.set(side); $emit('changed')">{{ it.label }}</el-check-tag>
      </div>
    </div>
  </div>
  `,
  setup() { return { SIDE_GROUPS }; },
};

const FieldPanel = {
  props: ["field", "sides", "atkSide"],
  emits: ["changed"],
  template: `
  <div class="block field-panel">
    <h3>场地与状态</h3>
    <div class="fp-grid5">
      <side-status-col :side="sides.atk" :mark="isAtk(sides.atk)"
        :title="labelOf(sides.atk)" @changed="$emit('changed')"></side-status-col>
      <div class="fp-col">
        <div class="fp-title">场地 · 全局</div>
        <div class="fp-tags fp-mode">
          <el-radio-group v-model="field.mode" size="small">
            <el-radio-button value="doubles">双打</el-radio-button>
            <el-radio-button value="singles">单打</el-radio-button>
          </el-radio-group>
        </div>
        <div class="fp-tags">
          <el-check-tag v-for="w in WEATHERS" :key="w.v" :checked="field.weather === w.v"
            @change="field.weather = field.weather === w.v ? '' : w.v">{{ w.t }}</el-check-tag>
        </div>
        <div class="fp-tags">
          <el-check-tag v-for="t in TERRAINS" :key="t.v" :checked="field.terrain === t.v"
            @change="field.terrain = field.terrain === t.v ? '' : t.v">{{ t.t }}</el-check-tag>
        </div>
        <div class="fp-tags">
          <el-check-tag :checked="field.auras.fairy" @change="field.auras.fairy = !field.auras.fairy">妖精气场</el-check-tag>
          <el-check-tag :checked="field.auras.dark" @change="field.auras.dark = !field.auras.dark">暗黑气场</el-check-tag>
          <el-check-tag :checked="field.auras.break" @change="field.auras.break = !field.auras.break">气场破坏</el-check-tag>
        </div>
        <div class="fp-tags">
          <el-check-tag v-for="r in RUINS" :key="r.v" :checked="field.ruin[r.v]"
            @change="field.ruin[r.v] = !field.ruin[r.v]">{{ r.t }}</el-check-tag>
        </div>
        <div class="fp-tags">
          <el-check-tag :checked="field.gravity" @change="field.gravity = !field.gravity">重力</el-check-tag>
          <el-check-tag :checked="field.magic_room" @change="field.magic_room = !field.magic_room">魔法空间</el-check-tag>
          <el-check-tag :checked="field.wonder_room" @change="field.wonder_room = !field.wonder_room">奇妙空间</el-check-tag>
        </div>
      </div>
      <side-status-col :side="sides.dfd" :mark="isAtk(sides.dfd)"
        :title="labelOf(sides.dfd)" @changed="$emit('changed')"></side-status-col>
    </div>
    <div class="fp-note">点击任一侧招式按钮即以该侧为攻击方计算；灼伤减半物理（毅力除外）、会心无视壁与能力升降；
      中毒/剧毒/冰冻/睡眠/麻痹与顺风为标记展示（速度序不在伤害模型内）；力量戏法＝该侧攻击与防御实际值互换。</div>
  </div>
  `,
  setup(props) {
    const WEATHERS = [
      { v: "sun", t: "晴天" }, { v: "rain", t: "下雨" }, { v: "sand", t: "沙暴" },
      { v: "snow", t: "雪" }, { v: "harsh_sun", t: "大晴天" }, { v: "harsh_rain", t: "大雨" },
      { v: "air", t: "乱流" }];
    const TERRAINS = [
      { v: "electric", t: "电气场地" }, { v: "grassy", t: "青草场地" },
      { v: "psychic", t: "精神场地" }, { v: "mist", t: "薄雾场地" }];
    const RUINS = [
      { v: "sword", t: "灾祸之剑-防" }, { v: "beads", t: "灾祸之玉-特防" },
      { v: "tablets", t: "灾祸之简-攻" }, { v: "vessel", t: "灾祸之鼎-特攻" }];
    function isAtk(s) { return props.atkSide === s; }
    function labelOf(s) { return (s.nameZh || "未选择") + " · 状态"; }
    return { WEATHERS, TERRAINS, RUINS, isAtk, labelOf };
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
  const ex = (zMeta.exclusive || []).find(x =>
    x.species_id === s.speciesId && x.base_move_id === move.move_id);
  const ident = ex ? ex.crystal_identifier : (() => {
    const g = (zMeta.generic || []).find(x =>
      (x.crystal_name || "").replace("Ｚ", "").replace("Z", "") === move.type_zh);
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
