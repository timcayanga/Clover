import {
  normalizeTransactionTagKey,
  sanitizeTransactionTagNames,
} from "./transaction-tags";
import { createHash } from "node:crypto";
import { z } from "zod";
import { prisma } from "./prisma";
import { mobileCreateSchema } from "./mobile-edit-schema";
import { getEffectiveUserLimits } from "./user-limits";

const edit = z
  .object({
    merchantClean: z.string().trim().min(1).max(200).optional(),
    description: z.string().max(2000).optional(),
    tags: z.array(z.string().trim().min(1).max(64)).max(20).optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0);
export const offlineMutationSchema = z.discriminatedUnion("kind", [
  z
    .object({
      offlineEpoch: z.string().datetime().nullable().optional(),
      id: z.string().uuid(),
      kind: z.literal("create"),
      payload: mobileCreateSchema,
    })
    .strict(),
  z
    .object({
      offlineEpoch: z.string().datetime().nullable().optional(),
      id: z.string().uuid(),
      kind: z.literal("edit"),
      transactionId: z.string().min(1).max(100),
      baseVersion: z.string().datetime(),
      payload: edit,
    })
    .strict(),
]);
export async function applyMobileOfflineMutation(
  userId: string,
  workspaceId: string,
  input: unknown,
) {
  const operation = offlineMutationSchema.parse(input);
  const hash = createHash("sha256")
    .update(JSON.stringify(operation))
    .digest("hex");
  const result = await prisma.$transaction(async (tx) => {
    // Serialize receipt + financial mutation, including concurrent retries/devices.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${userId}, 0))`;
    const workspace = await tx.workspace.findFirst({
      where: { id: workspaceId, user: { clerkUserId: userId } },
      select: { userId: true, user: { select: { dataWipedAt: true } } },
    });
    if (!workspace)
      return {
        status: 403,
        body: { error: "This Profile is no longer available." },
      };
    if (
      (workspace.user.dataWipedAt?.toISOString() ?? null) !==
      (operation.offlineEpoch ?? null)
    )
      return {
        status: 409,
        body: {
          error:
            "Your Clover data was reset after this draft was saved. This old change will not be restored.",
        },
      };
    const previous = await tx.mobileOfflineMutation.findUnique({
      where: {
        userId_operationId: {
          userId: workspace.userId,
          operationId: operation.id,
        },
      },
    });
    if (previous)
      return previous.workspaceId === workspaceId &&
        previous.requestHash === hash
        ? { status: 200, body: previous.result }
        : {
            status: 409,
            body: {
              error: "This change ID was already used for a different edit.",
            },
          };
    let transactionId: string;
    if (operation.kind === "create") {
      const p = operation.payload;
      if (Number(p.amount) <= 0 || p.type === "transfer")
        return {
          status: 400,
          body: {
            error:
              "Use a positive income or expense amount. Create linked transfers online.",
          },
        };
      const account = await tx.account.findFirst({
        where: { id: p.accountId, workspaceId, type: { not: "investment" } },
        select: { id: true, currency: true },
      });
      if (!account || account.currency !== p.currency)
        return {
          status: 400,
          body: {
            error: "Choose a matching-currency account in this Profile.",
          },
        };
      if (
        p.categoryId &&
        !(await tx.category.findFirst({
          where: { id: p.categoryId, workspaceId, isArchived: false, type: p.type },
          select: { id: true },
        }))
      )
        return {
          status: 400,
          body: { error: "This category is no longer available." },
        };
      const owner = await tx.user.findUniqueOrThrow({
        where: { id: workspace.userId },
      });
      const limit = getEffectiveUserLimits(owner).transactionLimit;
      if (
        limit !== null &&
        (await tx.transaction.count({
          where: { workspace: { userId: owner.id }, deletedAt: null },
        })) >= limit
      )
        return {
          status: 403,
          body: {
            error:
              "Your transaction allowance is full. Your pending entry remains on this device.",
          },
        };
      const row = await tx.transaction.create({
        data: {
          workspaceId,
          accountId: p.accountId,
          categoryId: p.categoryId,
          date: new Date(p.date),
          amount: p.amount,
          currency: p.currency,
          type: p.type,
          merchantRaw: p.merchantRaw,
          merchantClean: p.merchantRaw,
          description: p.description ?? null,
          isTransfer: false,
          reviewStatus: "confirmed",
          parserConfidence: 100,
          categoryConfidence: p.categoryId ? 100 : 0,
          accountMatchConfidence: 100,
          rawPayload: {
            source: "manual",
            ...p,
            offlineOperationId: operation.id,
          },
          normalizedPayload: { source: "manual", confirmedByUser: true },
        },
        select: { id: true },
      });
      transactionId = row.id;
    } else {
      const current = await tx.transaction.findFirst({
        where: { id: operation.transactionId, workspaceId, deletedAt: null },
        select: {
          id: true,
          updatedAt: true,
          merchantClean: true,
          description: true,
          transactionTags: { select: { tag: { select: { name: true } } } },
        },
      });
      if (!current)
        return {
          status: 409,
          body: {
            error:
              "This transaction was removed. Your edit has not been applied.",
            current: null,
          },
        };
      if (current.updatedAt.toISOString() !== operation.baseVersion)
        return {
          status: 409,
          body: {
            error:
              "This transaction changed elsewhere. Review both versions before syncing.",
            current: {
              id: current.id,
              updatedAt: current.updatedAt.toISOString(),
              merchantClean: current.merchantClean,
              description: current.description,
              tags: current.transactionTags.map((t) => t.tag.name),
            },
          },
        };
      const { tags: _tags, ...fields } = operation.payload;
      const updated = await tx.transaction.updateMany({
        where: {
          id: current.id,
          workspaceId,
          updatedAt: new Date(operation.baseVersion),
          deletedAt: null,
        },
        data: {
          ...fields,
          reviewStatus: "edited",
          updatedAt: new Date(
            Math.max(Date.now(), current.updatedAt.getTime() + 1),
          ),
        },
      });
      if (updated.count !== 1)
        return {
          status: 409,
          body: {
            error:
              "This transaction changed while syncing. Refresh and review it again.",
          },
        };
      transactionId = current.id;
    }
    if (operation.payload.tags) {
      await tx.transactionTag.deleteMany({ where: { transactionId } });
      for (const name of sanitizeTransactionTagNames(operation.payload.tags)) {
        const tag = await tx.tag.upsert({
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
          update: {},
        });
        await tx.transactionTag.createMany({
          data: [{ transactionId, tagId: tag.id }],
          skipDuplicates: true,
        });
      }
    }
    const row = await tx.transaction.findUniqueOrThrow({
      where: { id: transactionId },
      select: {
        id: true,
        workspaceId: true,
        accountId: true,
        date: true,
        amount: true,
        currency: true,
        type: true,
        categoryId: true,
        isTransfer: true,
        isExcluded: true,
        merchantRaw: true,
        merchantClean: true,
        description: true,
        reviewStatus: true,
        updatedAt: true,
        account: { select: { name: true } },
        category: { select: { name: true } },
        transactionTags: {
          select: { tag: { select: { id: true, name: true } } },
        },
      },
    });
    const body = {
      transaction: {
        ...row,
        amount: row.amount.toString(),
        date: row.date.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
        accountName: row.account.name,
        categoryName: row.category?.name ?? null,
        tags: row.transactionTags.map((t) => t.tag),
      },
    };
    const json = JSON.parse(JSON.stringify(body));
    await tx.mobileOfflineMutation.create({
      data: {
        userId: workspace.userId,
        workspaceId,
        operationId: operation.id,
        requestHash: hash,
        result: json,
      },
    });
    await tx.auditLog.create({
      data: {
        workspaceId,
        actorUserId: userId,
        action: "offline_" + operation.kind,
        entity: "transaction",
        entityId: transactionId,
        metadata: {
          operationId: operation.id,
          fields: Object.keys(operation.payload),
          ...(operation.kind === "edit"
            ? { baseVersion: operation.baseVersion }
            : {}),
        },
      },
    });
    return { status: 200, body: json, committed: true, kind: operation.kind };
  });
  return result;
}
