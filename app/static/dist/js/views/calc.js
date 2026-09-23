/* 伤害计算器（三期）：形态/特性/道具/太晶化/Z招式/极巨化/场地状态 */
const CalcView = {
  template: `
  <div>
    <div class="page-head">
      <span class="page-title">伤害计算器</span>
      <el-radio-group v-model="formula" size="small">
        <el-radio-button value="modern">现代公式（剑盾/朱紫）</el-radio-button>
        <el-radio-button value="za">传说 Z-A</el-radio-button>
        <el-radio-button value="pla">传说 阿尔宙斯</el-radio-button>
      </el-radio-group>
      <div class="spacer"></div>
      <el-button type="primary" @click="doCalc" :loading="busy">计算</el-button>
    </div>

    <div class="calc-grid">
      <!-- 攻击方 -->
      <div class="block">
        <h3>攻击方</h3>
        <side-panel :side="A" :species-list="speciesList" side-kind="attacker"
          @species="loadForms(A, $event)"></side-panel>
      </div>
      <!-- 中间列 -->
      <div class="block" style="min-width:250px">
        <h3>招式与条件</h3>
        <el-select v-model="moveId" filterable placeholder="选择招式（全世代并集）"
          style="width:100%" :disabled="!A.speciesId" @focus="ensureMoves">
          <el-option v-for="m in moves" :key="m.move_id" :value="m.move_id"
            :label="m.name_zh + '（' + m.type_zh + '/' + clsName(m.damage_class) + '/' + (m.power || '—') + '）'">
            <span>{{ m.name_zh }}</span>
            <span style="float:right;color:#999;font-size:12px">{{ m.type_zh }} · {{ clsName(m.damage_class) }} · {{ m.power || "—" }} · 世代{{ m.gens.join(",") }}</span>
          </el-option>
        </el-select>
        <div class="fld-row" style="margin-top:8px">
          <el-input-number v-model="powerOverride" :min="0" :max="999" size="small"
            placeholder="威力覆盖" style="width:140px" />
          <span style="font-size:12px;color:#98a1b3">威力覆盖（优先级最高）</span>
        </div>
        <div class="fld-row">
          <span class="lbl">天气</span>
          <el-select v-model="weather" size="small" style="width:120px" clearable>
            <el-option value="sun" label="大晴天" />
            <el-option value="rain" label="下雨" />
          </el-select>
          <el-checkbox v-model="crit" size="small">会心一击</el-checkbox>
        </div>
        <div class="fld-row">
          <span class="lbl">场地效果</span>
          <el-select v-model="screen" size="small" style="width:150px" clearable>
            <el-option value="reflect" label="反射壁(物理)" />
            <el-option value="light_screen" label="光墙(特殊)" />
          </el-select>
        </div>
        <div class="fld-row" v-if="formula === 'pla'">
          <span class="lbl">阿尔宙斯风格</span>
          <el-select v-model="style" size="small" style="width:130px">
            <el-option value="" label="普通" />
            <el-option value="strong" label="刚猛(×1.5)" />
            <el-option value="agile" label="迅疾(×0.66)" />
          </el-select>
        </div>
        <div class="calc-hint">
          攻击方勾选「Z招式／极巨化」后按官方威力换算表自动换算威力；
          双方均可选择太晶属性（影响 STAB 与相性）。
        </div>
      </div>
      <!-- 防御方 -->
      <div class="block">
        <h3>防御方</h3>
        <side-panel :side="D" :species-list="speciesList" side-kind="defender"
          @species="loadForms(D, $event)"></side-panel>
      </div>
    </div>

    <!-- 结果 -->
    <div class="block" v-if="result">
      <h3>结果</h3>
      <el-alert v-if="result.error" type="warning" :closable="false" title="变化招式或缺少威力，无法计算伤害" />
      <template v-else>
        <div class="res-line">
          <span class="res-big">{{ result.min }} ~ {{ result.max }}</span>
          <span style="color:#666">伤害（16 种随机值：{{ result.rolls.join(", ") }}）</span>
        </div>
        <div class="res-line">
          <el-tag effect="dark" :type="result.ohko ? 'danger' : 'info'">
            {{ result.ohko ? "确定一击必杀" : "非必杀" }}
          </el-tag>
          <el-tag style="margin-left:8px">{{ result.label }}</el-tag>
          <span style="margin-left:10px;color:#666">防御方 HP {{ result.hp }}，
            伤害占比 {{ result.pct_min }}% ~ {{ result.pct_max }}%</span>
        </div>
        <el-button size="small" style="margin-top:10px" @click="compare" :loading="cmpBusy">
          对比{{ cmpSide === "attacker" ? "攻击方" : "防御方" }}全部形态
        </el-button>
        <el-radio-group v-model="cmpSide" size="small" style="margin:10px 0 0 10px">
          <el-radio value="attacker">对比攻击方形态</el-radio>
          <el-radio value="defender">对比防御方形态</el-radio>
        </el-radio-group>
        <el-table v-if="cmpResult" :data="cmpResult" size="small" style="margin-top:10px" height="320">
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
      </template>
    </div>
  </div>
  `,
  setup() {
    const { ref, reactive } = Vue;
    const formula = ref("modern");
    const busy = ref(false);
    const cmpBusy = ref(false);
    const result = ref(null);
    const cmpResult = ref(null);
    const cmpSide = ref("attacker");
    const moveId = ref(null);
    const moves = ref([]);
    const powerOverride = ref(0);
    const weather = ref("");
    const crit = ref(false);
    const screen = ref("");
    const style = ref("");
    const speciesList = ref([]);

    function blankSide() {
      return reactive({
        speciesId: null, formId: null, forms: [], level: 50,
        nature: "hardy", evs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
        ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 },
        boostA: 0, boostD: 0, ability: "", item: "", burn: false,
        dynamax: false, zMove: false, tera: "",
      });
    }
    const A = blankSide();
    const D = blankSide();

    apiGet("/api/meta/species").then((r) => (speciesList.value = r));

    async function loadForms(side, speciesId) {
      side.speciesId = speciesId;
      side.forms = await apiGet("/api/calc/forms", { species_id: speciesId });
      side.formId = side.forms.length ? side.forms[0].id : null;
      pickDefaultAbility(side);
      side.tera = "";
      if (side === A) { moves.value = []; moveId.value = null; }
    }
    function pickDefaultAbility(side) {
      const form = side.forms.find((f) => f.id === side.formId);
      if (!form || !form.ability_list || !form.ability_list.length) { side.ability = ""; return; }
      const own = form.ability_list.find((a) => !a.hidden);
      side.ability = (own || form.ability_list[0]).name;
    }
    async function ensureMoves() {
      if (!moves.value.length && A.speciesId) {
        moves.value = await apiGet("/api/calc/moves", { species_id: A.speciesId });
      }
    }
    function sidePayload(side, kind) {
      return {
        species_id: side.speciesId, form_id: side.formId, level: side.level,
        nature: side.nature, evs: side.evs, ivs: side.ivs,
        boosts: kind === "attacker"
          ? { atk: side.boostA, spa: side.boostA }
          : { def: side.boostD, spd: side.boostD },
        ability: side.ability, item: side.item,
        burn: kind === "attacker" && side.burn,
        is_dynamax: side.dynamax,
        tera_type: side.tera || "",
      };
    }
    async function doCalc() {
      if (!A.speciesId || !D.speciesId || !moveId.value) {
        ElementPlus.ElMessage.warning("请选择攻防双方与招式");
        return;
      }
      busy.value = true;
      try {
        const resp = await apiSend("POST", "/api/calc", {
          formula: formula.value,
          attacker: sidePayload(A, "attacker"),
          defender: sidePayload(D, "defender"),
          move_id: moveId.value,
          weather: weather.value, crit: crit.value, screen: screen.value,
          move_power_override: powerOverride.value || undefined,
          style: style.value,
          burn: A.burn,
          z_move: A.zMove, max_move: A.dynamax,
        });
        result.value = resp.result;
        cmpResult.value = null;
      } finally { busy.value = false; }
    }
    async function compare() {
      cmpBusy.value = true;
      try {
        cmpResult.value = await apiSend("POST", "/api/calc/compare-forms", {
          side: cmpSide.value, species_id: cmpSide.value === "attacker" ? A.speciesId : D.speciesId,
          base: {
            attacker: sidePayload(A, "attacker"),
            defender: sidePayload(D, "defender"),
            move_id: moveId.value,
            weather: weather.value, crit: crit.value, screen: screen.value,
            move_power_override: powerOverride.value || undefined,
            style: style.value,
            burn: A.burn,
            z_move: A.zMove, max_move: A.dynamax,
          },
        });
      } finally { cmpBusy.value = false; }
    }
    function clsName(c) { return { physical: "物理", special: "特殊", status: "变化" }[c] || c; }

    return {
      formula, busy, cmpBusy, result, cmpResult, cmpSide, moveId, moves,
      powerOverride, weather, crit, screen, style, speciesList, A, D,
      loadForms, ensureMoves, doCalc, compare, clsName,
    };
  },
};

