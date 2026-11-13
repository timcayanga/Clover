/** Static, privacy-safe measurement vocabulary. Never capture free-form UI text. */
export const PUBLIC_ANALYTICS_ROOTS = ["/", "/features", "/pricing", "/contact-us", "/privacy-policy", "/terms-of-service", "/refund-policy", "/dispute-resolution", "/business-registration", "/help", "/guides", "/sign-in", "/sign-up", "/install", "/landing-showcase", "/landing-preview", "/landing-motion"] as const;
export const isPublicAnalyticsPath = (path: string) => {
  const pathname = path.split(/[?#]/)[0];
  return PUBLIC_ANALYTICS_ROOTS.some(root => pathname === root || root !== "/" && pathname.startsWith(root + "/"));
};
export function websiteSection(path: string) {
  const root = "/" + path.split(/[/?#]/)[1];
  switch (root) {
    case "/sign-in":
    case "/sign-up":
      return "auth";
    case "/contact-us":
    case "/help":
      return "support";
    case "/privacy-policy":
    case "/terms-of-service":
    case "/refund-policy":
    case "/dispute-resolution":
    case "/business-registration":
      return "legal";
    case "/landing-showcase":
    case "/landing-preview":
    case "/landing-motion":
      return "preview";
    default:
      return isPublicAnalyticsPath(path) ? "marketing" : "app";
  }
}

export const ANALYTICS_ACTIONS = ["signup", "login", "logout", "open_clover", "download_ios", "download_android", "contact_support", "view_pricing", "view_features", "view_help", "view_guides", "view_security", "view_pro", "view_legal", "social_instagram", "social_facebook", "social_tiktok", "social_youtube", "pricing_monthly", "pricing_yearly", "pricing_previous", "pricing_next", "open_menu", "close_menu", "view_report_example"] as const;
const actionNames = new Set<string>(ANALYTICS_ACTIONS);
const exactLabels: Record<string,string> = { "organize my finances for free":"signup", "start free":"signup", "get started":"signup", "create an account":"signup", "sign up":"signup", "log in":"login", "sign in":"login", "log out":"logout", "open clover":"open_clover", "monthly":"pricing_monthly", "yearly":"pricing_yearly", "annual":"pricing_yearly", "previous plan":"pricing_previous", "next plan":"pricing_next", "features":"view_features", "open menu":"open_menu", "close menu":"close_menu" };
/** Explicit ids first, then fixed known destinations, then exact static labels. No dynamic href is returned. */
export function namedAnalyticsAction(input: { action?: string | null; href?: string | null; label?: string | null; origin: string }) {
  if (input.action && actionNames.has(input.action)) return input.action;
  if (input.href) try {
    const url = new URL(input.href, input.origin);
    if (url.hostname === "apps.apple.com" && /\/id6811711508\/?$/.test(url.pathname)) return "download_ios";
    if (url.hostname === "play.google.com" && url.pathname === "/store/apps/details" && url.searchParams.get("id") === "ph.clover.app") return "download_android";
    const social = ({"www.instagram.com":"social_instagram","instagram.com":"social_instagram","www.facebook.com":"social_facebook","facebook.com":"social_facebook","www.tiktok.com":"social_tiktok","tiktok.com":"social_tiktok","www.youtube.com":"social_youtube","youtube.com":"social_youtube"} as Record<string,string>)[url.hostname];
    if (social && /^\/@?cloverpersonalfinance\/?$/.test(url.pathname)) return social;
    if (url.origin === input.origin) {
      const path = url.pathname;
      if (path === "/sign-up") return "signup";
      if (path === "/sign-in") return "login";
      if (path === "/home") return "open_clover";
      if (path === "/contact-us") return "contact_support";
      if (path === "/pricing") return "view_pricing";
      if (path === "/features/security" || path === "/landing-showcase/features/security") return "view_security";
      if (path === "/features/pro" || path === "/landing-showcase/features/pro") return "view_pro";
      if (path === "/features" || path.startsWith("/features/") || path.startsWith("/landing-showcase/features/")) return "view_features";
      if (path === "/help" || path.startsWith("/help/")) return "view_help";
      if (path === "/guides" || path.startsWith("/guides/")) return "view_guides";
      if (["/privacy-policy","/terms-of-service","/refund-policy","/dispute-resolution","/business-registration"].includes(path)) return "view_legal";
    }
  } catch { /* Invalid links remain unnamed, never sent raw. */ }
  return exactLabels[input.label?.trim().toLowerCase() ?? ""] ?? null;
}
