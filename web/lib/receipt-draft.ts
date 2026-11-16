import { linkReceiptToExistingExpense } from "./transaction-source-matches";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "./prisma";
import { normalizeRegionalPreferences, normalizeDefaultCurrency } from "./regional-preferences";
import { getWorkspaceOwnerLimits } from "./plan-access";
import { normalizeTransactionAmountInput } from "./transaction-amount-input";
import { invalidateWorkspaceSummaryCache } from "./workspace-summary-cache";
import type { ReceiptDraftFieldProvenance, ReceiptDraftFields, ReceiptDraftPreview } from "../../shared/receipt-draft";

const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
export const receiptDraftSchema = z.object({
  merchant: z.string().trim().max(250),
  date: z.string().max(10),
  amount: z.string().trim().max(24),
  currency: z.string().trim().toUpperCase().refine(value => value === "" || (/^[A-Z]{3}$/.test(value) && !["XXX", "MIX"].includes(value)), "Choose a currency."),
  accountId: z.string().max(200),
  categoryId: z.string().max(200).default(""),
}).strict();

export function validateReceiptDraftConfirmation(value: unknown) {
  const fields = receiptDraftSchema.parse(value);
  if (!fields.merchant) throw new Error("Enter the merchant or transaction name.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fields.date) || !Number.isFinite(Date.parse(fields.date)) || new Date(fields.date).toISOString().slice(0, 10) !== fields.date)
    throw new Error("Enter the receipt date as YYYY-MM-DD.");
  const amount = normalizeTransactionAmountInput(fields.amount);
  if (!amount || Number(amount) <= 0 || Number(amount) >= 1_000_000_000_000_000)
    throw new Error("Enter an amount greater than zero with up to two decimal places.");
  if (!fields.currency) throw new Error("Choose a currency.");
  if (!fields.accountId) throw new Error("Choose an account.");
  return { ...fields, amount: new Prisma.Decimal(amount).toFixed(2) };
}

async function findReceipt(importId: string, workspaceId: string, client = prisma) {
  const file = await client.importFile.findFirst({
    where: { id: importId, workspaceId },
    include: { documentImport: { include: { receiptDocument: true } } },
  });
  if (!file?.documentImport?.receiptDocument) throw new Error("This import has no receipt draft to review.");
  return file;
}

function receiptDraftProvenance(
  receipt: NonNullable<NonNullable<Awaited<ReturnType<typeof findReceipt>>["documentImport"]>["receiptDocument"]>,
  fields: ReceiptDraftFields,
  confirmed = false,
): ReceiptDraftFieldProvenance {
  const raw = record(receipt.rawPayload);
  const evidence = record(record(raw.receiptDetails).core_field_evidence);
  const keys = { merchant: "merchant", date: "date", amount: "total", currency: "currency" } as const;
  const original = {
    merchant: receipt.merchantClean || receipt.merchantRaw || "",
    date: receipt.transactionDate?.toISOString().slice(0, 10) ?? "",
    amount: receipt.total?.toString() ?? "",
    currency: receipt.currency,
    accountId: receipt.accountId ?? "",
    categoryId: "",
  };
  const provenance: ReceiptDraftFieldProvenance = {};
  for (const field of Object.keys(original) as (keyof ReceiptDraftFields)[]) {
    const value = fields[field];
    const changed = field === "amount" && value && original.amount
      ? normalizeTransactionAmountInput(value) !== normalizeTransactionAmountInput(original.amount)
      : value !== original[field];
    const entry = field === "accountId" ? record(record(raw.receiptPaymentAccount).resolution)
      : field === "categoryId" ? {} : record(evidence[keys[field]]);
    if (changed && (value || original[field]) && !(field === "currency" && !value && entry.status === "uncertain")) {
      provenance[field] = { source: "user", status: !value ? "uncertain" : confirmed ? "confirmed" : "edited", confidence: null };
    } else if (typeof entry.status === "string" || (field === "accountId" && typeof entry.accountId === "string")) {
      provenance[field] = {
        source: typeof entry.source === "string" ? entry.source : field === "accountId" ? "account_match" : "receipt",
        status: typeof entry.status === "string" ? entry.status : "supported",
        confidence: typeof entry.confidence === "number" && Number.isFinite(entry.confidence) ? entry.confidence : null,
        ...(typeof entry.label === "string" ? { label: entry.label } : {}),
        ...(typeof entry.reason === "string" ? { reason: entry.reason } : {}),
      };
    }
  }
  return provenance;
}

export async function loadReceiptDraft(importId: string, workspaceId: string): Promise<ReceiptDraftPreview> {
  const [file, accounts, categories, workspace] = await Promise.all([
    findReceipt(importId, workspaceId),
    prisma.account.findMany({ where: { workspaceId }, select: { id: true, name: true, currency: true }, orderBy: { name: "asc" } }),
    prisma.category.findMany({ where: { workspaceId }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.workspace.findUnique({ where: { id: workspaceId }, select: { user: { select: { regionalPreferences: true } } } }),
  ]);
  const doc = file.documentImport!, receipt = doc.receiptDocument!;
  const paymentAccount = record(record(receipt.rawPayload).receiptPaymentAccount);
  const candidates = new Set(Array.isArray(paymentAccount.candidateIds) ? paymentAccount.candidateIds : []);
  const rankedAccounts = [...accounts].sort((left, right) => {
    const rank = (id: string) => id === paymentAccount.suggestedAccountId ? 0 : candidates.has(id) ? 1 : 2;
    return rank(left.id) - rank(right.id);
  });
  const extracted = record(doc.extractedPayload);
  const saved = record(extracted.receiptDraft);
  const currencyEvidence = record(record(record(record(receipt.rawPayload).receiptDetails).core_field_evidence).currency);
  const currency = /^[A-Z]{3}$/.test(receipt.currency) && !["XXX", "MIX"].includes(receipt.currency) ? receipt.currency : normalizeRegionalPreferences(workspace?.user.regionalPreferences).baseCurrency;
  const fields: ReceiptDraftFields = {
    merchant: receipt.merchantClean || receipt.merchantRaw || "",
    date: receipt.transactionDate?.toISOString().slice(0, 10) ?? "",
    amount: receipt.total?.toString() ?? "",
    currency: currencyEvidence.status === "uncertain" ? "" : normalizeDefaultCurrency(currency),
    accountId: receipt.accountId ?? "",
    categoryId: "",
  };
  for (const key of Object.keys(fields) as (keyof ReceiptDraftFields)[]) if (typeof saved[key] === "string") fields[key] = saved[key];
  const fieldProvenance = extracted.receiptDraftFieldProvenance
    ? record(extracted.receiptDraftFieldProvenance) as ReceiptDraftFieldProvenance
    : receiptDraftProvenance(receipt, fields, Boolean(receipt.transactionId));
  if (typeof saved.currency !== "string" && fields.currency && fields.currency !== receipt.currency) {
    fieldProvenance.currency = { source: "user_default", status: "suggested", confidence: null };
  }
  return { importId, fields, fieldProvenance, accounts: rankedAccounts, categories, transactionId: receipt.transactionId, canEdit: !receipt.transactionId && file.processingPhase === "receipt_review_required" };
}

/** The parser's raw payload and photo are never modified by reviewing a draft. */
export async function saveReceiptDraft(importId: string, workspaceId: string, actorUserId: string, value: unknown, confirm = false) {
  const fields = confirm ? validateReceiptDraftConfirmation(value) : receiptDraftSchema.parse(value);
  const limits = confirm ? await getWorkspaceOwnerLimits(workspaceId) : null;
  const result = await prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT "id" FROM "ImportFile" WHERE "id"=${importId} AND "workspaceId"=${workspaceId} FOR UPDATE`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`receipt-confirm:${importId}`}, 0))`;
    const file = await tx.importFile.findFirst({ where: { id: importId, workspaceId }, include: { documentImport: { include: { receiptDocument: true } } } });
    const doc = file?.documentImport, receipt = doc?.receiptDocument;
    if (!file || !doc || !receipt) throw new Error("This import has no receipt draft to review.");
    // Repeated confirmations return the saved record. Never recreate a deleted
    // receipt transaction or overwrite an existing confirmed financial record.
    const existing = await tx.transaction.findFirst({ where: { importFileId: importId }, select: { id: true, deletedAt: true } });
    if (existing || receipt.transactionId) {
      if (!confirm) throw new Error("This receipt is already saved. Edit it in Transactions.");
      return { ok: true, transactionId: existing?.id ?? receipt.transactionId, duplicate: true };
    }
    const controlEvent = await tx.auditLog.findFirst({ where: { workspaceId, entityId: importId, action: "import.user_control" }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], select: { metadata: true } });
    const control = record(controlEvent?.metadata).control;
    if (control === "paused" || control === "cancelled") throw new Error(control === "paused" ? "Resume this import before saving it." : "This import was cancelled.");
    if (file.processingPhase !== "receipt_review_required") throw new Error("The receipt is still being processed. Please check again shortly.");
    const account = fields.accountId ? await tx.account.findFirst({ where: { id: fields.accountId, workspaceId }, select: { id: true, currency: true } }) : null;
    const category = fields.categoryId ? await tx.category.findFirst({ where: { id: fields.categoryId, workspaceId }, select: { id: true, name: true } }) : null;
    if (fields.accountId && !account) throw new Error("Choose an account in this Profile.");
    if (fields.categoryId && !category) throw new Error("Choose a category in this Profile.");
    if (confirm && (!account || account.currency.toUpperCase() !== fields.currency)) throw new Error(`Choose an account in ${fields.currency}.`);
    const reviewedAt = new Date();
    const fieldProvenance = receiptDraftProvenance(receipt, fields, confirm);
    await tx.documentImport.update({ where: { id: doc.id }, data: { extractedPayload: { ...record(doc.extractedPayload), receiptDraft: fields, receiptDraftFieldProvenance: fieldProvenance, receiptDraftUpdatedAt: reviewedAt.toISOString() } as Prisma.InputJsonValue } });
    if (!confirm) return { ok: true, transactionId: null, duplicate: false };
    const receiptPayload = record(receipt.rawPayload);
    const rawPayload = { source: "receipt", receiptDocumentId: receipt.id,
      receiptDetails: receiptPayload.receiptDetails ?? receipt.rawPayload ?? null } as Prisma.InputJsonValue;
    const linked = await linkReceiptToExistingExpense(tx, receipt.id, {
      workspaceId, accountId: fields.accountId, date: new Date(fields.date), amount: fields.amount,
      currency: fields.currency, merchantRaw: receipt.merchantRaw || fields.merchant, merchantClean: fields.merchant, rawPayload,
    });
    if (!linked && limits?.transactionLimit != null) {
      const owner = await tx.workspace.findUnique({ where: { id: workspaceId }, select: { userId: true } });
      if (!owner) throw new Error("Profile unavailable.");
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`plan-quota:${owner.userId}`}, 0))`;
      const count = await tx.transaction.count({ where: { workspace: { userId: owner.userId }, deletedAt: null } });
      if (count >= limits.transactionLimit) throw new Error("Your plan's transaction limit has been reached.");
    }
    const transaction = linked ?? await tx.transaction.create({ data: {
      workspaceId, accountId: fields.accountId, categoryId: category?.id ?? null, importFileId: importId,
      sourceRowKey: `receipt-draft:${importId}`, date: new Date(fields.date), amount: fields.amount,
      currency: fields.currency, type: "expense", merchantRaw: receipt.merchantRaw || fields.merchant,
      merchantClean: fields.merchant, description: fields.merchant, reviewStatus: "edited",
      parserConfidence: receipt.confidence, categoryConfidence: category ? 100 : 0, accountMatchConfidence: 100,
      rawPayload,
      normalizedPayload: { source: "manual_edit", merchantClean: fields.merchant, categoryId: category?.id ?? null, categoryName: category?.name ?? null, type: "expense", receiptDraft: fields, receiptDraftFieldProvenance: fieldProvenance, userConfirmedAt: reviewedAt.toISOString() },
      learnedRuleIdsApplied: [],
    } });
    if (!linked) await tx.receiptDocument.update({ where: { id: receipt.id }, data: { transactionId: transaction.id, accountId: fields.accountId } });
    await tx.importFile.update({ where: { id: importId }, data: { status: "done", processingPhase: "complete", processingMessage: linked ? "Receipt linked to an existing transaction." : "Receipt saved.", accountId: fields.accountId, confirmedTransactionsCount: 1, confirmedAt: reviewedAt } });
    await tx.auditLog.create({ data: { workspaceId, actorUserId, entity: "ImportFile", entityId: importId, action: "import.receipt_draft_confirmed", metadata: { transactionId: transaction.id, fields, fieldProvenance, originalReceiptDocumentId: receipt.id } } });
    const paymentAccount = record(receiptPayload.receiptPaymentAccount);
    if (typeof paymentAccount.historyKey === "string") {
      await tx.auditLog.create({ data: { workspaceId, actorUserId, entity: "ReceiptPayment",
        entityId: paymentAccount.historyKey, action: "import.receipt_payment_account_confirmed",
        metadata: { accountId: fields.accountId, importId },
      } });
    }
    return { ok: true, transactionId: transaction.id, duplicate: Boolean(linked) };
  }, { timeout: 20_000 });
  if (confirm) invalidateWorkspaceSummaryCache(workspaceId);
  return result;
}
