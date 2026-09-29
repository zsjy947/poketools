/* 全局共享组件与 store */

/* 全局响应式 store（游戏上下文 / 图鉴勾选状态等）。
   档案功能已移除（P3-1）：固定默认档案 profileId=1，数据仍按该档案隔离。 */
const store = Vue.reactive({
  games: [],
  profileId: 1,
  gameId: "",            // 当前游戏上下文（按游戏入口）
  typeChart: null,       // /api/meta/typechart 缓存
  toast(msg, type = "info") {
    ElementPlus.ElMessage({ message: msg, type, duration: 1800 });
  },
});

/* 功能注册表：games.features 中的 key -> 入口定义（icon = Monoline 图标名） */
const FEATURES = {
  dex: { key: "dex", label: "地区图鉴", icon: "dex", desc: "图鉴进度追踪与捕捉方式" },
  ev: { key: "ev", label: "努力值查询", icon: "ev", desc: "按努力值筛选当前游戏宝可梦" },
  sandwich: { key: "sandwich", label: "三明治食谱", icon: "sandwich", desc: "食力筛选 · 食材调味料 · 自由录入" },
  donut: { key: "donut", label: "甜甜圈工房", icon: "donut", desc: "特殊配方 · 树果效果 · 风味力量" },
  curry: { key: "curry", label: "咖喱图鉴", icon: "curry", desc: "咖喱品种图鉴与介绍" },
};

/* ---- Monoline 图标体系（批次三）：手写 SVG，viewBox 24、stroke 2、round、fill none ----
   几何基元优先（rect/circle/line/path A 段）；currentColor 随父级着色。
   预览审查页：tools/icon-preview.html。 */
const MONO_ICONS = {
  /* 打开的书本 + 中缝精灵球圆点（地区图鉴） */
  dex: '<path d="M12 7C10 5.4 7.2 4.8 4 4.8v13.4c3.2 0 6 .6 8 2.2 2-1.6 4.8-2.2 8-2.2V4.8c-3.2 0-6 .6-8 2.2z"/>' +
       '<path d="M12 7v13.4"/><circle cx="12" cy="12.6" r="1.6"/>',
  /* 三根渐高柱状条（努力值培育） */
  ev: '<path d="M4 20.2h16"/><rect x="5" y="13.6" width="3.6" height="6.6" rx="1"/>' +
      '<rect x="10.2" y="9.6" width="3.6" height="10.6" rx="1"/>' +
      '<rect x="15.4" y="5.6" width="3.6" height="14.6" rx="1"/>',
  /* 三层堆叠：面包/夹层/面包（三明治） */
  sandwich: '<rect x="4" y="4.8" width="16" height="4.6" rx="2.3"/>' +
            '<rect x="5.6" y="10.8" width="12.8" height="2.8" rx="1.4"/>' +
            '<rect x="4" y="15" width="16" height="4.6" rx="2.3"/>',
  /* 圆环 + 中心孔 + 顶部糖霜弧（甜甜圈） */
  donut: '<circle cx="12" cy="12.6" r="8.4"/><circle cx="12" cy="12.6" r="3.2"/>' +
         '<path d="M6.6 8.4a6.6 6.6 0 0 1 10.8 0"/>',
  /* 锅体 + 双耳 + 蒸汽（咖喱） */
  curry: '<path d="M4 10.2h16v2.8a7 7 0 0 1-7 7h-2a7 7 0 0 1-7-7z"/>' +
         '<path d="M1.8 10.2h2.8M19.4 10.2h2.8"/><path d="M9.4 4.2c.7.7.7 1.6 0 2.3M13.6 4.2c.7.7.7 1.6 0 2.3M11.5 2.6v1.2"/>',
  /* 计算器外框 + 显示窗 + 2×2 按键点 */
  calc: '<rect x="5" y="3" width="14" height="18" rx="2"/>' +
        '<rect x="7.6" y="5.6" width="8.8" height="3.4" rx="0.8"/>' +
        '<path d="M8.8 13.2v.01M15.2 13.2v.01M8.8 17.4v.01M15.2 17.4v.01"/>',
  /* 交叉双剑（模拟对战） */
  battle: '<path d="M4.6 4.6l11.8 11.8M19.4 4.6L7.6 16.4"/>' +
          '<path d="M13.6 17.8l3.8-3.8M16.4 19.6l2.4-2.4M4 15.2l2.2 2.2"/>',
  /* 游戏手柄：圆角横体 + 十字键 + 双钮（游戏中心） */
  games: '<rect x="2.6" y="7.2" width="18.8" height="10.4" rx="5.2"/>' +
         '<path d="M7.2 10.2v4.2M5.1 12.3h4.2"/><path d="M15.4 10.8v.01M17.6 13.6v.01"/>',
  /* 小屋：屋顶三角 + 门（首页） */
  home: '<path d="M3.8 11.2L12 4l8.2 7.2"/><path d="M5.8 9.6V20h12.4V9.6"/><path d="M10 20v-5.4h4V20"/>',
  /* 左向箭头（返回） */
  back: '<path d="M19 12H5"/><path d="M11 5.4L4.4 12l6.6 6.6"/>',
};

