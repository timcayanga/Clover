import { ISO_COUNTRY_NAMES } from "./iso-country-names";

// Supplied flag artwork. Availability still comes from the provider catalogue.
export const FINVERSE_COUNTRIES = [
  { code: "HKG", alpha2: "HK", name: "Hong Kong", flag: "🇭🇰", flagSrc: "/assets/countries/hong%20kong.png" },
  { code: "IDN", alpha2: "ID", name: "Indonesia", flag: "🇮🇩", flagSrc: "/assets/countries/indonesia.png" },
  { code: "MYS", alpha2: "MY", name: "Malaysia", flag: "🇲🇾", flagSrc: "/assets/countries/malaysia.png" },
  { code: "PHL", alpha2: "PH", name: "Philippines", flag: "🇵🇭", flagSrc: "/assets/countries/philippines.png" },
  { code: "SGP", alpha2: "SG", name: "Singapore", flag: "🇸🇬", flagSrc: "/assets/countries/singapore.png" },
  { code: "VNM", alpha2: "VN", name: "Vietnam", flag: "🇻🇳", flagSrc: "/assets/countries/vietnam.png" },
] as const;
const allCountries = ISO_COUNTRY_NAMES.map(([code, alpha2, name]) => {
  const supplied = FINVERSE_COUNTRIES.find(c => c.code === code);
  return { code, alpha2, name: supplied?.name ?? name, flagSrc: supplied?.flagSrc ?? null,
    flag: supplied?.flag ?? [...alpha2].map(c => String.fromCodePoint(127397 + c.charCodeAt(0))).join("") };
});
export function connectBankCountries(name: string, codes: string[]) {
  const southeastAsia = new Set(["IDN", "MYS", "PHL", "SGP", "VNM"]);
  const isCiti = /\bciti(?:bank|direct)?\b/i.test(name);
  return allCountries.filter(c => FINVERSE_COUNTRIES.some(s => s.code === c.code) && codes.some(code => [c.code, c.alpha2, c.name.toUpperCase()].includes(code.trim().toUpperCase())) &&
    (!isCiti || southeastAsia.has(c.code))).map(c => c.code);
}
export function finverseCountries(banks: { countries: string[] }[]) {
  const available = new Set(banks.flatMap(bank => bank.countries));
  return allCountries.filter(country => FINVERSE_COUNTRIES.some(s => s.code === country.code) && available.has(country.code)).sort((a,b) => a.name.localeCompare(b.name));
}
