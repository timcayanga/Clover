export default function Loading() {
  return (
    <div className="dashboard-loading" aria-label="Loading dashboard">
      <section className="hero">
        <div className="hero-copy dashboard-loading__hero">
          <span className="skeleton-block skeleton-block--line dashboard-loading__eyebrow" />
          <span className="skeleton-block skeleton-block--line dashboard-loading__title" />
          <span className="skeleton-block skeleton-block--line dashboard-loading__copy" />
          <span className="skeleton-block skeleton-block--line dashboard-loading__copy" />
          <div className="hero-actions dashboard-loading__actions">
            <span className="skeleton-block dashboard-loading__button" />
            <span className="skeleton-block dashboard-loading__button" />
            <span className="skeleton-block dashboard-loading__button" />
          </div>
        </div>

        <div className="hero-metrics dashboard-loading__metrics">
          {Array.from({ length: 4 }).map((_, index) => (
            <article key={index} className="metric dashboard-loading__metric">
              <span className="skeleton-block skeleton-block--line dashboard-loading__eyebrow" />
              <strong className="skeleton-block skeleton-block--line dashboard-loading__value" />
              <small className="skeleton-block skeleton-block--line dashboard-loading__copy" />
            </article>
          ))}
        </div>
      </section>

      <section className="dashboard-visual-grid" aria-hidden="true">
        <article className="glass dashboard-visual-card dashboard-visual-skeleton">
          <div className="dashboard-visual-card__head">
            <div className="dashboard-visual-skeleton__stack">
              <span className="skeleton-block skeleton-block--line skeleton-block--line-short" />
              <span className="skeleton-block skeleton-block--line skeleton-block--line-long" />
            </div>
            <span className="skeleton-block skeleton-block--line skeleton-block--line-short dashboard-visual-skeleton__pill" />
          </div>
          <div className="dashboard-visual-skeleton__chart">
            <div className="dashboard-visual-skeleton__spark">
              {Array.from({ length: 6 }).map((_, index) => (
                <span key={index} className="skeleton-block dashboard-visual-skeleton__dot" />
              ))}
            </div>
            <div className="dashboard-visual-skeleton__labels">
              {Array.from({ length: 6 }).map((_, index) => (
                <span key={index} className="skeleton-block skeleton-block--line dashboard-visual-skeleton__label" />
              ))}
            </div>
          </div>
        </article>

        <article className="glass dashboard-visual-card dashboard-visual-skeleton">
          <div className="dashboard-visual-card__head">
            <div className="dashboard-visual-skeleton__stack">
              <span className="skeleton-block skeleton-block--line skeleton-block--line-short" />
              <span className="skeleton-block skeleton-block--line skeleton-block--line-long" />
            </div>
            <span className="skeleton-block skeleton-block--line skeleton-block--line-short dashboard-visual-skeleton__pill" />
          </div>
          <div className="dashboard-visual-skeleton__bars">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="dashboard-visual-skeleton__bar">
                <span className="skeleton-block skeleton-block--line skeleton-block--line-short" />
                <span className="skeleton-block dashboard-visual-skeleton__bar-fill" />
              </div>
            ))}
          </div>
        </article>
      </section>
    </div>
  );
}