const MonoIcon = {
  props: { name: String, size: { type: [Number, String], default: 22 } },
  template: `<svg class="mono-icon" :width="size" :height="size" viewBox="0 0 24 24"
    fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"
    stroke-linejoin="round" v-html="path"></svg>`,
  computed: { path() { return MONO_ICONS[this.name] || ""; } },
};

/* 64px 图标窄栏（进入游戏后出现）：顶部大游戏商标 + 下方功能 Monoline 图标，无文字 */
const RailNav = {
  props: ["game", "features", "activeFeature"],
  emits: ["go-feature"],
  template: `
  <nav class="rail">
    <div class="rail-game" :title="game ? game.name_zh : ''" @click="$emit('go-feature', 'dex')">
      <game-icons v-if="game" :gid="game.id" :h="isDual ? 26 : 40"></game-icons>
    </div>
    <div class="rail-sep"></div>
    <div v-for="f in features" :key="f.key" class="rail-item"
      :class="{active: activeFeature === f.key}" :title="f.label"
      @click="$emit('go-feature', f.key)">
      <mono-icon :name="f.icon" :size="22"></mono-icon>
    </div>
  </nav>`,
  setup(props) {
    const { computed } = Vue;
    const isDual = computed(() =>
      props.game && (props.game.id === "sword-shield"
        || props.game.id === "brilliant-diamond-shining-pearl"
        || props.game.id === "scarlet-violet"));
    return { isDual };
  },
};

/* 左上角返回上一级（按路由层级静态映射，不依赖 history） */
const BackBtn = {
  props: ["target", "label"],
  emits: ["click"],
  template: `<button class="back-btn" @click="$emit('click')">
    <mono-icon name="back" :size="15"></mono-icon><span>{{ label }}</span></button>`,
};

const GAME_ICONS = {
  "sword-shield": ["sword", "shield"],
  "brilliant-diamond-shining-pearl": ["diamond", "pearl"],
  "legends-arceus": ["arceus"],
  "scarlet-violet": ["scarlet", "violet"],
  "legends-za": ["za"],
};

/* 官方简中商标图标（52poke，assets/games/*.webp）：双版本游戏并排两枚 */
const GameIcons = {
  props: ["gid", "h"],
  template: `<span class="game-icons" :style="{height: (h||22)+'px'}">
    <img v-for="k in GAME_ICONS[gid] || []" :key="k" class="game-logo"
      :src="'/assets/games/' + k + '.webp'" :style="{height: (h||22)+'px'}"
      :alt="gid" loading="lazy" onerror="this.style.display='none'">
  </span>`,
  setup() { return { GAME_ICONS }; },
};

/* 属性图标雪碧图行号（assets/type_sprite.webp：18 属性 + 物理/特殊/变化，每格等宽） */
const TYPE_ICON_POS = {
  "一般": 0, "格斗": 1, "飞行": 2, "毒": 3, "地面": 4, "岩石": 5, "虫": 6, "幽灵": 7,
  "钢": 8, "火": 9, "水": 10, "草": 11, "电": 12, "超能力": 13, "冰": 14, "龙": 15,
  "恶": 16, "妖精": 17,
};
const MOVE_CLASS_ICON_POS = { physical: 18, special: 19, status: 20 };

/* 等宽属性徽章：彩色胶囊 + 雪碧图图标（星晶无图标退化为纯色胶囊） */
const TypeBadge = {
  props: ["types", "plain"],
  template: `<span><span v-for="t in list" :key="t" class="type-badge"
      :class="{plain: plain}" :style="{'--t': 'var(--type-'+t+')'}">
    <span v-if="TYPE_ICON_POS[t] != null" class="ti" :style="{'--iy': TYPE_ICON_POS[t]}"></span>{{ t }}</span></span>`,
  computed: { list() { return (this.types || "").split(",").filter(Boolean); } },
  setup() { return { TYPE_ICON_POS }; },
};

