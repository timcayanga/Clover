import nextDynamic from "next/dynamic";
import { redirect } from "next/navigation";
import { CloverShell } from "@/components/clover-shell";
import { getSessionContext } from "@/lib/auth";
import { getUserBillingSubscription } from "@/lib/paypal-billing";
import { getEnv } from "@/lib/env";
import { getOrCreateCurrentUser, hasCompletedOnboarding } from "@/lib/user-context";
import type { SettingSection } from "@/components/settings-center";

const BillingCard = nextDynamic(() => import("@/components/billing-card").then((module) => module.BillingCard), {
  loading: () => <div className="glass" aria-label="Loading billing details" />,
});

const SettingsCenter = nextDynamic(() => import("@/components/settings-center").then((module) => module.SettingsCenter), {
  loading: () => <div className="settings-layout" aria-label="Loading settings" />,
});

const AccountActionsPanel = nextDynamic(() => import("@/components/account-actions-panel").then((module) => module.AccountActionsPanel), {
  loading: () => <div className="glass" aria-label="Loading account actions" />,
});

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = {
  title: "Settings",
};

const sections: SettingSection[] = [
  {
    group: "Import",
    title: "Import defaults",
    eyebrow: "Faster imports",
    summary: "Tell Clover how to start when a new statement lands.",
    fields: [
      {
        label: "Default account",
        kind: "select",
        value: "Use detected account",
        options: [
          { label: "Use detected account", helper: "Best when Clover can read the account from the statement itself." },
          { label: "Most recently used", helper: "Good for one-account workflows and repeat uploads." },
          { label: "First available account", helper: "Keeps imports moving when account labels are inconsistent." },
        ],
        helper: "This is the account Clover starts with if a statement does not clearly identify one.",
        tier: "primary",
        showAsCards: true,
      },
      {
        label: "Duplicate handling",
        kind: "select",
        value: "Flag and review",
        options: [
          { label: "Flag and review", helper: "Safer for repeat imports; Clover highlights possible duplicates first." },
          { label: "Skip duplicates", helper: "Best when you want the cleanest result and trust the file source." },
          { label: "Import anyway", helper: "Use when you want every row preserved, even if it looks familiar." },
        ],
        helper: "Choose what Clover should do when it sees rows that may already exist.",
        tier: "primary",
        showAsCards: true,
      },
      {
        label: "Unknown merchants",
        kind: "select",
        value: "Leave unassigned",
        options: [
          { label: "Leave unassigned", helper: "Keeps unmatched merchants visible so you can review them later." },
          { label: "Use uncategorized", helper: "Places unknown merchants into a single catch-all bucket." },
          { label: "Use last matched category", helper: "Faster for repeat merchants that tend to map the same way." },
        ],
        helper: "This only matters when Clover cannot confidently match a merchant.",
        tier: "primary",
        showAsCards: true,
      },
    ],
  },
  {
    group: "Categorization",
    title: "Merchant behavior",
    eyebrow: "Keep things consistent",
    summary: "Help Clover recognize the same merchant and recurring items every time.",
    fields: [
      {
        label: "Auto-categorize",
        kind: "toggle",
        checked: true,
        helper: "Let Clover apply known matches automatically so the review queue stays shorter.",
        tier: "primary",
      },
      {
        label: "Normalize merchant names",
        kind: "toggle",
        checked: true,
        helper: "Show the same merchant name even when statements spell it differently.",
        tier: "primary",
      },
      {
        label: "Recurring detection",
        kind: "toggle",
        checked: true,
        helper: "Surface repeating payments so subscriptions and bills are easier to spot.",
        tier: "advanced",
      },
    ],
  },
  {
    group: "Display",
    title: "Workspace view",
    eyebrow: "How Clover opens",
    summary: "Choose the default look and landing page for your workspace.",
    fields: [
      {
        label: "Table density",
        kind: "select",
        value: "Comfortable",
        options: [
          { label: "Comfortable" },
          { label: "Compact" },
          { label: "Spacious" },
        ],
        helper: "Controls how much information Clover shows at a glance in tables and lists.",
        tier: "primary",
      },
      {
        label: "Landing page",
        kind: "select",
        value: "Dashboard",
        options: [
          { label: "Dashboard" },
          { label: "Transactions" },
          { label: "Reports" },
        ],
        helper: "Choose the screen Clover opens to after sign in.",
        tier: "primary",
      },
    ],
  },
];

export default async function SettingsPage() {
  const session = await getSessionContext();
  const user = await getOrCreateCurrentUser(session.userId);
  const env = getEnv();
  const billingSubscription = session.isGuest ? null : await getUserBillingSubscription(user.id);
  if (!session.isGuest && !hasCompletedOnboarding(user)) {
    redirect("/onboarding");
  }

  return (
    <CloverShell
      active="settings"
      title="Settings"
      kicker="Control room"
      subtitle="Keep the controls that shape imports, categorization, and display in one place."
    >
      <BillingCard
        planTier={user.planTier}
        paypalClientId={env.PAYPAL_CLIENT_ID ?? null}
        paypalMonthlyPlanId={env.PAYPAL_MONTHLY_PLAN_ID ?? env.PAYPAL_PRO_PLAN_ID ?? null}
        paypalAnnualPlanId={env.PAYPAL_ANNUAL_PLAN_ID ?? null}
        billingSubscription={
          billingSubscription
            ? {
                status: billingSubscription.status,
                interval: billingSubscription.interval,
                pendingPlanId: billingSubscription.pendingPlanId,
                pendingInterval: billingSubscription.pendingInterval,
                providerSubscriptionId: billingSubscription.providerSubscriptionId,
                currentPeriodEnd: billingSubscription.currentPeriodEnd ? billingSubscription.currentPeriodEnd.toISOString() : null,
                nextBillingTime: billingSubscription.nextBillingTime ? billingSubscription.nextBillingTime.toISOString() : null,
                planTier: billingSubscription.planTier,
              }
            : null
        }
        userId={user.id}
        clerkUserId={user.clerkUserId}
        email={user.email}
      />
      <SettingsCenter sections={sections} />
      <AccountActionsPanel isGuest={session.isGuest} />
    </CloverShell>
  );
}
