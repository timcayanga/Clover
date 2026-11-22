import { readPrintedReceiptCurrency } from "./receipt-currency-evidence";
import { receiptReconciliationIssues, receiptSummaryReconciles } from "./receipt-reconciliation";
import { assessReceiptPreviewQuality, normalizeCurrencyCode, parseAmountValue, type ReceiptPreviewResult } from "./split-bill";

const asText = (value: unknown) => (typeof value === "string" && value.trim() ? value.trim() : null);
const asAmount = (value: unknown) => {
  const parsed = typeof value === "number" ? parseAmountValue(value) : typeof value === "string" ? parseAmountValue(value) : null;
  return parsed !== null ? parsed.toFixed(2) : null;
};

const asNumber = (value: unknown) => {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value.trim()) : NaN;
  return Number.isFinite(parsed) ? parsed : null;
};

const asReceiptDate = (value: unknown) => {
  const raw = asText(value);
  if (!raw) {
    return null;
  }

  const match = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day
    ? parsed.toISOString()
    : null;
};

export const mergeReceiptBackup = (
  localPreview: ReceiptPreviewResult,
  backup: Record<string, unknown>,
  backupAccountMatch: unknown,
  backupAudit: { model?: string | null; promptVersion?: string | null; confidence?: number | null; schemaValidated?: boolean | null; reason?: string | null }
): ReceiptPreviewResult => {
  const issues = assessReceiptPreviewQuality(localPreview).issues;
  const localMerchantLooksWeak = issues.includes("merchant looks noisy");
  const backupItems = Array.isArray(backup.line_items)
    ? backup.line_items.flatMap((item) => {
        if (!item || typeof item !== "object") {
          return [];
        }
        const value = item as Record<string, unknown>;
        const description = asText(value.description);
        const amount = asAmount(value.amount);
        return description && amount ? [{
          description,
          amount,
          quantity: asNumber(value.quantity),
          unitPrice: asAmount(value.unit_price),
        }] : [];
      })
    : [];
  const backupAllocations = Array.isArray(backup.split_allocations)
    ? backup.split_allocations.flatMap((allocation) => {
        if (!allocation || typeof allocation !== "object") {
          return [];
        }
        const value = allocation as Record<string, unknown>;
        const participantName = asText(value.participant_name);
        return participantName ? [{
          participantName,
          charged: asAmount(value.charged),
          paid: asAmount(value.paid),
          due: asAmount(value.due),
          currency: asText(value.currency) ?? localPreview.currency,
        }] : [];
      })
    : [];
  const backupConfidence = typeof backup.confidence_score === "number" && Number.isFinite(backup.confidence_score)
    ? Math.round(backup.confidence_score)
    : 0;
  const accountMatch = backupAccountMatch && typeof backupAccountMatch === "object"
    ? backupAccountMatch as Record<string, unknown>
    : null;
  const normalizedAccountMatch = accountMatch && (asText(accountMatch.account_name) || asText(accountMatch.account_last4))
    ? {
        accountName: asText(accountMatch.account_name),
        accountLast4: asText(accountMatch.account_last4),
        confidence: Math.max(0, Math.min(100, Math.round(asNumber(accountMatch.confidence) ?? 0))),
        reason: asText(accountMatch.reason),
      }
    : null;
  const backupPaymentMethod = asText(backup.payment_method) ?? (normalizedAccountMatch?.accountName
    ? normalizedAccountMatch.accountLast4
      ? `${normalizedAccountMatch.accountName} ending ${normalizedAccountMatch.accountLast4}`
      : normalizedAccountMatch.accountName
    : null);
  const backupType = asText(backup.receipt_type)?.toLowerCase();
  const receiptType = backupType === "restaurant_receipt" || backupType === "official_receipt" || backupType === "tax_invoice" ||
    backupType === "travel_ticket" || backupType === "wallet_transfer" ? backupType : localPreview.receiptType;
  const reportedCurrency = asText(backup.currency) ? normalizeCurrencyCode(asText(backup.currency)) : null;
  const quotedCurrency = asText(backup.currency_source_text);
  const currencyEvidence = quotedCurrency ? readPrintedReceiptCurrency(
    /^[A-Z]{3}$/.test(quotedCurrency) ? "Currency: " + quotedCurrency : quotedCurrency,
  ) : null;
  const backupCurrency = currencyEvidence?.kind === "printed" && currencyEvidence.currency === reportedCurrency
    ? reportedCurrency : null;

  const currency = localPreview.currencyMentions.length ? localPreview.currency : backupCurrency ?? localPreview.currency;
  const backupTotal = asAmount(backup.total);
  const backupSubtotal = asAmount(backup.subtotal);
  const subtotal = localPreview.subtotal ?? backupSubtotal;
  const total = localPreview.total ?? backupTotal;
  const serviceCharge = localPreview.serviceCharge ?? asAmount(backup.service_charge);
  const tax = localPreview.tax ?? asAmount(backup.tax);
  const tip = localPreview.tip ?? asAmount(backup.tip);
  const discount = localPreview.discount ?? asAmount(backup.discount);
  const summary = {
    currency, subtotal: parseAmountValue(subtotal), total: parseAmountValue(total),
    service_charge: parseAmountValue(serviceCharge), tax: parseAmountValue(tax),
    tip: parseAmountValue(tip), discount: parseAmountValue(discount), rounding: parseAmountValue(localPreview.rounding),
  };
  const conflictingAmounts = Boolean((localPreview.total && backupTotal && localPreview.total !== backupTotal) ||
    (localPreview.subtotal && backupSubtotal && localPreview.subtotal !== backupSubtotal));
  const conflictingCurrency = Boolean(reportedCurrency && localPreview.currencyMentions.length && reportedCurrency !== currency);
  const backupParser = {
    model: asText(backupAudit.model),
    promptVersion: asText(backupAudit.promptVersion),
    confidence: Math.max(0, Math.min(100, Math.round(asNumber(backupAudit.confidence) ?? backupConfidence))) || null,
    schemaValidated: typeof backupAudit.schemaValidated === "boolean" ? backupAudit.schemaValidated : null,
    reason: asText(backupAudit.reason),
  };
  if (conflictingCurrency || conflictingAmounts || !receiptSummaryReconciles(summary)) {
    return { ...localPreview, requiresReview: true, backupParser };
  }
  const needsItems = !localPreview.items.length || issues.some(issue =>
    issue.startsWith("Receipt line item") || /suspicious line items|item count/.test(issue));
  const candidateItems = backupItems.map(item => ({
    amount: parseAmountValue(item.amount), quantity: item.quantity, unit_price: parseAmountValue(item.unitPrice),
  }));
  // With only a payable and no printed subtotal, require the items to
  // account for the payable. Never combine incompatible receipt readings.
  const itemSum = backupItems.reduce((sum, item) => sum + Math.round(Number(item.amount) * 100), 0);
  const useBackupItems = needsItems && backupConfidence >= 75 && backupAudit.schemaValidated &&
    backupItems.length > 0 && (subtotal !== null || (total !== null && itemSum === Math.round(Number(total) * 100))) &&
    !receiptReconciliationIssues(summary, candidateItems).length;

  return {
    ...localPreview,
    receiptType,
    merchantName: localPreview.merchantName && !localMerchantLooksWeak && !/^this document\b|[~_=|]{2,}/i.test(localPreview.merchantName)
      ? localPreview.merchantName
      : asText(backup.merchant_clean) ?? asText(backup.merchant_raw) ?? localPreview.merchantName,
    billDate: localPreview.billDate ?? asReceiptDate(backup.transaction_date),
    documentNumber: localPreview.documentNumber ?? asText(backup.document_number),
    invoiceNumber: localPreview.invoiceNumber ?? asText(backup.invoice_number),
    bookingReference: localPreview.bookingReference ?? asText(backup.booking_reference),
    currency,
    currencyWarning: backupCurrency && !localPreview.currencyMentions.length ? null : localPreview.currencyWarning,
    currencyMentions: localPreview.currencyMentions.length > 0
      ? localPreview.currencyMentions
      : backupCurrency
        ? [backupCurrency]
        : localPreview.currencyMentions,
    paymentMethod: localPreview.paymentMethod ?? backupPaymentMethod,
    receiptPayerName: localPreview.receiptPayerName ?? asText(backup.buyer_name),
    receiptAccountMatch: localPreview.receiptAccountMatch ?? normalizedAccountMatch,
    subtotal,
    serviceCharge,
    tax,
    tip,
    discount,
    total,
    items: useBackupItems ? backupItems : localPreview.items,
    participants: localPreview.participants.length > 0 ? localPreview.participants : backupAllocations.map((allocation) => allocation.participantName),
    splitAllocations: localPreview.splitAllocations.length > 0 ? localPreview.splitAllocations : backupAllocations,
    confidence: Math.min(89, Math.max(localPreview.confidence, backupConfidence)),
    requiresReview: true,
    backupParser,
  };
};
