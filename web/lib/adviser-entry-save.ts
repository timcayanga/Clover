import { getEffectiveUserLimits } from "./user-limits";
import { countNonCashAccounts } from "./account-limit-count";
import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { recordTrainingSignal } from "./data-engine";
import { syncWorkspaceRecurringPatterns } from "./recurring-detection";
import {
  entryIssues,
  lineTotal,
  minorUnits,
  formatMinor,
  type EntryDraft,
} from "./adviser-entry-types";
import { parseReceiptLineItemsFromPayload } from "./receipt-line-items";
import { invalidateWorkspaceSummaryCache } from "./workspace-summary-cache";
export class EntrySaveError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
const object = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
export async function commitAdviserEntries(
  database: typeof prisma,
  draft: EntryDraft,
  actorUserId: string,
) {
  const issues = entryIssues(draft);
  if (issues.length) throw new EntrySaveError(issues.join(" "));
  const auditId =
    "adviser_entries_" +
    createHash("sha256")
      .update(`${actorUserId}:${draft.workspaceId}:${draft.id}`)
      .digest("hex");
  const hash = createHash("sha256").update(JSON.stringify(draft)).digest("hex");
  const result = await database.$transaction(
    async (tx) => {
      const workspace = await tx.workspace.findUnique({
        where: { id: draft.workspaceId },
        include: { user: true },
      });
      if (!workspace || workspace.userId !== actorUserId)
        throw new EntrySaveError("This Profile is not available.", 403);
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`adviser-entry-owner:${actorUserId}`}, 0))`;
      // PostgreSQL serializes simultaneous confirmations of this exact draft.
      // Both the financial writes and the completion marker commit together.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${auditId}, 0))`;
      const previous = await tx.auditLog.findUnique({
        where: { id: auditId },
        select: { metadata: true },
      });
      if (previous) {
        const metadata = object(previous.metadata);
        if (metadata.hash !== hash)
          throw new EntrySaveError(
            "This draft was already saved with different details. Start a new draft.",
            409,
          );
        return { ...object(metadata.result), alreadyCompleted: true };
      }
      if (draft.attachmentIds?.length) {
        const count = await tx.auditLog.count({where:{id:{in:draft.attachmentIds},workspaceId:draft.workspaceId,actorUserId,action:"adviser_attachment_added"}});
        if(count !== draft.attachmentIds.length) throw new EntrySaveError("An attachment is unavailable in this Profile.",403);
      }
      const limits = getEffectiveUserLimits(workspace.user);
      if (limits.accountLimit !== null) {
        const existing = await tx.account.findMany({
          where: { workspace: { userId: actorUserId } },
          select: { type: true, name: true, institution: true },
        });
        if (
          countNonCashAccounts(existing) +
            countNonCashAccounts(draft.accounts) >
          limits.accountLimit
        )
          throw new EntrySaveError(
            "This batch would exceed your account limit.",
            403,
          );
      }
      if (limits.transactionLimit !== null) {
        const count = await tx.transaction.count({
          where: { workspace: { userId: actorUserId } },
        });
        if (count + draft.transactions.length > limits.transactionLimit)
          throw new EntrySaveError(
            "This batch would exceed your transaction limit.",
            403,
          );
      }
      const accountMap = new Map<
        string,
        { id: string; currency: string; type: string }
      >();
      const accountIds = [
        ...new Set(
          draft.transactions
            .map((row) => row.accountId)
            .filter((id) => !id.startsWith("new:")),
        ),
      ];
      const accounts = await tx.account.findMany({
        where: { workspaceId: draft.workspaceId, id: { in: accountIds } },
        select: { id: true, currency: true, type: true },
      });
      for (const account of accounts) accountMap.set(account.id, account);
      if (accounts.length !== accountIds.length)
        throw new EntrySaveError(
          "An account is not available in this Profile.",
        );
      const categoryIds = [
        ...new Set(
          draft.transactions.map((row) => row.categoryId).filter(Boolean),
        ),
      ];
      const categories = await tx.category.findMany({
        where: { workspaceId: draft.workspaceId, id: { in: categoryIds } },
        select: { id: true, type: true },
      });
      if (categories.length !== categoryIds.length)
        throw new EntrySaveError(
          "A category is not available in this Profile.",
        );
      const accountResults = [];
      for (const account of draft.accounts) {
        const created = await tx.account.create({
          data: {
            workspaceId: draft.workspaceId,
            name: account.name.trim(),
            institution: account.institution.trim() || null,
            type: account.type,
            currency: account.currency,
            balance: new Prisma.Decimal(account.balance),
            source: "adviser_manual",
            investmentSubtype:
              account.type === "investment"
                ? account.investmentSubtype || null
                : null,
            investmentSymbol:
              account.type === "investment"
                ? account.investmentSymbol || null
                : null,
            investmentQuantity:
              account.type === "investment" && account.investmentQuantity
                ? new Prisma.Decimal(account.investmentQuantity)
                : null,
            investmentCostBasis:
              account.type === "investment" && account.investmentCostBasis
                ? new Prisma.Decimal(account.investmentCostBasis)
                : null,
          },
          select: { id: true, name: true, type: true, currency: true },
        });
        accountMap.set(`new:${account.key}`, created);
        accountResults.push(created);
      }
      const transactionResults = [];
      for (const row of draft.transactions) {
        const account = accountMap.get(row.accountId)!;
        if (account.currency !== row.currency)
          throw new EntrySaveError(
            `Use ${account.currency} for ${row.merchant}. Currency conversion must be explicit.`,
          );
        if (account.type === "investment")
          throw new EntrySaveError(
            "Use an investment holding entry for an investment account. Record payments against a cash or bank account.",
          );
        if (
          row.categoryId &&
          categories.find((category) => category.id === row.categoryId)
            ?.type !== row.type
        )
          throw new EntrySaveError(
            "The category must match the transaction type.",
          );
        const normalizedLines = row.lines.map((line) => ({
          ...line,
          amount: formatMinor(lineTotal([line])!),
          currency: row.currency,
        }));
        const created = await tx.transaction.create({
          data: {
            workspaceId: draft.workspaceId,
            accountId: account.id,
            categoryId: row.categoryId || null,
            date: new Date(row.date + "T00:00:00.000Z"),
            amount: new Prisma.Decimal(row.amount),
            currency: row.currency,
            type: row.type,
            merchantRaw: row.merchant.trim(),
            merchantClean: row.merchant.trim(),
            description: row.description || null,
            reviewStatus: "confirmed",
            parserConfidence: 100,
            categoryConfidence: row.categoryId ? 100 : 0,
            accountMatchConfidence: 100,
            reviewPriority: "none",
            reviewReasons: [],
            rawPayload: {
              adviserAttachmentIds: draft.attachmentIds ?? [],
              source: "adviser_manual",
              sourceText: draft.sourceText,
              proposalConfidence: draft.confidence,
              confirmedByUser: true,
            },
            normalizedPayload: {
              source: "manual_edit",
              adviserDraftId: draft.id,
              receiptLineItems: normalizedLines,
            },
            learnedRuleIdsApplied: [],
          },
          select: { id: true, merchantClean: true },
        });
        transactionResults.push(created);
      }
      const receiptResults = [];
      const seen = new Set<string>();
      for (const receipt of draft.receipts) {
        if (seen.has(receipt.transactionId))
          throw new EntrySaveError(
            "Combine items for the same receipt into one receipt draft.",
          );
        seen.add(receipt.transactionId);
        const existing = await tx.transaction.findFirst({
          where: {
            id: receipt.transactionId,
            workspaceId: draft.workspaceId,
            deletedAt: null,
          },
          select: {
            id: true,
            amount: true,
            currency: true,
            updatedAt: true,
            rawPayload: true,
            normalizedPayload: true,
          },
        });
        if (!existing)
          throw new EntrySaveError(
            "The receipt transaction is unavailable.",
            404,
          );
        if (existing.updatedAt.toISOString() !== receipt.expectedUpdatedAt)
          throw new EntrySaveError(
            "This transaction changed. Reload its receipt before confirming.",
            409,
          );
        const priorLines = parseReceiptLineItemsFromPayload(
          existing.rawPayload,
          existing.normalizedPayload,
        );
        if (priorLines.length + receipt.lines.length > 100)
          throw new EntrySaveError("A receipt supports up to 100 line items.");
        let total = 0n;
        for (const line of priorLines) {
          const text = String(line.amount ?? "");
          const amount = minorUnits(text.replace(/^-/, ""));
          if (amount === null)
            throw new EntrySaveError(
              "Review the existing receipt items before appending more.",
            );
          total += text.startsWith("-") ? -amount : amount;
        }
        total += BigInt(lineTotal(receipt.lines)!);
        const payment = minorUnits(existing.amount.abs().toFixed(2));
        if (total !== payment)
          throw new EntrySaveError(
            "Existing items plus new items, taxes and discounts must equal the recorded payment. The payment amount has not changed.",
          );
        const lines = [
          ...priorLines,
          ...receipt.lines.map((line) => ({
            ...line,
            amount: formatMinor(lineTotal([line])!),
            currency: existing.currency,
          })),
        ];
        // Optimistic version check prevents overwriting an edit made in another tab.
        const updated = await tx.transaction.updateMany({
          where: {
            id: existing.id,
            workspaceId: draft.workspaceId,
            updatedAt: existing.updatedAt,
          },
          data: {
            normalizedPayload: {
              ...object(existing.normalizedPayload),
              receiptLineItems: lines,
              receiptItemsConfirmedByUser: true,
            } as Prisma.InputJsonValue,
          },
        });
        if (updated.count !== 1)
          throw new EntrySaveError(
            "This receipt changed. Reload it before confirming.",
            409,
          );
        receiptResults.push({ transactionId: existing.id });
      }
      const saved = {
        accounts: accountResults,
        transactions: transactionResults,
        receipts: receiptResults,
      };
      await tx.auditLog.create({
        data: {
          id: auditId,
          workspaceId: draft.workspaceId,
          actorUserId,
          action: "adviser.entries_confirmed",
          entity: "AdviserDraft",
          entityId: draft.id,
          metadata: {
            attachmentIds: draft.attachmentIds ?? [],
            hash,
            result: saved,
            sourceText: draft.sourceText,
            confirmedDraft: draft,
          } as unknown as Prisma.InputJsonValue,
        },
      });
      return saved;
    },
    { timeout: 20000, maxWait: 10000 },
  );
  return { ok: true, ...result };
}

