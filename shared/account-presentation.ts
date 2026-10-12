/** Accounts-page classification only; preserve stored account types and balances. */
export function accountSectionType<
  T extends {
    type: string;
    name?: string;
    institution?: string | null;
    investmentSubtype?: string | null;
  },
>(account: T): T["type"] | "investment" {
  if (
    account.investmentSubtype === "time_deposit" ||
    /\bgsave\b|\b(?:unoready|unoboost)\b/i.test(
      `${account.institution ?? ""} ${account.name ?? ""}`,
    )
  )
    return "investment";
  return account.type;
}
