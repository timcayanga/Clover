/**
 * Android delivers OAuth redirects to both Expo Router and expo-web-browser.
 * Leave the current auth form mounted while Clerk's browser listener verifies
 * the nonce and finalizes the session. Never navigate with callback credentials
 * or activate a session based on an incoming URL's created_session_id.
 */
export function redirectSystemPath({
  path,
  initial,
}: {
  path: string;
  initial: boolean;
}): string | null {
  try {
    const url = new URL(
      path.startsWith("/") ? `https://clover.ph${path}` : path,
    );
    const publicMatch = url.pathname.match(
      /^\/split-bill\/request\/([a-zA-Z0-9_-]{20,100})\/?$/,
    );
    const nativeToken =
      url.hostname === "payment-request" || url.pathname === "/payment-request"
        ? url.searchParams.get("token")
        : null;
    const token =
      (url.protocol === "https:" && url.hostname === "clover.ph"
        ? publicMatch?.[1]
        : null) ??
      (url.protocol === "clover:" || url.protocol === "clover-preview:"
        ? nativeToken
        : null);
    if (token && /^[a-zA-Z0-9_-]{20,100}$/.test(token))
      return `/payment-request?token=${encodeURIComponent(token)}`;
  } catch {}
  const callback =
    /^(?:(?:clover|clover-preview):\/\/\/?|\/?)(?:sso-callback)\/?(?:[?#]|$)/.test(
      path,
    );
  if (!callback) return path;

  // A restarted process has no pending browser promise. Start a fresh sign-in
  // instead of attempting to replay an unverified or expired callback.
  return initial ? "/auth?restartSSO=1" : null;
}
