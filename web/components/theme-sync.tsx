"use client";

import { useLayoutEffect, useEffect } from "react";
import { usePathname } from "next/navigation";
import { applyThemeMode, readStoredThemeMode, THEME_STORAGE_KEY } from "@/lib/theme-preference";

export function ThemeSync() {
  const pathname = usePathname() ?? "";
  const isLightOnlyRoute =
    pathname === "/" || pathname.startsWith("/sign-in") || pathname.startsWith("/sign-up") || pathname === "/onboarding";

  useLayoutEffect(() => {
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

    const handleStorage = (event: StorageEvent) => {
      if (event.key !== THEME_STORAGE_KEY) {
        return;
      }

      applyThemeMode(readStoredThemeMode());
    };

    window.addEventListener("storage", handleStorage);

    return () => {
      window.removeEventListener("storage", handleStorage);
    };
  }, [isLightOnlyRoute, pathname]);

  return null;
}
