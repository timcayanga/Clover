import { getTransactionUserNoteValue, getTransactionParsedNoteValue } from "./transaction-notes";

const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
const pick = (value: unknown, fields: string[]) => {
  const data = record(value);
  return Object.fromEntries(
    fields
      .filter((field) => field in data)
      .map((field) => [field, data[field]]),
  );
};
const transactionFields = [
  "id",
  "workspaceId",
  "accountId",
  "accountName",
  "categoryName",
  "categoryId",
  "institution",
  "isExcluded",
  "reviewStatus",
  "date",
  "amount",
  "currency",
  "type",
  "merchantRaw",
  "merchantClean",
  "description",
  "tags",
];
export function mobileApiResponse(operation: string, value: unknown) {
  const data = record(value);
  if (data.error) return pick(data, ["error"]);
  if (operation === "budgets" || operation === "budget") return {
    budget: pick(data.budget, ["id"]),
    ...(data.history ? { history: pick(data.history, ["points", "recentTransactions"]) } : {}),
  };
  if (operation === "account-create") return { account: pick(data.account, ["id", "name", "institution", "type", "currency", "balance"]) };
  if (operation === "transaction-create") return { transaction: pick(data.transaction, ["id"]) };
  if (operation === "transactions")
    return {
      ...pick(data, ["page", "totalCount"]),
      transactions: Array.isArray(data.transactions)
        ? data.transactions.map((row) => pick(row, transactionFields))
        : [],
    };
  if (operation === "transaction") {
    const row = record(data.transaction);
    return {
      transaction: { ...pick(row, transactionFields), userNote: getTransactionUserNoteValue(row), parsedNote: getTransactionParsedNoteValue(row), source: row.source },
      accounts: Array.isArray(data.accounts) ? data.accounts.map(row => pick(row, ["id", "name", "institution", "currency", "type"])) : [],
      categories: Array.isArray(data.categories) ? data.categories.map(row => pick(row, ["id", "name", "type"])) : [],
    };
  }
  if (operation === "accounts")
    return {
      accounts: Array.isArray(data.accounts)
        ? data.accounts.map((row) =>
            pick(row, [
              "id",
              "name",
              "type",
              "institution",
              "currency",
              "balance",
            ]),
          )
        : [],
    };
  if (operation === "imports")
    return {
      importFiles: Array.isArray(data.importFiles)
        ? data.importFiles.map((row) =>
            pick(row, [
              "id",
              "fileName",
              "status",
              "createdAt",
              "processingMessage",
            ]),
          )
        : [],
    };
  if (operation === "import-status")
    return {
      importFile: pick(data.importFile, [
        "id",
        "fileName",
        "status",
        "processingMessage",
        "processingPhase",
      ]),
      ...pick(data, [
        "visibleImportComplete",
        "confirmedTransactionsCount",
        "parsedRowsCount",
      ]),
    };
  return pick(data, [
    "status",
    "importFileId",
    "queued",
    "processed",
    "visibleImportComplete",
    "confirmedTransactionsCount",
  ]);
}
