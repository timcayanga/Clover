export type CashFlow = { account: string; income: number; expense: number };

/** A single scale, disjoint endpoint intervals and max(in, out) account bars. */
export function cashFlowLayout(flows: readonly CashFlow[]) {
  const clean = flows.map(row => ({ ...row,
    income: Number.isFinite(row.income) ? Math.max(0, row.income) : 0,
    expense: Number.isFinite(row.expense) ? Math.max(0, row.expense) : 0,
  })).filter(row => row.income > 0 || row.expense > 0);
  const visible = clean.slice(0, 5);
  if (clean.length > 5) visible.push({ account: "Other accounts",
    income: clean.slice(5).reduce((sum, row) => sum + row.income, 0),
    expense: clean.slice(5).reduce((sum, row) => sum + row.expense, 0),
  });
  const weight = visible.reduce((sum, row) => sum + Math.max(row.income, row.expense), 0);
  if (!weight) return null;
  const scale = Math.max(150, visible.length * 44) / weight;
  const top = 42;
  let accountY = top, incomeY = top, expenseY = top;
  const nodes = visible.map(row => {
    const incomeHeight = row.income * scale, expenseHeight = row.expense * scale;
    const height = Math.max(incomeHeight, expenseHeight);
    const node = { ...row, y: accountY, height, incomeY, expenseY, incomeHeight, expenseHeight };
    accountY += height + 32;
    incomeY += incomeHeight;
    expenseY += expenseHeight;
    return node;
  });
  return { nodes, top, height: accountY + 8, incomeHeight: incomeY - top, expenseHeight: expenseY - top };
}

export function flowBand(x1: number, x2: number, y1: number, y2: number, height: number) {
  const mid = (x1 + x2) / 2;
  return `M ${x1} ${y1} C ${mid} ${y1} ${mid} ${y2} ${x2} ${y2} L ${x2} ${y2 + height} C ${mid} ${y2 + height} ${mid} ${y1 + height} ${x1} ${y1 + height} Z`;
}
