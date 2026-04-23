import { redirect } from "next/navigation";
import Link from "next/link";
import { CloverShell } from "@/components/clover-shell";
import { AccountActionsPanel } from "@/components/account-actions-panel";
import { SettingsCenter, type SettingSection } from "@/components/settings-center";
import { getSessionContext } from "@/lib/auth";
import { getEnv } from "@/lib/env";
import { getOrCreateCurrentUser, hasCompletedOnboarding } from "@/lib/user-context";

export const metadata = {
  title: "Settings",
};

const sections: SettingSection[] = [
  {
    group: "Basics",
    title: "Workspace defaults",
    eyebrow: "Default values",
    summary: "Set the shared values Clover uses every time you open it.",
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
    title: "Import behavior",
    eyebrow: "Import flow",
    summary: "Make statement imports predictable and easy to review.",
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
    group: "Automation",
    title: "Categorization rules",
    eyebrow: "Matching",
    summary: "Control how Clover labels merchants and recurring activity.",
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
    title: "Display preferences",
    eyebrow: "Layout",
    summary: "Choose the layout Clover should open with and how dense it feels.",
    fields: [
      { label: "Table density", kind: "select", value: "Comfortable", options: ["Comfortable", "Compact", "Spacious"], tier: "primary" },
      { label: "Landing page", kind: "select", value: "Dashboard", options: ["Dashboard", "Transactions", "Reports"], tier: "primary" },
      { label: "Show balances by default", kind: "toggle", checked: true, tier: "primary" },
      { label: "Reduce sidebar chrome", kind: "toggle", checked: false, tier: "advanced" },
    ],
  },
  {
    group: "Access",
    title: "Notifications",
    eyebrow: "Signals",
    summary: "Pick the alerts that deserve your attention.",
    fields: [
      { label: "Import finished", kind: "toggle", checked: true, tier: "primary" },
      { label: "Review needed", kind: "toggle", checked: true, tier: "primary" },
      { label: "Unusual spending", kind: "toggle", checked: true, tier: "primary" },
      { label: "Low balance", kind: "toggle", checked: false, tier: "advanced" },
      { label: "Weekly summary", kind: "toggle", checked: false, tier: "advanced" },
    ],
  },
  {
    group: "Access",
    title: "Security",
    eyebrow: "Safety",
    summary: "Keep sessions and sign-ins under control.",
    fields: [
      { label: "Session timeout", kind: "select", value: "8 hours", options: ["1 hour", "8 hours", "24 hours", "7 days"], tier: "primary" },
      { label: "Two-factor auth", kind: "toggle", checked: false, tier: "primary" },
      { label: "Trusted devices", kind: "toggle", checked: true, tier: "advanced" },
      { label: "Login notes", kind: "textarea", value: "Use this area for access reminders, recovery email notes, or security preferences.", rows: 3, tier: "advanced" },
    ],
  },
  {
    group: "Data",
    title: "Export and connections",
    eyebrow: "Data",
    summary: "Get data out and prepare for future integrations.",
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
      <section className="glass settings-billing-card">
        <p className="eyebrow">Billing</p>
        <h3 style={{ marginTop: 8 }}>Plan status</h3>
        <p style={{ marginTop: 8 }}>
          Current plan: <strong>{user.planTier === "pro" ? "Pro" : "Free"}</strong>.
          {user.planTier === "pro"
            ? " Gumroad is handling your paid access right now."
            : " Upgrade through Gumroad when you are ready to unlock paid access."}
        </p>
        {user.planTier === "free" ? (
          <p style={{ marginTop: 16 }}>
            <Link className="button button-primary button-small" href={env.GUMROAD_UPGRADE_URL ?? "/"}>
              Upgrade with Gumroad
            </Link>
          </p>
        ) : null}
      </section>
      <SettingsCenter sections={sections} />
      <AccountActionsPanel isGuest={session.isGuest} />
    </CloverShell>
  );
}
