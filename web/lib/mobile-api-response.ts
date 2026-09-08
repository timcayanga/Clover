import { parseReceiptLineItemsFromPayload } from "./receipt-line-items";
import { entryDraftSchema } from "./adviser-entry-schema";
import { projectAdviserDeviceContext } from "./adviser-device-context";
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
const rows = (value: unknown, fields: string[]) => Array.isArray(value) ? value.map(row => pick(row, fields)) : [];
const circleSummary = (value: unknown) => {
  const circle = record(value);
  return {
    ...pick(circle, ["id", "name", "type", "description", "color", "currency", "role", "isOwner", "memberCount", "pendingCount", "expenseTotalThisMonth", "contributionTotalThisMonth", "detailsLoaded"]),
    members: rows(circle.members, ["id", "displayName", "role", "status", "isOwner", "contributionTarget", "contributionCadence", "contributedThisMonth"]),
    budgets: rows(circle.budgets, ["id", "name", "targetAmount", "spentAmount", "currency", "cadence", "progressPercent", "isActive"]),
    goals: rows(circle.goals, ["id", "name", "targetAmount", "currentAmount", "currency", "targetDate", "progressPercent", "status", "estimateConfidence", "estimateReason", "estimatedCompletionDate"]),
    commitments: rows(circle.commitments, ["id", "title", "amount", "currency", "recurrence", "nextDueDate", "assignedMemberName", "isActive"]),
    contributions: rows(circle.contributions, ["id", "memberName", "amount", "currency", "contributionDate", "note"]),
    expenses: rows(circle.expenses, ["id", "kind", "title", "amount", "currency", "date", "visibility"]),
    investmentShares: rows(circle.investmentShares, ["id", "name", "institution", "balance", "currency", "visibility"]),
    activities: rows(circle.activities, ["id", "summary", "createdAt"]),
    insights: rows(circle.insights, ["id", "title", "detail", "confidence", "reason"]),
  };
};
const splitSummary = (value: unknown) => pick(value, ["id", "title", "note", "billDate", "currency", "sourceType", "total", "settlementStatus"]);
const splitDetail = (value: unknown) => {
  const bill = record(value), settlement = record(bill.settlement);
  return { ...splitSummary(bill),
    items: rows(bill.items, ["id", "description", "amount"]),
    settlement: {
      ...pick(settlement, ["totalSpent", "totalPaid", "totalOwed"]),
      participants: rows(settlement.participants, ["id", "name", "paid", "owed", "balance"]),
      transfers: rows(settlement.transfers, ["fromParticipantName", "toParticipantName", "amount"]),
    },
  };
};
export function mobileApiResponse(operation: string, value: unknown) {
  const data = record(value);
  if (data.error) return pick(data, ["error"]);
  if (operation === "adviser-chat") return {
    ...pick(data, ["reply", "degraded", "scopeRejected", "answerSource"]),
    ...(projectAdviserDeviceContext(data.deviceContext) ? { deviceContext: projectAdviserDeviceContext(data.deviceContext) } : {}),
    entryDraft: Array.isArray(data.actions) ? data.actions.filter(action => record(action).type === "create_entries").map(action => entryDraftSchema.safeParse(record(action).payload)).find(result => result.success)?.data : undefined,
    suggestions: rows(data.suggestions, ["id", "label", "prompt"]),
    usage: pick(data.usage, ["plan", "remaining", "resetsAt", "unlimited"]),
    // Native action confirmation is not implemented yet; never execute or expose
    // model-generated action payloads as if they were saved financial records.
    hasActions: Array.isArray(data.actions) && data.actions.some(action => record(action).type !== "create_entries"),
  };
  if (operation === "circles" || operation === "circle") {
    if (data.circleId) return pick(data, ["circleId"]);
    if (data.circle) return { circleId: record(data.circle).id };
    const circles = Array.isArray(data.circles) ? data.circles.map(circleSummary) : [];
    return operation === "circles" ? { circles } : { circle: circles[0] ?? null };
  }
  if (operation === "split-bills") return data.bill ? { bill: splitDetail(data.bill) } : { ...pick(data, ["page", "hasMore"]), bills: Array.isArray(data.bills) ? data.bills.map(splitSummary) : [] };
  if (operation === "split-bill") return { bill: splitDetail(data.bill) };
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
      transaction: { ...pick(row, transactionFields), receiptLineItems: parseReceiptLineItemsFromPayload(row.rawPayload,row.normalizedPayload), userNote: getTransactionUserNoteValue(row), parsedNote: getTransactionParsedNoteValue(row), source: row.source },
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
