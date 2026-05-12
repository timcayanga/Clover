import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isLocalDevHost, requireAuth } from "@/lib/auth";
import { assertWorkspaceAccess } from "@/lib/workspace-access";
import { NextResponse } from "next/server";
import { z } from "zod";
import { recordTrainingSignal, upsertAccountRule, upsertMerchantRule } from "@/lib/data-engine";
import { capturePostHogServerEvent } from "@/lib/analytics";
import { hasCompatibleTable } from "@/lib/data-engine";
import { coerceTransactionTypeFromCategoryName } from "@/lib/transaction-directions";

export const dynamic = "force-dynamic";

const patchSchema = z.object({
  categoryId: z.string().nullable().optional(),
  accountId: z.string().min(1).optional(),
  isExcluded: z.boolean().optional(),
  isTransfer: z.boolean().optional(),
  type: z.enum(["income", "expense", "transfer"]).optional(),
  merchantRaw: z.string().min(1).optional(),
  merchantClean: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  date: z.string().optional(),
  amount: z.union([z.string(), z.number()]).optional(),
  currency: z.string().min(1).optional(),
  reviewStatus: z.enum(["pending_review", "suggested", "confirmed", "edited", "rejected", "duplicate_skipped"]).optional(),
});

const appendManualEditMarker = (value: unknown) =>
  Array.from(new Set([...(Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []), "manual-edit"]));

const resolveTransactionRouteUserId = async () => {
  if (await isLocalDevHost()) {
    return "local-admin";
  }

  const { userId } = await requireAuth();
  return userId;
};

const isJsonObject = (value: Prisma.JsonValue | null | undefined): value is Prisma.JsonObject =>
  !!value && typeof value === "object" && !Array.isArray(value);

const sanitizeTransactionRawPayload = (
  transaction: Pick<Prisma.TransactionGetPayload<{ select: { merchantRaw: true; rawPayload: true } }>, "merchantRaw" | "rawPayload">
) => {
  if (!isJsonObject(transaction.rawPayload)) {
    return null;
  }

  const nextPayload = { ...transaction.rawPayload } as Record<string, Prisma.JsonValue>;
  const merchantRaw = String(transaction.merchantRaw ?? "").toLowerCase();
  const kind = typeof nextPayload.kind === "string" ? nextPayload.kind.toLowerCase() : "";

  if (kind === "opening_balance" || merchantRaw === "beginning balance") {
    if (!("balance" in nextPayload)) {
      return null;
    }

    delete nextPayload.balance;
    return nextPayload as Prisma.InputJsonValue;
  }

  if (!("balance" in nextPayload)) {
    return null;
  }

  delete nextPayload.balance;
  return nextPayload as Prisma.InputJsonValue;
};

