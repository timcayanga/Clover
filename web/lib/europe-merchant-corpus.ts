export type EuropeMerchantCategory =
  | "Bills & Utilities"
  | "Food & Dining"
  | "Shopping"
  | "Subscriptions"
  | "Transport"
  | "Travel & Lifestyle";

type EuropeMerchantCorpusEntry = {
  label: string;
  category: EuropeMerchantCategory;
  patterns: RegExp[];
};

// Keep these patterns merchant-specific. Payment processors such as Adyen,
// Stripe, SumUp, and Zettle are intentionally not merchants by themselves.
const EUROPE_MERCHANT_CORPUS: readonly EuropeMerchantCorpusEntry[] = [
  // Public transport and rail
  { label: "Navigo", category: "Transport", patterns: [/\bservice\s+navigo\b/i, /\b(?:ile|île)[\s-]+de[\s-]+france\s+mobilit(?:e|é)s\b/i] },
  { label: "RATP", category: "Transport", patterns: [/\bratp\b/i] },
  { label: "SNCF", category: "Transport", patterns: [/\bsncf(?:\s+connect)?\b/i, /\btransilien\b/i] },
  { label: "Eurostar", category: "Transport", patterns: [/\beurostar\b/i] },
  { label: "Trainline", category: "Transport", patterns: [/\btrainline\b/i] },
  { label: "TrainPal", category: "Transport", patterns: [/\btrainpal\b/i] },
  { label: "Deutsche Bahn", category: "Transport", patterns: [/\bdeutsche\s+bahn\b/i, /\bdb\s+(?:bahn|vertrieb|navigator)\b/i] },
  { label: "BVG", category: "Transport", patterns: [/\bbvg\b.*\bberlin\b/i, /\bberliner\s+verkehrsbetriebe\b/i] },
  { label: "ÖBB", category: "Transport", patterns: [/\b(?:oebb|öbb)\b/i] },
  { label: "SBB", category: "Transport", patterns: [/\b(?:sbb|cff|ffs)\b.*\b(?:ticket|mobile|rail|swiss|zurich|geneva|basel)\b/i] },
  { label: "NS", category: "Transport", patterns: [/\bns\s+(?:international|reizen|nl)\b/i, /\bnederlandse\s+spoorwegen\b/i] },
  { label: "OV-chipkaart", category: "Transport", patterns: [/\bov[\s-]*chipkaart\b/i] },
  { label: "Trenitalia", category: "Transport", patterns: [/\btrenitalia\b/i] },
  { label: "Italo", category: "Transport", patterns: [/\bitalo\s+(?:treno|spa|ntv)\b/i] },
  { label: "Renfe", category: "Transport", patterns: [/\brenfe\b/i] },
  { label: "Comboios de Portugal", category: "Transport", patterns: [/\bcp\s+comboios\b/i, /\bcomboios\s+de\s+portugal\b/i] },
  { label: "PKP Intercity", category: "Transport", patterns: [/\bpkp\s+intercity\b/i] },
  { label: "FlixBus", category: "Transport", patterns: [/\bflixbus\b/i] },
  { label: "BlaBlaCar", category: "Transport", patterns: [/\bblablacar(?:\s+bus)?\b/i] },
  { label: "Gwynfor Coaches", category: "Transport", patterns: [/\bgwynfor\s+coaches\b/i] },

  // Airlines and accommodation
  { label: "Ryanair", category: "Travel & Lifestyle", patterns: [/\bryanair\b/i] },
  { label: "easyJet", category: "Travel & Lifestyle", patterns: [/\beasyjet\b/i] },
  { label: "Wizz Air", category: "Travel & Lifestyle", patterns: [/\bwizz\s*air\b/i] },
  { label: "Vueling", category: "Travel & Lifestyle", patterns: [/\bvueling\b/i] },
  { label: "British Airways", category: "Travel & Lifestyle", patterns: [/\bbritish\s+airways\b/i] },
  { label: "Air France", category: "Travel & Lifestyle", patterns: [/\bair\s+france\b/i] },
  { label: "KLM", category: "Travel & Lifestyle", patterns: [/\bklm\b/i] },
  { label: "Lufthansa", category: "Travel & Lifestyle", patterns: [/\blufthansa\b/i] },
  { label: "Booking.com", category: "Travel & Lifestyle", patterns: [/\bbooking\.com\b/i, /\bbookingcom\b/i] },
  { label: "Airbnb", category: "Travel & Lifestyle", patterns: [/\bairbnb\b/i] },
  { label: "Hostelworld", category: "Travel & Lifestyle", patterns: [/\bhostelworld\b/i] },

  // Food delivery and dining platforms
  { label: "Deliveroo", category: "Food & Dining", patterns: [/\bdeliveroo\b/i] },
  { label: "Just Eat", category: "Food & Dining", patterns: [/\bjust\s*eat\b/i] },
  { label: "Wolt", category: "Food & Dining", patterns: [/\bwolt\b/i] },
  { label: "Glovo", category: "Food & Dining", patterns: [/\bglovo\b/i] },
  { label: "Bolt Food", category: "Food & Dining", patterns: [/\bbolt\s+food\b/i] },

  // Supermarkets and everyday retail. Clover currently groups groceries under Shopping.
  { label: "Tesco", category: "Shopping", patterns: [/\btesco\b/i] },
  { label: "Sainsbury's", category: "Shopping", patterns: [/\bsainsbury'?s\b/i] },
  { label: "Waitrose", category: "Shopping", patterns: [/\bwaitrose\b/i] },
  { label: "Aldi", category: "Shopping", patterns: [/\baldi\b/i] },
  { label: "Lidl", category: "Shopping", patterns: [/\blidl\b/i] },
  { label: "Carrefour", category: "Shopping", patterns: [/\bcarrefour\b/i] },
  { label: "Monoprix", category: "Shopping", patterns: [/\bmonoprix\b/i] },
  { label: "Auchan", category: "Shopping", patterns: [/\bauchan\b/i] },
  { label: "E.Leclerc", category: "Shopping", patterns: [/\be[.\s-]*leclerc\b/i] },
  { label: "Intermarché", category: "Shopping", patterns: [/\bintermarche\b/i, /\bintermarché\b/i] },
  { label: "REWE", category: "Shopping", patterns: [/\brewe\b/i] },
  { label: "EDEKA", category: "Shopping", patterns: [/\bedeka\b/i] },
  { label: "Mercadona", category: "Shopping", patterns: [/\bmercadona\b/i] },
  { label: "Continente", category: "Shopping", patterns: [/\bcontinente\s+(?:modelo|bom\s+dia|hipermercado)\b/i] },
  { label: "Albert Heijn", category: "Shopping", patterns: [/\balbert\s+heijn\b/i, /\bah\s+to\s+go\b/i] },
  { label: "Delhaize", category: "Shopping", patterns: [/\bdelhaize\b/i] },
  { label: "dm", category: "Shopping", patterns: [/\bdm\s+drogerie\b/i, /\bdm-drogerie\s+markt\b/i] },
  { label: "Boots", category: "Shopping", patterns: [/\bboots\s+(?:uk|pharmacy|store)\b/i] },

  // Common pan-European digital services
  { label: "Free Now", category: "Transport", patterns: [/\bfree\s*now\b/i, /\bmytaxi\b/i] },
  { label: "Bolt", category: "Transport", patterns: [/\bbolt\s+(?:ride|taxi|eu|operations)\b/i] },
  { label: "Uber", category: "Transport", patterns: [/\buber\s+(?:trip|bv|payments)\b/i] },
  { label: "Revolut", category: "Subscriptions", patterns: [/\brevolut\s+(?:premium|metal|ultra)\b/i] },
];

export const findEuropeMerchantCorpusEntry = (value: string) => {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return null;
  }

  return EUROPE_MERCHANT_CORPUS.find((entry) => entry.patterns.some((pattern) => pattern.test(normalized))) ?? null;
};

export const getEuropeMerchantLabel = (value: string) => findEuropeMerchantCorpusEntry(value)?.label ?? null;

export const getEuropeMerchantCategoryHint = (value: string) =>
  findEuropeMerchantCorpusEntry(value)?.category ?? null;
