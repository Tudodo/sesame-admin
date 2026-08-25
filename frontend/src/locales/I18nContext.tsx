import { safeLocalStorage } from "@/lib/utils";
import enUS from "@/locales/en-US";
import zhCN from "@/locales/zh-CN";
import type React from "react";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";

type Locale = "zh-CN" | "en-US";

const messages: Record<Locale, Record<string, string>> = {
  "zh-CN": zhCN,
  "en-US": enUS,
};

interface I18nContextValue {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (key: string, fallback?: string) => string;
}

const I18nContext = createContext<I18nContextValue>({
  locale: "zh-CN",
  setLocale: () => {},
  t: (k, f) => f || k,
});

export const I18nProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [locale, setLocale] = useState<Locale>(() => {
    return (safeLocalStorage.getItem("locale") as Locale) || "zh-CN";
  });

  const changeLocale = useCallback((l: Locale) => {
    setLocale(l);
    safeLocalStorage.setItem("locale", l);
  }, []);

  const t = useCallback(
    (key: string, fallback?: string) => {
      const msg = messages[locale];
      return msg[key] || fallback || key;
    },
    [locale],
  );

  const value = useMemo(
    () => ({ locale, setLocale: changeLocale, t }),
    [locale, changeLocale, t],
  );
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
};

export function useI18n() {
  return useContext(I18nContext);
}
