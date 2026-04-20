"use client";

type MonthPoint = {
  key: string;
  label: string;
  net: number;
  x: number;
  y: number;
};

type CategoryRow = {
  name: string;
  amount: number;
  share: number;
};

type DashboardVisualsProps = {
  currentNetDelta: number;
  currentExpense: number;
  monthPoints: MonthPoint[];
  linePath: string;
  chartWidth: number;
  chartHeight: number;
  chartPadding: number;
  topCategoryRows: CategoryRow[];
  formatSignedCurrency: (value: number) => string;
  formatCompactPercentage: (value: number) => string;
};

export function DashboardVisuals({
  currentNetDelta,
  currentExpense,
  monthPoints,
  linePath,
  chartWidth,
  chartHeight,
  chartPadding,
  topCategoryRows,
  formatSignedCurrency,
  formatCompactPercentage,
}: DashboardVisualsProps) {
  const currentNetTrend = currentNetDelta >= 0 ? "positive" : "negative";

  return (
    <section className="dashboard-visual-grid">
      <article className="glass dashboard-visual-card dashboard-visual-card--trend">
        <div className="dashboard-visual-card__head">
          <div>
            <p className="eyebrow">Trend</p>
            <h4>Six-month net cash flow</h4>
          </div>
          <span className={`dashboard-visual-pill ${currentNetTrend}`}>{formatSignedCurrency(currentNetDelta)}</span>
        </div>
        <div className="dashboard-line-chart" role="img" aria-label="Net cash flow over the last six months">
          <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`}>
            <defs>
              <linearGradient id="dashboard-flow-gradient" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="rgba(3, 168, 192, 0.34)" />
                <stop offset="100%" stopColor="rgba(3, 168, 192, 0.03)" />
              </linearGradient>
            </defs>
            <path
              d={`${linePath} L ${monthPoints[monthPoints.length - 1].x.toFixed(1)} ${chartHeight - chartPadding} L ${monthPoints[0].x.toFixed(1)} ${chartHeight - chartPadding} Z`}
              fill="url(#dashboard-flow-gradient)"
            />
            <path d={linePath} fill="none" stroke="var(--accent)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
            {monthPoints.map((point) => (
              <circle key={point.key} cx={point.x} cy={point.y} r="4.5" fill="white" stroke="var(--accent)" strokeWidth="3" />
            ))}
          </svg>
          <div className="dashboard-line-chart__labels">
            {monthPoints.map((point) => (
              <div key={point.key} className="dashboard-line-chart__label">
                <strong>{point.label}</strong>
                <span className={point.net >= 0 ? "positive" : "negative"} aria-label={`${point.label} net ${formatSignedCurrency(point.net)}`}>
                  {formatSignedCurrency(point.net)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </article>

      <article className="glass dashboard-visual-card dashboard-visual-card--mix">
        <div className="dashboard-visual-card__head">
          <div>
            <p className="eyebrow">Mix</p>
            <h4>Where the money went</h4>
          </div>
          <span className="dashboard-visual-pill">{formatSignedCurrency(currentExpense)}</span>
        </div>
        <div className="dashboard-category-bars">
          {topCategoryRows.length > 0 ? (
            topCategoryRows.map((category, index) => {
              const width = Math.max(category.share, category.amount > 0 ? 8 : 0);
              return (
                <div key={category.name} className="dashboard-category-bars__item">
                  <div className="dashboard-category-bars__meta">
                    <strong>{category.name}</strong>
                    <span>
                      {formatSignedCurrency(category.amount)} · {formatCompactPercentage(category.share)}
                    </span>
                  </div>
                  <div className="dashboard-category-bars__track" aria-hidden="true">
                    <div
                      className={`dashboard-category-bars__fill dashboard-category-bars__fill--${index % 4}`}
                      style={{ width: `${Math.min(width, 100)}%` }}
                    />
                  </div>
                </div>
              );
            })
          ) : (
            <div className="dashboard-empty-visual">
              <strong>No spending yet</strong>
              <span>Import a statement to see a simple category breakdown here.</span>
            </div>
          )}
        </div>
      </article>
    </section>
  );
}
