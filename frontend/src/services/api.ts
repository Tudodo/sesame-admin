import { DARK_MODE_STORAGE_KEY } from "@/lib/theme";
import { safeLocalStorage } from "@/lib/utils";

const API_BASE = "/api";

/** 仅允许同源 API 路径，阻止绝对地址或协议相对地址泄漏会话凭据。 */
function resolveApiUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) throw new Error("API 地址不能为空");
  if (!isSafeApiPath(trimmed)) throw new Error("仅允许同源 API 请求");
  const normalized = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  if (normalized === "/api" || normalized.startsWith("/api/"))
    return normalized;
  return `${API_BASE}${normalized}`;
}

/** 是否只指向当前站点的同源 API 相对路径。 */
export function isSafeApiPath(url: string): boolean {
  const trimmed = url.trim();
  if (!trimmed) return false;
  return !(
    /^[a-z][a-z\d+.-]*:/i.test(trimmed) ||
    trimmed.startsWith("//") ||
    trimmed.includes("\\")
  );
}

/** 是否为服务端返回的 HTML 页面（如反向代理的 SPA fallback 或错误页）。 */
export function isHtmlPageBody(text: string): boolean {
  const trimmed = text.trimStart();
  return /^<!doctype html/i.test(trimmed) || /^<html/i.test(trimmed);
}

const CSRF_COOKIE_NAME = "loco_csrf";

// Browser sessions authenticate via the HttpOnly loco_token cookie. The
// tokenGetter hook is only kept for external/legacy Bearer-token callers.
let tokenGetter: () => string | null = () => null;

export function setTokenGetter(fn: () => string | null) {
  tokenGetter = fn;
}

let redirectingToLogin = false;

/**
 * 401 now only means the supplied token is missing/invalid/expired. Clear the
 * stale session and let the app render the login screen; do not show a
 * misleading Unauthorized error on every page while the SPA is still logged in.
 */
export function handleUnauthorized() {
  if (redirectingToLogin) return;
  redirectingToLogin = true;
  clearSessionState();
  window.location.reload();
}

/** 后端会话被注销时返回 403；只在明确命中该错误时才清会话回登录页，避免误伤普通无权限 403。 */
export async function maybeHandleSessionRevoked(
  response: Response,
  redirectOnSessionRevoked = true,
): Promise<void> {
  if (response.status !== 403 || !redirectOnSessionRevoked) return;
  const text = await response
    .clone()
    .text()
    .catch(() => "");
  if (!text.trim()) return;
  try {
    const body = JSON.parse(text) as Record<string, unknown>;
    if (
      body.error === "forbidden" &&
      body.description === "会话已被注销，请重新登录"
    ) {
      handleUnauthorized();
    }
  } catch {
    // 普通 403 透传给调用方展示具体权限提示。
  }
}

/** 判断错误是否来自后端"会话已被注销"响应，供启动引导等关闭自动重定向的调用使用。 */
export function isSessionRevokedError(error: unknown): boolean {
  return (
    error instanceof Error && error.message.includes("会话已被注销，请重新登录")
  );
}

/** Clear session data without wiping user-selected theme preferences. */
export function clearSessionState() {
  try {
    const darkMode = localStorage.getItem(DARK_MODE_STORAGE_KEY);
    const tenantCode = localStorage.getItem("tenantCode");
    const currentRoute = localStorage.getItem("currentRoute");
    localStorage.clear();
    if (darkMode) localStorage.setItem(DARK_MODE_STORAGE_KEY, darkMode);
    if (tenantCode) localStorage.setItem("tenantCode", tenantCode);
    // Preserve the last route so that after re-login the user returns to
    // the page they were on, instead of being dropped on the dashboard.
    if (currentRoute) localStorage.setItem("currentRoute", currentRoute);
  } catch {
    // localStorage may be unavailable in private browsing mode or when
    // storage quota is exceeded. Swallow so that 401 redirect still works.
  }
}

export function isLoginRequest(url: string) {
  return url === "/auth/login";
}

