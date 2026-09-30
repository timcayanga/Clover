import type { ParsedImportRow } from "@/lib/import-parser";
import { detectCurrencyEvidence, normalizeGlobalCurrencyCode } from "@/lib/financial-identity-detection";
import { koreanFinancialHeader, koreanInvestmentHeader, koreanMoneyUnitScale, normalizeKoreanFinancialText, parseKoreanAmount, parseKoreanDate } from "@/lib/korean-financial-text";
import { indonesianFinancialHeader, indonesianInvestmentHeader, indonesianMoneyUnitScale, parseIndonesianAmount, parseIndonesianDate } from "@/lib/indonesian-financial-text";

const headerKey = (value: string) => {
  const key = normalizeKoreanFinancialText(value).replace(/\([^)]*\)|\[[^\]]*\]/g, "").replace(/\s/g, "");
  return koreanInvestmentHeader(value) ?? koreanFinancialHeader(value) ?? indonesianInvestmentHeader(value) ?? indonesianFinancialHeader(value) ?? key;
};
export function isKoreanInvestmentHeader(headers: string[]) {
  if (!headers.some(header => /종목명|투자상품명|펀드명|투자명/.test(header.replace(/\s/g, "")))) return false;
  const keys = headers.map(headerKey);
  return ["asset", "market_value"].every(key => keys.includes(key));
}

export function isIndonesianInvestmentHeader(headers: string[]) {
  const keys = headers.map(indonesianInvestmentHeader);
  return keys.includes("asset") && keys.includes("market_value");
}

function validatePreamble(rows: string[][], locale: "ko" | "id") {
  const seen = new Map<string, string>();
  for (const row of rows) {
    const cells = row.map(cell => normalizeKoreanFinancialText(cell).trim()).filter(Boolean);
    const inline = cells[0]?.match(/^([^:：=]+)\s*[:：=]\s*(.+)$/);
    const label = inline?.[1] ?? cells[0] ?? "";
    const value = inline?.[2] ?? (cells.length === 2 ? cells[1]! : "");
    const key = koreanInvestmentHeader(label) ?? koreanFinancialHeader(label) ?? indonesianInvestmentHeader(label) ?? indonesianFinancialHeader(label) ??
      (/^(?:단위|금액단위|satuan|money_unit)$/i.test(label) ? "money_unit" : ["institution", "snapshot_date", "currency", "account_number"].includes(label) ? label : null);
    if (!key || !value || !["provider", "institution", "valuation_date", "snapshot_date", "currency", "money_unit", "account_number"].includes(key)) continue;
    const canonicalKey = key === "institution" ? "provider" : key === "snapshot_date" ? "valuation_date" : key;
    const canonicalValue = canonicalKey === "valuation_date" ? (locale === "id" ? parseIndonesianDate(value) : parseKoreanDate(value))?.toISOString().slice(0, 10) ?? value :
      canonicalKey === "currency" ? normalizeGlobalCurrencyCode(value) ?? value : value;
    if (seen.has(canonicalKey) && seen.get(canonicalKey) !== canonicalValue) {
      throw new Error("Clover found conflicting Korean investment report details. Confirm the provider, valuation date and currency before importing. Nothing was added.");
    }
    seen.set(canonicalKey, canonicalValue);
  }
}

