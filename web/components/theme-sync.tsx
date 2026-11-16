"use client";

import { useLayoutEffect, useEffect } from "react";
import { usePathname } from "next/navigation";
import {
  applyThemeMode,
  isLightOnlyThemeRoute,
  readStoredThemeMode,
  THEME_STORAGE_KEY,
} from "@/lib/theme-preference";

export function ThemeSync() {
  const pathname = usePathname() ?? "";
  const isLightOnlyRoute = isLightOnlyThemeRoute(pathname);

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