export async function parseErrorBody(response: Response): Promise<string> {
  const text = await response.text().catch(() => "");
  const fallback =
    httpStatusMessage(response.status) || `HTTP ${response.status}`;
  const rawText = text.trim();
  if (isHtmlPageBody(rawText)) {
    return fallback;
  }
  let msg = rawText.slice(0, 200) || fallback;
  try {
    const body = JSON.parse(text);
    if (body && typeof body === "object") {
      // 后端错误响应有三种格式：
      //   1. { "description": "可读文案" }          — Loco 控制器主流格式
      //   2. { "error": "machine_code", "message": "可读文案" } — 中间件格式（限流/CSRF/会话存储）
      //   3. { "error": "可读文案" }                — 部分控制器直接放文案
      // 优先取 description / message 等可读字段；error 字段可能是机器码
      // （如 rate_limited、csrf_missing），不能直接展示给用户。
      const readable =
        body.description ?? body.message ?? body.msg ?? body.detail;
      if (typeof readable === "string" && readable.trim()) {
        msg = readable;
      } else if (typeof body.error === "string" && !isMachineCode(body.error)) {
        msg = body.error;
      } else {
        msg = fallback;
      }
      if (isGenericHttpText(msg)) msg = fallback;
      return msg;
    }
  } catch {
    // 非 JSON 错误体保留可读文本；5xx 不向用户展示原始内容
    if (response.status >= 500) {
      console.warn("服务端错误响应内容仅用于诊断", rawText);
      return fallback;
    }
  }
  if (isGenericHttpText(msg)) msg = fallback;
  return msg;
}

function parseJsonResponse<T>(text: string): T {
  try {
    return JSON.parse(text) as T;
  } catch {
    console.warn("服务返回了无法解析的数据，响应内容仅用于诊断", text);
    throw new Error("服务返回了无法解析的数据，请稍后重试");
  }
}

/** JSON 响应严格解析；XML/纯文本响应保留原样，供 BPMN 等接口使用。 */
function parseJsonOrText<T>(text: string, contentType: string): T {
  const trimmed = text.trim();
  if (contentType.includes("html") || isHtmlPageBody(trimmed)) {
    throw new Error("服务返回了无法解析的数据：非 JSON 页面响应");
  }
  const looksJson =
    contentType.includes("json") ||
    trimmed.startsWith("{") ||
    trimmed.startsWith("[");
  if (!looksJson) return text as T;
  return parseJsonResponse<T>(text);
}

function getCsrfToken(): string | null {
  const cookie = document.cookie
    .split("; ")
    .find((part) => part.startsWith(`${CSRF_COOKIE_NAME}=`));
  if (!cookie) return null;
  return decodeURIComponent(cookie.slice(CSRF_COOKIE_NAME.length + 1));
}

/** Centralized auth + tenant headers for raw fetch calls. */
export function authHeaders(): Record<string, string> {
  const h: Record<string, string> = {
    "X-Tenant-Code": safeLocalStorage.getItem("tenantCode") || "default",
  };
  const token = tokenGetter();
  if (token) h.Authorization = `Bearer ${token}`;
  const csrfToken = getCsrfToken();
  if (csrfToken) h["X-CSRF-Token"] = csrfToken;
  return h;
}

/** Generic JSON-compatible type for API payloads. */
// biome-ignore lint/suspicious/noExplicitAny: intentional generic default for API layer
type Json = Record<string, any>;

export async function request<T = Json>(
  url: string,
  options: RequestInit = {},
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...authHeaders(),
    ...((options.headers as Record<string, string>) || {}),
  };

  const response = await safeFetch(resolveApiUrl(url), { ...options, headers });

  if (response.status === 401) {
    // Login failures are expected and handled by the login form itself;
    // every other 401 means the stored token is no longer usable.
    if (!isLoginRequest(url)) handleUnauthorized();
    // Login failures: surface the server-provided message (e.g. 账号或密码错误).
    // Other 401s: token no longer usable; redirect, then surface a friendly message.
    const bodyMsg = await parseErrorBody(response);
    if (isLoginRequest(url)) {
      throw new Error(bodyMsg || "账号或密码错误");
    }
    throw new Error(bodyMsg || "登录已过期，请重新登录");
  }

  await maybeHandleSessionRevoked(response);
  if (!response.ok) {
    throw new Error(await parseErrorBody(response));
  }

  const text = await response.text();
  if (!text) return undefined as T;
  return parseJsonResponse<T>(text);
}

export interface User {
  pid: string;
  name: string;
  email: string;
  [key: string]: unknown;
}

