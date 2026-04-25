import { redirect } from "next/navigation";
import { CloverShell } from "@/components/clover-shell";
import { AccountActionsPanel } from "@/components/account-actions-panel";
import { BillingCard } from "@/components/billing-card";
import { SettingsCenter, type SettingSection } from "@/components/settings-center";
import { getSessionContext } from "@/lib/auth";
import { getEnv } from "@/lib/env";
import { getOrCreateCurrentUser, hasCompletedOnboarding } from "@/lib/user-context";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = {
  title: "Settings",
};

const sections: SettingSection[] = [
  {
    group: "General",
    title: "Workspace defaults",
    eyebrow: "Defaults",
    summary: "Set the values Clover uses most often.",
    fields: [
      { label: "Workspace name", kind: "text", value: "Clover Personal Finance", tier: "primary" },
      { label: "Timezone", kind: "select", value: "Asia/Manila", options: ["Asia/Manila", "UTC", "America/Los_Angeles", "Europe/London"], tier: "primary" },
      { label: "Default currency", kind: "select", value: "PHP", options: ["PHP", "USD", "EUR", "GBP", "SGD"], tier: "primary" },
      { label: "Date format", kind: "select", value: "D MMM YYYY", options: ["D MMM YYYY", "MM/DD/YYYY", "YYYY-MM-DD"], tier: "advanced" },
      { label: "Number format", kind: "select", value: "1,234.56", options: ["1,234.56", "1.234,56", "1 234,56"], tier: "advanced" },
      { label: "Locale", kind: "select", value: "en-PH", options: ["en-PH", "en-US", "en-GB"], tier: "advanced" },
    ],
  },
  {
    group: "Imports",
    title: "Import defaults",
    eyebrow: "Import flow",
    summary: "Choose how Clover handles new statements.",
    fields: [
      {
        label: "Default account",
        kind: "select",
        value: "Use detected account",
        options: ["Use detected account", "Most recently used", "First available account"],
        tier: "primary",
      },
      {
        label: "Duplicate handling",
        kind: "select",
        value: "Flag and review",
        options: ["Flag and review", "Skip duplicates", "Import anyway"],
        tier: "primary",
      },
      {
        label: "Unknown merchants",
        kind: "select",
        value: "Leave unassigned",
        options: ["Leave unassigned", "Use uncategorized", "Use last matched category"],
        helper: "Choose the fallback when Clover cannot confidently match a merchant.",
        tier: "primary",
      },
      { label: "Category suggestions", kind: "toggle", checked: true, helper: "Use past edits to suggest likely categories.", tier: "advanced" },
      { label: "Auto-create account groups", kind: "toggle", checked: false, helper: "Helpful once you manage many accounts.", tier: "advanced" },
    ],
  },
  {
    group: "Categorization",
    title: "Merchant rules",
    eyebrow: "Matching",
    summary: "Keep merchants and recurring activity consistent.",
    fields: [
      { label: "Auto-categorize", kind: "toggle", checked: true, helper: "Apply matches without blocking review.", tier: "primary" },
      { label: "Normalize merchant names", kind: "toggle", checked: true, helper: "Keep the same merchant name consistent across imports.", tier: "primary" },
      { label: "Recurring detection", kind: "toggle", checked: true, helper: "Mark repeating items so they’re easier to scan.", tier: "primary" },
      {
        label: "Category groups",
        kind: "select",
        value: "Income, Expenses, Transfers",
        options: ["Income, Expenses, Transfers", "Simple", "Custom groups"],
        tier: "advanced",
      },
      { label: "Merge duplicates", kind: "toggle", checked: true, tier: "advanced" },
      {
        label: "Merchant rules notes",
        kind: "textarea",
        value: "Treat Grab, GCash, and Maya merchant labels as the same source where possible.",
        rows: 3,
        tier: "advanced",
      },
    ],
  },
  {
    group: "Display",
    title: "View preferences",
    eyebrow: "Layout",
    summary: "Choose how Clover looks and opens.",
    fields: [
      { label: "Table density", kind: "select", value: "Comfortable", options: ["Comfortable", "Compact", "Spacious"], tier: "primary" },
      { label: "Landing page", kind: "select", value: "Dashboard", options: ["Dashboard", "Transactions", "Reports"], tier: "primary" },
      { label: "Show balances by default", kind: "toggle", checked: true, tier: "primary" },
      { label: "Reduce sidebar chrome", kind: "toggle", checked: false, tier: "advanced" },
    ],
  },
  {
    group: "Alerts & Security",
    title: "Notifications",
    eyebrow: "Alerts",
    summary: "Pick the alerts you want to see.",
    fields: [
      { label: "Import finished", kind: "toggle", checked: true, tier: "primary" },
      { label: "Review needed", kind: "toggle", checked: true, tier: "primary" },
      { label: "Unusual spending", kind: "toggle", checked: true, tier: "primary" },
      { label: "Low balance", kind: "toggle", checked: false, tier: "advanced" },
      { label: "Weekly summary", kind: "toggle", checked: false, tier: "advanced" },
    ],
  },
  {
    group: "Alerts & Security",
    title: "Security",
    eyebrow: "Safety",
    summary: "Keep sign-in access under control.",
    fields: [
      { label: "Session timeout", kind: "select", value: "8 hours", options: ["1 hour", "8 hours", "24 hours", "7 days"], tier: "primary" },
      { label: "Two-factor auth", kind: "toggle", checked: false, tier: "primary" },
      { label: "Trusted devices", kind: "toggle", checked: true, tier: "advanced" },
      { label: "Login notes", kind: "textarea", value: "Use this area for access reminders, recovery email notes, or security preferences.", rows: 3, tier: "advanced" },
    ],
  },
  {
    group: "Export & Sync",
    title: "Export and connections",
    eyebrow: "Data",
    summary: "Get data out and prepare for future connections.",
    fields: [
      { label: "Export format", kind: "select", value: "CSV + PDF", options: ["CSV + PDF", "CSV only", "PDF only"], tier: "primary" },
      { label: "Backup cadence", kind: "select", value: "Weekly reminder", options: ["Daily reminder", "Weekly reminder", "Monthly reminder", "Off"], tier: "primary" },
      { label: "Download archive", kind: "toggle", checked: true, tier: "primary" },
      { label: "Restore path", kind: "text", value: "Future support", tier: "advanced" },
      { label: "Bank connections", kind: "text", value: "Not connected yet", tier: "advanced" },
      { label: "Spreadsheet sources", kind: "text", value: "CSV, XLSX, and bank exports", tier: "advanced" },
      { label: "Email import", kind: "toggle", checked: false, tier: "advanced" },
      { label: "API access", kind: "toggle", checked: false, tier: "advanced" },
    ],
  },
];

export default async function SettingsPage() {
  const session = await getSessionContext();
  const user = await getOrCreateCurrentUser(session.userId);
  const env = getEnv();
  if (!session.isGuest && !hasCompletedOnboarding(user)) {
    redirect("/onboarding");
  }

  return (
    <CloverShell
      active="settings"
      title="Settings"
      kicker="Control room"
      subtitle="Keep your workspace, formatting, and automation defaults in one place."
    >
      <BillingCard
        planTier={user.planTier}
        paypalClientId={env.PAYPAL_CLIENT_ID ?? null}
        paypalPlanId={env.PAYPAL_PRO_PLAN_ID ?? null}
        userId={user.id}
        clerkUserId={user.clerkUserId}
        email={user.email}
      />
      <SettingsCenter sections={sections} />
      <AccountActionsPanel isGuest={session.isGuest} />
    </CloverShell>
  );
}
