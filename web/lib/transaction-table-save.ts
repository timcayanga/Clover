import { createHash } from "node:crypto";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { EntrySaveError } from "./adviser-entry-save";
import { getEffectiveUserLimits } from "./user-limits";
import {
  normalizeTransactionTagKey,
  sanitizeTransactionTagNames,
} from "./transaction-tags";
import { tableRowIssues } from "../../shared/transaction-table";
const value = z.string().max(500),
  id = z.string().max(128);
export const transactionTableSchema = z
  .object({
    id: z.string().uuid(),
    workspaceId: id.min(1),
    duplicatesAcknowledged: z.boolean().default(false),
    rows: z
      .array(
        z
          .object({
            key: id.min(1),
            date: z.string().max(10),
            merchant: value,
            type: z.enum(["expense", "income", "transfer"]),
            accountId: id,
            categoryId: id,
            amount: z.string().max(24),
            currency: z.string().max(3),
            destinationAccountId: id,
            tags: value,
            notes: value,
          })
          .strict(),
      )
      .min(1)
      .max(50),
  })
  .strict();
export type TransactionTableBatch = z.infer<typeof transactionTableSchema>;
export async function commitTransactionTable(
  database: typeof prisma,
  batch: TransactionTableBatch,
  actorUserId: string,
) {
  const auditId =
    "table_" +
    createHash("sha256")
      .update(`${actorUserId}:${batch.workspaceId}:${batch.id}`)
      .digest("hex");
  const hash = createHash("sha256").update(JSON.stringify(batch)).digest("hex");
  return database.$transaction(
    async (tx) => {
      const workspace = await tx.workspace.findUnique({
        where: { id: batch.workspaceId },
        include: { user: true },
      });
      if (!workspace || workspace.userId !== actorUserId)
        throw new EntrySaveError("This Profile is unavailable.", 403);
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`adviser-entry-owner:${actorUserId}`}, 0))`;
      const previous = await tx.auditLog.findUnique({ where: { id: auditId } });
      if (previous) {
        const meta = previous.metadata as { hash: string; count: number };
        if (meta.hash !== hash)
          throw new EntrySaveError(
            "This batch has already been saved. Start a new batch.",
            409,
          );
        return { count: meta.count, alreadyCompleted: true };
      }
      if (new Set(batch.rows.map((r) => r.key)).size !== batch.rows.length)
        throw new EntrySaveError("Each row must have a unique identifier.");
      const [accounts, categories] = await Promise.all([
        tx.account.findMany({
          where: { workspaceId: batch.workspaceId },
          select: { id: true, name: true, currency: true, type: true },
        }),
        tx.category.findMany({
          where: { workspaceId: batch.workspaceId, isArchived: false },
          select: { id: true, name: true, type: true },
        }),
      ]);
      for (const [index, row] of batch.rows.entries()) {
        const issues = tableRowIssues(row, { accounts, categories });
        if (Object.keys(issues).length)
          throw new EntrySaveError(
            `Row ${index + 1}: ${Object.values(issues).join(" ")}`,
          );
      }
      if (!batch.duplicatesAcknowledged) {
        const existing = await tx.transaction.findMany({
          where: {
            workspaceId: batch.workspaceId,
            deletedAt: null,
            OR: batch.rows.map((r) => ({
              accountId: r.accountId,
              date: new Date(r.date + "T00:00:00.000Z"),
              amount: new Prisma.Decimal(r.amount),
              currency: r.currency,
              type: r.type,
              merchantRaw: {
                equals: r.merchant.trim(),
                mode: "insensitive" as const,
              },
            })),
          },
          select: { id: true },
          take: 1,
        });
        if (existing.length)
          throw new EntrySaveError(
            "Possible duplicates match transactions already in this Profile. Review the batch and confirm these are intentional before saving.",
            409,
          );
      }
      const count = batch.rows.reduce(
        (n, r) => n + (r.type === "transfer" ? 2 : 1),
        0,
      );
      const limits = getEffectiveUserLimits(workspace.user);
      if (
        limits.transactionLimit !== null &&
        (await tx.transaction.count({
          where: { workspace: { userId: actorUserId } },
        })) +
          count >
          limits.transactionLimit
      )
        throw new EntrySaveError(
          "This batch would exceed your transaction limit.",
          403,
        );
      for (const row of batch.rows) {
        const transfer = row.type === "transfer";
        const transferId = `${batch.id}:${row.key}`;
        const categoryId = transfer
          ? (categories.find((c) => c.name.toLowerCase() === "transfers")?.id ??
            null)
          : row.categoryId;
        const tags = sanitizeTransactionTagNames(row.tags.split(","));
        for (const direction of transfer
          ? (["out", "in"] as const)
          : (["out"] as const)) {
          const source = {
            source: transfer ? "manual_transfer" : "manual_table",
            batchId: batch.id,
            rowKey: row.key,
            ...(transfer
              ? {
                  manualTransferId: transferId,
                  sourceAccountId: row.accountId,
                  destinationAccountId: row.destinationAccountId,
                  transferDirection: direction,
                  amountDelta:
                    (direction === "out" ? -1 : 1) * Number(row.amount),
                }
              : {}),
          };
          await tx.transaction.create({
            data: {
              workspaceId: batch.workspaceId,
              accountId:
                direction === "in" ? row.destinationAccountId : row.accountId,
              categoryId,
              date: new Date(row.date + "T00:00:00.000Z"),
              amount: new Prisma.Decimal(row.amount),
              currency: row.currency,
              type: row.type,
              merchantRaw: row.merchant.trim(),
              merchantClean: row.merchant.trim(),
              description: row.notes || null,
              isTransfer: transfer,
              reviewStatus: "confirmed",
              parserConfidence: 100,
              categoryConfidence: categoryId ? 100 : 0,
              accountMatchConfidence: 100,
              transferConfidence: transfer ? 100 : 0,
              rawPayload: source,
              normalizedPayload: {
                ...source,
                type: row.type,
                confirmedByUser: true,
              },
              learnedRuleIdsApplied: [],
              transactionTags: tags.length
                ? {
                    create: tags.map((name) => ({
                      tag: {
                        connectOrCreate: {
                          where: {
                            workspaceId_normalizedName: {
                              workspaceId: batch.workspaceId,
                              normalizedName: normalizeTransactionTagKey(name),
                            },
                          },
                          create: {
                            workspaceId: batch.workspaceId,
                            name,
                            normalizedName: normalizeTransactionTagKey(name),
                          },
                        },
                      },
                    })),
                  }
                : undefined,
            },
          });
        }
      }
      await tx.auditLog.create({
        data: {
          id: auditId,
          workspaceId: batch.workspaceId,
          actorUserId,
          action: "transactions.table_confirmed",
          entity: "TransactionBatch",
          entityId: batch.id,
          metadata: { hash, count, rows: batch.rows.length },
        },
      });
      return { count, alreadyCompleted: false };
    },
    { timeout: 20000, maxWait: 10000 },
  );
}
