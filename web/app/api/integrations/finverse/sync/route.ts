import { refreshProAccess } from "@/lib/pro-access";
import { getActiveFinverseToken } from "@/lib/finverse-access-token";
import { bankLinkAllowance } from "@/lib/bank-link-usage";
import { matchingBankAccounts, bankTransactionMatches, bankLinkUsageIdentity, cleanBankNumber } from "@/lib/finverse-matching";
import { randomBytes } from "node:crypto";
import { getMobileRequestContext } from "@/lib/mobile-request-context";
import { PlanQuotaError } from "@/lib/plan-quota";
import { getEffectiveUserLimits } from "@/lib/user-limits";
import { countNonCashAccounts } from "@/lib/account-limit-count";
import { AccountType, Prisma, TransactionType } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertWorkspaceAccess } from "@/lib/workspace-access";
import {
  createFinverseRefresh,
  hashFinverseState,
  getAllFinverseTransactions,
  getFinverseAccounts,
  getFinverseAccountNumber,
  getFinverseLoginIdentity,
  isFinverseEnabled,
  isFinverseDataReady,
  normalizeFinverseAccount,
  normalizeFinverseTransaction,
  type FinverseAccount,
  type FinverseTransaction,
} from "@/lib/finverse";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const json = (value: unknown) => value as Prisma.InputJsonValue;

