import Link from "next/link";
import { redirect } from "next/navigation";
import { CloverShell } from "@/components/clover-shell";
import { AccountActionsPanel } from "@/components/account-actions-panel";
import { SettingsCenter, type SettingSection } from "@/components/settings-center";
import { getSessionContext } from "@/lib/auth";
import { getOrCreateCurrentUser, hasCompletedOnboarding } from "@/lib/user-context";
import { getGoalDefinition } from "@/lib/goals";

export const metadata = {
  title: "Settings",
};

const sections: SettingSection[] = [
  {
    group: "General",
    title: "Profile and workspace",
    eyebrow: "Core",
    summary: "Keep the app identity and workspace defaults in one place.",
    fields: [
      { label: "Workspace name", kind: "text", value: "Clover Personal Finance" },
      { label: "Display name", kind: "text", value: "Tim" },
      { label: "Email", kind: "text", value: "tim@example.com" },
      { label: "Timezone", kind: "select", value: "Asia/Manila", options: ["Asia/Manila", "UTC", "America/Los_Angeles", "Europe/London"] },
    ],
  },
  {
    group: "General",
    title: "Currency and locale",
    eyebrow: "Formatting",
    summary: "Control how money, dates, and numbers appear across the app.",
    fields: [
      { label: "Default currency", kind: "select", value: "PHP", options: ["PHP", "USD", "EUR", "GBP", "SGD"] },
      { label: "Date format", kind: "select", value: "D MMM YYYY", options: ["D MMM YYYY", "MM/DD/YYYY", "YYYY-MM-DD"] },
      { label: "Number format", kind: "select", value: "1,234.56", options: ["1,234.56", "1.234,56", "1 234,56"] },
      { label: "Locale", kind: "select", value: "en-PH", options: ["en-PH", "en-US", "en-GB"] },
    ],
  },
  {
    group: "General",
    title: "Display preferences",
    eyebrow: "Layout",
    summary: "Tune how dense the app feels and which parts you see first.",
    fields: [
      { label: "Table density", kind: "select", value: "Comfortable", options: ["Comfortable", "Compact", "Spacious"] },
      { label: "Landing page", kind: "select", value: "Dashboard", options: ["Dashboard", "Transactions", "Reports"] },
      { label: "Show balances by default", kind: "toggle", checked: true },
      { label: "Reduce sidebar chrome", kind: "toggle", checked: false },
    ],
  },
  {
    group: "Automation",
    title: "Import defaults",
    eyebrow: "Imports",
    summary: "Shape the behavior of new statement imports before they land.",
    fields: [
      { label: "Default account", kind: "select", value: "Use detected account", options: ["Use detected account", "Most recently used", "First available account"] },
      { label: "Duplicate handling", kind: "select", value: "Flag and review", options: ["Flag and review", "Skip duplicates", "Import anyway"] },
      { label: "Category suggestions", kind: "toggle", checked: true },
      { label: "Unknown merchants", kind: "select", value: "Leave unassigned", options: ["Leave unassigned", "Use uncategorized", "Use last matched category"] },
      { label: "Auto-create account groups", kind: "toggle", checked: false },
    ],
  },
  {
    group: "Automation",
    title: "Transaction rules",
    eyebrow: "Automation",
    summary: "Create simple rules that keep the transaction list cleaner over time.",
    fields: [
      { label: "Auto-categorize", kind: "toggle", checked: true },
      { label: "Normalize merchant names", kind: "toggle", checked: true },
      { label: "Recurring detection", kind: "toggle", checked: true },
      { label: "Ignored items", kind: "select", value: "Keep manual control", options: ["Keep manual control", "Hide by default", "Always show"] },
      { label: "Merchant rules notes", kind: "textarea", value: "Treat Grab, GCash, and Maya merchant labels as the same source where possible.", rows: 3 },
    ],
  },
  {
    group: "Automation",
    title: "Category management",
    eyebrow: "Organization",
    summary: "Keep categories tidy so reports and transactions stay readable.",
    fields: [
      { label: "Category groups", kind: "select", value: "Income, Expenses, Transfers", options: ["Income, Expenses, Transfers", "Simple", "Custom groups"] },
      { label: "Merge duplicates", kind: "toggle", checked: true },
      { label: "Pin top categories", kind: "toggle", checked: true },
      { label: "Category notes", kind: "textarea", value: "Use this area to document naming conventions and keep category cleanup consistent.", rows: 3 },
    ],
  },
  {
    group: "Alerts and access",
    title: "Notifications and alerts",
    eyebrow: "Alerts",
    summary: "Decide which events should interrupt your workflow.",
    fields: [
      { label: "Import finished", kind: "toggle", checked: true },
      { label: "Review needed", kind: "toggle", checked: true },
      { label: "Low balance", kind: "toggle", checked: false },
      { label: "Unusual spending", kind: "toggle", checked: true },
      { label: "Weekly summary", kind: "toggle", checked: false },
    ],
  },
  {
    group: "Alerts and access",
    title: "Security",
    eyebrow: "Access",
    summary: "A few practical controls for session safety and account protection.",
    fields: [
      { label: "Session timeout", kind: "select", value: "8 hours", options: ["1 hour", "8 hours", "24 hours", "7 days"] },
      { label: "Two-factor auth", kind: "toggle", checked: false },
      { label: "Trusted devices", kind: "toggle", checked: true },
      { label: "Login notes", kind: "textarea", value: "Use this area for access reminders, recovery email notes, or security preferences.", rows: 3 },
    ],
  },
  {
    group: "Data and connections",
    title: "Export and backup",
    eyebrow: "Data",
    summary: "Make it easy to get data out and keep a recovery path ready.",
    fields: [
      { label: "Export format", kind: "select", value: "CSV + PDF", options: ["CSV + PDF", "CSV only", "PDF only"] },
      { label: "Backup cadence", kind: "select", value: "Weekly reminder", options: ["Daily reminder", "Weekly reminder", "Monthly reminder", "Off"] },
      { label: "Download archive", kind: "toggle", checked: true },
      { label: "Restore path", kind: "text", value: "Future support" },
    ],
  },
  {
    group: "Data and connections",
    title: "Integrations",
    eyebrow: "Connections",
    summary: "Track the external tools and import channels Clover should connect to next.",
    fields: [
      { label: "Bank connections", kind: "text", value: "Not connected yet" },
      { label: "Spreadsheet sources", kind: "text", value: "CSV, XLSX, and bank exports" },
      { label: "Email import", kind: "toggle", checked: false },
      { label: "API access", kind: "toggle", checked: false },
    ],
  },
];

export default async function SettingsPage() {
  const session = await getSessionContext();
  const user = await getOrCreateCurrentUser(session.userId);
  if (!session.isGuest && !hasCompletedOnboarding(user)) {
    redirect("/onboarding");
  }

  const currentGoal = getGoalDefinition(user.primaryGoal ?? null);

  return (
    <CloverShell
      active="settings"
      title="Settings"
      kicker="Workspace controls"
      subtitle="Search, jump, and tune Clover's defaults."
      actions={
        <Link className="button button-primary button-small" href="/goals">
          Set/Change goal
        </Link>
      }
    >
      <section className="settings-goal-strip glass">
        <div>
          <p className="eyebrow">Goal alignment</p>
          <h4>{currentGoal.title}</h4>
          <p>{currentGoal.description}</p>
        </div>
        <div className="settings-goal-strip__meta">
          <strong>{currentGoal.signal}</strong>
          <span>Open Goals to update the plan or check momentum.</span>
        </div>
      </section>
      <SettingsCenter sections={sections} />
      <AccountActionsPanel isGuest={session.isGuest} />
    </CloverShell>
  );
}
