type ImportResultPreviewTransaction = {
  categoryName?: string | null;
  merchantRaw?: string | null;
  merchantClean?: string | null;
  description?: string | null;
  type?: "income" | "expense" | "transfer" | string | null;
  amount?: string | number | null;
  currency?: string | null;
};

type ImportResultSummaryInput = {
  fileName?: string | null;
  rowsImported?: number | null;
  accountName?: string | null;
  institution?: string | null;
  accountType?: string | null;
  incomeTotal?: number | null;
  expenseTotal?: number | null;
  topCategoryName?: string | null;
  topMerchantName?: string | null;
  previewTransactions?: ImportResultPreviewTransaction[] | null;
};

const normalizeLabel = (value: unknown) => (typeof value === "string" ? value.trim() : "");

const titleCase = (value: string) =>
  value
    .replace(/[_-]+/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

const formatAccountType = (accountType: string | null | undefined) => {
  const normalized = normalizeLabel(accountType);
  if (!normalized) {
    return "";
  }

  if (/bank/i.test(normalized)) return "Bank account";
  if (/credit/i.test(normalized)) return "Credit card";
  if (/wallet/i.test(normalized)) return "Wallet";
  if (/cash/i.test(normalized)) return "Cash account";
  return titleCase(normalized);
};

const parseAmount = (value: unknown) => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.abs(value);
  }

  if (typeof value !== "string") {
    return 0;
  }

  const parsed = Number(value.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? Math.abs(parsed) : 0;
};

const getPreviewRows = (summary: ImportResultSummaryInput) =>
  Array.isArray(summary.previewTransactions) ? summary.previewTransactions : [];

const getRowCount = (summary: ImportResultSummaryInput) => {
  const rowsImported = Number(summary.rowsImported ?? 0);
  if (Number.isFinite(rowsImported) && rowsImported > 0) {
    return rowsImported;
  }

  return getPreviewRows(summary).length;
};

const getExpenseTotal = (summary: ImportResultSummaryInput) => {
  const explicitTotal = Number(summary.expenseTotal ?? 0);
  if (Number.isFinite(explicitTotal) && explicitTotal > 0) {
    return explicitTotal;
  }

  return getPreviewRows(summary).reduce((total, row) => {
    if (String(row.type ?? "").toLowerCase() !== "expense") {
      return total;
    }

    return total + parseAmount(row.amount);
  }, 0);
};

const getCategorizedStats = (summary: ImportResultSummaryInput) => {
  const rows = getPreviewRows(summary);
  if (rows.length === 0) {
    return { categorized: 0, review: 0, total: getRowCount(summary) };
  }

  const categorized = rows.filter((row) => {
    const category = normalizeLabel(row.categoryName);
    return category.length > 0 && !/^other$/i.test(category);
  }).length;

  return {
    categorized,
    review: Math.max(0, rows.length - categorized),
    total: rows.length,
  };
};

const hasSalarySignal = (summary: ImportResultSummaryInput) =>
  getPreviewRows(summary).some((row) => {
    const text = [row.merchantClean, row.merchantRaw, row.description].map(normalizeLabel).join(" ");
    return /salary|payroll|wage|compensation|e\s*\/?\s*l\s*\/?\s*espay|espay/i.test(text);
  });

export const formatImportResultHeadline = (summary: ImportResultSummaryInput | null | undefined) => {
  if (!summary) {
    return "";
  }

  const rowCount = getRowCount(summary);
  const expenseTotal = getExpenseTotal(summary);
  const transactionLabel = `${rowCount.toLocaleString("en-US")} transaction${rowCount === 1 ? "" : "s"}`;

  if (expenseTotal > 0) {
    const hasCents = Math.round(expenseTotal * 100) % 100 !== 0;
    const amount = new Intl.NumberFormat("en-PH", {
      style: "currency",
      currency: "PHP",
      minimumFractionDigits: hasCents ? 2 : 0,
      maximumFractionDigits: hasCents ? 2 : 0,
    }).format(expenseTotal);

    return `${amount} spent, ${transactionLabel}`;
  }

  return `${transactionLabel} imported`;
};

export const buildImportResultChecklist = (summary: ImportResultSummaryInput | null | undefined) => {
  if (!summary) {
    return [];
  }

  const rowCount = getRowCount(summary);
  const accountLabel = normalizeLabel(summary.institution) || normalizeLabel(summary.accountName);
  const accountType = formatAccountType(summary.accountType);
  const recognizedLabel = [accountLabel, accountType].filter(Boolean).join(" ");
  const stats = getCategorizedStats(summary);
  const autoCategorizedPercent =
    stats.total > 0 ? Math.round((Math.max(0, stats.categorized) / stats.total) * 100) : 0;
  const topCategory = normalizeLabel(summary.topCategoryName);
  const topMerchant = normalizeLabel(summary.topMerchantName);

  const checklist: string[] = [];
  checklist.push(recognizedLabel ? `Recognized ${recognizedLabel}` : "Recognized import details");

  if (rowCount > 0) {
    checklist.push(`Found ${rowCount.toLocaleString("en-US")} transaction${rowCount === 1 ? "" : "s"}`);
  }

  if (hasSalarySignal(summary)) {
    checklist.push("Detected salary deposits");
  } else if (topCategory && !/^other$/i.test(topCategory)) {
    checklist.push(`Detected ${topCategory.toLowerCase()} activity`);
  } else if (topMerchant) {
    checklist.push(`Detected frequent activity from ${topMerchant}`);
  }

  if (stats.total > 0) {
    checklist.push(`Auto-categorized ${autoCategorizedPercent}%`);
    checklist.push(
      stats.review > 0
        ? `${stats.review.toLocaleString("en-US")} transaction${stats.review === 1 ? " needs" : "s need"} review`
        : "No transactions need review"
    );
  }

  return checklist.slice(0, 5);
};
