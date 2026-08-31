import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isLocalDevHost, requireAuth } from "@/lib/auth";
import { assertWorkspaceAccess } from "@/lib/workspace-access";
import { NextResponse } from "next/server";
import { z } from "zod";
import { recordTrainingSignal, upsertAccountRule } from "@/lib/data-engine";
import { capturePostHogServerEvent } from "@/lib/analytics";
import { hasCompatibleTable } from "@/lib/data-engine";
import { coerceTransactionTypeFromCategoryName } from "@/lib/transaction-directions";
import { recordAdviserActionCompletion } from "@/lib/adviser-actions";
import { normalizeTransactionTagKey, sanitizeTransactionTagNames } from "@/lib/transaction-tags";
import { revalidateTag } from "next/cache";
import { removeEmptyNonDefaultCashAccounts } from "@/lib/empty-cash-account-cleanup";

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
  userNote: z.string().nullable().optional(),
  tags: z.array(z.string()).optional(),
  date: z.string().optional(),
  amount: z.union([z.string(), z.number()]).optional(),
  currency: z.string().min(1).optional(),
  rawPayload: z.unknown().optional(),
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

const buildTransactionTagWrites = (workspaceId: string, tags: readonly string[]) =>
  sanitizeTransactionTagNames(tags).map((name) => ({
    tag: {
      connectOrCreate: {
        where: {
          workspaceId_normalizedName: {
            workspaceId,
            normalizedName: normalizeTransactionTagKey(name),
          },
        },
        create: {
          workspaceId,
          name,
          normalizedName: normalizeTransactionTagKey(name),
        },
      },
    },
  }));