const importAccount = async (connectionId: string, workspaceId: string, account: FinverseAccount, institutionName?: string, explicitlySelected = false) => {
  const normalized = normalizeFinverseAccount(account, institutionName);
  return prisma.$transaction(async tx => {
    const workspace = await tx.workspace.findUniqueOrThrow({ where: { id: workspaceId }, include: { user: true } });
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`plan-quota:${workspace.userId}`}, 0))`;
    const connection = await tx.finverseConnection.findUniqueOrThrow({ where: { id: connectionId } });
    if (connection.status === "disconnected") throw new Error("FINVERSE_RELINK_REQUIRED");
    const sameIdentity = await tx.finverseAccountLink.findFirst({ where: { workspaceId, externalAccountId: account.account_id }, orderBy: { createdAt: "asc" } });
    if (sameIdentity && !explicitlySelected && (sameIdentity.unlinkedAt || sameIdentity.connectionId !== connectionId)) return null;
    // A deletion is deliberate; do not silently recreate the deleted account.
    if (sameIdentity && !sameIdentity.accountId) return null;
    const allowance = await bankLinkAllowance(tx, workspace.userId);
    const candidates = await tx.account.findMany({ where: { workspaceId }, include: { finverseAccountLink: true } });
    const matches = matchingBankAccounts(candidates, normalized);
    if (!sameIdentity && matches.length > 1) throw new PlanQuotaError("More than one Clover account matches this bank account. Review the duplicate accounts before linking; no records have been changed.");
    const match = sameIdentity?.accountId ? candidates.find(a => a.id === sameIdentity.accountId) : matches[0];
    const priorLink = sameIdentity ?? match?.finverseAccountLink;
    if (priorLink && !explicitlySelected && (priorLink.unlinkedAt || priorLink.connectionId !== connectionId)) return null;
    if (priorLink && priorLink.externalAccountId !== account.account_id && (!/^\d+$/.test(cleanBankNumber(normalized.accountNumber)) || cleanBankNumber(match?.accountNumber) !== cleanBankNumber(normalized.accountNumber))) throw new PlanQuotaError("This Clover account is already linked to a different bank account. Review its link first.");
    const quotaIdentity = priorLink ? bankLinkUsageIdentity(priorLink) : account.account_id;
    if (!allowance.usedIds.has(quotaIdentity) && allowance.remaining === 0) throw new PlanQuotaError("Your bank-account allowance is full for this monthly period. You can reconnect an account already used this period.");
    let accountId = match?.id;
    if (!accountId) {
      const limit = getEffectiveUserLimits(workspace.user).accountLimit;
      const ownerAccounts = await tx.account.findMany({ where: { workspace: { userId: workspace.userId } }, select: { type: true, name: true, institution: true } });
      if (limit !== null && countNonCashAccounts(ownerAccounts) >= limit) throw new PlanQuotaError("Your financial account allowance is full. Link an existing Clover account or upgrade your plan.");
      const created = await tx.account.create({ data: { workspaceId, name: normalized.name, institution: normalized.institution, accountNumber: normalized.accountNumber, type: normalized.type as AccountType, currency: normalized.currency, source: "finverse", balance: normalized.balance } });
      accountId = created.id;
    }
    // Never replace a saved full number with a provider mask or change confirmed metadata.
    if (match && normalized.accountNumber && (!match.accountNumber || (match.source === "finverse" && /[*x•]/i.test(match.accountNumber) && /^\d+$/.test(normalized.accountNumber)))) await tx.account.update({ where: { id: match.id }, data: { accountNumber: normalized.accountNumber } });
    const payload = { connectionId, workspaceId, externalAccountId: account.account_id, accountId, rawPayload: json(account), normalizedPayload: json({ ...normalized, quotaIdentity }), lastSeenAt: new Date(), unlinkedAt: null };
    if (priorLink) await tx.finverseAccountLink.update({ where: { id: priorLink.id }, data: payload });
    else await tx.finverseAccountLink.create({ data: payload });
    await tx.bankLinkUsage.createMany({ data: [{ userId: workspace.userId, externalAccountId: quotaIdentity, periodStart: allowance.periodStart, periodEnd: allowance.periodEnd }], skipDuplicates: true });
    return accountId;
  });
};

const importTransaction = async (connectionId: string, workspaceId: string, transaction: FinverseTransaction, claimedTransactionIds = new Set<string>()) => {
  const normalized = normalizeFinverseTransaction(transaction);
  // Pending entries can change ID or amount when posted. Import only booked movements.
  if (!normalized || normalized.isPending) return "skipped" as const;
  return prisma.$transaction(async tx => {
    const workspace = await tx.workspace.findUniqueOrThrow({ where: { id: workspaceId } });
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`plan-quota:${workspace.userId}`}, 0))`;
    const link = await tx.finverseAccountLink.findFirst({ where: { connectionId, externalAccountId: transaction.account_id, unlinkedAt: null, accountId: { not: null }, connection: { status: { not: "disconnected" } } } });
    if (!link?.accountId) return "skipped" as const;
    const normalizedJson = { ...normalized, date: normalized.date.toISOString() };
    // Stable provider IDs span authorizations; tombstones intentionally remain deduplicated.
    const existing = await tx.finverseTransactionRecord.findFirst({ where: { externalTransactionId: transaction.transaction_id, externalAccountId: transaction.account_id, connection: { workspaceId } } });
    if (existing) {
      const reconciledTransactionId = (existing.normalizedPayload as { reconciledTransactionId?: string } | null)?.reconciledTransactionId;
      if (existing.transactionId || reconciledTransactionId) claimedTransactionIds.add(existing.transactionId || reconciledTransactionId!);
      await tx.finverseTransactionRecord.update({ where: { id: existing.id }, data: { rawPayload: json(transaction), normalizedPayload: json({ ...normalizedJson, ...(reconciledTransactionId ? { reconciledTransactionId } : {}) }), lastSeenAt: new Date() } });
      return "existing" as const;
    }
    const from = new Date(normalized.date); from.setUTCHours(0, 0, 0, 0);
    const to = new Date(+from + 86400000);
    const candidates = await tx.transaction.findMany({ where: { workspaceId, accountId: link.accountId, currency: normalized.currency, amount: normalized.amount, type: normalized.type as TransactionType, date: { gte: from, lt: to }, id: { notIn: [...claimedTransactionIds] }, OR: [{ finverseTransactionRecord: null }, { finverseTransactionRecord: { connectionId: { not: connectionId } } }] }, include: { finverseTransactionRecord: true }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
    // Claim one matching occurrence, not every payment with the same amount.
    const match = candidates.find(candidate => bankTransactionMatches(candidate, normalized));
    const created = match ?? await tx.transaction.create({ data: {
      workspaceId, accountId: link.accountId, reviewStatus: candidates.length ? "pending_review" : "suggested",
      isExcluded: candidates.length > 0, duplicateConfidence: candidates.length ? 60 : 0,
      reviewPriority: candidates.length ? "high" : "none", reviewReasons: candidates.length ? json(["finverse_possible_duplicate"]) : undefined,
      parserConfidence: 100, categoryConfidence: 0, accountMatchConfidence: 100,
      rawPayload: json(transaction), normalizedPayload: json(normalizedJson), sourceRowKey: `finverse:${transaction.transaction_id}`,
      date: normalized.date, amount: normalized.amount, currency: normalized.currency, type: normalized.type as TransactionType,
      merchantRaw: normalized.merchantRaw, merchantClean: normalized.merchantClean, description: normalized.description,
    } });
    // Keep the original provider record attached. A reauthorization alias retains its
    // own raw payload and points to the same ledger row in normalized provenance.
    const alias = Boolean(match?.finverseTransactionRecord);
    await tx.finverseTransactionRecord.create({ data: { connectionId, externalTransactionId: transaction.transaction_id, externalAccountId: transaction.account_id, transactionId: alias ? null : created.id, rawPayload: json(transaction), normalizedPayload: json({ ...normalizedJson, ...(alias ? { reconciledTransactionId: created.id } : {}) }) } });
    claimedTransactionIds.add(created.id);
    return match ? "existing" as const : "created" as const;
  });
};

