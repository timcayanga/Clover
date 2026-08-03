import type { TransactionType } from "@/lib/domain-types";

export type WorkspaceTransferCandidate = {
  id: string;
  accountId: string;
  accountNumber?: string | null;
  date: Date | string;
  amount: unknown;
  currency: string;
  type: TransactionType;
  categoryName?: string | null;
  merchantRaw?: string | null;
  merchantClean?: string | null;
  description?: string | null;
  rawPayload?: unknown;
};

export type WorkspaceTransferAccount = {
  id: string;
  name?: string | null;
  institution?: string | null;
  accountNumber?: string | null;
  type?: string | null;
  currency?: string | null;
};

const normalizeDigits = (value: unknown) => String(value ?? "").replace(/\D/g, "");

const readPayloadRecord = (value: unknown) =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const readAmount = (value: unknown) => {
  const parsed = Number(String(value ?? "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? Math.abs(parsed) : null;
};

const readDateTime = (value: Date | string) => {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.getTime();
};

const isTransfersCategory = (value: unknown) =>
  /^transfers?$/i.test(String(value ?? "").trim());

const buildCandidateText = (candidate: Pick<WorkspaceTransferCandidate, "merchantRaw" | "merchantClean" | "description" | "rawPayload">) => {
  const payload = readPayloadRecord(candidate.rawPayload);
  return [
    candidate.merchantRaw,
    candidate.merchantClean,
    candidate.description,
    payload?.originalDescription,
    payload?.transactionCode,
    payload?.transactionName,
    payload?.details,
  ]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
};

export const isAtmCashWithdrawalCandidate = (
  candidate: Pick<WorkspaceTransferCandidate, "type" | "merchantRaw" | "merchantClean" | "description" | "rawPayload">
) => {
  if (candidate.type === "income") {
    return false;
  }

  const text = buildCandidateText(candidate);
  if (!text) {
    return false;
  }

  const payload = readPayloadRecord(candidate.rawPayload);
  const sourceContext = [
    payload?.bank,
    payload?.providerInstitution,
    payload?.institutionRaw,
    payload?.source,
    payload?.kind,
    payload?.documentType,
  ]
    .filter(Boolean)
    .join(" ");
  if (/\b(?:gcrypto|pdax|crypto|investment)\b/i.test(sourceContext)) {
    return false;
  }

  const isReversal = /\b(?:reversal|reversed|refund|refunded|reversal credit)\b/i.test(text);
  const isFeeOnly = /\b(?:fee|charges?|surcharge|service\s+fee|acquirer\s+fee|inquiry)\b/i.test(text);
  if (isReversal || isFeeOnly) {
    return false;
  }

  return /\b(?:atm\s*(?:withdrawal|wdl|wd|cash\s+withdrawal)|cash\s+withdrawal|withdrawal\s+via\s+atm|w\/?d\s+fr\s+sav|et\s+wdl|atmwdl?|cash\s+out)\b|\/(?:drw)\b/i.test(
    text
  );
};

export const findSameCurrencyCashAccount = (
  accounts: WorkspaceTransferAccount[],
  currency: string | null | undefined
) => {
  const normalizedCurrency = String(currency ?? "").trim().toUpperCase();
  if (!normalizedCurrency) {
    return null;
  }

  return (
    accounts.find(
      (account) =>
        account.type === "cash" &&
        String(account.currency ?? "").trim().toUpperCase() === normalizedCurrency
    ) ?? null
  );
};

export const inferTransferCandidateDirection = (
  candidate: WorkspaceTransferCandidate
): "income" | "expense" => {
  if (candidate.type === "income" || candidate.type === "expense") {
    return candidate.type;
  }

  const payload = readPayloadRecord(candidate.rawPayload);
  const parsedDirection = String(
    payload?.parsedDirectionType ?? payload?.direction ?? payload?.transactionDirection ?? ""
  ).toLowerCase();
  if (/^(?:income|credit|in|incoming)$/.test(parsedDirection)) {
    return "income";
  }
  if (/^(?:expense|debit|out|outgoing)$/.test(parsedDirection)) {
    return "expense";
  }

  const previousBalance = Number(payload?.previousBalance);
  const runningBalance = Number(payload?.runningBalance);
  if (Number.isFinite(previousBalance) && Number.isFinite(runningBalance) && runningBalance !== previousBalance) {
    return runningBalance > previousBalance ? "income" : "expense";
  }

  const text = [
    candidate.merchantRaw,
    candidate.merchantClean,
    candidate.description,
    payload?.originalDescription,
    payload?.transactionCode,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  if (/\b(?:received|incoming|credited|credit|cash\s*in|transfer\s+from)\b/.test(text)) {
    return "income";
  }

  return "expense";
};

const hasExplicitWorkspaceCounterpart = (
  candidate: WorkspaceTransferCandidate,
  accountNumberById: Map<string, string>
) => {
  const payload = readPayloadRecord(candidate.rawPayload);
  const currentNumber = accountNumberById.get(candidate.accountId) ?? normalizeDigits(candidate.accountNumber);
  const fromNumber = normalizeDigits(payload?.transferFromAccountNumber);
  const toNumber = normalizeDigits(payload?.transferToAccountNumber);
  if (!currentNumber || (!fromNumber && !toNumber)) {
    return false;
  }

  const counterpart =
    fromNumber === currentNumber ? toNumber : toNumber === currentNumber ? fromNumber : "";
  if (!counterpart) {
    return false;
  }

  return Array.from(accountNumberById.entries()).some(
    ([accountId, accountNumber]) => accountId !== candidate.accountId && accountNumber === counterpart
  );
};

export const classifyWorkspaceInternalTransfers = (
  candidates: WorkspaceTransferCandidate[],
  accounts: Array<{ id: string; accountNumber?: string | null }>
) => {
  const accountNumberById = new Map(
    accounts
      .map((account) => [account.id, normalizeDigits(account.accountNumber)] as const)
      .filter((entry): entry is readonly [string, string] => Boolean(entry[1]))
  );
  const transferCandidates = candidates
    .filter((candidate) => isTransfersCategory(candidate.categoryName))
    .map((candidate) => ({
      candidate,
      amount: readAmount(candidate.amount),
      dateTime: readDateTime(candidate.date),
      direction: inferTransferCandidateDirection(candidate),
    }))
    .filter(
      (entry): entry is typeof entry & { amount: number; dateTime: number } =>
        entry.amount !== null && entry.dateTime !== null
    );
  const internalIds = new Set<string>();

  for (const entry of transferCandidates) {
    if (hasExplicitWorkspaceCounterpart(entry.candidate, accountNumberById)) {
      internalIds.add(entry.candidate.id);
    }
  }

  const usedIds = new Set<string>();
  const maxDateDifferenceMs = 3 * 24 * 60 * 60 * 1000;
  for (const entry of transferCandidates) {
    if (usedIds.has(entry.candidate.id)) {
      continue;
    }

    const counterpart = transferCandidates
      .filter(
        (candidate) =>
          !usedIds.has(candidate.candidate.id) &&
          candidate.candidate.id !== entry.candidate.id &&
          candidate.candidate.accountId !== entry.candidate.accountId &&
          candidate.direction !== entry.direction &&
          candidate.candidate.currency.toUpperCase() === entry.candidate.currency.toUpperCase() &&
          Math.abs(candidate.amount - entry.amount) < 0.005 &&
          Math.abs(candidate.dateTime - entry.dateTime) <= maxDateDifferenceMs
      )
      .sort(
        (left, right) =>
          Math.abs(left.dateTime - entry.dateTime) - Math.abs(right.dateTime - entry.dateTime)
      )[0];

    if (!counterpart) {
      continue;
    }

    internalIds.add(entry.candidate.id);
    internalIds.add(counterpart.candidate.id);
    usedIds.add(entry.candidate.id);
    usedIds.add(counterpart.candidate.id);
  }

  return {
    internalIds,
    directions: new Map(
      transferCandidates.map((entry) => [entry.candidate.id, entry.direction] as const)
    ),
  };
};
