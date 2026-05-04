import type { Prisma } from "@prisma/client";

export type SplitBillSourceType = "manual" | "receipt";

export type SplitBillParticipantDraft = {
  id?: string;
  name: string;
};

export type SplitBillPaymentDraft = {
  id: string;
  participantId: string;
  amount: string;
  note?: string | null;
};

export type SplitBillItemDraft = {
  id?: string;
  description: string;
  amount: string;
  participantIds: string[];
};

export type SplitBillDraft = {
  id?: string;
  title: string;
  note?: string | null;
  billDate: string;
  currency: string;
  sourceType: SplitBillSourceType;
  merchantName?: string | null;
  receiptFileName?: string | null;
  receiptMimeType?: string | null;
  receiptText?: string | null;
  receiptConfidence?: number;
  subtotal?: string | null;
  tax?: string | null;
  tip?: string | null;
  discount?: string | null;
  total?: string | null;
  groupId?: string | null;
  rawPayload?: Record<string, unknown> | null;
  participants: SplitBillParticipantDraft[];
  items: SplitBillItemDraft[];
  payments: SplitBillPaymentDraft[];
};

export type ReceiptPreviewItem = {
  description: string;
  amount: string;
  participantIds?: string[];
};

export type ReceiptPreviewResult = {
  receiptText: string;
  merchantName: string | null;
  billDate: string | null;
  currency: string;
  subtotal: string | null;
  tax: string | null;
  tip: string | null;
  discount: string | null;
  total: string | null;
  items: ReceiptPreviewItem[];
  confidence: number;
};

export type SplitBillParticipantSummary = {
  id: string;
  name: string;
  paid: number;
  owed: number;
  balance: number;
};

export type SplitBillTransfer = {
  fromParticipantId: string;
  fromParticipantName: string;
  toParticipantId: string;
  toParticipantName: string;
  amount: number;
};

export type SplitBillSettlement = {
  participants: SplitBillParticipantSummary[];
  transfers: SplitBillTransfer[];
  totalSpent: number;
  totalPaid: number;
  totalOwed: number;
};

export const splitBillGroupMemberOrderBy: Prisma.SplitBillGroupMemberOrderByWithRelationInput[] = [
  { sortOrder: "asc" },
  { createdAt: "asc" },
];

export const splitBillItemOrderBy: Prisma.SplitBillItemOrderByWithRelationInput[] = [
  { sortOrder: "asc" },
  { createdAt: "asc" },
];

export type SplitBillSerializedBill = {
  id: string;
  userId: string;
  groupId: string | null;
  title: string;
  note: string | null;
  billDate: string;
  currency: string;
  sourceType: SplitBillSourceType;
  merchantName: string | null;
  receiptFileName: string | null;
  receiptMimeType: string | null;
  receiptText: string | null;
  receiptConfidence: number;
  subtotal: string | null;
  tax: string | null;
  tip: string | null;
  discount: string | null;
  total: string | null;
  rawPayload: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
  group: {
    id: string;
    name: string;
    members: Array<{ id: string; name: string; sortOrder: number }>;
  } | null;
  participants: Array<{ id: string; name: string }>;
  items: Array<{
    id: string;
    description: string;
    amount: string;
    sortOrder: number;
    participantIds: string[];
  }>;
  payments: Array<{
    id: string;
    participantId: string;
    amount: string;
    note: string | null;
  }>;
  settlement: SplitBillSettlement;
};

const CURRENCY_ALIAS: Record<string, string> = {
  P: "PHP",
  PHP: "PHP",
  "PHILIPPINE PESO": "PHP",
  "PHILIPPINE PESOS": "PHP",
  PESO: "PHP",
  PESOS: "PHP",
  USD: "USD",
  "US DOLLAR": "USD",
  "U.S. DOLLAR": "USD",
  EUR: "EUR",
  GBP: "GBP",
  SGD: "SGD",
  JPY: "JPY",
  HKD: "HKD",
  AUD: "AUD",
  CAD: "CAD",
  THB: "THB",
  CNY: "CNY",
  MYR: "MYR",
};

