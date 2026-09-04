const normalizeReceiptContext = (value?: string | null) =>
  String(value ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

export const hasExplicitReceiptTransferEvidence = (value?: string | null) => {
  const context = normalizeReceiptContext(value);
  return (
    /\b(?:wallet[_ -]?transfer|transfer[_ -]?receipt)\b/.test(context) ||
    /\b(?:sent via|amount sent|total amount sent|money sent|funds transferred)\b/.test(context) ||
    /\b(?:recipient|beneficiary|receiver)\s*(?:name|account|mobile|number|no\.?|:)\b/.test(context) ||
    /\b(?:credit card|card)\s+(?:(?:bill|statement|balance)\s+){1,2}payment\b|\bpayment\s*-?\s*thank\s+you\b/.test(context)
  );
};

export const hasReceiptPosPurchaseEvidence = (value?: string | null) => {
  const context = normalizeReceiptContext(value);
  return (
    /\bpoint[ -]?of[ -]?sale\b/.test(context) ||
    /\bpos\s*(?:purchase|sale|payment|terminal|txn|transaction|entry|approved|approval)?\b/.test(context) ||
    /\b(?:terminal|tid)\s*(?:id|no\.?|number|#)\b/.test(context)
  );
};

export const hasReceiptPurchaseEvidence = (value?: string | null) => {
  const context = normalizeReceiptContext(value);
  const isCardBalanceSettlement =
    /\b(?:credit card|card)\s+(?:(?:bill|statement|balance)\s+){1,2}payment\b|\bpayment\s*-?\s*thank\s+you\b/.test(context);
  const hasCardPaymentRail =
    /\b(?:credit|debit)\s*card\b|\b(?:visa|mastercard|amex|american express)\b/.test(context) &&
    !isCardBalanceSettlement;

  if (isCardBalanceSettlement) return false;

  return (
    hasCardPaymentRail ||
    /\b(?:sales?|official|merchant|restaurant|cafe|coffee shop|bakery|grocery|supermarket|food court)\s+receipt\b/.test(context) ||
    /\b(?:order|invoice|subtotal|grand total|amount tendered|change due|vat|sales tax|service charge|table no\.?|dine[ -]?in|take[ -]?out)\b/.test(context)
  );
};

export const resolveReceiptCategoryWithPaymentEvidence = ({
  proposedCategory,
  receiptContext,
  lineItemCategory,
}: {
  proposedCategory?: string | null;
  receiptContext?: string | null;
  lineItemCategory?: string | null;
}) => {
  const category = String(proposedCategory ?? "").trim() || null;
  const itemCategory = String(lineItemCategory ?? "").trim() || null;
  const explicitTransfer = hasExplicitReceiptTransferEvidence(receiptContext);
  const posPurchase = hasReceiptPosPurchaseEvidence(receiptContext);
  const purchaseEvidence = hasReceiptPurchaseEvidence(receiptContext);
  const itemizedPurchaseCategory = new Set([
    "Bills & Utilities",
    "Business",
    "Education",
    "Entertainment",
    "Food & Dining",
    "Gifts & Donations",
    "Health & Wellness",
    "Housing",
    "Shopping",
    "Subscriptions",
    "Transport",
    "Travel & Lifestyle",
  ]).has(itemCategory ?? "");

  if (itemizedPurchaseCategory && (!category || category === "Other" || category === "Transfers")) {
    // A payment rail describes how a receipt was paid, not what was bought.
    // Structured merchandise or meal rows are stronger category evidence than
    // GCash/bank-transfer wording on an otherwise valid purchase receipt.
    return itemCategory;
  }

  if (posPurchase && !explicitTransfer && (!category || category === "Other" || category === "Transfers")) {
    return "Shopping";
  }

  if (category === "Transfers" && purchaseEvidence) {
    // Receipt evidence often includes the payment rail (card, wallet, or bank
    // transfer). That describes how a merchant purchase was settled, not what
    // the user bought. Let the caller categorize from merchant/item context.
    return null;
  }

  if (category === "Transfers" && !explicitTransfer) {
    // A purchase receipt is not transfer evidence by itself. Returning null
    // lets the caller use merchant and item context (market, cafe, pharmacy,
    // and so on) instead of cementing a generic model guess.
    return null;
  }

  return category;
};
