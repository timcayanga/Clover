// Clover's supported Connect markets. A market is shown only if a usable
// institution explicitly lists it; global corporate coverage is not availability.
export const FINVERSE_COUNTRIES = [
  { code: "HKG", alpha2: "HK", name: "Hong Kong", flag: "🇭🇰", flagSrc: "/assets/countries/hong%20kong.png" },
  { code: "IDN", alpha2: "ID", name: "Indonesia", flag: "🇮🇩", flagSrc: "/assets/countries/indonesia.png" },
  { code: "MYS", alpha2: "MY", name: "Malaysia", flag: "🇲🇾", flagSrc: "/assets/countries/malaysia.png" },
  { code: "PHL", alpha2: "PH", name: "Philippines", flag: "🇵🇭", flagSrc: "/assets/countries/philippines.png" },
  { code: "SGP", alpha2: "SG", name: "Singapore", flag: "🇸🇬", flagSrc: "/assets/countries/singapore.png" },
  { code: "THA", alpha2: "TH", name: "Thailand", flag: "🇹🇭", flagSrc: null },
  { code: "VNM", alpha2: "VN", name: "Vietnam", flag: "🇻🇳", flagSrc: "/assets/countries/vietnam.png" },
] as const;
export function connectBankCountries(name: string, codes: string[]) {
  const southeastAsia = new Set(["IDN", "MYS", "PHL", "SGP", "THA", "VNM"]);
  const isCiti = /\bciti(?:bank|direct)?\b/i.test(name);
  return FINVERSE_COUNTRIES.filter(c => codes.some(code => [c.code, c.alpha2, c.name.toUpperCase()].includes(code.trim().toUpperCase())) &&
    (!isCiti || southeastAsia.has(c.code))).map(c => c.code);
}
export function finverseCountries(banks: { countries: string[] }[]) {
  const available = new Set(banks.flatMap(bank => bank.countries));
  return FINVERSE_COUNTRIES.filter(country => available.has(country.code));
}
