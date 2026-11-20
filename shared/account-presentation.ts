/** Accounts-page classification only; preserve stored account types and balances. */
export function accountSectionType<
  T extends {
    type: string;
    name?: string;
    institution?: string | null;
    investmentSubtype?: string | null;
  },
>(account: T): T["type"] | "investment" {
  // Names must never reclassify a confirmed debt, wallet or cash account.
  if (
    !["bank", "bank_account", "savings", "checking", "investment"].includes(
      account.type,
    )
  )
    return account.type;
  if (
    account.investmentSubtype === "time_deposit" ||
    /\bgsave\b|\b(?:unoready|unoboost)\b/i.test(
      `${account.institution ?? ""} ${account.name ?? ""}`,
    )
  )
    return "investment";
  return account.type;
}

const accountSectionEmojis: Record<string, string> = {
  "banks & savings": "🏦",
  "credit cards": "💳",
  liabilities: "🧾",
  wallets: "👛",
  investments: "📈",
  "tracked assets": "💎",
  cash: "💵",
  "other accounts": "📁",
};

export function accountSectionEmoji(title: string) {
  return accountSectionEmojis[title.toLowerCase()] ?? "📁";
}

export const accountSectionTitle = (type: string) =>
    ({
      bank: "Banks & Savings",
      bank_account: "Banks & Savings",
      savings: "Banks & Savings",
      checking: "Banks & Savings",
      credit_card: "Credit Cards",
      line_of_credit: "Liabilities",
      wallet: "Wallets",
      cash: "Cash",
      investment: "Investments",
      loan: "Liabilities",
      mortgage: "Liabilities",
      payable: "Liabilities",
      bnpl: "Liabilities",
      receivable: "Tracked Assets",
      insurance: "Tracked Assets",
      prepaid: "Tracked Assets",
      other: "Tracked Assets",
    })[type] ?? "Other Accounts";