/* 招式分类徽章（物理红 / 特殊蓝 / 变化灰胶囊 + 同一雪碧图图标） */
const MoveClassBadge = {
  props: ["cls"],
  template: `<span class="mcls-badge" :class="'mc-' + (cls || '')">
    <span v-if="cls in MOVE_CLASS_ICON_POS" class="ti" :style="{'--iy': MOVE_CLASS_ICON_POS[cls]}"></span>{{ label }}</span>`,
  computed: { label() { return { physical: "物理", special: "特殊", status: "变化" }[this.cls] || "-"; } },
  setup() { return { MOVE_CLASS_ICON_POS }; },
};

/* 版本主题色（图鉴介绍/获取方式标签着色；单版本游戏用游戏主题色） */
const VERSION_COLORS = {
  "剑": "#3a6fd8", "剑·扩展票": "#3a6fd8",
  "盾": "#d0392e", "盾·扩展票": "#d0392e",
  "剑/盾": "#4a5b82", "剑/盾·扩展票": "#4a5b82",
  "晶灿钻石": "#1fa9a0", "明亮珍珠": "#d76aa8", "晶灿钻石/明亮珍珠": "#7b8bb0",
  "朱": "#e3342f", "朱·零之秘宝": "#e3342f",
  "紫": "#8a3fd0", "紫·零之秘宝": "#8a3fd0",
  "朱/紫": "#a04d7a", "朱/紫·零之秘宝": "#a04d7a",
  "洗翠": "#3f8f7d", "传说 阿尔宙斯": "#3f8f7d",
  "Z-A": "#c99a1e", "传说 Z-A": "#c99a1e", "Z-A·异次元": "#c99a1e",
  "晶钻/明珍": "#7b8bb0",
};
function versionColor(label) {
  if (!label) return "#909399";
  if (VERSION_COLORS[label]) return VERSION_COLORS[label];
  if (label.startsWith("剑")) return VERSION_COLORS["剑"];
  if (label.startsWith("盾")) return VERSION_COLORS["盾"];
  if (label.startsWith("朱")) return VERSION_COLORS["朱"];
  if (label.startsWith("紫")) return VERSION_COLORS["紫"];
  if (label.startsWith("晶灿") || label.startsWith("晶钻")) return VERSION_COLORS["晶灿钻石"];
  if (label.startsWith("明亮") || label.startsWith("明珍")) return VERSION_COLORS["明亮珍珠"];
  return "#909399";
}

/* 常见形态标签中文（forms.form_label 未翻译时的兜底显示） */
const FORM_LABEL_ZH = {
  attack: "攻击形态", defense: "防御形态", speed: "速度形态",
  heat: "加热", wash: "清洗", frost: "结冰", fan: "旋转", mow: "切割",
  sunny: "晴天", rainy: "雨水", snowy: "雪云",
  "sandy": "砂土蓑衣", "trash": "垃圾蓑衣", zen: "达摩模式",
  pirouette: "舞步形态", small: "小", large: "大", super: "特大",
  female: "雌性", male: "雄性",
  "totem-alola": "霸主", "alola-cap": "阿罗拉帽子",
  "blue-striped": "蓝条纹", "white-striped": "白条纹",
  origin: "起源形态", altered: "另形态",
};
function formDisplayName(f) {
  if (!f) return "";
  const label = f.form_label || "";
  if (label && /[\u4e00-\u9fff]/.test(label)) return label;
  return FORM_LABEL_ZH[label] || label;
}

/* 特性列表（展开卡）：效果首段内联 + 第九世代说明；多点补充折叠在「详细介绍」 */
const AbilityList = {
  props: ["abilities"],
  template: `<div class="ab-list">
    <div v-for="(a, i) in abilities || []" :key="i" class="ab-card" :class="{hidden: a.hidden}">
      <div class="ab-head">
        <span class="ab-name">{{ a.name }}</span>
        <span v-if="a.hidden" class="ab-hidden-chip">隐藏特性</span>
      </div>
      <div v-if="a.effect" class="ab-effect">{{ a.effect }}</div>
      <div v-if="a.intro" class="ab-intro">{{ a.intro }}</div>
      <el-collapse v-if="a.extra && a.extra.length" style="border:none">
        <el-collapse-item :title="'详细介绍（' + a.extra.length + '）'" :name="i"
          style="--el-collapse-header-height:32px">
          <ul class="ab-extra"><li v-for="(e, j) in a.extra" :key="j">{{ e }}</li></ul>
        </el-collapse-item>
      </el-collapse>
      <div v-if="!a.effect && !a.intro && !(a.extra && a.extra.length)" class="empty-hint">待补充</div>
    </div>
    <div v-if="!(abilities && abilities.length)" class="empty-hint">待补充</div>
  </div>`,
};

