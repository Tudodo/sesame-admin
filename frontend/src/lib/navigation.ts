type Navigator = (path: string) => void;

let navigator: Navigator | null = null;

/**
 * Register the SPA-level navigator so any component (or notification click)
 * can change the active route without a full page reload.
 *
 * Pages mounted inside AdminLayout should prefer the `onRouteChange` prop, but
 * standalone screens (Notifications, StartLeave success view, ...) only have
 * access to this global entry point.
 */
export function setNavigator(fn: Navigator | null) {
  navigator = fn;
}

function isSafeAppPath(path: string): boolean {
  if (!path.startsWith("/")) return false;
  try {
    const parsed = new URL(path, window.location.origin);
    return parsed.origin === window.location.origin;
  } catch {
    return false;
  }
}

/**
 * Navigate to an in-app route using the registered SPA navigator.
 *
 * Falls back to a full page reload only when no navigator is registered yet
 * (e.g. navigated directly before the app shell mounted), preserving the old
 * behavior instead of silently dropping the request.
 *
 * Only same-origin absolute in-app paths are accepted. This blocks protocol
 * URLs, protocol-relative URLs (`//host`), and backslash-normalized external
 * URLs that could be injected via a server-supplied notification link.
 */
export function navigate(path: string) {
  if (!isSafeAppPath(path)) return;
  if (navigator) {
    navigator(path);
    return;
  }
  window.location.href = path;
}

/**
 * Reload the current page after a context switch that invalidates the token
 * (tenant switch, logout). This is intentionally a real reload.
 */
export function hardReload() {
  window.location.reload();
}
