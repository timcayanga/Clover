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
  "bills & utilities": { backgroundColor: "rgba(250, 204, 21, 0.36)", borderColor: "rgba(202, 138, 4, 0.78)" },
  utilities: { backgroundColor: "rgba(250, 204, 21, 0.36)", borderColor: "rgba(202, 138, 4, 0.78)" },
  business: { backgroundColor: "rgba(15, 23, 42, 0.84)", borderColor: "rgba(15, 23, 42, 0.96)" },
  "cash & atm": { backgroundColor: "rgba(110, 231, 183, 0.44)", borderColor: "rgba(5, 150, 105, 0.78)" },
  education: { backgroundColor: "rgba(37, 99, 235, 0.36)", borderColor: "rgba(29, 78, 216, 0.78)" },
  entertainment: { backgroundColor: "rgba(124, 58, 237, 0.36)", borderColor: "rgba(109, 40, 217, 0.78)" },
  financial: { backgroundColor: "rgba(203, 213, 225, 0.56)", borderColor: "rgba(100, 116, 139, 0.78)" },
  "food & dining": { backgroundColor: "rgba(249, 115, 22, 0.38)", borderColor: "rgba(194, 65, 12, 0.78)" },
  groceries: { backgroundColor: "rgba(249, 115, 22, 0.38)", borderColor: "rgba(194, 65, 12, 0.78)" },
  "gifts & donations": { backgroundColor: "rgba(236, 72, 153, 0.36)", borderColor: "rgba(190, 24, 93, 0.78)" },
  "health & wellness": { backgroundColor: "rgba(239, 68, 68, 0.36)", borderColor: "rgba(185, 28, 28, 0.78)" },
  medical: { backgroundColor: "rgba(239, 68, 68, 0.36)", borderColor: "rgba(185, 28, 28, 0.78)" },
  housing: { backgroundColor: "rgba(146, 64, 14, 0.38)", borderColor: "rgba(120, 53, 15, 0.78)" },
  income: { backgroundColor: "rgba(34, 197, 94, 0.38)", borderColor: "rgba(21, 128, 61, 0.78)" },
  salary: { backgroundColor: "rgba(34, 197, 94, 0.38)", borderColor: "rgba(21, 128, 61, 0.78)" },
  other: { backgroundColor: "rgba(255, 255, 255, 0.96)", borderColor: "rgba(148, 163, 184, 0.9)" },
  shopping: { backgroundColor: "rgba(136, 19, 55, 0.42)", borderColor: "rgba(136, 19, 55, 0.88)" },
  transfers: { backgroundColor: "rgba(20, 184, 166, 0.38)", borderColor: "rgba(15, 118, 110, 0.78)" },
  transport: { backgroundColor: "rgba(125, 211, 252, 0.44)", borderColor: "rgba(2, 132, 199, 0.78)" },
  "travel & lifestyle": { backgroundColor: "rgba(245, 222, 179, 0.62)", borderColor: "rgba(180, 83, 9, 0.72)" },
  investments: { backgroundColor: "rgba(124, 58, 237, 0.36)", borderColor: "rgba(109, 40, 217, 0.78)" },
  investment: { backgroundColor: "rgba(124, 58, 237, 0.36)", borderColor: "rgba(109, 40, 217, 0.78)" },
  default: { backgroundColor: "rgba(3, 168, 192, 0.28)", borderColor: "rgba(3, 168, 192, 0.68)" },
};

const FALLBACK_TONES: CategoryTone[] = [
  { backgroundColor: "rgba(37, 99, 235, 0.36)", borderColor: "rgba(29, 78, 216, 0.78)" },
  { backgroundColor: "rgba(34, 197, 94, 0.38)", borderColor: "rgba(21, 128, 61, 0.78)" },
  { backgroundColor: "rgba(249, 115, 22, 0.38)", borderColor: "rgba(194, 65, 12, 0.78)" },
  { backgroundColor: "rgba(236, 72, 153, 0.36)", borderColor: "rgba(190, 24, 93, 0.78)" },
  { backgroundColor: "rgba(124, 58, 237, 0.36)", borderColor: "rgba(109, 40, 217, 0.78)" },
  { backgroundColor: "rgba(20, 184, 166, 0.38)", borderColor: "rgba(15, 118, 110, 0.78)" },
  { backgroundColor: "rgba(239, 68, 68, 0.36)", borderColor: "rgba(185, 28, 28, 0.78)" },
  { backgroundColor: "rgba(250, 204, 21, 0.36)", borderColor: "rgba(202, 138, 4, 0.78)" },
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
