import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "./prisma";
import { normalizeRegionalPreferences, normalizeDefaultCurrency } from "./regional-preferences";
import { getWorkspaceOwnerLimits } from "./plan-access";
import { normalizeTransactionAmountInput } from "./transaction-amount-input";
import { invalidateWorkspaceSummaryCache } from "./workspace-summary-cache";
import type { ReceiptDraftFields, ReceiptDraftPreview } from "../../shared/receipt-draft";

const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
export const receiptDraftSchema = z.object({
  merchant: z.string().trim().max(250),
  date: z.string().max(10),
  amount: z.string().trim().max(24),
  currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/).refine(value => !["XXX", "MIX"].includes(value), "Choose a currency."),
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

export async function loadReceiptDraft(importId: string, workspaceId: string): Promise<ReceiptDraftPreview> {
  const [file, accounts, categories, workspace] = await Promise.all([
    findReceipt(importId, workspaceId),
    prisma.account.findMany({ where: { workspaceId }, select: { id: true, name: true, currency: true }, orderBy: { name: "asc" } }),
    prisma.category.findMany({ where: { workspaceId }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.workspace.findUnique({ where: { id: workspaceId }, select: { user: { select: { regionalPreferences: true } } } }),
  ]);
  const doc = file.documentImport!, receipt = doc.receiptDocument!;
  const saved = record(record(doc.extractedPayload).receiptDraft);
  const currency = /^[A-Z]{3}$/.test(receipt.currency) && !["XXX", "MIX"].includes(receipt.currency) ? receipt.currency : normalizeRegionalPreferences(workspace?.user.regionalPreferences).baseCurrency;
  const fields: ReceiptDraftFields = {
    merchant: receipt.merchantClean || receipt.merchantRaw || "",
    date: receipt.transactionDate?.toISOString().slice(0, 10) ?? "",
    amount: receipt.total?.toString() ?? "",
    currency: normalizeDefaultCurrency(currency),
    accountId: receipt.accountId ?? "",
    categoryId: "",
  };
  for (const key of Object.keys(fields) as (keyof ReceiptDraftFields)[]) if (typeof saved[key] === "string") fields[key] = saved[key];
  return { importId, fields, accounts, categories, transactionId: receipt.transactionId, canEdit: !receipt.transactionId && file.processingPhase === "receipt_review_required" };
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
    await tx.documentImport.update({ where: { id: doc.id }, data: { extractedPayload: { ...record(doc.extractedPayload), receiptDraft: fields, receiptDraftUpdatedAt: reviewedAt.toISOString() } as Prisma.InputJsonValue } });
    if (!confirm) return { ok: true, transactionId: null, duplicate: false };
    if (limits?.transactionLimit != null) {
      const owner = await tx.workspace.findUnique({ where: { id: workspaceId }, select: { userId: true } });
      if (!owner) throw new Error("Profile unavailable.");
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`plan-quota:${owner.userId}`}, 0))`;
      const count = await tx.transaction.count({ where: { workspace: { userId: owner.userId }, deletedAt: null } });
      if (count >= limits.transactionLimit) throw new Error("Your plan's transaction limit has been reached.");
    }
    const transaction = await tx.transaction.create({ data: {
      workspaceId, accountId: fields.accountId, categoryId: category?.id ?? null, importFileId: importId,
      sourceRowKey: `receipt-draft:${importId}`, date: new Date(fields.date), amount: fields.amount,
      currency: fields.currency, type: "expense", merchantRaw: receipt.merchantRaw || fields.merchant,
      merchantClean: fields.merchant, description: fields.merchant, reviewStatus: "edited",
      parserConfidence: receipt.confidence, categoryConfidence: category ? 100 : 0, accountMatchConfidence: 100,
      rawPayload: { source: "receipt", receiptDocumentId: receipt.id, receiptDetails: receipt.rawPayload ?? null } as Prisma.InputJsonValue,
      normalizedPayload: { source: "manual_edit", merchantClean: fields.merchant, categoryId: category?.id ?? null, categoryName: category?.name ?? null, type: "expense", receiptDraft: fields, userConfirmedAt: reviewedAt.toISOString() },
      learnedRuleIdsApplied: [],
    } });
    await tx.receiptDocument.update({ where: { id: receipt.id }, data: { transactionId: transaction.id, accountId: fields.accountId } });
    await tx.importFile.update({ where: { id: importId }, data: { status: "done", processingPhase: "complete", processingMessage: "Receipt saved.", accountId: fields.accountId, confirmedTransactionsCount: 1, confirmedAt: reviewedAt } });
    await tx.auditLog.create({ data: { workspaceId, actorUserId, entity: "ImportFile", entityId: importId, action: "import.receipt_draft_confirmed", metadata: { transactionId: transaction.id, fields, originalReceiptDocumentId: receipt.id } } });
    return { ok: true, transactionId: transaction.id, duplicate: false };
  }, { timeout: 20_000 });
  if (confirm) invalidateWorkspaceSummaryCache(workspaceId);
  return result;
}
