import { isLiabilityAccountType } from "@/lib/account-types";

type BalanceLike = string | number | null | undefined;

type BalanceLikeRawPayload = {
  amountDelta?: BalanceLike;
  balance?: BalanceLike;
  openingBalance?: BalanceLike;
  kind?: string;
};

export type BalanceLikeTransaction = {
  id?: string;
  amount: BalanceLike;
  type?: string | null;
  isExcluded?: boolean | null;
  merchantRaw?: string | null;
  merchantClean?: string | null;
  description?: string | null;
  date?: string | Date | null;
  createdAt?: string | Date | null;
  rawPayload?: BalanceLikeRawPayload | null;
};

type BalanceLikeCheckpoint = {
  status?: string | null;
  endingBalance?: BalanceLike;
  statementEndDate?: string | Date | null;
  createdAt?: string | Date | null;
};

type ReconciledBalanceInput = {
  accountType?: string | null;
  balance?: BalanceLike;
  transactions?: BalanceLikeTransaction[];
  checkpoints?: BalanceLikeCheckpoint[];
  treatStoredBalanceAsOpening?: boolean;
};

const parseBalanceValue = (value: BalanceLike) => {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = typeof value === "number" ? value : Number(String(value));
  return Number.isFinite(parsed) ? parsed : null;
};

const toSortTime = (value: string | Date | null | undefined) => {
  if (!value) {
    return 0;
  }

  const date = value instanceof Date ? value : new Date(value);
  const time = date.getTime();
  return Number.isFinite(time) ? time : 0;
};

const isOpeningBalanceTransaction = (transaction: BalanceLikeTransaction) => {
  const rawPayload = transaction.rawPayload ?? null;
  const merchantRaw = String(transaction.merchantRaw ?? "").toLowerCase();
  const kind = rawPayload?.kind ? String(rawPayload.kind).toLowerCase() : "";
  return kind === "opening_balance" || merchantRaw === "beginning balance";
};

export const getTransactionAmountDelta = (transaction: BalanceLikeTransaction) => {
  const rawPayload = transaction.rawPayload ?? null;
  const rawDelta = parseBalanceValue(rawPayload?.amountDelta ?? null);
  if (rawDelta !== null) {
    return rawDelta;
  }

  const amount = Math.abs(parseBalanceValue(transaction.amount) ?? 0);
  const text = `${transaction.merchantRaw ?? ""} ${transaction.merchantClean ?? ""} ${transaction.description ?? ""}`.toLowerCase();

  if (transaction.type === "income") {
    return amount;
  }

  if (transaction.type === "expense") {
    return -amount;
  }

  if (transaction.type === "transfer") {
    if (/cash in|deposit|received|from/.test(text) && !/cash out|withdraw|sent|payment to|transfer to/.test(text)) {
      return amount;
    }

    if (/cash out|withdraw|sent|payment to|transfer to/.test(text)) {
      return -amount;
    }
  }

  return 0;
};

export const normalizeAccountBalanceSign = (type: string, value: number) => {
  if (type === "cash") {
    return Math.max(0, value);
  }

  return isLiabilityAccountType(type as Parameters<typeof isLiabilityAccountType>[0])
    ? -Math.abs(value)
    : value;
};

