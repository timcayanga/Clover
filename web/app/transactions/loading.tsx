export default function Loading() {
  return (
    <section className="transactions-layout">
      <div className="glass table-panel table-panel--full transactions-table-panel transactions-main-panel">
        <div className="transactions-loading-state" role="status" aria-live="polite" aria-label="Loading transactions">
          <div className="transactions-loading-header">
            <span className="skeleton-block skeleton-block--checkbox" />
            <span className="skeleton-block skeleton-block--icon" />
            <span className="skeleton-block skeleton-block--name" />
            <span className="skeleton-block skeleton-block--date" />
            <span className="skeleton-block skeleton-block--account" />
            <span className="skeleton-block skeleton-block--category" />
            <span className="skeleton-block skeleton-block--amount" />
            <span className="skeleton-block skeleton-block--chevron" />
            <span className="skeleton-block skeleton-block--warning" />
          </div>
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="transactions-loading-row">
              <span className="skeleton-block skeleton-block--checkbox" />
              <span className="skeleton-block skeleton-block--icon" />
              <span className="transactions-loading-name">
                <span className="skeleton-block skeleton-block--line skeleton-block--line-long" />
                <span className="skeleton-block skeleton-block--line skeleton-block--line-short" />
              </span>
              <span className="skeleton-block skeleton-block--date" />
              <span className="skeleton-block skeleton-block--account" />
              <span className="skeleton-block skeleton-block--category" />
              <span className="skeleton-block skeleton-block--amount" />
              <span className="skeleton-block skeleton-block--chevron" />
              <span className="skeleton-block skeleton-block--warning" />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
