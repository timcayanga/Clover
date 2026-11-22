import type { DeviceTextEvidence } from "../../shared/device-text-evidence";
import { encodeLocalReceiptOcr, receiptDateDisagreements, hasConflictingReceiptTotalReading, readReceiptOpticalLayout, readReceiptOpticalLines } from "./local-receipt-ocr-envelope";
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
