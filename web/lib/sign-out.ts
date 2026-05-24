import { persistRememberedSessionId } from "@/lib/clerk-session-persistence";

type SignOutFn = (options?: { redirectUrl?: string }) => Promise<unknown>;

export const signOutToLanding = async (signOut: SignOutFn) => {
  persistRememberedSessionId(null);

  try {
    await signOut({ redirectUrl: "/" });
  } catch {
    window.location.assign("/");
  }
};
