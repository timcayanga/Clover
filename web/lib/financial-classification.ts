import type { TransactionType } from "@prisma/client";
import { getSharedMerchantCategoryHint, getStrongMerchantCategoryHint } from "@/lib/merchant-category-hints";
import { summarizeMerchantText } from "@/lib/merchant-labels";

export type ImportedAccountType =
  | "bank"
  | "wallet"
  | "credit_card"
  | "cash"
  | "investment"
  | "loan"
  | "mortgage"
  | "line_of_credit"
  | "receivable"
  | "payable"
  | "bnpl"
  | "prepaid"
  | "insurance"
  | "other";

const normalizeWhitespace = (value: string) => value.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
const compactWhitespace = (value: string) => normalizeWhitespace(value).replace(/\s+/g, "");

export const isStatementPaymentSettlementDescription = (value?: string | null) => {
  const lower = normalizeWhitespace(String(value ?? "")).toLowerCase();
  const compact = compactWhitespace(lower);
  return (
    /payment\s*-\s*thank\s*you|payment\s+thank\s+you|card\s+payment|payment\s+to\s+card|payment\s+received|repayment/.test(lower) ||
    /cash\s+payment\s*-\s*thank\s*you|cash\s+payment\s+thank\s+you/.test(lower) ||
    /paymentthankyou|cardpayment|paymenttocard|paymentreceived|cashpaymentthankyou/.test(compact)
  );
};

export const isStandaloneCashPaymentDescription = (value?: string | null) => {
  const lower = normalizeWhitespace(String(value ?? "")).toLowerCase();
  if (!/\bcash\s+payment\b/.test(lower)) {
    return false;
  }

  return !isStatementPaymentSettlementDescription(lower);
};

