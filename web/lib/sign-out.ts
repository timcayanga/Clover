import { persistRememberedSessionId } from "@/lib/clerk-session-persistence";

type SignOutFn = (options?: { redirectUrl?: string }) => Promise<unknown>;

export const signOutToLanding = async (signOut: SignOutFn) => {
  persistRememberedSessionId(null);

  const isStagingHost =
    typeof window !== "undefined" &&
    (window.location.hostname === "staging.clover.ph" ||
      (window.location.hostname.startsWith("clover-stage-") && window.location.hostname.endsWith(".vercel.app")));
  const redirectUrl = isStagingHost ? "/sign-in" : "/";

  try {
    await signOut({ redirectUrl });
  } catch {
    window.location.assign(redirectUrl);
  }
};
