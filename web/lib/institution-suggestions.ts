export type InstitutionAutocompleteVariant = "account" | "investment";

export type InstitutionSuggestionCategory = "bank" | "wallet" | "investment_platform";

export type InstitutionSuggestion = {
  label: string;
  category: InstitutionSuggestionCategory;
  description: string;
  aliases: string[];
  popularity: number;
  supportsInvestments?: boolean;
};

export type InstitutionSuggestionGroup = {
  title: string;
  items: InstitutionSuggestion[];
};

const normalize = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const withAliases = (aliases: string[], ...values: string[]) => [...aliases, ...values];

const BANK_SUGGESTIONS: InstitutionSuggestion[] = [
  {
    label: "BPI",
    category: "bank",
    description: "Bank of the Philippine Islands",
    aliases: withAliases(["bank of the philippine islands", "bpi savings", "bpi bank"]),
    popularity: 100,
    supportsInvestments: true,
  },
  {
    label: "BDO",
    category: "bank",
    description: "Banco de Oro",
    aliases: withAliases(["banco de oro", "bdo savings", "bdo bank"]),
    popularity: 99,
    supportsInvestments: true,
  },
  {
    label: "Metrobank",
    category: "bank",
    description: "Metropolitan Bank & Trust Company",
    aliases: withAliases(["metropolitan bank", "metro bank"]),
    popularity: 96,
    supportsInvestments: true,
  },
  {
    label: "UnionBank",
    category: "bank",
    description: "Union Bank of the Philippines",
    aliases: withAliases(["union bank", "unionbank of the philippines"]),
    popularity: 95,
    supportsInvestments: true,
  },
  {
    label: "Security Bank",
    category: "bank",
    description: "Security Bank Corporation",
    aliases: withAliases(["securitybank"]),
    popularity: 94,
    supportsInvestments: true,
  },
  {
    label: "RCBC",
    category: "bank",
    description: "Rizal Commercial Banking Corporation",
    aliases: withAliases(["rizal commercial banking corporation"]),
    popularity: 93,
    supportsInvestments: true,
  },
  {
    label: "EastWest",
    category: "bank",
    description: "East West Banking Corporation",
    aliases: withAliases(["east west", "eastwest bank"]),
    popularity: 92,
    supportsInvestments: true,
  },
  {
    label: "Chinabank",
    category: "bank",
    description: "China Banking Corporation",
    aliases: withAliases(["china bank", "china banking corporation", "chinese bank"]),
    popularity: 91,
    supportsInvestments: true,
  },
  {
    label: "AUB",
    category: "bank",
    description: "Asia United Bank",
    aliases: withAliases(["asia united bank"]),
    popularity: 88,
    supportsInvestments: true,
  },
  {
    label: "PNB",
    category: "bank",
    description: "Philippine National Bank",
    aliases: withAliases(["philippine national bank"]),
    popularity: 87,
    supportsInvestments: true,
  },
  {
    label: "LandBank",
    category: "bank",
    description: "Land Bank of the Philippines",
    aliases: withAliases(["land bank", "landbank of the philippines"]),
    popularity: 86,
    supportsInvestments: true,
  },
  {
    label: "CIMB",
    category: "bank",
    description: "CIMB Bank Philippines",
    aliases: withAliases(["cimb bank", "cimb philippines"]),
    popularity: 85,
  },
  {
    label: "Bank of Commerce",
    category: "bank",
    description: "Bank of Commerce",
    aliases: withAliases(["bankcom", "bank of com", "bank of commerce philippines"]),
    popularity: 84,
    supportsInvestments: true,
  },
];

