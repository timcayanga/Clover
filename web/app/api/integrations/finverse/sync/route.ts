import { AccountType, Prisma, TransactionType } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertWorkspaceAccess } from "@/lib/workspace-access";
import {
  decryptFinverseToken,
  encryptFinverseToken,
  getAllFinverseTransactions,
  getFinverseAccounts,
  getFinverseConfig,
  getFinverseLoginIdentity,
  isFinverseDataReady,
  normalizeFinverseAccount,
  normalizeFinverseTransaction,
  refreshFinverseToken,
  type FinverseAccount,
  type FinverseTransaction,
} from "@/lib/finverse";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const json = (value: unknown) => value as Prisma.InputJsonValue;

const getActiveToken = async (connection: {
  id: string;
  encryptedAccessToken: string | null;
  encryptedRefreshToken: string | null;
  accessTokenExpiresAt: Date | null;
}) => {
  const config = getFinverseConfig();
  if (connection.encryptedAccessToken && (connection.accessTokenExpiresAt?.getTime() ?? 0) > Date.now() + 5 * 60_000) {
    return decryptFinverseToken(connection.encryptedAccessToken, config.encryptionKey);
  }
  if (!connection.encryptedRefreshToken) throw new Error("FINVERSE_RELINK_REQUIRED");
  const currentRefreshToken = decryptFinverseToken(connection.encryptedRefreshToken, config.encryptionKey);
  const refreshed = await refreshFinverseToken(currentRefreshToken);
  await prisma.finverseConnection.update({
    where: { id: connection.id },
    data: {
      encryptedAccessToken: encryptFinverseToken(refreshed.access_token, config.encryptionKey),
      encryptedRefreshToken: encryptFinverseToken(refreshed.refresh_token || currentRefreshToken, config.encryptionKey),
      accessTokenExpiresAt: new Date(Date.now() + Math.max(60, refreshed.expires_in) * 1000),
    },
  });
  return refreshed.access_token;
};

const importAccount = async (
  connectionId: string,
  workspaceId: string,
  account: FinverseAccount,
  institutionName?: string,
) => {
  const existing = await prisma.finverseAccountLink.findUnique({
    where: { connectionId_externalAccountId: { connectionId, externalAccountId: account.account_id } },
  });
  const normalized = normalizeFinverseAccount(account, institutionName);

  if (existing) {
    await prisma.finverseAccountLink.update({
      where: { id: existing.id },
      data: { rawPayload: json(account), normalizedPayload: json(normalized), lastSeenAt: new Date() },
    });
    if (existing.accountId && normalized.balance != null) {
      await prisma.account.updateMany({
        where: { id: existing.accountId, workspaceId },
        data: { balance: normalized.balance },
      });
    }
    return existing.accountId;
  }

  return prisma.$transaction(async (tx) => {
    const created = await tx.account.create({
      data: {
        workspaceId,
        name: normalized.name,
        institution: normalized.institution,
        accountNumber: normalized.accountNumber,
        type: normalized.type as AccountType,
        currency: normalized.currency,
        source: "finverse",
        balance: normalized.balance,
      },
      select: { id: true },
    });
    await tx.finverseAccountLink.create({
      data: {
        connectionId,
        workspaceId,
        externalAccountId: account.account_id,
        accountId: created.id,
        rawPayload: json(account),
        normalizedPayload: json(normalized),
      },
    });
    return created.id;
  });
};

const importTransaction = async (
  connectionId: string,
  workspaceId: string,
  transaction: FinverseTransaction,
) => {
  const normalized = normalizeFinverseTransaction(transaction);
  if (!normalized) return "skipped" as const;
  const existing = await prisma.finverseTransactionRecord.findUnique({
    where: { connectionId_externalTransactionId: { connectionId, externalTransactionId: transaction.transaction_id } },
  });
  const normalizedJson = { ...normalized, date: normalized.date.toISOString() };
  if (existing) {
    await prisma.finverseTransactionRecord.update({
      where: { id: existing.id },
      data: { rawPayload: json(transaction), normalizedPayload: json(normalizedJson), lastSeenAt: new Date() },
    });
    return "existing" as const;
  }

  const accountLink = await prisma.finverseAccountLink.findUnique({
    where: { connectionId_externalAccountId: { connectionId, externalAccountId: transaction.account_id } },
  });
  if (!accountLink?.accountId) return "skipped" as const;

  await prisma.$transaction(async (tx) => {
    const created = await tx.transaction.create({
      data: {
        workspaceId,
        accountId: accountLink.accountId!,
        reviewStatus: "suggested",
        reviewPriority: transaction.is_pending ? "medium" : "none",
        reviewReasons: transaction.is_pending ? json(["finverse_pending_transaction"]) : undefined,
        parserConfidence: 100,
        categoryConfidence: 0,
        accountMatchConfidence: 100,
        rawPayload: json(transaction),
        normalizedPayload: json(normalizedJson),
        sourceRowKey: `finverse:${transaction.transaction_id}`,
        date: normalized.date,
        amount: normalized.amount,
        currency: normalized.currency,
        type: normalized.type as TransactionType,
        merchantRaw: normalized.merchantRaw,
        merchantClean: normalized.merchantClean,
        description: normalized.description,
      },
      select: { id: true },
    });
    await tx.finverseTransactionRecord.create({
      data: {
        connectionId,
        externalTransactionId: transaction.transaction_id,
        externalAccountId: transaction.account_id,
        transactionId: created.id,
        rawPayload: json(transaction),
        normalizedPayload: json(normalizedJson),
      },
    });
  });
  return "created" as const;
};

