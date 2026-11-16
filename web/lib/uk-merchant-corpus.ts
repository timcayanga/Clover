export type UkMerchantCategory =
  | "Bills & Utilities"
  | "Entertainment"
  | "Financial"
  | "Food & Dining"
  | "Shopping"
  | "Transport"
  | "Travel & Lifestyle";

type UkMerchantCorpusEntry = {
  label: string;
  category: UkMerchantCategory;
  patterns: RegExp[];
};

// Statement descriptors are often truncated to the bank's fixed-width field.
// Keep these rules specific enough to avoid turning an unknown UK merchant into
// a confident guess merely because its location is familiar.
const UK_MERCHANT_CORPUS: readonly UkMerchantCorpusEntry[] = [
  {
    label: "Apple.com/Bill",
    category: "Bills & Utilities",
    patterns: [/\bapple\.com\/bil{1,2}\b/i],
  },
  {
    label: "National Express",
    category: "Transport",
    patterns: [/\bnational\s+express\b/i],
  },
  {
    label: "Sainsbury's",
    category: "Shopping",
    patterns: [/\bsainsbury'?s(?:\s+s\/mkts?)?\b/i],
  },
  {
    label: "Wasabi",
    category: "Food & Dining",
    patterns: [/\bwasabi(?:[_\s-]+kings?\s*cross)?\b/i],
  },
  {
    label: "Al Chile",
    category: "Food & Dining",
    patterns: [/\b(?:sumup\s*\*?\s*)?al\s+chile\b/i],
  },
  {
    label: "Flat Iron",
    category: "Food & Dining",
    patterns: [/\bflat\s+iron(?:\s+cambridg\w*)?\b/i],
  },
  {
    label: "Downing JCR",
    category: "Food & Dining",
    patterns: [/\b(?:vms\s+)?downing\s+jcr\b/i],
  },
  {
    label: "Town and Gown",
    category: "Food & Dining",
    patterns: [/\btown\s+and\s+gown\b/i],
  },
  {
    label: "Titanic Belfast",
    category: "Entertainment",
    patterns: [/\btitanic\s+belfast(?:\s+lt\w*)?\b/i],
  },
  {
    label: "Crown Liquor Saloon",
    category: "Food & Dining",
    patterns: [/\bcrown\s+liquor\s+saloo(?:n)?\b/i],
  },
  {
    label: "Holiday Inn Belfast",
    category: "Travel & Lifestyle",
    patterns: [/\bholiday\s+inn\s+belfas\w*\b/i],
  },
  {
    label: "The Norn Irish Gift Shop",
    category: "Shopping",
    patterns: [/\b(?:the\s+)?norn\s+irish\s+gif(?:t)?\b/i],
  },
  {
    label: "SSP UK",
    category: "Food & Dining",
    patterns: [/\bssp\s+uk(?:\s+ltd)?\b/i],
  },
  {
    label: "National Justice Museum",
    category: "Entertainment",
    patterns: [/\bzettle[_*\s-]*national\s+j\b.*\bnottingham\b/i],
  },
  {
    label: "Derby Uncovered",
    category: "Travel & Lifestyle",
    patterns: [/\b(?:sq\s*\*\s*)?derby\s+uncovere(?:d)?\b/i],
  },
  {
    label: "Damascena",
    category: "Food & Dining",
    patterns: [/\bdamascena(?:\s+city)?\b/i],
  },
  {
    label: "Contactless Travel",
    category: "Transport",
    patterns: [/\bcontactless\.?travel\b/i],
  },
  {
    label: "Translink",
    category: "Transport",
    patterns: [/\btranslink\s+fare\b/i],
  },
  {
    label: "Birmingham Museum",
    category: "Entertainment",
    patterns: [/\b(?:sp\s+)?birmingham\s*museu\w*\b/i],
  },
  {
    label: "KFC",
    category: "Food & Dining",
    patterns: [/\bkfc\b/i],
  },
  {
    label: "Londis",
    category: "Shopping",
    patterns: [/\blondis\b/i],
  },
  {
    label: "WHSmith",
    category: "Shopping",
    patterns: [/\bwh\s*smith\b/i],
  },
  {
    label: "Birmingham New Street",
    category: "Transport",
    patterns: [/\bbirmingham\s+new\s+st(?:reet)?\b/i],
  },
  {
    label: "T4",
    category: "Food & Dining",
    patterns: [/\bt\s*4\b.*\bbirmingham\b/i],
  },
  {
    label: "Grain & Hop",
    category: "Food & Dining",
    patterns: [/\bgrain\s*&?\s*hop(?:\s+store)?\b/i],
  },
  {
    label: "Darwin College",
    category: "Food & Dining",
    patterns: [/\bzettle[_*\s-]*darwin\s+col(?:lege)?\b.*\bcambridge\b/i],
  },
  {
    label: "Non-Sterling Transaction Fee",
    category: "Financial",
    patterns: [/\bnon-?sterling(?:\s+transaction)?\s+fee\b/i],
  },
];

export const findUkMerchantCorpusEntry = (value: string) => {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return null;
  }

  return UK_MERCHANT_CORPUS.find((entry) => entry.patterns.some((pattern) => pattern.test(normalized))) ?? null;
};

export const getUkMerchantLabel = (value: string) => findUkMerchantCorpusEntry(value)?.label ?? null;

export const getUkMerchantCategoryHint = (value: string) =>
  findUkMerchantCorpusEntry(value)?.category ?? null;
