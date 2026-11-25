import type { DeviceTextEvidence } from "../../shared/device-text-evidence";
import { encodeLocalReceiptOcr, receiptDateDisagreements, hasConflictingReceiptTotalReading, readReceiptOpticalLayout, readReceiptOpticalLines } from "./local-receipt-ocr-envelope";
import { readPrintedReceiptCurrency } from "./receipt-currency-evidence";
import { readReceiptSettlementEvidence } from "./receipt-settlement-evidence";
import { findReceiptImageRegion } from "./receipt-image-region";
import { hasReceiptPhotoEvidence } from "./receipt-intake";
import { classifyUnsettledPurchaseDocument } from "./purchase-document-payment";
import { inspectBankingScreenshot } from "./banking-screenshot-evidence";
import { isTransactionHistoryScreenshotText } from "./import-parser";
import { assessReceiptPreviewQuality, parseReceiptPhotoText } from "./split-bill";

export function qualifyDeviceReceiptReading(
  device: DeviceTextEvidence | null,
  importMode: string,
  defaultCurrency: string,
) {
  if (!device?.complete || device.pagesRead !== 1 || device.totalPages !== 1 ||
      (importMode !== "receipt" && importMode !== "statement")) return null;
  const source = encodeLocalReceiptOcr(device);
  const lines = readReceiptOpticalLines(source);
  const fullLayout = readReceiptOpticalLayout(source, lines);
  const region = findReceiptImageRegion(source, lines);
  const layout = region?.text ?? fullLayout;
  if (receiptDateDisagreements(device.opticalLines ?? []).length) return null;
  if (hasConflictingReceiptTotalReading(region?.opticalLines ?? lines)) return null;
  if (!hasReceiptPhotoEvidence(layout) || isTransactionHistoryScreenshotText(fullLayout) ||
      inspectBankingScreenshot(fullLayout).kind !== "unknown" ||
      classifyUnsettledPurchaseDocument(layout)) return null;

  const candidate = parseReceiptPhotoText(region ? encodeLocalReceiptOcr(region) : source);
  if (!candidate.merchantName || !candidate.billDate || !(Number(candidate.total) > 0)) return null;
  // Device text can arrive column by column. Adding its apparent items may
  // produce a plausible total from reference numbers and duplicated amounts.
  const settlement = readReceiptSettlementEvidence(layout);
  if (settlement?.kind !== "payable" || settlement.amount !== Number(candidate.total)) return null;
  // An unspecified currency can be suggested at review. Conflicting totals,
  // missing printed evidence, or incomplete itemization still get a new read.
  if (candidate.currencyWarning?.startsWith("Mixed currencies detected:")) return null;
  const quality = assessReceiptPreviewQuality({
    ...candidate,
    currency: candidate.currency === "MIXED" ? defaultCurrency : candidate.currency,
    currencyWarning: null,
    requiresReview: false,
  });
  if (!quality.reliableForFastPath) return null;
  return { source, layout, region, preview: candidate };
}

// Even a device reading that misses items can preserve the printed till total
// or currency. A conflicting backup read needs review before creating a sale.
export function conflictingDeviceReceiptFields(
  device: DeviceTextEvidence | null,
  details: { total?: number | null; currency?: string | null },
) {
  if (!device?.complete || device.pagesRead !== 1 || device.totalPages !== 1) return [];
  const source = encodeLocalReceiptOcr(device);
  const lines = readReceiptOpticalLines(source);
  if (!lines.length) return [];
  const layout = readReceiptOpticalLayout(source, lines);
  const total = readReceiptSettlementEvidence(layout);
  const currency = readPrintedReceiptCurrency(layout);
  const conflicts: string[] = [];
  if (total?.kind === "payable" && details.total != null &&
      Math.round(total.amount * 100) !== Math.round(details.total * 100)) conflicts.push("total");
  if (currency?.kind === "printed" && details.currency && currency.currency !== details.currency) conflicts.push("currency");
  return conflicts;
}
