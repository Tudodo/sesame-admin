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
import { applyDarkMode, getDarkMode } from "./lib/theme";
import { AppThemeProvider } from "./theme/AppThemeProvider";

dayjs.locale("zh-cn");
document.documentElement.lang = "zh-CN";

const root = document.getElementById("root");
if (!root) throw new Error("No root element found");

function bootstrap() {
  const darkMode = getDarkMode();
  applyDarkMode(darkMode);

  ReactDOM.createRoot(root as HTMLElement).render(
    <React.StrictMode>
      <AppThemeProvider>
        <App />
        <Toaster richColors position="top-center" />
      </AppThemeProvider>
    </React.StrictMode>,
  );
}

bootstrap();
