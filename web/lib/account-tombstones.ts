import type { AccountType, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { normalizeImportedAccountKey } from "@/lib/workspace-cache";

type AccountIdentityInput = {
  id?: string | null;
  name?: string | null;
  institution?: string | null;
  accountNumber?: string | null;
  type?: AccountType | string | null;
  currency?: string | null;
  source?: string | null;
};

type AccountTombstoneMatch = {
  tombstone: {
    id: string;
    accountId: string | null;
    name: string | null;
    institution: string | null;
    accountNumber: string | null;
    normalizedAccountKey: string;
    accountType: AccountType;
    currency: string;
    deletedAt: Date;
  };
  confidence: number;
  reason: string;
};

export const normalizeAccountNumberForMatch = (value?: string | null) => {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (digits.length >= 4) {
    return digits;
  }

  const visibleMasked = String(value ?? "")
    .replace(/[xX*•·]/g, "")
    .replace(/\D/g, "");
  return visibleMasked.length >= 4 ? visibleMasked : "";
};

const normalizeAccountType = (value?: AccountType | string | null): AccountType => {
  const normalized = String(value ?? "bank").trim();
  const supported: AccountType[] = [
    "bank",
    "wallet",
    "credit_card",
    "cash",
    "investment",
    "loan",
    "mortgage",
    "line_of_credit",
    "receivable",
    "payable",
    "bnpl",
    "prepaid",
    "insurance",
    "other",
  ];
  return supported.includes(normalized as AccountType) ? (normalized as AccountType) : "bank";
};

export const buildAccountTombstoneKey = (account: AccountIdentityInput) =>
  normalizeImportedAccountKey(
    account.name ?? null,
    account.institution ?? null,
    normalizeAccountNumberForMatch(account.accountNumber) || account.accountNumber || null,
    normalizeAccountType(account.type)
  );

const getLastFour = (value?: string | null) => {
  const normalized = normalizeAccountNumberForMatch(value);
  return normalized.length >= 4 ? normalized.slice(-4) : null;
};

const normalizeText = (value?: string | null) =>
  String(value ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

const scoreTombstoneMatch = (candidate: AccountIdentityInput, tombstone: AccountTombstoneMatch["tombstone"]) => {
  const candidateKey = buildAccountTombstoneKey(candidate);
  if (candidateKey && candidateKey === tombstone.normalizedAccountKey) {
    return { confidence: 100, reason: "Exact deleted account identity match." };
  }

  const candidateInstitution = normalizeText(candidate.institution);
  const tombstoneInstitution = normalizeText(tombstone.institution);
  const candidateType = normalizeAccountType(candidate.type);
  if (!candidateInstitution || !tombstoneInstitution || candidateInstitution !== tombstoneInstitution || candidateType !== tombstone.accountType) {
    return { confidence: 0, reason: "" };
  }

  const candidateLastFour = getLastFour(candidate.accountNumber ?? candidate.name);
  const tombstoneLastFour = getLastFour(tombstone.accountNumber ?? tombstone.name);
  if (candidateLastFour && tombstoneLastFour) {
    return candidateLastFour === tombstoneLastFour
      ? { confidence: 96, reason: "Deleted account institution, type, and last four match." }
      : { confidence: 0, reason: "" };
  }

  const candidateCurrency = normalizeText(candidate.currency);
  const tombstoneCurrency = normalizeText(tombstone.currency);
  const candidateName = normalizeText(candidate.name);
  const tombstoneName = normalizeText(tombstone.name);
  if (candidateCurrency && tombstoneCurrency && candidateCurrency === tombstoneCurrency && candidateName && tombstoneName && candidateName === tombstoneName) {
    return { confidence: 86, reason: "Deleted account institution, type, currency, and name match." };
  }

  return { confidence: 0, reason: "" };
};

export const recordAccountTombstones = async (
  tx: Prisma.TransactionClient,
  params: {
    workspaceId: string;
    accounts: AccountIdentityInput[];
    reason?: string;
  }
) => {
  const records = params.accounts
    .filter((account) => account.id || account.name || account.institution || account.accountNumber)
    .map((account) => ({
      workspaceId: params.workspaceId,
      accountId: account.id ?? null,
      name: account.name ?? null,
      institution: account.institution ?? null,
      accountNumber: account.accountNumber ?? null,
      normalizedAccountKey: buildAccountTombstoneKey(account),
      accountType: normalizeAccountType(account.type),
      currency: String(account.currency ?? "PHP").trim().toUpperCase() || "PHP",
      source: account.source ?? null,
      reason: params.reason ?? "account_deleted",
      rawPayload: {
        deletedAccountId: account.id ?? null,
        name: account.name ?? null,
        institution: account.institution ?? null,
        accountNumber: account.accountNumber ?? null,
        accountType: normalizeAccountType(account.type),
        currency: account.currency ?? null,
      } as Prisma.InputJsonValue,
    }))
    .filter((record) => record.normalizedAccountKey);

  if (records.length === 0) {
    return;
  }

  try {
    await tx.accountTombstone.createMany({
      data: records,
      skipDuplicates: true,
    });
  } catch (error) {
    console.warn("Unable to record deleted account tombstones", { error });
  }
};

export const findDeletedAccountTombstoneMatch = async (
  workspaceId: string,
  candidate: AccountIdentityInput
): Promise<AccountTombstoneMatch | null> => {
  const tombstones = await prisma.accountTombstone
    .findMany({
      where: {
        workspaceId,
      },
      orderBy: { deletedAt: "desc" },
      take: 200,
      select: {
        id: true,
        accountId: true,
        name: true,
        institution: true,
        accountNumber: true,
        normalizedAccountKey: true,
        accountType: true,
        currency: true,
        deletedAt: true,
      },
    })
    .catch((error) => {
      console.warn("Unable to read deleted account tombstones", { error });
      return [];
    });

  let bestMatch: AccountTombstoneMatch | null = null;
  for (const tombstone of tombstones) {
    const scored = scoreTombstoneMatch(candidate, tombstone);
    if (scored.confidence > (bestMatch?.confidence ?? 0)) {
      bestMatch = {
        tombstone,
        confidence: scored.confidence,
        reason: scored.reason,
      };
    }
  }

  return bestMatch && bestMatch.confidence >= 85 ? bestMatch : null;
};
