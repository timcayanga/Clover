import { CloverShell } from "@/components/clover-shell";

export default function Loading() {
  return (
    <CloverShell active="reports" kicker="Insights" title="Loading reports" showTopbar={false}>
      <section className="reports-summary-grid reports-summary-grid--three">
        <div className="metric compact glass" style={{ minHeight: 118 }} />
        <div className="metric compact glass" style={{ minHeight: 118 }} />
        <div className="metric compact glass" style={{ minHeight: 118 }} />
      </section>
      <section className="reports-grid reports-grid--primary">
        <div className="report-card glass" style={{ minHeight: 280 }} />
        <div className="report-card glass" style={{ minHeight: 280 }} />
      </section>
      <section className="reports-grid reports-grid--free">
        <div className="report-card glass" style={{ minHeight: 210 }} />
        <div className="report-card glass" style={{ minHeight: 210 }} />
        <div className="report-card glass" style={{ minHeight: 210 }} />
      </section>
    </CloverShell>
  );
}
