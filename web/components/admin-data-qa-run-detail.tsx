"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { formatTransactionDirectionLabel } from "@/lib/transaction-directions";

type RunDetailResponse = {
  run: {
    id: string;
    workspaceId: string;
    workspaceName: string;
    importFileId: string | null;
    source: string;
    stage: string | null;
    status: string;
    parserVersion: string | null;
    score: number;
    findingCount: number;
    criticalCount: number;
    parserDurationMs: number | null;
    totalDurationMs: number | null;
    feedbackPayload: unknown;
    manualFeedback: string | null;
    manualFeedbackUpdatedAt: string | null;
    manualFeedbackAuthorId: string | null;
    fieldReviewPayload: unknown;
    fieldReviewUpdatedAt: string | null;
    fieldReviewAuthorId: string | null;
    createdAt: string;
    updatedAt: string;
    findings: Array<{
      id: string;
      code: string;
      severity: string;
      field: string | null;
      message: string;
      suggestion: string | null;
      confidence: number;
    }>;
  };
  importFile: null | {
    id: string;
    workspaceId: string;
    accountId: string | null;
    fileName: string;
    fileType: string;
    storageKey: string;
    status: string;
    parsedRowsCount: number;
    confirmedTransactionsCount: number;
    uploadedAt: string;
    createdAt: string;
    updatedAt: string;
    account: null | {
      id: string;
      name: string;
      institution: string | null;
      type: string;
      balance: string | null;
    };
  };
  statementCheckpoint: null | {
    id: string;
    statementStartDate: string | null;
    statementEndDate: string | null;
    openingBalance: string | null;
    endingBalance: string | null;
    status: string;
    mismatchReason: string | null;
    sourceMetadata: unknown;
    rowCount: number;
  };
  categories: Array<{
    id: string;
    name: string;
    type: string;
  }>;
  parsedRows: Array<Record<string, unknown>>;
  rawFilePreview: string | null;
};

type ReviewCell = { correct: boolean; feedback: string; output: string };

type TransactionReviewOutput = {
  transactionName: string;
  normalizedName: string;
  date: string;
  category: string;
  type: string;
  amount: string;
};

type TransactionReviewCell = {
  correct: boolean;
  feedback: string;
  output: TransactionReviewOutput;
};

type DeletedTransactionReview = {
  rowIndex: number;
  reason: string;
  output: TransactionReviewOutput;
};

type ReviewDraft = {
  bank: ReviewCell;
  accountNumber: ReviewCell;
  accountType: ReviewCell;
  accountBalance: ReviewCell;
  transactionCount: ReviewCell;
  transactions: TransactionReviewCell[];
  additionalTransactions: TransactionReviewCell[];
  deletedTransactions: DeletedTransactionReview[];
  manualFeedback: string;
};

const normalizeString = (value: unknown) => {
  if (value === null || value === undefined || value === "") {
    return "Unknown";
  }

  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value.toLocaleString() : "Unknown";
  }

  return String(value);
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const getMetadataText = (metadata: unknown, key: string) => {
  if (!isRecord(metadata)) {
    return "Unknown";
  }

  return normalizeString(metadata[key]);
};

const pickRowValue = (row: Record<string, unknown>, keys: string[]) => {
  for (const key of keys) {
    const value = row[key];
    if (value !== undefined && value !== null && value !== "") {
      return value;
    }
  }

  return null;
};

const renderRowValue = (row: Record<string, unknown>, keys: string[]) => normalizeString(pickRowValue(row, keys));

const renderAmount = (row: Record<string, unknown>) => renderRowValue(row, ["amount", "value", "total"]);

const transactionTypeOptions = [
  { value: "debit", label: "Debit" },
  { value: "credit", label: "Credit" },
] as const;

const createBlankTransactionOutput = (): TransactionReviewOutput => ({
  transactionName: "",
  normalizedName: "",
  date: "",
  category: "",
  type: "debit",
  amount: "",
});

const buildTransactionOutput = (row: Record<string, unknown>, reviewOutput: unknown): TransactionReviewOutput => {
  const output = isRecord(reviewOutput) ? reviewOutput : {};

  return {
    transactionName: normalizeString(
      output.transactionName ?? renderRowValue(row, ["merchantClean", "merchantRaw", "description", "name"])
    ),
    normalizedName: normalizeString(
      output.normalizedName ?? renderRowValue(row, ["merchantClean", "normalizedName", "normalizedMerchant"])
    ),
    date: normalizeString(output.date ?? formatDate(pickRowValue(row, ["date", "transactionDate", "postedDate", "statementDate"]))),
    category: normalizeString(output.category ?? renderRowValue(row, ["categoryName", "category", "normalizedCategory"])),
    type: formatTransactionDirectionLabel(output.type ?? renderRowValue(row, ["type"]), output.amount ?? renderAmount(row)),
    amount: normalizeString(output.amount ?? renderAmount(row)),
  };
};

const buildManualTransactionOutput = (reviewOutput: unknown): TransactionReviewOutput => {
  const blank = createBlankTransactionOutput();
  const output = isRecord(reviewOutput) ? reviewOutput : {};

  return {
    transactionName: normalizeString(output.transactionName ?? blank.transactionName),
    normalizedName: normalizeString(output.normalizedName ?? blank.normalizedName),
    date: normalizeString(output.date ?? blank.date),
    category: normalizeString(output.category ?? blank.category),
    type: formatTransactionDirectionLabel(output.type ?? blank.type, output.amount ?? blank.amount),
    amount: normalizeString(output.amount ?? blank.amount),
  };
};

const buildDeletedTransactionReview = (rowIndex: number, row: Record<string, unknown>, reviewRow: unknown): DeletedTransactionReview => {
  const output = buildTransactionOutput(row, isRecord(reviewRow) ? reviewRow.output : null);
  return {
    rowIndex,
    reason:
      isRecord(reviewRow) && typeof reviewRow.reason === "string" && reviewRow.reason.trim().length > 0
        ? reviewRow.reason
        : "Removed from QA review.",
    output,
  };
};

