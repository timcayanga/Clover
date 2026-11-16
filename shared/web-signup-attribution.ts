export const SIGNUP_ATTRIBUTION_COOKIE = "clover_signup_attribution";
export const SIGNUP_ATTRIBUTION_TTL = 30 * 60;

const pages = [
  "/", "/pricing", "/landing-showcase", "/landing-preview", "/landing-motion",
  "/features/manage-money", "/features/understand-your-money", "/features/plan-ahead",
  "/features/manage-money-together", "/features/security", "/features/pro",
  "/offers/switch-to-clover",
];
const placements = ["hero", "final_cta", "pricing", "features", "navigation", "header", "footer", "main", "direct"];
export type SignupProvider = "email" | "google" | "apple";
export type SignupAttribution = {
  id: string;
  page: string;
  placement: string;
  startedAt: number;
  provider?: SignupProvider;
};

export function signupOrigin(path: string, placement: string) {
  return {
    page: pages.includes(path) ? path : path.startsWith("/features/") ? "/features/:id" : "other",
    placement: placements.includes(placement) ? placement : "main",
  };
}

export function parseSignupAttribution(value: string | undefined | null, now = Date.now()): SignupAttribution | null {
  if (!value || value.length > 600) return null;
  try {
    const { id, page, placement, startedAt, provider } = JSON.parse(value);
    if (typeof id !== "string" || !/^[a-z0-9-]{8,80}$/.test(id) ||
        ![...pages, "/features/:id", "other", "direct"].includes(page) || !placements.includes(placement) ||
        !Number.isSafeInteger(startedAt) || startedAt > now + 60_000 || now - startedAt > SIGNUP_ATTRIBUTION_TTL * 1000 ||
        (provider !== undefined && !["email", "google", "apple"].includes(provider))) return null;
    return { id, page, placement, startedAt, provider };
  } catch {
    return null;
  }
}

export function signupProperties(attribution: SignupAttribution) {
  return {
    signup_journey_id: attribution.id,
    origin_page: attribution.page,
    cta_placement: attribution.placement,
    signup_provider: attribution.provider,
  };
}

export function matchesNewSignup(attribution: SignupAttribution | null, clerkCreatedAt: Date | null | undefined) {
  if (!attribution?.provider || !clerkCreatedAt) return false;
  const elapsed = clerkCreatedAt.getTime() - attribution.startedAt;
  return elapsed >= -60_000 && elapsed <= SIGNUP_ATTRIBUTION_TTL * 1000;
}
