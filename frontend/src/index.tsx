import dayjs from "dayjs";
import React from "react";
import ReactDOM from "react-dom/client";
import "dayjs/locale/zh-cn";
import "./index.css";
import "@fontsource/ibm-plex-sans/400.css";
import "@fontsource/ibm-plex-sans/500.css";
import "@fontsource/ibm-plex-sans/600.css";
import "@fontsource/space-grotesk/500.css";
import "@fontsource/space-grotesk/600.css";
import "@fontsource/space-grotesk/700.css";
import { Toaster } from "@/components/ui/sonner";
import { App } from "./App";
import {
  DARK_MODE_STORAGE_KEY,
  THEME_STORAGE_KEY,
  applyThemePreset,
  getThemePreset,
} from "./lib/theme";
import { loadThemeAssets } from "./theme";
import { AppThemeProvider } from "./theme/AppThemeProvider";

dayjs.locale("zh-cn");

const root = document.getElementById("root");
if (!root) throw new Error("No root element found");

async function bootstrap() {
  const darkMode = localStorage.getItem(DARK_MODE_STORAGE_KEY) === "true";
  let themePreset = getThemePreset();
  try {
    await loadThemeAssets(themePreset);
  } catch {
    themePreset = "default";
    localStorage.setItem(THEME_STORAGE_KEY, "default");
  }
  applyThemePreset(themePreset, darkMode);

  ReactDOM.createRoot(root).render(
    <React.StrictMode>
      <AppThemeProvider>
        <App />
        <Toaster richColors position="top-center" />
      </AppThemeProvider>
    </React.StrictMode>,
  );
}

void bootstrap();
