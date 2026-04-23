import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { assertWorkspaceAccess } from "@/lib/workspace-access";
import { NextResponse } from "next/server";
import { z } from "zod";
import { recordTrainingSignal, upsertAccountRule, upsertMerchantRule } from "@/lib/data-engine";
import { capturePostHogServerEvent } from "@/lib/analytics";

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
  reviewStatus: z.enum(["pending_review", "suggested", "confirmed", "edited", "rejected", "duplicate_skipped"]).optional(),
});

const appendManualEditMarker = (value: unknown) =>
  Array.from(new Set([...(Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []), "manual-edit"]));

export async function PATCH(request: Request, { params }: { params: Promise<{ transactionId: string }> }) {
  try {
    const { transactionId } = await params;
    const { userId } = await requireAuth();
    const payload = patchSchema.parse(await request.json());

    const transaction = await prisma.transaction.findFirst({
      where: { id: transactionId },
    });

    if (!transaction) {
      return NextResponse.json({ error: "Transaction not found" }, { status: 404 });
    }

    await assertWorkspaceAccess(userId, transaction.workspaceId);

    const categoryChanged =
      payload.categoryId !== undefined &&
      payload.categoryId !== transaction.categoryId &&
      Boolean(payload.categoryId);
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
      payload.amount !== undefined;

    const updated = await prisma.transaction.update({
      where: { id: transactionId },
      data: {
        categoryId: payload.categoryId === undefined ? undefined : payload.categoryId,
        accountId: payload.accountId,
        isExcluded: payload.isExcluded,
        isTransfer: payload.isTransfer,
        type: payload.type,
        merchantRaw: payload.merchantRaw,
        merchantClean: payload.merchantClean,
        description: payload.description,
        date: payload.date ? new Date(payload.date) : undefined,
        amount: payload.amount === undefined ? undefined : payload.amount.toString(),
        reviewStatus: payload.reviewStatus ?? (editedFields ? "edited" : undefined),
        parserConfidence: transaction.parserConfidence,
        categoryConfidence: payload.categoryId ? 100 : transaction.categoryConfidence,
        accountMatchConfidence: payload.accountId ? 100 : transaction.accountMatchConfidence,
        duplicateConfidence: transaction.duplicateConfidence,
        transferConfidence: payload.isTransfer !== undefined ? 100 : transaction.transferConfidence,
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
              type: payload.type ?? transaction.type,
              date: payload.date ? new Date(payload.date).toISOString() : transaction.date.toISOString(),
              amount: payload.amount === undefined ? transaction.amount.toString() : payload.amount.toString(),
              currency: transaction.currency,
              isTransfer: payload.isTransfer ?? transaction.isTransfer,
              isExcluded: payload.isExcluded ?? transaction.isExcluded,
              reviewStatus: payload.reviewStatus ?? (editedFields ? "edited" : transaction.reviewStatus),
              editedAt: new Date().toISOString(),
            }
          : undefined,
        learnedRuleIdsApplied: editedFields ? appendManualEditMarker(transaction.learnedRuleIdsApplied) : undefined,
      },
    });

    const account = await prisma.account.findUnique({
      where: { id: updated.accountId },
    });

    if (categoryChanged && payload.categoryId) {
      const category = await prisma.category.findUnique({
        where: { id: payload.categoryId },
      });

      if (category) {
        await recordTrainingSignal({
          workspaceId: transaction.workspaceId,
          transactionId: transaction.id,
          merchantText: payload.merchantClean || payload.merchantRaw || transaction.merchantClean || transaction.merchantRaw,
          categoryId: category.id,
          categoryName: category.name,
          type: payload.type ?? transaction.type,
          source: "manual_recategorization",
          confidence: 100,
          notes: "Manual category change from the transaction editor.",
        });
      }
    }

    if (payload.merchantRaw || payload.merchantClean || payload.categoryId !== undefined) {
      const merchantText = payload.merchantClean || payload.merchantRaw || updated.merchantClean || updated.merchantRaw;
      const categoryForRule = updated.categoryId
        ? await prisma.category.findUnique({
            where: { id: updated.categoryId },
          })
        : null;

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
      }
    }

    if (payload.accountId) {
      void upsertAccountRule({
        workspaceId: transaction.workspaceId,
        accountId: updated.accountId,
        accountName: account?.name ?? "",
        institution: account?.institution ?? null,
        accountType: (account?.type ?? "bank") as "bank" | "wallet" | "credit_card" | "cash" | "investment" | "other",
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
      currency: updated.currency,
      transaction_type: updated.type,
      is_manual_edit: true,
    });
    if (categoryChanged && category) {
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
    if (payload.merchantClean || payload.merchantRaw) {
      void capturePostHogServerEvent("transaction_merchant_normalized", userId, {
        workspace_id: transaction.workspaceId,
        transaction_id: updated.id,
        is_manual_edit: true,
      });
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
        type: updated.type,
        merchantRaw: updated.merchantRaw,
        merchantClean: updated.merchantClean,
        description: updated.description,
        isTransfer: updated.isTransfer,
        isExcluded: updated.isExcluded,
        createdAt: updated.createdAt.toISOString(),
        updatedAt: updated.updatedAt.toISOString(),
      },
    });
  } catch {
    return NextResponse.json({ error: "Unable to update transaction" }, { status: 400 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ transactionId: string }> }) {
  try {
    const { transactionId } = await params;
    const { userId } = await requireAuth();

    const transaction = await prisma.transaction.findFirst({
      where: { id: transactionId },
    });

    if (!transaction) {
      return NextResponse.json({ error: "Transaction not found" }, { status: 404 });
    }

    await assertWorkspaceAccess(userId, transaction.workspaceId);

    await prisma.transaction.delete({
      where: { id: transactionId },
    });

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