const PLATFORM_SUGGESTIONS: InstitutionSuggestion[] = [
  {
    label: "GCash",
    category: "wallet",
    description: "Wallet and investment platform",
    aliases: withAliases(["g cash", "gcash wallet"]),
    popularity: 100,
  },
  {
    label: "Maya",
    category: "wallet",
    description: "Digital bank and wallet",
    aliases: withAliases(["maya bank", "paymaya"]),
    popularity: 98,
  },
  {
    label: "GrabPay",
    category: "wallet",
    description: "Wallet and payments platform",
    aliases: withAliases(["grab pay"]),
    popularity: 92,
  },
  {
    label: "ShopeePay",
    category: "wallet",
    description: "Wallet and payments platform",
    aliases: withAliases(["shopee pay"]),
    popularity: 91,
  },
  {
    label: "COL Financial",
    category: "investment_platform",
    description: "Stocks and investing platform",
    aliases: withAliases(["col", "col financial group"]),
    popularity: 96,
  },
  {
    label: "FirstMetroSec",
    category: "investment_platform",
    description: "Stock trading platform",
    aliases: withAliases(["first metro sec", "first metro securities", "first metrosec"]),
    popularity: 95,
  },
  {
    label: "BPI Trade",
    category: "investment_platform",
    description: "BPI investing platform",
    aliases: withAliases(["bpi trade online", "bpi trading"]),
    popularity: 94,
  },
  {
    label: "BDO Securities",
    category: "investment_platform",
    description: "BDO investing platform",
    aliases: withAliases(["bdo sec", "bdo securities corporation"]),
    popularity: 93,
  },
  {
    label: "Philstocks",
    category: "investment_platform",
    description: "Online stock brokerage",
    aliases: withAliases(["philstocks financial"]),
    popularity: 90,
  },
  {
    label: "PDAX",
    category: "investment_platform",
    description: "Crypto and digital assets platform",
    aliases: withAliases(["philippine digital asset exchange"]),
    popularity: 89,
  },
  {
    label: "ATRAM",
    category: "investment_platform",
    description: "Mutual funds and UITFs",
    aliases: withAliases(["atram trust"]),
    popularity: 88,
  },
  {
    label: "Sun Life",
    category: "investment_platform",
    description: "Mutual funds and insurance investments",
    aliases: withAliases(["sun life philippines"]),
    popularity: 87,
  },
  {
    label: "Manulife",
    category: "investment_platform",
    description: "Investment-linked insurance and funds",
    aliases: withAliases(["manulife philippines"]),
    popularity: 86,
  },
  {
    label: "GoTrade",
    category: "investment_platform",
    description: "US stock investing platform",
    aliases: withAliases(["gotrade philippines"]),
    popularity: 84,
  },
  {
    label: "Coins.ph",
    category: "investment_platform",
    description: "Crypto and wallet platform",
    aliases: withAliases(["coins ph", "coins"]),
    popularity: 83,
  },
  {
    label: "Wise",
    category: "investment_platform",
    description: "Multi-currency account and transfers",
    aliases: withAliases(["transferwise"]),
    popularity: 82,
  },
  {
    label: "Tonik",
    category: "investment_platform",
    description: "Digital bank and time deposit platform",
    aliases: withAliases(["tonik bank"]),
    popularity: 81,
  },
  {
    label: "Uno Bank",
    category: "investment_platform",
    description: "Digital bank and time deposits",
    aliases: withAliases(["uno digital bank", "uno bank philippines"]),
    popularity: 80,
  },
  {
    label: "Cebuana Lhuillier",
    category: "investment_platform",
    description: "Savings and investment products",
    aliases: withAliases(["cebuana"]),
    popularity: 79,
  },
  {
    label: "PayPal",
    category: "wallet",
    description: "Payments and balance wallet",
    aliases: withAliases(["paypal wallet"]),
    popularity: 78,
  },
];

const ALL_SUGGESTIONS = [...BANK_SUGGESTIONS, ...PLATFORM_SUGGESTIONS];
const INVESTMENT_BANK_SUGGESTIONS = BANK_SUGGESTIONS.filter((suggestion) => suggestion.supportsInvestments);

const matchesQuery = (suggestion: InstitutionSuggestion, query: string) => {
  if (!query) {
    return true;
  }

  const haystack = normalize([suggestion.label, suggestion.description, ...suggestion.aliases].join(" "));
  return haystack.includes(query);
};

const scoreSuggestion = (suggestion: InstitutionSuggestion, query: string) => {
  if (!query) {
    return suggestion.popularity + (suggestion.supportsInvestments ? 40 : 0);
  }

  const normalizedLabel = normalize(suggestion.label);
  const haystack = normalize([suggestion.label, suggestion.description, ...suggestion.aliases].join(" "));

  if (normalizedLabel === query) {
    return suggestion.popularity + 1000;
  }

  if (normalizedLabel.startsWith(query)) {
    return suggestion.popularity + 800;
  }

  if (haystack.startsWith(query)) {
    return suggestion.popularity + 600;
  }

  if (haystack.includes(` ${query}`) || haystack.includes(query)) {
    return suggestion.popularity + 400 + (suggestion.supportsInvestments ? 60 : 0);
  }

  return suggestion.popularity + (suggestion.supportsInvestments ? 60 : 0);
};

const sortSuggestions = (suggestions: InstitutionSuggestion[], query: string) =>
  [...suggestions]
    .filter((suggestion) => matchesQuery(suggestion, query))
    .sort((left, right) => {
      const scoreDiff = scoreSuggestion(right, query) - scoreSuggestion(left, query);
      if (scoreDiff !== 0) {
        return scoreDiff;
      }

      return left.label.localeCompare(right.label);
    });

const accountEmptyGroups = (): InstitutionSuggestionGroup[] => [
  {
    title: "Popular banks",
    items: BANK_SUGGESTIONS.slice(0, 8),
  },
  {
    title: "Popular platforms",
    items: PLATFORM_SUGGESTIONS.slice(0, 8),
  },
];

const investmentEmptyGroups = (): InstitutionSuggestionGroup[] => [
  {
    title: "Bank investment providers",
    items: INVESTMENT_BANK_SUGGESTIONS.slice(0, 8),
  },
  {
    title: "Popular investment platforms",
    items: PLATFORM_SUGGESTIONS.slice(0, 8),
  },
  {
    title: "Other banks",
    items: BANK_SUGGESTIONS.slice(0, 8),
  },
];

export const getInstitutionSuggestionGroups = (queryValue: string, variant: InstitutionAutocompleteVariant) => {
  const query = normalize(queryValue);
  if (!query) {
    return variant === "investment" ? investmentEmptyGroups() : accountEmptyGroups();
  }

  const suggestions = sortSuggestions(ALL_SUGGESTIONS, query).slice(0, 12);
  if (suggestions.length === 0) {
    return [];
  }

  return [
    {
      title: "Matching institutions",
      items: suggestions,
    },
  ];
};