export interface MenuData {
  id: number;
  name: string;
  path: string | null;
  icon: string | null;
  parent_id: number | null;
  sort_order: number;
  permission: string | null;
  visible: boolean;
  menu_type: string;
  available_actions: string[];
  granted_actions: string[];
}

/** Centralized fetch helper for pages that previously used raw fetch().
 * Adds auth/tenant headers, redirects on 401, parses JSON/text bodies, and
 * surfaces backend error descriptions instead of raw HTTP statuses.
 */
export async function apiFetch<T = unknown>(
  url: string,
  options: RequestInit = {},
  redirectOn401 = true,
): Promise<T> {
  const headers: Record<string, string> = {
    ...authHeaders(),
    ...((options.headers as Record<string, string>) || {}),
  };
  const hasJsonBody = options.body !== undefined && options.body !== null;
  if (
    hasJsonBody &&
    !(options.body instanceof FormData) &&
    !hasContentType(headers)
  ) {
    headers["Content-Type"] = "application/json";
  }
  const target = resolveApiUrl(url);
  const response = await safeFetch(target, { ...options, headers });

  if (response.status === 401) {
    if (redirectOn401) handleUnauthorized();
    throw new Error(await parseErrorBody(response));
  }

  await maybeHandleSessionRevoked(response, redirectOn401);
  if (!response.ok) {
    throw new Error(await parseErrorBody(response));
  }

  if (response.status === 204) return undefined as T;
  const text = await response.text();
  if (!text) return undefined as T;
  return parseJsonOrText<T>(text, response.headers.get("content-type") || "");
}

function hasContentType(headers: Record<string, string>): boolean {
  return Object.keys(headers).some(
    (key) => key.toLowerCase() === "content-type",
  );
}

/** Public fetch helper for pages that run before login. It does not attach
 * auth/tenant headers and never redirects on 401, preserving public endpoints.
 */
export async function publicFetch<T = unknown>(
  url: string,
  options: RequestInit = {},
): Promise<T> {
  const headers: Record<string, string> = {
    ...((options.headers as Record<string, string>) || {}),
  };
  const hasJsonBody = options.body !== undefined && options.body !== null;
  if (
    hasJsonBody &&
    !(options.body instanceof FormData) &&
    !hasContentType(headers)
  ) {
    headers["Content-Type"] = "application/json";
  }
  const response = await safeFetch(resolveApiUrl(url), { ...options, headers });
  if (!response.ok) {
    throw new Error(await parseErrorBody(response));
  }
  if (response.status === 204) return undefined as T;
  const text = await response.text();
  if (!text) return undefined as T;
  return parseJsonOrText<T>(text, response.headers.get("content-type") || "");
}

/** Download helper for blob responses with the same auth and error handling
 * as the rest of the API layer.
 */
export async function downloadFile(url: string): Promise<Blob> {
  const response = await safeFetch(resolveApiUrl(url), {
    headers: authHeaders(),
  });
  if (response.status === 401) {
    handleUnauthorized();
    throw new Error(await parseErrorBody(response));
  }
  await maybeHandleSessionRevoked(response);
  if (!response.ok) {
    throw new Error(await parseErrorBody(response));
  }
  return response.blob();
}

