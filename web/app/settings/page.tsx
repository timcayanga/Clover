import { CloverShell } from "@/components/clover-shell";

export default function SettingsPage() {
  return (
    <CloverShell active="settings" title="Settings" showTopbar={false}>
      <section className="glass" style={{ borderRadius: 28, padding: 24, minHeight: 240 }}>
        <p className="eyebrow">Settings</p>
        <h3>Settings will live here soon.</h3>
        <p style={{ marginTop: 10, color: "var(--muted)", lineHeight: 1.6, maxWidth: "60ch" }}>
          This is just the placeholder for now so the sidebar button has a place to go.
        </p>
      </section>
    </CloverShell>
  );
}