const isLikelyPersonToPersonMerchant = (value?: string | null) => {
  const normalized = normalizeWhitespace(String(value ?? "")).trim();
  if (!normalized) {
    return false;
  }

  const lower = normalized.toLowerCase();
  const compact = compactWhitespace(lower);
  if (
    /\b(?:bank|mall|store|shop|shopping|supermarket|market|mart|grocery|grocer|restaurant|cafe|coffee|hotel|airport|airways|airline|tour|travel|opera|museum|cinema|theatre|theater|ticket|tickets|school|college|university|clinic|hospital|pharmacy|petrol|fuel|parking|sushi|dumpling|foods?|seafood|bar|pub|resort|souvenir|gift|convenience|books|paypal|amazon|alibaba|prime|woolworths|mcdonald'?s|transport|rail|bus|train|metro|victoria|airport|harbour)\b/.test(
      lower
    ) ||
    /\b(?:pty|ltd|inc|corp|co|llc|limited)\b/.test(lower) ||
    /(?:\d{3,}|ref|reference|invoice|ticket|booking|provisioning|service)/.test(lower) ||
    compact.includes("fastpayments")
  ) {
    return false;
  }

  const cleaned = normalized.replace(/[^A-Za-z .'-]/g, " ").replace(/\s+/g, " ").trim();
  const tokens = cleaned.split(" ").filter(Boolean);
  if (tokens.length < 2 || tokens.length > 4) {
    return false;
  }

  const nonNameTokens = new Set([
    "from",
    "to",
    "for",
    "via",
    "payment",
    "payments",
    "sent",
    "received",
    "incoming",
    "outgoing",
    "transfer",
    "transfers",
  ]);
  const nameishTokens = tokens.filter((token) => {
    const lowerToken = token.toLowerCase();
    if (nonNameTokens.has(lowerToken)) {
      return false;
    }
    return /^[A-Za-z][A-Za-z.'-]{1,}$/.test(token);
  });

  return nameishTokens.length >= 2;
};

export const guessCategoryName = (text: string, type: TransactionType) => {
  const lower = text.toLowerCase();
  const compact = compactWhitespace(text).toLowerCase();
  const strongHint = getStrongMerchantCategoryHint(text);
  if (strongHint) return strongHint;
  const sharedHint = getSharedMerchantCategoryHint(text);
  if (sharedHint) return sharedHint;
  const summarizedMerchant = summarizeMerchantText(text);
  if (summarizedMerchant && normalizeWhitespace(summarizedMerchant).toLowerCase() !== normalizeWhitespace(text).toLowerCase()) {
    const summarizedStrongHint = getStrongMerchantCategoryHint(summarizedMerchant);
    if (summarizedStrongHint) return summarizedStrongHint;
    const summarizedSharedHint = getSharedMerchantCategoryHint(summarizedMerchant);
    if (summarizedSharedHint) return summarizedSharedHint;
  }
  if (
    (type === "transfer" || /\b(?:sent|received|transfer|payments?|pay(?:ment)?\s+to|pay(?:ment)?\s+from)\b/.test(lower)) &&
    isLikelyPersonToPersonMerchant(text)
  ) {
    return "Transfers";
  }
  if (/emmanuel\s+payments?/.test(lower) || /emmanuelpayments?/.test(compact)) return "Shopping";
  if (/sydney\s+opera\s+house/.test(lower) || /sydneyoperahouse/.test(compact)) return "Entertainment";
  if (/relay\b/.test(lower)) return "Shopping";
  if (/souvenir/.test(lower) || /souvenir/.test(compact)) return "Travel & Lifestyle";
  if (
    /pedro\s+the\s+grocer|grocer\b|mcdonald'?s|milksha|gogyo|goken|savory\s+project|bar\s+leone|four\s+frogs|dumplings?|sushi|ramen|pho\b|bbq\b|bistro|brasserie|bakery|seafood|foods?\b|cottage|estate\s+coffee|roast|cabin\s+bar/.test(lower) ||
    /pedrothegrocer|mcdonalds|milksha|gogyo|goken|savoryproject|barleone|fourfrogs|dumplings|sushi|ramen|bbq|bistro|bakery|seafood|estatecoffee|coffeeroast|cabinbar/.test(compact)
  )
    return "Food & Dining";
  if (isStandaloneCashPaymentDescription(text)) return "Shopping";
  if (isStatementPaymentSettlementDescription(text)) return "Transfers";
  if (/taxwithheld|withheldtax|tax withheld|withheld tax/.test(lower) || /taxwithheld|withheldtax/.test(compact)) return "Financial";
  if (/service\s*charge|servicecharge|bank charge|bankcharge/.test(lower) || /servicecharge|bankcharge/.test(compact)) return "Financial";
  if (/finance\s*charge|financecharge/.test(lower) || /financecharge/.test(compact)) return "Financial";
  if (/instapay\s*transfer\s*fee|instapaytransferfee/.test(lower) || /instapaytransferfee/.test(compact)) return "Transfers";
  if (/expressnet|megalinkw?|\/drw\b|cash\s*(?:withdrawal|out)|atm\b|automated\s+teller|cash\s+advance/.test(lower)) return "Cash & ATM";
  if (/google\s+play|googleplay/.test(lower) || /googleplay/.test(compact)) return "Entertainment";
  if (/transfer|instapay|pesonet|wise to|to savings|to checking/.test(lower)) return "Transfers";
  if (/gcash\s+cash\s+in|gcashcashin/.test(lower)) return "Transfers";
  if (/salary|payroll|income|deposit|cash\s*(?:in|deposit)|credit memo/.test(lower)) return "Income";
  if (/refund|reversal|cashback|cash back|reward|rebate|interest/.test(lower)) return "Income";
  if (/discord\s+nitro|google\s+one/.test(lower) || /discordnitro|googleone/.test(compact)) return "Subscriptions";
  if (/mlbb\s+top\s+up|mobile\s+legends|mlbbtopup/.test(lower) || /mlbbtopup|mobilelegends/.test(compact)) return "Entertainment";
  if (/epsaten/.test(lower)) return type === "expense" ? "Cash & ATM" : "Income";
  if (/el\/?espay/.test(lower)) return type === "expense" || type === "transfer" ? "Transfers" : "Income";
  if (/payroll credit|cash\s*in\b|cashin\b/.test(lower)) return "Income";
  if (/grocery|supermarket|market|food|dining|restaurant|coffee|cafe|meal|takeout|starbucks|donut|foodhall|mister donut|yoshinoya|grocer|snack|kitchen|eatery/.test(lower)) return "Food & Dining";
  if (/auntie\s*annes|llaollao/.test(lower)) return "Food & Dining";
  if (/grab|uber|taxi|bus|train|mrt|mrt3|dotr|parking|gas|fuel|transport|ride|airport|skybus|rail|tram|harbour|ferry|toll/.test(lower)) return "Transport";
  if (/rent|mortgage|apartment|housing/.test(lower)) return "Housing";
  if (/bill|utilities|electric|water|internet|phone|subscription|openai|netflix|spotify|load purchase|pay\s*maya\s*load purchase|paymaya\s*load purchase|mobile load/.test(lower))
    return "Bills & Utilities";
  if (/travel|airbnb|hotel|airline|flight|tour|holiday|souvenir|gifts?|harbour\s+gifts|airport\s+shop|tourism|victoria|opera\s+house|sanctuary|park(s)?\b/.test(lower)) return "Travel & Lifestyle";
  if (/entertainment|movie|cinema|theater|theatre|concert|show|ticket|tickets|game|gaming|arcade|karaoke|amusement|disney|steam|playstation|xbox|opera|museum|sanctuary|zoo|aquarium/.test(lower))
    return "Entertainment";
  if (/puregold|shop|shopping|mall|amazon|lazada|shopee|retail|alibaba|paypal|watsons|books|store|convenience|prime|relay/.test(lower)) return "Shopping";
  if (/health|doctor|clinic|pharmacy|medical|hospital/.test(lower)) return "Health & Wellness";
  if (/education|tuition|school|college|course|learning/.test(lower)) return "Education";
  if (/gift|donation|charity|present/.test(lower)) return "Gifts & Donations";
  if (/business|invoice|client|contract/.test(lower)) return "Business";
  if (/\bfee\b|interest|loan|financial|bank charge/.test(lower)) return "Financial";
  return "Other";
};

export const normalizePayPalAccountType = (
  institution?: string | null,
  accountName?: string | null,
  statementText?: string | null
): ImportedAccountType | null => {
  const identity = `${institution ?? ""} ${accountName ?? ""}`.replace(/\s+/g, " ").trim();
  if (!/\bpaypal\b/i.test(identity)) {
    return null;
  }

  const productEvidence = `${identity} ${statementText ?? ""}`.replace(/\s+/g, " ");
  return /\bpaypal\s+credit\b/i.test(productEvidence) ? "credit_card" : "wallet";
};

export const inferAccountTypeFromStatement = (
  institution?: string | null,
  accountName?: string | null,
  fallback: ImportedAccountType = "bank"
): ImportedAccountType => {
  const normalized = `${institution ?? ""} ${accountName ?? ""}`.toLowerCase();
  const payPalAccountType = normalizePayPalAccountType(institution, accountName);
  if (payPalAccountType) {
    return payPalAccountType;
  }

  if (/maya/.test(normalized)) {
    if (/(maya\s+easy\s+credit|maya\s+credit|easy\s+credit|billing\s+statement|payment\s+due\s+date|total\s+amount\s+due|minimum\s+amount\s+due|credit\s+limit|credit\s*card|card\s+ending|visa|mastercard|amex)/.test(normalized)) {
      return "credit_card";
    }

    if (/(wallet|cash\s*(?:in|out)|send\s+money|received\s+money|fund\s+transfer|transfer\s+to\s+maya\s+savings|auto\s*cash[- ]?in)/.test(normalized)) {
      return "wallet";
    }

    if (/(savings|consumer\s+savings|account\s+summary|running\s+balance|starting\s+balance|ending\s+balance|interest\s+earned)/.test(normalized)) {
      return "bank";
    }

    return "bank";
  }

  if (
    /(maya\s+easy\s+credit|maya\s+credit|easy\s+credit|credit card|visa platinum|mastercard|amex|card ending|payment due date|total amount due|minimum amount due|credit limit)/.test(
      normalized
    )
  ) {
    return "credit_card";
  }

  if (/(savings|checking|deposit account|passbook|current account|cav0?1|cav0?2|cav0?3)/.test(normalized)) {
    return "bank";
  }

  if (/(gcash|maya|wise|wallet)/.test(normalized)) {
    return "wallet";
  }

  if (/(bpi.*signature|bpi.*credit card|signature card|payment due date|total amount due|minimum amount due|credit limit)/.test(normalized)) {
    return "credit_card";
  }

  if (/(rcbc|bankard|credit card|visa platinum|mastercard|amex|card ending)/.test(normalized)) {
    return "credit_card";
  }

  if (/(invest|investment|broker|stocks?|gstocks|fund|gfunds|atram|ab capital|investatrade|gcrypto|pdax|crypto|portfolio|trading wallet|bitcoin|\bbtc\b|ethereum|\beth\b|\bxrp\b|\bsolana\b)/.test(normalized)) {
    return "investment";
  }

  if (/\bcash\b/.test(normalized)) {
    return "cash";
  }

  return fallback;
};
