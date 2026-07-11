type SimplifierRule = {
  patterns?: RegExp[];
  allPatterns?: RegExp[];
  replacement: string;
};

const normalizeWhitespace = (value: string) => value.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();

const compactText = (value: string) => normalizeWhitespace(value).replace(/[^a-z0-9]+/gi, "").toLowerCase();

const ocrCompoundReplacements: Array<[RegExp, string]> = [
  [/\bATMWITHDRAWAL\b/gi, "ATM Withdrawal"],
  [/\bCASHWITHDRAWAL\b/gi, "Cash Withdrawal"],
  [/\bCASHDEPOSIT\b/gi, "Cash Deposit"],
  [/\bFUNDTRANSFER\b/gi, "Fund Transfer"],
  [/\bBANKTRANSFER\b/gi, "Bank Transfer"],
  [/\bELINKTRANSFER\b/gi, "eLink Transfer"],
  [/\bELINKPAYMENT\b/gi, "eLink Payment"],
  [/\bINTERESTEARNED\b/gi, "Interest Earned"],
  [/\bTAXWITHHELD\b/gi, "Tax Withheld"],
  [/\bINSTAPAYTRANSFERFEE\b/gi, "InstaPay Transfer Fee"],
  [/\bBILLSPAYMENT\b/gi, "Bills Payment"],
  [/\bCASHIN\b/gi, "Cash In"],
  [/\bCASHOUT\b/gi, "Cash Out"],
  [/\bTRANSFERTO\b/gi, "Transfer to"],
  [/\bTRANSFERFROM\b/gi, "Transfer from"],
  [/\bPAYMENTTO\b/gi, "Payment to"],
  [/\bPAYMENTFROM\b/gi, "Payment from"],
];

const decompactMerchantText = (value: string) => {
  const normalized = normalizeWhitespace(value);
  if (!normalized) {
    return "";
  }

  let next = normalized
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/([A-Za-z])(\d)/g, "$1 $2")
    .replace(/(\d)([A-Za-z])/g, "$1 $2");

  for (const [pattern, replacement] of ocrCompoundReplacements) {
    next = next.replace(pattern, replacement);
  }

  return next.replace(/\s+/g, " ").trim();
};

const PREFERRED_MERCHANT_TOKEN_CASE: Record<string, string> = {
  adb: "ADB",
  adobe: "Adobe",
  ai: "AI",
  amex: "Amex",
  atm: "ATM",
  aub: "AUB",
  aws: "AWS",
  bdo: "BDO",
  bpi: "BPI",
  canva: "Canva",
  chatgpt: "ChatGPT",
  cimb: "CIMB",
  discordnitro: "Discord Nitro",
  dunkindonuts: "Dunkin Donuts",
  gcash: "GCash",
  googleone: "Google One",
  gotyme: "GoTyme",
  grab: "Grab",
  grabfood: "GrabFood",
  hsbc: "HSBC",
  ibft: "IBFT",
  instapay: "InstaPay",
  landbank: "LandBank",
  linkedin: "LinkedIn",
  maribank: "MariBank",
  maya: "Maya",
  metrobank: "Metrobank",
  openai: "OpenAI",
  pdax: "PDAX",
  paypal: "PayPal",
  pesonet: "PESONet",
  pldt: "PLDT",
  pnb: "PNB",
  pos: "POS",
  psbank: "PSBank",
  qris: "QRIS",
  qrph: "QRPH",
  qrp: "QRP",
  qrcode: "QR Code",
  rcbc: "RCBC",
  sb: "SB",
  shopee: "Shopee",
  spotify: "Spotify",
  ucpb: "UCPB",
  unionbank: "UnionBank",
  ub: "UB",
  ubereats: "Uber Eats",
  wise: "Wise",
  youtube: "YouTube",
};

const PRESERVE_UPPERCASE_TOKENS = new Set([
  "ATM",
  "BDO",
  "BPI",
  "CIMB",
  "HSBC",
  "IBFT",
  "OCR",
  "OFX",
  "PDF",
  "PHP",
  "PLDT",
  "PNB",
  "POS",
  "PS",
  "QR",
  "RCBC",
  "USD",
  "VAT",
]);

const hasMostlyUppercaseMerchantText = (value: string) => {
  const letters = value.match(/[A-Za-z]/g) ?? [];
  if (letters.length < 4) {
    return false;
  }

  const uppercaseCount = letters.filter((letter) => letter === letter.toUpperCase()).length;
  return uppercaseCount / letters.length >= 0.72;
};

const titleCaseMerchantCore = (value: string): string => {
  if (!value) {
    return "";
  }

  if (/^\d+$/.test(value)) {
    return value;
  }

  const compact = value.replace(/[^A-Za-z0-9]+/g, "").toLowerCase();
  if (compact && PREFERRED_MERCHANT_TOKEN_CASE[compact]) {
    return PREFERRED_MERCHANT_TOKEN_CASE[compact];
  }

  if (/[*\/_-]/.test(value)) {
    return value
      .split(/([*\/_-])/)
      .map((part) => (/^[*\/_-]$/.test(part) ? part : titleCaseMerchantCore(part)))
      .join("");
  }

  if (value.includes("'")) {
    return value
      .split("'")
      .map((part) => titleCaseMerchantCore(part))
      .join("'");
  }

  const upper = value.toUpperCase();
  if (PRESERVE_UPPERCASE_TOKENS.has(upper)) {
    return upper;
  }

  if (/^[A-Z]{2,5}\d*$/.test(upper) && !/^[A-Z]{4,}$/.test(upper)) {
    return upper;
  }

  const lower = value.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
};

const normalizeMerchantDisplayCase = (value: string) => {
  const normalized = normalizeWhitespace(value);
  if (!normalized) {
    return "";
  }

  if (!hasMostlyUppercaseMerchantText(normalized)) {
    return normalized;
  }

  return normalized
    .split(" ")
    .map((token) => {
      const prefix = token.match(/^[^A-Za-z0-9]+/)?.[0] ?? "";
      const suffix = token.match(/[^A-Za-z0-9]+$/)?.[0] ?? "";
      const core = token.slice(prefix.length, token.length - suffix.length);
      if (!core) {
        return token;
      }

      return `${prefix}${titleCaseMerchantCore(core)}${suffix}`;
    })
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
};

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
  { key: "AUB", patterns: [/\b(ASIA\s+UNITED\s+BANK|AUB)\b/i] },
  { key: "PNB", patterns: [/\b(PNB|PHILIPPINE\s+NATIONAL\s+BANK)\b/i] },
  { key: "LandBank", patterns: [/\b(LANDBANK|LAND\s+BANK)\b/i] },
  { key: "UCPB", patterns: [/\b(UCPB|UNITED\s+COCONUT\s+PLANTERS\s+BANK)\b/i] },
  { key: "CIMB", patterns: [/\bCIMB\b/i] },
  { key: "GoTyme", patterns: [/\bGOTYME\b/i] },
];