export async function login(email: string, password: string) {
  return request<{
    token: string;
    pid: string;
    name: string;
    email: string;
    roles: string[];
    permissions: string[];
    menus: MenuData[];
  }>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export async function listPublicTenants(): Promise<
  { code: string; name: string }[]
> {
  return request<{ code: string; name: string }[]>("/auth/public-tenants");
}

export async function getCurrentUser(redirectOn401 = true) {
  return apiFetch<{
    pid: string;
    name: string;
    email: string;
    roles: string[];
    permissions: string[];
    menus: MenuData[];
  }>("/api/auth/current", {}, redirectOn401);
}

export async function logout() {
  try {
    // 清除服务端会话；忽略失败，前端仍会清理本地状态并回到登录页。
    await apiFetch("/api/auth/logout", { method: "POST" }, false);
  } catch {
    // 服务端会话可能已失效，继续清理本地状态。
  }
  safeLocalStorage.removeItem("token");
  safeLocalStorage.removeItem("user");
  safeLocalStorage.removeItem("roles");
  safeLocalStorage.removeItem("menus");
  safeLocalStorage.removeItem("tenantCode");
  safeLocalStorage.removeItem("permissions");
  safeLocalStorage.removeItem("currentRoute");
  safeLocalStorage.removeItem("currentActions");
  safeLocalStorage.removeItem("currentAvailableActions");
}

export interface ListResult<T> {
  data: T[];
  total: number;
}

const MAX_PAGE_SIZE = 500;

/** 分页拉取管理接口全量数据，避免服务端单页上限导致下拉选项被截断。 */
export async function listAll<T = Json>(
  resource: string,
  params: Record<string, unknown> = {},
): Promise<T[]> {
  const items: T[] = [];
  for (let start = 0; ; start += MAX_PAGE_SIZE) {
    const res = await getList<T>(resource, {
      ...params,
      _start: start,
      _end: start + MAX_PAGE_SIZE,
    });
    const pageItems = res.data || [];
    items.push(...pageItems);
    if (items.length >= res.total || pageItems.length < MAX_PAGE_SIZE) break;
  }
  return items;
}

export async function getList<T = Json>(
  resource: string,
  params: Record<string, unknown> = {},
): Promise<ListResult<T>> {
  const query = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") query.set(k, String(v));
  }
  const qs = query.toString();
  const path = `/${resource.replace(/^\/+/, "")}${qs ? `?${qs}` : ""}`;
  const response = await safeFetch(resolveApiUrl(path), {
    headers: {
      ...authHeaders(),
      "Content-Type": "application/json",
    },
  });
  if (response.status === 401) {
    handleUnauthorized();
    throw new Error(await parseErrorBody(response));
  }
  await maybeHandleSessionRevoked(response);
  if (!response.ok) {
    throw new Error(await parseErrorBody(response));
  }
  if (response.status === 204) return { data: [], total: 0 };
  const text = await response.text().catch(() => "");
  if (!text) return { data: [], total: 0 };
  const data = parseJsonResponse<unknown>(text);
  let total = Number.parseInt(response.headers.get("X-Total-Count") || "0", 10);
  let items: unknown[] = [];
  if (Array.isArray(data)) {
    items = data;
  } else if (data && typeof data === "object") {
    // 兼容后端返回 { data: [...], total } 的分页对象；
    // 普通管理接口仍以数组 + X-Total-Count 为主。
    const obj = data as Record<string, unknown>;
    if (Array.isArray(obj.data)) {
      items = obj.data as unknown[];
      if (!total) {
        const bodyTotal = Number(obj.total);
        if (Number.isFinite(bodyTotal) && bodyTotal >= 0) total = bodyTotal;
      }
    }
  }
  return { data: items as T[], total };
}

export interface ListWithMetaResult<
  T,
  M extends object = Record<string, never>,
> {
  data: T[];
  total: number;
  meta: M;
}

/** 兼容数组或 { data, total, ...meta } 两种分页响应，并保留额外元数据。 */
export async function getListWithMeta<
  T = Json,
  M extends object = Record<string, never>,
>(
  resource: string,
  params: Record<string, unknown> = {},
): Promise<ListWithMetaResult<T, M>> {
  const [rawPath, rawQuery = ""] = resource.replace(/^\/+/, "").split("?");
  const query = new URLSearchParams(rawQuery);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") query.set(k, String(v));
  }
  const qs = query.toString();
  const path = `/${rawPath}${qs ? `?${qs}` : ""}`;
  const response = await safeFetch(resolveApiUrl(path), {
    headers: {
      ...authHeaders(),
      "Content-Type": "application/json",
    },
  });
  if (response.status === 401) {
    handleUnauthorized();
    throw new Error(await parseErrorBody(response));
  }
  await maybeHandleSessionRevoked(response);
  if (!response.ok) {
    throw new Error(await parseErrorBody(response));
  }
  if (response.status === 204) return { data: [], total: 0, meta: {} as M };
  const text = await response.text().catch(() => "");
  if (!text) return { data: [], total: 0, meta: {} as M };
  const data = parseJsonResponse<unknown>(text);
  let total = Number.parseInt(response.headers.get("X-Total-Count") || "0", 10);
  let items: unknown[] = [];
  let meta: object = {};
  if (Array.isArray(data)) {
    items = data;
  } else if (data && typeof data === "object") {
    const obj = data as Record<string, unknown>;
    meta = obj;
    if (Array.isArray(obj.data)) {
      items = obj.data as unknown[];
      if (!total) {
        const bodyTotal = Number(obj.total);
        if (Number.isFinite(bodyTotal) && bodyTotal >= 0) total = bodyTotal;
      }
    }
  }
  return { data: items as T[], total, meta: meta as M };
}

