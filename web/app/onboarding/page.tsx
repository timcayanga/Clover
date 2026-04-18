import { redirect } from "next/navigation";
import { OnboardingForm } from "@/components/onboarding-form";
import { getSessionContext } from "@/lib/auth";
import { getOrCreateCurrentUser, hasCompletedOnboarding } from "@/lib/user-context";

export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const session = await getSessionContext({ preferGuestOnStaging: true });
  const user = await getOrCreateCurrentUser(session.userId);
  if (!session.isGuest && hasCompletedOnboarding(user)) {
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
