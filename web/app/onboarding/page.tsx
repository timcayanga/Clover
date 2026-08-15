import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { OnboardingForm } from "@/components/onboarding-form";
import { getSessionContext } from "@/lib/auth";
import { ensureStarterWorkspace } from "@/lib/starter-data";
import { getOrCreateCurrentUser, hasCompletedOnboarding } from "@/lib/user-context";
import { prisma } from "@/lib/prisma";
import { getEnv } from "@/lib/env";
import {
  getCircleInvitationPath,
  isCircleInvitationToken,
} from "@/lib/circle-invitations";
import { resolveNewUserRegionalDefaults } from "@/lib/new-user-regional-defaults";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Onboarding",
};

export default async function OnboardingPage({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const params = (await searchParams) ?? {};
  const circleInvite = Array.isArray(params.circleInvite)
    ? params.circleInvite[0]
    : params.circleInvite;
  const completionUrl = isCircleInvitationToken(circleInvite)
    ? getCircleInvitationPath(circleInvite, { accept: true })
    : "/dashboard";
  let session;

  try {
    session = await getSessionContext();
  } catch {
    redirect("/sign-in");
  }

  const user = await getOrCreateCurrentUser(session.userId);
  if (!session.isGuest && hasCompletedOnboarding(user)) {
    redirect(completionUrl);
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
  const upgradeForPro = params.upgrade === "pro";
  const upgradeInterval = params.interval === "monthly" ? "monthly" : "annual";
  const env = getEnv();
  const requestHeaders = await headers();
  const regionalDefaults = resolveNewUserRegionalDefaults({
    countryCode: requestHeaders.get("x-vercel-ip-country"),
    acceptLanguage: requestHeaders.get("accept-language"),
  });

  return (
    <main className="onboarding-page">
      <section className="onboarding-page__shell">
        <OnboardingForm
          workspaceId={onboardingWorkspace?.id ?? starterWorkspace.id}
          billingCustomerId={user.id}
          workspaceAccounts={onboardingWorkspace?.accounts ?? []}
          currentExperience={user.financialExperience}
          upgradeForPro={upgradeForPro}
          upgradeInterval={upgradeInterval}
          paypalClientId={env.PAYPAL_CLIENT_ID ?? null}
          paypalMonthlyPlanId={env.PAYPAL_MONTHLY_PLAN_ID ?? env.PAYPAL_PRO_PLAN_ID ?? null}
          paypalAnnualPlanId={env.PAYPAL_ANNUAL_PLAN_ID ?? null}
          paypalBuyerCountry={env.PAYPAL_BUYER_COUNTRY ?? null}
          completionUrl={completionUrl}
          regionalDefaults={regionalDefaults}
        />
      </section>
    </main>
  );
}