export async function getOne<T = Json>(
  resource: string,
  id: number | string,
): Promise<T> {
  return request<T>(`/${resource}/${id}`);
}

export async function create<T = Json>(
  resource: string,
  data: unknown,
): Promise<T> {
  return request<T>(`/${resource}`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function update<T = Json>(
  resource: string,
  id: number | string,
  data: unknown,
): Promise<T> {
  return request<T>(`/${resource}/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export async function remove(
  resource: string,
  id: number | string,
): Promise<void> {
  await request(`/${resource}/${id}`, { method: "DELETE" });
}

export async function listUsers(): Promise<User[]> {
  return getList<User>("users", { _end: 999 }).then((r) => r.data || []);
}

function httpStatusMessage(status: number): string | null {
  switch (status) {
    case 400:
      return "请求参数不正确，请检查后重试";
    case 401:
      return "登录已失效，请重新登录";
    case 403:
      return "没有权限执行此操作";
    case 404:
      return "请求的资源不存在";
    case 413:
      return "请求数据过大，请减少数据量后重试";
    case 408:
      return "请求超时，请稍后重试";
    case 429:
      return "操作过于频繁，请稍后重试";
    case 500:
    case 502:
    case 503:
      return "服务暂时不可用，请稍后重试";
    case 504:
      return "请求超时，请稍后重试";
    default:
      return null;
  }
}
function isGenericHttpText(value: string): boolean {
  const lower = value.trim().toLowerCase();
  return (
    lower === "internal server error" ||
    lower === "bad gateway" ||
    lower === "service unavailable" ||
    lower === "gateway timeout" ||
    lower === "request timeout" ||
    lower === "too many requests" ||
    lower === "not found" ||
    lower === "unauthorized" ||
    lower === "forbidden"
  );
}

/** 判断 error 字段值是否为机器码而非可读文案。
 * 机器码特征：全小写 + 下划线分隔的 snake_case 标识符，如
 * rate_limited、csrf_missing、session_store_unavailable。
 * 可读文案通常包含空格、中文或大小写混用。
 */
function isMachineCode(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return true;
  // 包含空格或非 ASCII 字符 → 可读文案
  if (/\s/.test(trimmed)) return false;
  for (const ch of trimmed) {
    const cp = ch.codePointAt(0);
    if (cp !== undefined && cp > 127) return false;
  }
  // 纯 snake_case 标识符（仅小写字母、数字、下划线）→ 机器码
  return /^[a-z][a-z0-9_]*$/.test(trimmed);
}

export async function safeFetch(
  input: Parameters<typeof fetch>[0],
  init?: RequestInit,
): Promise<Response> {
  try {
    // 客户端超时兜底：后端已有 60s 超时中间件，此处设 90s 作为最后防线，
    // 避免极端情况下请求无限挂起、加载图标永远转。
    const DEFAULT_TIMEOUT_MS = 90_000;
    const hasUserSignal = init?.signal;
    if (hasUserSignal) {
      return await fetch(input, init);
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
    try {
      return await fetch(input, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  } catch (error) {
    if (
      typeof DOMException !== "undefined" &&
      error instanceof DOMException &&
      error.name === "AbortError"
    ) {
      // 超时中止（非调用方自带 signal）→ 提示用户请求超时
      throw new Error("请求超时，请稍后重试");
    }
    const raw = error instanceof Error ? error.message : "";
    const domName = error instanceof DOMException ? error.name : "";
    if (
      domName === "NetworkError" ||
      /failed to fetch|networkerror|load failed|fetch failed|network request failed|err_internet_disconnected|err_connection_refused|err_connection_reset|err_network_changed|err_name_not_resolved|err_ssl_protocol_error/i.test(
        raw,
      )
    ) {
      throw new Error("网络请求失败，请检查网络后重试");
    }
    throw error instanceof Error
      ? error
      : new Error("网络请求失败，请检查网络后重试");
  }
}
