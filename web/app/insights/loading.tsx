import { CloverShell } from "@/components/clover-shell";

export default function Loading() {
  return (
    <CloverShell active="insights" kicker="Insights" title="Loading insights" showTopbar={false}>
      <section className="reports-summary-grid reports-summary-grid--three">
        <div className="metric compact glass" style={{ minHeight: 118 }} />
        <div className="metric compact glass" style={{ minHeight: 118 }} />
        <div className="metric compact glass" style={{ minHeight: 118 }} />
      </section>
      <section className="reports-grid reports-grid--primary">
        <div className="report-card glass" style={{ minHeight: 280 }} />
        <div className="report-card glass" style={{ minHeight: 280 }} />
      </section>
      <section className="reports-grid reports-grid--secondary reports-grid--equal">
        <div className="report-card glass" style={{ minHeight: 250 }} />
        <div className="report-card glass" style={{ minHeight: 250 }} />
      </section>
    </CloverShell>
  );
}
