export type ThemeMode = "light" | "dark";

export const THEME_STORAGE_KEY = "clover.settings-theme";
export const THEME_RESOLVED_COOKIE_KEY = "clover.theme-resolved";
export const THEME_COLORS: Record<ThemeMode, string> = {
  light: "#ffffff",
  dark: "#08111e",
};
export const LIGHT_ONLY_THEME_ROUTES = [
  "/",
  "/contact-us",
  "/features",
  "/install",
  "/onboarding",
  "/pricing",
  "/privacy-policy",
  "/sso-callback",
  "/terms-of-service",
] as const;
export const LIGHT_ONLY_THEME_PREFIXES = ["/sign-in", "/sign-up"] as const;
const THEME_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export function isThemeMode(value: unknown): value is ThemeMode {
  return value === "light" || value === "dark";
}

export function getResolvedTheme(mode: ThemeMode) {
  return mode;
}

export function isLightOnlyThemeRoute(pathname: string) {
  return (
    LIGHT_ONLY_THEME_ROUTES.some((route) => pathname === route) ||
    LIGHT_ONLY_THEME_PREFIXES.some((prefix) => pathname.startsWith(prefix))
  );
}

export function readStoredThemeMode() {
  if (typeof window === "undefined") {
    return "light" as ThemeMode;
  }

  const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
  return isThemeMode(stored) ? stored : "light";
}

export function applyThemeMode(mode: ThemeMode) {
  if (typeof document === "undefined") {
    return;
  }

  const resolved = getResolvedTheme(mode);
  document.documentElement.dataset.theme = resolved;
  document.documentElement.style.colorScheme = resolved;
  let themeColor = document.querySelector<HTMLMetaElement>('meta[data-clover-theme-color="true"]');
  if (!themeColor) {
    themeColor = document.createElement("meta");
    themeColor.name = "theme-color";
    themeColor.dataset.cloverThemeColor = "true";
    document.head.appendChild(themeColor);
  }
  themeColor.content = THEME_COLORS[resolved];
  document.cookie = `${THEME_RESOLVED_COOKIE_KEY}=${resolved}; path=/; max-age=${THEME_COOKIE_MAX_AGE}; samesite=lax`;
}
