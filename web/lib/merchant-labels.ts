type SimplifierRule = {
  patterns: RegExp[];
  replacement: string;
};

const normalizeWhitespace = (value: string) => value.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();

const compactText = (value: string) => normalizeWhitespace(value).replace(/[^a-z0-9]+/gi, "").toLowerCase();

const institutionKeyPatterns: Array<{ key: string; patterns: RegExp[] }> = [
  { key: "BDO", patterns: [/\b(BDO|BANCO DE ORO)\b/i] },
  { key: "BPI", patterns: [/\b(BANK OF THE PHILIPPINE ISLANDS|BPI)\b/i] },
  { key: "RCBC", patterns: [/\b(RCBC|RIZAL COMMERCIAL BANKING|BANKARD)\b/i] },
  { key: "UnionBank", patterns: [/\b(UNIONBANK|UNION BANK)\b/i] },
  { key: "GCash", patterns: [/\bGCASH\b/i] },
  { key: "Citibank", patterns: [/\b(CITIBANK|CITYBANK)\b/i] },
  { key: "Metrobank", patterns: [/\b(METROBANK|METROPOLITAN BANK)\b/i] },
  { key: "Security Bank", patterns: [/\b(SECURITY\s*BANK)\b/i] },
  { key: "Maya", patterns: [/\bMAYA\b/i] },
  { key: "LandBank", patterns: [/\b(LANDBANK|LAND BANK)\b/i] },
  { key: "Wise", patterns: [/\bWISE\b/i] },
  { key: "MariBank", patterns: [/\bMARIBANK\b/i] },
  { key: "PS Bank", patterns: [/\bPS\s*BANK\b/i] },
  { key: "China Bank", patterns: [/\bCHINA\s*BANK\b/i] },
  { key: "HSBC", patterns: [/\bHSBC\b/i] },
  { key: "EastWest", patterns: [/\bEASTWEST\b/i] },
  { key: "GoTyme", patterns: [/\bGOTYME\b/i] },
  { key: "Bank of Commerce", patterns: [/\bBANK\s+OF\s+COMMERCE\b/i] },
  { key: "Bank of China", patterns: [/\bBANK\s+OF\s+CHINA\b/i] },
];

