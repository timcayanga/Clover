import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isLocalDevHost, requireAuth } from "@/lib/auth";
import { assertWorkspaceAccess } from "@/lib/workspace-access";
import { buildTransactionQueryWhere } from "@/lib/transaction-query";
import { normalizeImportedAccountKey } from "@/lib/workspace-cache";

export const dynamic = "force-dynamic";

const resolveAccountTransactionsRouteUserId = async () => {
  if (await isLocalDevHost()) {
    return "local-admin";
  }

  const { userId } = await requireAuth();
  return userId;
};

type TransactionApiRow = {
  id: string;
  accountId: string;
  categoryId: string | null;
  amount: string;
  type: "income" | "expense" | "transfer";
  date: string;
  merchantRaw: string;
  merchantClean: string | null;
  categoryName: string | null;
  description: string | null;
  isExcluded: boolean;
  importFileId: string | null;
  source: string;
};

const mapTransactionRow = (transaction: {
  id: string;
  accountId: string;
  date: Date;
  amount: Prisma.Decimal | bigint | number | string;
  type: "income" | "expense" | "transfer";
  merchantRaw: string;
  merchantClean: string | null;
  rawPayload: Prisma.JsonValue;
  category: { id: string; name: string } | null;
  description: string | null;
  isExcluded: boolean;
  importFileId: string | null;
}): TransactionApiRow => ({
  id: transaction.id,
  accountId: transaction.accountId,
  categoryId: transaction.category?.id ?? null,
  amount: transaction.amount.toString(),
  type: transaction.type,
  date: transaction.date.toISOString(),
  merchantRaw: transaction.merchantRaw,
  merchantClean: transaction.merchantClean,
  categoryName: transaction.category?.name ?? getRawPayloadCategoryName(transaction.rawPayload) ?? null,
  description: transaction.description,
  isExcluded: transaction.isExcluded,
  importFileId: transaction.importFileId,
  source: transaction.importFileId ? "upload" : "manual",
});

const getRawPayloadCategoryName = (rawPayload: Prisma.JsonValue | null | undefined) => {
  if (!rawPayload || typeof rawPayload !== "object" || Array.isArray(rawPayload)) {
    return null;
  }

  const payload = rawPayload as Record<string, unknown>;
  const candidate = payload.categoryName ?? payload.category ?? payload.normalizedCategory;
  return typeof candidate === "string" && candidate.trim() ? candidate.trim() : null;
};

const getLastFourDigits = (value?: string | null) => {
  if (!value) {
    return null;
  }

  const digits = String(value).replace(/\D/g, "");
  return digits.length >= 4 ? digits.slice(-4) : null;
};

export async function GET(request: Request, { params }: { params: Promise<{ accountId: string }> }) {
  try {
    const userId = await resolveAccountTransactionsRouteUserId();
    const { accountId } = await params;
    const { searchParams } = new URL(request.url);

    const account = await prisma.account.findUnique({
      where: { id: accountId },
      select: { id: true, workspaceId: true, name: true, institution: true, type: true, accountNumber: true },
    });

    if (!account) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    await assertWorkspaceAccess(userId, account.workspaceId);

    const page = Math.max(1, Number(searchParams.get("page") ?? "1") || 1);
    const pageSize = Math.max(1, Number(searchParams.get("pageSize") ?? "25") || 25);
    const identityKey = normalizeImportedAccountKey(account.name, account.institution, account.accountNumber, account.type);
    const accountLastFour = getLastFourDigits(account.accountNumber ?? account.name);
    const siblingAccounts = await prisma.account.findMany({
      where: {
        workspaceId: account.workspaceId,
        deletedAt: null,
      },
      select: {
        id: true,
        name: true,
        institution: true,
        type: true,
        accountNumber: true,
      },
    });
    const accountIds = siblingAccounts
      .filter((candidate) => {
        const candidateKey = normalizeImportedAccountKey(
          candidate.name,
          candidate.institution,
          candidate.accountNumber,
          candidate.type
        );
        const candidateLastFour = getLastFourDigits(candidate.accountNumber ?? candidate.name);

        return (
          candidate.id === accountId ||
          candidateKey === identityKey ||
          Boolean(
            account.institution &&
              candidate.institution &&
              account.institution.trim().toLowerCase() === candidate.institution.trim().toLowerCase() &&
              accountLastFour &&
              candidateLastFour &&
              accountLastFour === candidateLastFour
          )
        );
      })
      .map((candidate) => candidate.id);
    const where = buildTransactionQueryWhere(account.workspaceId, { accountIds });
    const skip = (page - 1) * pageSize;

    const [totalCount, rows] = await Promise.all([
      prisma.transaction.count({ where }),
      prisma.transaction.findMany({
        where,
        select: {
          id: true,
          accountId: true,
          date: true,
          amount: true,
          type: true,
          merchantRaw: true,
          merchantClean: true,
          rawPayload: true,
          description: true,
          isExcluded: true,
          category: {
            select: {
              id: true,
              name: true,
            },
          },
          importFileId: true,
        },
        orderBy: [{ date: "desc" }, { createdAt: "desc" }],
        skip,
        take: pageSize,
      }),
    ]);

    return NextResponse.json({
      transactions: rows.map(mapTransactionRow),
      page,
      pageSize,
      totalCount,
      hasMore: skip + rows.length < totalCount,
    });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
