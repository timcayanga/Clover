import { getAccountBrand } from "./account-brand";

// Only identify the payee. The funding account can belong to a different institution.
export function recurringBankBrand(title: string) {
  const payee = title.trim().replace(/^payment to\s+/i, "")
    .replace(/\s+(?:(?:credit )?card )?(?:payment|repayment)$/i, "")
    .replace(/\s+(?:[*•]+\s*)?\d{4}$/, "").trim();
  if (!payee) return null;
  const brand = getAccountBrand({ institution: payee, type: "bank" });
  return brand.logoSrc?.startsWith("/assets/banks/") && brand.label.toLowerCase() === payee.toLowerCase() ? brand : null;
}
