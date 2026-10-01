/* 轻量 API 封装：失败时派发全局事件（app.js 统一 toast）。
 * 路线 B（APK/统一壳）：后端不可达时自动切换本地数据引擎（js/local/*，JSON 分片），
 * 端点签名不变、前端视图零改动；正常桌面模式仍走 FastAPI。 */
function _apiError(e) {
  console.error(e);
  e._toasted = true;   // 页面级 catch 据此跳过重复 toast（P2-3 去重）
  try { window.dispatchEvent(new CustomEvent("api-error", { detail: String(e.message || e) })); } catch (_) {}
}

let _localMode = false;        // 一旦后端判定不可达（APK/Tauri 壳）即常驻本地模式
let _backendConfirmed = false; // 首个 JSON 响应确认后端在线；此前任何失败都视为「无后端」转本地

async function _localDispatch(method, url, params, body) {
  try {
    return await window.__PKT_LOCAL__.localApi.handle(method, url, params || body);
  } catch (e) {
    _apiError(e);
    throw e;
  }
}

function _looksStatic(res) {
  /* 壳内静态服务特征：200 但非 JSON（SPA 兜底 HTML）；未确认后端时的 404 */
  const ctype = res.headers.get("content-type") || "";
  return (res.ok && !ctype.includes("application/json")) || (!_backendConfirmed && res.status === 404);
}

async function apiGet(url, params = {}) {
  if (_localMode) return _localDispatch("GET", url, params);
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") qs.set(k, v);
  }
  const s = qs.toString();
  let res;
  try {
    res = await fetch(url + (s ? "?" + s : ""));
  } catch (e) {
    _localMode = true;   // 无后端（连接拒绝）→ 本地数据引擎
    return _localDispatch("GET", url, params);
  }
  const ctype = res.headers.get("content-type") || "";
  if (res.ok && ctype.includes("application/json")) {
    _backendConfirmed = true;
    return res.json();
  }
  if (_looksStatic(res)) {
    _localMode = true;   // 壳内静态服务（HTML/404 兜底）→ 本地数据引擎
    return _localDispatch("GET", url, params);
  }
  const e = new Error((await res.json().catch(() => ({}))).detail || res.statusText);
  _apiError(e);          // 真实后端的 4xx/5xx：照常报错，不误切本地
  throw e;
}
async function apiSend(method, url, body) {
  if (_localMode) return _localDispatch(method, url, null, body);
  let res;
  try {
    res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (e) {
    _localMode = true;
    return _localDispatch(method, url, null, body);
  }
  const ctype = res.headers.get("content-type") || "";
  if (res.ok && ctype.includes("application/json")) {
    _backendConfirmed = true;
    return res.json();
  }
  if (_looksStatic(res)) {
    _localMode = true;   // POST 打到壳内静态服务（非 JSON 响应）→ 本地写入
    return _localDispatch(method, url, null, body);
  }
  const e = new Error((await res.json().catch(() => ({}))).detail || res.statusText);
  _apiError(e);
  throw e;
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
