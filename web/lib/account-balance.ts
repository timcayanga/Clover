type BalanceLike = string | number | null | undefined;

type BalanceLikeRawPayload = {
  amountDelta?: BalanceLike;
  balance?: BalanceLike;
  openingBalance?: BalanceLike;
  kind?: string;
};

export type BalanceLikeTransaction = {
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
  endingBalance?: BalanceLike;
  statementEndDate?: string | Date | null;
  createdAt?: string | Date | null;
};

type ReconciledBalanceInput = {
  balance?: BalanceLike;
  transactions?: BalanceLikeTransaction[];
  checkpoints?: BalanceLikeCheckpoint[];
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

const getTransactionAmountDelta = (transaction: BalanceLikeTransaction) => {
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

export const deriveReconciledBalance = ({
  balance,
  transactions = [],
  checkpoints = [],
}: ReconciledBalanceInput) => {
  const storedBalance = parseBalanceValue(balance);
  const hasStatementData = checkpoints.length > 0 || transactions.length > 0;
  if (storedBalance !== null && (storedBalance !== 0 || !hasStatementData)) {
    return storedBalance.toFixed(2);
  }

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

  const orderedTransactions = [...transactions].sort((left, right) => {
    const rightTime = Math.max(toSortTime(right.date), toSortTime(right.createdAt));
    const leftTime = Math.max(toSortTime(left.date), toSortTime(left.createdAt));
    return rightTime - leftTime;
  });

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

  const openingBalanceTransaction = [...transactions]
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

  const netBalance = transactions
    .filter((transaction) => !isOpeningBalanceTransaction(transaction))
    .reduce((sum, transaction) => sum + getTransactionAmountDelta(transaction), 0);

  if (netBalance !== 0) {
    return netBalance.toFixed(2);
  }

  return null;
};
