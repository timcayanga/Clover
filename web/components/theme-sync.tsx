"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { applyThemeMode, readStoredThemeMode, THEME_STORAGE_KEY } from "@/lib/theme-preference";

export function ThemeSync() {
  const pathname = usePathname() ?? "";

  useEffect(() => {
    if (pathname === "/") {
      applyThemeMode("light");
      return;
    }

    const initialTheme = readStoredThemeMode();
    applyThemeMode(initialTheme);
  }, [pathname]);

  useEffect(() => {
    if (pathname === "/") {
      return;
    }

    const syncSystemTheme = () => {
      if (readStoredThemeMode() === "system") {
        applyThemeMode("system");
      }
    };

    const handleStorage = (event: StorageEvent) => {
      if (event.key !== THEME_STORAGE_KEY) {
        return;
      }

      applyThemeMode(readStoredThemeMode());
    };

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handleMediaChange = () => {
      syncSystemTheme();
    };

    const handleVisibilityChange = () => {
      syncSystemTheme();
    };

    const handlePageShow = () => {
      syncSystemTheme();
    };

    const handleFocus = () => {
      syncSystemTheme();
    };

    window.addEventListener("storage", handleStorage);
    window.addEventListener("focus", handleFocus);
    window.addEventListener("pageshow", handlePageShow);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    if ("addEventListener" in mediaQuery) {
      mediaQuery.addEventListener("change", handleMediaChange);
    } else {
      mediaQuery.addListener(handleMediaChange);
    }

    const intervalId = window.setInterval(syncSystemTheme, 30000);

    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("pageshow", handlePageShow);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if ("removeEventListener" in mediaQuery) {
        mediaQuery.removeEventListener("change", handleMediaChange);
      } else {
        mediaQuery.removeListener(handleMediaChange);
      }
      window.clearInterval(intervalId);
    };
  }, [pathname]);

  return null;
}
