import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authorizeReports, reportResponse } from "@/lib/reports-authorization";
import { assertTrustedRequestOrigin } from "@/lib/request-security";
import { buildActiveWorkspaceTransactionWhere } from "@/lib/transaction-query";
import {
  reportTransactionSelect,
  normalizeReportRows,
} from "@/lib/report-rows";
import { normalizeRegionalPreferences } from "@/lib/regional-preferences";
import { recoveryIssue } from "../../../../../shared/reports/recoveries";
export const dynamic = "force-dynamic";
const id = z.string().min(1).max(128);
const input = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("create"),
      expenseId: id,
      incomingId: id,
      kind: z.enum(["refund", "reimbursement"]),
      amount: z.number().finite().positive().max(1e12).multipleOf(0.01),
    })
    .strict(),
  z.object({ action: z.literal("delete"), id }).strict(),
]);
export async function GET(request: Request) {
  try {
    const { user, workspaceId } = await authorizeReports(request);
    const p = new URL(request.url).searchParams;
    const type = z.enum(["expense", "income"]).parse(p.get("type"));
    const currency = z
      .string()
      .regex(/^[A-Z]{3}$/)
      .parse(p.get("currency"));
    const query = z
      .string()
      .max(120)
      .parse(p.get("q") ?? "")
      .trim();
    const skip = z.coerce
      .number()
      .int()
      .min(0)
      .max(1000000)
      .parse(p.get("offset") ?? 0);
    const where = buildActiveWorkspaceTransactionWhere(workspaceId, {
      currency,
    });
    const records = await prisma.transaction.findMany({
      where: {
        AND: [
          where,
          { workspaceId, type, isTransfer: false },
          ...(query
            ? [
                {
                  OR: [
                    {
                      merchantRaw: {
                        contains: query,
                        mode: "insensitive" as const,
                      },
                    },
                    {
                      merchantClean: {
                        contains: query,
                        mode: "insensitive" as const,
                      },
                    },
                    {
                      account: {
                        name: { contains: query, mode: "insensitive" as const },
                      },
                    },
                  ],
                },
              ]
            : []),
        ],
      },
      select: reportTransactionSelect(workspaceId),
      orderBy: [{ date: "desc" }, { id: "asc" }],
      skip,
      take: 21,
    });
    const ids = records.slice(0, 20).map((r) => r.id);
    const allocations = await prisma.reportRecovery.findMany({
      where: {
        workspaceId,
        OR: [{ expenseId: { in: ids } }, { incomingId: { in: ids } }],
      },
      select: { expenseId: true, incomingId: true, amount: true },
    });
    const regional = await prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      select: { regionalPreferences: true },
    });
    const { timeZone } = normalizeRegionalPreferences(
      regional.regionalPreferences,
    );
    const rows = normalizeReportRows(records.slice(0, 20), timeZone).filter(
      (r) => r.type === type,
    );
    return reportResponse({
      candidates: rows
        .map((r) => ({
          id: r.id,
          name: r.merchant,
          date: r.date,
          amount: r.amount,
          available: Math.max(
            0,
            Math.round(
              r.amount * 100 -
                allocations
                  .filter((a) => a.expenseId === r.id || a.incomingId === r.id)
                  .reduce((n, a) => n + Math.round(Number(a.amount) * 100), 0),
            ) / 100,
          ),
          account: r.account,
          currency: r.currency,
        }))
        .filter((r) => r.available > 0),
      nextOffset: records.length > 20 ? skip + 20 : null,
    });
  } catch {
    return reportResponse(
      { error: "Unable to find transactions for this Profile." },
      400,
    );
  }
}
export async function POST(request: Request) {
  try {
    assertTrustedRequestOrigin(request);
    const { user, workspaceId, isGuest } = await authorizeReports(request);
    if (isGuest)
      return reportResponse({ error: "Sign in to link a payment." }, 403);
    const raw = await request.text();
    if (new TextEncoder().encode(raw).length > 4000)
      return reportResponse({ error: "Request is too large." }, 413);
    const data = input.parse(JSON.parse(raw));
    const regional = await prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      select: { regionalPreferences: true },
    });
    const { timeZone } = normalizeRegionalPreferences(
      regional.regionalPreferences,
    );
    const result = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Workspace" WHERE "id" = ${workspaceId} FOR UPDATE`;
      if (data.action === "delete") {
        const deleted = await tx.reportRecovery.deleteMany({
          where: { id: data.id, workspaceId },
        });
        return deleted.count
          ? { ok: true }
          : { error: "This link is no longer available." };
      }
      if (data.expenseId === data.incomingId)
        return { error: "Choose two different transactions." };
      await tx.$queryRaw`SELECT "id" FROM "Transaction" WHERE "workspaceId" = ${workspaceId} AND "id" IN (${data.expenseId}, ${data.incomingId}) ORDER BY "id" FOR UPDATE`;
      const records = await tx.transaction.findMany({
        where: {
          AND: [
            buildActiveWorkspaceTransactionWhere(workspaceId),
            { workspaceId, id: { in: [data.expenseId, data.incomingId] } },
          ],
        },
        select: reportTransactionSelect(workspaceId),
      });
      const rows = normalizeReportRows(records, timeZone),
        expense = rows.find((r) => r.id === data.expenseId),
        incoming = rows.find((r) => r.id === data.incomingId);
      const issue = recoveryIssue({ ...data, id: "new" }, expense, incoming);
      if (issue) return { error: issue };
      const existing = await tx.reportRecovery.findMany({
        where: {
          workspaceId,
          OR: [{ expenseId: data.expenseId }, { incomingId: data.incomingId }],
        },
      });
      if (
        existing.some(
          (r) =>
            r.expenseId === data.expenseId && r.incomingId === data.incomingId,
        )
      )
        return {
          error:
            "These transactions are already linked. Remove that link before changing it.",
        };
      const cents = Math.round(data.amount * 100);
      const expenseUsed = existing
        .filter((r) => r.expenseId === data.expenseId)
        .reduce((n, r) => n + Math.round(Number(r.amount) * 100), 0);
      const incomingUsed = existing
        .filter((r) => r.incomingId === data.incomingId)
        .reduce((n, r) => n + Math.round(Number(r.amount) * 100), 0);
      if (
        cents + expenseUsed > Math.round(expense!.amount * 100) ||
        cents + incomingUsed > Math.round(incoming!.amount * 100)
      )
        return {
          error:
            "This amount exceeds the unlinked expense or payment balance. Refresh and choose a smaller amount.",
        };
      await tx.reportRecovery.create({
        data: {
          workspaceId,
          expenseId: data.expenseId,
          incomingId: data.incomingId,
          kind: data.kind,
          amount: data.amount,
        },
      });
      return { ok: true };
    });
    return reportResponse(result, "error" in result ? 409 : 200);
  } catch {
    return reportResponse(
      {
        error:
          "Unable to save this link. Check the transactions and amount, then try again.",
      },
      400,
    );
  }
}
