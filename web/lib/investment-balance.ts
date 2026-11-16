/**
 * Statement checkpoints are historical import evidence. Investment balances,
 * however, are the current value of their holdings and can be refreshed after
 * import. A checkpoint must therefore never replace an investment balance in
 * an account list or summary.
 */
export const prefersLiveInvestmentBalance = (accountType: string | null | undefined) =>
  accountType?.trim().toLowerCase() === "investment";
