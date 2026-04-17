import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { CloverShell } from "@/components/clover-shell";
import { OnboardingForm } from "@/components/onboarding-form";
import { getOrCreateCurrentUser, hasCompletedOnboarding } from "@/lib/user-context";

export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const { userId } = await auth();

  if (!userId) {
    redirect("/sign-in");
  }

  const user = await getOrCreateCurrentUser(userId);
  if (hasCompletedOnboarding(user)) {
    redirect("/dashboard");
  }

  return (
    <CloverShell
      active="overview"
      kicker="Quick setup"
      title="A few quick details, then you’re in."
      subtitle="Clover uses your choice to shape the first experience without slowing signup down."
      showTopbar={false}
    >
      <section className="onboarding-layout">
        <OnboardingForm currentGoal={user.primaryGoal} />
      </section>
    </CloverShell>
  );
}
