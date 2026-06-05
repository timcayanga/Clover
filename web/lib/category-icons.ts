type CategoryTone = {
  backgroundColor: string;
  borderColor: string;
};

const normalizeCategoryName = (value?: string | null) => value?.trim().toLowerCase() ?? "";

const CATEGORY_ICON_SRC: Record<string, string> = {
  income: "/category-icons/income.svg",
  "food & dining": "/category-icons/food.svg",
  transport: "/category-icons/transport.svg",
  housing: "/category-icons/housing.svg",
  "bills & utilities": "/category-icons/utilities.svg",
  utilities: "/category-icons/utilities.svg",
  "travel & lifestyle": "/category-icons/travel.svg",
  entertainment: "/category-icons/entertainment.svg",
  shopping: "/category-icons/shopping.svg",
  subscriptions: "/category-icons/calendar.svg",
  "health & wellness": "/category-icons/health.svg",
  education: "/category-icons/education.svg",
  financial: "/category-icons/financial.png",
  "cash & atm": "/category-icons/cash-and-atm.png",
  "gifts & donations": "/category-icons/gift.svg",
  business: "/category-icons/business.png",
  transfers: "/category-icons/transfer.svg",
  other: "/category-icons/other.svg",
  groceries: "/category-icons/groceries.svg",
  medical: "/category-icons/medical.svg",
  salary: "/category-icons/salary.svg",
  investments: "/category-icons/investments.svg",
  investment: "/category-icons/investments.svg",
};

const CATEGORY_TONES: Record<string, CategoryTone> = {
  transport: { backgroundColor: "rgba(186, 230, 253, 0.88)", borderColor: "rgba(56, 189, 248, 0.92)" }, // light blue
  education: { backgroundColor: "rgba(96, 165, 250, 0.88)", borderColor: "rgba(37, 99, 235, 0.92)" }, // blue
  business: { backgroundColor: "rgba(37, 99, 235, 0.88)", borderColor: "rgba(30, 64, 175, 0.94)" }, // dark blue
  "cash & atm": { backgroundColor: "rgba(187, 247, 208, 0.9)", borderColor: "rgba(74, 222, 128, 0.9)" }, // light green
  income: { backgroundColor: "rgba(74, 222, 128, 0.9)", borderColor: "rgba(22, 163, 74, 0.94)" }, // green
  salary: { backgroundColor: "rgba(74, 222, 128, 0.9)", borderColor: "rgba(22, 163, 74, 0.94)" },
  investments: { backgroundColor: "rgba(34, 197, 94, 0.92)", borderColor: "rgba(21, 128, 61, 0.94)" }, // dark green
  investment: { backgroundColor: "rgba(34, 197, 94, 0.92)", borderColor: "rgba(21, 128, 61, 0.94)" },
  transfers: { backgroundColor: "rgba(94, 234, 212, 0.88)", borderColor: "rgba(13, 148, 136, 0.92)" }, // teal
  "health & wellness": { backgroundColor: "rgba(248, 113, 113, 0.9)", borderColor: "rgba(220, 38, 38, 0.94)" }, // red
  medical: { backgroundColor: "rgba(248, 113, 113, 0.9)", borderColor: "rgba(220, 38, 38, 0.94)" },
  housing: { backgroundColor: "rgba(153, 27, 27, 0.9)", borderColor: "rgba(127, 29, 29, 0.96)" }, // dark red
  "gifts & donations": { backgroundColor: "rgba(249, 168, 212, 0.88)", borderColor: "rgba(219, 39, 119, 0.92)" }, // pink
  "food & dining": { backgroundColor: "rgba(253, 186, 116, 0.9)", borderColor: "rgba(251, 146, 60, 0.92)" }, // light orange
  groceries: { backgroundColor: "rgba(253, 186, 116, 0.9)", borderColor: "rgba(251, 146, 60, 0.92)" },
  shopping: { backgroundColor: "rgba(251, 146, 60, 0.9)", borderColor: "rgba(234, 88, 12, 0.94)" }, // orange
  "travel & lifestyle": { backgroundColor: "rgba(254, 240, 138, 0.92)", borderColor: "rgba(250, 204, 21, 0.9)" }, // light yellow
  "bills & utilities": { backgroundColor: "rgba(250, 204, 21, 0.92)", borderColor: "rgba(202, 138, 4, 0.94)" }, // yellow
  utilities: { backgroundColor: "rgba(250, 204, 21, 0.92)", borderColor: "rgba(202, 138, 4, 0.94)" },
  subscriptions: { backgroundColor: "rgba(221, 214, 254, 0.92)", borderColor: "rgba(167, 139, 250, 0.92)" }, // light purple
  entertainment: { backgroundColor: "rgba(167, 139, 250, 0.92)", borderColor: "rgba(126, 34, 206, 0.92)" }, // purple
  financial: { backgroundColor: "rgba(107, 33, 168, 0.92)", borderColor: "rgba(88, 28, 135, 0.96)" }, // dark purple
  other: { backgroundColor: "rgba(180, 83, 9, 0.88)", borderColor: "rgba(120, 53, 15, 0.94)" }, // brown
  default: { backgroundColor: "rgba(96, 165, 250, 0.88)", borderColor: "rgba(37, 99, 235, 0.92)" },
};

