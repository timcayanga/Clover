export const FINVERSE_COUNTRIES = [
  { code: "HKG", name: "Hong Kong", flag: "🇭🇰" },
  { code: "IDN", name: "Indonesia", flag: "🇮🇩" },
  { code: "MYS", name: "Malaysia", flag: "🇲🇾" },
  { code: "PHL", name: "Philippines", flag: "🇵🇭" },
  { code: "SGP", name: "Singapore", flag: "🇸🇬" },
  { code: "THA", name: "Thailand", flag: "🇹🇭" },
  { code: "VNM", name: "Vietnam", flag: "🇻🇳" },
] as const;
export function finverseCountries(banks: { countries: string[] }[]) {
  const countries = new Map<string, {code:string;name:string;flag:string}>(FINVERSE_COUNTRIES.map(country => [country.code, country]));
  for (const bank of banks) for (const code of bank.countries) if (!countries.has(code)) countries.set(code, {code,name:code,flag:"🌐"});
  return [...countries.values()].sort((a,b)=>a.name.localeCompare(b.name));
}
