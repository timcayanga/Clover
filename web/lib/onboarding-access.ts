import { redirect } from "next/navigation";
import { getSessionContext } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getCurrentUserEnvironment, resolvePersistedUserEnvironment } from "@/lib/user-environment";
import { getOrCreateCurrentUser, hasCompletedOnboarding } from "@/lib/user-context";

export const ensureOnboardingAccess = async () => {
  if (process.env.NEXT_PHASE === "phase-production-build") {
    return;
  }

  let session;

  try {
    session = await getSessionContext();
  } catch {
    redirect("/sign-in");
  }

  if (session.isGuest) {
    return;
  }

  const existing = await prisma.user.findUnique({
    where: { clerkUserId: session.userId },
    select: { onboardingCompletedAt: true, signupTrialEvaluatedAt: true, environment: true },
  });
  if (
    existing?.signupTrialEvaluatedAt &&
    hasCompletedOnboarding(existing) &&
    existing.environment === resolvePersistedUserEnvironment(getCurrentUserEnvironment(), existing.environment)
  ) {
    return;
  }

  const user = await getOrCreateCurrentUser(session.userId);
  if (!hasCompletedOnboarding(user)) {
    redirect("/onboarding");
  }
};
