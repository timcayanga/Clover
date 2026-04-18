import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
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
    <main className="onboarding-page">
      <section className="onboarding-page__shell">
        <div className="onboarding-page__brand">
          <img className="onboarding-page__mark" src="/favicon.svg" alt="" aria-hidden="true" />
          <span>Clover</span>
        </div>

        <OnboardingForm currentGoal={user.primaryGoal} />
      </section>
    </main>
  );
}
