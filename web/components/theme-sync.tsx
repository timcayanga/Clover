"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { applyThemeMode, readStoredThemeMode, THEME_STORAGE_KEY } from "@/lib/theme-preference";

export function ThemeSync() {
  const pathname = usePathname() ?? "";
  const isLightOnlyRoute =
    pathname === "/" || pathname.startsWith("/sign-in") || pathname.startsWith("/sign-up") || pathname === "/onboarding";

  useEffect(() => {
    if (isLightOnlyRoute) {
      applyThemeMode("light");
      return;
    }

    const initialTheme = readStoredThemeMode();
    applyThemeMode(initialTheme);
  }, [isLightOnlyRoute, pathname]);

  useEffect(() => {
    if (isLightOnlyRoute) {
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

    const darkMediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const lightMediaQuery = window.matchMedia("(prefers-color-scheme: light)");
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
    if ("addEventListener" in darkMediaQuery) {
      darkMediaQuery.addEventListener("change", handleMediaChange);
    } else {
      darkMediaQuery.addListener(handleMediaChange);
    }
    if ("addEventListener" in lightMediaQuery) {
      lightMediaQuery.addEventListener("change", handleMediaChange);
    } else {
      lightMediaQuery.addListener(handleMediaChange);
    }

    const intervalId = window.setInterval(syncSystemTheme, 5000);

    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("pageshow", handlePageShow);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if ("removeEventListener" in darkMediaQuery) {
        darkMediaQuery.removeEventListener("change", handleMediaChange);
      } else {
        darkMediaQuery.removeListener(handleMediaChange);
      }
      if ("removeEventListener" in lightMediaQuery) {
        lightMediaQuery.removeEventListener("change", handleMediaChange);
      } else {
        lightMediaQuery.removeListener(handleMediaChange);
      }
      window.clearInterval(intervalId);
    };
  }, [isLightOnlyRoute, pathname]);

  return null;
}
