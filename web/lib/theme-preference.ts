export type ThemeMode = "light" | "dark" | "system";

export const THEME_STORAGE_KEY = "clover.settings-theme";
export const THEME_RESOLVED_COOKIE_KEY = "clover.theme-resolved";
const THEME_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export function isThemeMode(value: unknown): value is ThemeMode {
  return value === "light" || value === "dark" || value === "system";
}

export function getResolvedTheme(mode: ThemeMode) {
  if (mode !== "system") {
    return mode;
  }

  return getSystemTheme();
}

export function getSystemTheme() {
  if (typeof window === "undefined") {
    return "light";
  }

  const darkQuery = window.matchMedia("(prefers-color-scheme: dark)");
  const lightQuery = window.matchMedia("(prefers-color-scheme: light)");

  if (lightQuery.matches) {
    return "light";
  }

  if (darkQuery.matches) {
    return "dark";
  }

  return "light";
}

export function readStoredThemeMode() {
  if (typeof window === "undefined") {
    return "system" as ThemeMode;
  }

  const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
  return isThemeMode(stored) ? stored : "system";
}

export function applyThemeMode(mode: ThemeMode) {
  if (typeof document === "undefined") {
    return;
  }

  const resolved = getResolvedTheme(mode);
  document.documentElement.dataset.theme = resolved;
  document.documentElement.style.colorScheme = resolved;
  document.cookie = `${THEME_RESOLVED_COOKIE_KEY}=${resolved}; path=/; max-age=${THEME_COOKIE_MAX_AGE}; samesite=lax`;
}