const normalizeWhitespace = (value: string) => value.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();

export const parseAmountValue = (value: string | number | null | undefined) => {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  const normalized = normalizeWhitespace(value)
    .replace(/[,_]/g, "")
    .replace(/^\((.*)\)$/, "-$1")
    .replace(/[^0-9.\-]/g, "");

  if (!normalized || normalized === "-" || normalized === "." || normalized === "-.") {
    return null;
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
};

export const formatSplitBillAmount = (amount: number, currency = "PHP") =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: normalizeCurrencyCode(currency) ?? "PHP",
    maximumFractionDigits: 2,
  }).format(amount);

export const normalizeCurrencyCode = (value?: string | null) => {
  if (!value) {
    return "PHP";
  }

  const compact = normalizeWhitespace(value).toUpperCase().replace(/[^A-Z]/g, " ");
  const token = compact.replace(/\s+/g, " ").trim();

  return CURRENCY_ALIAS[token] ?? (token.replace(/\s+/g, "").slice(0, 3) || "PHP");
};

const detectCurrencyFromText = (text: string) => {
  if (/[₱]/.test(text) || /\bPHP\b/i.test(text)) {
    return "PHP";
  }

  if (/\$/.test(text) || /\bUSD\b/i.test(text)) {
    return "USD";
  }

  if (/€/.test(text) || /\bEUR\b/i.test(text)) {
    return "EUR";
  }

  if (/£/.test(text) || /\bGBP\b/i.test(text)) {
    return "GBP";
  }

  if (/¥/.test(text) || /\bJPY\b/i.test(text)) {
    return "JPY";
  }

  return "PHP";
};

const parseBillDateFromText = (text: string) => {
  const datePatterns = [
    /\b(\d{4})[-/](\d{1,2})[-/](\d{1,2})\b/,
    /\b(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})\b/,
    /\b([A-Za-z]{3,9})\s+(\d{1,2}),?\s+(\d{4})\b/,
  ];

  for (const pattern of datePatterns) {
    const match = text.match(pattern);
    if (!match) {
      continue;
    }

    if (match[1].length === 4) {
      const year = Number(match[1]);
      const month = Number(match[2]) - 1;
      const day = Number(match[3]);
      const parsed = new Date(Date.UTC(year, month, day));
      if (!Number.isNaN(parsed.getTime())) {
        return parsed.toISOString();
      }
    } else if (/^[A-Za-z]/.test(match[1])) {
      const parsed = new Date(`${match[1]} ${match[2]}, ${match[3]}`);
      if (!Number.isNaN(parsed.getTime())) {
        return parsed.toISOString();
      }
    } else {
      const first = Number(match[1]);
      const second = Number(match[2]);
      const year = match[3].length === 2 ? Number(`20${match[3]}`) : Number(match[3]);
      const parsed = new Date(Date.UTC(year, first > 12 ? second - 1 : first - 1, first > 12 ? first : second));
      if (!Number.isNaN(parsed.getTime())) {
        return parsed.toISOString();
      }
    }
  }

  return null;
};

const isSummaryLine = (line: string) =>
  /^(subtotal|sub total|tax|vat|service charge|discount|tip|tips?|amount due|balance due|grand total|total)\b/i.test(
    line
  );

const isNoiseLine = (line: string) =>
  /^(thank you|powered by|receipt|order|invoice|official receipt|or no\.?|cashier|store copy|customer copy|page \d+)/i.test(
    line
  );

const parseAmountFromLine = (line: string) => {
  const compact = normalizeWhitespace(line);
  const matches = compact.match(/(-?\(?[\d,.]+(?:\.\d{1,2})?\)?)\s*$/);
  if (!matches) {
    return null;
  }

  return parseAmountValue(matches[1]);
};

