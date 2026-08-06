type DatedInvestmentTransaction = {
  id: string;
  date: string;
  createdAt: string;
};

const timestamp = (value: string) => {
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
};

export const sortInvestmentTransactionsNewestFirst = <T extends DatedInvestmentTransaction>(rows: T[]) =>
  rows.slice().sort((left, right) => {
    const transactionDateDelta = timestamp(right.date) - timestamp(left.date);
    if (transactionDateDelta !== 0) return transactionDateDelta;

    const createdAtDelta = timestamp(right.createdAt) - timestamp(left.createdAt);
    return createdAtDelta !== 0 ? createdAtDelta : right.id.localeCompare(left.id);
  });