/** Read-only cash projection. Unknown imports stay unknown until a recorded anchor exists. */
export const deriveCashLedger = (balance: BalanceLike, transactions: BalanceLikeTransaction[], options: {
  treatStoredBalanceAsOpening?: boolean; checkpoints?: BalanceLikeCheckpoint[];
} = { treatStoredBalanceAsOpening: true }) => {
  const eventTime = (transaction: BalanceLikeTransaction) => toSortTime(transaction.date) || toSortTime(transaction.createdAt);
  const ordered = transactions.filter(transaction => !transaction.isExcluded).slice().sort((left, right) =>
    eventTime(left) - eventTime(right) || toSortTime(left.createdAt) - toSortTime(right.createdAt) ||
    String(left.id ?? JSON.stringify([left.type, left.amount, left.merchantRaw])).localeCompare(String(right.id ?? JSON.stringify([right.type, right.amount, right.merchantRaw]))));
  let current = options.treatStoredBalanceAsOpening ? parseBalanceValue(balance) : null;
  if (current !== null) current = Math.max(0, current);
  const openingBalance = current;
  let knownFrom: string | Date | null = null;
  let historyAvailable = current !== null;
  const markAnchor = (date: string | Date | null | undefined) => {
    if (!historyAvailable && toSortTime(date)) { knownFrom = date!; historyAvailable = true; }
  };
  const movements: Array<{ date: string | Date | null | undefined; amountDelta: number; balance: number }> = [];
  const checkpoints = (options.checkpoints ?? []).filter(checkpoint => checkpoint.status !== "mismatch" && parseBalanceValue(checkpoint.endingBalance) !== null);
  const checkpointEvents = checkpoints.map(checkpoint => {
    const date = checkpoint.statementEndDate ?? checkpoint.createdAt;
    const time = toSortTime(date);
    // A statement's closing balance already includes that calendar day's movements.
    const endOfDay = checkpoint.statementEndDate && time ? new Date(time) : null;
    if (endOfDay) endOfDay.setHours(23, 59, 59, 999);
    return { time: endOfDay?.getTime() ?? time, checkpoint };
  }).sort((left, right) => left.time - right.time);
  let checkpointIndex = 0;
  const applyCheckpoints = (until: number) => {
    while (checkpointIndex < checkpointEvents.length && checkpointEvents[checkpointIndex].time <= until) {
      const event = checkpointEvents[checkpointIndex++];
      const before = current;
      if (before === null) markAnchor(event.checkpoint.statementEndDate ?? event.checkpoint.createdAt);
      current = Math.max(0, parseBalanceValue(event.checkpoint.endingBalance)!);
      if (before !== null) movements.push({ date: event.checkpoint.statementEndDate ?? event.checkpoint.createdAt, amountDelta: current - before, balance: current });
    }
  };
  for (const transaction of ordered) {
    applyCheckpoints(eventTime(transaction));
    const before = current;
    if (isOpeningBalanceTransaction(transaction)) {
      const opening = parseBalanceValue(transaction.rawPayload?.openingBalance ?? transaction.amount);
      if (opening !== null) {
        if (before === null) markAnchor(transaction.date ?? transaction.createdAt);
        current = Math.max(0, opening);
        if (before !== null) movements.push({ date: transaction.date ?? transaction.createdAt, amountDelta: current - before, balance: current });
      }
      continue;
    }
    const recordedBalance = parseBalanceValue(transaction.rawPayload?.balance);
    if (recordedBalance !== null) {
      if (before === null) markAnchor(transaction.date ?? transaction.createdAt);
      current = Math.max(0, recordedBalance);
    }
    else if (current !== null) current = Math.max(0, current + getTransactionAmountDelta(transaction));
    if (current !== null) {
      current = Math.round((current + Number.EPSILON) * 100) / 100;
      if (before !== null) movements.push({ date: transaction.date ?? transaction.createdAt, amountDelta: current - before, balance: current });
    }
  }
  applyCheckpoints(Infinity);
  // An undated current imported balance is evidence, but cannot serve as an opening amount.
  const result = current ?? parseBalanceValue(balance);
  return { openingBalance, balance: result === null ? null : Math.max(0, result).toFixed(2), movements, knownFrom: knownFrom as string | Date | null, historyAvailable };
};

export const deriveReconciledBalance = ({
  accountType,
  balance,
  transactions = [],
  checkpoints = [],
  treatStoredBalanceAsOpening = false,
}: ReconciledBalanceInput) => {
  if (accountType === "cash") return deriveCashLedger(balance, transactions, { treatStoredBalanceAsOpening, checkpoints }).balance;
  const storedBalance = parseBalanceValue(balance);
  const orderedTransactions = [...transactions].sort((left, right) => {
    const rightTime = Math.max(toSortTime(right.date), toSortTime(right.createdAt));
    const leftTime = Math.max(toSortTime(left.date), toSortTime(left.createdAt));
    return rightTime - leftTime;
  });

  const hasTransactionData = orderedTransactions.some((transaction) => !isOpeningBalanceTransaction(transaction));

  const openingBalanceTransaction = orderedTransactions
    .filter(isOpeningBalanceTransaction)
    .sort((left, right) => {
      const rightTime = Math.max(toSortTime(right.date), toSortTime(right.createdAt));
      const leftTime = Math.max(toSortTime(left.date), toSortTime(left.createdAt));
      return leftTime - rightTime;
    })[0];

  const openingBalance = parseBalanceValue(openingBalanceTransaction?.rawPayload?.openingBalance ?? openingBalanceTransaction?.amount ?? null);
  if (openingBalance !== null) {
    const delta = transactions
      .filter((transaction) => !isOpeningBalanceTransaction(transaction))
      .reduce((sum, transaction) => sum + getTransactionAmountDelta(transaction), 0);

    return (openingBalance + delta).toFixed(2);
  }

  const latestBalanceTransaction = orderedTransactions.find((transaction) => {
    if (isOpeningBalanceTransaction(transaction)) {
      return false;
    }

    return parseBalanceValue(transaction.rawPayload?.balance ?? null) !== null;
  });

  const directBalance = parseBalanceValue(latestBalanceTransaction?.rawPayload?.balance ?? null);
  if (directBalance !== null) {
    return directBalance.toFixed(2);
  }

  const netBalance = transactions
    .filter((transaction) => !isOpeningBalanceTransaction(transaction))
    .reduce((sum, transaction) => sum + getTransactionAmountDelta(transaction), 0);

  if (treatStoredBalanceAsOpening && storedBalance !== null) {
    return (storedBalance + netBalance).toFixed(2);
  }

  if (netBalance !== 0) {
    return netBalance.toFixed(2);
  }

  if (!hasTransactionData) {
    const latestCheckpoint = checkpoints
      .filter((checkpoint) => parseBalanceValue(checkpoint.endingBalance) !== null)
      .sort((left, right) => {
        const rightTime = Math.max(toSortTime(right.statementEndDate), toSortTime(right.createdAt));
        const leftTime = Math.max(toSortTime(left.statementEndDate), toSortTime(left.createdAt));
        return rightTime - leftTime;
      })[0];

    const checkpointBalance = parseBalanceValue(latestCheckpoint?.endingBalance ?? null);
    if (checkpointBalance !== null) {
      return checkpointBalance.toFixed(2);
    }
  }

  if (storedBalance !== null) {
    return storedBalance.toFixed(2);
  }

  return null;
};
