import type { ParsedImportRow } from "@/lib/import-parser";
import { detectCurrencyEvidence, normalizeGlobalCurrencyCode } from "@/lib/financial-identity-detection";
import { koreanFinancialHeader, koreanInvestmentHeader, koreanMoneyUnitScale, normalizeKoreanFinancialText, parseKoreanAmount, parseKoreanDate } from "@/lib/korean-financial-text";

const headerKey = (value: string) => {
  const key = normalizeKoreanFinancialText(value).replace(/\([^)]*\)|\[[^\]]*\]/g, "").replace(/\s/g, "");
  return koreanInvestmentHeader(value) ?? koreanFinancialHeader(value) ?? key;
};
export function isKoreanInvestmentHeader(headers: string[]) {
  if (!headers.some(header => /종목명|투자상품명|펀드명|투자명/.test(header.replace(/\s/g, "")))) return false;
  const keys = headers.map(headerKey);
  return ["asset", "market_value"].every(key => keys.includes(key));
}

function validatePreamble(rows: string[][]) {
  const seen = new Map<string, string>();
  for (const row of rows) {
    const cells = row.map(cell => normalizeKoreanFinancialText(cell).trim()).filter(Boolean);
    const inline = cells[0]?.match(/^([^:：=]+)\s*[:：=]\s*(.+)$/);
    const label = inline?.[1] ?? cells[0] ?? "";
    const value = inline?.[2] ?? (cells.length === 2 ? cells[1]! : "");
    const key = koreanInvestmentHeader(label) ?? koreanFinancialHeader(label) ?? (/^(?:단위|금액단위)$/.test(label) ? "money_unit" : null);
    if (!key || !value || !["provider", "institution", "valuation_date", "snapshot_date", "currency", "money_unit", "account_number"].includes(key)) continue;
    const canonicalKey = key === "institution" ? "provider" : key === "snapshot_date" ? "valuation_date" : key;
    const canonicalValue = canonicalKey === "valuation_date" ? parseKoreanDate(value)?.toISOString().slice(0, 10) ?? value :
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
}): ParsedImportRow[] {
  const { headers, rows, headerIndex, metadata } = params;
  validatePreamble(params.preambleRows ?? []);
  const keys = headers.map(headerKey);
  if (new Set(keys.filter(Boolean)).size !== keys.filter(Boolean).length) {
    throw new Error("Clover found duplicate Korean investment columns. Give each column a distinct label and upload again. Nothing was added.");
  }
  const read = (row: string[], key: string) => row[keys.indexOf(key)]?.trim() ?? "";
  const parseMonetaryCell = (row: string[], key: string) => {
    const cell = read(row, key);
    const parsed = parseKoreanAmount(cell);
    if (parsed === null) return null;
    const header = headers[keys.indexOf(key)] ?? "";
    const currency = detectCurrencyEvidence(header).currency ?? normalizeGlobalCurrencyCode(read(row, "currency") || metadata.currency);
    const scale = /[₩￦원만억천백십조]|KRW/i.test(cell) ? 1 :
      koreanMoneyUnitScale(header) ?? ((!currency || currency === "KRW") ? koreanMoneyUnitScale(metadata.money_unit ?? "") : null) ?? 1;
    const scaled = parsed * scale;
    return Number.isSafeInteger(Math.round(scaled * 100)) ? scaled : null;
  };
  const investmentIdentities = new Set<string>();
  return rows.flatMap((cells, index) => {
    if (!cells.some(cell => cell.trim()) || isKoreanInvestmentHeader(cells)) return [];
    const name = read(cells, "asset");
    if (/^(?:합계|총계|소계|총합계)$/.test(name)) return [];
    const provider = read(cells, "provider") || metadata.institution;
    const value = parseMonetaryCell(cells, "market_value");
    const date = parseKoreanDate(read(cells, "valuation_date") || metadata.snapshot_date || "");
    const quantityText = read(cells, "quantity");
    const quantity = quantityText && quantityText !== "-" ? parseKoreanAmount(quantityText.replace(/\s*(?:주|좌)$/, "")) : null;
    const currencyText = read(cells, "currency") || metadata.currency;
    const amountEvidence = detectCurrencyEvidence(`${read(cells, "market_value")} ${headers[keys.indexOf("market_value")]}`);
    const unitCurrency = koreanMoneyUnitScale(metadata.money_unit ?? "") !== null ? "KRW" : null;
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
        investmentSubtype: /펀드/.test(name) ? "mutual_fund" : "other",
        balance: value, statementEndingBalance: value, marketValue: value,
        ...(quantity !== null ? { quantity } : {}), monthlyContribution,
        valuationDateSource: read(cells, "valuation_date") ? "row" : "preamble",
        providerSource: read(cells, "provider") ? "row" : "preamble",
        preambleRows: params.preambleRows ?? [],
        sourceText: cells.join("\t"), sourceCells: cells, originalHeaders: headers,
        sourceRowIndex: headerIndex + index + 2, preambleMetadata: metadata,
        reviewRequired: true,
        reviewReasons: ["Confirm the investment name, currency, quantity and valuation. Contributions and holdings are not spending or cost basis."],
      },
    }];
  });
}