const cleanReceiptDescription = (line: string) =>
  normalizeWhitespace(line)
    .replace(/\s+\d{1,3}(?:[.,]\d{2})?$/, "")
    .replace(/\s+\d+x\s*$/i, "")
    .replace(/\b\d{1,3}\s*x\s*/i, "")
    .replace(/\s{2,}/g, " ")
    .trim();

const itemCandidatesFromText = (lines: string[]) => {
  const candidates: ReceiptPreviewItem[] = [];

  for (const line of lines) {
    if (isSummaryLine(line) || isNoiseLine(line)) {
      continue;
    }

    const amount = parseAmountFromLine(line);
    if (amount === null) {
      continue;
    }

    const description = cleanReceiptDescription(line);
    if (!description || description.length < 2) {
      continue;
    }

    candidates.push({
      description,
      amount: amount.toFixed(2),
    });
  }

  return candidates;
};

export const parseReceiptText = (receiptText: string): ReceiptPreviewResult => {
  const normalized = receiptText.replace(/\u00a0/g, " ");
  const lines = normalized
    .split(/\r?\n/)
    .map((line) => normalizeWhitespace(line))
    .filter(Boolean);

  const currency = detectCurrencyFromText(normalized);
  const billDate = parseBillDateFromText(normalized);
  const merchantName =
    lines.find((line) => line.length > 2 && !isSummaryLine(line) && !isNoiseLine(line)) ?? null;

  const subtotalLine = lines.find((line) => /^sub\s*total\b/i.test(line));
  const taxLine = lines.find((line) => /^(tax|vat)\b/i.test(line));
  const tipLine = lines.find((line) => /^tip\b/i.test(line));
  const discountLine = lines.find((line) => /^discount\b/i.test(line));
  const totalLine = [...lines].reverse().find((line) => /^(amount due|grand total|total)\b/i.test(line));

  const items = itemCandidatesFromText(lines);
  const subtotal = subtotalLine ? parseAmountFromLine(subtotalLine) : null;
  const tax = taxLine ? parseAmountFromLine(taxLine) : null;
  const tip = tipLine ? parseAmountFromLine(tipLine) : null;
  const discount = discountLine ? parseAmountFromLine(discountLine) : null;
  const total =
    totalLine && parseAmountFromLine(totalLine) !== null
      ? parseAmountFromLine(totalLine)
      : items.reduce((sum, item) => sum + (parseAmountValue(item.amount) ?? 0), 0) || null;

  const confidence = Math.max(
    35,
    Math.min(95, 40 + items.length * 7 + (merchantName ? 10 : 0) + (billDate ? 10 : 0) + (total !== null ? 15 : 0))
  );

  return {
    receiptText: normalized.trim(),
    merchantName,
    billDate,
    currency,
    subtotal: subtotal !== null ? subtotal.toFixed(2) : null,
    tax: tax !== null ? tax.toFixed(2) : null,
    tip: tip !== null ? tip.toFixed(2) : null,
    discount: discount !== null ? discount.toFixed(2) : null,
    total: total !== null ? total.toFixed(2) : null,
    items,
    confidence,
  };
};

