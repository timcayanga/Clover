"use client";

import { useEffect } from "react";

export type UploadInsightsSummary = {
  fileName: string;
  rowsImported: number;
  accountId: string | null;
  accountName: string | null;
  institution: string | null;
  accountNumber?: string | null;
  accountType?: "bank" | "wallet" | "credit_card" | "cash" | "investment" | "other" | null;
  balance: string | null;
  optimistic?: boolean;
  optimisticAccountId?: string | null;
  previewTransactions?: Array<{
    id: string;
    importFileId: string;
    accountId: string;
    accountName: string;
    categoryId: string | null;
    categoryName: string | null;
    reviewStatus: "pending_review";
    date: string;
    amount: string;
    currency: string;
    type: "income" | "expense" | "transfer";
    merchantRaw: string;
    merchantClean: string | null;
    description: string | null;
    isTransfer: boolean;
    isExcluded: boolean;
    source: "upload";
  }>;
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

export function UploadInsightsToast({ summary, onClose }: UploadInsightsToastProps) {
  useEffect(() => {
    const timeout = window.setTimeout(() => {
      onClose();
    }, 5000);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [onClose]);

  return (
    <aside className="upload-insights-toast glass" role="status" aria-live="polite">
      <div className="upload-insights-toast__eyebrow">Import complete</div>
      <div className="upload-insights-toast__title-row">
        <div>
          <h4>Your statement has been imported</h4>
          <p>
            {summary.rowsImported} row{summary.rowsImported === 1 ? "" : "s"} from {summary.fileName} are categorized and ready to review.
          </p>
        </div>
          <button type="button" className="icon-button upload-insights-toast__close" onClick={onClose} aria-label="Close insights popup">
            ×
          </button>
        </div>

      <div className="upload-insights-toast__actions">
        <button type="button" className="button button-secondary button-small" onClick={onClose}>
          Dismiss
        </button>
      </div>
    </aside>
  );
}
