import { formatTransactionAccountName } from "./transaction-account-sort";
type Account = Parameters<typeof formatTransactionAccountName>[0] & {
  id: string;
};
export function organizeAccountLabels(accounts: Account[]) {
  const bases = accounts.map((account) => {
    const currency = account.currency?.trim().toUpperCase();
    let label = formatTransactionAccountName(account)
      .replace(/[•·*●]+\s*(?=\d)/g, "")
      .trim();
    if (currency && /^[A-Z]{3}$/.test(currency))
      label = label
        .replace(
          new RegExp(`(?:\\s*[•·]\\s*|\\s*\\(|\\s+)${currency}\\)?$`, "i"),
          "",
        )
        .trim();
    return { account, label };
  });
  return new Map(
    bases.map(({ account, label }) => {
      const currencies = new Set(
        bases
          .filter((other) => other.label.toLowerCase() === label.toLowerCase())
          .map((other) => other.account.currency),
      );
      return [
        account.id,
        currencies.size > 1 ? `${label} ${account.currency}` : label,
      ];
    }),
  );
}
