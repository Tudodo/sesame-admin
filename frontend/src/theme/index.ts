import { THEME_PRESETS, type ThemePreset } from "@/lib/theme";

const themeCssCache = new Map<ThemePreset, Promise<unknown>>();

async function loadThemeCss(preset: ThemePreset): Promise<unknown> {
  const definition = THEME_PRESETS.find((theme) => theme.id === preset);
  if (!definition) return undefined;

  if (definition.loadCss) {
    return definition.loadCss();
  }

  return undefined;
}

export function loadThemeAssets(preset: ThemePreset): Promise<unknown> {
  const cached = themeCssCache.get(preset);
  if (cached) return cached;
  const promise = loadThemeCss(preset);
  themeCssCache.set(preset, promise);
  return promise;
}

export { THEME_PRESETS } from "@/lib/theme";
export type { ThemePresetDefinition } from "@/lib/theme";
