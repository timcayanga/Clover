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
    /\b(?:recipient|beneficiary|receiver)\s*(?:name|account|mobile|number|no\.?|:)\b/.test(context)
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

export const resolveReceiptCategoryWithPaymentEvidence = ({
  proposedCategory,
  receiptContext,
}: {
  proposedCategory?: string | null;
  receiptContext?: string | null;
}) => {
  const category = String(proposedCategory ?? "").trim() || null;
  const explicitTransfer = hasExplicitReceiptTransferEvidence(receiptContext);
  const posPurchase = hasReceiptPosPurchaseEvidence(receiptContext);

  if (posPurchase && !explicitTransfer && (!category || category === "Other" || category === "Transfers")) {
    return "Shopping";
  }

  if (category === "Transfers" && !explicitTransfer) {
    // A purchase receipt is not transfer evidence by itself. Returning null
    // lets the caller use merchant and item context (market, cafe, pharmacy,
    // and so on) instead of cementing a generic model guess.
    return null;
  }

  return category;
};