const buildSummaryOutput = (reviewValue: unknown, fallbackValue: unknown) =>
  normalizeString(reviewValue ?? fallbackValue);

const formatDate = (value: unknown) => {
  if (!value) {
    return "Unknown";
  }

  if (value instanceof Date) {
    return new Intl.DateTimeFormat("en-PH", { dateStyle: "medium" }).format(value);
  }

  const text = String(value);
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime())
    ? text
    : new Intl.DateTimeFormat("en-PH", { dateStyle: "medium" }).format(parsed);
};

const buildReviewDraft = (payload: unknown, parsedRows: Array<Record<string, unknown>>, data: RunDetailResponse): ReviewDraft => {
  const review = isRecord(payload) ? payload : {};
  const transactionsPayload = Array.isArray(review.transactions) ? review.transactions : [];
  const additionalTransactionsPayload = Array.isArray(review.additionalTransactions) ? review.additionalTransactions : [];
  const deletedTransactionsPayload = Array.isArray(review.deletedTransactions) ? review.deletedTransactions : [];
  const accountFromSource = data.statementCheckpoint?.sourceMetadata;
  const accountBalance = data.statementCheckpoint?.endingBalance ?? data.importFile?.account?.balance ?? null;
  const deletedRowIndices = new Set(
    deletedTransactionsPayload
      .map((entry) => (isRecord(entry) && typeof entry.rowIndex === "number" ? entry.rowIndex : null))
      .filter((value): value is number => value !== null)
  );
  const visibleParsedRows = parsedRows.filter((_, index) => !deletedRowIndices.has(index));

  return {
    bank: {
      correct: Boolean(review.bank && isRecord(review.bank) && review.bank.correct),
      feedback: isRecord(review.bank) && typeof review.bank.feedback === "string" ? review.bank.feedback : "",
      output:
        buildSummaryOutput(
          isRecord(review.bank) ? review.bank.output : null,
          getMetadataText(accountFromSource, "institution") !== "Unknown"
            ? getMetadataText(accountFromSource, "institution")
            : data.importFile?.account?.institution ?? data.importFile?.account?.name ?? "Unknown"
        ),
    },
    accountNumber: {
      correct: Boolean(review.accountNumber && isRecord(review.accountNumber) && review.accountNumber.correct),
      feedback: isRecord(review.accountNumber) && typeof review.accountNumber.feedback === "string" ? review.accountNumber.feedback : "",
      output: buildSummaryOutput(isRecord(review.accountNumber) ? review.accountNumber.output : null, getMetadataText(accountFromSource, "accountNumber")),
    },
    accountType: {
      correct: Boolean(review.accountType && isRecord(review.accountType) && review.accountType.correct),
      feedback: isRecord(review.accountType) && typeof review.accountType.feedback === "string" ? review.accountType.feedback : "",
      output: buildSummaryOutput(
        isRecord(review.accountType) ? review.accountType.output : null,
        getMetadataText(accountFromSource, "accountType") !== "Unknown"
          ? getMetadataText(accountFromSource, "accountType")
          : data.importFile?.account?.type ?? "Unknown"
      ),
    },
    accountBalance: {
      correct: Boolean(review.accountBalance && isRecord(review.accountBalance) && review.accountBalance.correct),
      feedback: isRecord(review.accountBalance) && typeof review.accountBalance.feedback === "string" ? review.accountBalance.feedback : "",
      output: buildSummaryOutput(isRecord(review.accountBalance) ? review.accountBalance.output : null, normalizeString(accountBalance)),
    },
    transactionCount: {
      correct: Boolean(review.transactionCount && isRecord(review.transactionCount) && review.transactionCount.correct),
      feedback: isRecord(review.transactionCount) && typeof review.transactionCount.feedback === "string" ? review.transactionCount.feedback : "",
      output: buildSummaryOutput(
        isRecord(review.transactionCount) ? review.transactionCount.output : null,
        `${visibleParsedRows.length.toLocaleString()} transaction${visibleParsedRows.length === 1 ? "" : "s"}`
      ),
    },
    transactions: visibleParsedRows.map((row, visibleIndex) => {
      const entry = transactionsPayload[visibleIndex];
      return {
        correct: Boolean(entry && isRecord(entry) && entry.correct),
        feedback: entry && isRecord(entry) && typeof entry.feedback === "string" ? entry.feedback : "",
        output: buildTransactionOutput(row, isRecord(entry) ? entry.output : null),
      };
    }),
    additionalTransactions: additionalTransactionsPayload.map((entry) => ({
      correct: Boolean(entry && isRecord(entry) && entry.correct),
      feedback: entry && isRecord(entry) && typeof entry.feedback === "string" ? entry.feedback : "",
      output: buildManualTransactionOutput(isRecord(entry) ? entry.output : null),
    })),
    deletedTransactions: deletedTransactionsPayload
      .map((entry) => {
        if (!isRecord(entry) || typeof entry.rowIndex !== "number") {
          return null;
        }

        return buildDeletedTransactionReview(entry.rowIndex, parsedRows[entry.rowIndex] ?? {}, entry);
      })
      .filter((entry): entry is DeletedTransactionReview => Boolean(entry)),
    manualFeedback: typeof review.manualFeedback === "string" ? review.manualFeedback : "",
  };
};

