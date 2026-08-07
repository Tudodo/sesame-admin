import { DARK_MODE_STORAGE_KEY, THEME_STORAGE_KEY } from "@/lib/theme";

const API_BASE = "/api";

/** 仅允许同源 API 路径，阻止绝对地址或协议相对地址泄漏会话凭据。 */
function resolveApiUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) throw new Error("API 地址不能为空");
  if (
    /^[a-z][a-z\d+.-]*:/i.test(trimmed) ||
    trimmed.startsWith("//") ||
    trimmed.includes("\\")
  ) {
    throw new Error("仅允许同源 API 请求");
  }
  const normalized = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  if (normalized === "/api" || normalized.startsWith("/api/"))
    return normalized;
  return `${API_BASE}${normalized}`;
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

/** Clear session data without wiping user-selected theme preferences. */
export function clearSessionState() {
  const themePreset = localStorage.getItem(THEME_STORAGE_KEY);
  const darkMode = localStorage.getItem(DARK_MODE_STORAGE_KEY);
  localStorage.clear();
  if (themePreset) localStorage.setItem(THEME_STORAGE_KEY, themePreset);
  if (darkMode) localStorage.setItem(DARK_MODE_STORAGE_KEY, darkMode);
}

export function isLoginRequest(url: string) {
  return url === "/auth/login";
}

async function parseErrorBody(response: Response): Promise<string> {
  const text = await response.text().catch(() => "");
  let msg = text || `HTTP ${response.status}`;
  try {
    const body = JSON.parse(text);
    if (body && typeof body === "object") {
      if (body.description) msg = body.description;
      else if (body.error) msg = body.error;
    }
  } catch {
    // 非 JSON 错误体（如纯文本、空响应），用原文
  }
  return msg;
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
    "X-Tenant-Code": localStorage.getItem("tenantCode") || "default",
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

  const response = await fetch(resolveApiUrl(url), { ...options, headers });

  if (response.status === 401) {
    // Login failures are expected and handled by the login form itself;
    // every other 401 means the stored token is no longer usable.
    if (!isLoginRequest(url)) handleUnauthorized();
    throw new Error("Unauthorized");
  }

  if (!response.ok) {
    throw new Error(await parseErrorBody(response));
  }

  const text = await response.text();
  if (!text) return undefined as T;
  return JSON.parse(text) as T;
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
  const response = await fetch(target, { ...options, headers });

  if (response.status === 401) {
    if (redirectOn401) handleUnauthorized();
    throw new Error("Unauthorized");
  }

  if (!response.ok) {
    throw new Error(await parseErrorBody(response));
  }

  if (response.status === 204) return undefined as T;
  const text = await response.text();
  if (!text) return undefined as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    return text as T;
  }
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
  const response = await fetch(resolveApiUrl(url), { ...options, headers });
  if (!response.ok) {
    throw new Error(await parseErrorBody(response));
  }
  if (response.status === 204) return undefined as T;
  const text = await response.text();
  if (!text) return undefined as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    return text as T;
  }
}

/** Download helper for blob responses with the same auth and error handling
 * as the rest of the API layer.
 */
export async function downloadFile(url: string): Promise<Blob> {
  const response = await fetch(resolveApiUrl(url), {
    headers: authHeaders(),
  });
  if (response.status === 401) {
    handleUnauthorized();
    throw new Error("Unauthorized");
  }
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
  localStorage.removeItem("token");
  localStorage.removeItem("user");
  localStorage.removeItem("roles");
  localStorage.removeItem("menus");
  localStorage.removeItem("tenantCode");
  localStorage.removeItem("permissions");
  localStorage.removeItem("currentRoute");
  localStorage.removeItem("currentActions");
  localStorage.removeItem("currentAvailableActions");
}

export interface ListResult<T> {
  data: T[];
  total: number;
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
  const response = await fetch(resolveApiUrl(path), {
    headers: {
      ...authHeaders(),
      "Content-Type": "application/json",
    },
  });
  if (response.status === 401) {
    handleUnauthorized();
    throw new Error("Unauthorized");
  }
  if (!response.ok) {
    throw new Error(await parseErrorBody(response));
  }
  if (response.status === 204) return { data: [], total: 0 };
  const text = await response.text().catch(() => "");
  if (!text) return { data: [], total: 0 };
  let data: unknown;
  try {
    data = JSON.parse(text) as unknown;
  } catch {
    throw new Error(text || `HTTP ${response.status}`);
  }
  const total =
    Number.parseInt(response.headers.get("X-Total-Count") || "0", 10) ||
    (Array.isArray(data) ? data.length : 0);
  return { data: Array.isArray(data) ? data : [], total };
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
