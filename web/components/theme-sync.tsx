"use client";

import { useEffect } from "react";
import { applyThemeMode, readStoredThemeMode, THEME_STORAGE_KEY } from "@/lib/theme-preference";

export function ThemeSync() {
  useEffect(() => {
    const initialTheme = readStoredThemeMode();
    applyThemeMode(initialTheme);
  }, []);

  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key !== THEME_STORAGE_KEY) {
        return;
      }

      const nextTheme = readStoredThemeMode();
      applyThemeMode(nextTheme);
    };

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handleMediaChange = () => {
      if (readStoredThemeMode() !== "system") {
        return;
      }

      applyThemeMode("system");
    };

    window.addEventListener("storage", handleStorage);
    if ("addEventListener" in mediaQuery) {
      mediaQuery.addEventListener("change", handleMediaChange);
    } else {
      mediaQuery.addListener(handleMediaChange);
    }

    return () => {
      window.removeEventListener("storage", handleStorage);
      if ("removeEventListener" in mediaQuery) {
        mediaQuery.removeEventListener("change", handleMediaChange);
      } else {
        mediaQuery.removeListener(handleMediaChange);
      }
    };
  }, []);

  return null;
}
