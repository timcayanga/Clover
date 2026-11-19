import { SWITCH_PATH } from "./switch-campaign";

export const HOME_BANNER_INTERVAL_MS = 5000;
export const HOME_BANNER_ARTWORK = { width: 1200, height: 600, maxBytes: 2 * 1024 * 1024, minWidth: 600, minHeight: 300 } as const;
export type HomeBanner = {
  id: string;
  kind: "bank_sync" | "switch_campaign" | "custom";
  enabled: boolean;
  title: string;
  body: string;
  ctaLabel: string;
  href: string;
  theme: "teal" | "mint";
  icon: "accounts" | "budgeting";
  assetId: string | null;
};
export type VisibleHomeBanner = HomeBanner & { imageUrl: string | null };
export const DEFAULT_HOME_BANNERS: readonly HomeBanner[] = [
  { id: "bank-sync", kind: "bank_sync", enabled: true, title: "Less typing. More clarity.", body: "Connect a bank and sync automatically with Plus.", ctaLabel: "Explore plans", href: "/settings/plan?source=home_banner&banner=bank-sync", theme: "teal", icon: "accounts", assetId: null },
  { id: "switch-to-clover", kind: "switch_campaign", enabled: true, title: "Already bought a budget tracker?", body: "Share your purchase and get 30 days of Plus after approval.", ctaLabel: "Get a free month", href: SWITCH_PATH, theme: "mint", icon: "budgeting", assetId: null },
];
const destinations = ["/settings/plan", SWITCH_PATH, "/accounts", "/transactions", "/recurring", "/reports", "/budgeting", "/goals", "/investments", "/circles", "/split-bill", "/home"];
/** Relative, known Clover destinations only: no external, encoded, traversal or script links. */
export function validHomeBannerHref(value: string) {
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("..") || /[\\\s#%]/.test(value)) return false;
  try {
    const url = new URL(value, "https://clover.ph");
    return url.origin === "https://clover.ph" && destinations.includes(url.pathname) && url.search.length <= 300 && !/[<>"']/.test(value);
  } catch { return false; }
}
export function visibleHomeBanners(items: readonly HomeBanner[], planTier: string, campaignOpen: boolean): VisibleHomeBanner[] {
  if (planTier !== "free") return [];
  return items.filter(item => item.enabled && validHomeBannerHref(item.href) && (item.kind !== "switch_campaign" || campaignOpen)).map(item => ({ ...item, imageUrl: item.assetId ? `/api/home-banners/assets/${encodeURIComponent(item.assetId)}` : null }));
}
export function nextHomeBanner(index: number, count: number) { return count > 0 ? (index + 1) % count : 0; }
export function nativeHomeBannerDestination(href: string) {
  if (!validHomeBannerHref(href)) return null;
  const url = new URL(href, "https://clover.ph");
  if (url.pathname === "/settings/plan") return { native: "/settings?section=plan", web: null };
  if (url.pathname === SWITCH_PATH) return { native: null, web: href };
  const native = url.pathname === "/home" ? "/" : url.pathname === "/split-bill" ? "/split-bills" : url.pathname;
  return { native: native + url.search, web: null };
}