export async function POST(request: Request) {
  try {
    const { userId } = await requireAuth();
    const body = await request.json().catch(() => ({})) as { workspaceId?: string; connectionId?: string };
    if (!body.workspaceId) return NextResponse.json({ error: "Workspace is required." }, { status: 400 });
    await assertWorkspaceAccess(userId, body.workspaceId);
    const connection = await prisma.finverseConnection.findFirst({
      where: {
        workspaceId: body.workspaceId,
        ...(body.connectionId ? { id: body.connectionId } : {}),
        user: { clerkUserId: userId },
        encryptedRefreshToken: { not: null },
      },
      orderBy: { createdAt: "desc" },
    });
    if (!connection) return NextResponse.json({ error: "No connected bank was found." }, { status: 404 });

    const token = await getActiveToken(connection);
    const identityResult = await getFinverseLoginIdentity(token);
    const identity = identityResult.login_identity ?? {};
    const status = typeof identity.status === "string" ? identity.status : "UNKNOWN";
    const institution = identityResult.institution ?? {};
    const institutionName = typeof institution.institution_name === "string" ? institution.institution_name : undefined;
    const institutionId = typeof institution.institution_id === "string" ? institution.institution_id : undefined;

    await prisma.finverseConnection.update({
      where: { id: connection.id },
      data: {
        status: status === "ERROR" ? "error" : isFinverseDataReady(status) ? "ready" : "retrieving",
        institutionId,
        institutionName,
        rawLoginIdentity: json(identityResult),
        syncError: status === "ERROR" ? "Finverse could not retrieve data from this institution." : null,
      },
    });
    if (status === "ERROR") return NextResponse.json({ error: "Finverse could not retrieve data from this institution.", status }, { status: 422 });
    if (!isFinverseDataReady(status)) return NextResponse.json({ status: "retrieving", providerStatus: status });

    const accountResult = await getFinverseAccounts(token);
    const resolvedInstitutionName = institutionName || (typeof accountResult.institution?.institution_name === "string" ? accountResult.institution.institution_name : undefined);
    for (const account of accountResult.accounts ?? []) {
      await importAccount(connection.id, connection.workspaceId, account, resolvedInstitutionName);
    }

    const providerTransactions = await getAllFinverseTransactions(token);
    let imported = 0;
    let existing = 0;
    let skipped = 0;
    for (const transaction of providerTransactions) {
      const result = await importTransaction(connection.id, connection.workspaceId, transaction);
      if (result === "created") imported += 1;
      else if (result === "existing") existing += 1;
      else skipped += 1;
    }
    await prisma.finverseConnection.update({
      where: { id: connection.id },
      data: { status: "ready", lastSyncedAt: new Date(), syncError: null },
    });
    return NextResponse.json({
      status: "ready",
      connectionId: connection.id,
      accounts: accountResult.accounts?.length ?? 0,
      transactions: { imported, existing, skipped },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "UNAUTHORIZED") return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
    if (message === "WORKSPACE_NOT_FOUND") return NextResponse.json({ error: "Workspace not found." }, { status: 404 });
    if (message === "FINVERSE_NOT_CONFIGURED") return NextResponse.json({ error: "Bank connections are not configured yet." }, { status: 503 });
    if (message === "FINVERSE_RELINK_REQUIRED") return NextResponse.json({ error: "This bank needs to be connected again." }, { status: 409 });
    console.error("Finverse sync failed", error);
    return NextResponse.json({ error: "Unable to sync the connected bank right now." }, { status: 502 });
  }
}
