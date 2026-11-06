import { adviserRequestedCurrency, declinesChart, isAdviserChartFollowUp, stripAdviserCurrencyPhrase } from "./adviser-facts";
import { ISO_COUNTRY_NAMES } from "../../shared/iso-country-names";
import { getRegionalParsingProfile } from "./context-corpus";
import { normalizeRegionalPreferences } from "./regional-preferences";

export function adviserRegionalContext(value: unknown, accountCurrencies: string[]) {
  const preferences = normalizeRegionalPreferences(value);
  const saved = value && typeof value === "object" ? value as Record<string, unknown> : {};
  let countryCode = typeof saved.countryCode === "string" && saved.detectionSource !== "fallback"
    ? saved.countryCode.trim().toUpperCase() : null;
  // Native onboarding can save a locale without a country. Use its explicit region only.
  if (!countryCode && typeof saved.locale === "string" && saved.detectionSource !== "fallback") {
    try {
      countryCode = new Intl.Locale(saved.locale).region ?? null;
    } catch {
      // Invalid or missing locale is not evidence of a location.
    }
  }
  const country = ISO_COUNTRY_NAMES.find(([, code]) => code === countryCode);
  const counts = new Map<string, number>();
  for (const value of accountCurrencies) {
    const currency = value.trim().toUpperCase();
    if (/^[A-Z]{3}$/.test(currency) && currency !== "ALL") counts.set(currency, (counts.get(currency) ?? 0) + 1);
  }
  const localCurrency = country ? getRegionalParsingProfile(country[1])?.defaultCurrency : undefined;
  const currencies = [...counts.keys()].sort((a, b) =>
    counts.get(b)! - counts.get(a)! ||
    Number(b === preferences.baseCurrency) - Number(a === preferences.baseCurrency) ||
    Number(b === localCurrency) - Number(a === localCurrency) ||
    a.localeCompare(b),
  );
  const dominantCurrency = currencies[0] ?? localCurrency ?? preferences.baseCurrency;
  const leaders = currencies.filter(code => counts.get(code) === counts.get(dominantCurrency));
  const defaultReason = leaders.length === 1 ? "account-count"
    : leaders.length === 0 ? localCurrency ? "country" : "base"
    : dominantCurrency === preferences.baseCurrency ? "base"
    : dominantCurrency === localCurrency ? "country" : "tie";
  return {
    countryCode: country?.[1] ?? null,
    countryName: country?.[2] ?? null,
    localCurrency,
    currencies,
    dominantCurrency,
    dominantAccountCount: counts.get(dominantCurrency) ?? 0,
    defaultReason,
    timeZone: preferences.timeZone,
  };
}

const localCurrencyFollowUp = /^(?:(?:what about|how about|show me|show (?:that|it)) )?(?:in )?(?:my |the )?local currency[.!?]*$/i;
const localCurrencySuffix = /\bin (?:my |the )?local currency(?=[.!?]*$)/i;

export function resolveAdviserLocalCurrency(question: string, currency?: string) {
  if (localCurrencyFollowUp.test(question.trim())) return currency ? `In ${currency}` : null;
  if (localCurrencySuffix.test(question)) return currency ? question.replace(localCurrencySuffix, `in ${currency}`) : null;
  return resolveAdviserCountryCurrencyReference(question);
}

