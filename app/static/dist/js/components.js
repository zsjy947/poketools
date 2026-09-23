/* 全局共享组件与 store */
const { h } = Vue;

/* 全局响应式 store（游戏上下文 / 图鉴勾选状态等） */
const store = Vue.reactive({
  games: [],
  profiles: [],
  profileId: 1,
  gameId: "",            // 当前游戏上下文（按游戏入口）
  typeChart: null,       // /api/meta/typechart 缓存
  toast(msg, type = "info") {
    ElementPlus.ElMessage({ message: msg, type, duration: 1800 });
  },
});

/* 功能注册表：games.features 中的 key -> 入口定义 */
const FEATURES = {
  dex: { key: "dex", label: "地区图鉴", icon: "📖", desc: "图鉴进度追踪与捕捉方式" },
  ev: { key: "ev", label: "努力值查询", icon: "⚡", desc: "按努力值筛选当前游戏宝可梦" },
  sandwich: { key: "sandwich", label: "三明治食谱", icon: "🥪", desc: "食力筛选 · 食材调味料 · 自由录入" },
  donut: { key: "donut", label: "甜甜圈工房", icon: "🍩", desc: "特殊配方 · 树果效果 · 风味力量" },
  curry: { key: "curry", label: "咖喱图鉴", icon: "🍛", desc: "咖喱品种图鉴与介绍" },
};

const GAME_ICONS = {
  "sword-shield": "⚔️", "brilliant-diamond-shining-pearl": "💎",
  "legends-arceus": "🏯", "scarlet-violet": "🌸", "legends-za": "🌀",
};

const TYPE_ICONS = {
  "一般": "⚪", "火": "🔥", "水": "💧", "电": "⚡", "草": "🍃", "冰": "❄️",
  "格斗": "✊", "毒": "☠️", "地面": "⛰️", "飞行": "🕊️", "超能力": "🔮",
  "虫": "🐛", "岩石": "🪨", "幽灵": "👻", "龙": "🐉", "恶": "🌙",
  "钢": "⚙️", "妖精": "✨",
};

/* 等宽属性徽章（仿 wiki 样式：图标 + 底色） */
const TypeBadge = {
  props: ["types", "plain"],
  template: `<span><span v-for="t in list" :key="t" class="type-badge"
      :class="{plain: plain}" :style="{'--t': 'var(--type-'+t+')'}">
    <span class="ti">{{ TYPE_ICONS[t] || "" }}</span>{{ t }}</span></span>`,
  computed: { list() { return (this.types || "").split(",").filter(Boolean); } },
  setup() { return { TYPE_ICONS }; },
};

/* 招式分类徽章（物理红 / 特殊蓝 / 变化灰，带底纹） */
const MoveClassBadge = {
  props: ["cls"],
  template: `<span class="mcls-badge" :class="'mc-' + (cls || '')">{{ label }}</span>`,
  computed: { label() { return { physical: "物理", special: "特殊", status: "变化" }[this.cls] || "-"; } },
};

/* 特性徽章（隐藏特性标记） */
const AbilityList = {
  props: ["abilities"],
  template: `<span>
    <span v-for="(a, i) in abilities || []" :key="i" class="ab-badge"
        :class="{hidden: a.hidden}" :title="a.hidden ? '隐藏特性' : ''">
      {{ a.name }}<template v-if="a.hidden"> ★</template>
    </span>
    <span v-if="!(abilities && abilities.length)" class="empty-hint">待补充</span>
  </span>`,
};

/* 精灵球捕捉切换按钮（图鉴卡片交互） */
const PokeToggle = {
  props: ["caught"],
  template: `<span class="poke-toggle" :class="{caught: caught}" @click.stop="$emit('toggle')"
    :title="caught ? '已捕捉（点击取消）' : '标记为已捕捉'">
    <svg viewBox="0 0 24 24" width="18" height="18">
      <circle cx="12" cy="12" r="10" fill="currentColor" opacity="0.12"/>
      <path d="M2 12a10 10 0 0 1 20 0z" fill="#e5484d"/>
      <path d="M2 12a10 10 0 0 0 20 0z" fill="#f5f6f8"/>
      <rect x="2" y="11" width="20" height="2" fill="#24292f"/>
      <circle cx="12" cy="12" r="3.6" fill="#f5f6f8" stroke="#24292f" stroke-width="1.6"/>
      <circle cx="12" cy="12" r="1.4" :fill="caught ? '#e5484d' : '#c0c6d0'"/>
    </svg>
  </span>`,
};

/* 宝可梦图片（官方绘图；缺失时隐藏） */
const PokeImg = {
  props: ["formId", "size"],
  template: `<img class="poke-img" :src="src" loading="lazy"
    :style="{width: (size||96)+'px', height:(size||96)+'px'}"
    onerror="this.classList.add('img-missing')">`,
  computed: { src() { return "/sprites/" + this.formId + ".png"; } },
};

const EvBadges = {
  props: ["ev"],
  template: `<span>
    <span v-for="(v, k) in evItems" :key="k" v-show="v > 0" class="ev-badge">{{ EV_NAMES[k] }} +{{ v }}</span>
    <span v-if="!hasEv" class="empty-hint">无</span>
  </span>`,
  computed: {
    evItems() { return this.ev || {}; },
    hasEv() { return Object.values(this.evItems).some((v) => v > 0); },
  },
  setup() { return { EV_NAMES }; },
};

