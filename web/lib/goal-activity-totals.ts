import { resolveFinancialTransactionType } from "./transaction-directions";
type ActivityRow = Parameters<typeof resolveFinancialTransactionType>[0] & { amount: unknown; category: { name: string } | null; account: { type: string } };
export function goalActivityTotals(rows: ActivityRow[]) {
  return rows.reduce(
    (sum, row) => {
      const type = resolveFinancialTransactionType({
        ...row,
        categoryName: row.category?.name,
      });
      const amount = Math.abs(Number(row.amount));
      if (type === "income") sum.income += amount;
      if (type === "expense") sum.spending += amount;
      if (row.account.type === "investment" && type !== "income")
        sum.investmentFlow += amount;
      return sum;
    },
    { income: 0, spending: 0, investmentFlow: 0 },
  );
}