export async function PATCH(request: Request, { params }: { params: Promise<{ transactionId: string }> }) {
  try {
    const { transactionId } = await params;
    const userId = await resolveTransactionRouteUserId();
    const payload = patchSchema.parse(await request.json());

    const transaction = await prisma.transaction.findFirst({
      where: { id: transactionId },
    });

    if (!transaction) {
      return NextResponse.json({ error: "Transaction not found" }, { status: 404 });
    }

    await assertWorkspaceAccess(userId, transaction.workspaceId);
    const resolvedCategoryId = payload.categoryId === undefined ? transaction.categoryId : payload.categoryId;
    const resolvedCategory = resolvedCategoryId
      ? await prisma.category.findUnique({
          where: { id: resolvedCategoryId },
        })
      : null;
    const resolvedType = coerceTransactionTypeFromCategoryName(
      resolvedCategory?.name ?? null,
      payload.type ?? transaction.type
    );
    const resolvedIsTransfer = payload.isTransfer ?? resolvedType === "transfer";

    const editedFields =
      payload.categoryId !== undefined ||
      payload.accountId !== undefined ||
      payload.isExcluded !== undefined ||
      payload.isTransfer !== undefined ||
      payload.type !== undefined ||
      payload.merchantRaw !== undefined ||
      payload.merchantClean !== undefined ||
      payload.description !== undefined ||
      payload.date !== undefined ||
      payload.amount !== undefined ||
      payload.currency !== undefined;

    const updated = await prisma.transaction.update({
      where: { id: transactionId },
      data: {
        categoryId: payload.categoryId === undefined ? undefined : payload.categoryId,
        accountId: payload.accountId,
        isExcluded: payload.isExcluded,
        isTransfer: resolvedIsTransfer,
        type: resolvedType,
        merchantRaw: payload.merchantRaw,
        merchantClean: payload.merchantClean,
        description: payload.description,
        date: payload.date ? new Date(payload.date) : undefined,
        amount: payload.amount === undefined ? undefined : payload.amount.toString(),
        currency: payload.currency ? payload.currency.toUpperCase() : undefined,
        reviewStatus: payload.reviewStatus ?? (editedFields ? "edited" : undefined),
        parserConfidence: transaction.parserConfidence,
        categoryConfidence: payload.categoryId ? 100 : transaction.categoryConfidence,
        accountMatchConfidence: payload.accountId ? 100 : transaction.accountMatchConfidence,
        duplicateConfidence: transaction.duplicateConfidence,
        transferConfidence: resolvedType === "transfer" ? 100 : 0,
        normalizedPayload: editedFields
          ? {
              ...(transaction.normalizedPayload && typeof transaction.normalizedPayload === "object" && !Array.isArray(transaction.normalizedPayload)
                ? transaction.normalizedPayload
                : {}),
              source: "manual_edit",
              merchantRaw: payload.merchantRaw ?? transaction.merchantRaw,
              merchantClean: payload.merchantClean ?? transaction.merchantClean ?? payload.merchantRaw ?? transaction.merchantRaw,
              description: payload.description ?? transaction.description,
              categoryId: payload.categoryId === undefined ? transaction.categoryId : payload.categoryId,
              accountId: payload.accountId ?? transaction.accountId,
              type: resolvedType,
              date: payload.date ? new Date(payload.date).toISOString() : transaction.date.toISOString(),
              amount: payload.amount === undefined ? transaction.amount.toString() : payload.amount.toString(),
              currency: payload.currency ? payload.currency.toUpperCase() : transaction.currency,
              isTransfer: resolvedIsTransfer,
              isExcluded: payload.isExcluded ?? transaction.isExcluded,
              reviewStatus: payload.reviewStatus ?? (editedFields ? "edited" : transaction.reviewStatus),
              editedAt: new Date().toISOString(),
            }
          : undefined,
        learnedRuleIdsApplied: editedFields ? appendManualEditMarker(transaction.learnedRuleIdsApplied) : undefined,
      },
      include: {
        splitBill: {
          select: {
            id: true,
            title: true,
          },
        },
      },
    });

    const account = await prisma.account.findUnique({
      where: { id: updated.accountId },
    });

    const categoryForRule = updated.categoryId
      ? await prisma.category.findUnique({
          where: { id: updated.categoryId },
        })
      : null;

    if (payload.merchantRaw || payload.merchantClean || payload.categoryId !== undefined) {
      const merchantText = payload.merchantClean || payload.merchantRaw || updated.merchantClean || updated.merchantRaw;

      if (merchantText && categoryForRule) {
        void upsertMerchantRule({
          workspaceId: transaction.workspaceId,
          merchantText,
          normalizedName: payload.merchantClean || merchantText,
          categoryId: categoryForRule.id,
          categoryName: categoryForRule.name,
          source: "manual_recategorization",
          confidence: 100,
        }).catch(() => null);

        void recordTrainingSignal({
          workspaceId: transaction.workspaceId,
          transactionId: transaction.id,
          merchantText,
          categoryId: categoryForRule.id,
          categoryName: categoryForRule.name,
          type: resolvedType,
          source: "manual_recategorization",
          confidence: 100,
          notes: payload.categoryId ? "Manual transaction edit from the transaction editor." : "Manual merchant label edit from the transaction editor.",
          actorUserId: userId,
        }).catch(() => null);
      }
    }

    if (payload.accountId) {
      void upsertAccountRule({
        workspaceId: transaction.workspaceId,
        accountId: updated.accountId,
        accountName: account?.name ?? "",
        institution: account?.institution ?? null,
        accountType: account?.type ?? "bank",
        source: "manual_transaction_reassignment",
        confidence: 100,
      }).catch(() => null);
    }

    await prisma.auditLog.create({
      data: {
        workspaceId: transaction.workspaceId,
        actorUserId: userId,
        action: "transaction_updated",
        entity: "Transaction",
        entityId: transaction.id,
        metadata: {
          categoryId: updated.categoryId,
          accountId: updated.accountId,
          isExcluded: updated.isExcluded,
          isTransfer: updated.isTransfer,
          type: updated.type,
          currency: updated.currency,
          reviewStatus: updated.reviewStatus,
        },
      },
    });

    const category = updated.categoryId
      ? await prisma.category.findUnique({
          where: { id: updated.categoryId },
        })
      : null;

    void capturePostHogServerEvent("transaction_updated", userId, {
      workspace_id: transaction.workspaceId,
      transaction_id: updated.id,
      amount: Number(updated.amount),
      amount_signed: Number(updated.amount),
      currency: updated.currency,
      transaction_type: updated.type,
      is_manual_edit: true,
    });
    if (payload.categoryId !== undefined && category) {
      void capturePostHogServerEvent("transaction_recategorized", userId, {
        workspace_id: transaction.workspaceId,
        transaction_id: updated.id,
        category_id: category.id,
        is_manual_edit: true,
      });
    }
    if (payload.categoryId) {
      void capturePostHogServerEvent("transaction_categorized", userId, {
        workspace_id: transaction.workspaceId,
        transaction_id: updated.id,
        category_id: payload.categoryId,
        is_manual_edit: true,
      });
    }
    if (payload.categoryId !== undefined && payload.categoryId !== transaction.categoryId) {
      void capturePostHogServerEvent("category_rule_reverted", userId, {
        workspace_id: transaction.workspaceId,
        transaction_id: updated.id,
        old_category_id: transaction.categoryId,
        new_category_id: payload.categoryId ?? null,
        is_manual_edit: true,
      });
    }
    if (payload.merchantClean || payload.merchantRaw) {
      void capturePostHogServerEvent("transaction_merchant_normalized", userId, {
        workspace_id: transaction.workspaceId,
        transaction_id: updated.id,
        is_manual_edit: true,
      });
      if ((payload.merchantClean ?? payload.merchantRaw ?? "").trim() !== (transaction.merchantClean ?? transaction.merchantRaw ?? "").trim()) {
        void capturePostHogServerEvent("merchant_rule_reverted", userId, {
          workspace_id: transaction.workspaceId,
          transaction_id: updated.id,
          old_merchant_clean: transaction.merchantClean ?? transaction.merchantRaw,
          new_merchant_clean: payload.merchantClean ?? payload.merchantRaw ?? null,
          is_manual_edit: true,
        });
        void capturePostHogServerEvent("merchant_rule_deleted", userId, {
          workspace_id: transaction.workspaceId,
          transaction_id: updated.id,
          old_merchant_clean: transaction.merchantClean ?? transaction.merchantRaw,
          new_merchant_clean: payload.merchantClean ?? payload.merchantRaw ?? null,
          is_manual_edit: true,
        });
      }
    }

    return NextResponse.json({
      transaction: {
        id: updated.id,
        workspaceId: updated.workspaceId,
        accountId: updated.accountId,
        accountName: account?.name ?? "",
        categoryId: updated.categoryId,
        categoryName: category?.name ?? null,
        reviewStatus: updated.reviewStatus,
        parserConfidence: updated.parserConfidence,
        categoryConfidence: updated.categoryConfidence,
        accountMatchConfidence: updated.accountMatchConfidence,
        duplicateConfidence: updated.duplicateConfidence,
        transferConfidence: updated.transferConfidence,
        date: updated.date.toISOString(),
        amount: updated.amount.toString(),
        currency: updated.currency,
        type: resolvedType,
        merchantRaw: updated.merchantRaw,
        merchantClean: updated.merchantClean,
        description: updated.description,
        isTransfer: updated.isTransfer,
        isExcluded: updated.isExcluded,
        rawPayload: updated.rawPayload,
        createdAt: updated.createdAt.toISOString(),
        updatedAt: updated.updatedAt.toISOString(),
        splitBill: updated.splitBill,
      },
    });
  } catch {
    return NextResponse.json({ error: "Unable to update transaction" }, { status: 400 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ transactionId: string }> }) {
  try {
    const { transactionId } = await params;
    const userId = await resolveTransactionRouteUserId();

    const transaction = await prisma.transaction.findFirst({
      where: { id: transactionId },
    });

    if (!transaction) {
      return NextResponse.json({ error: "Transaction not found" }, { status: 404 });
    }

    await assertWorkspaceAccess(userId, transaction.workspaceId);

    await prisma.transaction.update({
      where: { id: transactionId },
      data: {
        deletedAt: new Date(),
      },
    });

    await prisma.account.updateMany({
      where: { id: transaction.accountId },
      data: {
        balance: null,
      },
    });

    if (await hasCompatibleTable("AccountStatementCheckpoint")) {
      await prisma.accountStatementCheckpoint.deleteMany({
        where: { accountId: transaction.accountId },
      });
    }

    const siblingTransactions = await prisma.transaction.findMany({
      where: {
        accountId: transaction.accountId,
        deletedAt: null,
      },
      select: {
        id: true,
        merchantRaw: true,
        rawPayload: true,
      },
    });

    const sanitizedUpdates = siblingTransactions
      .map((entry) => ({
        id: entry.id,
        rawPayload: sanitizeTransactionRawPayload(entry),
      }))
      .filter((entry): entry is { id: string; rawPayload: Prisma.InputJsonValue } => entry.rawPayload !== null);

    if (sanitizedUpdates.length > 0) {
      await prisma.$transaction(
        sanitizedUpdates.map((entry) =>
          prisma.transaction.update({
            where: { id: entry.id },
            data: {
              rawPayload: entry.rawPayload,
            },
          })
        )
      );
    }

    await prisma.auditLog.create({
      data: {
        workspaceId: transaction.workspaceId,
        actorUserId: userId,
        action: "transaction_deleted",
        entity: "Transaction",
        entityId: transaction.id,
        metadata: {
          amount: transaction.amount.toString(),
          currency: transaction.currency,
          transactionType: transaction.type,
          reviewStatus: transaction.reviewStatus,
        },
      },
    });

    void capturePostHogServerEvent("transaction_deleted", userId, {
      workspace_id: transaction.workspaceId,
      transaction_id: transaction.id,
      amount: Number(transaction.amount),
      currency: transaction.currency,
      transaction_type: transaction.type,
    });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Unable to delete transaction" }, { status: 400 });
  }
}
