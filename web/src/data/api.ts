/* 轻量 API 封装（统一壳）：桌面开发模式可连 FastAPI；后端不可达时自动切换本地引擎
 * （./local-api，JSON 分片），端点签名不变。纯静态/Tauri/APK 场景恒走本地。 */
import { handle as localHandle } from "./local-api";

export function apiErrorEvent(e: unknown): void {
  console.error(e);
  try {
    window.dispatchEvent(
      new CustomEvent("api-error", { detail: String((e as Error).message || e) }),
    );
  } catch {
    /* 无 window（测试环境） */
  }
}

let _localMode = false; // 一旦后端判定不可达（APK/Tauri 壳）即常驻本地模式
let _backendConfirmed = false; // 首个 JSON 响应确认后端在线；此前任何失败都视为「无后端」转本地

async function _localDispatch(method: string, url: string, params: any, body: any): Promise<any> {
  try {
    return await localHandle(method, url, params || body);
  } catch (e) {
    apiErrorEvent(e);
    throw e;
  }
}

function _looksStatic(res: Response): boolean {
  /* 壳内静态服务特征：200 但非 JSON（SPA 兜底 HTML）；未确认后端时的 404 */
  const ctype = res.headers.get("content-type") || "";
  return (
    (res.ok && !ctype.includes("application/json")) || (!_backendConfirmed && res.status === 404)
  );
}

export async function apiGet(url: string, params: Record<string, any> = {}): Promise<any> {
  if (_localMode) return _localDispatch("GET", url, params, null);
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") qs.set(k, v);
  }
  const s = qs.toString();
  let res: Response;
  try {
    res = await fetch(url + (s ? "?" + s : ""));
  } catch {
    _localMode = true; // 无后端（连接拒绝）→ 本地数据引擎
    return _localDispatch("GET", url, params, null);
  }
  const ctype = res.headers.get("content-type") || "";
  if (res.ok && ctype.includes("application/json")) {
    _backendConfirmed = true;
    return res.json();
  }
  if (_looksStatic(res)) {
    _localMode = true; // 壳内静态服务（HTML/404 兜底）→ 本地数据引擎
    return _localDispatch("GET", url, params, null);
  }
  const e = new Error((await res.json().catch(() => ({}))).detail || res.statusText);
  apiErrorEvent(e); // 真实后端的 4xx/5xx：照常报错，不误切本地
  throw e;
}

export async function apiSend(method: string, url: string, body?: any): Promise<any> {
  if (_localMode) return _localDispatch(method, url, null, body);
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    _localMode = true;
    return _localDispatch(method, url, null, body);
  }
  const ctype = res.headers.get("content-type") || "";
  if (res.ok && ctype.includes("application/json")) {
    _backendConfirmed = true;
    return res.json();
  }
  if (_looksStatic(res)) {
    _localMode = true; // POST 打到壳内静态服务（非 JSON 响应）→ 本地写入
    return _localDispatch(method, url, null, body);
  }
  const e = new Error((await res.json().catch(() => ({}))).detail || res.statusText);
  apiErrorEvent(e);
  throw e;
}

/** 测试用：重置后端判定状态 */
export function _resetApiMode(): void {
  _localMode = false;
  _backendConfirmed = false;
}

/* UI 面向领域常量：单源在 ./constants（此处 re-export 维持既有 import 路径） */
export { TYPE_LIST, STAT_KEYS, STAT_ZH, EV_NAMES, POWER_LIST, POWER_COLORS } from "./constants";
