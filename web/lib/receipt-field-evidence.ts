import { joinReceiptColumnSettlement } from "./receipt-column-settlement";
import { readPrintedReceiptCurrency } from "./receipt-currency-evidence";
import { getExplicitEvidenceDates, resolveReceiptPurchaseDateRoles } from "./receipt-date-evidence";
import { readReceiptMerchantEvidence } from "./receipt-merchant-evidence";
import { readReceiptSettlementEvidence } from "./receipt-settlement-evidence";
import { splitReceiptPromotionalFooter } from "./receipt-promotional-footer";
import { readMerchantPaymentConfirmation } from "./merchant-payment-confirmation";

type FieldEvidence = { source?: string; confidence?: number | null } & (
  | { status: "supported"; label: string }
  | { status: "suggested"; source: string; label: string | null }
  | { status: "uncertain"; reason: "missing_or_unreadable" | "conflicting_or_unsupported" });

const identity = (value: string) => value.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");

const describeField = (label: string | undefined, candidate: unknown): FieldEvidence =>
  label ? { status: "supported", label }
    : { status: "uncertain", reason: candidate == null || candidate === "" ? "missing_or_unreadable" : "conflicting_or_unsupported" };

export function requireReceiptFieldEvidence<T extends {
  merchant_raw: string | null;
  merchant_clean: string | null;
  transaction_date: string | null;
  total: number | null;
  currency: string | null;
  parser_evidence: { source_text?: string | null };
  currency_resolution?: { source?: string; evidence?: string };
}>(details: T, opticalText: string, origin?: { source: string; confidence: number }) {
  const withOrigin = (field: FieldEvidence): FieldEvidence => origin ? {
    ...field,
    source: field.status === "suggested" ? field.source : origin.source,
    confidence: field.status === "supported" && Number.isFinite(origin.confidence) ? origin.confidence : null,
  } : field;
  const source = opticalText.trim() ? opticalText : details.parser_evidence.source_text ?? "";
  // Use the same independently reconciled reading order as extraction. The
  // original optical/source transcript remains unchanged in parser_evidence.
  const { body } = splitReceiptPromotionalFooter(joinReceiptColumnSettlement(source));
  const lines = body.split(/\r?\n/u);
  const words = lines.map(line => line.trim());
  const merchant = details.merchant_raw || details.merchant_clean;
  const merchantRoles = readReceiptMerchantEvidence(body);
  const payment = readMerchantPaymentConfirmation(body);
  const merchantKey = merchant ? identity(merchant) : "";
  const explicitName = merchantRoles.explicit ?? merchantRoles.issuer;
  const merchantLine = merchantKey && !merchantRoles.ambiguous && (!explicitName || identity(explicitName) === merchantKey)
    ? lines.find((line, index) =>
        identity(line) === merchantKey && merchantRoles.header.some(value => identity(value) === merchantKey) ||
        (explicitName || payment?.merchant === merchant) && identity(line).endsWith(merchantKey) &&
          /^(?:merchant|seller|supplier|store|business|trade|trading|doing business|d\.?b\.?a|franchisee|registered|operated|owned|sold by|paid to|payment to)\b/iu.test(words[index]))
    : undefined;

  const date = details.transaction_date;
  const dateDecision = resolveReceiptPurchaseDateRoles(source);
  const printedDates = getExplicitEvidenceDates(body);
  const dateSupported = date && (payment?.date === date ||
    (dateDecision ? dateDecision.date === date : printedDates.length === 1 && printedDates[0] === date));
  const dateIndex = date && dateSupported ? words.findIndex(line =>
    getExplicitEvidenceDates(line).includes(date) &&
    (resolveReceiptPurchaseDateRoles(line)?.date === date ||
      (!/\b(?:print(?:ed)?|terminal|payment|valid until|expiry|permit|accreditation)\b/iu.test(line) &&
        (resolveReceiptPurchaseDateRoles(line) === null || /^date issued\b/iu.test(line))))) : -1;
  const dateLabel = dateIndex >= 0 && /(?:date|purchased on|sold on)\s*[:：]?\s*$/iu.test(words[dateIndex - 1] ?? "")
    ? lines.slice(dateIndex - 1, dateIndex + 1).join("\n") : lines[dateIndex];

  const settlement = readReceiptSettlementEvidence(body);
  const amount = details.total;
  const amountLabel = amount !== null && settlement?.kind === "payable" && settlement.amount === amount
    ? lines.find(line => {
        const evidence = readReceiptSettlementEvidence(line);
        return evidence?.kind === "payable" && evidence.amount === amount &&
          !/\b(?:tax|vat|gst|reward|points)\b/iu.test(line);
      }) ?? lines.map((line, index) => lines.slice(index, index + 2).join("\n")).find((pair, index) => {
        if (!/^(?:grand total|total|amount (?:due|paid|payable)|결제금액|합계)\s*[:：]?\s*$/iu.test(words[index])) return false;
        const evidence = readReceiptSettlementEvidence(pair);
        return evidence?.kind === "payable" && evidence.amount === amount;
      })
    : amount !== null && payment?.amount === amount
      ? lines.find(line => /\d/u.test(line) && Number(line.trim().replace(/[^\d.]/gu, "")) === amount)
      : undefined;

  const currencySource = details.currency_resolution?.source;
  const currencyMarker = details.currency_resolution?.evidence;
  const currencyLine = currencySource === "printed_currency" && currencyMarker
    ? [amountLabel, ...lines].find(line => {
        if (!line) return false;
        const printed = readPrintedReceiptCurrency(line, details.currency);
        return printed?.kind === "printed" && printed.currency === details.currency;
      })
    : undefined;
  const currency: FieldEvidence = currencyLine ? describeField(currencyLine, details.currency)
    : details.currency && currencySource && ["receipt_location", "device_location", "user_default", "parser_currency"].includes(currencySource)
      ? { status: "suggested", source: currencySource, label: currencySource === "receipt_location"
        ? lines.find(line => currencyMarker && line.normalize("NFKC").includes(currencyMarker)) ?? null : null }
      : describeField(undefined, details.currency);

  return {
    ...details,
    merchant_raw: merchantLine ? details.merchant_raw : null,
    merchant_clean: merchantLine ? details.merchant_clean : null,
    transaction_date: dateLabel ? date : null,
    total: amountLabel ? amount : null,
    currency: currency.status === "uncertain" ? null : details.currency,
    core_field_evidence: {
      source: opticalText.trim() ? "optical_text" : "quoted_text",
      merchant: withOrigin(describeField(merchantLine || undefined, merchant)),
      date: withOrigin(describeField(dateLabel, date)),
      total: withOrigin(describeField(amountLabel, amount)),
      currency: withOrigin(currency),
    },
  };
}

