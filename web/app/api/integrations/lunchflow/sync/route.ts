import { AccountType, Prisma, TransactionType } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertWorkspaceAccess } from "@/lib/workspace-access";
import {
  decryptLunchFlowToken,
  encryptLunchFlowToken,
  getLunchFlowAccounts,
  getLunchFlowBalance,
  getLunchFlowConfig,
  getLunchFlowTransactions,
  isLunchFlowEnabled,
  normalizeLunchFlowAccount,
  normalizeLunchFlowTransaction,
  refreshLunchFlowToken,
  type LunchFlowAccount,
  type LunchFlowTransaction,
} from "@/lib/lunch-flow";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const json = (value: unknown) => value as Prisma.InputJsonValue;

const getActiveToken = async (connection: {
  id: string;
  encryptedAccessToken: string | null;
  encryptedRefreshToken: string | null;
  accessTokenExpiresAt: Date | null;
}) => {
  const config = getLunchFlowConfig();
  if (connection.encryptedAccessToken && (connection.accessTokenExpiresAt?.getTime() ?? 0) > Date.now() + 5 * 60_000) {
    return decryptLunchFlowToken(connection.encryptedAccessToken, config.encryptionKey);
  }
  if (!connection.encryptedRefreshToken) throw new Error("LUNCHFLOW_RELINK_REQUIRED");
  const currentRefreshToken = decryptLunchFlowToken(connection.encryptedRefreshToken, config.encryptionKey);
  const refreshed = await refreshLunchFlowToken(currentRefreshToken);
  if (!refreshed.access_token) throw new Error("LUNCHFLOW_RELINK_REQUIRED");
  await prisma.lunchFlowConnection.update({
    where: { id: connection.id },
    data: {
      encryptedAccessToken: encryptLunchFlowToken(refreshed.access_token, config.encryptionKey),
      encryptedRefreshToken: refreshed.refresh_token
        ? encryptLunchFlowToken(refreshed.refresh_token, config.encryptionKey)
        : connection.encryptedRefreshToken,
      accessTokenExpiresAt: new Date(Date.now() + Math.max(60, refreshed.expires_in ?? 3600) * 1000),
    },
  });
  return refreshed.access_token;
};

const importAccount = async (
  connectionId: string,
  workspaceId: string,
  account: LunchFlowAccount,
  balance?: { amount?: number | string; currency?: string },
) => {
  const externalAccountId = String(account.id);
  const existing = await prisma.lunchFlowAccountLink.findUnique({
    where: { connectionId_externalAccountId: { connectionId, externalAccountId } },
    include: {
      account: {
        select: { nameCustomized: true, institutionCustomized: true, logoCustomized: true },
      },
    },
  });
  const normalized = normalizeLunchFlowAccount(account, balance);
  const rawPayload = { account, balance: balance ?? null };

  if (existing) {
    await prisma.lunchFlowAccountLink.update({
      where: { id: existing.id },
      data: {
        externalConnectionId: account.connection_id == null ? null : String(account.connection_id),
        rawPayload: json(rawPayload),
        normalizedPayload: json(normalized),
        lastSeenAt: new Date(),
      },
    });
    if (existing.accountId) {
      await prisma.account.updateMany({
        where: { id: existing.accountId, workspaceId },
        data: {
          ...(existing.account?.nameCustomized ? {} : { name: normalized.name }),
          ...(existing.account?.institutionCustomized ? {} : { institution: normalized.institution }),
          ...(existing.account?.logoCustomized ? {} : { logoUrl: normalized.logoUrl }),
          currency: normalized.currency,
          ...(normalized.balance == null || !Number.isFinite(normalized.balance) ? {} : { balance: normalized.balance }),
        },
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
        logoUrl: normalized.logoUrl,
        accountNumber: normalized.accountNumber,
        type: normalized.type as AccountType,
        currency: normalized.currency,
        source: "lunchflow",
        balance: normalized.balance != null && Number.isFinite(normalized.balance) ? normalized.balance : null,
      },
      select: { id: true },
    });
    await tx.lunchFlowAccountLink.create({
      data: {
        connectionId,
        workspaceId,
        externalAccountId,
        externalConnectionId: account.connection_id == null ? null : String(account.connection_id),
        accountId: created.id,
        rawPayload: json(rawPayload),
        normalizedPayload: json(normalized),
      },
    });
    return created.id;
  });
};

