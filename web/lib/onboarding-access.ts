import { redirect } from "next/navigation";
import { getSessionContext } from "@/lib/auth";
import { getOrCreateCurrentUser, hasCompletedOnboarding } from "@/lib/user-context";

export const ensureOnboardingAccess = async () => {
  if (process.env.NEXT_PHASE === "phase-production-build") {
    return;
  }

  const session = await getSessionContext({ preferGuestOnStaging: true });

  if (session.isGuest) {
    return;
  }

  const user = await getOrCreateCurrentUser(session.userId);
  if (!hasCompletedOnboarding(user)) {
    redirect("/onboarding");
  }
};