export async function POST(request: Request) {
  if (!isFinverseEnabled()) {
    return NextResponse.json({ error: "Bank connections are not available yet." }, { status: 404 });
  }

  try {
    const { userId } = await requireAuth();
    const body = await request.json().catch(() => ({})) as { workspaceId?: string; connectionId?: string; selectedAccountIds?: string[]; refresh?: boolean };
    if (!body.workspaceId) return NextResponse.json({ error: "Workspace is required." }, { status: 400 });
    await assertWorkspaceAccess(userId, body.workspaceId);
    const connection = await prisma.finverseConnection.findFirst({
      where: {
        workspaceId: body.workspaceId,
        ...(body.connectionId ? { id: body.connectionId } : {}),
        user: { clerkUserId: userId },
        encryptedRefreshToken: { not: null },
        status: { not: "disconnected" },
      },
      orderBy: { createdAt: "desc" },
    });
    if (!connection) return NextResponse.json({ error: "No connected bank was found." }, { status: 404 });

    const planTier = await refreshProAccess(connection.userId);
    if (planTier === "free") return NextResponse.json({error:"Bank sync requires Plus or Pro. Existing imported records are preserved."},{status:403});
    const token = await getActiveFinverseToken(connection);
    const identityResult = await getFinverseLoginIdentity(token);
    const identity = identityResult.login_identity ?? {};
    const status = typeof identity.status === "string" ? identity.status : "UNKNOWN";
    const institution = identityResult.institution ?? {};
    const institutionName = typeof institution.institution_name === "string" ? institution.institution_name : undefined;
    const institutionId = typeof institution.institution_id === "string" ? institution.institution_id : undefined;

    if (body.refresh === true) {
      if (!body.connectionId || !connection.loginIdentityId) return NextResponse.json({ error: "Choose a linked bank account." }, { status: 400 });
      const refreshAllowed = (identity.refresh as { refresh_allowed?: boolean } | undefined)?.refresh_allowed === true;
      const state = (getMobileRequestContext() ? "native." : "") + (refreshAllowed ? "refresh." : "") + randomBytes(32).toString("base64url");
      const result = await createFinverseRefresh(token, state, connection.loginIdentityId, refreshAllowed);
      if (!result.link_url) throw new Error("FINVERSE_LINK_URL_MISSING");
      await prisma.finverseConnection.updateMany({ where: { id: connection.id, status: { not: "disconnected" } }, data: {
        stateHash: hashFinverseState(state), stateExpiresAt: new Date(Date.now() + 15 * 60_000), status: "link_pending",
      } });
      return NextResponse.json({ status: "authorize", connectionId: connection.id, linkUrl: result.link_url });
    }

    const updatedState = await prisma.finverseConnection.updateMany({
      where: { id: connection.id, status: { not: "disconnected" } },
      data: {
        status: status === "ERROR" ? "error" : isFinverseDataReady(status) ? "ready" : "retrieving",
        institutionId,
        institutionName,
        rawLoginIdentity: json(identityResult),
        syncError: status === "ERROR" ? "Finverse could not retrieve data from this institution." : null,
      },
    });
    if (!updatedState.count) return NextResponse.json({ error: "This bank was unlinked." }, { status: 409 });
    if (status === "ERROR") return NextResponse.json({ error: "Finverse could not retrieve data from this institution.", status }, { status: 422 });
    if (!isFinverseDataReady(status)) {
      console.info("[finverse-sync] retrieving", { connectionId: connection.id, providerStatus: status });
      return NextResponse.json({ status: "retrieving", providerStatus: status });
    }

    const accountResult = await getFinverseAccounts(token);
    const resolvedInstitutionName = institutionName || (typeof accountResult.institution?.institution_name === "string" ? accountResult.institution.institution_name : undefined);
    const providerAccounts = (accountResult.accounts ?? []).filter(a => a.is_parent !== true);
    for (const account of providerAccounts) {
      const fullNumber = await getFinverseAccountNumber(token, account.account_id);
      if (fullNumber) account.account_number_full = fullNumber;
    }
    const links = await prisma.finverseAccountLink.findMany({ where: { connectionId: connection.id, unlinkedAt: null }, select: { externalAccountId: true } });
    const linkedIds = new Set(links.map(l => l.externalAccountId));
    const allowance = await prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`plan-quota:${connection.userId}`}, 0))`;
      return bankLinkAllowance(tx, connection.userId);
    });
    const newAccounts = providerAccounts.filter(a => !linkedIds.has(a.account_id));
    if (body.selectedAccountIds !== undefined && (!Array.isArray(body.selectedAccountIds) || body.selectedAccountIds.some(id => typeof id !== "string" || !providerAccounts.some(a => a.account_id === id)))) return NextResponse.json({ error: "Choose valid bank accounts." }, { status: 400 });
    const selectedIds = body.selectedAccountIds ? new Set(body.selectedAccountIds) : null;
    const chosen = newAccounts.filter(a => selectedIds?.has(a.account_id));
    const cloverAccounts = await prisma.account.findMany({ where: { workspaceId: connection.workspaceId }, include: { finverseAccountLink: true } });
    const reservedIds = new Set(newAccounts.filter(a => {
      if (allowance.usedIds.has(a.account_id)) return true;
      const normalized = normalizeFinverseAccount(a, resolvedInstitutionName);
      const matches = matchingBankAccounts(cloverAccounts, normalized);
      const match = matches.length === 1 ? matches[0] : null;
      return match?.finverseAccountLink && /^\d+$/.test(cleanBankNumber(normalized.accountNumber)) && cleanBankNumber(match.accountNumber) === cleanBankNumber(normalized.accountNumber) && allowance.usedIds.has(bankLinkUsageIdentity(match.finverseAccountLink));
    }).map(a => a.account_id));
    if ((!selectedIds && newAccounts.length > 0) || chosen.filter(a => !reservedIds.has(a.account_id)).length > allowance.remaining) {
      await prisma.finverseConnection.updateMany({ where: { id: connection.id, status: { not: "disconnected" } }, data: { status: "awaiting_selection" } });
      return NextResponse.json({ status: "select_accounts", connectionId: connection.id, remaining: allowance.remaining, resetsAt: allowance.periodEnd, accounts: newAccounts.map(a => {
        const normalized = normalizeFinverseAccount(a, resolvedInstitutionName);
        const matches = matchingBankAccounts(cloverAccounts, normalized);
        return { id: a.account_id, name: `${normalized.name}${normalized.accountNumber ? ` •••• ${normalized.accountNumber.slice(-4)}` : ""}`, reserved: reservedIds.has(a.account_id), existingAccountName: matches.length === 1 ? matches[0].name : null };
      }) });
    }
    const accountsToImport = providerAccounts.filter(a => linkedIds.has(a.account_id) || chosen.some(c => c.account_id === a.account_id));
    for (const account of accountsToImport) await importAccount(connection.id, connection.workspaceId, account, resolvedInstitutionName, chosen.some(c => c.account_id === account.account_id));

    const providerTransactions = await getAllFinverseTransactions(token);
    let imported = 0;
    let existing = 0;
    let skipped = 0;
    const claimedTransactionIds = new Set<string>();
    for (const transaction of providerTransactions) {
      const result = await importTransaction(connection.id, connection.workspaceId, transaction, claimedTransactionIds);
      if (result === "created") imported += 1;
      else if (result === "existing") existing += 1;
      else skipped += 1;
    }
    await prisma.finverseConnection.updateMany({
      where: { id: connection.id, status: { not: "disconnected" } },
      data: { status: "ready", lastSyncedAt: new Date(), syncError: null },
    });
    console.info("[finverse-sync] complete", {
      connectionId: connection.id,
      accountCount: accountResult.accounts?.length ?? 0,
      importedTransactions: imported,
      existingTransactions: existing,
      skippedTransactions: skipped,
    });
    return NextResponse.json({
      status: "ready",
      connectionId: connection.id,
      accounts: accountResult.accounts?.length ?? 0,
      transactions: { imported, existing, skipped },
    });
  } catch (error) {
    if (error instanceof PlanQuotaError) return NextResponse.json({error:error.message},{status:403});
    const message = error instanceof Error ? error.message : "";
    if (message === "UNAUTHORIZED") return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
    if (message === "WORKSPACE_NOT_FOUND") return NextResponse.json({ error: "Workspace not found." }, { status: 404 });
    if (message === "FINVERSE_DISABLED") return NextResponse.json({ error: "Bank connections are not available yet." }, { status: 404 });
    if (message === "FINVERSE_NOT_CONFIGURED") return NextResponse.json({ error: "Bank connections are not configured yet." }, { status: 503 });
    if (message === "FINVERSE_RELINK_REQUIRED") return NextResponse.json({ error: "This bank needs to be connected again." }, { status: 409 });
    console.error("Finverse sync failed", error);
    return NextResponse.json({ error: "Unable to sync the connected bank right now." }, { status: 502 });
  }
}