const simplifierRules: Record<string, SimplifierRule[]> = {
  BDO: [
    {
      patterns: [/w\/?d\s*fr\s*sav\s*bdo/i, /wdfrsavbdo/i, /\batm\s+withdrawal\b/i, /\bwdrawal\b/i],
      replacement: "ATM Withdrawal",
    },
    {
      patterns: [/service\s+charge\s+debit/i, /atm\s+charges?/i],
      replacement: "Service Charge",
    },
    {
      patterns: [/interest\s+pay\s+sys-?gen/i, /interest\s+earned/i, /interest\s+credited/i],
      replacement: "Interest Earned",
    },
    {
      patterns: [/interest\s+withheld/i],
      replacement: "Tax Withheld",
    },
    {
      patterns: [/pob\s+ibft/i, /bank\s+transfer/i, /fund\s+transfer/i],
      replacement: "Bank Transfer",
    },
    {
      patterns: [/interbank\s+deposit/i, /funds?\s+deposited/i, /received\s+a\/c/i],
      replacement: "Incoming Transfer",
    },
    {
      patterns: [/payroll/i],
      replacement: "Salary Credit",
    },
    {
      patterns: [/cash\s+deposit/i],
      replacement: "Cash Deposit",
    },
    {
      patterns: [/ma[_\s-]?pc/i],
      replacement: "Merchant Payment",
    },
  ],
  BPI: [
    {
      patterns: [/tax\s*withheld/i, /taxwithheld/i, /withheld\s*tax/i],
      replacement: "Tax Withheld",
    },
    {
      patterns: [/interest\s*earned/i, /interestearned/i],
      replacement: "Interest Earned",
    },
    {
      patterns: [/instapay\s*transfer\s*fee/i, /instapaytransferfee/i],
      replacement: "InstaPay Transfer Fee",
    },
    {
      patterns: [/fund\s*transfer/i, /fundtransfer/i],
      replacement: "Fund Transfer",
    },
    {
      patterns: [/bills?\s*payment/i, /billspayment/i],
      replacement: "Bills Payment",
    },
  ],
  UnionBank: [
    {
      patterns: [/bills?\s*payment/i, /billspayment/i],
      replacement: "Bills Payment",
    },
    {
      patterns: [/online\s*instapay\s*fee/i, /instapay\s*fee/i, /instapayfee/i],
      replacement: "Online InstaPay Fee",
    },
    {
      patterns: [/withholding\s*tax/i, /tax\s*withheld/i, /taxwithheld/i],
      replacement: "Tax Withheld",
    },
    {
      patterns: [/incoming\s*credit/i],
      replacement: "Incoming Credit",
    },
    {
      patterns: [/transfer\s+to\s+gcash/i],
      replacement: "Transfer to GCash",
    },
    {
      patterns: [/transfer\s+to\s+pdax/i],
      replacement: "Transfer to PDAX",
    },
    {
      patterns: [/xendit\s+transfer/i],
      replacement: "Xendit Transfer",
    },
    {
      patterns: [/interest\s*earned/i, /interestearned/i],
      replacement: "Interest Earned",
    },
  ],
  GCash: [
    {
      patterns: [/buy\s+load\s+transaction/i, /buyloadtransaction/i],
      replacement: "Buy Load",
    },
    {
      patterns: [/bills?\s+payment\s+to\s+davao\s+light/i],
      replacement: "Davao Light",
    },
    {
      patterns: [/bills?\s+payment\s+to\s+pldt/i],
      replacement: "PLDT",
    },
    {
      patterns: [/bills?\s+payment\s+to\s+tagum\s+coop/i],
      replacement: "Tagum Coop",
    },
    {
      patterns: [/bills?\s+payment\s+to\s+bankard/i],
      replacement: "Bankard",
    },
    {
      patterns: [/bills?\s+payment\s+to\s+home\s+credit/i],
      replacement: "Home Credit",
    },
    {
      patterns: [/bills?\s+payment\s+to\s+eastwest\s+bank/i],
      replacement: "EastWest Bank",
    },
    {
      patterns: [/payment\s+to\s+food\s*panda/i, /payment\s+to\s+foodpanda/i],
      replacement: "Food Panda",
    },
    {
      patterns: [/payment\s+to\s+apple\s+services/i],
      replacement: "Apple",
    },
    {
      patterns: [/payment\s+to\s+lazada/i],
      replacement: "Lazada",
    },
    {
      patterns: [/payment\s+to\s+grab\s+philippines/i],
      replacement: "Grab",
    },
    {
      patterns: [/payment\s+to\s+seamoney\s+credit/i],
      replacement: "Seamoney Credit",
    },
    {
      patterns: [/received\s+gcash\s+from\s+bdo/i, /received\s+gcash\s+from\s+banco\s+de\s+oro/i],
      replacement: "Transfer from BDO",
    },
    {
      patterns: [/sent\s+gcash\s+to\s+bdo/i],
      replacement: "Transfer to BDO",
    },
    {
      patterns: [/received\s+gcash\s+from\s+gotyme/i],
      replacement: "Transfer from GoTyme",
    },
    {
      patterns: [/sent\s+gcash\s+to\s+gotyme/i],
      replacement: "Transfer to GoTyme",
    },
    {
      patterns: [/received\s+gcash\s+from\s+metropolitan\s+bank/i],
      replacement: "Transfer from Metrobank",
    },
    {
      patterns: [/received\s+gcash\s+from\s+asia\s+united\s+bank/i],
      replacement: "Transfer from AUB",
    },
    {
      patterns: [/received\s+gcash\s+from\s+shopeepay/i],
      replacement: "Transfer from ShopeePay",
    },
    {
      patterns: [/received\s+gcash\s+from\s+bti\s+payments/i],
      replacement: "Transfer from BTI Payments",
    },
    {
      patterns: [/received\s+gcash\s+from\s+pj\s+lhuillier/i],
      replacement: "Transfer from PJ Lhuillier",
    },
    {
      patterns: [/deposit\s+to\s+gsave\s+account/i],
      replacement: "Transfer to GSave",
    },
    {
      patterns: [/withdraw\s+from\s+gsave\s+account/i],
      replacement: "Transfer from GSave",
    },
    {
      patterns: [/gcredit/i],
      replacement: "GCredit",
    },
    {
      patterns: [/ggives\s+repayment/i],
      replacement: "GGives Repayment",
    },
    {
      patterns: [/gcash\s+invest\s+subscription/i],
      replacement: "GCash Invest",
    },
    {
      patterns: [/refund\s+from/i],
      replacement: "Refund",
    },
    {
      patterns: [/rebate\s+from\s+purchasing/i],
      replacement: "Load Rebate",
    },
    {
      patterns: [/transfer\s+from\s+\d{10,11}/i],
      replacement: "Incoming Transfer",
    },
    {
      patterns: [/transfer\s+to\s+\d{10,11}/i],
      replacement: "Outgoing Transfer",
    },
  ],
};