/* 精灵球捕捉切换按钮（图鉴卡片交互）：捕捉=红白填充球，未捕捉=灰色描边球 */
const PokeToggle = {
  props: ["caught"],
  emits: ["toggle"],
  template: `<span class="poke-toggle" :class="{caught: caught}" @click.stop="$emit('toggle')"
    :title="caught ? '已捕捉（点击取消标记）' : '标记为已捕捉'">
    <svg viewBox="0 0 24 24" width="24" height="24">
      <circle cx="12" cy="12" r="10" :fill="caught ? '#f5f6f8' : 'none'" opacity="0.95"/>
      <path v-if="caught" d="M2.6 12a10 10 0 0 1 20 0z" fill="#e5484d"/>
      <path v-else d="M2.6 12a10 10 0 0 1 20 0z" fill="#f5f6f8" opacity=".35"/>
      <path v-if="caught" d="M2.6 12a10 10 0 0 0 20 0z" fill="#f5f6f8"/>
      <rect x="2.6" y="11" width="20" height="2" fill="#24292f"/>
      <circle cx="12" cy="12" r="3.6" :fill="caught ? '#f5f6f8' : 'rgba(0,0,0,0)'" stroke="#24292f" stroke-width="1.6"/>
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
      <span class="flavor-tag" :style="{background: versionColor(f.version_label)}">{{ f.version_label }}</span>{{ f.text }}
    </div>
    <div v-if="!flavor || !flavor.length" class="empty-hint">当前版本暂无图鉴描述（待补充）</div>
  </div>`,
  setup() { return { versionColor }; },
};

/* 获取方式（按版本标签分组：本体 / DLC / 版本独占；标签按版本主题色着色） */
const GetMethodList = {
  props: ["rows"],
  template: `<div>
    <template v-for="(g, i) in grouped" :key="i">
      <div class="gm-group">
        <span class="gm-tag" :style="{background: versionColor(g.label), color: '#fff'}">{{ g.label }}</span>
      </div>
      <div v-for="(r, j) in g.rows" :key="i + '-' + j" class="gm-row">
        <span class="gm-loc">{{ r.location || '—' }}</span>
        <span class="gm-method">{{ r.method }}</span>
        <span class="gm-note" v-if="r.note">{{ r.note }}</span>
      </div>
    </template>
    <div v-if="extra.length">
      <div class="gm-group"><span class="gm-tag" style="background:#a8b0c0;color:#fff">地点数据（未翻译）</span></div>
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
  setup() { return { versionColor }; },
};

/* 进化链（支持分支家族；节点为官方绘图 + 名字，条件在箭头下方） */
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
      <poke-img :form-id="node.form_id" :size="64"></poke-img>
      <span class="evo-name">{{ node.name }}</span>
      <type-badge :types="node.types" plain></type-badge>
    </div>
    <template v-if="children.length">
      <div class="evo-children">
        <div v-for="c in children" :key="c" class="evo-child">
          <div class="evo-step">
            <div class="evo-arrow">➜</div>
            <div class="evo-cond">{{ cond(c) || "进化" }}</div>
          </div>
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

const Empty = { template: `<div class="empty-hint"><slot/></div>` };

function registerGlobalComponents(app) {
  app.component("type-badge", TypeBadge);
  app.component("move-class-badge", MoveClassBadge);
  app.component("game-icons", GameIcons);
  app.component("ability-list", AbilityList);
  app.component("poke-toggle", PokeToggle);
  app.component("poke-img", PokeImg);
  app.component("ev-badges", EvBadges);
  app.component("flavor-list", FlavorList);
  app.component("get-method-list", GetMethodList);
  app.component("evo-chain", EvoChain);
  app.component("evo-node", EvoNode);
  app.component("mono-icon", MonoIcon);
  app.component("rail-nav", RailNav);
  app.component("back-btn", BackBtn);
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
