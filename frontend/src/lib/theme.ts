export interface ThemePresetDefinition {
  id: string;
  label: string;
  loadCss?: () => Promise<unknown>;
}

async function loadThemedCss(themeCss: () => Promise<unknown>) {
  await import("../theme/shared/theme.css");
  return themeCss();
}

export const THEME_PRESETS = [
  {
    id: "default",
    label: "默认主题",
  },
  {
    id: "tudodo",
    label: "Tudodo",
    loadCss: () => loadThemedCss(() => import("../theme/tudodo/theme.css")),
  },
  {
    id: "antd",
    label: "Ant Design",
    loadCss: () => loadThemedCss(() => import("../theme/antd/theme.css")),
  },
  {
    id: "layui",
    label: "LayUI",
    loadCss: () => loadThemedCss(() => import("../theme/layui/theme.css")),
  },
] as const satisfies readonly ThemePresetDefinition[];

export type ThemePreset = (typeof THEME_PRESETS)[number]["id"];

export const THEME_STORAGE_KEY = "themePreset";
export const THEME_PRESET_CHANGED_EVENT = "theme-preset-change";
export const DARK_MODE_STORAGE_KEY = "darkMode";

export function isThemePreset(value: unknown): value is ThemePreset {
  return THEME_PRESETS.some((theme) => theme.id === value);
}

export function isThemedPreset(preset: ThemePreset): boolean {
  return preset !== "default";
}

export function getThemePreset(): ThemePreset {
  const stored = localStorage.getItem(THEME_STORAGE_KEY);
  if (stored === "quiet") {
    localStorage.setItem(THEME_STORAGE_KEY, "tudodo");
    return "tudodo";
  }
  return isThemePreset(stored) ? stored : "default";
}

export function applyThemePreset(preset: ThemePreset, darkMode: boolean) {
  const root = document.documentElement;
  if (preset === "default") {
    root.removeAttribute("data-theme");
  } else {
    root.setAttribute("data-theme", preset);
  }
  root.classList.toggle("dark", darkMode);
  window.dispatchEvent(new CustomEvent(THEME_PRESET_CHANGED_EVENT));
}
