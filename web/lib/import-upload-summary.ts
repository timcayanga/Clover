import type { UploadInsightsSummary } from "@/components/upload-insights-toast";

export type UploadAccountSummary = NonNullable<UploadInsightsSummary["accountSummaries"]>[number];

const normalizeUploadCurrency = (value: string | null | undefined) => {
  const normalized = String(value ?? "").trim().toUpperCase();
  return /^[A-Z]{3}$/.test(normalized) ? normalized : null;
};

export const getUploadSummaryCurrencies = (summary: UploadInsightsSummary | null | undefined) => {
  if (!summary) {
    return [];
  }

  const normalizeCurrencies = (values: Array<string | null | undefined>) =>
    values
      .map(normalizeUploadCurrency)
      .filter((currency): currency is string => Boolean(currency));
  const accountCurrencies = normalizeCurrencies(
    (summary.accountSummaries ?? []).map((accountSummary) => accountSummary.currency)
  );
  const summaryCurrencies = normalizeCurrencies([summary.currency]);
  const currencies =
    accountCurrencies.length > 0
      ? accountCurrencies
      : summaryCurrencies.length > 0
        ? summaryCurrencies
        : normalizeCurrencies((summary.previewTransactions ?? []).map((transaction) => transaction.currency));

  return Array.from(new Set(currencies));
};

export const toBalanceString = (value: unknown): string | null => {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value.toFixed(2) : null;
  }

  try {
    const stringified = String(value).trim();
    return stringified ? stringified : null;
  } catch {
    return null;
  }
};

export const pickStableBalance = (...values: Array<unknown>) => {
  let firstMeaningful: string | null = null;

  for (const value of values) {
    const normalized = toBalanceString(value);
    if (!normalized) {
      continue;
    }

    if (firstMeaningful === null) {
      firstMeaningful = normalized;
    }

    const numeric = Number(normalized.replace(/[^0-9.-]/g, ""));
    if (Number.isFinite(numeric) && numeric !== 0) {
      return normalized;
    }
  }

  return firstMeaningful;
};

const getAccountSummaryIdentityKey = (summary: UploadAccountSummary) => {
  const accountId = typeof summary.accountId === "string" && summary.accountId.trim() ? summary.accountId.trim() : null;
  if (accountId) {
    return `account:${accountId}`;
  }

  const accountNumber = typeof summary.accountNumber === "string" ? summary.accountNumber.replace(/\D/g, "").slice(-4) : "";
  const accountName = typeof summary.accountName === "string" ? summary.accountName.trim().toLowerCase() : "";
  const institution = typeof summary.institution === "string" ? summary.institution.trim().toLowerCase() : "";
  const accountType = typeof summary.accountType === "string" ? summary.accountType.trim().toLowerCase() : "";

  if (accountNumber || accountName || institution) {
    return `summary:${institution}:${accountNumber}:${accountName}:${accountType}`;
  }

  return null;
};

