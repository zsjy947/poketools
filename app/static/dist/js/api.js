/* 轻量 API 封装：失败时派发全局事件（app.js 统一 toast） */
function _apiError(e) {
  console.error(e);
  try { window.dispatchEvent(new CustomEvent("api-error", { detail: String(e.message || e) })); } catch (_) {}
}
async function apiGet(url, params = {}) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") qs.set(k, v);
  }
  const s = qs.toString();
  let res;
  try {
    res = await fetch(url + (s ? "?" + s : ""));
  } catch (e) { _apiError(new Error("网络请求失败：" + url)); throw e; }
  if (!res.ok) {
    const e = new Error((await res.json().catch(() => ({}))).detail || res.statusText);
    _apiError(e); throw e;
  }
  return res.json();
}
async function apiSend(method, url, body) {
  let res;
  try {
    res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (e) { _apiError(new Error("网络请求失败：" + url)); throw e; }
  if (!res.ok) {
    const e = new Error((await res.json().catch(() => ({}))).detail || res.statusText);
    _apiError(e); throw e;
  }
  return res.json();
}

const TYPE_LIST = ["一般", "火", "水", "电", "草", "冰", "格斗", "毒", "地面",
  "飞行", "超能力", "虫", "岩石", "幽灵", "龙", "恶", "钢", "妖精"];
const EV_NAMES = { hp: "HP", atk: "攻击", def: "防御", spa: "特攻", spd: "特防", spe: "速度" };
const POWER_LIST = ["蛋蛋力", "遭遇力", "闪光力", "捕获力", "大大力", "小小力", "经验力", "掉物力", "团战力", "称号力"];
const POWER_COLORS = {
  "蛋蛋力": "#f6a5c8", "遭遇力": "#7bc86c", "闪光力": "#f2d24b", "捕获力": "#e8834a",
  "大大力": "#e05a5a", "小小力": "#6fc7e8", "经验力": "#8f7ff0", "掉物力": "#63b0a2",
  "团战力": "#5a9be0", "称号力": "#c8a2d8",
};

const STAT_KEYS = ["hp", "atk", "def", "spa", "spd", "spe"];
const STAT_ZH = { hp: "HP", atk: "攻击", def: "防御", spa: "特攻", spd: "特防", spe: "速度" };