export const buildSplitBillSettlement = (params: {
  participants: Array<{ id: string; name: string }>;
  items: Array<{
    amount: string | number;
    participantIds: string[];
  }>;
  payments: Array<{
    participantId: string;
    amount: string | number;
  }>;
}): SplitBillSettlement => {
  const participantMap = new Map(
    params.participants.map((participant) => [
      participant.id,
      {
        id: participant.id,
        name: participant.name,
        paid: 0,
        owed: 0,
        balance: 0,
      },
    ])
  );

  for (const payment of params.payments) {
    const participant = participantMap.get(payment.participantId);
    if (!participant) {
      continue;
    }

    participant.paid += parseAmountValue(payment.amount) ?? 0;
  }

  for (const item of params.items) {
    const itemAmount = parseAmountValue(item.amount) ?? 0;
    const participantIds = item.participantIds.length > 0 ? item.participantIds : params.participants.map((participant) => participant.id);
    const share = participantIds.length > 0 ? itemAmount / participantIds.length : 0;

    for (const participantId of participantIds) {
      const participant = participantMap.get(participantId);
      if (!participant) {
        continue;
      }

      participant.owed += share;
    }
  }

  const participants = [...participantMap.values()].map((participant) => ({
    ...participant,
    balance: participant.paid - participant.owed,
  }));

  const creditors = participants
    .filter((participant) => participant.balance > 0.01)
    .map((participant) => ({ ...participant }))
    .sort((left, right) => right.balance - left.balance);
  const debtors = participants
    .filter((participant) => participant.balance < -0.01)
    .map((participant) => ({ ...participant }))
    .sort((left, right) => left.balance - right.balance);

  const transfers: SplitBillTransfer[] = [];

  let creditorIndex = 0;
  let debtorIndex = 0;

  while (creditorIndex < creditors.length && debtorIndex < debtors.length) {
    const creditor = creditors[creditorIndex];
    const debtor = debtors[debtorIndex];
    const amount = Math.min(creditor.balance, Math.abs(debtor.balance));

    if (amount > 0.01) {
      transfers.push({
        fromParticipantId: debtor.id,
        fromParticipantName: debtor.name,
        toParticipantId: creditor.id,
        toParticipantName: creditor.name,
        amount: Number(amount.toFixed(2)),
      });
    }

    creditor.balance -= amount;
    debtor.balance += amount;

    if (creditor.balance <= 0.01) {
      creditorIndex += 1;
    }

    if (debtor.balance >= -0.01) {
      debtorIndex += 1;
    }
  }

  const totalOwed = participants.reduce((sum, participant) => sum + participant.owed, 0);
  const totalPaid = participants.reduce((sum, participant) => sum + participant.paid, 0);

  return {
    participants,
    transfers,
    totalSpent: totalOwed,
    totalPaid,
    totalOwed,
  };
};

export const createBlankSplitBillDraft = (): SplitBillDraft => ({
  title: "",
  note: "",
  billDate: new Date().toISOString().slice(0, 10),
  currency: "PHP",
  sourceType: "manual",
  merchantName: "",
  receiptFileName: "",
  receiptMimeType: "",
  receiptText: "",
  receiptConfidence: 0,
  subtotal: "",
  tax: "",
  tip: "",
  discount: "",
  total: "",
  groupId: "",
  participants: [],
  items: [{ description: "Total", amount: "", participantIds: [] }],
  payments: [],
  rawPayload: null,
});

export const splitBillDraftFromReceiptPreview = (preview: ReceiptPreviewResult): SplitBillDraft => {
  const total = preview.total ?? "";
  return {
    ...createBlankSplitBillDraft(),
    title: preview.merchantName ? `${preview.merchantName} receipt` : "Receipt split",
    merchantName: preview.merchantName ?? "",
    billDate: preview.billDate ? preview.billDate.slice(0, 10) : new Date().toISOString().slice(0, 10),
    currency: preview.currency,
    sourceType: "receipt",
    receiptText: preview.receiptText,
    receiptConfidence: preview.confidence,
    subtotal: preview.subtotal ?? "",
    tax: preview.tax ?? "",
    tip: preview.tip ?? "",
    discount: preview.discount ?? "",
    total,
    items:
      preview.items.length > 0
        ? preview.items.map((item, index) => ({
            id: `${index}`,
            description: item.description,
            amount: item.amount,
            participantIds: [],
          }))
        : [{ description: "Total", amount: total, participantIds: [] }],
  };
};

