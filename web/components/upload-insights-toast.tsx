"use client";

import { useEffect } from "react";
import type { AccountType } from "@/lib/domain-types";
import { buildImportResultChecklist, formatImportResultHeadline } from "@/lib/import-result-summary";

export type UploadInsightsSummary = {
  fileName: string;
  rowsImported: number;
  accountId: string | null;
  accountName: string | null;
  institution: string | null;
  accountNumber?: string | null;
  accountType?: AccountType | null;
  balance: string | null;
  accountSummaries?: Array<{
    accountId: string;
    accountName: string | null;
    institution: string | null;
    accountNumber: string | null;
    accountType: AccountType | null;
    balance: string | null;
    rowsImported: number;
  }>;
  optimistic?: boolean;
  optimisticAccountId?: string | null;
  previewTransactions?: Array<{
    id: string;
    importFileId: string;
    sourceRowIndex?: number;
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
  const headline = formatImportResultHeadline(summary);
  const checklist = buildImportResultChecklist(summary);

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
          <p>{headline || `${summary.rowsImported} transaction${summary.rowsImported === 1 ? "" : "s"} imported`}</p>
        </div>
          <button type="button" className="icon-button upload-insights-toast__close" onClick={onClose} aria-label="Close insights popup">
            ×
          </button>
        </div>

      {checklist.length > 0 ? (
        <ul className="upload-insights-toast__list" aria-label="Import highlights">
          {checklist.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      ) : null}

      <div className="upload-insights-toast__actions">
        <button type="button" className="button button-secondary button-small" onClick={onClose}>
          Dismiss
        </button>
      </div>
    </aside>
  );
}
