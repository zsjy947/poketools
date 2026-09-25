/* 伤害计算器（四期重建，效仿 pokestats.top/calc 布局）：
   上部对战场（左右摘要卡 + 四招式按钮，点招式即算）→ 结果条
   中部编辑面板（每侧：宝可梦/特性/道具/太晶/招式/性格等级/六项能力值）
   下部场地与状态区（中央天气场地；两侧异常状态/壁/会心帮助）。
   机制互斥：超级进化 / Z招式 / 极巨化 / 太晶化 同侧只能点亮一个。 */
const MECH_LABELS = { mega: "超级进化", z: "Z招式", max: "极巨化", tera: "太晶化" };


/* 物种装载（编辑面板与初始对局共用） */
async function loadSpeciesInto(s, sid) {
  s.speciesId = sid;
  s.nameZh = (window.__speciesNames || {})[sid] || "";
  s.moves = [null, null, null, null];
  s.powers = ["", "", "", ""];
  s.moveResults = [null, null, null, null];
  s.forms = await apiGet("/api/calc/forms", { species_id: sid });
  s.formId = s.forms.length ? s.forms[0].id : null;
  const f = s.forms.find(x => x.id === s.formId);
  if (f && f.ability_list && f.ability_list.length) {
    s.ability = (f.ability_list.find(a => !a.hidden) || f.ability_list[0]).name;
  }
  s.mechanism = "";
  s.moveOptions = await apiGet("/api/calc/moves", { species_id: sid });
  // 默认四招：优先本属性（STAB）高威力，不足补其他高威力
  const types = new Set(((f && f.types) || "").split(",").filter(Boolean));
  const damaging = s.moveOptions.filter(m => m.power).sort((a, b) => b.power - a.power);
  const stab = damaging.filter(m => types.has(m.type_zh));
  const rest = damaging.filter(m => !types.has(m.type_zh));
  const picked = [...stab, ...rest].slice(0, 4).map(m => m.move_id);
  s.moves = [0, 1, 2, 3].map(i => picked[i] != null ? picked[i] : null);
}

