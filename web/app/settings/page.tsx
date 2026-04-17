import { CloverShell } from "@/components/clover-shell";

type FieldKind = "text" | "select" | "textarea" | "toggle";

type SettingField = {
  label: string;
  helper?: string;
  kind: FieldKind;
  value?: string;
  options?: string[];
  checked?: boolean;
  rows?: number;
};

type SettingSection = {
  title: string;
  eyebrow: string;
  summary: string;
  fields: SettingField[];
};

const sections: SettingSection[] = [
  {
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
    title: "Display preferences",
    eyebrow: "Layout",
    summary: "Tune how dense the app feels and which parts you see first.",
    fields: [
      { label: "Table density", kind: "select", value: "Comfortable", options: ["Comfortable", "Compact", "Spacious"] },
      { label: "Landing page", kind: "select", value: "Overview", options: ["Overview", "Transactions", "Reports"] },
      { label: "Show balances by default", kind: "toggle", checked: true },
      { label: "Reduce sidebar chrome", kind: "toggle", checked: false },
    ],
  },
  {
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
    title: "Transaction rules",
    eyebrow: "Automation",
    summary: "Create simple rules that keep the transaction list cleaner over time.",
    fields: [
      { label: "Auto-categorize", kind: "toggle", checked: true },
      { label: "Normalize merchant names", kind: "toggle", checked: true },
      { label: "Recurring detection", kind: "toggle", checked: true },
      { label: "Excluded items", kind: "select", value: "Keep manual control", options: ["Keep manual control", "Hide by default", "Always show"] },
      { label: "Merchant rules notes", kind: "textarea", value: "Treat Grab, GCash, and Maya merchant labels as the same source where possible.", rows: 3 },
    ],
  },
  {
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

const quickLinks = sections.map((section) => ({
  id: section.title.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
  label: section.title,
}));

function renderField(field: SettingField) {
  if (field.kind === "toggle") {
    return (
      <label className="settings-toggle">
        <span className="settings-toggle__copy">
          <strong>{field.label}</strong>
          {field.helper ? <span>{field.helper}</span> : null}
        </span>
        <span className="settings-switch">
          <input type="checkbox" defaultChecked={field.checked ?? false} />
          <span aria-hidden="true" />
        </span>
      </label>
    );
  }

  return (
    <label className="settings-field">
      <span>{field.label}</span>
      {field.kind === "select" ? (
        <select defaultValue={field.value}>
          {(field.options ?? []).map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      ) : field.kind === "textarea" ? (
        <textarea defaultValue={field.value} rows={field.rows ?? 3} />
      ) : (
        <input defaultValue={field.value} />
      )}
      {field.helper ? <small>{field.helper}</small> : null}
    </label>
  );
}

export default function SettingsPage() {
  return (
    <CloverShell
      active="settings"
      title="Settings"
      kicker="Workspace controls"
      subtitle="Everything here is aimed at the parts of Clover that should stay predictable: identity, formatting, imports, rules, alerts, security, and backups."
      showTopbar={false}
    >
      <section className="settings-hero glass">
        <div>
          <p className="eyebrow">Settings</p>
          <h3>Set the defaults once, then let Clover stay out of your way.</h3>
          <p className="settings-hero__copy">
            These sections are the first pass at a full settings area for the app. They cover the controls that matter
            most for finance work: formatting, import behavior, transaction cleanup, notifications, security, and
            export paths.
          </p>
        </div>

        <aside className="settings-hero__panel">
          <div className="settings-stat">
            <span>Scope</span>
            <strong>10 sections</strong>
          </div>
          <div className="settings-stat">
            <span>Mode</span>
            <strong>Workspace-wide</strong>
          </div>
          <div className="settings-stat">
            <span>Focus</span>
            <strong>Defaults + rules</strong>
          </div>
          <div className="settings-nav">
            <span className="settings-nav__label">Jump to</span>
            {quickLinks.map((link) => (
              <a key={link.id} href={`#${link.id}`}>
                {link.label}
              </a>
            ))}
          </div>
        </aside>
      </section>

      <section className="settings-grid">
        {sections.map((section) => (
          <article key={section.title} id={section.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")} className="settings-card glass">
            <div className="settings-card__head">
              <div>
                <p className="eyebrow">{section.eyebrow}</p>
                <h4>{section.title}</h4>
              </div>
              <p className="settings-card__summary">{section.summary}</p>
            </div>

            <div className="settings-section-grid">
              {section.fields.map((field) => (
                <div key={field.label} className="settings-section-grid__item">
                  {renderField(field)}
                </div>
              ))}
            </div>

            <div className="settings-card__footer">
              <span>Changes are surfaced here first, then wired to persistence next.</span>
              <div className="settings-card__actions">
                <button className="button button-secondary button-small" type="button">
                  Reset section
                </button>
                <button className="button button-primary button-small" type="button">
                  Save section
                </button>
              </div>
            </div>
          </article>
        ))}
      </section>
    </CloverShell>
  );
}