const buildFieldReviewPayload = (draft: ReviewDraft, parsedRows: Array<Record<string, unknown>>, data: RunDetailResponse) => {
  const accountFromSource = data.statementCheckpoint?.sourceMetadata;
  const accountBalance = data.statementCheckpoint?.endingBalance ?? data.importFile?.account?.balance ?? null;
  const deletedRowIndices = new Set(draft.deletedTransactions.map((entry) => entry.rowIndex));
  const visibleParsedRows = parsedRows.filter((_, index) => !deletedRowIndices.has(index));

  return {
    bank: {
      ...draft.bank,
      output:
        draft.bank.output ||
        (getMetadataText(accountFromSource, "institution") !== "Unknown"
          ? getMetadataText(accountFromSource, "institution")
          : data.importFile?.account?.institution ?? data.importFile?.account?.name ?? "Unknown"),
    },
    accountNumber: {
      ...draft.accountNumber,
      output: draft.accountNumber.output || getMetadataText(accountFromSource, "accountNumber"),
    },
    accountType: {
      ...draft.accountType,
      output:
        draft.accountType.output ||
        (getMetadataText(accountFromSource, "accountType") !== "Unknown"
          ? getMetadataText(accountFromSource, "accountType")
          : data.importFile?.account?.type ?? "Unknown"),
    },
    accountBalance: {
      ...draft.accountBalance,
      output: draft.accountBalance.output || normalizeString(accountBalance),
    },
    transactionCount: {
      ...draft.transactionCount,
      output: draft.transactionCount.output || `${visibleParsedRows.length.toLocaleString()} transaction${visibleParsedRows.length === 1 ? "" : "s"}`,
    },
    additionalTransactions: draft.additionalTransactions.map((entry) => ({
      ...entry,
      output: {
        transactionName: entry.output.transactionName,
        normalizedName: entry.output.normalizedName,
        date: entry.output.date,
        category: entry.output.category,
        type: formatTransactionDirectionLabel(entry.output.type || "debit", entry.output.amount),
        amount: entry.output.amount,
      },
    })),
    deletedTransactions: draft.deletedTransactions.map((entry) => ({
      rowIndex: entry.rowIndex,
      reason: entry.reason,
      output: {
        transactionName: entry.output.transactionName,
        normalizedName: entry.output.normalizedName,
        date: entry.output.date,
        category: entry.output.category,
        type: formatTransactionDirectionLabel(entry.output.type || "debit", entry.output.amount),
        amount: entry.output.amount,
      },
    })),
    transactions: visibleParsedRows.map((row, index) => ({
      ...draft.transactions[index],
      output: {
        transactionName: draft.transactions[index]?.output.transactionName || renderRowValue(row, ["merchantClean", "merchantRaw", "description", "name"]),
        normalizedName: draft.transactions[index]?.output.normalizedName || renderRowValue(row, ["merchantClean", "normalizedName", "normalizedMerchant"]),
        date: draft.transactions[index]?.output.date || formatDate(pickRowValue(row, ["date", "transactionDate", "postedDate", "statementDate"])),
        category: draft.transactions[index]?.output.category || renderRowValue(row, ["categoryName", "category", "normalizedCategory"]),
        type: formatTransactionDirectionLabel(
          draft.transactions[index]?.output.type || renderRowValue(row, ["type"]),
          draft.transactions[index]?.output.amount || renderAmount(row)
        ),
        amount: draft.transactions[index]?.output.amount || renderAmount(row),
      },
    })),
    manualFeedback: draft.manualFeedback,
  };
};

function severityTone(severity: string) {
  if (severity === "critical") {
    return "admin-users__pill--warn";
  }

  if (severity === "warning") {
    return "admin-users__pill--sync";
  }

  return "admin-users__pill--success";
}