/* 攻/防方面板子组件 */
const _metaCache = { natures: null, items: null };

const SidePanel = {
  props: ["side", "speciesList", "sideKind"],
  template: `
  <div>
    <div class="fld-row">
      <el-select :model-value="side.speciesId" filterable placeholder="宝可梦"
        style="flex:1" @change="$emit('species', $event)">
        <el-option v-for="s in speciesList" :key="s.id" :value="s.id"
          :label="s.name_zh + ' #' + String(s.id).padStart(4, '0')" />
      </el-select>
    </div>
    <div class="fld-row" v-if="side.forms.length > 1">
      <span class="lbl">形态</span>
      <el-select v-model="side.formId" size="small" style="flex:1" @change="onFormChange">
        <el-option v-for="f in side.forms" :key="f.id" :value="f.id"
          :label="(f.form_label || f.identifier || '默认') + (f.is_mega ? ' ⭐' : '')" />
      </el-select>
      <el-button v-if="hasMega && !isMega" size="small" @click="goMega">超级进化</el-button>
    </div>
    <div class="fld-row">
      <span class="lbl">等级</span>
      <el-input-number v-model="side.level" :min="1" :max="100" size="small" style="width:100px" />
      <span class="lbl" style="margin-left:10px">性格</span>
      <el-select v-model="side.nature" size="small" filterable style="flex:1">
        <el-option v-for="n in natures" :key="n.identifier" :value="n.identifier"
          :label="n.name_zh + (n.up && n.up !== n.down ? '（+' + STAT_ZH[n.up] + ' -' + STAT_ZH[n.down] + '）' : '')" />
      </el-select>
    </div>
    <div class="fld-row">
      <span class="lbl">{{ sideKind === 'attacker' ? '攻击等级' : '防御等级' }}</span>
      <el-select :model-value="sideKind === 'attacker' ? side.boostA : side.boostD" size="small" style="width:90px"
        @update:model-value="sideKind === 'attacker' ? (side.boostA = $event) : (side.boostD = $event)">
        <el-option v-for="k in [-6,-5,-4,-3,-2,-1,0,1,2,3,4,5,6]" :key="k" :value="k"
          :label="k > 0 ? '+' + k : k" />
      </el-select>
      <el-checkbox v-if="sideKind === 'attacker'" v-model="side.burn" size="small">灼伤</el-checkbox>
    </div>
    <div class="fld-row">
      <span class="lbl">特性</span>
      <el-select v-model="side.ability" size="small" filterable clearable style="flex:1">
        <el-option-group label="自身特性">
          <el-option v-for="a in ownAbilities" :key="a.name" :value="a.name"
            :label="a.name + (a.hidden ? '（隐藏）' : '')" />
        </el-option-group>
        <el-option-group label="其他特性（假设变化）">
          <el-option v-for="a in extraAbilities" :key="a" :value="a" :label="a" />
        </el-option-group>
      </el-select>
    </div>
    <div class="fld-row">
      <span class="lbl">道具</span>
      <el-select v-model="side.item" size="small" clearable filterable style="flex:1" placeholder="无">
        <el-option-group v-for="g in itemPool" :key="g.group" :label="g.group">
          <el-option v-for="i in g.items" :key="i" :value="i"
            :label="i + (modeled.includes(i) ? '' : '（不参与计算）')" />
        </el-option-group>
      </el-select>
    </div>
    <div class="fld-row">
      <span class="lbl">太晶属性</span>
      <el-select v-model="side.tera" size="small" clearable style="width:110px" placeholder="无">
        <el-option v-for="t in TYPE_LIST" :key="t" :value="t" :label="t" />
      </el-select>
      <el-checkbox v-if="sideKind === 'attacker'" v-model="side.zMove" size="small"
        :disabled="side.dynamax">Z招式</el-checkbox>
      <el-checkbox v-model="side.dynamax" size="small"
        @change="side.dynamax && (side.zMove = false)">极巨化</el-checkbox>
    </div>
    <details style="margin-top:6px">
      <summary style="font-size:12px;color:#98a1b3;cursor:pointer">努力值 / 个体值</summary>
      <div class="fld-row" v-for="k in ['hp','atk','def','spa','spd','spe']" :key="k">
        <span class="lbl">{{ STAT_ZH[k] }}</span>
        <el-input-number v-model="side.evs[k]" :min="0" :max="252" size="small" style="width:90px" />
        <el-input-number v-model="side.ivs[k]" :min="0" :max="31" size="small" style="width:90px" />
      </div>
    </details>
  </div>
  `,
  setup(props) {
    const { ref, computed } = Vue;
    const natures = ref(_metaCache.natures || []);
    const itemPool = ref(_metaCache.items ? _metaCache.items.pool : []);
    const modeled = ref(_metaCache.items ? _metaCache.items.modeled : []);
    if (!_metaCache.natures) {
      apiGet("/api/meta/natures").then((r) => { natures.value = r; _metaCache.natures = r; });
      apiGet("/api/meta/items").then((r) => {
        itemPool.value = r.pool; modeled.value = r.modeled; _metaCache.items = r;
      });
    }

    const EXTRA_ABILITIES = ["适应力", "狙击手", "有色眼镜", "超感知", "毅力", "漂浮",
      "多重鳞片", "冰鳞粉", "滤芯", "Prism装甲", "引火", "蓄电", "避雷针", "干燥皮肤",
      "强行", "技术高手"];
    const ownAbilities = computed(() => {
      const f = props.side.forms.find((x) => x.id === props.side.formId);
      return (f && f.ability_list) || [];
    });
    const extraAbilities = computed(() =>
      EXTRA_ABILITIES.filter((a) => !ownAbilities.value.some((o) => o.name === a)));
    const hasMega = computed(() => props.side.forms.some((f) => f.is_mega));
    const isMega = computed(() => {
      const f = props.side.forms.find((x) => x.id === props.side.formId);
      return !!(f && f.is_mega);
    });
    function onFormChange() {
      const f = props.side.forms.find((x) => x.id === props.side.formId);
      if (f && f.ability_list && f.ability_list.length) {
        const own = f.ability_list.find((a) => !a.hidden);
        props.side.ability = (own || f.ability_list[0]).name;
      }
    }
    function goMega() {
      const mega = props.side.forms.find((f) => f.is_mega);
      if (mega) { props.side.formId = mega.id; onFormChange(); }
    }
    return { natures, itemPool, modeled, ownAbilities, extraAbilities,
      hasMega, isMega, onFormChange, goMega, STAT_ZH, TYPE_LIST };
  },
};

const STAT_ZH = { hp: "HP", atk: "攻击", def: "防御", spa: "特攻", spd: "特防", spe: "速度" };

/* 注册子组件（定义顺序在 CalcView 之后，运行时挂载） */
CalcView.components = { "side-panel": SidePanel };
