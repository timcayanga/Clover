import { finverseConnectorIdentity } from "../../shared/finverse-bank-options";
import { getAccountBrand } from "./account-brand";
import { findAdditionalBankLogo } from "./bank-logo-catalog";
import { FINVERSE_COUNTRIES } from "../../shared/finverse-countries";

export function finverseBankPresentation(bank: { id?: string; name: string; countries: string[] }) {
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
  const identity = finverseConnectorIdentity(bank.id || bank.name, bank.name);
  const accountType = identity.accessType === "Bank access" ? undefined : `${identity.accessType} accounts`;
  const accountTypes = Object.fromEntries(bank.countries.map(country => [country, accountType || "Bank access"]));
  return { ...identity, accountType, accountTypes, name: identity.brandName || (bankLogo ? brand.label : shortName), logoUrl: logoUrls[bank.countries[0]] || bankLogo || brand.fallbackIconSrc, logoUrls };
}
