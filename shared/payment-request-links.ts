/** Public request capabilities only. Never use incoming links as authentication. */
export const PAYMENT_TOKEN = /^[a-zA-Z0-9_-]{20,100}$/;
export const PAYMENT_ORIGINS = ["https://clover.ph", "https://staging.clover.ph"] as const;

export function paymentOrigin(value: string | null | undefined): string | null {
  return PAYMENT_ORIGINS.find((origin) => origin === value) ?? null;
}

export function paymentRequestPath(token: string): string {
  if (!PAYMENT_TOKEN.test(token)) throw new Error("Invalid payment request link");
  return `/split-bill/request/${encodeURIComponent(token)}`;
}

export function paymentAppLink(token: string, origin: string, android = false): string {
  const trustedOrigin = paymentOrigin(origin);
  if (!trustedOrigin) throw new Error("Unrecognized payment request site");
  const path = paymentRequestPath(token);
  const query = `token=${encodeURIComponent(token)}&origin=${encodeURIComponent(trustedOrigin)}`;
  if (!android) return `clover://payment-request?${query}`;
  return `intent://payment-request?${query}#Intent;scheme=clover;package=ph.clover.app;S.browser_fallback_url=${encodeURIComponent(`${trustedOrigin}${path}?browser=1`)};end`;
}

export function parsePaymentAppLink(path: string): { token: string; origin: string } | null {
  try {
    const url = new URL(path.startsWith("/") ? `https://clover.ph${path}` : path);
    if (url.username || url.password || url.port) return null;
    const match = url.pathname.match(/^\/split-bill\/request\/([a-zA-Z0-9_-]{20,100})\/?$/);
    if (url.protocol === "https:" && paymentOrigin(url.origin) && match)
      return { token: match[1], origin: url.origin };
    if ((url.protocol === "clover:" || url.protocol === "clover-preview:") &&
      (url.hostname === "payment-request" || (!url.hostname && url.pathname === "/payment-request"))) {
      const token = url.searchParams.get("token");
      const origin = paymentOrigin(url.searchParams.get("origin") ?? "https://clover.ph");
      if (token && PAYMENT_TOKEN.test(token) && origin) return { token, origin };
    }
  } catch { /* Malformed external links are not application routes. */ }
  return null;
}

export function paymentMessageLink(kind: "sms" | "email", recipient: string, message: string, ios = false): string | null {
  const value = recipient.trim();
  if (kind === "sms") {
    if (!/^\+?[\d () .-]{3,40}$/.test(value)) return null;
    const phone = value.replace(/[^\d+]/g, "");
    if (!/^\+?\d{3,20}$/.test(phone)) return null;
    return `sms:${phone}${ios ? "&" : "?"}body=${encodeURIComponent(message)}`;
  }
  if (!/^[^\s@?&#:]+@[^\s@?&#:]+\.[^\s@?&#:]+$/.test(value)) return null;
  return `mailto:${encodeURIComponent(value)}?subject=Your%20shared%20bills&body=${encodeURIComponent(message)}`;
}