export async function GET(_request: Request, { params }: { params: Promise<{ transactionId: string }> }) {
  try {
    const { transactionId } = await params;
    const [userId, transaction] = await Promise.all([
      resolveTransactionRouteUserId(),
      prisma.transaction.findFirst({
        where: { id: transactionId, deletedAt: null },
        include: {
          account: true,
          category: true,
          splitBill: { select: { id: true, title: true } },
          transactionTags: { select: { tag: { select: { id: true, name: true } } } },
        },
      }),
    ]);

    if (!transaction) {
      return NextResponse.json({ error: "Transaction not found" }, { status: 404 });
    }

    const [, accounts, categories] = await Promise.all([
      assertWorkspaceAccess(userId, transaction.workspaceId),
      prisma.account.findMany({
        where: { workspaceId: transaction.workspaceId, type: { not: "investment" } },
        orderBy: [{ name: "asc" }],
        select: { id: true, name: true, institution: true, accountNumber: true, type: true, currency: true },
      }),
      prisma.category.findMany({
        where: { workspaceId: transaction.workspaceId, isArchived: false },
        orderBy: [{ isSystem: "desc" }, { name: "asc" }],
        select: { id: true, name: true, type: true },
      }),
    ]);

    return NextResponse.json({
      transaction: {
        id: transaction.id,
        workspaceId: transaction.workspaceId,
        accountId: transaction.accountId,
        accountName: transaction.account.name,
        institution: transaction.account.institution,
        accountNumber: transaction.account.accountNumber,
        categoryId: transaction.categoryId,
        categoryName: transaction.category?.name ?? null,
        reviewStatus: transaction.reviewStatus,
        parserConfidence: transaction.parserConfidence,
        categoryConfidence: transaction.categoryConfidence,
        accountMatchConfidence: transaction.accountMatchConfidence,
        duplicateConfidence: transaction.duplicateConfidence,
        transferConfidence: transaction.transferConfidence,
        date: transaction.date.toISOString(),
        amount: transaction.amount.toString(),
        currency: transaction.currency,
        type: transaction.type,
        merchantRaw: transaction.merchantRaw,
        merchantClean: transaction.merchantClean,
        description: transaction.description,
        isTransfer: transaction.isTransfer,
        isExcluded: transaction.isExcluded,
        source: transaction.importFileId ? "upload" : "manual",
        importFileId: transaction.importFileId,
        rawPayload: transaction.rawPayload,
        normalizedPayload: transaction.normalizedPayload,
        splitBill: transaction.splitBill,
        tags: transaction.transactionTags.map((entry) => entry.tag),
      },
      accounts,
      categories,
    });
  } catch {
    return NextResponse.json({ error: "Unable to load transaction" }, { status: 400 });
  }
}

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
      payload.type ?? transaction.type,
      payload.amount ?? transaction.amount,
      payload.isTransfer ?? transaction.isTransfer
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
      payload.userNote !== undefined ||
      payload.date !== undefined ||
      payload.amount !== undefined ||
      payload.currency !== undefined ||
      payload.rawPayload !== undefined ||
      payload.tags !== undefined;

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
        description: payload.description === undefined ? undefined : payload.description,
        date: payload.date ? new Date(payload.date) : undefined,
        amount: payload.amount === undefined ? undefined : payload.amount.toString(),
        currency: payload.currency ? payload.currency.toUpperCase() : undefined,
        rawPayload: payload.rawPayload === undefined ? undefined : (payload.rawPayload as Prisma.InputJsonValue),
        reviewStatus: payload.reviewStatus ?? (editedFields ? "edited" : undefined),
        reviewPriority: editedFields && payload.reviewStatus !== "pending_review" ? "none" : undefined,
        reviewReasons: editedFields && payload.reviewStatus !== "pending_review" ? Prisma.DbNull : undefined,
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
              userNote:
                payload.userNote === undefined
                  ? (
                      transaction.normalizedPayload && typeof transaction.normalizedPayload === "object" && !Array.isArray(transaction.normalizedPayload)
                        ? (transaction.normalizedPayload as Record<string, Prisma.JsonValue>).userNote ?? null
                        : null
                    )
                  : payload.userNote,
              categoryId: payload.categoryId === undefined ? transaction.categoryId : payload.categoryId,
              accountId: payload.accountId ?? transaction.accountId,
              type: resolvedType,
              date: payload.date ? new Date(payload.date).toISOString() : transaction.date.toISOString(),
              amount: payload.amount === undefined ? transaction.amount.toString() : payload.amount.toString(),
              currency: payload.currency ? payload.currency.toUpperCase() : transaction.currency,
              rawPayload: payload.rawPayload === undefined ? transaction.rawPayload : (payload.rawPayload as Prisma.JsonValue),
              isTransfer: resolvedIsTransfer,
              isExcluded: payload.isExcluded ?? transaction.isExcluded,
              tags: payload.tags === undefined ? undefined : sanitizeTransactionTagNames(payload.tags),
              reviewStatus: payload.reviewStatus ?? (editedFields ? "edited" : transaction.reviewStatus),
              editedAt: new Date().toISOString(),
            }
          : undefined,
        learnedRuleIdsApplied: editedFields ? appendManualEditMarker(transaction.learnedRuleIdsApplied) : undefined,
        transactionTags:
          payload.tags === undefined
            ? undefined
            : {
                deleteMany: {},
                create: buildTransactionTagWrites(transaction.workspaceId, payload.tags),
              },
      },
      include: {
        splitBill: {
          select: {
            id: true,
            title: true,
          },
        },
        transactionTags: {
          select: {
            tag: {
              select: {
                id: true,
                name: true,
              },
            },
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

    if (payload.merchantRaw || payload.merchantClean || payload.categoryId !== undefined || payload.type !== undefined || payload.isTransfer !== undefined) {
      const rawMerchantText = payload.merchantRaw || updated.merchantRaw || transaction.merchantRaw;
      const normalizedMerchantName = payload.merchantClean || updated.merchantClean || rawMerchantText;
      const merchantText = rawMerchantText || normalizedMerchantName;

      if (merchantText && categoryForRule) {
        // Await durable workspace learning before returning. Fire-and-forget
        // writes can be terminated when a serverless request completes.
        await recordTrainingSignal({
          workspaceId: transaction.workspaceId,
          transactionId: transaction.id,
          merchantText,
          normalizedName: normalizedMerchantName,
          institution: account?.institution ?? null,
          categoryId: categoryForRule.id,
          categoryName: categoryForRule.name,
          type: resolvedType,
          source: "manual_recategorization",
          confidence: 100,
          notes: payload.categoryId ? "Manual transaction edit from the transaction editor." : "Manual merchant label edit from the transaction editor.",
          actorUserId: userId,
          fieldName:
            payload.categoryId !== undefined
              ? "category"
              : payload.merchantClean !== undefined || payload.merchantRaw !== undefined
                ? "merchant"
                : payload.type !== undefined || payload.isTransfer !== undefined
                  ? "type"
                  : null,
          previousValue:
            payload.categoryId !== undefined
              ? transaction.categoryId
              : payload.merchantClean !== undefined || payload.merchantRaw !== undefined
                ? transaction.merchantClean ?? transaction.merchantRaw
                : transaction.type,
          correctedValue:
            payload.categoryId !== undefined
              ? updated.categoryId
              : payload.merchantClean !== undefined || payload.merchantRaw !== undefined
                ? updated.merchantClean ?? updated.merchantRaw
                : updated.type,
        });
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
          tagCount: updated.transactionTags.length,
        },
      },
    });

    await recordAdviserActionCompletion({
      workspaceId: transaction.workspaceId,
      actorUserId: userId,
      group: "cleanup",
      itemId: transaction.id,
      label: "Updated transaction",
      sourceAction: "transaction_updated",
      href: `/transactions?transactionId=${transaction.id}`,
      pathname: "/transactions",
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

    revalidateTag("admin-financial-totals");

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
        normalizedPayload: updated.normalizedPayload,
        createdAt: updated.createdAt.toISOString(),
        updatedAt: updated.updatedAt.toISOString(),
        splitBill: updated.splitBill,
        tags: updated.transactionTags.map((entry) => ({
          id: entry.tag.id,
          name: entry.tag.name,
        })),
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
      include: {
        account: {
          select: {
            source: true,
          },
        },
      },
    });

    if (!transaction) {
      return NextResponse.json({ error: "Transaction not found" }, { status: 404 });
    }

    await assertWorkspaceAccess(userId, transaction.workspaceId);

    const hasStatementCheckpoints = await hasCompatibleTable("AccountStatementCheckpoint");
    const removedAccountIds = await prisma.$transaction(async (tx) => {
      await tx.transaction.update({
        where: { id: transactionId },
        data: {
          deletedAt: new Date(),
        },
      });

      // Imported balances are derived from their remaining source rows. Manual
      // account balances are user-entered evidence and must not be erased when
      // an individual transaction is removed.
      if (transaction.account.source === "upload") {
        await tx.account.updateMany({
          where: { id: transaction.accountId },
          data: {
            balance: null,
          },
        });
      }

      if (hasStatementCheckpoints) {
        await tx.accountStatementCheckpoint.updateMany({
          where: {
            accountId: transaction.accountId,
            ...(transaction.importFileId ? { importFileId: transaction.importFileId } : {}),
          },
          data: {
            status: "mismatch",
            mismatchReason: "A transaction from this statement was deleted by the user.",
          },
        });
      }

      return removeEmptyNonDefaultCashAccounts(tx, {
        workspaceId: transaction.workspaceId,
        accountIds: [transaction.accountId],
        actorUserId: userId,
      });
    });

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

    await recordAdviserActionCompletion({
      workspaceId: transaction.workspaceId,
      actorUserId: userId,
      group: "cleanup",
      itemId: transaction.id,
      label: "Deleted transaction",
      sourceAction: "transaction_deleted",
      href: "/transactions",
      pathname: "/transactions",
    });

    void capturePostHogServerEvent("transaction_deleted", userId, {
      workspace_id: transaction.workspaceId,
      transaction_id: transaction.id,
      amount: Number(transaction.amount),
      currency: transaction.currency,
      transaction_type: transaction.type,
    });

    revalidateTag("admin-financial-totals");

    return NextResponse.json({ ok: true, removedAccountIds });
  } catch {
    return NextResponse.json({ error: "Unable to delete transaction" }, { status: 400 });
  }
}
