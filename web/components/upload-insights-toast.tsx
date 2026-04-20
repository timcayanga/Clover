"use client";

import Link from "next/link";

export type UploadInsightsSummary = {
  fileName: string;
  rowsImported: number;
  accountName: string | null;
  institution: string | null;
  incomeTotal: number;
  expenseTotal: number;
  netTotal: number;
  topCategoryName: string | null;
  topCategoryAmount: number | null;
  topCategoryShare: number | null;
  topMerchantName: string | null;
  topMerchantCount: number | null;
};

type UploadInsightsToastProps = {
  summary: UploadInsightsSummary;
  onClose: () => void;
};

const currencyFormatter = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
  minimumFractionDigits: 2,
});

const formatPercent = (value: number) => `${Math.round(value * 100)}%`;

const formatAmount = (value: number) => currencyFormatter.format(Math.abs(value));

export function UploadInsightsToast({ summary, onClose }: UploadInsightsToastProps) {
  const sampleInsights = [
    summary.accountName
      ? `Clover matched this upload to ${summary.accountName}${summary.institution ? ` (${summary.institution})` : ""}.`
      : null,
    summary.topCategoryName && summary.topCategoryShare !== null && summary.topCategoryAmount !== null
      ? `${summary.topCategoryName} was the biggest spending bucket, at ${formatAmount(summary.topCategoryAmount)} or ${formatPercent(summary.topCategoryShare)} of expenses.`
      : null,
    summary.topMerchantName && summary.topMerchantCount
      ? `You had ${summary.topMerchantCount} transaction${summary.topMerchantCount === 1 ? "" : "s"} with ${summary.topMerchantName}.`
      : null,
    summary.incomeTotal || summary.expenseTotal
      ? `This upload shows ${formatAmount(summary.incomeTotal)} in income and ${formatAmount(summary.expenseTotal)} in spending.`
      : null,
    summary.netTotal !== 0
      ? `Net flow for this upload is ${summary.netTotal > 0 ? "+" : "-"}${formatAmount(summary.netTotal)}.`
      : null,
  ].filter((value): value is string => Boolean(value));

  return (
    <aside className="upload-insights-toast glass" role="status" aria-live="polite">
      <div className="upload-insights-toast__eyebrow">Insights generated</div>
      <div className="upload-insights-toast__title-row">
        <div>
          <h4>Upload complete</h4>
          <p>
            {summary.rowsImported} row{summary.rowsImported === 1 ? "" : "s"} from {summary.fileName} are now categorized and ready to review.
          </p>
        </div>
        <button type="button" className="icon-button upload-insights-toast__close" onClick={onClose} aria-label="Close insights popup">
          ×
        </button>
      </div>

      <div className="upload-insights-toast__callout">
        Upload statement → auto categorize → insights
      </div>

      <ul className="upload-insights-toast__list">
        {sampleInsights.map((insight) => (
          <li key={insight}>{insight}</li>
        ))}
      </ul>

      <div className="upload-insights-toast__actions">
        <Link href="/insights" className="button button-primary button-small" onClick={onClose}>
          Open Insights
        </Link>
        <button type="button" className="button button-secondary button-small" onClick={onClose}>
          Dismiss
        </button>
      </div>
    </aside>
  );
}
