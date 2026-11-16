import { Prisma } from "@prisma/client";
import { descriptorParts, identityText } from "./merchant-identity-context";
import { simplifyMerchantText } from "./merchant-labels";
import { parseReceiptLineItemsFromPayload } from "./receipt-line-items";

const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};

export const sourceMatchSelect = {
  id: true, workspaceId: true, accountId: true, importFileId: true, date: true, amount: true,
  currency: true, type: true, isTransfer: true, isExcluded: true, reviewStatus: true,
  merchantRaw: true, merchantClean: true, rawPayload: true, normalizedPayload: true,
  receiptDocument: { select: { id: true } },
  account: { select: { name: true, accountNumber: true } },
} satisfies Prisma.TransactionSelect;
type SourceRow = Prisma.TransactionGetPayload<{ select: typeof sourceMatchSelect }>;

export const transactionSourceLabel = (row: SourceRow) => {
  const raw = record(row.rawPayload);
  if (raw.source === "finverse" || raw.source === "lunchflow") return "Bank sync";
  if (raw.source === "receipt" || raw.documentType === "receipt" || raw.receiptDocumentId || (row.receiptDocument && !record(row.normalizedPayload).linkedReceipt)) return "Receipt";
  return row.importFileId ? "Import" : "Manual entry";
};