export async function saveAdviserEntries(
  draft: EntryDraft,
  actorUserId: string,
) {
  const result = await commitAdviserEntries(prisma, draft, actorUserId);
  invalidateWorkspaceSummaryCache(draft.workspaceId);
  if (!("alreadyCompleted" in result)) {
    // Reuse Clover's confirmed-edit learning; never train on a proposal.
    try {
      const audit = await prisma.auditLog.findFirst({
        where: {
          workspaceId: draft.workspaceId,
          actorUserId,
          action: "adviser.entries_confirmed",
          entityId: draft.id,
        },
        select: { metadata: true },
      });
      const saved = object(object(audit?.metadata).result);
      const ids = Array.isArray(saved.transactions)
        ? saved.transactions.map((row) => String(object(row).id))
        : [];
      const transactions = await prisma.transaction.findMany({
        where: {
          workspaceId: draft.workspaceId,
          id: { in: ids },
          categoryId: { not: null },
        },
        include: { category: true },
      });
      for (const transaction of transactions)
        if (transaction.category)
          void recordTrainingSignal({
            workspaceId: draft.workspaceId,
            transactionId: transaction.id,
            merchantText: transaction.merchantClean || transaction.merchantRaw,
            categoryId: transaction.category.id,
            categoryName: transaction.category.name,
            type: transaction.type,
            source: "manual_transaction_creation",
            confidence: 100,
            notes: "User confirmed an Adviser entry draft.",
            actorUserId,
          }).catch(() => {});
      void syncWorkspaceRecurringPatterns(draft.workspaceId).catch(() => {});
    } catch {
      /* Saving succeeded; learning can be retried independently. */
    }
  }
  return result;
}