const FALLBACK_TONES: CategoryTone[] = [
  { backgroundColor: "rgba(186, 230, 253, 0.88)", borderColor: "rgba(56, 189, 248, 0.92)" },
  { backgroundColor: "rgba(96, 165, 250, 0.88)", borderColor: "rgba(37, 99, 235, 0.92)" },
  { backgroundColor: "rgba(37, 99, 235, 0.88)", borderColor: "rgba(30, 64, 175, 0.94)" },
  { backgroundColor: "rgba(187, 247, 208, 0.9)", borderColor: "rgba(74, 222, 128, 0.9)" },
  { backgroundColor: "rgba(74, 222, 128, 0.9)", borderColor: "rgba(22, 163, 74, 0.94)" },
  { backgroundColor: "rgba(34, 197, 94, 0.92)", borderColor: "rgba(21, 128, 61, 0.94)" },
  { backgroundColor: "rgba(94, 234, 212, 0.88)", borderColor: "rgba(13, 148, 136, 0.92)" },
  { backgroundColor: "rgba(248, 113, 113, 0.9)", borderColor: "rgba(220, 38, 38, 0.94)" },
  { backgroundColor: "rgba(153, 27, 27, 0.9)", borderColor: "rgba(127, 29, 29, 0.96)" },
  { backgroundColor: "rgba(249, 168, 212, 0.88)", borderColor: "rgba(219, 39, 119, 0.92)" },
  { backgroundColor: "rgba(253, 186, 116, 0.9)", borderColor: "rgba(251, 146, 60, 0.92)" },
  { backgroundColor: "rgba(251, 146, 60, 0.9)", borderColor: "rgba(234, 88, 12, 0.94)" },
  { backgroundColor: "rgba(254, 240, 138, 0.92)", borderColor: "rgba(250, 204, 21, 0.9)" },
  { backgroundColor: "rgba(250, 204, 21, 0.92)", borderColor: "rgba(202, 138, 4, 0.94)" },
  { backgroundColor: "rgba(221, 214, 254, 0.92)", borderColor: "rgba(167, 139, 250, 0.92)" },
  { backgroundColor: "rgba(167, 139, 250, 0.92)", borderColor: "rgba(126, 34, 206, 0.92)" },
  { backgroundColor: "rgba(107, 33, 168, 0.92)", borderColor: "rgba(88, 28, 135, 0.96)" },
  { backgroundColor: "rgba(180, 83, 9, 0.88)", borderColor: "rgba(120, 53, 15, 0.94)" },
];

const hashCategoryName = (value: string) => {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash;
};

export const getCategoryIconSrc = (categoryName?: string | null) => {
  const normalized = normalizeCategoryName(categoryName);
  return CATEGORY_ICON_SRC[normalized] ?? "/category-icons/default.svg";
};

export const getCategoryIconTone = (categoryName?: string | null): CategoryTone => {
  const normalized = normalizeCategoryName(categoryName);
  const matchedTone = CATEGORY_TONES[normalized];
  if (matchedTone) {
    return matchedTone;
  }

  const fallbackTone = FALLBACK_TONES[hashCategoryName(normalized) % FALLBACK_TONES.length];
  return fallbackTone ?? CATEGORY_TONES.default;
};
