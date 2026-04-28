const normalizeKey = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");

export const BANK_PRIORITY = [
  "BPI",
  "GCash",
  "RCBC",
  "UnionBank",
  "BDO",
  "Metrobank",
  "PNB",
  "Maya",
  "CIMB",
  "GoTyme",
  "Security Bank",
  "Maribank",
  "AUB",
  "Landbank",
  "EastWest Bank",
  "UCPB",
  "Chinabank",
  "PSBank",
  "Maybank",
  "ShopeePay",
  "GrabPay",
  "Citibank",
  "HSBC",
  "PDAX",
  "Wise",
  "Alipay",
  "AllBank",
  "Bank of China",
  "Bank of Commerce",
  "Bank of America",
  "Cebuana Lhuillier",
  "Bayad Center",
  "Coins.ph",
  "JP Morgan Chase",
  "Paymongo",
  "Standard Chartered",
  "Tonik Bank",
  "True Money",
  "UNO Bank",
  "Development Bank of the Philippines",
  "Cliqq",
  "OwnBank",
  "PayPal",
  "Tala Wallet",
  "Dragonpay",
  "Lazada Wallet",
  "PBCom",
  "Philtrust",
  "MUFG",
  "Philippine Veterans Bank",
  "CTBC",
  "Mizuho",
  "Deutsche Bank",
  "Sumitomo Mitsui",
  "Australia and New Zealand Bank",
  "ING Bank",
  "Keb Hana",
  "ICBC",
  "Bangkok Bank",
  "Industrial Bank of Korea",
  "Mega International Commercial Bank",
  "Shinhan Bank",
  "Chang Hwa Commercial Bank",
  "Cathay United Bank",
  "Hua Nan Bank",
  "United Overseas Bank",
  "First Commercial Bank",
  "Al-Amanah Islamic Bank",
  "Sterling Bank of Asia",
] as const;

const BANK_ALIAS_MAP = new Map<string, string>(
  [
    ["bankofthephilippineislands", "BPI"],
    ["bpi", "BPI"],
    ["banco de oro", "BDO"],
    ["bandodeoro", "BDO"],
    ["bdo", "BDO"],
    ["metropolitanbank", "Metrobank"],
    ["metrobank", "Metrobank"],
    ["unioinbank", "UnionBank"],
    ["union bank", "UnionBank"],
    ["unionbank", "UnionBank"],
    ["land bank", "Landbank"],
    ["landbank", "Landbank"],
    ["eastwest", "EastWest Bank"],
    ["eastwestbank", "EastWest Bank"],
    ["maya", "Maya"],
    ["mayabank", "Maya"],
    ["maya savings", "Maya"],
    ["gcash", "GCash"],
    ["cimb", "CIMB"],
    ["gsave", "CIMB"],
    ["ps bank", "PSBank"],
    ["psbank", "PSBank"],
    ["gotyme", "GoTyme"],
    ["gotymebank", "GoTyme"],
    ["pnb", "PNB"],
    ["chinabank", "Chinabank"],
    ["securitybank", "Security Bank"],
    ["maybank", "Maybank"],
    ["wise", "Wise"],
    ["paypal", "PayPal"],
  ].map(([key, value]) => [normalizeKey(key), value])
);

const BANK_ALIAS_ENTRIES = Array.from(BANK_ALIAS_MAP.entries());

export type BankSummaryItem = {
  bankName: string;
  bankSlug: string;
  priorityIndex: number;
};

export const getBankSlug = (bankName: string) =>
  bankName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || "bank";

export const normalizeBankName = (value: string | null | undefined) => {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) {
    return "Unknown";
  }

  const alias = BANK_ALIAS_MAP.get(normalizeKey(trimmed));
  if (alias) {
    return alias;
  }

  const priorityMatch = BANK_PRIORITY.find((bankName) => normalizeKey(bankName) === normalizeKey(trimmed));
  return priorityMatch ?? trimmed;
};

export const inferBankNameFromText = (value: string | null | undefined) => {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) {
    return "Unknown";
  }

  const normalized = normalizeKey(trimmed);
  const alias = BANK_ALIAS_MAP.get(normalized);
  if (alias) {
    return alias;
  }

  for (const [aliasKey, aliasValue] of BANK_ALIAS_ENTRIES) {
    if (normalized.includes(aliasKey)) {
      return aliasValue;
    }
  }

  const priorityMatch = BANK_PRIORITY.find((bankName) => normalized.includes(normalizeKey(bankName)));
  return priorityMatch ?? normalizeBankName(trimmed);
};

export const getBankPriorityIndex = (bankName: string) => {
  const normalized = normalizeKey(bankName);
  const alias = BANK_ALIAS_MAP.get(normalized);
  if (alias) {
    const aliasIndex = BANK_PRIORITY.findIndex((entry) => normalizeKey(entry) === normalizeKey(alias));
    if (aliasIndex >= 0) {
      return aliasIndex;
    }
  }

  return BANK_PRIORITY.findIndex((entry) => normalizeKey(entry) === normalized);
};

export const sortBanksByPriority = (banks: BankSummaryItem[]) =>
  [...banks].sort((left, right) => {
    const leftIndex = left.priorityIndex >= 0 ? left.priorityIndex : Number.MAX_SAFE_INTEGER;
    const rightIndex = right.priorityIndex >= 0 ? right.priorityIndex : Number.MAX_SAFE_INTEGER;
    if (leftIndex !== rightIndex) {
      return leftIndex - rightIndex;
    }

    return left.bankName.localeCompare(right.bankName);
  });
