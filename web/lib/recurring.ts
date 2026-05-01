const recurringTransactionPattern = /(rent|internet|bill|utility|utilities|subscription|electric|water|phone|insurance|mortgage|loan|fee)/i;

export type RecurringTransactionLike = {
  amount: unknown;
  date: Date;
  type: "income" | "expense" | "transfer";
  merchantRaw: string;
  merchantClean: string | null;
  currency?: string | null;
  category?: {
    name: string;
  } | null;
};

export type RecurringTransactionSummary = {
  key: string;
  name: string;
  amount: number;
  count: number;
  lastSeen: Date;
  category: string | null;
  confidence: number;
  currency: string | null;
};

const toAmount = (value: unknown) => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? Math.abs(parsed) : 0;
};

const getRecurringConfidence = (count: number) => {
  if (count >= 5) return 90;
  if (count === 4) return 84;
  if (count === 3) return 76;
  if (count === 2) return 64;
  return 48;
};

export const buildRecurringTransactionSummaries = (transactions: RecurringTransactionLike[]) => {
  const candidates = transactions.filter((transaction) => {
    if (transaction.type !== "expense") {
      return false;
    }

    return (
      recurringTransactionPattern.test(transaction.merchantRaw) ||
      recurringTransactionPattern.test(transaction.merchantClean ?? "") ||
      recurringTransactionPattern.test(transaction.category?.name ?? "")
    );
  });

  if (candidates.length === 0) {
    return [];
  }

  const grouped = new Map<string, RecurringTransactionSummary>();

  for (const transaction of candidates) {
    const name = (transaction.merchantClean ?? transaction.merchantRaw).trim();
    const currency = typeof transaction.currency === "string" && transaction.currency.trim() ? transaction.currency.trim().toUpperCase() : null;
    const key = `${name.toLowerCase()}::${currency ?? "PHP"}`;
    const amount = toAmount(transaction.amount);
    const category = transaction.category?.name ?? null;
    const existing = grouped.get(key);

    if (existing) {
      existing.amount += amount;
      existing.count += 1;
      if (transaction.date > existing.lastSeen) {
        existing.lastSeen = transaction.date;
      }
      existing.confidence = getRecurringConfidence(existing.count);
      continue;
    }

    grouped.set(key, {
      key,
      name,
      amount,
      count: 1,
      lastSeen: transaction.date,
      category,
      confidence: getRecurringConfidence(1),
      currency,
    });
  }

  return Array.from(grouped.values()).sort(
    (a, b) => b.count - a.count || b.lastSeen.getTime() - a.lastSeen.getTime() || b.amount - a.amount
  );
};
