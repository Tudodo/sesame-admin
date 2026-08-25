import { safeLocalStorage } from "@/lib/utils";

/**
 * 单主题模式：所有色彩变量直接定义在 index.css 的 :root / .dark 中，
 * 使用 oklch 原值，与 swipath-web / web-agent 完全一致。
 * 这里只保留暗色模式切换逻辑。
 */

export const DARK_MODE_STORAGE_KEY = "darkMode";

export function getDarkMode(): boolean {
  const stored = safeLocalStorage.getItem(DARK_MODE_STORAGE_KEY);
  if (stored !== null) return stored === "true";
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function applyDarkMode(darkMode: boolean) {
  document.documentElement.classList.toggle("dark", darkMode);
}