const FlavorList = {
  props: ["flavor"],
  template: `<div>
    <div v-for="(f, i) in flavor" :key="i" class="flavor-item">
      <span class="flavor-tag">{{ f.version_label }}</span>{{ f.text }}
    </div>
    <div v-if="!flavor || !flavor.length" class="empty-hint">当前版本暂无图鉴描述（待补充）</div>
  </div>`,
};

/* 获取方式（按版本标签分组：本体 / DLC / 版本独占） */
const GetMethodList = {
  props: ["rows"],
  template: `<div>
    <template v-for="(g, i) in grouped" :key="i">
      <div class="gm-group">
        <el-tag size="small" effect="dark" :type="isDlc(g.label) ? 'warning' : 'info'">{{ g.label }}</el-tag>
      </div>
      <div v-for="(r, j) in g.rows" :key="i + '-' + j" class="gm-row">
        <span class="gm-loc">{{ r.location || '—' }}</span>
        <span class="gm-method">{{ r.method }}</span>
        <span class="gm-note" v-if="r.note">{{ r.note }}</span>
      </div>
    </template>
    <div v-if="extra.length">
      <div class="gm-group"><el-tag size="small" type="info" effect="plain">地点数据（未翻译）</el-tag></div>
      <div v-for="(e, j) in extra" :key="'x' + j" class="gm-row">
        <span class="gm-loc">{{ e.location_en }}</span>
        <span class="gm-method">Lv.{{ e.min_level }}~{{ e.max_level }}</span>
      </div>
    </div>
    <div v-if="!grouped.length && !extra.length" class="empty-hint">当前版本暂无捕捉数据（待补充）</div>
  </div>`,
  computed: {
    grouped() {
      const order = [];
      const map = {};
      (this.rows || []).forEach((r) => {
        const key = r.version_label || "—";
        if (!(key in map)) { map[key] = []; order.push(key); }
        map[key].push(r);
      });
      return order.map((k) => ({ label: k, rows: map[k] }));
    },
    extra() { return this.$attrs.extra || []; },
  },
  methods: {
    isDlc(label) {
      return /扩展票|零之秘宝|异次元|DLC/.test(label || "");
    },
  },
};

/* 进化链（支持分支家族） */
const EvoChain = {
  props: ["evo", "current"],
  template: `<div v-if="evo && evo.root" class="evo-wrap">
    <div class="evo-node-list">
      <evo-node :sid="evo.root" :evo="evo" :current="current"></evo-node>
    </div>
  </div>
  <div v-else class="empty-hint">不进化</div>`,
};

const EvoNode = {
  name: "EvoNode",
  props: ["sid", "evo", "current"],
  template: `<div class="evo-branch">
    <div class="evo-node" :class="{cur: sid === current}" @click="open">
      <span class="evo-name">{{ node.name }}</span>
      <type-badge :types="node.types" plain></type-badge>
    </div>
    <template v-if="children.length">
      <div class="evo-arrow">→</div>
      <div class="evo-children">
        <div v-for="c in children" :key="c" class="evo-child">
          <div class="evo-cond">{{ cond(c) }}</div>
          <evo-node :sid="c" :evo="evo" :current="current"></evo-node>
        </div>
      </div>
    </template>
  </div>`,
  computed: {
    node() { return (this.evo.nodes || {})[String(this.sid)] || {}; },
    children() { return (this.evo.children || {})[String(this.sid)] || []; },
  },
  methods: {
    cond(to) { return (this.evo.conds || {})[`${this.sid}|${to}`] || ""; },
    open() { location.hash = "#/pokemon/" + this.sid + "?game=" + (store.gameId || ""); },
  },
};

/* 种族值条形图 */
const StatBars = {
  props: ["stats", "max"],
  template: `<div class="stat-bars">
    <div v-for="(v, k) in stats" :key="k" class="stat-row">
      <span class="stat-k">{{ STAT_ZH[k] }}</span>
      <div class="stat-track"><div class="stat-fill" :style="{width: pct(v), background: color(v)}"></div></div>
      <span class="stat-v">{{ v }}</span>
    </div>
  </div>`,
  setup() { return { STAT_ZH }; },
  methods: {
    pct(v) { return Math.min(100, (v / (this.max || 255)) * 100) + "%"; },
    color(v) {
      if (v >= 130) return "#e05a5a";
      if (v >= 100) return "#e8834a";
      if (v >= 80) return "#5a9be0";
      if (v >= 60) return "#7bc86c";
      return "#98a1b3";
    },
  },
};

const Empty = { template: `<div class="empty-hint"><slot/></div>` };

function registerGlobalComponents(app) {
  app.component("type-badge", TypeBadge);
  app.component("move-class-badge", MoveClassBadge);
  app.component("ability-list", AbilityList);
  app.component("poke-toggle", PokeToggle);
  app.component("poke-img", PokeImg);
  app.component("ev-badges", EvBadges);
  app.component("flavor-list", FlavorList);
  app.component("get-method-list", GetMethodList);
  app.component("evo-chain", EvoChain);
  app.component("evo-node", EvoNode);
  app.component("stat-bars", StatBars);
}

/* 属性相性计算（防守方视角）：需要 store.typeChart 已加载 */
function defenseMultipliers(types) {
  const chart = store.typeChart;
  if (!chart) return null;
  const out = {};
  for (const atk of chart.types) {
    let m = 1;
    for (const t of types) {
      m *= (chart.chart[atk] || {})[t] ?? 1;
    }
    out[atk] = m;
  }
  return out;
}

const emptyStyle = document.createElement("style");
emptyStyle.textContent = ".empty-hint{color:#a8b0c0;font-size:13px;padding:6px 0;}";
document.head.appendChild(emptyStyle);