const importTransaction = async (
  connectionId: string,
  workspaceId: string,
  fallbackAccountId: string,
  transaction: LunchFlowTransaction,
) => {
  const externalTransactionId = String(transaction.id);
  const normalized = normalizeLunchFlowTransaction(transaction, fallbackAccountId);
  if (!normalized) return "skipped" as const;
  const existing = await prisma.lunchFlowTransactionRecord.findUnique({
    where: { connectionId_externalTransactionId: { connectionId, externalTransactionId } },
  });
  const normalizedJson = { ...normalized, date: normalized.date.toISOString() };
  if (existing) {
    await prisma.lunchFlowTransactionRecord.update({
      where: { id: existing.id },
      data: { rawPayload: json(transaction), normalizedPayload: json(normalizedJson), lastSeenAt: new Date() },
    });
    return "existing" as const;
  }

  const accountLink = await prisma.lunchFlowAccountLink.findUnique({
    where: {
      connectionId_externalAccountId: {
        connectionId,
        externalAccountId: normalized.externalAccountId,
      },
    },
  });
  if (!accountLink?.accountId) return "skipped" as const;

  await prisma.$transaction(async (tx) => {
    const created = await tx.transaction.create({
      data: {
        workspaceId,
        accountId: accountLink.accountId!,
        reviewStatus: "suggested",
        reviewPriority: normalized.isPending ? "medium" : "none",
        reviewReasons: normalized.isPending ? json(["lunchflow_pending_transaction"]) : undefined,
        parserConfidence: 100,
        categoryConfidence: 0,
        accountMatchConfidence: 100,
        rawPayload: json(transaction),
        normalizedPayload: json(normalizedJson),
        sourceRowKey: `lunchflow:${externalTransactionId}`,
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
    await tx.lunchFlowTransactionRecord.create({
      data: {
        connectionId,
        externalTransactionId,
        externalAccountId: normalized.externalAccountId,
        transactionId: created.id,
        rawPayload: json(transaction),
        normalizedPayload: json(normalizedJson),
      },
    });
  });
  return "created" as const;
};

export async function POST(request: Request) {
  if (!isLunchFlowEnabled()) {
    return NextResponse.json({ error: "Bank connections are not available yet." }, { status: 404 });
  }

  try {
    const { userId } = await requireAuth();
    const body = await request.json().catch(() => ({})) as { workspaceId?: string; connectionId?: string };
    if (!body.workspaceId) return NextResponse.json({ error: "Workspace is required." }, { status: 400 });
    await assertWorkspaceAccess(userId, body.workspaceId);
    const connection = await prisma.lunchFlowConnection.findFirst({
      where: {
        workspaceId: body.workspaceId,
        ...(body.connectionId ? { id: body.connectionId } : {}),
        user: { clerkUserId: userId },
        encryptedAccessToken: { not: null },
      },
    });
    if (!connection) return NextResponse.json({ error: "No connected bank was found." }, { status: 404 });

    const token = await getActiveToken(connection);
    const accountResult = await getLunchFlowAccounts(token);
    const accounts = accountResult.accounts ?? [];
    let imported = 0;
    let existing = 0;
    let skipped = 0;

    for (const account of accounts) {
      const externalAccountId = String(account.id);
      const balanceResult = await getLunchFlowBalance(token, externalAccountId).catch(() => ({ balance: undefined }));
      await importAccount(connection.id, connection.workspaceId, account, balanceResult.balance);
      const transactionResult = await getLunchFlowTransactions(token, externalAccountId);
      for (const transaction of transactionResult.transactions ?? []) {
        const result = await importTransaction(connection.id, connection.workspaceId, externalAccountId, transaction);
        if (result === "created") imported += 1;
        else if (result === "existing") existing += 1;
        else skipped += 1;
      }
    }

    await prisma.lunchFlowConnection.update({
      where: { id: connection.id },
      data: { status: "ready", lastSyncedAt: new Date(), syncError: null },
    });
    console.info("[lunchflow-sync] complete", {
      connectionId: connection.id,
      accountCount: accounts.length,
      importedTransactions: imported,
      existingTransactions: existing,
      skippedTransactions: skipped,
    });
    return NextResponse.json({
      status: "ready",
      connectionId: connection.id,
      accounts: accounts.length,
      transactions: { imported, existing, skipped },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "UNAUTHORIZED") return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
    if (message === "WORKSPACE_NOT_FOUND") return NextResponse.json({ error: "Workspace not found." }, { status: 404 });
    if (message === "LUNCHFLOW_DISABLED") return NextResponse.json({ error: "Bank connections are not available yet." }, { status: 404 });
    if (message === "LUNCHFLOW_NOT_CONFIGURED") return NextResponse.json({ error: "Bank connections are not configured yet." }, { status: 503 });
    if (message === "LUNCHFLOW_RELINK_REQUIRED") return NextResponse.json({ error: "This bank needs to be connected again." }, { status: 409 });
    console.error("Lunch Flow sync failed", error);
    return NextResponse.json({ error: "Unable to sync the connected bank right now." }, { status: 502 });
  }
}
