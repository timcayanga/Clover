import { SORTED_INVESTMENT_SUBTYPES, getInvestmentSubtypeLabel } from "./investments";
export const investmentTableFields = ["investmentSubtype", "name", "institution", "currency", "balance"] as const;
export type InvestmentTableField = typeof investmentTableFields[number];
export type InvestmentTableRow = Record<InvestmentTableField, string> & { key: string; status?: "saved" | "uncertain"; error?: string };
export const investmentTableLabels: Record<InvestmentTableField, string> = { investmentSubtype: "Investment type", name: "Investment name", institution: "Institution", currency: "Currency", balance: "Current value" };
export const emptyInvestmentRow = (key: string, currency: string): InvestmentTableRow => ({ key, investmentSubtype: "stock", name: "", institution: "", currency, balance: "" });
export const populatedInvestmentRow = (row: InvestmentTableRow) => Boolean(row.name.trim() || row.institution.trim() || row.balance.trim());
export function investmentRowIssue(row: InvestmentTableRow, currencies: string[]) {
  if (!row.name.trim()) return "Enter an investment name.";
  if (!SORTED_INVESTMENT_SUBTYPES.some(type => type === row.investmentSubtype)) return "Choose an investment type.";
  if (!currencies.includes(row.currency.trim().toUpperCase())) return "Choose a supported currency.";
  if (!row.balance.trim() || !Number.isFinite(Number(row.balance)) || Number(row.balance) < 0) return "Enter a current value of zero or more.";
  return "";
}
export function normalizeInvestmentTableCell(field: InvestmentTableField, raw: string) {
  const value = raw.trim();
  if (field === "investmentSubtype") return SORTED_INVESTMENT_SUBTYPES.find(type => type === value.toLowerCase() || getInvestmentSubtypeLabel(type).toLowerCase() === value.toLowerCase()) ?? value;
  if (field === "currency") return value.toUpperCase();
  if (field === "balance") return value.replace(/,/g, "").replace(/^[₱$€£¥]\s*/, "");
  return value;
}
