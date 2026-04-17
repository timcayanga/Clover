import { CloverShell } from "@/components/clover-shell";

const sections = [
  {
    title: "Profile and workspace",
    eyebrow: "Core",
    summary: "Keep the app identity and workspace defaults in one place.",
    items: [
      { label: "Workspace name", value: "Clover Personal Finance" },
      { label: "Display name", value: "Tim" },
      { label: "Email", value: "tim@example.com" },
      { label: "Timezone", value: "Asia/Manila" },
    ],
  },
  {
    title: "Currency and locale",
    eyebrow: "Formatting",
    summary: "Control how money, dates, and numbers appear across the app.",
    items: [
      { label: "Default currency", value: "PHP" },
      { label: "Date format", value: "D MMM YYYY" },
      { label: "Number format", value: "1,234.56" },
      { label: "Locale", value: "en-PH" },
    ],
  },
  {
    title: "Import defaults",
    eyebrow: "Imports",
    summary: "Shape the behavior of new statement imports before they land.",
    items: [
      { label: "Default account", value: "Use the detected account" },
      { label: "Duplicate handling", value: "Flag and review" },
      { label: "Category suggestions", value: "Auto-suggest from history" },
      { label: "Unknown merchants", value: "Leave unassigned" },
    ],
  },
  {
    title: "Transaction rules",
    eyebrow: "Automation",
    summary: "Create simple rules that keep the transaction list cleaner over time.",
    items: [
      { label: "Auto-categorize", value: "On for common merchants" },
      { label: "Merchant cleanup", value: "Normalize names when possible" },
      { label: "Recurring detection", value: "Highlight repeating items" },
      { label: "Excluded items", value: "Keep manual control" },
    ],
  },
  {
    title: "Export and backup",
    eyebrow: "Data",
    summary: "Make it easy to get data out and keep a recovery path ready.",
    items: [
      { label: "Export format", value: "CSV + PDF" },
      { label: "Backup cadence", value: "Weekly reminder" },
      { label: "Download archive", value: "Available on demand" },
      { label: "Restore path", value: "Future support" },
    ],
  },
] as const;

export default function SettingsPage() {
  return (
    <CloverShell
      active="settings"
      title="Settings"
      kicker="Workspace controls"
      subtitle="Start with the essentials: identity, currency, import defaults, transaction rules, and export options."
      showTopbar={false}
    >
      <section className="settings-hero glass">
        <div>
          <p className="eyebrow">Settings</p>
          <h3>Simple controls for the parts of Clover that should stay predictable.</h3>
          <p className="settings-hero__copy">
            This page is a scaffold for the settings we want first. The controls are here visually so we can flesh
            them out section by section without changing the app flow later.
          </p>
        </div>

        <aside className="settings-hero__panel">
          <div className="settings-stat">
            <span>Scope</span>
            <strong>5 core areas</strong>
          </div>
          <div className="settings-stat">
            <span>Mode</span>
            <strong>Workspace-wide</strong>
          </div>
          <div className="settings-stat">
            <span>Next step</span>
            <strong>Wire persistence</strong>
          </div>
        </aside>
      </section>

      <section className="settings-grid">
        {sections.map((section) => (
          <article key={section.title} className="settings-card glass">
            <div className="settings-card__head">
              <div>
                <p className="eyebrow">{section.eyebrow}</p>
                <h4>{section.title}</h4>
              </div>
              <p className="settings-card__summary">{section.summary}</p>
            </div>

            <div className="settings-form">
              {section.items.map((item) => (
                <label key={item.label} className="settings-field">
                  <span>{item.label}</span>
                  <input readOnly value={item.value} />
                </label>
              ))}
            </div>

            <div className="settings-card__footer">
              <button className="button button-secondary button-small" type="button">
                Edit section
              </button>
              <span>Save and sync later</span>
            </div>
          </article>
        ))}
      </section>
    </CloverShell>
  );
}