const simplifierRules: Record<string, SimplifierRule[]> = {
  BDO: [
    {
      patterns: [
        /w\/?d\s*fr\s*sav\s*bdo/i,
        /wdfrsavbdo/i,
        /\batrc?\s+atm\/b\s*2\s*c\s*account\b/i,
        /\batro?\s+atm\/b\s*2\s*c\s*account\b/i,
        /\batm\/b\s*2\s*c\s*account\b/i,
        /\batm\s+withdrawal\b/i,
        /\bwdrawal\b/i,
      ],
      replacement: "ATM Withdrawal",
    },
    {
      patterns: [/\bcw\b/i, /(?:^|\s)\d+\s+cw(?:\s|$)/i],
      replacement: "Cash Withdrawal",
    },
    {
      patterns: [/\bcd\b/i, /(?:^|\s)\d+\s+cd(?:\s|$)/i],
      replacement: "Cash Deposit",
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
      patterns: [/intrest\s+credited/i],
      replacement: "Interest Credited",
    },
    {
      patterns: [/interest\s+withheld/i],
      replacement: "Tax Withheld",
    },
    {
      patterns: [/pob\s+ibft/i, /pob\s*ibft\s*bn/i, /\bibft\s*bn\b/i, /bank\s+transfer/i, /fund\s+transfer/i],
      replacement: "Bank Transfer",
    },
    {
      patterns: [/interbank\s+deposit/i, /funds?\s+deposited/i, /received\s+a\/c/i, /recived\s+a\/c/i],
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
      patterns: [/\beps\s*at\s*en\b.*from:\s*non-bpi\s*terminal\b/i, /\bepsaten\s*0+\s*from:\s*non-bpi\s*terminal\b/i],
      replacement: "ATM Withdrawal",
    },
    {
      patterns: [/\beps\s*at\s*en\b/i, /\bepsaten\b/i],
      replacement: "EPSATEN",
    },
    {
      patterns: [/\bel\/?espay\b/i, /\bespay\b/i],
      replacement: "eL/ESPay",
    },
    {
      patterns: [/elink\s+transfer/i, /elink\s+payment/i],
      replacement: "Inter-bank Fund Transfer",
    },
    {
      patterns: [/e-wallet\s+load-?gcash/i, /to:\s*gcash\s+cash\s+in/i, /\bmbpay\b.*\bgcashcashin\b/i, /\bgcashcashin\b/i],
      replacement: "GCash Cash In",
    },
    {
      patterns: [/from:\s*non-bpi\s+terminal/i, /atm\s+withdrawal/i, /\batmwdl\b/i, /\batm\s*wdl\b/i, /\bwithdrawal\b/i],
      replacement: "ATM Withdrawal",
    },
    {
      patterns: [/\batm\s*cash\s*deposit\b/i, /\batmcashdeposit\b/i, /\batm\s*deposit\b/i],
      replacement: "Cash Deposit",
    },
    {
      patterns: [/service\s*charge/i, /servicecharge/i, /\bsvc\s*chg\b/i],
      replacement: "Service Charge",
    },
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
    {
      patterns: [/payment\s*-\s*thank\s*you/i, /payment\s+thank\s+you/i, /paymentthankyou/i],
      replacement: "Payment",
    },
    {
      patterns: [/puregold/i],
      replacement: "Puregold Price Club",
    },
    {
      patterns: [/shopee/i],
      replacement: "Shopee",
    },
    {
      patterns: [/payment\s+to\s+merchant/i],
      replacement: "Merchant Payment",
    },
    {
      patterns: [/\bexpressnet\/megalinkw?\/drw\b/i, /expressnet.*megalink.*drw/i],
      replacement: "ATM Withdrawal",
    },
    {
      patterns: [/transfer\s+to\s+other\s+bank/i],
      replacement: "Bank Transfer",
    },
    {
      patterns: [/inter-?bank\s+fund\s+transfer/i],
      replacement: "Bank Transfer",
    },
  ],
  UnionBank: [
    {
      patterns: [/office\s*365/i],
      replacement: "Office 365",
    },
    {
      patterns: [/google\s+one/i],
      replacement: "Google One",
    },
    {
      patterns: [/google\s+play/i],
      replacement: "Google Play",
    },
    {
      patterns: [/discord\s+nitro/i],
      replacement: "Discord Nitro",
    },
    {
      patterns: [/foodpanda\s+ph/i, /food\s*panda\s+ph/i, /foodpanda/i],
      replacement: "Foodpanda PH",
    },
    {
      patterns: [/mlbb\s+\d+\s*di/i, /mlbb\s+pass/i, /\bmlbb\b/i],
      replacement: "MLBB Top Up",
    },
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
      patterns: [/\b(?:edl\/)?mbpay\b.*\bgcashcashin\b/i, /\bgcashcashin\b/i],
      replacement: "Auto Cash-In",
    },
    {
      patterns: [/\bwallet\s*transfer\b/i],
      replacement: "Wallet Transfer",
    },
    {
      patterns: [/\bboost\s+campaign\b/i],
      replacement: "Boost Campaign",
    },
    {
      patterns: [/\binterest\s+applied\b/i],
      replacement: "Interest Applied",
    },
    {
      patterns: [/buy\s+load\s+transaction/i, /buyloadtransaction/i],
      replacement: "Buy Load",
    },
    {
      patterns: [/grabpay\s+top\s+up/i],
      replacement: "GrabPay Top Up",
    },
    {
      patterns: [/mrt\s+transport/i],
      replacement: "MRT Transport",
    },
    {
      patterns: [/alipay/i],
      replacement: "Alipay",
    },
    {
      patterns: [/bancnet\s+p2m/i],
      replacement: "BancNet P2M",
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
      patterns: [/payment\s+to\s+ab\s+capital/i],
      replacement: "AB Capital",
    },
    {
      patterns: [/payment\s+to\s+unobank/i, /payment\s+to\s+uno\s+bank/i],
      replacement: "UNO Digital Bank",
    },
    {
      patterns: [/payment\s+to\s+globe\s+telecom(?:\s+one\s+click)?/i],
      replacement: "Globe Telecom",
    },
    {
      patterns: [/payment\s+to\s+dotr\s+mrt\s*3\s+qr/i, /payment\s+to\s+dotr\s+mrt3\s+qr/i],
      replacement: "MRT-3",
    },
    {
      patterns: [/payment\s+to\s+sm\s+parking/i],
      replacement: "SM Parking",
    },
    {
      patterns: [/payment\s+to\s+greenbelt/i],
      replacement: "Greenbelt",
    },
    {
      patterns: [/payment\s+to\s+pickup\s+coffee/i],
      replacement: "Pickup Coffee",
    },
    {
      patterns: [/sent\s+gcash\s+to\s+pdax/i, /payment\s+to\s+philippine\s+digital\s+asset\s+exchang/i],
      replacement: "PDAX",
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
      patterns: [/send\s+money/i],
      replacement: "Send Money",
    },
    {
      patterns: [/received\s+money/i],
      replacement: "Received Money",
    },
    {
      patterns: [/payment\s+to\s+seamoney\s+credit/i],
      replacement: "Seamoney Credit",
    },
    {
      patterns: [/cash\s+in\s+from/i],
      replacement: "Cash In",
    },
    {
      patterns: [/cash\s+out\s+to/i],
      replacement: "Cash Out",
    },
    {
      patterns: [/transfer\s+fee/i],
      replacement: "Transfer Fee",
    },
    {
      patterns: [/interest\s+boost\s+reward/i],
      replacement: "Interest Boost Reward",
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
      patterns: [/\bubphphmmxxxb\b/i],
      replacement: "Transfer from UnionBank",
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
  Wise: [
    {
      patterns: [/viator(?:\.com)?/i],
      replacement: "Viator",
    },
    {
      patterns: [/7-?eleven/i],
      replacement: "7-Eleven",
    },
    {
      patterns: [/hk\s+airport/i],
      replacement: "HK Airport",
    },
    {
      patterns: [/news\s+travels?/i],
      replacement: "News Travels",
    },
    {
      patterns: [/locker\s+hire/i],
      replacement: "Locker Hire",
    },
    {
      patterns: [/great\s+ocean\s+road\s+tra/i],
      replacement: "Great Ocean Road Travel",
    },
    {
      patterns: [/great\s+ocean\s+road\s+choc/i],
      replacement: "Great Ocean Road Chocolate",
    },
    {
      patterns: [/proud\s+mary\s+cafe/i],
      replacement: "Proud Mary Cafe",
    },
    {
      patterns: [/vacation\s+cafe\s+cbd/i],
      replacement: "Vacation Cafe CBD",
    },
    {
      patterns: [/nirvana\s+restaurant/i],
      replacement: "Nirvana Restaurant",
    },
    {
      patterns: [/waterfront\s+mini\s+mart/i],
      replacement: "Waterfront Mini Mart",
    },
    {
      patterns: [/mc\s+bandara\s+inter\s+4/i],
      replacement: "Mc Bandara Inter 4",
    },
    {
      patterns: [/coco\s+dewata\s+dsm\s+2/i],
      replacement: "Coco Dewata DSM 2",
    },
    {
      patterns: [/coco\s+group/i],
      replacement: "Coco Group",
    },
    {
      patterns: [/shop\s+b1\s+gf\s+golden\s+crown/i],
      replacement: "Shop B1 GF Golden Crown",
    },
    {
      patterns: [/ned\s+kelly'?s\s+last\s+stand/i],
      replacement: "Ned Kelly's Last Stand",
    },
    {
      patterns: [/kinsman\s+12614/i],
      replacement: "Kinsman 12614",
    },
    {
      patterns: [/don\s+don\s+donki/i],
      replacement: "Don Don Donki",
    },
    {
      patterns: [/wanli\s+hu/i],
      replacement: "Wanli Hu",
    },
    {
      patterns: [/maria\s+harman/i],
      replacement: "Maria Harman",
    },
    {
      patterns: [/htg\s+ticket\s+sales/i],
      replacement: "HTG Ticket Sales",
    },
    {
      patterns: [/jacks?\s+of\s+bath/i],
      replacement: "Jacks of Bath",
    },
    {
      patterns: [/maldo\s+a\s+f/i],
      replacement: "MALDO A F",
    },
    {
      patterns: [/zehra/i],
      replacement: "ZEHRA",
    },
    {
      patterns: [/gogyo(?:\s*-\s*surry\s+hills)?/i],
      replacement: "Gogyo - Surry Hills",
    },
    {
      patterns: [/milksha(?:\s+syd(?:ney)?)?/i],
      replacement: "Milksha Sydney",
    },
    {
      patterns: [/pedro\s+the\s+grocer(?:\s+makat)?/i],
      replacement: "Pedro the Grocer",
    },
    {
      patterns: [/ls\s+melbourne\s+souvenir/i],
      replacement: "Melbourne Souvenir",
    },
    {
      patterns: [/u\s+neek\s+souvenirs?\s+pty\s+ltd/i, /neek\s+souvenirs?\s+pty\s+ltd/i],
      replacement: "U Neek Souvenirs Pty Ltd",
    },
    {
      patterns: [/sydney\s+harbour\s+gifts?/i],
      replacement: "Sydney Harbour Gifts",
    },
    {
      patterns: [/ls\s+four\s+frogs\s+circular/i],
      replacement: "Four Frogs Circular",
    },
    {
      patterns: [/ls\s+mayeb\s+sammy/i],
      replacement: "Mayeb Sammy",
    },
    {
      patterns: [/v\s+happy\s+foods\s+pty\s+ltd/i],
      replacement: "Happy Foods Pty Ltd",
    },
    {
      patterns: [/ls\s+skyway\s+restaurant/i],
      replacement: "Skyway Restaurant",
    },
    {
      patterns: [/wootea\s+george\s+st/i],
      replacement: "Wootea George St",
    },
    {
      patterns: [/s1peron\s*-\s*zeller/i],
      replacement: "S1peron - Zeller",
    },
    {
      patterns: [/samyan\s+mitrtown/i],
      replacement: "Samyan Mitrtown",
    },
    {
      patterns: [/asia\s+books/i],
      replacement: "Asia Books",
    },
    {
      patterns: [/black\s+cabin\s+bar/i, /lpe\s+black\s+cabin\s+bar/i],
      replacement: "Black Cabin Bar",
    },
    {
      patterns: [/liberty\s+oil\s+convenience/i],
      replacement: "Liberty Oil Convenience",
    },
    {
      patterns: [/citibank\s+ire\s+fin\s+s/i],
      replacement: "Citibank IRE FIN S",
    },
  ],
  RCBC: [
    {
      patterns: [/15-?ppass/i],
      replacement: "Priority Pass",
    },
    {
      patterns: [/klook\s+flickk?et/i],
      replacement: "Klook",
    },
    {
      patterns: [/wholesome\s+table/i],
      replacement: "Wholesome Table",
    },
    {
      patterns: [/linkedinprea/i, /linkedin(?:\s+premium)?/i],
      replacement: "LinkedIn Premium",
    },
    {
      patterns: [/alila\s+villas\s+uluwatu/i],
      replacement: "Alila Villas Uluwatu",
    },
    {
      patterns: [/revolver\s+espresso/i],
      replacement: "Revolver Espresso",
    },
    {
      patterns: [/home\s+affairs\s*-\s*online/i],
      replacement: "Home Affairs Online",
    },
    {
      patterns: [/jetstar\s+air/i],
      replacement: "Jetstar",
    },
    {
      patterns: [/wong\s+place/i],
      replacement: "Wong Place",
    },
    {
      patterns: [/\bjco\b.*glorietta/i, /\bj\.?\s*co\b/i],
      replacement: "J.CO Donuts",
    },
    {
      patterns: [/coffee\s+academics/i],
      replacement: "The Coffee Academics",
    },
    {
      patterns: [/toby\s+s\s+estate\s+coffe?e?r?/i],
      replacement: "Toby's Estate",
    },
    {
      patterns: [/bacolod\s+chicken\s+inasal/i],
      replacement: "Bacolod Chicken Inasal",
    },
    {
      patterns: [/\bthe\s+sm\s+store\b.*\bsm\s+fairview\b/i, /\bsm\s+fairview\b/i],
      replacement: "SM Store - SM Fairview",
    },
    {
      patterns: [/\bthe\s+sm\s+store\b.*\bsm\s+grand\s+caloocan\b/i, /\bsm\s+grand\s+caloocan\b/i],
      replacement: "SM Store - SM Grand Caloocan",
    },
    {
      patterns: [/\bbayad\s+online\b.*\bpasig\b/i, /\bbayad\s+online\b/i],
      replacement: "Bayad Online",
    },
    {
      patterns: [/\bsec\s+pasay\b/i],
      replacement: "SEC Pasay PH",
    },
    {
      patterns: [/cash\s+payment/i],
      replacement: "Cash Payment",
    },
    {
      patterns: [/payment\s+to\s+card/i],
      replacement: "Card Payment",
    },
    {
      patterns: [/card\s+payment/i],
      replacement: "Card Payment",
    },
    {
      patterns: [/cash\s+advance/i],
      replacement: "Cash Advance",
    },
    {
      patterns: [/interest\s+charge/i, /finance\s+charge/i, /late\s+charge/i],
      replacement: "Finance Charge",
    },
    {
      patterns: [/cash\s+payment\s*-\s*thank\s+you/i],
      replacement: "Cash Payment",
    },
  ],
  Maya: [
    {
      patterns: [/interest\s+applied\s*\(at\s*3\.5%\s*p\.a\.\)/i, /interest\s+applied/i],
      replacement: "Base Interest",
    },
    {
      patterns: [/boost\s+campaign\s+interest\s+applied/i],
      replacement: "Boost Interest",
    },
    {
      patterns: [/base\s+interest\s+withholding\s+tax/i],
      replacement: "Tax Withheld",
    },
    {
      patterns: [/boost\s+campaign\s+interest\s+withholding\s+tax/i],
      replacement: "Boost Tax Withheld",
    },
    {
      patterns: [/fee\s+applied/i],
      replacement: "Transfer Fee",
    },
    {
      patterns: [/wallet\s+transfer/i],
      allPatterns: [/my\s+wallet/i],
      replacement: "Transfer to Maya Wallet",
    },
    {
      patterns: [/wallet\s+transfer/i],
      replacement: "Wallet Transfer",
    },
    {
      patterns: [/transfer\s+is\s+successfully\s+sent\s+to\s+bancnet/i],
      replacement: "Transfer to BancNet",
    },
    {
      patterns: [/deposit/i],
      replacement: "Deposit",
    },
    {
      patterns: [/withdrawal/i],
      replacement: "Withdrawal",
    },
    {
      patterns: [/auto\s+cash-?in/i],
      replacement: "Auto Cash-In",
    },
    {
      patterns: [/repayment/i],
      replacement: "Repayment",
    },
    {
      patterns: [/transfer\s+to\s+wallet/i],
      replacement: "Credit Drawdown",
    },
    {
      patterns: [/service\s+fee/i],
      replacement: "Service Fee",
    },
    {
      patterns: [/penalty\s+fee/i],
      replacement: "Penalty Fee",
    },
    {
      patterns: [/\bdst\b/i],
      replacement: "Documentary Stamp Tax",
    },
  ],
  CIMB: [
    {
      patterns: [/credit\s+interest\s+account/i],
      replacement: "Credit Interest",
    },
    {
      patterns: [/tax\s+rate/i],
      replacement: "Tax Withheld",
    },
    {
      patterns: [/back\s+office\s+cash\s+in\s*\(?icms\)?/i, /back\s+office\s+cash\s+in/i],
      replacement: "Cash In Adjustment",
    },
    {
      patterns: [/instapay\s+inward\s+transfer\s+to/i, /insta\s*pay\s+inward\s+transfer\s+to/i],
      replacement: "InstaPay Inward",
    },
    {
      patterns: [/instapay\s+transfer\s+to/i, /insta\s*pay\s+transfer\s+to/i],
      replacement: "InstaPay Transfer Out",
    },
    {
      patterns: [/transfer\s+to\s+vicky\s+antonio\s+chavez/i],
      replacement: "Transfer to Vicky Antonio Chavez",
    },
    {
      patterns: [/transfer\s+to\s+antoinette\s+ann\s+lorenzo/i],
      replacement: "Transfer to Antoinette Ann Lorenzo",
    },
    {
      patterns: [/opening\s+balance/i],
      replacement: "Opening Balance",
    },
  ],
  "Security Bank": [
    {
      patterns: [/dpac\s+dgbanker\s+credit/i, /dgbanker\s+credit/i],
      replacement: "Payroll Credit",
    },
    {
      patterns: [/atwd\s+atm\s+withdrawal/i, /\batwd\b.*\batm\s+withdrawal\b/i, /atm\s+withdrawal/i],
      replacement: "ATM Withdrawal",
    },
    {
      patterns: [/ibft\s+bancnet\s+tfr-?cr/i, /bancnet\s+tfr-?cr/i],
      replacement: "BancNet Transfer In",
    },
    {
      patterns: [/instapay\s+fee\s*-\s*dr/i, /instapay\s+fee/i, /instapayfee/i],
      replacement: "InstaPay Fee",
    },
    {
      patterns: [/atro\s+atm\/b\s*2\s*c\s+account/i, /\batro\b.*atm\/b\s*2\s*c\s+account/i, /atro\s+atm\/b2c\s+account/i, /\batro\b.*atm\/b2c\s+account/i],
      replacement: "Account Transfer Out",
    },
    {
      patterns: [/atrc\s+atm\/b\s*2\s*c\s+account/i, /\batrc\b.*atm\/b\s*2\s*c\s+account/i, /atrc\s+atm\/b2c\s+account/i, /\batrc\b.*atm\/b2c\s+account/i],
      replacement: "Account Transfer In",
    },
  ],
  Metrobank: [
    {
      patterns: [/mercury\s+drug/i],
      replacement: "Mercury Drug",
    },
    {
      patterns: [/puregold/i],
      replacement: "Puregold",
    },
    {
      patterns: [/ateneo\s+de\s+manila/i],
      replacement: "Ateneo de Manila",
    },
    {
      patterns: [/rae\s+auto\s+electrical/i],
      replacement: "RAE Auto Electrical",
    },
    {
      patterns: [/qps\s+robinsons\s+spmkt/i, /robinsons\s+spmkt/i],
      replacement: "Robinsons Supermarket",
    },
    {
      patterns: [/finance\s+charges?/i],
      replacement: "Finance Charges",
    },
    {
      patterns: [/interbank\s+fund\s+transfer/i],
      replacement: "Interbank Fund Transfer",
    },
    {
      patterns: [/et\s+cr\s+ibft/i],
      replacement: "Incoming Interbank Transfer",
    },
    {
      patterns: [/et\s+db\s+ibft/i],
      replacement: "Outgoing Interbank Transfer",
    },
    {
      patterns: [/fund\s+transfer\s+sent\s+to/i],
      replacement: "Fund Transfer Sent To",
    },
    {
      patterns: [/fund\s+transfer\s+received\s+from/i],
      replacement: "Fund Transfer Received From",
    },
    {
      patterns: [/wa\s+cr/i],
      replacement: "Incoming Transfer",
    },
    {
      patterns: [/wa\s+db/i],
      replacement: "Outgoing Transfer",
    },
    {
      patterns: [/cash\/?check\s+deposit/i],
      replacement: "Cash/Check Deposit",
    },
    {
      patterns: [/st\s+dm\s+gen/i],
      replacement: "System Debit",
    },
    {
      patterns: [/st\s+cm\s+gen/i],
      replacement: "System Credit",
    },
    {
      patterns: [/mo\s+dm/i],
      replacement: "Miscellaneous Debit",
    },
    {
      patterns: [/interbank\s+service\s+charge/i, /et\s+ibft\s+svchg/i],
      replacement: "Interbank Service Charge",
    },
    {
      patterns: [/et\s+wd\s+acq\s+svchg/i],
      replacement: "ATM Withdrawal Acquirer Fee",
    },
    {
      patterns: [/et\s+wdl/i],
      replacement: "ATM Withdrawal",
    },
    {
      patterns: [/interest\s+earned/i],
      replacement: "Interest Earned",
    },
    {
      patterns: [/tax\s+withheld/i],
      replacement: "Tax Withheld",
    },
    {
      patterns: [/cash\s+payment\s*-\s*thank\s+you\s*-\s*mb\s+atm/i, /cash\s+payment\s*-\s*thank\s+you\s*-\s*mb/i],
      replacement: "Cash Payment",
    },
    {
      patterns: [/bills\s+payment\s+to\s+metrobank\s+credit\s+card/i],
      replacement: "Bills Payment to Metrobank Credit Card",
    },
    {
      patterns: [/bills\s+payment\s+to\s+bdo\s+credit\s+card/i],
      replacement: "Bills Payment to BDO Credit Card",
    },
    {
      patterns: [/bills\s+payment\s+to\s+bankard\/rcbc/i],
      replacement: "Bills Payment to Bankard/RCBC",
    },
    {
      patterns: [/investment\s+sweep/i],
      replacement: "Investment Sweep",
    },
    {
      patterns: [/salary\s+credit/i],
      replacement: "Salary Credit",
    },
    {
      patterns: [/instapay\s+fee/i],
      replacement: "InstaPay Fee",
    },
    {
      patterns: [/meralco/i],
      replacement: "Meralco",
    },
    {
      patterns: [/apple/i],
      replacement: "Apple",
    },
    {
      patterns: [/grab/i],
      replacement: "Grab",
    },
    {
      patterns: [/openai\s+\*?chatgpt\s+subscription/i],
      replacement: "OpenAI ChatGPT Subscription",
    },
  ],
  AUB: [
    {
      patterns: [/\bICC\b/i, /\bILNSDM1?\b/i],
      replacement: "Internal Clearing",
    },
    {
      patterns: [/payment\s+-\s+thank\s+you/i],
      replacement: "Payment - Thank You",
    },
    {
      patterns: [/finance\s+charge/i],
      replacement: "Finance Charge",
    },
    {
      patterns: [/atmwd/i],
      replacement: "ATM Withdrawal",
    },
    {
      patterns: [/afcinq/i],
      replacement: "ATM Fee Inquiry",
    },
    {
      patterns: [/instapay\s+credit/i],
      replacement: "Instapay Credit",
    },
    {
      patterns: [/instapay\s+debit/i],
      replacement: "Instapay Debit",
    },
    {
      patterns: [/check\s+issued/i],
      replacement: "Check Issued",
    },
    {
      patterns: [/cash\s+deposit/i],
      replacement: "Cash Deposit",
    },
    {
      patterns: [/\bCD\b/i],
      replacement: "Cash Deposit",
    },
    {
      patterns: [/credit\s+movement/i],
      replacement: "Credit Movement",
    },
    {
      patterns: [/\bNFTC\b/i, /\bWFTC\b/i],
      replacement: "Credit Movement",
    },
    {
      patterns: [/debit\s+movement/i],
      replacement: "Debit Movement",
    },
    {
      patterns: [/\bDRT\b/i],
      replacement: "Debit Movement",
    },
    {
      patterns: [/encashment/i],
      replacement: "Encashment",
    },
    {
      patterns: [/\bENC\b/i],
      replacement: "Encashment",
    },
    {
      patterns: [/check\s+deposit/i],
      replacement: "Check Deposit",
    },
    {
      patterns: [/\bPDCK3\b/i],
      replacement: "Check Deposit",
    },
    {
      patterns: [/\bCK1\b/i],
      replacement: "Check Issued",
    },
    {
      patterns: [/internal\s+clearing\s+on-?us/i],
      replacement: "Internal Clearing On-Us",
    },
    {
      patterns: [/internal\s+clearing/i],
      replacement: "Internal Clearing",
    },
    {
      patterns: [/on-?us\s+transaction/i],
      replacement: "On-Us Transaction",
    },
    {
      patterns: [/\bONUS\b/i],
      replacement: "On-Us Transaction",
    },
    {
      patterns: [/interest\s+earned/i, /\bint\b/i],
      replacement: "Interest Earned",
    },
    {
      patterns: [/tax/i, /service\s+fee\s*-\s*below\s+minimum/i],
      replacement: "Tax Withheld",
    },
  ],
  PNB: [
    {
      patterns: [/fund\s+transfer/i],
      replacement: "Fund Transfer",
    },
    {
      patterns: [/cm[_\s-]?inward[_\s-]?r\s+remittance/i, /inward\s+remittance/i],
      replacement: "Incoming Remittance",
    },
    {
      patterns: [/received\s+from/i, /received\s+payment/i],
      replacement: "Incoming Transfer",
    },
    {
      patterns: [/dm[_\s-]?intra[_\s-]?xfr\s+transfer/i, /intra[_\s-]?bank\s+transfer/i],
      replacement: "Intra-Bank Transfer",
    },
    {
      patterns: [/transfer\s+to\s+gcash/i],
      replacement: "Transfer to GCash",
    },
    {
      patterns: [/gcash\s+top-?up/i],
      replacement: "GCash Top-up",
    },
    {
      patterns: [/online\s+transfer\s+to/i],
      replacement: "Online Transfer",
    },
    {
      patterns: [/transfer\s+to\s+maya/i],
      replacement: "Transfer to Maya",
    },
    {
      patterns: [/transfer\s+from\s+maya/i],
      replacement: "Transfer from Maya",
    },
    {
      patterns: [/atm\s+withdrawal/i, /cash\s+withdrawal/i],
      replacement: "ATM Withdrawal",
    },
    {
      patterns: [/transfer\s+fee/i, /atm\s+fee/i],
      replacement: "Transfer Fee",
    },
    {
      patterns: [/bills?\s+payment\s+meralco/i, /meralco/i],
      replacement: "Meralco",
    },
    {
      patterns: [/month-?end\s+sweep\s+to\s+investment\s+account/i],
      replacement: "Month-End Sweep",
    },
    {
      patterns: [/check[_\s-]?dep(?:osit)?/i, /check\s+deposit/i],
      replacement: "Check Deposit",
    },
    {
      patterns: [/cash[_\s-]?deposit/i],
      replacement: "Cash Deposit",
    },
    {
      patterns: [/adjustment\s+reversal/i],
      replacement: "Adjustment Reversal",
    },
    {
      patterns: [/withholding\s+tax/i, /tax\s+withheld/i],
      replacement: "Tax Withheld",
    },
    {
      patterns: [/interest\s+earned/i],
      replacement: "Interest Earned",
    },
    {
      patterns: [/salary\s+credit/i],
      replacement: "Salary Credit",
    },
    {
      patterns: [/cash\s+payment/i],
      replacement: "Cash Payment",
    },
    {
      patterns: [/openai\s+chatgpt\s+subscription/i],
      replacement: "OpenAI ChatGPT Subscription",
    },
    {
      patterns: [/chk[_\s-]?batch\s+local/i, /ccd\s+\d+\s+_?chk[_\s-]?batch\s+local/i],
      replacement: "Check Batch Local",
    },
    {
      patterns: [/emit[_\s-]?intl\s+transaction/i],
      replacement: "International Transaction",
    },
    {
      patterns: [/lazada/i],
      replacement: "Lazada",
    },
    {
      patterns: [/airbnb/i],
      replacement: "Airbnb",
    },
    {
      patterns: [/cebu\s+pacific/i],
      replacement: "Cebu Pacific",
    },
    {
      patterns: [/klook/i],
      replacement: "Klook",
    },
    {
      patterns: [/qantas/i],
      replacement: "Qantas",
    },
    {
      patterns: [/din\s+tai\s+fung/i],
      replacement: "Din Tai Fung",
    },
    {
      patterns: [/apple/i],
      replacement: "Apple",
    },
    {
      patterns: [/grab/i],
      replacement: "Grab",
    },
    {
      patterns: [/petron/i],
      replacement: "Petron",
    },
  ],
  EastWest: [
    {
      patterns: [/salary\s+credit/i],
      replacement: "Salary Credit",
    },
    {
      patterns: [/fund\s+transfer/i],
      replacement: "Fund Transfer",
    },
    {
      patterns: [/transfer\s+fee/i],
      replacement: "Transfer Fee",
    },
    {
      patterns: [/meralco/i],
      replacement: "Meralco",
    },
    {
      patterns: [/debit\s+card\s+purchase/i],
      replacement: "Debit Card Purchase",
    },
    {
      patterns: [/atm\s+withdrawal/i, /cash\s+withdrawal/i],
      replacement: "ATM Withdrawal",
    },
    {
      patterns: [/atm\s+fee/i],
      replacement: "ATM Fee",
    },
    {
      patterns: [/interest\s+earned/i],
      replacement: "Interest Earned",
    },
    {
      patterns: [/tax\s+withheld/i],
      replacement: "Tax Withheld",
    },
    {
      patterns: [/adjustment\s+reversal/i],
      replacement: "Adjustment Reversal",
    },
    {
      patterns: [/cash\s+payment/i],
      replacement: "Cash Payment",
    },
    {
      patterns: [/grab/i],
      replacement: "Grab",
    },
    {
      patterns: [/openai\s+chatgpt\s+subscription/i],
      replacement: "OpenAI ChatGPT Subscription",
    },
    {
      patterns: [/lazada/i],
      replacement: "Lazada",
    },
    {
      patterns: [/cebu\s+pacific/i],
      replacement: "Cebu Pacific",
    },
    {
      patterns: [/klook/i],
      replacement: "Klook",
    },
    {
      patterns: [/airbnb/i],
      replacement: "Airbnb",
    },
    {
      patterns: [/din\s+tai\s+fung/i],
      replacement: "Din Tai Fung",
    },
    {
      patterns: [/petron/i],
      replacement: "Petron",
    },
    {
      patterns: [/apple/i],
      replacement: "Apple",
    },
  ],
  LandBank: [
    {
      patterns: [/salary\s+credit/i],
      replacement: "Salary Credit",
    },
    {
      patterns: [/pesonet\s+transfer\s+to/i],
      replacement: "PESONet Transfer",
    },
    {
      patterns: [/interbank\s+transfer\s+fee/i],
      replacement: "Interbank Transfer Fee",
    },
    {
      patterns: [/transfer\s+to\s+gcash/i],
      replacement: "Transfer to GCash",
    },
    {
      patterns: [/transfer\s+to\s+maya/i],
      replacement: "Transfer to Maya",
    },
    {
      patterns: [/transfer\s+from\s+gcash/i],
      replacement: "Transfer from GCash",
    },
    {
      patterns: [/transfer\s+from\s+maya/i],
      replacement: "Transfer from Maya",
    },
    {
      patterns: [/fund\s+transfer/i],
      replacement: "Fund Transfer",
    },
    {
      patterns: [/bills?\s+payment\s*-\s*meralco/i, /meralco/i],
      replacement: "Meralco",
    },
    {
      patterns: [/atm\s+withdrawal/i, /\batmw/i, /cash\s+withdrawal/i],
      replacement: "ATM Withdrawal",
    },
    {
      patterns: [/atm\s+fee/i],
      replacement: "ATM Fee",
    },
    {
      patterns: [/interest\s+earned/i],
      replacement: "Interest Earned",
    },
    {
      patterns: [/tax\s+withheld/i],
      replacement: "Tax Withheld",
    },
    {
      patterns: [/adjustment/i],
      replacement: "Adjustment",
    },
    {
      patterns: [/cash\s+payment/i],
      replacement: "Cash Payment",
    },
    {
      patterns: [/openai\s+chatgpt\s+subscription/i],
      replacement: "OpenAI ChatGPT Subscription",
    },
  ],
  UCPB: [
    {
      patterns: [/csd/i],
      replacement: "Cash Deposit",
    },
    {
      patterns: [/icc/i],
      replacement: "Internal Clearing Check",
    },
    {
      patterns: [/dm/i],
      replacement: "Debit Memo",
    },
    {
      patterns: [/cav/i],
      replacement: "Cash Advance Voucher",
    },
    {
      patterns: [/sc/i],
      replacement: "Service Charge",
    },
    {
      patterns: [/salary/i],
      replacement: "Salary Credit",
    },
    {
      patterns: [/interest/i],
      replacement: "Interest Earned",
    },
    {
      patterns: [/cash\s+deposit/i],
      replacement: "Cash Deposit",
    },
    {
      patterns: [/cash\s+out\s+order/i],
      replacement: "Cash Out Order",
    },
    {
      patterns: [/account\s+replenishment/i, /internet\s+banking\s+replenishment/i],
      replacement: "Account Replenishment",
    },
    {
      patterns: [/transfer\s+to\s+gcash/i],
      replacement: "Transfer to GCash",
    },
    {
      patterns: [/transfer\s+to\s+maya/i],
      replacement: "Transfer to Maya",
    },
    {
      patterns: [/transfer\s+from\s+maya/i],
      replacement: "Transfer from Maya",
    },
    {
      patterns: [/bill\s+payment/i, /bills\s+payment/i],
      replacement: "Bill Payment",
    },
    {
      patterns: [/meralco/i],
      replacement: "Meralco",
    },
  ],
  MariBank: [
    {
      patterns: [/internal\s+transfer/i],
      replacement: "Internal Transfer",
    },
    {
      patterns: [/fund\s+transfer/i],
      replacement: "Fund Transfer",
    },
    {
      patterns: [/instapay\s+transfer\s+to\s+gcash\s*9981/i, /transfer\s+to\s+gcash/i],
      replacement: "Transfer to GCash",
    },
    {
      patterns: [/transfer\s+fee/i],
      replacement: "Transfer Fee",
    },
    {
      patterns: [/meralco/i],
      replacement: "Meralco",
    },
    {
      patterns: [/globe\s+postpaid/i],
      replacement: "Globe Postpaid",
    },
    {
      patterns: [/promo\s+reward/i],
      replacement: "Promo Reward",
    },
    {
      patterns: [/adjustment\s+reversal/i],
      replacement: "Adjustment Reversal",
    },
    {
      patterns: [/transfer\s+to\s+pocket/i],
      replacement: "Transfer to Pocket",
    },
    {
      patterns: [/transfer\s+from\s+pocket/i],
      replacement: "Transfer from Pocket",
    },
  ],
  GoTyme: [
    {
      patterns: [/card\s+payment\s+at\s+grab/i, /grab\s+payment/i],
      replacement: "Grab",
    },
    {
      patterns: [/card\s+payment\s+at\s+move\s*it/i],
      replacement: "Move It",
    },
    {
      patterns: [/lazada\s+purchase/i, /refund\s+-\s+lazada/i],
      replacement: "Lazada",
    },
    {
      patterns: [/shopee\s+purchase/i, /refund\s+-\s+shopee/i],
      replacement: "Shopee",
    },
    {
      patterns: [/netflix\s+subscription/i],
      replacement: "Netflix",
    },
    {
      patterns: [/pay\s*maya\s+load\s+purchase/i, /paymaya\s+load\s+purchase/i, /in-app\s+purchase\s+for\s+mobile/i],
      replacement: "Load Purchase",
    },
    {
      patterns: [/outbound\s+interbank\s+transfer/i],
      replacement: "Outbound Transfer",
    },
    {
      patterns: [/inbound\s+interbank\s+transfer/i],
      replacement: "Inbound Transfer",
    },
    {
      patterns: [/interbank\s+transfer\s+fee/i],
      replacement: "Transfer Fee",
    },
    {
      patterns: [/withdrawal\s+via\s+atm/i],
      replacement: "ATM Withdrawal",
    },
    {
      patterns: [/pvb\s+building\s+justice\s+r\s*omu\s+tacloban\s+cty\s*ph/i, /\bjustice\s+romualdez\b.*\btacloban\b/i],
      replacement: "PVB ATM",
    },
    {
      patterns: [/\bgsis\s+tacloban\b/i],
      replacement: "GSIS Tacloban",
    },
    {
      patterns: [/\bsmct[_\s-]*grndc\s+east\s+gracepaph\b/i, /\bsm\s*city\s+tacloban\b/i],
      replacement: "SM City Tacloban",
    },
    {
      patterns: [/^tacloban(?:\s+city)?\s+ph$/i, /^tacloban\s+2\s+tacloban\s+lytph$/i],
      replacement: "Tacloban",
    },
    {
      patterns: [/atm\s+withdrawal\s+fee/i],
      replacement: "ATM Fee",
    },
    {
      patterns: [/deposit\s+at\s+robinsons/i],
      replacement: "Cash Deposit",
    },
    {
      patterns: [/deposit\s+fee/i],
      replacement: "Deposit Fee",
    },
    {
      patterns: [/go\s+rewards\s+points\s+redemption/i],
      replacement: "Go Rewards Redemption",
    },
    {
      patterns: [/qr\s+payment/i],
      replacement: "QR Payment",
    },
    {
      patterns: [/electricity\s+bill\s+payment\s+to\s+meralco/i],
      replacement: "Meralco",
    },
    {
      patterns: [/telecoms\s+bill\s+payment\s+to\s+pldt/i],
      replacement: "PLDT",
    },
    {
      patterns: [/toll\s+bill\s+payment\s+to\s+autosweep\s+rfid/i],
      replacement: "Autosweep RFID",
    },
    {
      patterns: [/transfer\s+to\s+go\s*save\s+account/i],
      replacement: "Transfer to Go Save",
    },
    {
      patterns: [/transfer\s+from\s+go\s*save\s+account/i],
      replacement: "Transfer from Go Save",
    },
    {
      patterns: [/transfer\s+from\s+gotyme\s+bank\s+account/i],
      replacement: "Transfer from GoTyme",
    },
    {
      patterns: [/transfer\s+to\s+gotyme\s+bank\s+account/i],
      replacement: "Transfer to GoTyme",
    },
    {
      patterns: [/received\s+gcash/i, /gcash\s+received/i, /gcash\s+received\s+from/i],
      replacement: "GCash Received",
    },
    {
      patterns: [/earned\s+interest/i],
      replacement: "Interest Earned",
    },
    {
      patterns: [/withholding\s+tax/i],
      replacement: "Tax Withheld",
    },
    {
      patterns: [/salary\s+credit/i],
      replacement: "Salary Credit",
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
  const normalized = decompactMerchantText(value);
  if (!normalized) {
    return "";
  }

  const bankKey = normalizeInstitutionKey(institution);
  const rules = bankKey ? simplifierRules[bankKey] ?? [] : [];
  const compact = compactText(normalized);

  for (const rule of rules) {
    const anyMatch = rule.patterns?.some((pattern) => pattern.test(normalized) || pattern.test(compact)) ?? false;
    const allMatch = rule.allPatterns?.every((pattern) => pattern.test(normalized) || pattern.test(compact)) ?? true;
    if (anyMatch && allMatch) {
      return rule.replacement;
    }
  }

  return normalized;
};

export const humanizeMerchantText = (value: string) => {
  const normalized = decompactMerchantText(value);
  if (!normalized) {
    return "";
  }

  const replacements: Array<[RegExp, string]> = [
    [/^(?:\d{1,2}:\d{2}\s*)?(?:AM|PM)\s+(?=(?:Payment|Transfer|Cash|Buy|Send|Received|Sent|Add|Withdraw|Deposit|Bill|Bills|Top\s*Up|Load|Purchase|Card|ATM))/i, ""],
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

  return normalizeMerchantDisplayCase(next);
};

const genericSimplifierRules: SimplifierRule[] = [
  {
    patterns: [/\batm\s+withdrawal\b/i, /\batmwithdrawal\b/i, /\bwithdrawal\b/i],
    replacement: "ATM Withdrawal",
  },
  {
    patterns: [/\bcash\s+withdrawal\b/i, /\bcashwithdrawal\b/i],
    replacement: "Cash Withdrawal",
  },
  {
    patterns: [/\bcash\s+deposit\b/i, /\bcashdeposit\b/i],
    replacement: "Cash Deposit",
  },
  {
    patterns: [/\bfund\s+transfer\b/i, /\bfundtransfer\b/i],
    replacement: "Fund Transfer",
  },
  {
    patterns: [/\bbank\s+transfer\b/i, /\bbanktransfer\b/i, /transfer\s+to\s+other\s+bank/i, /inter-?bank\s+fund\s+transfer/i],
    replacement: "Bank Transfer",
  },
  {
    patterns: [/\binterest\s+earned\b/i, /\binterestearned\b/i],
    replacement: "Interest Earned",
  },
  {
    patterns: [/\btax\s+withheld\b/i, /\btaxwithheld\b/i],
    replacement: "Tax Withheld",
  },
  {
    patterns: [/\binstapay\s+transfer\s+fee\b/i, /\binstapaytransferfee\b/i],
    replacement: "InstaPay Transfer Fee",
  },
  {
    patterns: [/bills?\s*payment/i, /\bbillspayment\b/i],
    replacement: "Bills Payment",
  },
  {
    patterns: [/\bcash\s+in\b/i],
    replacement: "Cash In",
  },
  {
    patterns: [/\bcash\s+out\b/i],
    replacement: "Cash Out",
  },
  {
    patterns: [/\bgrab(?:food|car|taxi|express|mart|pay)?\b/i],
    replacement: "Grab",
  },
  {
    patterns: [/\bstarbucks?\b/i],
    replacement: "Starbucks",
  },
  {
    patterns: [/\bdq\s+dairy\s+queen\b/i, /\bdairy\s+queen\b/i],
    replacement: "Dairy Queen",
  },
  {
    patterns: [/\bmcdonald'?s?\b/i, /\bmcdonalds\b/i],
    replacement: "McDonald's",
  },
  {
    patterns: [/\bjollibee\b/i],
    replacement: "Jollibee",
  },
  {
    patterns: [/\bdunkin(?:\s+donuts?)?\b/i, /\bdunkindonuts?\b/i],
    replacement: "Dunkin",
  },
  {
    patterns: [/\bpanco\s+cafe\b/i, /\bpancocafe\b/i],
    replacement: "Panco Cafe",
  },
  {
    patterns: [/\bkoi(?:\s+the)?\b/i, /\bkoithe\b/i],
    replacement: "KOI",
  },
  {
    patterns: [/\bsimply\s+gourmet\b/i, /\bsimplygourmet\b/i],
    replacement: "Simply Gourmet",
  },
  {
    patterns: [/\bhapag\b/i],
    replacement: "Hapag",
  },
  {
    patterns: [/\bharlan\s*\+?\s*holden\b/i, /\bharlanholden\b/i],
    replacement: "Harlan Holden",
  },
  {
    patterns: [/\bmatcha\s+bar\b/i, /\bmatchabar\b/i],
    replacement: "Matcha Bar",
  },
  {
    patterns: [/\belephant\s+grounds\b/i, /\belephantgrounds\b/i],
    replacement: "Elephant Grounds",
  },
  {
    patterns: [/\bmo\s+cookies\b/i, /\bmocookies\b/i],
    replacement: "MO Cookies",
  },
  {
    patterns: [/\bbruno'?s?\s+barbers?\b/i, /\bbrunosbarbers?\b/i],
    replacement: "Brunos Barbers",
  },
  {
    patterns: [/\brobinsons\s+easymart\b/i, /\brobinsonseasymart\b/i],
    replacement: "Robinsons Easymart",
  },
  {
    patterns: [/\buncle\s+john'?s\b/i, /\bunclejohns\b/i],
    replacement: "Uncle John's",
  },
  {
    patterns: [/\brobinsons\s+supermarket\b/i, /\brobinsonssupermarket\b/i],
    replacement: "Robinsons Supermarket",
  },
  {
    patterns: [/\bsavemore\b/i],
    replacement: "Savemore",
  },
  {
    patterns: [/\bshopwise\b/i],
    replacement: "Shopwise",
  },
  {
    patterns: [/\bwaltermart\b/i],
    replacement: "Waltermart",
  },
  {
    patterns: [/\blawson\b/i],
    replacement: "Lawson",
  },
  {
    patterns: [/\bthe\s+marketplace\b/i, /\bthemarketplace\b/i],
    replacement: "The Marketplace",
  },
  {
    patterns: [/\bsm\s+store\b/i, /\bsmstore\b/i],
    replacement: "SM Store",
  },
  {
    patterns: [/\bsm\s+hypermarket\b/i, /\bsmhypermarket\b/i],
    replacement: "SM Hypermarket",
  },
  {
    patterns: [/\bsm\s+supermarket\b/i, /\bsmsupermarket\b/i],
    replacement: "SM Supermarket",
  },
  {
    patterns: [/\bshopee\b/i],
    replacement: "Shopee",
  },
  {
    patterns: [/\blazada\b/i],
    replacement: "Lazada",
  },
  {
    patterns: [/\bamazon\b/i],
    replacement: "Amazon",
  },
  {
    patterns: [/\bpaypal\b/i],
    replacement: "PayPal",
  },
  {
    patterns: [/\bwatsons?\b/i],
    replacement: "Watsons",
  },
  {
    patterns: [/\bmercury\s+drug\b/i, /\bmercurydrug\b/i],
    replacement: "Mercury Drug",
  },
  {
    patterns: [/\bsouthstar\b/i],
    replacement: "Southstar Drug",
  },
  {
    patterns: [/\brose\s+pharmacy\b/i, /\brosepharmacy\b/i],
    replacement: "Rose Pharmacy",
  },
  {
    patterns: [/\bgenerika\b/i],
    replacement: "Generika",
  },
  {
    patterns: [/\bthe\s+generics\b/i, /\bthegenerics\b/i],
    replacement: "The Generics Pharmacy",
  },
  {
    patterns: [/\bhi-?precision\b/i, /\bhiprecision\b/i],
    replacement: "Hi-Precision",
  },
  {
    patterns: [/\bst\.?\s*luke'?s\b/i, /\bstlukes\b/i],
    replacement: "St. Luke's",
  },
  {
    patterns: [/\bmedical\s+city\b/i, /\bmedicalcity\b/i],
    replacement: "The Medical City",
  },
  {
    patterns: [/\bvision\s+express\b/i, /\bvisionexpress\b/i],
    replacement: "Vision Express",
  },
  {
    patterns: [/\bbelo(?:\s+medical\s+group)?\b/i, /\bbelomedicalgroup\b/i],
    replacement: "Belo Medical Group",
  },
  {
    patterns: [/\blinkedin(?:\s+premium)?\b/i, /\blinkedinpremium\b/i],
    replacement: "LinkedIn",
  },
  {
    patterns: [/\bwheyl\s+nutrition\b/i, /\bwheylnutrition\b/i],
    replacement: "Wheyl Nutrition",
  },
  {
    patterns: [/\bpyx\*?\s*wheyl\s+nutrit(?:ion)?\b/i, /\bpyxwheylnutrit(?:ion)?\b/i],
    replacement: "Wheyl Nutrition",
  },
  {
    patterns: [/\bhealthy\s+options\b/i, /\bhealthyoptions\b/i],
    replacement: "Healthy Options",
  },
  {
    patterns: [/\banytime\s+fitness\b/i, /\banytimefitness\b/i],
    replacement: "Anytime Fitness",
  },
  {
    patterns: [/\bfoodpanda(?:\s+ph)?\b/i, /\bfoodpandaph\b/i],
    replacement: "Foodpanda",
  },
  {
    patterns: [/\bspotify\b/i],
    replacement: "Spotify",
  },
  {
    patterns: [/\bnetflix\b/i],
    replacement: "Netflix",
  },
  {
    patterns: [/\bopenai\b/i, /\bchatgpt\b/i],
    replacement: "OpenAI ChatGPT Subscription",
  },
  {
    patterns: [/\bgoogle\s+one\b/i, /\bgoogleone\b/i],
    replacement: "Google One",
  },
  {
    patterns: [/\bapple\s+services?\b/i, /\bappleservices?\b/i],
    replacement: "Apple Services",
  },
  {
    patterns: [/\byoutube\s+premium\b/i, /\byoutubepremium\b/i],
    replacement: "YouTube Premium",
  },
  {
    patterns: [/\btimezone\b/i],
    replacement: "Timezone",
  },
  {
    patterns: [/\bthe\s+fat\s+seed(?:\s+cafe)?\b/i, /\bthefatseed(?:cafe)?\b/i],
    replacement: "The Fat Seed Cafe",
  },
  {
    patterns: [/\bnomad\s+express\b/i, /\bnomadexpress\b/i],
    replacement: "Nomad Express",
  },
  {
    patterns: [/\bthe\s+spa\b/i],
    replacement: "The Spa",
  },
  {
    patterns: [/\bnikkei\b/i],
    replacement: "Nikkei",
  },
  {
    patterns: [/\bmary\s+grace\b/i, /\bmarygrace\b/i],
    replacement: "Mary Grace",
  },
  {
    patterns: [/\bbonchon\b/i],
    replacement: "Bonchon",
  },
  {
    patterns: [/\bkenny\s+rogers\b/i, /\bkennyrogers\b/i],
    replacement: "Kenny Rogers",
  },
  {
    patterns: [/\byoshinoya\b/i],
    replacement: "Yoshinoya",
  },
  {
    patterns: [/\bmarugame\b/i],
    replacement: "Marugame Udon",
  },
  {
    patterns: [/\bkuya\s+j\b/i, /\bkuyaj\b/i],
    replacement: "Kuya J",
  },
  {
    patterns: [/\bmesa\b/i],
    replacement: "Mesa",
  },
  {
    patterns: [/\bsamgyupsalamat\b/i],
    replacement: "Samgyupsalamat",
  },
  {
    patterns: [/\btim\s+ho\s+wan\b/i, /\btimhowan\b/i],
    replacement: "Tim Ho Wan",
  },
  {
    patterns: [/\bgong\s+cha\b/i, /\bgongcha\b/i],
    replacement: "Gong Cha",
  },
  {
    patterns: [/\bchatime\b/i],
    replacement: "Chatime",
  },
  {
    patterns: [/\bkoomi\b/i],
    replacement: "Koomi",
  },
  {
    patterns: [/\bmacao\s+imperial\b/i, /\bmacaoimperial\b/i],
    replacement: "Macao Imperial",
  },
  {
    patterns: [/\btiger\s+sugar\b/i, /\btigersugar\b/i],
    replacement: "Tiger Sugar",
  },
  {
    patterns: [/\bcoco\s+fresh\b/i, /\bcocofresh\b/i],
    replacement: "CoCo Fresh",
  },
  {
    patterns: [/\bbo'?s\s+coffee\b/i, /\bboscoffee\b/i],
    replacement: "Bo's Coffee",
  },
  {
    patterns: [/\bcoffee\s+project\b/i, /\bcoffeeproject\b/i],
    replacement: "Coffee Project",
  },
  {
    patterns: [/\btoby'?s\s+estate\b/i, /\btobysestate\b/i],
    replacement: "Toby's Estate",
  },
  {
    patterns: [/\bbut\s+first,\s*coffee\b/i, /\bbutfirstcoffee\b/i],
    replacement: "But First, Coffee",
  },
  {
    patterns: [/\bhappy\s+lemon\b/i, /\bhappylemon\b/i],
    replacement: "Happy Lemon",
  },
  {
    patterns: [/\bauntie\s+anne'?s\b/i, /\bauntieannes\b/i],
    replacement: "Auntie Anne's",
  },
  {
    patterns: [/\bllao\s*llao\b/i, /\bllaollao\b/i],
    replacement: "llaollao",
  },
  {
    patterns: [/\booma\b/i],
    replacement: "Ooma",
  },
  {
    patterns: [/\bmango\s+tree\b/i, /\bmangotree\b/i],
    replacement: "Mango Tree",
  },
  {
    patterns: [/\bitalianni'?s\b/i, /\bitaliannis\b/i],
    replacement: "Italianni's",
  },
  {
    patterns: [/\btgi\s*friday'?s\b/i, /\btgifridays\b/i],
    replacement: "TGI Fridays",
  },
  {
    patterns: [/\bshakey'?s\b/i, /\bshakeys\b/i],
    replacement: "Shakey's",
  },
  {
    patterns: [/\byellow\s+cab\b/i, /\byellowcab\b/i],
    replacement: "Yellow Cab",
  },
  {
    patterns: [/\bmax'?s\b/i, /\bmaxs\b/i],
    replacement: "Max's",
  },
  {
    patterns: [/\bpanda\s+express\b/i, /\bpandaexpress\b/i],
    replacement: "Panda Express",
  },
  {
    patterns: [/\bcibo\b/i],
    replacement: "Cibo",
  },
  {
    patterns: [/\bnono'?s\b/i, /\bnonos\b/i],
    replacement: "Nono's",
  },
  {
    patterns: [/\bfrankie'?s\b/i, /\bfrankies\b/i],
    replacement: "Frankie's",
  },
  {
    patterns: [/\bbotejyu\b/i],
    replacement: "Botejyu",
  },
  {
    patterns: [/\btuan\s+tuan\b/i, /\btuantuan\b/i],
    replacement: "Tuan Tuan",
  },
  {
    patterns: [/\bsunnies\s+cafe\b/i, /\bsunniescafe\b/i],
    replacement: "Sunnies Cafe",
  },
  {
    patterns: [/\bwildflour\b/i],
    replacement: "Wildflour",
  },
  {
    patterns: [/\bmendokoro\b/i],
    replacement: "Mendokoro",
  },
  {
    patterns: [/\bramen\s+nagi\b/i, /\bramennagi\b/i],
    replacement: "Ramen Nagi",
  },
  {
    patterns: [/\bmanam\b/i],
    replacement: "Manam",
  },
  {
    patterns: [/\bconti'?s\b/i, /\bcontis\b/i],
    replacement: "Conti's",
  },
  {
    patterns: [/\bcoffee\s+bean\b/i, /\bcbtl\b/i, /\bcoffeebean\b/i],
    replacement: "Coffee Bean & Tea Leaf",
  },
  {
    patterns: [/\bseattle'?s\s+best\b/i, /\bseattlesbest\b/i],
    replacement: "Seattle's Best",
  },
  {
    patterns: [/\barmy\s+navy\b/i, /\barmynavy\b/i],
    replacement: "Army Navy",
  },
  {
    patterns: [/\bmister\s+donut\b/i, /\bmisterdonut\b/i],
    replacement: "Mister Donut",
  },
  {
    patterns: [/\bkfc\b/i],
    replacement: "KFC",
  },
  {
    patterns: [/\bpopeyes\b/i],
    replacement: "Popeyes",
  },
  {
    patterns: [/\byardstick\b/i],
    replacement: "Yardstick",
  },
  {
    patterns: [/\byour\s+local\b/i, /\byourlocal\b/i],
    replacement: "Your Local",
  },
  {
    patterns: [/\bbrunch\s+bureau\b/i, /\bbrunchbureau\b/i],
    replacement: "Brunch Bureau",
  },
  {
    patterns: [/\bbreakfast\s+at\s+antonio'?s\b/i, /\bbreakfastatantonios\b/i],
    replacement: "Breakfast at Antonio's",
  },
  {
    patterns: [/\broyce\b/i],
    replacement: "Royce",
  },
  {
    patterns: [/\bbok\s+korean\s+fried\s+chicken\b/i, /\bbokkoreanfriedchicken\b/i],
    replacement: "BOK Korean Fried Chicken",
  },
  {
    patterns: [/\bmystery\s+manila\b/i, /\bmysterymanila\b/i],
    replacement: "Mystery Manila",
  },
  {
    patterns: [/\bralph'?s\s+wines\b/i, /\bralphswines\b/i],
    replacement: "Ralph's Wines",
  },
  {
    patterns: [/\bn(?:ational)?\s*b(?:ook)?\s*s(?:tore)?\b/i, /\bnbs\b/i, /\bnational\s+book\s+store\b/i, /\bnationalbookstore\b/i],
    replacement: "National Book Store",
  },
  {
    patterns: [/\b7-?eleven(?:-st)?\b/i, /\b7elevenst\b/i, /\b7eleven\b/i],
    replacement: "7-Eleven",
  },
  {
    patterns: [/\bfully\s+booked\b/i, /\bfullybooked\b/i],
    replacement: "Fully Booked",
  },
  {
    patterns: [/\brustan'?s\b/i, /\brustans\b/i],
    replacement: "Rustan's",
  },
  {
    patterns: [/\blanders\b/i],
    replacement: "Landers",
  },
  {
    patterns: [/\bs\s*&\s*r\b/i, /\bsnr\b/i],
    replacement: "S&R",
  },
  {
    patterns: [/\buniqlo\b/i],
    replacement: "Uniqlo",
  },
  {
    patterns: [/\bzara\b/i],
    replacement: "Zara",
  },
  {
    patterns: [/\bh\s*&\s*m\b/i, /\bhm\b/i],
    replacement: "H&M",
  },
  {
    patterns: [/\bpower\s+mac\b/i, /\bpowermac\b/i],
    replacement: "Power Mac Center",
  },
  {
    patterns: [/\bbeyond\s+the\s+box\b/i, /\bbeyondthebox\b/i],
    replacement: "Beyond the Box",
  },
  {
    patterns: [/\babenson\b/i],
    replacement: "Abenson",
  },
  {
    patterns: [/\bace\s+hardware\b/i, /\bacehardware\b/i],
    replacement: "Ace Hardware",
  },
  {
    patterns: [/\btrue\s+value\b/i, /\btruevalue\b/i],
    replacement: "True Value",
  },
  {
    patterns: [/\bbench\b/i],
    replacement: "Bench",
  },
  {
    patterns: [/\bpenshoppe\b/i],
    replacement: "Penshoppe",
  },
  {
    patterns: [/\bminiso\b/i],
    replacement: "Miniso",
  },
  {
    patterns: [/\bmuji\b/i],
    replacement: "Muji",
  },
  {
    patterns: [/\bcotton\s+on\b/i, /\bcottonon\b/i],
    replacement: "Cotton On",
  },
  {
    patterns: [/\btoy\s+kingdom\b/i, /\btoykingdom\b/i],
    replacement: "Toy Kingdom",
  },
  {
    patterns: [/\boctagon\b/i],
    replacement: "Octagon",
  },
  {
    patterns: [/\bkidzoona\b/i],
    replacement: "Kidzoona",
  },
  {
    patterns: [/\btom'?s\s+world\b/i, /\btomsworld\b/i],
    replacement: "Tom's World",
  },
  {
    patterns: [/\bworld\s+of\s+fun\b/i, /\bworldoffun\b/i],
    replacement: "World of Fun",
  },
  {
    patterns: [/\bquantum\b/i],
    replacement: "Quantum",
  },
  {
    patterns: [/(?:^|\s)%?\s*arabica\b/i],
    replacement: "Arabica",
  },
  {
    patterns: [/\bpriority\s+pass\b/i, /\b15-?ppass\b/i, /\bppass\b/i],
    replacement: "Priority Pass",
  },
];

const stripLeadingStatementNoise = (value: string) => {
  let next = normalizeWhitespace(value);
  if (!next) {
    return "";
  }

  next = next
    .replace(/^(?:(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2}\s+){1,2}/i, "")
    .replace(/^(?:\d{1,2}\s+(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+){1,2}/i, "")
    .replace(/^\d{3,}\s+(?=[A-Za-z])/i, "");

  return next.trim();
};

const stripTrailingStatementNoise = (value: string) => {
  const normalized = normalizeWhitespace(value);
  if (!normalized) {
    return "";
  }

  return normalized
    .replace(/\s+\d[\d,]*\.\d{1,2}$/u, "")
    .replace(/\s+(?:card|pos|online|retail|e-?commerce)\s+purchase$/iu, "")
    .replace(/\s+(?:purchase|payment|transaction)\s+(?:approved|posted|complete|completed)$/iu, "")
    .replace(/\s+(?:store|branch|terminal|outlet|location|merchant)\s*[:#-]?\s*[A-Z0-9-]{2,}$/iu, "")
    .replace(/\s+(?:ref(?:erence)?|trace|approval|auth(?:orization)?|txn|transaction|terminal|rrn|arn)\s*[:#-]?\s*[A-Z0-9*X-]+(?:\s+[A-Z0-9*X-]+)*$/iu, "")
    .replace(/\s+(?:card|acct|account)\s*(?:no\.?|number|ending|ending\s+in|ending\s+with)?\s*[:#-]?\s*(?:xx|x{2,}|\*{2,})?[A-Z0-9-]*\d{2,4}$/iu, "")
    .replace(/\s+(?:visa|master\s*card|mastercard|amex|jcb)\s*(?:xx|x{2,}|\*{2,})?\d{2,4}$/iu, "")
    .replace(/\s+(?:ph|phl|philippines|sg|singapore|hk|hong\s+kong|au|australia)\s+(?:pte\.?\s*ltd\.?|inc\.?|corp\.?|corporation|co\.?|company|limited|ltd\.?|llc)$/iu, "")
    .replace(/\s+(?:pte\.?\s*ltd\.?|inc\.?|corp\.?|corporation|co\.?|company|limited|ltd\.?|llc)$/iu, "")
    .replace(/\s+/g, " ")
    .trim();
};

const GENERIC_PAYMENT_RAIL_REPLACEMENTS = new Set(["PayPal", "Grab", "GCash", "Maya", "Apple Pay", "Google Pay"]);

const ruleMatchesMerchantText = (rule: SimplifierRule, normalized: string, compact: string) => {
  const anyMatch = rule.patterns?.some((pattern) => pattern.test(normalized) || pattern.test(compact)) ?? false;
  const allMatch = rule.allPatterns?.every((pattern) => pattern.test(normalized) || pattern.test(compact)) ?? true;
  return anyMatch && allMatch;
};

const selectNestedMerchantReplacement = (normalized: string, compact: string) => {
  const matches = genericSimplifierRules
    .filter((rule) => ruleMatchesMerchantText(rule, normalized, compact))
    .map((rule) => rule.replacement);
  if (matches.length < 2) {
    return null;
  }

  const uniqueMatches = [...new Set(matches)];
  const matchedGenericRails = uniqueMatches.filter((replacement) => GENERIC_PAYMENT_RAIL_REPLACEMENTS.has(replacement));
  if (matchedGenericRails.length === 0) {
    return null;
  }

  const specificMatch = uniqueMatches.find((replacement) => !GENERIC_PAYMENT_RAIL_REPLACEMENTS.has(replacement));
  return specificMatch ?? null;
};

export const simplifyMerchantText = (value: string, institution?: string | null) => {
  const simplified = applySimplifierRules(value, institution);
  return simplified ? humanizeMerchantText(simplified) : "";
};

export const summarizeMerchantText = (value: string, institution?: string | null) => {
  const simplified = simplifyMerchantText(value, institution);
  const compact = simplified.replace(/[^a-z0-9]+/gi, "").toLowerCase();
  const rawLower = normalizeWhitespace(value).toLowerCase();
  const rawCompact = compactText(value);

  if (!simplified) {
    return simplified;
  }

  if (institution === "BPI" && (/\bel\s*\/?\s*es\s*p\s*a\s*y\b/i.test(rawLower) || rawCompact.includes("elespay"))) {
    return "eL/ESPay";
  }

  if (/to:\s*gcash\s+cash\s+in|gcash\s*cash\s*in|edl\/?mbpay/i.test(rawLower) || compact.includes("gcashcashin")) {
    return "GCash Cash In";
  }

  if (/open\s*ai|chat\s*gpt/i.test(rawLower) || compact.includes("openaichatgptsubscription")) {
    return "OpenAI ChatGPT Subscription";
  }

  if (institution === "Metrobank") {
    if (/interbank\s+fund\s+transfer\s+credit\s+received\s+from\s+other\s+bank/i.test(rawLower)) {
      return "Incoming Interbank Transfer";
    }
    if (/interbank\s+fund\s+transfer\s+debit\s+send\s+to\s+other\s+bank/i.test(rawLower)) {
      return "Outgoing Interbank Transfer";
    }
    if (/interbank\s+service\s+charge/i.test(rawLower)) {
      return "Interbank Service Charge";
    }
    if (/cash\/?check\s+deposit/i.test(rawLower)) {
      return "Cash/Check Deposit";
    }
    if (/bills?\s+payment\s+to\s+metrobank\s+credit\s+card/i.test(rawLower)) {
      return "Metrobank Credit Card Payment";
    }
    if (/bills?\s+payment\s+to\s+bankard\/rcbc/i.test(rawLower)) {
      return "Bankard/RCBC Credit Card Payment";
    }
  }

  if (institution === "UnionBank" || institution === "UnionBank of the Philippines") {
    const outwardFastPaymentsMatch = simplified.match(/^outward fast payments?\s+(.+)$/i);
    if (outwardFastPaymentsMatch?.[1]) {
      return stripTrailingStatementNoise(stripLeadingStatementNoise(outwardFastPaymentsMatch[1])) || simplified;
    }

    const inwardPaymentsMatch = simplified.match(/^inward payments?\s+(.+)$/i);
    if (inwardPaymentsMatch?.[1]) {
      return stripTrailingStatementNoise(stripLeadingStatementNoise(inwardPaymentsMatch[1])) || simplified;
    }

    const cardPurchaseMatch = simplified.match(/^card purchase\s+(.+)$/i);
    if (cardPurchaseMatch?.[1]) {
      return stripTrailingStatementNoise(stripLeadingStatementNoise(cardPurchaseMatch[1])) || simplified;
    }

    if (/^online\s+instapaysend\b/i.test(simplified)) {
      return "InstaPay Send";
    }

    if (/^online\s+fund\s+transfer\b/i.test(simplified)) {
      return "Fund Transfer";
    }
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

  const nestedMerchantReplacement = selectNestedMerchantReplacement(simplified, compact);
  if (nestedMerchantReplacement) {
    return nestedMerchantReplacement;
  }

  for (const rule of genericSimplifierRules) {
    if (ruleMatchesMerchantText(rule, simplified, compact)) {
      return rule.replacement;
    }
  }

  const stripped = stripTrailingStatementNoise(stripLeadingStatementNoise(simplified));
  return stripped || simplified;
};