const CalcView = {
  template: `
  <div>
    <div class="page-head">
      <span class="page-title">伤害计算器</span>
      <span style="color:#98a1b3;font-size:13px">现代公式（剑盾/朱紫）· 全世代招式并集 · 与 @smogon/calc 逐 roll 校准</span>
      <div class="spacer"></div>
      <el-button size="small" :loading="cmpBusy" @click="compare" v-if="atkSide && activeResult && !activeResult.error">
        对比{{ atkSide === A ? "左" : "右" }}侧全部形态
      </el-button>
    </div>

    <!-- 对战场 -->
    <div class="battlefield">
      <summary-card :side="A" :label="'左侧'" :is-defender="atkSide === D"
        :dmg="atkSide === D ? activeResult : null"
        :active-move-idx="atkSide === A ? activeMoveIdx : -1"
        @pick-move="pickMove(A, $event)"></summary-card>
      <div class="vs-badge">VS</div>
      <summary-card :side="D" :label="'右侧'" :is-defender="atkSide === A"
        :dmg="atkSide === A ? activeResult : null"
        :active-move-idx="atkSide === D ? activeMoveIdx : -1"
        @pick-move="pickMove(D, $event)"></summary-card>
    </div>

    <!-- 结果条 -->
    <div class="block result-bar" v-if="activeResult">
      <template v-if="activeResult.error">
        <el-alert type="warning" :closable="false"
          :title="activeResult.error === 'status_or_no_power'
            ? '变化招式或缺少威力，无法计算伤害' : activeResult.error" />
      </template>
      <template v-else>
        <div class="res-desc">{{ resultDesc }}</div>
        <div class="res-rolls">
          <span v-for="(v, i) in activeResult.rolls" :key="i" class="roll"
            :class="{lo: v === activeResult.min, hi: v === activeResult.max}">{{ v }}</span>
        </div>
        <div class="res-line">
          <el-tag effect="dark" size="small" :type="activeResult.ohko ? 'danger' : 'info'">
            {{ activeResult.ohko ? "确定一击必杀" : koText }}</el-tag>
          <el-tag size="small" effect="plain" style="margin-left:6px">{{ activeResult.label }}</el-tag>
          <span style="margin-left:10px;color:#666">16 种随机伤害；防御方 HP {{ activeResult.hp }}</span>
        </div>
      </template>
    </div>

    <!-- 编辑面板（每侧）+ 场地与状态区（下部） -->
    <div class="calc-editors">
      <side-editor :side="A" :species-list="speciesList" @changed="onSideChanged"></side-editor>
      <side-editor :side="D" :species-list="speciesList" @changed="onSideChanged"></side-editor>
      <field-panel :field="field" :a="A" :d="D" :atk-side="atkSide"
        @changed="onSideChanged"></field-panel>
    </div>

    <!-- 形态对比 -->
    <div class="block" v-if="cmpResult">
      <h3>全形态伤害对比</h3>
      <el-table :data="cmpResult" size="small" height="320">
        <el-table-column label="形态" min-width="150">
          <template #default="{ row }">{{ row.label }}</template>
        </el-table-column>
        <el-table-column label="属性" width="150">
          <template #default="{ row }"><type-badge :types="row.types"></type-badge></template>
        </el-table-column>
        <el-table-column prop="min" label="最低伤害" width="100" sortable />
        <el-table-column prop="max" label="最高伤害" width="100" sortable />
        <el-table-column label="最高占比" width="110">
          <template #default="{ row }">{{ row.pct_max }}%</template>
        </el-table-column>
        <el-table-column label="确一" width="80">
          <template #default="{ row }">
            <el-tag v-if="row.ohko" type="danger" size="small">OHKO</el-tag>
          </template>
        </el-table-column>
      </el-table>
    </div>
  </div>
  `,
  setup() {
    const { ref, reactive, computed, watch } = Vue;
    const speciesList = ref([]);
    const atkSide = ref(null);       // 当前发起攻击的一侧
    const activeMoveIdx = ref(0);
    const cmpResult = ref(null);
    const cmpBusy = ref(false);
    const field = reactive({ weather: "", terrain: "", marks: [] });

    function blankSide() {
      return reactive({
        speciesId: null, formId: null, forms: [],
        level: 50, nature: "hardy",
        evs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
        ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 },
        overrides: { hp: null, atk: null, def: null, spa: null, spd: null, spe: null },
        boosts: { atk: 0, spa: 0, def: 0, spd: 0 },
        ability: "", item: "",
        mechanism: "",           // "" | mega | z | max | tera
        teraType: "",
        moves: [null, null, null, null],
        powers: ["", "", "", ""],
        moveOptions: [],
        moveResults: [null, null, null, null],
        lastStats: null,
        burn: false, crit: false, helping: false,
        screen: "", fullHp: true, statuses: [],
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
    const koText = computed(() => {
      const r = activeResult.value;
      if (!r || r.error) return "";
      const p = koProb2(r.rolls, r.hp);
      return p >= 100 ? "100% 2 回合击倒" : p > 0 ? Math.round(p) + "% 2 回合击倒" : "无法 2 回合击倒";
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
      if (s.mechanism === "tera") return "太晶(" + s.teraType + ")";
      return MECH_LABELS[s.mechanism] || "";
    }
    function currentMove(side, idx) {
      return side.moveOptions.find(m => m.move_id === side.moves[idx]) || null;
    }
    /* 2 回合击倒概率：16 个 roll 独立同分布，枚举 256 组合 */
    function koProb2(rolls, hp) {
      if (!rolls || !rolls.length) return 0;
      let cnt = 0;
      for (const x of rolls) for (const y of rolls) if (x + y >= hp) cnt++;
      return (cnt * 100) / (rolls.length * rolls.length);
    }

    function sidePayload(s) {
      const overrides = {};
      for (const k of STAT_KEYS) if (s.overrides[k] != null) overrides[k] = s.overrides[k];
      return {
        species_id: s.speciesId, form_id: s.formId, level: s.level,
        nature: s.nature, evs: s.evs, ivs: s.ivs,
        boosts: s.boosts, ability: s.ability, item: s.item,
        is_dynamax: s.mechanism === "max",
        tera_type: s.mechanism === "tera" ? (s.teraType || "一般") : "",
        stat_overrides: overrides,
      };
    }
    function optsFor(atk, dfd, powerOverride) {
      return {
        weather: field.weather, terrain: field.terrain,
        crit: atk.crit, helping_hand: atk.helping, burn: atk.burn,
        screen: dfd.screen, defender_full_hp: dfd.fullHp,
        move_power_override: powerOverride || undefined,
        z_move: atk.mechanism === "z", max_move: atk.mechanism === "max",
      };
    }

    /* ---- 全量重算（任一状态变化后防抖 500ms；每侧 4 招并发） ---- */
    let recalcTimer = null;
    let recalcToken = 0;
    function scheduleRecalc() { clearTimeout(recalcTimer); recalcTimer = setTimeout(recalcAll, 500); }
    async function recalcAll() {
      const token = ++recalcToken;
      for (const [atk, dfd] of [[A, D], [D, A]]) {
        for (let i = 0; i < 4; i++) {
          if (!atk.speciesId || !dfd.speciesId || !atk.moves[i]) { atk.moveResults[i] = null; continue; }
          try {
            const resp = await apiSend("POST", "/api/calc", {
              attacker: sidePayload(atk), defender: sidePayload(dfd),
              move_id: atk.moves[i], ...optsFor(atk, dfd, atk.powers[i]),
            });
            if (token !== recalcToken) return;
            atk.moveResults[i] = resp.result;
            atk.lastStats = resp.attacker.stats;
            dfd.lastStats = resp.defender.stats;
          } catch (e) {
            if (token === recalcToken) atk.moveResults[i] = { error: String(e.message || e) };
          }
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

    watch(field, scheduleRecalc);
    watch(A, scheduleRecalc);
    watch(D, scheduleRecalc);

    async function compare() {
      const atk = atkSide.value, dfd = atk === A ? D : A;
      cmpBusy.value = true;
      try {
        cmpResult.value = await apiSend("POST", "/api/calc/compare-forms", {
          side: "attacker", species_id: atk.speciesId,
          base: {
            attacker: sidePayload(atk), defender: sidePayload(dfd),
            move_id: atk.moves[activeMoveIdx.value],
            ...optsFor(atk, dfd, atk.powers[activeMoveIdx.value]),
          },
        });
      } finally { cmpBusy.value = false; }
    }

    return {
      A, D, field, speciesList, atkSide, activeMoveIdx, activeResult,
      resultDesc, koText, pickMove, onSideChanged, compare, cmpResult, cmpBusy,
    };
  },
};

/* ---- 对战场摘要卡 ---- */
const SummaryCard = {
  props: ["side", "label", "isDefender", "dmg", "activeMoveIdx"],
  emits: ["pick-move"],
  template: `
  <div class="sum-card" :class="{defending: isDefender}">
    <div class="sum-top">
      <div class="sum-art"><poke-img :form-id="side.formId || 0" :size="96"></poke-img></div>
      <div class="sum-info">
        <div class="sum-name">{{ sideName || "选择宝可梦" }}
          <span class="sum-sub">{{ label }}</span></div>
        <type-badge :types="types"></type-badge>
        <div class="sum-tags">
          <el-tag v-if="side.ability" size="small" effect="plain">{{ side.ability }}</el-tag>
          <el-tag v-if="side.item" size="small" effect="plain" type="warning">{{ side.item }}</el-tag>
          <el-tag v-if="side.mechanism === 'tera'" size="small" effect="dark"
            :style="{background: 'var(--type-' + side.teraType + ')', borderColor: 'var(--type-' + side.teraType + ')'}">
            太晶·{{ side.teraType }}</el-tag>
          <el-tag v-else-if="side.mechanism" size="small" effect="dark" type="danger">{{ mechLabel }}</el-tag>
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
        <move-chip :side="side" :idx="i"></move-chip>
      </div>
    </div>
  </div>
  `,
  setup(props) {
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
    const mechLabel = computed(() => MECH_LABELS[props.side.mechanism] || "");
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
    return { sideName, types, mechLabel, evSummary, boostMark, STAT_KEYS, STAT_ZH, formDisplayName };
  },
};

/* 招式槽（显示名称 + 伤害百分比区间） */
const MoveChip = {
  props: ["side", "idx"],
  template: `
  <div class="move-chip" :class="{empty: !move}">
    <template v-if="move">
      <span class="mc-name">{{ move.name_zh }}</span>
      <span class="mc-meta">{{ move.type_zh }} {{ move.power || "—" }}</span>
      <span class="mc-dmg" v-if="res && !res.error">{{ res.pct_min === res.pct_max ? res.pct_max + "%" : res.pct_min + "~" + res.pct_max + "%" }}</span>
      <span class="mc-dmg miss" v-else-if="res && res.error">—</span>
      <span class="mc-dmg" v-else></span>
    </template>
    <span v-else class="mc-empty">招式 {{ idx + 1 }}</span>
  </div>`,
  computed: {
    move() { return this.side.moveOptions.find(m => m.move_id === this.side.moves[this.idx]) || null; },
    res() { return this.side.moveResults[this.idx]; },
  },
};

/* ---- 编辑面板 ---- */
const _metaCache = { natures: null, items: null };
const EXTRA_ABILITIES = ["适应力", "狙击手", "有色眼镜", "超感知", "毅力", "漂浮",
  "多重鳞片", "冰鳞粉", "滤芯", "Prism装甲"];

const SideEditor = {
  props: ["side", "speciesList"],
  emits: ["changed"],
  template: `
  <div class="block side-editor">
    <h3>编辑 · {{ sideLabel }}</h3>
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
          :label="(formDisplayName(f) || f.identifier || '默认') + (f.is_mega ? ' ⭐' : '')" />
      </el-select>
    </div>
    <div class="mech-row">
      <toggle-chip v-for="mk in ['mega','z','max','tera']" :key="mk"
        :label="MECH_LABELS[mk]" :small="true"
        :on="side.mechanism === mk" :disabled="mk === 'mega' && !hasMega"
        @toggle="setMech(mk)"></toggle-chip>
      <el-select v-if="side.mechanism === 'tera'" v-model="side.teraType" size="small"
        style="width:92px" @change="$emit('changed')">
        <el-option v-for="t in TYPE_LIST" :key="t" :value="t" :label="t" />
      </el-select>
    </div>
    <div class="fld-row">
      <span class="lbl">特性</span>
      <el-select v-model="side.ability" size="small" filterable clearable style="flex:1" @change="$emit('changed')">
        <el-option-group label="自身特性">
          <el-option v-for="a in ownAbilities" :key="a.name" :value="a.name"
            :label="a.name + (a.hidden ? '（隐藏）' : '')" />
        </el-option-group>
        <el-option-group label="其他特性（假设变化）">
          <el-option v-for="a in extraAbilities" :key="a" :value="a" :label="a" />
        </el-option-group>
      </el-select>
      <span class="lbl" style="margin-left:8px">道具</span>
      <el-select v-model="side.item" size="small" clearable filterable style="flex:1" @change="$emit('changed')">
        <el-option-group v-for="g in itemPool" :key="g.group" :label="g.group">
          <el-option v-for="i in g.items" :key="i" :value="i"
            :label="i + (modeled.includes(i) ? '' : '（不参与计算）')" />
        </el-option-group>
      </el-select>
    </div>
    <div class="fld-row">
      <span class="lbl">等级</span>
      <el-input-number v-model="side.level" :min="1" :max="100" size="small" style="width:96px" @change="$emit('changed')" />
      <span class="lbl">性格</span>
      <el-select v-model="side.nature" size="small" filterable style="flex:1" @change="$emit('changed')">
        <el-option v-for="n in natures" :key="n.identifier" :value="n.identifier"
          :label="n.name_zh + (n.up && n.up !== n.down ? '（+' + STAT_ZH[n.up] + ' -' + STAT_ZH[n.down] + '）' : '')" />
      </el-select>
    </div>
    <div class="fld-row">
      <span class="lbl">攻击升降</span>
      <el-select :model-value="side.boosts.atk" size="small" style="width:76px"
        @update:model-value="setBoost('atk', $event)">
        <el-option v-for="k in BOOST_RANGE" :key="k" :value="k" :label="k > 0 ? '+' + k : k" />
      </el-select>
      <span class="lbl">特攻升降</span>
      <el-select :model-value="side.boosts.spa" size="small" style="width:76px"
        @update:model-value="setBoost('spa', $event)">
        <el-option v-for="k in BOOST_RANGE" :key="k" :value="k" :label="k > 0 ? '+' + k : k" />
      </el-select>
      <span class="lbl">防御升降</span>
      <el-select :model-value="side.boosts.def" size="small" style="width:76px"
        @update:model-value="setBoost('def', $event)">
        <el-option v-for="k in BOOST_RANGE" :key="k" :value="k" :label="k > 0 ? '+' + k : k" />
      </el-select>
      <span class="lbl">特防升降</span>
      <el-select :model-value="side.boosts.spd" size="small" style="width:76px"
        @update:model-value="setBoost('spd', $event)">
        <el-option v-for="k in BOOST_RANGE" :key="k" :value="k" :label="k > 0 ? '+' + k : k" />
      </el-select>
    </div>

    <div class="editor-moves">
      <div v-for="i in 4" :key="i" class="fld-row">
        <span class="lbl">招式{{ i }}</span>
        <el-select :model-value="side.moves[i - 1]" filterable clearable size="small"
          style="flex:1" placeholder="搜索招式" @change="setMove(i - 1, $event)"
          @focus="ensureMoves">
          <el-option v-for="m in side.moveOptions" :key="m.move_id" :value="m.move_id"
            :label="m.name_zh">
            <span>{{ m.name_zh }}</span>
            <span style="float:right;color:#999;font-size:12px">{{ m.type_zh }} · {{ clsName(m.damage_class) }} · {{ m.power || "—" }} · 世代{{ m.gens.join(",") }}</span>
          </el-option>
        </el-select>
        <el-input-number v-model="side.powers[i - 1]" :min="0" :max="999" size="small"
          style="width:92px" placeholder="威力" @change="$emit('changed')" />
      </div>
    </div>

    <div class="stat-table">
      <div class="st-head"><span></span><span>种族</span><span>努力值</span><span>实际值</span><span>覆盖</span></div>
      <div v-for="k in STAT_KEYS" :key="k" class="st-row">
        <span class="st-k">{{ STAT_ZH[k] }}</span>
        <span class="st-base">{{ baseOf(k) ?? "—" }}</span>
        <el-slider v-model="side.evs[k]" :min="0" :max="252" :step="4" :show-tooltip="false"
          style="flex:1;margin:0 8px" @change="$emit('changed')"></el-slider>
        <span class="st-ev">{{ side.evs[k] }}</span>
        <span class="st-actual">{{ side.lastStats ? side.lastStats[k] : "—" }}</span>
        <el-input-number v-model="side.overrides[k]" :min="1" :max="2000" size="small"
          style="width:88px" placeholder="—" :clearable="true" @change="$emit('changed')" />
      </div>
    </div>
  </div>
  `,
  setup(props, { emit }) {
    const { ref, computed } = Vue;
    const natures = ref(_metaCache.natures || []);
    const itemPool = ref(_metaCache.items ? _metaCache.items.pool : []);
    const modeled = ref(_metaCache.items ? _metaCache.items.modeled : []);
    if (!_metaCache.natures) {
      apiGet("/api/meta/natures").then((r) => {
        natures.value = r; _metaCache.natures = r;
        window.__naturesCache = r;   // 计算器直入时 resultDesc 也需要性格名
      });
      apiGet("/api/meta/items").then((r) => {
        itemPool.value = r.pool; modeled.value = r.modeled; _metaCache.items = r;
      });
    }
    const ownAbilities = computed(() => {
      const f = props.side.forms.find(x => x.id === props.side.formId);
      return (f && f.ability_list) || [];
    });
    const extraAbilities = computed(() =>
      EXTRA_ABILITIES.filter(a => !ownAbilities.value.some(o => o.name === a)));
    const hasMega = computed(() => props.side.forms.some(f => f.is_mega));

    async function onSpecies(sid) {
      await loadSpeciesInto(props.side, sid);
      emit("changed");
    }
    function onForm() {
      const s = props.side;
      pickDefaultAbility(s);
      loadMoveOptions(s).then(() => { pruneMoves(s); emit("changed"); });
    }
    function pruneMoves(s) {
      // 形态切换后：保留新形态仍可学会的招式槽位，其余清空
      s.moves = s.moves.map(id => (id != null && s.moveOptions.some(m => m.move_id === id)) ? id : null);
    }
    function pickDefaultAbility(s) {
      const f = s.forms.find(x => x.id === s.formId);
      if (!f || !f.ability_list || !f.ability_list.length) { s.ability = ""; return; }
      const own = f.ability_list.find(a => !a.hidden);
      s.ability = (own || f.ability_list[0]).name;
    }
    async function loadMoveOptions(s) {
      if (!s.speciesId) return;
      s.moveOptions = await apiGet("/api/calc/moves", { species_id: s.speciesId });
    }
    function ensureMoves() {
      if (!props.side.moveOptions.length && props.side.speciesId) {
        loadMoveOptions(props.side);
      }
    }
    function setMove(idx, mid) {
      props.side.moves[idx] = mid;
      emit("changed");
    }
    function setBoost(k, v) { props.side.boosts[k] = v; emit("changed"); }
    function setMech(mk) {
      const s = props.side;
      const wasMega = s.mechanism === "mega";
      s.mechanism = s.mechanism === mk ? "" : mk;
      if (mk === "mega" && s.mechanism === "mega") {
        const mega = s.forms.find(f => f.is_mega);
        if (mega) {
          s.formId = mega.id;
          pickDefaultAbility(s);
          loadMoveOptions(s).then(() => { pruneMoves(s); emit("changed"); });
          return;
        }
      } else if (wasMega) {
        // 从超级进化切走（或关闭）：恢复默认形态，避免 mega 形态与新机制互斥
        const def = s.forms.find(f => f.is_default);
        if (def) {
          s.formId = def.id;
          pickDefaultAbility(s);
          loadMoveOptions(s).then(() => { pruneMoves(s); emit("changed"); });
          return;
        }
      }
      emit("changed");
    }
    function baseOf(k) {
      const f = props.side.forms.find(x => x.id === props.side.formId);
      return f ? f[k] : null;
    }
    function clsName(c) { return { physical: "物理", special: "特殊", status: "变化" }[c] || c; }
    return {
      natures, itemPool, modeled, ownAbilities, extraAbilities, hasMega,
      onSpecies, onForm, setMove, setBoost, setMech, ensureMoves, baseOf, clsName,
      STAT_KEYS, STAT_ZH, MECH_LABELS, TYPE_LIST, formDisplayName,
      BOOST_RANGE: [-6, -5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5, 6],
    };
  },
};

/* ---- 场地与状态区（中央场地 + 两侧状态） ---- */
const FieldPanel = {
  props: ["field", "a", "d", "atkSide"],
  template: `
  <div class="block field-panel">
    <h3>场地与状态</h3>
    <div class="fp-grid">
      <div class="fp-side">
        <div class="fp-title">{{ isAtk(a) ? "▶ 攻击方" : "左侧" }} · 状态</div>
        <div class="fld-row">
          <el-checkbox v-model="a.burn" size="small">灼伤</el-checkbox>
          <el-checkbox v-model="a.crit" size="small">会心一击</el-checkbox>
          <el-checkbox v-model="a.helping" size="small">帮助</el-checkbox>
        </div>
        <div class="fld-row">
          <span class="lbl">壁</span>
          <el-select v-model="a.screen" size="small" clearable style="width:130px">
            <el-option value="reflect" label="反射壁(物理)" />
            <el-option value="light_screen" label="光墙(特殊)" />
            <el-option value="aurora" label="极光幕(双防)" />
          </el-select>
          <el-checkbox v-model="a.fullHp" size="small">满血（多重鳞片）</el-checkbox>
        </div>
        <div class="fp-note">灼伤：物理伤害减半（毅力除外）；壁被会心无视</div>
      </div>
      <div class="fp-center">
        <div class="fp-title">全局场地</div>
        <div class="fld-row">
          <span class="lbl">天气</span>
          <el-select v-model="field.weather" size="small" clearable style="width:120px">
            <el-option value="sun" label="晴天" />
            <el-option value="rain" label="下雨" />
            <el-option value="harsh_sun" label="大晴天" />
            <el-option value="harsh_rain" label="大雨" />
            <el-option value="air" label="乱流" />
            <el-option value="sand" label="沙暴（不影响伤害）" />
            <el-option value="snow" label="雪（不影响伤害）" />
          </el-select>
        </div>
        <div class="fld-row">
          <span class="lbl">场地</span>
          <el-select v-model="field.terrain" size="small" clearable style="width:150px">
            <el-option value="grassy" label="青草场地" />
            <el-option value="electric" label="电气（不影响伤害）" />
            <el-option value="psychic" label="精神（不影响伤害）" />
            <el-option value="mist" label="薄雾（不影响伤害）" />
          </el-select>
        </div>
        <div class="fp-note">大晴天/大雨与晴/雨同乘数；青草场地使地面招式对接地目标减半</div>
      </div>
      <div class="fp-side">
        <div class="fp-title">{{ isAtk(d) ? "▶ 攻击方" : "右侧" }} · 状态</div>
        <div class="fld-row">
          <el-checkbox v-model="d.burn" size="small">灼伤</el-checkbox>
          <el-checkbox v-model="d.crit" size="small">会心一击</el-checkbox>
          <el-checkbox v-model="d.helping" size="small">帮助</el-checkbox>
        </div>
        <div class="fld-row">
          <span class="lbl">壁</span>
          <el-select v-model="d.screen" size="small" clearable style="width:130px">
            <el-option value="reflect" label="反射壁(物理)" />
            <el-option value="light_screen" label="光墙(特殊)" />
            <el-option value="aurora" label="极光幕(双防)" />
          </el-select>
          <el-checkbox v-model="d.fullHp" size="small">满血（多重鳞片）</el-checkbox>
        </div>
        <div class="fp-note">点击任一侧招式按钮即以该侧为攻击方计算</div>
      </div>
    </div>
  </div>
  `,
  setup(props) {
    function isAtk(s) { return props.atkSide === s; }
    return { isAtk };
  },
};


/* 注册子组件（定义顺序在 CalcView 之后，运行时挂载） */
CalcView.components = {
  "summary-card": SummaryCard,
  "side-editor": SideEditor, "field-panel": FieldPanel,
};
SummaryCard.components = { "move-chip": MoveChip };
