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
  income: { backgroundColor: "rgba(34, 197, 94, 0.16)", borderColor: "rgba(34, 197, 94, 0.34)" },
  salary: { backgroundColor: "rgba(22, 163, 74, 0.16)", borderColor: "rgba(22, 163, 74, 0.34)" },
  "food & dining": { backgroundColor: "rgba(251, 146, 60, 0.16)", borderColor: "rgba(251, 146, 60, 0.34)" },
  groceries: { backgroundColor: "rgba(249, 115, 22, 0.16)", borderColor: "rgba(249, 115, 22, 0.34)" },
  transport: { backgroundColor: "rgba(59, 130, 246, 0.16)", borderColor: "rgba(59, 130, 246, 0.34)" },
  housing: { backgroundColor: "rgba(168, 85, 247, 0.16)", borderColor: "rgba(168, 85, 247, 0.34)" },
  "bills & utilities": { backgroundColor: "rgba(14, 165, 233, 0.16)", borderColor: "rgba(14, 165, 233, 0.34)" },
  utilities: { backgroundColor: "rgba(6, 182, 212, 0.16)", borderColor: "rgba(6, 182, 212, 0.34)" },
  "travel & lifestyle": { backgroundColor: "rgba(236, 72, 153, 0.16)", borderColor: "rgba(236, 72, 153, 0.34)" },
  entertainment: { backgroundColor: "rgba(245, 158, 11, 0.16)", borderColor: "rgba(245, 158, 11, 0.34)" },
  shopping: { backgroundColor: "rgba(244, 63, 94, 0.16)", borderColor: "rgba(244, 63, 94, 0.34)" },
  "health & wellness": { backgroundColor: "rgba(20, 184, 166, 0.16)", borderColor: "rgba(20, 184, 166, 0.34)" },
  medical: { backgroundColor: "rgba(13, 148, 136, 0.16)", borderColor: "rgba(13, 148, 136, 0.34)" },
  education: { backgroundColor: "rgba(234, 179, 8, 0.16)", borderColor: "rgba(234, 179, 8, 0.34)" },
  financial: { backgroundColor: "rgba(37, 99, 235, 0.16)", borderColor: "rgba(37, 99, 235, 0.34)" },
  "gifts & donations": { backgroundColor: "rgba(190, 24, 93, 0.16)", borderColor: "rgba(190, 24, 93, 0.34)" },
  business: { backgroundColor: "rgba(100, 116, 139, 0.16)", borderColor: "rgba(100, 116, 139, 0.34)" },
  transfers: { backgroundColor: "rgba(6, 182, 212, 0.16)", borderColor: "rgba(6, 182, 212, 0.34)" },
  other: { backgroundColor: "rgba(148, 163, 184, 0.16)", borderColor: "rgba(148, 163, 184, 0.34)" },
  investments: { backgroundColor: "rgba(124, 58, 237, 0.16)", borderColor: "rgba(124, 58, 237, 0.34)" },
  investment: { backgroundColor: "rgba(124, 58, 237, 0.16)", borderColor: "rgba(124, 58, 237, 0.34)" },
  default: { backgroundColor: "rgba(3, 168, 192, 0.14)", borderColor: "rgba(3, 168, 192, 0.3)" },
};

const FALLBACK_TONES: CategoryTone[] = [
  { backgroundColor: "rgba(59, 130, 246, 0.16)", borderColor: "rgba(59, 130, 246, 0.34)" },
  { backgroundColor: "rgba(16, 185, 129, 0.16)", borderColor: "rgba(16, 185, 129, 0.34)" },
  { backgroundColor: "rgba(245, 158, 11, 0.16)", borderColor: "rgba(245, 158, 11, 0.34)" },
  { backgroundColor: "rgba(236, 72, 153, 0.16)", borderColor: "rgba(236, 72, 153, 0.34)" },
  { backgroundColor: "rgba(168, 85, 247, 0.16)", borderColor: "rgba(168, 85, 247, 0.34)" },
  { backgroundColor: "rgba(6, 182, 212, 0.16)", borderColor: "rgba(6, 182, 212, 0.34)" },
  { backgroundColor: "rgba(244, 63, 94, 0.16)", borderColor: "rgba(244, 63, 94, 0.34)" },
  { backgroundColor: "rgba(34, 197, 94, 0.16)", borderColor: "rgba(34, 197, 94, 0.34)" },
  { backgroundColor: "rgba(234, 179, 8, 0.16)", borderColor: "rgba(234, 179, 8, 0.34)" },
  { backgroundColor: "rgba(14, 165, 233, 0.16)", borderColor: "rgba(14, 165, 233, 0.34)" },
  { backgroundColor: "rgba(100, 116, 139, 0.16)", borderColor: "rgba(100, 116, 139, 0.34)" },
  { backgroundColor: "rgba(124, 58, 237, 0.16)", borderColor: "rgba(124, 58, 237, 0.34)" },
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
