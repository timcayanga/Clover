import { getAccountBrand } from "./account-brand";
import { findAdditionalBankLogo } from "./bank-logo-catalog";
import { FINVERSE_COUNTRIES } from "../../shared/finverse-countries";

export function finverseBankPresentation(bank: { name: string; countries: string[] }) {
  const shortName = bank.name.replace(/\bciti(?:direct)?\b/gi, "Citibank")
    .replace(/\b(?:personal|business|corporate|retail|online|internet|banking)\b/gi, "")
    .replace(/\(\s*\)/g, "").replace(/\s*[-–—|:]\s*$/g, "").replace(/\s+/g, " ").trim();
  const brand = getAccountBrand({ institution: shortName, type: "bank" });
  const bankLogo = brand.logoSrc || brand.logoSrcs?.[0];
  const logoUrls: Record<string, string> = {};
  for (const code of bank.countries) {
    const country = FINVERSE_COUNTRIES.find(c => c.code === code);
    const regional = findAdditionalBankLogo(`${shortName} ${country?.name ?? ""}`);
    logoUrls[code] = regional?.src || bankLogo || brand.fallbackIconSrc;
  }
  const accountType = /business|corporate|citidirect|hsbcnet/i.test(bank.name) ? "Business accounts" : /personal|individual|retail/i.test(bank.name) ? "Personal accounts" : undefined;
  const accountTypes: Record<string, string> = {};
  for (const country of bank.countries) {
    const businessOnly = (["PHL", "VNM"].includes(country) && /citi|dbs|standard chartered|uob|hsbc/i.test(bank.name)) ||
      (["IDN", "MYS"].includes(country) && /dbs|hsbc|standard chartered|ocbc/i.test(bank.name)) ||
      (country === "SGP" && /hsbc|standard chartered/i.test(bank.name));
    if (businessOnly || accountType) accountTypes[country] = businessOnly ? "Business accounts only" : accountType!;
  }
  return { accountType, accountTypes, name: bankLogo ? brand.label : shortName, logoUrl: logoUrls[bank.countries[0]] || bankLogo || brand.fallbackIconSrc, logoUrls };
}