export const splitBillDraftFromSerializedBill = (bill: SplitBillSerializedBill): SplitBillDraft => ({
  id: bill.id,
  title: bill.title,
  note: bill.note ?? "",
  billDate: bill.billDate.slice(0, 10),
  currency: bill.currency,
  sourceType: bill.sourceType,
  merchantName: bill.merchantName ?? "",
  receiptFileName: bill.receiptFileName ?? "",
  receiptMimeType: bill.receiptMimeType ?? "",
  receiptText: bill.receiptText ?? "",
  receiptConfidence: bill.receiptConfidence,
  subtotal: bill.subtotal ?? "",
  tax: bill.tax ?? "",
  tip: bill.tip ?? "",
  discount: bill.discount ?? "",
  total: bill.total ?? "",
  groupId: bill.groupId ?? "",
  rawPayload: bill.rawPayload ?? null,
  participants: bill.participants.map((participant) => ({
    id: participant.id,
    name: participant.name,
  })),
  items: bill.items.map((item) => ({
    id: item.id,
    description: item.description,
    amount: item.amount,
    participantIds: item.participantIds,
  })),
  payments: bill.payments.map((payment) => ({
    id: payment.id,
    participantId: payment.participantId,
    amount: payment.amount,
    note: payment.note ?? "",
  })),
});

export const serializeSplitBillRecord = (bill: {
  id: string;
  userId: string;
  groupId: string | null;
  title: string;
  note: string | null;
  billDate: Date;
  currency: string;
  sourceType: SplitBillSourceType;
  merchantName: string | null;
  receiptFileName: string | null;
  receiptMimeType: string | null;
  receiptText: string | null;
  receiptConfidence: number;
  subtotal: { toString: () => string } | null;
  tax: { toString: () => string } | null;
  tip: { toString: () => string } | null;
  discount: { toString: () => string } | null;
  total: { toString: () => string } | null;
  rawPayload: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
  group: {
    id: string;
    name: string;
    members: Array<{ id: string; name: string; sortOrder: number }>;
  } | null;
  participants: Array<{ id: string; name: string }>;
  items: Array<{
    id: string;
    description: string;
    amount: { toString: () => string };
    sortOrder: number;
    participants: Array<{ participantId: string }>;
  }>;
  payments: Array<{
    id: string;
    participantId: string;
    amount: { toString: () => string };
    note: string | null;
  }>;
}): SplitBillSerializedBill => {
  const settlement = buildSplitBillSettlement({
    participants: bill.participants,
    items: bill.items.map((item) => ({
      amount: item.amount.toString(),
      participantIds: item.participants.map((entry) => entry.participantId),
    })),
    payments: bill.payments.map((payment) => ({
      participantId: payment.participantId,
      amount: payment.amount.toString(),
    })),
  });

  return {
    id: bill.id,
    userId: bill.userId,
    groupId: bill.groupId,
    title: bill.title,
    note: bill.note,
    billDate: bill.billDate.toISOString(),
    currency: bill.currency,
    sourceType: bill.sourceType,
    merchantName: bill.merchantName,
    receiptFileName: bill.receiptFileName,
    receiptMimeType: bill.receiptMimeType,
    receiptText: bill.receiptText,
    receiptConfidence: bill.receiptConfidence,
    subtotal: bill.subtotal?.toString() ?? null,
    tax: bill.tax?.toString() ?? null,
    tip: bill.tip?.toString() ?? null,
    discount: bill.discount?.toString() ?? null,
    total: bill.total?.toString() ?? null,
    rawPayload: bill.rawPayload,
    createdAt: bill.createdAt.toISOString(),
    updatedAt: bill.updatedAt.toISOString(),
    group: bill.group
      ? {
          id: bill.group.id,
          name: bill.group.name,
          members: bill.group.members.slice().sort((left, right) => left.sortOrder - right.sortOrder),
        }
      : null,
    participants: bill.participants,
    items: bill.items
      .slice()
      .sort((left, right) => left.sortOrder - right.sortOrder)
      .map((item) => ({
        id: item.id,
        description: item.description,
        amount: item.amount.toString(),
        sortOrder: item.sortOrder,
        participantIds: item.participants.map((entry) => entry.participantId),
      })),
    payments: bill.payments.map((payment) => ({
      id: payment.id,
      participantId: payment.participantId,
      amount: payment.amount.toString(),
      note: payment.note,
    })),
    settlement,
  };
};
