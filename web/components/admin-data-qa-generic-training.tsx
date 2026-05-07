import Link from "next/link";

export function AdminDataQaGenericTraining() {
  return (
    <section className="table-panel">
      <div className="admin-users__table-head">
        <div>
          <p className="section-kicker">Generic training</p>
          <h3>Local feedback loops</h3>
          <p className="panel-muted">
            Use confirmed edits, recategorization, and replayed samples to strengthen Clover&apos;s parser memory
            without overwriting the original statement data.
          </p>
        </div>
        <Link className="button button-secondary button-small" href="/admin/data-qa/summary">
          View bank summary
        </Link>
      </div>
      <div className="admin-users__detail-grid">
        <div className="admin-users__detail-card">
          <span>Deterministic first</span>
          <strong>Parser rules and merchant labels stay ahead of fallback AI.</strong>
        </div>
        <div className="admin-users__detail-card">
          <span>Feedback capture</span>
          <strong>Save confirmed corrections as durable training signals.</strong>
        </div>
        <div className="admin-users__detail-card">
          <span>Safety</span>
          <strong>Never overwrite raw source data or confirmed financial records.</strong>
        </div>
      </div>
    </section>
  );
}
