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
  { key: "CIMB", patterns: [/\bCIMB\b/i] },
  { key: "GoTyme", patterns: [/\bGOTYME\b/i] },
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
      patterns: [/elink\s+transfer/i, /elink\s+payment/i],
      replacement: "Payroll Credit",
    },
    {
      patterns: [/e-wallet\s+load-?gcash/i, /to:\s*gcash\s+cash\s+in/i],
      replacement: "GCash Cash In",
    },
    {
      patterns: [/from:\s*non-bpi\s+terminal/i, /atm\s+withdrawal/i, /\bwithdrawal\b/i],
      replacement: "ATM Withdrawal",
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
      patterns: [/payment\s+to\s+merchant/i],
      replacement: "Merchant Payment",
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
      patterns: [/atro\s+atm\/b2c\s+account/i, /\batro\b.*atm\/b2c\s+account/i],
      replacement: "Account Transfer Out",
    },
    {
      patterns: [/atrc\s+atm\/b2c\s+account/i, /\batrc\b.*atm\/b2c\s+account/i],
      replacement: "Account Transfer In",
    },
  ],
  Metrobank: [
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
      replacement: "Wallet Credit",
    },
    {
      patterns: [/wa\s+db/i],
      replacement: "Wallet Debit",
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
      patterns: [/credit\s+movement/i],
      replacement: "Credit Movement",
    },
    {
      patterns: [/debit\s+movement/i],
      replacement: "Debit Movement",
    },
    {
      patterns: [/encashment/i],
      replacement: "Encashment",
    },
    {
      patterns: [/check\s+deposit/i],
      replacement: "Check Deposit",
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
      patterns: [/paymaya\s+load\s+purchase/i, /in-app\s+purchase\s+for\s+mobile/i],
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
    {
      patterns: [/gcash\s+received/i],
      replacement: "GCash Received",
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

  return normalized.replace(/\s+\d[\d,]*\.\d{1,2}$/u, "").trim();
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

  for (const rule of genericSimplifierRules) {
    const anyMatch = rule.patterns?.some((pattern) => pattern.test(simplified) || pattern.test(compact)) ?? false;
    const allMatch = rule.allPatterns?.every((pattern) => pattern.test(simplified) || pattern.test(compact)) ?? true;
    if (anyMatch && allMatch) {
      return rule.replacement;
    }
  }

  if (/^(cash in|cash out|payment to|received|sent|transfer to|transfer from)\b/i.test(simplified)) {
    return simplified.split(/\s+/).slice(0, 3).join(" ");
  }

  const stripped = stripTrailingStatementNoise(stripLeadingStatementNoise(simplified));
  return stripped || simplified;
};