function resolveAdviserCountryCurrencyReference(question: string) {
  const named = /(?:^|\bin )(?:the )?currency (?:used )?in (.+?)(?=[.!?]*$)/i.exec(question);
  // Start after the last "in" so an earlier date or filter stays intact.
  const possessive = /^(.*\bin )?(.+?)[’']s currency[.!?]*$/i.exec(question);
  const country = named?.[1] ?? possessive?.[2].replace(/^(?:what about|how about) /i, "");
  if (!country) return question;
  const prefix = named ? question.slice(0, named.index) : possessive?.[1]?.slice(0, -3) ?? "";
  const code = budgetCountryCode(country);
  const currency = code ? getRegionalParsingProfile(code)?.defaultCurrency : undefined;
  return currency ? `${prefix}in ${currency}`.trim() : null;
}

const normalizeCountryName = (value: string) => value.trim().toLowerCase().normalize("NFD")
  .replace(/\p{M}/gu, "").replace(/[’']/g, "'").replace(/^the /, "");

const budgetCountries = new Map(ISO_COUNTRY_NAMES.map(([, code, name]) => [normalizeCountryName(name), code]));
for (const [name, code] of Object.entries({
  "united states": "US", "usa": "US", "uk": "GB", "great britain": "GB",
  "south korea": "KR", "north korea": "KP", "vietnam": "VN", "taiwan": "TW",
  "ivory coast": "CI", "czech republic": "CZ", "turkey": "TR", "uae": "AE",
  "deutschland": "DE", "españa": "ES", "brasil": "BR", "méxico": "MX",
  "日本": "JP", "대한민국": "KR", "ประเทศไทย": "TH", "việt nam": "VN",
})) budgetCountries.set(normalizeCountryName(name), code);

function budgetCountryCode(value: string) {
  return budgetCountries.get(normalizeCountryName(value));
}

export function resolveAdviserCountryCurrency(messages: { role: string; content: string }[]) {
  const questions = messages.filter(message => message.role === "user").map(message => message.content.trim().replace(/[.!?]+$/, ""));
  let selected: string | undefined;
  for (const question of questions.reverse()) {
    const direct = /^(?:what currency (?:should i (?:use|budget in)|do (?:they|people) use|is used)|what(?: is|[’']s) the (?:local )?currency) (?:in|for) (.+)$/i.exec(question);
    if (direct) return { country: selected ?? direct[1] };
    const followUp = /^(?:what about|how about) (?:in )?(.+)$/i.exec(question);
    if (!followUp || !budgetCountryCode(followUp[1])) return null;
    selected ??= followUp[1];
  }
  return null;
}

export function adviserCountryCurrencyAnswer(name: string) {
  const code = budgetCountryCode(name);
  const countryName = ISO_COUNTRY_NAMES.find(([, countryCode]) => countryCode === code)?.[2];
  const currency = code ? getRegionalParsingProfile(code)?.defaultCurrency : undefined;
  if (!countryName) return { reply: "I couldn’t match that place to a country or territory. Try the full country or territory name.", suggestions: [] };
  if (!currency) return { reply: `I don’t have a budget currency for ${countryName} in Clover’s regional settings yet. You can give me a currency code to use.`, suggestions: [] };
  return {
    reply: `I’d use ${currency} for a budget in ${countryName}. If you pay some bills in another currency, you can plan for those separately.`,
    suggestions: [{ id: "country-currency-budget", group: "currency", label: `Plan a ${currency} budget`, prompt: `How should I budget for living expenses in ${countryName}?` }],
  };
}

export function adviserBudgetDestination(region: ReturnType<typeof adviserRegionalContext>, countryCode?: string) {
  const country = countryCode && ISO_COUNTRY_NAMES.find(([, code]) => code === countryCode);
  if (!country) return region;
  return {
    ...region,
    countryCode: country[1],
    countryName: country[2],
    localCurrency: getRegionalParsingProfile(country[1])?.defaultCurrency,
  };
}

export function resolveAdviserRegionalBudget(messages: { role: string; content: string }[]) {
  const questions = messages.filter(message => message.role === "user").map(message => message.content.trim());
  let currency: string | undefined;
  let chart: boolean | undefined;
  let useLocalCurrency = false;
  let countryCode: string | undefined;
  for (const question of questions.reverse()) {
    const clean = question.replace(/[.!?]+$/, "");
    if (isAdviserChartFollowUp(question)) {
      chart ??= true;
      continue;
    }
    if (/^(?:just (?:the )?(?:numbers|text)|no (?:chart|graph))$/i.test(clean)) {
      chart ??= false;
      continue;
    }
    if (localCurrencyFollowUp.test(clean)) {
      if (!currency) useLocalCurrency = true;
      continue;
    }
    const destinationFollowUp = /^(?:what about|how about|instead in) (?:in )?(.+)$/i.exec(clean);
    const nextCountry = destinationFollowUp && budgetCountryCode(destinationFollowUp[1]);
    if (nextCountry) {
      countryCode ??= nextCountry;
      if (!currency) useLocalCurrency = true;
      continue;
    }
    const explicitCurrency = adviserRequestedCurrency(clean);
    const withoutCurrency = stripAdviserCurrencyPhrase(clean).trimEnd();
    if (explicitCurrency && /^(?:what about|how about|show me|show (?:that|it))?$/i.test(withoutCurrency)) {
      if (!useLocalCurrency) currency ??= explicitCurrency;
      continue;
    }
    const asksForLocalCurrency = localCurrencySuffix.test(clean);
    let base = withoutCurrency.replace(localCurrencySuffix, "").trimEnd()
      .replace(/(?:,? (?:with(?:out)? a (?:chart|graph)|no (?:chart|graph)))+$/i, "");
    const destination = / in (.+)$/i.exec(base);
    const explicitCountry = destination && budgetCountryCode(destination[1]);
    if (explicitCountry) {
      countryCode ??= explicitCountry;
      base = base.slice(0, destination.index);
      if (!currency && !explicitCurrency) useLocalCurrency = true;
    }
    const destinationOnly = explicitCountry && /^(?:how should i budget|which currency should i budget)$/i.test(base);
    if (!destinationOnly && !/^(?:which currency should i (?:use for my budget|budget in)|help me plan a realistic budget|how should i budget (?:for (?:my )?living expenses(?: here)?|across currencies|with multiple currencies))$/i.test(base)) return null;
    if (!currency && asksForLocalCurrency) useLocalCurrency = true;
    return {
      currency: useLocalCurrency ? undefined : currency ?? explicitCurrency,
      ...(useLocalCurrency ? { useLocalCurrency } : {}),
      ...(countryCode ? { countryCode } : {}),
      chart: chart ?? (declinesChart(clean) ? false : /\b(?:chart|graph)\b/i.test(clean) ? true : undefined),
    };
  }
  return null;
}

export const isAdviserCurrencyExplanation = (question: string) =>
  /^(?:what currency (?:are you using|is this in)|which currency (?:are you using|did you pick)|why (?:this|that) currency|why did you (?:pick|choose) (?:this|that) currency)[.!?]*$/i.test(question.trim());

export function adviserCurrencyExplanation(
  region: ReturnType<typeof adviserRegionalContext>,
  currency: string,
  source: "request" | "page" | "default",
) {
  let reason: string;
  if (source === "request") reason = "That’s the currency you asked for.";
  else if (source === "page") reason = "That’s the currency selected on this page.";
  else if (region.defaultReason === "account-count") {
    const count = region.dominantAccountCount;
    reason = `This Profile has ${count} ${currency} ${count === 1 ? "account" : "accounts"}, more than in any other currency.`;
  } else if (region.defaultReason === "country") reason = "It matches the country in your regional settings.";
  else if (region.defaultReason === "base") reason = "It matches your saved base currency.";
  else reason = "Your leading currencies have the same number of accounts, so I use the first currency code alphabetically as a default.";
  const alternatives = region.currencies.filter(code => code !== currency);
  const next = alternatives.length ? ` You can also ask for ${alternatives.join(", ")}.` : "";
  return `I’m using ${currency}. ${reason}${next}`;
}

const localBudgetExamples: Record<string, string> = {
  PH: "rent, utilities, groceries, and any regular family support",
  SG: "rent, groceries, and public transport",
  JP: "rent, utilities, groceries, and commuting",
  GB: "rent, council tax if you pay it, groceries, and transport",
};

export function adviserRegionalBudgetReply(region: ReturnType<typeof adviserRegionalContext>, currency: string, useLocalCurrency = false) {
  const location = region.countryName ? `For day-to-day costs in ${region.countryName},` : "For day-to-day costs,";
  const essentials = localBudgetExamples[region.countryCode ?? ""] ?? "rent, utilities, groceries, and transport";
  const local = region.localCurrency && region.localCurrency !== currency
    ? `\n\n${location} keep a separate ${region.localCurrency} budget for ${essentials} if you pay those costs in ${region.localCurrency}.`
    : `\n\n${location} start with ${essentials}. Use what you actually paid recently as a baseline.`;
  const other = region.currencies.filter(code => code !== currency && code !== region.localCurrency);
  const separate = other.length
    ? ` Keep ${other.join(", ")} bills and savings targets in their own currencies. If you move money between them, allow for conversion fees.`
    : "";
  const reason = currency === region.dominantCurrency && region.currencies.length > 1
    ? " That’s the default I picked from your accounts and regional settings."
    : "";
  const opening = useLocalCurrency ? `I’d plan your local expenses in ${currency}.` : `I’d start your main budget in ${currency}.${reason}`;
  return `${opening}${local}${separate}`;
}
