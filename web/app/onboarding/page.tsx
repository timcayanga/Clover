import { hasAcceptedOnboardingTerms } from "@/lib/ai-consent";
import { SignupTrialSummary } from "@/components/signup-trial-summary";
import { getProAccess } from "@/lib/pro-access";
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
import { normalizeRegionalPreferences } from "@/lib/regional-preferences";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Onboarding",
};

export default async function OnboardingPage({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const params = (await searchParams) ?? {};
  const circleInvite = Array.isArray(params.circleInvite)
    ? params.circleInvite[0]
    : params.circleInvite;
  const completionUrl = params.campaign === "switch-to-clover" ? "/settings/plan/switch-to-clover" : isCircleInvitationToken(circleInvite)
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

  const requestHeaders = await headers();
  const detectedRegionalDefaults = resolveNewUserRegionalDefaults({
    countryCode: requestHeaders.get("x-vercel-ip-country"),
    acceptLanguage: requestHeaders.get("accept-language"),
  });
  const regionalDefaults = user.regionalPreferences
    ? normalizeRegionalPreferences(user.regionalPreferences, detectedRegionalDefaults)
    : detectedRegionalDefaults;
  const regionalUser = user.regionalPreferencesInitializedAt
    ? user
    : await prisma.user.update({
        where: { id: user.id },
        data: {
          regionalPreferences: regionalDefaults,
          regionalPreferencesInitializedAt: new Date(),
        },
      });
  const starterWorkspace = await ensureStarterWorkspace(
    regionalUser,
    regionalUser.email,
    regionalUser.verified,
    regionalDefaults.baseCurrency
  );
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
  const upgradeInterval = params.interval === "annual" ? "annual" : "monthly";
  const env = getEnv();
  const pricingMarket = requestHeaders.get("x-vercel-ip-country")?.toUpperCase() === "PH" ? "ph" : "global";
  const trialAccess = await getProAccess(user.id);
  return (
    <main className="onboarding-page">
      <section className="onboarding-page__shell">
        <SignupTrialSummary trial={trialAccess.trial} />
        <OnboardingForm
          key={user.id}
          initialTermsAccepted={hasAcceptedOnboardingTerms(user.appPreferences)}
          initialPlanTier={trialAccess.planTier}
          customerEmail={user.email}
          paddleClientToken={env.PADDLE_CLIENT_TOKEN ?? null}
          paddleEnvironment={env.PADDLE_ENV === 'live' ? 'live' : 'sandbox'}
          workspaceId={onboardingWorkspace?.id ?? starterWorkspace.id}
          billingCustomerId={user.id}
          workspaceAccounts={onboardingWorkspace?.accounts ?? []}
          currentExperience={user.financialExperience}
          upgradeForPro={upgradeForPro}
          upgradeInterval={upgradeInterval}
          paypalClientId={env.PAYPAL_CLIENT_ID ?? null}
          paypalMonthlyPlanId={null}
          paypalAnnualPlanId={null}
          paypalBuyerCountry={env.PAYPAL_BUYER_COUNTRY ?? null}
          pricingMarket={pricingMarket}
          completionUrl={completionUrl}
          regionalDefaults={regionalDefaults}
        />
      </section>
    </main>
  );
}