export function AdminDataQaRunDetail({ runId }: { runId: string }) {
  const router = useRouter();
  const [data, setData] = useState<RunDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const [autoReparseStatus, setAutoReparseStatus] = useState<string | null>(null);
  const [draft, setDraft] = useState<ReviewDraft | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skipNextSaveRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch(`/api/admin/data-qa/${runId}`, {
          cache: "no-store",
        });

        if (!response.ok) {
          const payload = await response.json().catch(() => ({}));
          throw new Error(payload.error || "Unable to load run details.");
        }

        const payload = (await response.json()) as RunDetailResponse;

        if (!cancelled) {
          setData(payload);
          skipNextSaveRef.current = true;
          setDraft(buildReviewDraft(payload.run.fieldReviewPayload, payload.parsedRows, payload));
          setSaveStatus(null);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Unable to load run details.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
    };
  }, [runId]);

  useEffect(() => {
    if (!draft || !data) {
      return;
    }

    if (skipNextSaveRef.current) {
      skipNextSaveRef.current = false;
      return;
    }

    setSaveStatus("Saving...");
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }

    saveTimerRef.current = setTimeout(() => {
      void (async () => {
        try {
          const response = await fetch(`/api/admin/data-qa/${runId}`, {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              fieldReviewPayload: buildFieldReviewPayload(draft, data.parsedRows, data),
              manualFeedback: draft.manualFeedback,
            }),
          });

          if (!response.ok) {
            const payload = await response.json().catch(() => ({}));
            throw new Error(payload.error || "Unable to save feedback.");
          }

          setSaveStatus("Saved.");
        } catch (saveError) {
          setSaveStatus(saveError instanceof Error ? saveError.message : "Unable to save feedback.");
        }
      })();
    }, 700);

    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
    };
  }, [data, draft, runId]);

  const summaryRows = useMemo(() => {
    if (!data) {
      return [];
    }

    const accountNumber = getMetadataText(data.statementCheckpoint?.sourceMetadata, "accountNumber");
    const accountType = getMetadataText(data.statementCheckpoint?.sourceMetadata, "accountType");
    const bank = getMetadataText(data.statementCheckpoint?.sourceMetadata, "institution");
    const balance = data.statementCheckpoint?.endingBalance ?? data.importFile?.account?.balance ?? "Unknown";

    return [
      {
        key: "bank",
        field: "Bank",
        output: bank !== "Unknown" ? bank : data.importFile?.account?.institution ?? data.importFile?.account?.name ?? "Unknown",
      },
      { key: "accountNumber", field: "Account Number", output: accountNumber },
      {
        key: "accountType",
        field: "Account Type",
        output: accountType !== "Unknown" ? accountType : data.importFile?.account?.type ?? "Unknown",
      },
      { key: "accountBalance", field: "Account Balance", output: normalizeString(balance) },
      {
        key: "transactionCount",
        field: "Number of Transactions",
        output: `${data.parsedRows.length.toLocaleString()} transaction${data.parsedRows.length === 1 ? "" : "s"}`,
      },
    ];
  }, [data]);

  const deletedTransactionIndices = useMemo(
    () => new Set(draft?.deletedTransactions.map((entry) => entry.rowIndex) ?? []),
    [draft]
  );

  const transactionRows = useMemo(() => {
    if (!data) {
      return [];
    }

    return data.parsedRows
      .map((row, index) =>
        deletedTransactionIndices.has(index)
          ? null
          : {
              key: `${index}`,
              sourceIndex: index,
              field: `Transaction ${index + 1}`,
              output: {
                transactionName: renderRowValue(row, ["merchantClean", "merchantRaw", "description", "name"]),
                normalizedName: renderRowValue(row, ["merchantClean", "normalizedName", "normalizedMerchant"]),
                date: formatDate(pickRowValue(row, ["date", "transactionDate", "postedDate", "statementDate"])),
                category: renderRowValue(row, ["categoryName", "category", "normalizedCategory"]),
                type: formatTransactionDirectionLabel(renderRowValue(row, ["type"]), renderAmount(row)) as string,
                amount: renderAmount(row),
              },
            }
      )
      .filter((row) => row !== null) as Array<{ key: string; sourceIndex: number; field: string; output: TransactionReviewOutput }>;
  }, [data, deletedTransactionIndices]);

  const additionalTransactionRows = draft?.additionalTransactions ?? [];

  const categoryOptions = useMemo(() => {
    if (!data) {
      return [];
    }

    const seen = new Map<string, { id: string; name: string; type: string }>();
    for (const category of data.categories) {
      const key = category.name.trim().toLowerCase();
      if (!seen.has(key)) {
        seen.set(key, category);
      }
    }

    return Array.from(seen.values()).sort((left, right) => left.name.localeCompare(right.name));
  }, [data]);

  const fileViewerUrl = data ? `/api/admin/data-qa/${data.run.id}/file` : null;

  const deleteTransactionRow = (visibleIndex: number, sourceIndex: number) => {
    setDraft((current) => {
      if (!current || !data) {
        return current;
      }

      if (current.deletedTransactions.some((entry) => entry.rowIndex === sourceIndex)) {
        return current;
      }

      const removedRow = data.parsedRows[sourceIndex] ?? {};
      const existingReview = current.transactions[visibleIndex];
      const deletedTransactions = [
        ...current.deletedTransactions,
        {
          rowIndex: sourceIndex,
          reason: "Removed from QA review.",
          output: existingReview?.output ?? buildTransactionOutput(removedRow, null),
        },
      ].sort((left, right) => left.rowIndex - right.rowIndex);

      return {
        ...current,
        transactions: current.transactions.filter((_, entryIndex) => entryIndex !== visibleIndex),
        deletedTransactions,
      };
    });
  };

  const restoreDeletedTransactionRow = (sourceIndex: number) => {
    setDraft((current) => {
      if (!current || !data) {
        return current;
      }

      const deletedEntry = current.deletedTransactions.find((entry) => entry.rowIndex === sourceIndex);
      if (!deletedEntry) {
        return current;
      }

      const nextDeletedTransactions = current.deletedTransactions.filter((entry) => entry.rowIndex !== sourceIndex);
      const insertionIndex = data.parsedRows.slice(0, sourceIndex).filter((_, index) => !nextDeletedTransactions.some((entry) => entry.rowIndex === index)).length;
      const restoredCell = {
        correct: false,
        feedback: deletedEntry.reason,
        output: buildTransactionOutput(data.parsedRows[sourceIndex] ?? {}, deletedEntry.output),
      };

      return {
        ...current,
        deletedTransactions: nextDeletedTransactions,
        transactions: [
          ...current.transactions.slice(0, insertionIndex),
          restoredCell,
          ...current.transactions.slice(insertionIndex),
        ],
      };
    });
  };

  const reparseWithFeedback = async () => {
    if (!data || !draft) {
      return;
    }

    setSaveStatus("Reparsing...");
    setAutoReparseStatus(null);

    try {
      const response = await fetch(`/api/admin/data-qa/${runId}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          reparse: true,
          manualFeedback: draft.manualFeedback,
          fieldReviewPayload: buildFieldReviewPayload(draft, data.parsedRows, data),
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || "Unable to reparse file.");
      }

      const payload = (await response.json()) as {
        runId?: string;
        autoReparseAttempts?: number;
        autoReparseTarget?: number;
        autoReparseMaxAttempts?: number;
        finalScore?: number | null;
      };
      const nextRunId = payload.runId ?? runId;
      const autoAttempts = payload.autoReparseAttempts ?? 0;
      const autoTarget = payload.autoReparseTarget ?? 95;
      const autoMaxAttempts = payload.autoReparseMaxAttempts ?? 6;
      const finalScore = payload.finalScore ?? null;
      setSaveStatus("Reparsed.");
      setAutoReparseStatus(
        `Auto-rerun ${autoAttempts}/${autoMaxAttempts} complete. Target ${autoTarget}. Final score ${
          finalScore === null ? "unknown" : finalScore
        }.`
      );

      if (nextRunId && nextRunId !== runId) {
        router.replace(`/admin/data-qa/${nextRunId}`);
      } else {
        router.refresh();
      }
    } catch (reparseError) {
      setSaveStatus(reparseError instanceof Error ? reparseError.message : "Unable to reparse file.");
      setAutoReparseStatus(null);
    }
  };

  if (loading) {
    return <div className="admin-users__loading">Loading run details...</div>;
  }

  if (error || !data) {
    return <div className="admin-users__notice admin-users__notice--error">{error || "Run not found."}</div>;
  }

  return (
    <section className="admin-data-qa-run-page">
      <div className="admin-users__hero table-panel">
        <div className="admin-users__hero-copy">
          <p className="section-kicker">Imported statement QA</p>
          <h2>{data.importFile?.fileName ?? "Imported statement"}</h2>
          <p className="panel-muted">
            Review the parsed statement against the uploaded file. Use the narrow tables below to mark each granular
            field correct or leave notes inline.
          </p>
          <div className="admin-data-qa-run-page__actions">
            <Link className="button button-secondary button-small" href="/admin/data-qa">
              Back to QA list
            </Link>
            {fileViewerUrl ? (
              <a className="button button-secondary button-small" href={fileViewerUrl} target="_blank" rel="noreferrer">
                Open file in new tab
              </a>
            ) : null}
          </div>
          {autoReparseStatus ? <p className="panel-muted admin-data-qa-run-page__status">{autoReparseStatus}</p> : null}
        </div>
        <div className="admin-users__stats">
          <div className="admin-users__stat">
            <strong>Score {data.run.score}</strong>
            <span>QA score</span>
          </div>
          <div className="admin-users__stat">
            <strong>{data.run.findingCount}</strong>
            <span>Findings</span>
          </div>
          <div className="admin-users__stat">
            <strong>{data.run.criticalCount}</strong>
            <span>Critical findings</span>
          </div>
          <div className="admin-users__stat">
            <strong>{data.parsedRows.length}</strong>
            <span>Transactions</span>
          </div>
          <div className="admin-users__stat">
            <strong>{data.run.parserVersion ?? "Unknown"}</strong>
            <span>Parser version</span>
          </div>
          <div className="admin-users__stat">
            <strong>{saveStatus ?? "Ready"}</strong>
            <span>Feedback status</span>
          </div>
        </div>
      </div>

      <section className="table-panel admin-data-qa-run-page__table-panel">
        <div className="admin-users__table-head">
          <div>
            <p className="section-kicker">Feedback to Codex</p>
            <h3>Save corrections and rerun the same file</h3>
          </div>
          <button className="button button-primary button-small" type="button" onClick={() => void reparseWithFeedback()}>
            Reparse with feedback
          </button>
        </div>
        <p className="panel-muted">
          Write notes here, correct any parsed fields below, then click reparse. Clover will learn from the saved
          feedback and run the same file again. You can repeat this as many times as you want.
        </p>
        <textarea
          className="admin-data-qa-run-page__codex-feedback"
          value={draft?.manualFeedback ?? ""}
          placeholder="Tell Codex what should change in the next parse. Mention missing fields, wrong account details, transaction issues, or UI output problems."
          onChange={(event) => {
            const manualFeedback = event.target.value;
            setDraft((current) => (current ? { ...current, manualFeedback } : current));
          }}
        />
      </section>

      <div className="admin-data-qa-run-page__layout">
        <div className="admin-data-qa-run-page__main">
          <section className="table-panel admin-data-qa-run-page__notice">
            <p className="section-kicker">QA focus</p>
            <h3>Use only real Statement of Accounts from Philippine banks</h3>
            <p className="panel-muted">
              Prefer legitimate statements from popular Philippine banks and financial apps. Do not invent statements
              or synthetic examples. The goal is to teach the Data Engine how real bank statements actually look.
            </p>
          </section>

          <section className="table-panel admin-data-qa-run-page__table-panel">
            <div className="admin-users__table-head">
              <div>
                <p className="section-kicker">Statement fields</p>
                <h3>Bank-level review</h3>
              </div>
              <p className="panel-muted">Checkboxes and notes autosave as you type.</p>
            </div>

            <div className="admin-data-qa-run-page__thin-table-wrap">
              <table className="admin-data-qa-run-page__thin-table">
                <thead>
                  <tr>
                    <th>Field</th>
                    <th>Output</th>
                    <th>Feedback</th>
                  </tr>
                </thead>
                <tbody>
                  {summaryRows.map((row) => {
                    const review = draft?.[row.key as keyof Omit<ReviewDraft, "transactions" | "manualFeedback">] as ReviewCell;

                    return (
                      <tr key={row.key}>
                        <td>{row.field}</td>
                        <td>
                          <input
                            className="admin-data-qa-run-page__field-input"
                            type="text"
                            value={review?.output ?? row.output}
                            onChange={(event) => {
                              const output = event.target.value;
                              setDraft((current) =>
                                current
                                  ? {
                                      ...current,
                                      [row.key]: {
                                        ...(current[row.key as keyof Omit<ReviewDraft, "transactions" | "manualFeedback">] as ReviewCell),
                                        output,
                                      },
                                    }
                                  : current
                              );
                            }}
                          />
                        </td>
                        <td>
                          <div className="admin-data-qa-run-page__feedback-cell">
                            <label className="admin-data-qa-run-page__feedback-check">
                              <input
                                type="checkbox"
                                checked={review?.correct ?? false}
                                onChange={(event) => {
                                  const checked = event.target.checked;
                                  setDraft((current) =>
                                    current
                                      ? {
                                          ...current,
                                          [row.key]: {
                                            ...(current[row.key as keyof Omit<ReviewDraft, "transactions" | "manualFeedback">] as ReviewCell),
                                            correct: checked,
                                          },
                                        }
                                      : current
                                  );
                                }}
                              />
                              Correct
                            </label>
                            <textarea
                              className="admin-data-qa-run-page__feedback-input"
                              rows={2}
                              value={review?.feedback ?? ""}
                              placeholder="Write feedback"
                              onChange={(event) => {
                                const feedback = event.target.value;
                                setDraft((current) =>
                                  current
                                    ? {
                                        ...current,
                                        [row.key]: {
                                          ...(current[row.key as keyof Omit<ReviewDraft, "transactions" | "manualFeedback">] as ReviewCell),
                                          feedback,
                                        },
                                      }
                                    : current
                                );
                              }}
                            />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          <section className="table-panel admin-data-qa-run-page__table-panel">
            <div className="admin-users__table-head">
              <div>
                <p className="section-kicker">Transaction rows</p>
                <h3>Comprehensive transaction list</h3>
              </div>
              <p className="panel-muted">
                {transactionRows.length.toLocaleString()} visible row{transactionRows.length === 1 ? "" : "s"}
                {deletedTransactionIndices.size > 0 ? ` · ${deletedTransactionIndices.size} deleted` : ""}
              </p>
            </div>

            <div className="admin-data-qa-run-page__thin-table-wrap">
              <table className="admin-data-qa-run-page__thin-table admin-data-qa-run-page__thin-table--transactions">
                <thead>
                  <tr>
                    <th>Field</th>
                    <th>Output</th>
                    <th>Feedback</th>
                  </tr>
                </thead>
                <tbody>
                  {transactionRows.map((row, index) => {
                    const review = draft?.transactions[index];
                    const output = review?.output ?? row.output;
                    const categoryName = output.category.trim();
                    const hasMatchingCategory = categoryOptions.some(
                      (category) => category.name.trim().toLowerCase() === categoryName.toLowerCase()
                    );
                    const categoryOptionsForRow = categoryName
                      ? [
                          ...(!hasMatchingCategory ? [{ id: `custom-${index}`, name: categoryName, type: output.type }] : []),
                          ...categoryOptions,
                        ]
                      : categoryOptions;

                    return (
                      <tr key={row.key}>
                        <td>
                          <div className="admin-data-qa-run-page__row-label">
                            <span>{row.field}</span>
                            <button
                              className="button button-ghost button-small"
                              type="button"
                              onClick={() => deleteTransactionRow(index, row.sourceIndex)}
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                        <td>
                          <div className="admin-data-qa-run-page__transaction-output">
                            <label className="admin-data-qa-run-page__output-field">
                              <span>Transaction Name</span>
                              <input
                                className="admin-data-qa-run-page__field-input admin-data-qa-run-page__field-input--compact"
                                type="text"
                                value={output.transactionName}
                                onChange={(event) => {
                                  const transactionName = event.target.value;
                                  setDraft((current) =>
                                    current
                                      ? {
                                          ...current,
                                          transactions: current.transactions.map((entry, entryIndex) =>
                                            entryIndex === index
                                              ? { ...entry, output: { ...entry.output, transactionName } }
                                              : entry
                                          ),
                                        }
                                      : current
                                  );
                                }}
                              />
                            </label>
                            <label className="admin-data-qa-run-page__output-field">
                              <span>Normalized Name</span>
                              <input
                                className="admin-data-qa-run-page__field-input admin-data-qa-run-page__field-input--compact"
                                type="text"
                                value={output.normalizedName}
                                onChange={(event) => {
                                  const normalizedName = event.target.value;
                                  setDraft((current) =>
                                    current
                                      ? {
                                          ...current,
                                          transactions: current.transactions.map((entry, entryIndex) =>
                                            entryIndex === index
                                              ? { ...entry, output: { ...entry.output, normalizedName } }
                                              : entry
                                          ),
                                        }
                                      : current
                                  );
                                }}
                              />
                            </label>
                            <label className="admin-data-qa-run-page__output-field">
                              <span>Date</span>
                              <input
                                className="admin-data-qa-run-page__field-input admin-data-qa-run-page__field-input--compact"
                                type="text"
                                value={output.date}
                                onChange={(event) => {
                                  const date = event.target.value;
                                  setDraft((current) =>
                                    current
                                      ? {
                                          ...current,
                                          transactions: current.transactions.map((entry, entryIndex) =>
                                            entryIndex === index ? { ...entry, output: { ...entry.output, date } } : entry
                                          ),
                                        }
                                      : current
                                  );
                                }}
                              />
                            </label>
                            <label className="admin-data-qa-run-page__output-field">
                              <span>Category</span>
                              <select
                                className="admin-data-qa-run-page__field-input admin-data-qa-run-page__field-input--compact"
                                value={categoryName}
                                onChange={(event) => {
                                  const category = event.target.value;
                                  setDraft((current) =>
                                    current
                                      ? {
                                          ...current,
                                          transactions: current.transactions.map((entry, entryIndex) =>
                                            entryIndex === index ? { ...entry, output: { ...entry.output, category } } : entry
                                          ),
                                        }
                                      : current
                                  );
                                }}
                              >
                                {categoryOptionsForRow.map((category) => (
                                  <option key={category.id} value={category.name}>
                                    {category.name}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <label className="admin-data-qa-run-page__output-field">
                              <span>Type</span>
                              <select
                                className="admin-data-qa-run-page__field-input admin-data-qa-run-page__field-input--compact"
                                value={output.type}
                                onChange={(event) => {
                                  const type = event.target.value;
                                  setDraft((current) =>
                                    current
                                      ? {
                                          ...current,
                                          transactions: current.transactions.map((entry, entryIndex) =>
                                            entryIndex === index ? { ...entry, output: { ...entry.output, type } } : entry
                                          ),
                                        }
                                      : current
                                  );
                                }}
                              >
                                {transactionTypeOptions.map((option) => (
                                  <option key={option.value} value={option.value}>
                                    {option.label}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <label className="admin-data-qa-run-page__output-field">
                              <span>Amount</span>
                              <input
                                className="admin-data-qa-run-page__field-input admin-data-qa-run-page__field-input--compact"
                                type="text"
                                value={output.amount}
                                onChange={(event) => {
                                  const amount = event.target.value;
                                  setDraft((current) =>
                                    current
                                      ? {
                                          ...current,
                                          transactions: current.transactions.map((entry, entryIndex) =>
                                            entryIndex === index ? { ...entry, output: { ...entry.output, amount } } : entry
                                          ),
                                        }
                                      : current
                                  );
                                }}
                              />
                            </label>
                          </div>
                        </td>
                        <td>
                          <div className="admin-data-qa-run-page__feedback-cell">
                            <label className="admin-data-qa-run-page__feedback-check">
                              <input
                                type="checkbox"
                                checked={review?.correct ?? false}
                                onChange={(event) => {
                                  const checked = event.target.checked;
                                  setDraft((current) =>
                                    current
                                      ? {
                                          ...current,
                                          transactions: current.transactions.map((entry, entryIndex) =>
                                            entryIndex === index ? { ...entry, correct: checked } : entry
                                          ),
                                        }
                                      : current
                                  );
                                }}
                              />
                              Correct
                            </label>
                            <textarea
                              className="admin-data-qa-run-page__feedback-input"
                              rows={2}
                              value={review?.feedback ?? ""}
                              placeholder="Write feedback"
                              onChange={(event) => {
                                const feedback = event.target.value;
                                setDraft((current) =>
                                  current
                                    ? {
                                        ...current,
                                        transactions: current.transactions.map((entry, entryIndex) =>
                                          entryIndex === index ? { ...entry, feedback } : entry
                                        ),
                                      }
                                    : current
                                );
                              }}
                            />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          {draft?.deletedTransactions.length ? (
            <section className="table-panel admin-data-qa-run-page__table-panel">
              <div className="admin-users__table-head">
                <div>
                  <p className="section-kicker">Deleted transactions</p>
                  <h3>Removed from the visible table</h3>
                </div>
                <p className="panel-muted">{draft.deletedTransactions.length.toLocaleString()} deleted row{draft.deletedTransactions.length === 1 ? "" : "s"}</p>
              </div>
              <div className="admin-data-qa-run-page__deleted-list">
                {draft.deletedTransactions.map((entry) => (
                  <div className="admin-data-qa-run-page__deleted-item" key={entry.rowIndex}>
                    <div>
                      <strong>{entry.output.transactionName || `Transaction ${entry.rowIndex + 1}`}</strong>
                      <p>
                        {entry.output.date} · {entry.output.amount} · {entry.output.type}
                      </p>
                      <small>{entry.reason}</small>
                    </div>
                    <button
                      className="button button-secondary button-small"
                      type="button"
                      onClick={() => restoreDeletedTransactionRow(entry.rowIndex)}
                    >
                      Restore
                    </button>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          <section className="table-panel admin-data-qa-run-page__table-panel">
            <div className="admin-users__table-head">
              <div>
                <p className="section-kicker">Missing transactions</p>
                <h3>Add rows the parser missed</h3>
              </div>
              <button
                className="button button-secondary button-small"
                type="button"
                onClick={() =>
                  setDraft((current) =>
                    current
                      ? {
                          ...current,
                          additionalTransactions: [
                            ...current.additionalTransactions,
                            {
                              correct: true,
                              feedback: "",
                              output: createBlankTransactionOutput(),
                            },
                          ],
                        }
                      : current
                  )
                }
              >
                Add missing transaction
              </button>
            </div>

            <p className="panel-muted">
              Use this when you see a transaction in the file that Clover did not extract. The row will be saved into
              QA and can train the engine as a confirmed missing transaction.
            </p>

            <div className="admin-data-qa-run-page__thin-table-wrap">
              <table className="admin-data-qa-run-page__thin-table admin-data-qa-run-page__thin-table--transactions">
                <thead>
                  <tr>
                    <th>Field</th>
                    <th>Output</th>
                    <th>Feedback</th>
                  </tr>
                </thead>
                <tbody>
                  {additionalTransactionRows.length > 0 ? (
                    additionalTransactionRows.map((row, index) => {
                      const output = row.output;
                      const categoryName = output.category.trim();
                      const hasMatchingCategory = categoryOptions.some(
                        (category) => category.name.trim().toLowerCase() === categoryName.toLowerCase()
                      );
                      const categoryOptionsForRow = categoryName
                        ? [
                            ...(!hasMatchingCategory ? [{ id: `manual-custom-${index}`, name: categoryName, type: output.type }] : []),
                            ...categoryOptions,
                          ]
                        : categoryOptions;

                      return (
                        <tr key={`manual-${index}`}>
                          <td>
                            <div className="admin-data-qa-run-page__manual-row-head">
                              <strong>Manual transaction {index + 1}</strong>
                              <button
                                className="button button-ghost button-small"
                                type="button"
                                onClick={() =>
                                  setDraft((current) =>
                                    current
                                      ? {
                                          ...current,
                                          additionalTransactions: current.additionalTransactions.filter((_, entryIndex) => entryIndex !== index),
                                        }
                                      : current
                                  )
                                }
                              >
                                Remove
                              </button>
                            </div>
                          </td>
                          <td>
                            <div className="admin-data-qa-run-page__transaction-output">
                              <label className="admin-data-qa-run-page__output-field">
                                <span>Transaction Name</span>
                                <input
                                  className="admin-data-qa-run-page__field-input admin-data-qa-run-page__field-input--compact"
                                  type="text"
                                  value={output.transactionName}
                                  onChange={(event) => {
                                    const transactionName = event.target.value;
                                    setDraft((current) =>
                                      current
                                        ? {
                                            ...current,
                                            additionalTransactions: current.additionalTransactions.map((entry, entryIndex) =>
                                              entryIndex === index
                                                ? { ...entry, output: { ...entry.output, transactionName } }
                                                : entry
                                            ),
                                          }
                                        : current
                                    );
                                  }}
                                />
                              </label>
                              <label className="admin-data-qa-run-page__output-field">
                                <span>Normalized Name</span>
                                <input
                                  className="admin-data-qa-run-page__field-input admin-data-qa-run-page__field-input--compact"
                                  type="text"
                                  value={output.normalizedName}
                                  onChange={(event) => {
                                    const normalizedName = event.target.value;
                                    setDraft((current) =>
                                      current
                                        ? {
                                            ...current,
                                            additionalTransactions: current.additionalTransactions.map((entry, entryIndex) =>
                                              entryIndex === index
                                                ? { ...entry, output: { ...entry.output, normalizedName } }
                                                : entry
                                            ),
                                          }
                                        : current
                                    );
                                  }}
                                />
                              </label>
                              <label className="admin-data-qa-run-page__output-field">
                                <span>Date</span>
                                <input
                                  className="admin-data-qa-run-page__field-input admin-data-qa-run-page__field-input--compact"
                                  type="text"
                                  value={output.date}
                                  onChange={(event) => {
                                    const date = event.target.value;
                                    setDraft((current) =>
                                      current
                                        ? {
                                            ...current,
                                            additionalTransactions: current.additionalTransactions.map((entry, entryIndex) =>
                                              entryIndex === index ? { ...entry, output: { ...entry.output, date } } : entry
                                            ),
                                          }
                                        : current
                                    );
                                  }}
                                />
                              </label>
                              <label className="admin-data-qa-run-page__output-field">
                                <span>Category</span>
                                <select
                                  className="admin-data-qa-run-page__field-input admin-data-qa-run-page__field-input--compact"
                                  value={categoryName}
                                  onChange={(event) => {
                                    const category = event.target.value;
                                    setDraft((current) =>
                                      current
                                        ? {
                                            ...current,
                                            additionalTransactions: current.additionalTransactions.map((entry, entryIndex) =>
                                              entryIndex === index ? { ...entry, output: { ...entry.output, category } } : entry
                                            ),
                                          }
                                        : current
                                    );
                                  }}
                                >
                                  {categoryOptionsForRow.map((category) => (
                                    <option key={category.id} value={category.name}>
                                      {category.name}
                                    </option>
                                  ))}
                                </select>
                              </label>
                              <label className="admin-data-qa-run-page__output-field">
                                <span>Type</span>
                                <select
                                  className="admin-data-qa-run-page__field-input admin-data-qa-run-page__field-input--compact"
                                  value={output.type}
                                  onChange={(event) => {
                                    const type = event.target.value;
                                    setDraft((current) =>
                                      current
                                        ? {
                                            ...current,
                                            additionalTransactions: current.additionalTransactions.map((entry, entryIndex) =>
                                              entryIndex === index ? { ...entry, output: { ...entry.output, type } } : entry
                                            ),
                                          }
                                        : current
                                    );
                                  }}
                                >
                                  {transactionTypeOptions.map((option) => (
                                    <option key={option.value} value={option.value}>
                                      {option.label}
                                    </option>
                                  ))}
                                </select>
                              </label>
                              <label className="admin-data-qa-run-page__output-field">
                                <span>Amount</span>
                                <input
                                  className="admin-data-qa-run-page__field-input admin-data-qa-run-page__field-input--compact"
                                  type="text"
                                  value={output.amount}
                                  onChange={(event) => {
                                    const amount = event.target.value;
                                    setDraft((current) =>
                                      current
                                        ? {
                                            ...current,
                                            additionalTransactions: current.additionalTransactions.map((entry, entryIndex) =>
                                              entryIndex === index ? { ...entry, output: { ...entry.output, amount } } : entry
                                            ),
                                          }
                                        : current
                                    );
                                  }}
                                />
                              </label>
                            </div>
                          </td>
                          <td>
                            <div className="admin-data-qa-run-page__feedback-cell">
                              <label className="admin-data-qa-run-page__feedback-check">
                                <input
                                  type="checkbox"
                                  checked={row.correct}
                                  onChange={(event) => {
                                    const checked = event.target.checked;
                                    setDraft((current) =>
                                      current
                                        ? {
                                            ...current,
                                            additionalTransactions: current.additionalTransactions.map((entry, entryIndex) =>
                                              entryIndex === index ? { ...entry, correct: checked } : entry
                                            ),
                                          }
                                        : current
                                    );
                                  }}
                                />
                                Confirmed
                              </label>
                              <textarea
                                className="admin-data-qa-run-page__feedback-input"
                                rows={2}
                                value={row.feedback}
                                placeholder="Write feedback"
                                onChange={(event) => {
                                  const feedback = event.target.value;
                                  setDraft((current) =>
                                    current
                                      ? {
                                          ...current,
                                          additionalTransactions: current.additionalTransactions.map((entry, entryIndex) =>
                                            entryIndex === index ? { ...entry, feedback } : entry
                                          ),
                                        }
                                      : current
                                  );
                                }}
                              />
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={3} className="admin-data-qa-run-page__empty-row">
                        No missing transactions added yet. Click the button above to add one.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className="table-panel admin-data-qa-run-page__table-panel">
            <div className="admin-users__table-head">
              <div>
                <p className="section-kicker">QA findings</p>
                <h3>Feedback and issues</h3>
              </div>
              <p className="panel-muted">{data.run.findingCount} findings</p>
            </div>
            <div className="admin-data-qa__finding-list">
              {data.run.findings.length > 0 ? (
                data.run.findings.map((finding) => (
                  <div className="admin-data-qa__finding" key={finding.id}>
                    <div className="admin-data-qa__finding-head">
                      <span className={`admin-users__pill ${severityTone(finding.severity)}`}>{finding.severity}</span>
                      <strong>{finding.code}</strong>
                      {finding.field ? <small>{finding.field}</small> : null}
                    </div>
                    <p>{finding.message}</p>
                    {finding.suggestion ? <small>Suggestion: {finding.suggestion}</small> : null}
                  </div>
                ))
              ) : (
                <div className="admin-users__detail-empty">No findings were generated for this run.</div>
              )}
            </div>
          </section>
        </div>
      </div>
    </section>
  );
}