function merchantTokens(value: string) {
  const withoutTerminal = value.replace(/\s+(?:terminal|term|tid|mid|merchant id)\s*[:#-]?\s*[A-Z]*\d[A-Z0-9-]*\s*$/i, "");
  const seller = descriptorParts(withoutTerminal).merchant;
  return identityText(seller)
    .split(" ").filter(token => token.length > 1 &&
      !/^(?:pos|visa|debit|mastercard|credit|card|payment|purchase|txn|transaction|store|inc|corp|ltd|ph|lunch|dinner|groceries|paypal|square|stripe|paddle|adyen|sumup|shopify|toast|unknown|\d+)$/i.test(token));
}

function merchantMatch(a: SourceRow, b: SourceRow, accountOrTime: boolean) {
  return [a.merchantClean, a.merchantRaw].some(left => left && [b.merchantClean, b.merchantRaw].some(right => {
    if (!right) return false;
    const x = [...new Set(merchantTokens(left))];
    const y = [...new Set(merchantTokens(right))];
    const smaller = x.length <= y.length ? x : y;
    const larger = smaller === x ? y : x;
    if (smaller.length === 1 && larger.length === 1 && smaller[0].length === 4)
      return accountOrTime && smaller[0] === larger[0];
    return smaller.join("").length >= 5 && smaller.every(token => larger.includes(token)) &&
      (smaller.length === larger.length || smaller.length >= 2 || smaller[0].length >= 6);
  }));
}

function receiptLastFour(row: SourceRow) {
  const match = record(record(row.rawPayload).receiptAccountMatch);
  const last4 = match.account_last4 ?? match.accountLast4;
  return typeof last4 === "string" && /^\d{4}$/.test(last4) ? last4 : null;
}

function actualMinutes(row: SourceRow) {
  const raw = record(row.rawPayload);
  const details = record(raw.receiptDetails);
  const value = details.transactionTime ?? details.transaction_time ?? raw.transactionTime ?? raw.timeText;
  const time = typeof value === "string" && /^(\d{1,2}):([0-5]\d)(?::[0-5]\d)?$/.exec(value);
  return time && +time[1] < 24 ? +time[1] * 60 + +time[2] : null;
}

function originalPayment(row: SourceRow) {
  if (transactionSourceLabel(row) !== "Import" && transactionSourceLabel(row) !== "Bank sync") return null;
  const raw = record(row.rawPayload);
  const { originalAmount, originalCurrency } = raw;
  if (typeof originalCurrency !== "string" || !/^[A-Z]{3}$/.test(originalCurrency) ||
      originalCurrency === row.currency || (typeof originalAmount !== "number" && typeof originalAmount !== "string")) return null;
  const amount = Math.abs(Number(originalAmount));
  return Number.isFinite(amount) && amount > 0 ? { amount, currency: originalCurrency } : null;
}

function paymentIdentifiers(row: SourceRow) {
  const raw = record(row.rawPayload);
  const details = record(raw.receiptDetails);
  const read = (keys: string[], minimum: number) => new Set([raw, details].flatMap(payload => keys.flatMap(key => {
    const value = payload[key];
    if (typeof value !== "string") return [];
    const token = value.trim().toUpperCase().replace(/[ -]/g, "");
    return /^[A-Z0-9]+$/.test(token) && /[0-9]/.test(token) &&
      token.length >= minimum && token.length <= 40 && !/^([0-9])\1+$/.test(token) ? [token] : [];
  })));
  return {
    authorization: read(["approvalCode", "authorizationCode", "authorization_code", "approval_code"], 6),
    reference: read(["paymentReference", "payment_reference", "referenceNumber", "reference_number", "reference"], 10),
  };
}

export function sourceMatchProvenance(row: SourceRow) {
  const raw = record(row.rawPayload);
  const rowIndex = raw.sourceRowIndex;
  return {
    source: transactionSourceLabel(row),
    importFileId: row.importFileId,
    sourceRowIndex: Number.isSafeInteger(rowIndex) && Number(rowIndex) > 0 ? Number(rowIndex) : null,
    receiptDocumentId: row.receiptDocument?.id ?? (typeof raw.receiptDocumentId === "string" ? raw.receiptDocumentId : null),
  };
}

const DAY_MS = 86_400_000;
const SOURCE_MATCH_MAX_DAYS = 4;

const utcDateWindow = (date: Date, daysEitherSide: number) => {
  const midnight = Date.parse(date.toISOString().slice(0, 10));
  return {
    gte: new Date(midnight - daysEitherSide * DAY_MS),
    lt: new Date(midnight + (daysEitherSide + 1) * DAY_MS),
  };
};

const eligible = (row: SourceRow) => row.type === "expense" && !row.isTransfer && !row.isExcluded &&
  !["rejected", "duplicate_skipped"].includes(row.reviewStatus) && !row.amount.isZero();

export function scoreTransactionSourceMatch(row: SourceRow, candidate: SourceRow) {
  if (!eligible(row) || !eligible(candidate) || row.id === candidate.id || row.workspaceId !== candidate.workspaceId) return null;
  const rowSource = transactionSourceLabel(row);
  const candidateSource = transactionSourceLabel(candidate);
  const overlappingStatements = rowSource === "Import" && candidateSource === "Import" &&
    row.importFileId !== candidate.importFileId && row.accountId === candidate.accountId;
  if (rowSource === candidateSource && !overlappingStatements) return null;
  const days = Math.abs(Date.parse(row.date.toISOString().slice(0, 10)) - Date.parse(candidate.date.toISOString().slice(0, 10))) / DAY_MS;
  if (days > SOURCE_MATCH_MAX_DAYS) return null;
  const sameAmount = row.currency === candidate.currency && row.amount.abs().equals(candidate.amount.abs());
  const matchesOriginal = (imported: SourceRow, other: SourceRow) => {
    const original = originalPayment(imported);
    return original?.currency === other.currency && other.amount.abs().equals(original.amount);
  };
  const originalAmount = !sameAmount && (matchesOriginal(row, candidate) || matchesOriginal(candidate, row));
  if (!sameAmount && !originalAmount) return null;
  const leftIds = paymentIdentifiers(row);
  const rightIds = paymentIdentifiers(candidate);
  const authorization = [...leftIds.authorization].some(value => rightIds.authorization.has(value));
  if (leftIds.authorization.size && rightIds.authorization.size && !authorization) return null;
  const reference = [...leftIds.reference].some(value => rightIds.reference.has(value));
  if (leftIds.reference.size && rightIds.reference.size && !reference) return null;
  const receipt = rowSource === "Receipt" ? row : candidateSource === "Receipt" ? candidate : null;
  const recorded = receipt === row ? candidate : row;
  const last4 = receipt && receiptLastFour(receipt);
  const recordedLast4 = recorded.account.accountNumber?.replace(/\D/g, "").slice(-4);
  if (last4 && recordedLast4?.length === 4 && last4 !== recordedLast4) return null;
  const account = row.accountId === candidate.accountId || Boolean(last4 && last4 === recordedLast4);
  const left = actualMinutes(row);
  const right = actualMinutes(candidate);
  const minuteDifference = days === 0 && left !== null && right !== null ? Math.abs(left - right) : null;
  if (minuteDifference !== null && minuteDifference > 30) return null;
  const time = minuteDifference !== null && minuteDifference <= 10;
  const merchant = merchantMatch(row, candidate, account || time);
  const paymentProof = (authorization && (account || merchant)) || (reference && (account || merchant || days === 0));
  const receiptDateInferred = receipt && record(receipt.rawPayload).dateInferredFromFileName === true;
  if (receiptDateInferred && !paymentProof) return null;
  const ordinaryMatch = days <= 1 && merchant && (account || time);
  if (overlappingStatements) {
    if (!sameAmount || !(authorization || (reference && (merchant || time)))) return null;
  } else if (originalAmount ? !(paymentProof || (merchant && account && days <= 3)) : !(paymentProof || ordinaryMatch)) return null;
  return {
    confidence: Math.min(98, 58 + (merchant ? 19 : 0) + (days === 0 ? 4 : 0) + (account ? 9 : 0) +
      (time ? 10 : 0) + (paymentProof ? 22 : 0)),
    evidence: [
      sameAmount ? "Same amount and currency" : "Matches the original payment amount before conversion",
      days === 0 ? "Same date" : `Dates ${days} ${days === 1 ? "day" : "days"} apart`,
      ...(merchant ? ["Similar merchant"] : []),
      ...(account ? ["Matching account evidence"] : ["Different recorded accounts"]),
      ...(time ? ["Similar payment time"] : []),
      ...(overlappingStatements ? ["Different imports for the same account"] : []),
      ...(authorization ? ["Matching authorization code"] : []),
      ...(reference ? ["Matching payment reference"] : []),
    ],
  };
}

export function receiptItemsForSourceMatch(target: SourceRow, candidate: SourceRow) {
  if (!scoreTransactionSourceMatch(target, candidate) ||
      transactionSourceLabel(candidate) !== "Receipt" || target.currency !== candidate.currency ||
      parseReceiptLineItemsFromPayload(target.rawPayload, target.normalizedPayload).length) return null;
  const items = parseReceiptLineItemsFromPayload(candidate.rawPayload, candidate.normalizedPayload);
  return items.length && items.every(item => !item.currency || item.currency === target.currency) ? items : null;
}

export const sourceMatchConfirmedAction = "transaction_source_match_confirmed";
export const sourceMatchDismissedAction = "transaction_source_match_dismissed";

export function sourceMatchDecisionWhere(workspaceId: string, id: string, candidateIds: string[], action = sourceMatchDismissedAction): Prisma.AuditLogWhereInput {
  return {
    workspaceId, action, entity: "Transaction",
    OR: [
      { entityId: id, OR: candidateIds.map(candidateId => ({ metadata: { path: ["candidateId"], equals: candidateId } })) },
      { entityId: { in: candidateIds }, metadata: { path: ["candidateId"], equals: id } },
    ],
  };
}

export async function loadTransactionSourceMatches(db: Pick<Prisma.TransactionClient, "transaction" | "auditLog">, row: SourceRow) {
  const decisions = await db.auditLog.findMany({
    where: {
      workspaceId: row.workspaceId, entity: "Transaction",
      action: { in: [sourceMatchConfirmedAction, sourceMatchDismissedAction] },
      OR: [{ entityId: row.id }, { metadata: { path: ["candidateId"], equals: row.id } }],
    },
    select: { entityId: true, action: true, metadata: true },
  });
  const counterpart = (entry: typeof decisions[number]) =>
    entry.entityId === row.id ? record(entry.metadata).candidateId : entry.entityId;
  const dismissed = new Set(decisions.filter(entry => entry.action === sourceMatchDismissedAction).map(counterpart));
  const confirmedIds = [...new Set(decisions.filter(entry => entry.action === sourceMatchConfirmedAction)
    .map(counterpart).filter((id): id is string => typeof id === "string" && !dismissed.has(id)))];
  const original = originalPayment(row);
  const candidates = eligible(row) ? await db.transaction.findMany({
    where: {
      workspaceId: row.workspaceId, id: { not: row.id }, deletedAt: null, isExcluded: false, isTransfer: false,
      type: "expense", reviewStatus: { notIn: ["rejected", "duplicate_skipped"] },
      OR: [
        { currency: row.currency, amount: { in: [row.amount, row.amount.negated()] } },
        ...(original ? [{ currency: original.currency, amount: { in: [original.amount, -original.amount] } }] : []),
        { currency: { not: row.currency }, AND: [
          { rawPayload: { path: ["originalCurrency"], equals: row.currency } },
          { OR: [row.amount.abs().toNumber(), -row.amount.abs().toNumber(), row.amount.abs().toString(), row.amount.abs().toFixed(2)]
            .map(amount => ({ rawPayload: { path: ["originalAmount"], equals: amount } })) },
        ] },
      ],
      date: utcDateWindow(row.date, SOURCE_MATCH_MAX_DAYS),
    },
    select: sourceMatchSelect,
    orderBy: [{ date: "desc" }, { id: "asc" }], take: 80,
  }) : [];
  const confirmed = confirmedIds.length ? await db.transaction.findMany({
    where: { workspaceId: row.workspaceId, id: { in: confirmedIds }, deletedAt: null },
    select: sourceMatchSelect,
  }) : [];
  const confirmedSet = new Set(confirmedIds);
  const matches = [...confirmed, ...candidates.filter(candidate => !confirmedSet.has(candidate.id))].flatMap(candidate => {
    if (dismissed.has(candidate.id)) return [];
    const isConfirmed = confirmedSet.has(candidate.id);
    const match = scoreTransactionSourceMatch(row, candidate);
    if (!match && !isConfirmed) return [];
    return [{
      confidence: match?.confidence ?? 0, evidence: match?.evidence ?? [], confirmed: isConfirmed,
      id: candidate.id, name: candidate.merchantClean ?? candidate.merchantRaw,
      date: candidate.date.toISOString(), source: transactionSourceLabel(candidate), accountName: candidate.account.name,
      canCopyLineItems: isConfirmed && Boolean(receiptItemsForSourceMatch(row, candidate)),
    }];
  }).sort((a, b) => Number(b.confirmed) - Number(a.confirmed) || b.confidence - a.confidence);
  return [...matches.filter(match => match.confirmed), ...matches.filter(match => !match.confirmed).slice(0, 5)];
}

/** Link one receipt to one existing expense. Reuse the cross-source matcher
 * with stricter automatic criteria and leave the financial fields untouched. */
export async function linkReceiptToExistingExpense(
  tx: Prisma.TransactionClient,
  receiptDocumentId: string,
  input: {
    workspaceId: string; accountId: string; date: Date; amount: string | number;
    currency: string; merchantRaw: string; merchantClean?: string | null;
    rawPayload?: Prisma.InputJsonValue | null;
  },
) {
  const raw = record(input.rawPayload);
  if (raw.dateInferredFromFileName === true) return null;
  const amount = new Prisma.Decimal(input.amount);
  const receipt: SourceRow = {
    id: "", workspaceId: input.workspaceId, accountId: input.accountId, importFileId: null,
    date: input.date, amount, currency: input.currency, type: "expense", isTransfer: false, isExcluded: false,
    reviewStatus: "confirmed", merchantRaw: input.merchantRaw, merchantClean: input.merchantClean ?? null,
    rawPayload: { ...raw, source: "receipt" } as Prisma.JsonValue, normalizedPayload: null,
    receiptDocument: { id: receiptDocumentId }, account: { name: "", accountNumber: null },
  };
  const where: Prisma.TransactionWhereInput = {
    workspaceId: input.workspaceId, accountId: input.accountId, currency: input.currency,
    date: utcDateWindow(input.date, 0), amount: { in: [amount, amount.negated()] },
    deletedAt: null, type: "expense", isTransfer: false, isExcluded: false,
  };
  const withAlias = (row: SourceRow) => ({ ...row,
    merchantClean: simplifyMerchantText(row.merchantRaw ?? "") || row.merchantClean,
  });
  const match = (candidate: SourceRow) => scoreTransactionSourceMatch(receipt, candidate) ??
    scoreTransactionSourceMatch(withAlias(receipt), withAlias(candidate));
  const rows = await tx.transaction.findMany({ where, select: sourceMatchSelect, take: 51 });
  if (rows.length > 50) return null;
  const candidates = rows.filter(row => match(row));
  if (candidates.length !== 1 || candidates[0].receiptDocument) return null;
  const locked = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM "Transaction"
    WHERE id = ${candidates[0].id} AND "workspaceId" = ${input.workspaceId} FOR UPDATE`;
  if (!locked.length) return null;
  const existing = await tx.transaction.findFirst({ where: { ...where, id: candidates[0].id }, select: sourceMatchSelect });
  if (!existing || existing.receiptDocument) return null;
  const evidence = match(existing);
  if (!evidence) return null;

  const linked = await tx.receiptDocument.updateMany({
    where: { id: receiptDocumentId, workspaceId: input.workspaceId, transactionId: null },
    data: { transactionId: existing.id, accountId: existing.accountId },
  });
  if (!linked.count) return null;
  const items = parseReceiptLineItemsFromPayload(receipt.rawPayload);
  const hasItems = parseReceiptLineItemsFromPayload(existing.rawPayload, existing.normalizedPayload).length > 0;
  await tx.transaction.update({
    where: { id: existing.id },
    data: { normalizedPayload: {
      ...record(existing.normalizedPayload),
      linkedReceipt: { id: receiptDocumentId, ...evidence },
      ...(!hasItems && items.length ? { receiptLineItems: items } : {}),
    } as Prisma.InputJsonValue },
  });
  return { id: existing.id, accountId: existing.accountId, deletedAt: null };
}
