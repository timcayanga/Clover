import Link from "next/link";

export function AdminImageLabelCorpusTraining() {
  return (
    <section className="table-panel">
      <div className="admin-users__table-head">
        <div>
          <p className="section-kicker">Image label corpus</p>
          <h3>Receipt and statement image training</h3>
          <p className="panel-muted">
            Review image-based training samples, keep OCR captures traceable, and improve future parsing without
            sacrificing the raw uploaded file.
          </p>
        </div>
        <Link className="button button-secondary button-small" href="/admin/data-qa">
          Open QA console
        </Link>
      </div>
      <div className="admin-users__detail-grid">
        <div className="admin-users__detail-card">
          <span>OCR safety</span>
          <strong>Keep scanned images linked to the original upload.</strong>
        </div>
        <div className="admin-users__detail-card">
          <span>Label quality</span>
          <strong>Use reviewed samples to raise confidence on repeated layouts.</strong>
        </div>
        <div className="admin-users__detail-card">
          <span>Traceability</span>
          <strong>Store the image source, parsed result, and QA notes separately.</strong>
        </div>
      </div>
    </section>
  );
}