type VerifiedReceiptFields = Pick<ReturnType<typeof requireReceiptFieldEvidence>,
  "merchant_raw" | "merchant_clean" | "transaction_date" | "total" | "currency" | "currency_resolution" | "core_field_evidence">;

export function receiptBackupQuestions(local: VerifiedReceiptFields | null) {
  if (!local || !Object.entries(local.core_field_evidence).some(([key, value]) =>
    key !== "source" && typeof value === "object" && value.status === "supported")) return [];
  const fields = local.core_field_evidence;
  const questions = [
    ...(fields.merchant.status !== "supported" ? ["Which seller name is printed in the business header or logo?"] : []),
    ...(fields.date.status !== "supported" ? ["Which purchase date is printed in the transaction header? Exclude print and expiry dates."] : []),
    ...(fields.total.status !== "supported" ? ["What amount appears beside the payable total in the settlement section? Exclude tender and change."] : []),
    ...(fields.currency.status !== "supported" ? ["Which currency marker appears beside the purchase total?"] : []),
  ];
  return questions.length ? questions : ["What line items are legible in the item table? Quote the printed quantities and amounts."];
}

export function keepVerifiedReceiptFields<T extends Omit<VerifiedReceiptFields, "core_field_evidence"> & {
  core_field_evidence?: VerifiedReceiptFields["core_field_evidence"];
}>(candidate: T, local: VerifiedReceiptFields | null): T {
  if (!local || !candidate.core_field_evidence) return candidate;
  const fields = local.core_field_evidence;
  const merchant = fields.merchant.status === "supported";
  const date = fields.date.status === "supported";
  const total = fields.total.status === "supported";
  const currency = fields.currency.status === "supported";
  return {
    ...candidate,
    ...(merchant ? { merchant_raw: local.merchant_raw, merchant_clean: local.merchant_clean } : {}),
    ...(date ? { transaction_date: local.transaction_date } : {}),
    ...(total ? { total: local.total } : {}),
    ...(currency ? { currency: local.currency, currency_resolution: local.currency_resolution } : {}),
    core_field_evidence: {
      ...candidate.core_field_evidence,
      ...(merchant ? { merchant: fields.merchant } : {}),
      ...(date ? { date: fields.date } : {}),
      ...(total ? { total: fields.total } : {}),
      ...(currency ? { currency: fields.currency } : {}),
    },
  };
}
