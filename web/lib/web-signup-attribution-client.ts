import { newTelemetryId } from "../../shared/analytics";
import {
  SIGNUP_ATTRIBUTION_COOKIE,
  SIGNUP_ATTRIBUTION_TTL,
  parseSignupAttribution,
  signupOrigin,
  type SignupAttribution,
  type SignupProvider,
} from "../../shared/web-signup-attribution";

const storageKey = "clover.signup.attribution";
let current: SignupAttribution | null = null;

function remember(attribution: SignupAttribution) {
  current = attribution;
  try { sessionStorage.setItem(storageKey, JSON.stringify(attribution)); } catch { /* Keep attribution in memory. */ }
  return attribution;
}

export function startSignupAttribution(page: string, placement: string) {
  return remember({ id: newTelemetryId(), ...signupOrigin(page, placement), startedAt: Date.now() });
}

export function getSignupAttribution() {
  try {
    const stored = parseSignupAttribution(sessionStorage.getItem(storageKey));
    if (stored) return stored;
  } catch { /* Storage may be unavailable. */ }
  return parseSignupAttribution(JSON.stringify(current)) ??
    remember({ id: newTelemetryId(), page: "direct", placement: "direct", startedAt: Date.now() });
}

export function submitSignupAttribution(attribution: SignupAttribution, provider: SignupProvider) {
  const submitted = remember({ ...attribution, provider, startedAt: Date.now() });
  // The first authenticated server request can run before the redirect renders.
  try {
    document.cookie = `${SIGNUP_ATTRIBUTION_COOKIE}=${encodeURIComponent(JSON.stringify(submitted))}; Path=/; Max-Age=${SIGNUP_ATTRIBUTION_TTL}; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
  } catch { /* Analytics storage must not interrupt authentication. */ }
  return submitted;
}

export function clearSignupAttribution() {
  current = null;
  try { sessionStorage.removeItem(storageKey); } catch { /* Storage may be unavailable. */ }
  try {
    document.cookie = `${SIGNUP_ATTRIBUTION_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`;
  } catch { /* Analytics storage must not interrupt authentication. */ }
}
