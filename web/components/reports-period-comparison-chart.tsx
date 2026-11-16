import { formatCurrencyAmount } from "@/lib/currency-format";

export type ReportsPeriodComparisonPoint = {
  key: string;
  label: string;
  detailLabel: string;
  income: number;
  expense: number;
};

type ReportsPeriodComparisonChartProps = {
  points: ReportsPeriodComparisonPoint[];
  currency: string;
  label: string;
};

export function ReportsPeriodComparisonChart({ points, currency, label }: ReportsPeriodComparisonChartProps) {
  const scale = Math.max(1, ...points.flatMap((point) => [point.income, point.expense]));

  return (
    <div className="reports-period-chart" aria-label={`${label} income and expenses`}>
      <div className="reports-period-chart__legend" aria-hidden="true">
        <span><i className="reports-period-chart__dot reports-period-chart__dot--income" />Income</span>
        <span><i className="reports-period-chart__dot reports-period-chart__dot--expense" />Expenses</span>
      </div>
      <div
        className="reports-period-chart__plot"
        style={{ gridTemplateColumns: `repeat(${Math.max(points.length, 1)}, minmax(0, 1fr))` }}
      >
        {points.map((point) => {
          const hasMovement = point.income > 0 || point.expense > 0;
          const accessibleLabel = `${point.detailLabel}: income ${formatCurrencyAmount(point.income, currency)}, expenses ${formatCurrencyAmount(point.expense, currency)}`;

          return (
            <div
              className="reports-period-chart__period"
              key={point.key}
              tabIndex={hasMovement ? 0 : undefined}
              aria-label={accessibleLabel}
              title={accessibleLabel}
            >
              <div className="reports-period-chart__bars" aria-hidden="true">
                <span
                  className="reports-period-chart__bar reports-period-chart__bar--income"
                  style={{ height: point.income > 0 ? `${Math.max((point.income / scale) * 100, 4)}%` : 0 }}
                />
                <span
                  className="reports-period-chart__bar reports-period-chart__bar--expense"
                  style={{ height: point.expense > 0 ? `${Math.max((point.expense / scale) * 100, 4)}%` : 0 }}
                />
              </div>
              <span className="reports-period-chart__label">{point.label}</span>
              {hasMovement ? (
                <span className="reports-period-chart__tooltip" aria-hidden="true">
                  <strong>{point.detailLabel}</strong>
                  <span>Income {formatCurrencyAmount(point.income, currency)}</span>
                  <span>Expenses {formatCurrencyAmount(point.expense, currency)}</span>
                </span>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
