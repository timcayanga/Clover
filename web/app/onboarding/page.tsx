import { redirect } from "next/navigation";
import { OnboardingForm } from "@/components/onboarding-form";
import { getSessionContext } from "@/lib/auth";
import { ensureStarterWorkspace } from "@/lib/starter-data";
import { getOrCreateCurrentUser, hasCompletedOnboarding } from "@/lib/user-context";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Onboarding",
};

export default async function OnboardingPage() {
  let session;

  try {
    session = await getSessionContext();
  } catch {
    redirect("/sign-in");
  }

  const user = await getOrCreateCurrentUser(session.userId);
  if (!session.isGuest && hasCompletedOnboarding(user)) {
    redirect("/dashboard");
  }

  const starterWorkspace = await ensureStarterWorkspace(user.clerkUserId, user.email, user.verified);
  const onboardingWorkspace = await prisma.workspace.findUnique({
    where: { id: starterWorkspace.id },
    select: {
      id: true,
      accounts: {
        select: {
          id: true,
          name: true,
          institution: true,
          type: true,
        },
      },
    },
  });

  return (
    <main className="onboarding-page">
      <section className="onboarding-page__shell">
        <OnboardingForm
          workspaceId={onboardingWorkspace?.id ?? starterWorkspace.id}
          workspaceAccounts={onboardingWorkspace?.accounts ?? []}
          currentExperience={user.financialExperience}
          currentGoal={user.primaryGoal}
          currentTargetAmount={user.goalTargetAmount?.toString() ?? null}
        />
      </section>
    </main>
  );
}