const normalizeSummaryBalanceValue = (value: string | null | undefined) => {
  const normalized = toBalanceString(value);
  if (!normalized) {
    return null;
  }

  const numeric = Number(normalized.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(numeric) ? numeric : null;
};

const mergeAccountSummaries = (existing: UploadAccountSummary, incoming: UploadAccountSummary): UploadAccountSummary => {
  const existingBalanceValue = normalizeSummaryBalanceValue(existing.balance);
  const incomingBalanceValue = normalizeSummaryBalanceValue(incoming.balance);
  const existingIsMeaningful = existingBalanceValue !== null && existingBalanceValue !== 0;
  const incomingIsMeaningful = incomingBalanceValue !== null && incomingBalanceValue !== 0;
  const existingRows = Number(existing.rowsImported ?? 0);
  const incomingRows = Number(incoming.rowsImported ?? 0);

  const preferred =
    incomingIsMeaningful && !existingIsMeaningful
      ? incoming
      : existingIsMeaningful && !incomingIsMeaningful
        ? existing
        : incomingRows > existingRows
          ? incoming
          : existing;

  return {
    ...preferred,
    balance: pickStableBalance(existing.balance, incoming.balance),
    rowsImported: Math.max(existingRows, incomingRows),
  };
};

export const dedupeAccountSummaries = (summaries: UploadAccountSummary[]) => {
  const byKey = new Map<string, UploadAccountSummary>();
  const keyOrder: string[] = [];

  for (const summary of summaries) {
    const key = getAccountSummaryIdentityKey(summary);
    if (!key) {
      const fallbackKey = `anon:${keyOrder.length}`;
      keyOrder.push(fallbackKey);
      byKey.set(fallbackKey, summary);
      continue;
    }

    const existing = byKey.get(key);
    if (!existing) {
      keyOrder.push(key);
      byKey.set(key, summary);
      continue;
    }

    byKey.set(key, mergeAccountSummaries(existing, summary));
  }

  return keyOrder.map((key) => byKey.get(key)).filter((summary): summary is UploadAccountSummary => Boolean(summary));
};

export const normalizeServerAccountSummaries = (value: unknown): NonNullable<UploadInsightsSummary["accountSummaries"]> => {
  if (!Array.isArray(value)) {
    return [];
  }

  const summaries = value
    .map((entry) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
        return null;
      }

      const record = entry as Record<string, unknown>;
      const accountId = typeof record.accountId === "string" && record.accountId.trim() ? record.accountId.trim() : null;
      if (!accountId) {
        return null;
      }

      return {
        accountId,
        accountName: typeof record.accountName === "string" && record.accountName.trim() ? record.accountName.trim() : null,
        institution: typeof record.institution === "string" && record.institution.trim() ? record.institution.trim() : null,
        accountNumber: typeof record.accountNumber === "string" && record.accountNumber.trim() ? record.accountNumber.trim() : null,
        accountType:
          typeof record.accountType === "string" && record.accountType.trim()
            ? (record.accountType as UploadInsightsSummary["accountType"])
            : null,
        currency: typeof record.currency === "string" && record.currency.trim() ? record.currency.trim().toUpperCase() : null,
        balance: toBalanceString(record.balance),
        rowsImported: Number(record.rowsImported ?? 0) || 0,
      };
    })
    .filter((entry): entry is NonNullable<UploadInsightsSummary["accountSummaries"]>[number] => entry !== null);

  return dedupeAccountSummaries(summaries);
};

export const combineUploadInsightsSummaries = (summaries: UploadInsightsSummary[]): UploadInsightsSummary | null => {
  if (summaries.length === 0) {
    return null;
  }

  if (summaries.length === 1) {
    return summaries[0];
  }

  const first = summaries[0];
  const sameInstitution = summaries.every((summary) => summary.institution === first.institution);
  const sameAccountType = summaries.every((summary) => summary.accountType === first.accountType);
  const previewTransactions = summaries.flatMap((summary) => summary.previewTransactions ?? []);
  const rowsImported = summaries.reduce((total, summary) => total + Number(summary.rowsImported ?? 0), 0);
  const incomeTotal = summaries.reduce((total, summary) => total + Number(summary.incomeTotal ?? 0), 0);
  const expenseTotal = summaries.reduce((total, summary) => total + Number(summary.expenseTotal ?? 0), 0);
  const accountSummaries = dedupeAccountSummaries(summaries.flatMap((summary) => summary.accountSummaries ?? []));
  const sameAccountIdentity =
    accountSummaries.length === 1 ||
    (accountSummaries.length === 0 &&
      summaries.every(
        (summary) =>
          summary.accountId === first.accountId &&
          summary.accountNumber === first.accountNumber &&
          summary.accountName === first.accountName &&
          summary.accountType === first.accountType
      ));

  return {
    fileName: `${summaries.length} files`,
    rowsImported,
    accountId: null,
    accountName: sameInstitution && sameAccountIdentity ? first.accountName : null,
    institution: sameInstitution ? first.institution : null,
    accountNumber: null,
    accountType: sameAccountType ? first.accountType : null,
    balance: null,
    accountSummaries,
    optimistic: summaries.some((summary) => summary.optimistic),
    optimisticAccountId: null,
    incomeTotal,
    expenseTotal,
    netTotal: incomeTotal - expenseTotal,
    topCategoryName: null,
    topCategoryAmount: null,
    topCategoryShare: null,
    topMerchantName: null,
    topMerchantCount: null,
    previewTransactions,
  };
};
