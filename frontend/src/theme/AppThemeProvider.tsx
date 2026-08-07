import {
  DARK_MODE_STORAGE_KEY,
  THEME_STORAGE_KEY,
  type ThemePreset,
  applyThemePreset,
  getThemePreset,
} from "@/lib/theme";
import { loadThemeAssets } from "@/theme";
import type React from "react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

interface ThemeContextValue {
  themePreset: ThemePreset;
  darkMode: boolean;
  setThemePreset: (preset: ThemePreset) => void;
  setDarkMode: (darkMode: boolean) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function AppThemeProvider({ children }: { children: React.ReactNode }) {
  return <ThemeProvider>{children}</ThemeProvider>;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [requestedPreset, setRequestedPresetState] = useState<ThemePreset>(() =>
    getThemePreset(),
  );
  const [themePreset, setThemePresetState] = useState<ThemePreset>(() =>
    getThemePreset(),
  );
  const [darkMode, setDarkModeState] = useState(
    () => localStorage.getItem(DARK_MODE_STORAGE_KEY) === "true",
  );

  useEffect(() => {
    let cancelled = false;
    void loadThemeAssets(requestedPreset)
      .then(() => {
        if (cancelled) return;
        applyThemePreset(requestedPreset, darkMode);
        setThemePresetState(requestedPreset);
      })
      .catch(() => {
        if (cancelled) return;
        applyThemePreset("default", darkMode);
        setThemePresetState("default");
        setRequestedPresetState("default");
        localStorage.setItem(THEME_STORAGE_KEY, "default");
      });
    return () => {
      cancelled = true;
    };
  }, [requestedPreset, darkMode]);

  useEffect(() => {
    const syncFromStorage = (event: StorageEvent) => {
      if (
        event.key === THEME_STORAGE_KEY ||
        event.key === DARK_MODE_STORAGE_KEY
      ) {
        const nextPreset = getThemePreset();
        const nextDark = localStorage.getItem(DARK_MODE_STORAGE_KEY) === "true";
        applyThemePreset(nextPreset, nextDark);
        setRequestedPresetState(nextPreset);
        setDarkModeState(nextDark);
      }
    };
    window.addEventListener("storage", syncFromStorage);
    return () => window.removeEventListener("storage", syncFromStorage);
  }, []);

  const setThemePreset = useCallback((preset: ThemePreset) => {
    localStorage.setItem(THEME_STORAGE_KEY, preset);
    setRequestedPresetState(preset);
  }, []);

  const setDarkMode = useCallback(
    (next: boolean) => {
      applyThemePreset(themePreset, next);
      setDarkModeState(next);
      localStorage.setItem(DARK_MODE_STORAGE_KEY, String(next));
    },
    [themePreset],
  );

  const value = useMemo(
    () => ({ themePreset, darkMode, setThemePreset, setDarkMode }),
    [themePreset, darkMode, setThemePreset, setDarkMode],
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const value = useContext(ThemeContext);
  if (!value) throw new Error("useTheme must be used within ThemeProvider");
  return value;
}
