export type SpendingPaceTransaction = {
  date: Date;
  amount: number;
  category: string;
};

export type SpendingPacePoint = {
  day: number;
  current: number | null;
  previous: number | null;
  previousComparable: boolean;
};

export type SpendingPaceDriver = {
  category: string;
  current: number;
  previous: number;
  delta: number;
};

export type SpendingPaceSnapshot = {
  anchorDate: Date;
  currentMonthStart: Date;
  currentComparableEnd: Date;
  previousMonthStart: Date;
  previousComparableEnd: Date;
  currentLabel: string;
  previousLabel: string;
  comparableDay: number;
  currentTotal: number;
  previousTotal: number;
  currentDailyAverage: number;
  previousDailyAverage: number;
  delta: number;
  deltaPercent: number | null;
  points: SpendingPacePoint[];
  drivers: SpendingPaceDriver[];
};

const endOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);

const monthLabel = (date: Date) =>
  new Intl.DateTimeFormat("en-PH", { month: "short", year: "numeric" }).format(date);

const sumByCategory = (transactions: SpendingPaceTransaction[]) => {
  const totals = new Map<string, number>();
  transactions.forEach((transaction) => {
    const category = transaction.category.trim() || "Uncategorized";
    totals.set(category, (totals.get(category) ?? 0) + Math.abs(transaction.amount));
  });
  return totals;
};

export const buildSpendingPaceSnapshot = (
  transactions: SpendingPaceTransaction[],
  referenceDate = new Date()
): SpendingPaceSnapshot | null => {
  const validTransactions = transactions
    .filter((transaction) => Number.isFinite(transaction.date.getTime()) && Number.isFinite(transaction.amount))
    .filter((transaction) => transaction.date <= endOfDay(referenceDate))
    .sort((left, right) => left.date.getTime() - right.date.getTime());

  if (validTransactions.length === 0) {
    return null;
  }

  const anchorDate = validTransactions[validTransactions.length - 1].date;
  const currentMonthStart = new Date(anchorDate.getFullYear(), anchorDate.getMonth(), 1);
  const comparableDay = anchorDate.getDate();
  const currentComparableEnd = endOfDay(anchorDate);
  const previousMonthStart = new Date(anchorDate.getFullYear(), anchorDate.getMonth() - 1, 1);
  const daysInPreviousMonth = new Date(anchorDate.getFullYear(), anchorDate.getMonth(), 0).getDate();
  const previousComparableDay = Math.min(comparableDay, daysInPreviousMonth);
  const previousComparableEnd = endOfDay(
    new Date(previousMonthStart.getFullYear(), previousMonthStart.getMonth(), previousComparableDay)
  );
  const previousMonthEnd = endOfDay(new Date(previousMonthStart.getFullYear(), previousMonthStart.getMonth() + 1, 0));
  const daysInCurrentMonth = new Date(anchorDate.getFullYear(), anchorDate.getMonth() + 1, 0).getDate();

  const currentTransactions = validTransactions.filter(
    (transaction) => transaction.date >= currentMonthStart && transaction.date <= currentComparableEnd
  );
  const previousMonthTransactions = validTransactions.filter(
    (transaction) => transaction.date >= previousMonthStart && transaction.date <= previousMonthEnd
  );
  const previousComparableTransactions = previousMonthTransactions.filter(
    (transaction) => transaction.date <= previousComparableEnd
  );

  const currentByDay = new Map<number, number>();
  const previousByDay = new Map<number, number>();
  currentTransactions.forEach((transaction) => {
    const day = transaction.date.getDate();
    currentByDay.set(day, (currentByDay.get(day) ?? 0) + Math.abs(transaction.amount));
  });
  previousMonthTransactions.forEach((transaction) => {
    const day = transaction.date.getDate();
    previousByDay.set(day, (previousByDay.get(day) ?? 0) + Math.abs(transaction.amount));
  });

  let currentRunning = 0;
  let previousRunning = 0;
  const pointCount = Math.max(daysInCurrentMonth, daysInPreviousMonth);
  const points = Array.from({ length: pointCount }, (_, index) => {
    const day = index + 1;
    currentRunning += currentByDay.get(day) ?? 0;
    previousRunning += previousByDay.get(day) ?? 0;
    return {
      day,
      current: day <= comparableDay && day <= daysInCurrentMonth ? currentRunning : null,
      previous: day <= daysInPreviousMonth ? previousRunning : null,
      previousComparable: day <= previousComparableDay,
    };
  });

  const currentTotal = currentTransactions.reduce((sum, transaction) => sum + Math.abs(transaction.amount), 0);
  const previousTotal = previousComparableTransactions.reduce((sum, transaction) => sum + Math.abs(transaction.amount), 0);
  const currentCategories = sumByCategory(currentTransactions);
  const previousCategories = sumByCategory(previousComparableTransactions);
  const drivers = Array.from(new Set([...currentCategories.keys(), ...previousCategories.keys()]))
    .map((category) => {
      const current = currentCategories.get(category) ?? 0;
      const previous = previousCategories.get(category) ?? 0;
      return { category, current, previous, delta: current - previous };
    })
    .filter((driver) => Math.abs(driver.delta) > 0.005)
    .sort((left, right) => Math.abs(right.delta) - Math.abs(left.delta))
    .slice(0, 3);

  const delta = currentTotal - previousTotal;
  return {
    anchorDate,
    currentMonthStart,
    currentComparableEnd,
    previousMonthStart,
    previousComparableEnd,
    currentLabel: monthLabel(anchorDate),
    previousLabel: monthLabel(previousMonthStart),
    comparableDay,
    currentTotal,
    previousTotal,
    currentDailyAverage: currentTotal / Math.max(comparableDay, 1),
    previousDailyAverage: previousTotal / Math.max(previousComparableDay, 1),
    delta,
    deltaPercent: previousTotal > 0 ? (delta / previousTotal) * 100 : null,
    points,
    drivers,
  };
};