/** Labeled inventories only. No guessed OCR columns, cost basis or trade transactions. */
export function parseKoreanInvestmentTable(params: {
  headers: string[]; rows: string[][]; headerIndex: number; metadata: Record<string, string>;
  preambleRows?: string[][];
  locale?: "ko" | "id";
}): ParsedImportRow[] {
  const { headers, rows, headerIndex, metadata } = params;
  const locale = params.locale ?? "ko";
  const parseAmount = locale === "id" ? parseIndonesianAmount : parseKoreanAmount;
  const parseDate = locale === "id" ? parseIndonesianDate : parseKoreanDate;
  const unitScale = locale === "id" ? indonesianMoneyUnitScale : koreanMoneyUnitScale;
  const domesticCurrency = locale === "id" ? "IDR" : "KRW";
  validatePreamble(params.preambleRows ?? [], locale);
  const keys = headers.map(headerKey);
  if (new Set(keys.filter(Boolean)).size !== keys.filter(Boolean).length) {
    throw new Error("Clover found duplicate Korean investment columns. Give each column a distinct label and upload again. Nothing was added.");
  }
  const read = (row: string[], key: string) => row[keys.indexOf(key)]?.trim() ?? "";
  const parseMonetaryCell = (row: string[], key: string) => {
    const cell = read(row, key);
    const parsed = parseAmount(cell);
    if (parsed === null) return null;
    const header = headers[keys.indexOf(key)] ?? "";
    const currency = detectCurrencyEvidence(header).currency ?? normalizeGlobalCurrencyCode(read(row, "currency") || metadata.currency);
    const hasUnit = locale === "id" ? /\b(?:Rp\.?|IDR|rupiah|ribu|rb|juta|jt|miliar|triliun)/i.test(cell) : /[₩￦원만억천백십조]|KRW/i.test(cell);
    const scale = hasUnit ? 1 : unitScale(header) ?? ((!currency || currency === domesticCurrency) ? unitScale(metadata.money_unit ?? "") : null) ?? 1;
    const scaled = parsed * scale;
    return Number.isSafeInteger(Math.round(scaled * 100)) ? scaled : null;
  };
  const investmentIdentities = new Set<string>();
  return rows.flatMap((cells, index) => {
    if (!cells.some(cell => cell.trim()) || isKoreanInvestmentHeader(cells) || isIndonesianInvestmentHeader(cells)) return [];
    const name = read(cells, "asset");
    if (/^(?:합계|총계|소계|총합계|total|jumlah|total investasi|total portofolio)$/i.test(name)) return [];
    const provider = read(cells, "provider") || metadata.institution;
    const value = parseMonetaryCell(cells, "market_value");
    const date = parseDate(read(cells, "valuation_date") || read(cells, "snapshot_date") || metadata.snapshot_date || "");
    const quantityText = read(cells, "quantity");
    const quantity = quantityText && quantityText !== "-" ? (locale === "id" ? parseIndonesianAmount(quantityText.replace(/\s*(?:unit|lembar)$/i, ""), true) : parseKoreanAmount(quantityText.replace(/\s*(?:주|좌)$/, ""))) : null;
    const currencyText = read(cells, "currency") || metadata.currency;
    const amountEvidence = detectCurrencyEvidence(`${read(cells, "market_value")} ${headers[keys.indexOf("market_value")]}`);
    const unitCurrency = unitScale(metadata.money_unit ?? "") !== null ? domesticCurrency : null;
    const currency = currencyText ? normalizeGlobalCurrencyCode(currencyText) : amountEvidence.currency ?? unitCurrency;
    if (!name || !provider || value === null || value < 0 || !date || !currency || amountEvidence.ambiguous ||
        (amountEvidence.currency && amountEvidence.currency !== currency) ||
        (quantityText && quantityText !== "-" && (quantity === null || quantity < 0))) {
      throw new Error("Clover could not safely read a Korean investment value, currency, quantity or date. Check the original table and upload again. Nothing was added.");
    }
    const contributionText = read(cells, "monthly_contribution");
    const monthlyContribution = parseMonetaryCell(cells, "monthly_contribution");
    if (contributionText && contributionText !== "-" && (monthlyContribution === null || monthlyContribution < 0)) {
      throw new Error("Clover could not safely read a Korean contribution value. Check the contribution column before importing. Nothing was added.");
    }
    // Confirmation groups named investments by provider/name before currency.
    const identity = [provider, name].map(value => normalizeKoreanFinancialText(value).toLowerCase()).join("|");
    if (investmentIdentities.has(identity)) {
      throw new Error("Clover found repeated Korean investment identities. Confirm the separate accounts or valuation dates before importing. Nothing was added.");
    }
    investmentIdentities.add(identity);
    const accountNumber = read(cells, "account_number") || metadata.account_number;
    // Preserve the existing investment-summary identity: one named investment per provider.
    return [{
      date: date.toISOString().slice(0, 10), amount: "0.00", currency,
      accountName: name, institution: provider,
      merchantRaw: name, merchantClean: name, description: `${name} investment snapshot`,
      type: "transfer" as const, categoryName: "Investments", confidence: 65, parserConfidence: 95, categoryConfidence: 65,
      rawPayload: {
        kind: "account_snapshot_marker", source: "investment_summary", documentType: "account_detail",
        accountType: "investment", accountName: name, institution: provider,
        assetName: name, investmentName: name, statementAccountNumber: accountNumber || null, assetSymbol: read(cells, "symbol") || null,
        investmentSubtype: /펀드|reksa\s?dana/i.test(name) ? "mutual_fund" : "other",
        balance: value, statementEndingBalance: value, marketValue: value,
        ...(quantity !== null ? { quantity } : {}), monthlyContribution,
        valuationDateSource: read(cells, "valuation_date") || read(cells, "snapshot_date") ? "row" : "preamble",
        providerSource: read(cells, "provider") ? "row" : "preamble",
        preambleRows: params.preambleRows ?? [],
        documentLocale: locale,
        sourceText: cells.join("\t"), sourceCells: cells, originalHeaders: headers,
        sourceRowIndex: headerIndex + index + 2, preambleMetadata: metadata,
        reviewRequired: true,
        reviewReasons: ["Confirm the investment name, currency, quantity and valuation. Contributions and holdings are not spending or cost basis."],
      },
    }];
  });
}

export function parseIndonesianInvestmentTable(params: Omit<Parameters<typeof parseKoreanInvestmentTable>[0], "locale">) {
  try { return parseKoreanInvestmentTable({ ...params, locale: "id" }); }
  catch (error) {
    if (error instanceof Error) throw new Error(error.message.replace(/Korean/g, "Indonesian"), { cause: error });
    throw error;
  }
}