const normalizeInstitutionKey = (institution?: string | null) => {
  const normalized = normalizeWhitespace(institution ?? "");
  if (!normalized) {
    return null;
  }

  for (const entry of institutionKeyPatterns) {
    if (entry.patterns.some((pattern) => pattern.test(normalized))) {
      return entry.key;
    }
  }

  return normalized;
};

const applySimplifierRules = (value: string, institution?: string | null) => {
  const normalized = normalizeWhitespace(value);
  if (!normalized) {
    return "";
  }

  const bankKey = normalizeInstitutionKey(institution);
  const rules = bankKey ? simplifierRules[bankKey] ?? [] : [];
  const compact = compactText(normalized);

  for (const rule of rules) {
    if (rule.patterns.some((pattern) => pattern.test(normalized) || pattern.test(compact))) {
      return rule.replacement;
    }
  }

  return normalized;
};

export const humanizeMerchantText = (value: string) => {
  const normalized = normalizeWhitespace(value);
  if (!normalized) {
    return "";
  }

  const replacements: Array<[RegExp, string]> = [
    [/fundtransfer/gi, "Fund Transfer"],
    [/interestearned/gi, "Interest Earned"],
    [/taxwithheld/gi, "Tax Withheld"],
    [/instapaytransferfee/gi, "InstaPay Transfer Fee"],
    [/transfertootherbank/gi, "Transfer to Other Bank"],
    [/transferto/gi, "Transfer to"],
    [/transferfrom/gi, "Transfer from"],
  ];

  let next = normalized;
  for (const [pattern, replacement] of replacements) {
    next = next.replace(pattern, replacement);
  }

  next = next
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/([A-Za-z])(\d)/g, "$1 $2")
    .replace(/(\d)([A-Za-z])/g, "$1 $2")
    .replace(/\s*:\s*/g, ": ")
    .replace(/\s+/g, " ")
    .trim();

  return next;
};

export const simplifyMerchantText = (value: string, institution?: string | null) => {
  const simplified = applySimplifierRules(value, institution);
  return simplified ? humanizeMerchantText(simplified) : "";
};

export const summarizeMerchantText = (value: string, institution?: string | null) => {
  const simplified = simplifyMerchantText(value, institution);
  const compact = simplified.replace(/[^a-z0-9]+/gi, "").toLowerCase();

  if (!simplified) {
    return simplified;
  }

  if (compact.includes("fundtransfer")) {
    return "Fund Transfer";
  }

  if (compact.includes("interestearned")) {
    return "Interest Earned";
  }

  if (compact.includes("taxwithheld")) {
    return "Tax Withheld";
  }

  if (compact.includes("instapaytransferfee")) {
    return "InstaPay Transfer Fee";
  }

  if (compact.includes("transfertootherbank")) {
    return "Transfer to Other Bank";
  }

  if (/^(cash in|cash out|payment to|received|sent|transfer to|transfer from)\b/i.test(simplified)) {
    return simplified.split(/\s+/).slice(0, 3).join(" ");
  }

  return simplified;
};
