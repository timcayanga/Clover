import type { ContextEntry } from "@/lib/context-corpus";

// Source-backed provider identities, not scraped receipts or model training data.
// Country-qualified aliases establish regional context. Short/global brand names
// can suggest a category separately, without asserting geography or currency.
export type RegionalMerchantEntry = ContextEntry & {
  countryCode: "KR" | "ID";
  categoryAliases: string[];
  sourceUrl: string;
  reviewedAt: string;
};

type Provider = [id: string, aliases: string[], categoryAliases: string[], category: string, purpose: NonNullable<ContextEntry["purposeHint"]>, sourceUrl: string];

const korean: Provider[] = [
  ["ediya", ["이디야커피", "이디야 커피", "ediya coffee korea"], ["ediya coffee"], "Food & Dining", "dining", "https://ediya.com/C/"],
  ["mega-coffee", ["메가MGC커피", "메가엠지씨커피", "메가커피", "mega mgc coffee korea"], ["mega mgc coffee"], "Food & Dining", "dining", "https://www.mega-mgccoffee.com/about/brand/"],
  ["paiks-coffee", ["빽다방", "paiks coffee korea"], ["paiks coffee", "paik s coffee"], "Food & Dining", "dining", "https://www.theborn.co.kr/"],
  ["paris-baguette", ["파리바게뜨", "paris baguette korea"], ["paris baguette"], "Food & Dining", "dining", "https://www.paris.co.kr/"],
  ["hansot", ["한솥도시락", "한솥 도시락", "hansot korea"], ["hansot dosirak"], "Food & Dining", "dining", "https://www.hsd.co.kr/"],
  ["yogiyo", ["요기요", "yogiyo korea"], ["yogiyo"], "Food & Dining", "food_delivery", "https://www.yogiyo.co.kr/mobile/"],
  ["coupang-eats", ["쿠팡이츠", "쿠팡 이츠", "coupang eats korea"], ["coupang eats"], "Food & Dining", "food_delivery", "https://www.coupangeats.com/"],
  ["homeplus", ["홈플러스", "homeplus korea"], [], "Groceries", "groceries", "https://corporate.homeplus.co.kr/index.aspx"],
  ["gs-fresh", ["GS더프레시", "GS 더프레시", "gs the fresh korea"], ["gs the fresh"], "Groceries", "groceries", "https://gs25.gsretail.com/gscvs/ko/membership-services/gs-retail"],
  ["gs25", ["gs25 korea", "지에스25"], ["gs25"], "Groceries", "groceries", "https://gs25.gsretail.com/gscvs/ko/main"],
  ["cu", ["cu korea", "씨유 편의점"], ["cu 편의점"], "Groceries", "groceries", "https://www.bgfretail.com/company/introduction/greeting/"],
  ["musinsa", ["무신사", "musinsa korea"], ["musinsa"], "Shopping", "retail", "https://locations.musinsa.com/"],
  ["kyobo", ["교보문고", "kyobo bookstore korea"], ["kyobo book", "kyobo bookstore"], "Shopping", "retail", "https://store.kyobobook.co.kr/store-info"],
  ["daiso", ["아성다이소", "다이소", "daiso korea"], [], "Shopping", "retail", "https://www.daiso.co.kr/"],
  ["hyundai-department", ["현대백화점", "더현대 서울", "hyundai department store korea"], ["hyundai department store"], "Shopping", "retail", "https://www.ehyundai.com/newPortal/index.do"],
  ["yonsei-tuition", ["연세대학교 등록금", "yonsei university fees"], [], "Education", "education", "https://ycms.yonsei.ac.kr/template16/admission/tuition.do"],
  ["korea-university-tuition", ["고려대학교 등록금", "korea university tuition"], [], "Education", "education", "https://registrar.korea.ac.kr/eduinfo/enrollment/payment.do"],
  ["emart", ["이마트", "emart korea"], [], "Groceries", "groceries", "https://emartapp.emart.com/main/main.do"],
  ["busan-metro", ["부산교통공사", "부산도시철도", "busan metro"], [], "Transport", "transport", "https://data.humetro.busan.kr/default/main.do"],
];

const indonesian: Provider[] = [
  ["kopi-kenangan", ["kopi kenangan indonesia"], ["kopi kenangan"], "Food & Dining", "dining", "https://kopikenangan.com/home-2"],
  ["janji-jiwa", ["janji jiwa indonesia"], ["janji jiwa", "kopi janji jiwa"], "Food & Dining", "dining", "https://jiwagroup.com/en/brand/"],
  ["jiwa-toast", ["jiwa toast indonesia"], ["jiwa toast"], "Food & Dining", "dining", "https://jiwagroup.com/en/brand/detail/2/JiwaToast"],
  ["fore-coffee", ["fore coffee indonesia"], ["fore coffee"], "Food & Dining", "dining", "https://fore.coffee/id/beranda-3/"],
  ["richeese-factory", ["richeese factory indonesia"], ["richeese factory"], "Food & Dining", "dining", "https://richeesefactory.com/discover/"],
  ["hokben", ["hokben indonesia"], ["hokben"], "Food & Dining", "dining", "https://www.hokben.co.id/news-events/detail/63"],
  ["sayurbox", ["sayurbox indonesia"], ["sayurbox"], "Groceries", "groceries", "https://www.sayurbox.com/blog/kemudahan-belanja-dengan-sayurbox"],
  ["ranch-market", ["ranch market indonesia"], [], "Groceries", "groceries", "https://ranchmarket.co.id/"],
  ["alfamidi", ["alfamidi indonesia"], ["alfamidi"], "Groceries", "groceries", "https://alfamidiku.com/medias/uploads/AR2024.pdf"],
  ["biznet", ["biznet home indonesia"], ["biznet home"], "Bills & Utilities", "telecom", "https://biznethome.net/"],
  ["myrepublic", ["myrepublic indonesia"], [], "Bills & Utilities", "telecom", "https://www.myrepublic.co.id/about"],
  ["cbn", ["cbn internet indonesia"], ["cbn fiber", "cbn premier"], "Bills & Utilities", "telecom", "https://www.cbn.id/id/cbn-enterprise/Digital-Connectivity/CBN-Premier"],
  ["apotek-k24", ["apotek k24 indonesia", "apotek k 24 indonesia"], ["apotek k24", "apotek k 24"], "Health & Wellness", "healthcare", "https://recruitment.apotek-k24.com/"],
  ["tix-id", ["tix id indonesia"], ["tix id"], "Entertainment", "entertainment", "https://asset.tix.id/static/tix-tnc-2025-v1.html"],
  ["cinema-xxi", ["cinema xxi indonesia", "cinema 21 indonesia"], ["cinema xxi"], "Entertainment", "entertainment", "https://asset.tix.id/static/tix-tnc-2025-v1.html"],
  ["cgv", ["cgv indonesia"], [], "Entertainment", "entertainment", "https://asset.tix.id/static/tix-tnc-2025-v1.html"],
  ["cinepolis", ["cinepolis indonesia", "cinépolis indonesia"], [], "Entertainment", "entertainment", "https://asset.tix.id/static/tix-tnc-2025-v1.html"],
  ["whoosh", ["whoosh indonesia", "kcic whoosh"], [], "Transport", "transport", "https://ticket.kcic.co.id/product/"],
];

const counterpartyFor = (purpose: ContextEntry["purposeHint"]): ContextEntry["counterpartyType"] => {
  if (purpose === "groceries") return "grocer";
  if (purpose === "telecom") return "telecom_provider";
  if (purpose === "healthcare") return "healthcare_provider";
  if (purpose === "education") return "education_provider";
  if (purpose === "transport") return "transport_provider";
  return "merchant";
};

export const KOREA_INDONESIA_CORPUS: RegionalMerchantEntry[] = ([
  ["KR", korean], ["ID", indonesian],
] as const).flatMap(([countryCode, providers]) => providers.map(([id, aliases, categoryAliases, categoryHint, purposeHint, sourceUrl]) => ({
  id: `${countryCode.toLowerCase()}-reviewed-${id}`, aliases, categoryAliases, categoryHint, purposeHint, sourceUrl,
  countryCode, regionCode: countryCode === "KR" ? "EAS" : "SEA",
  counterpartyType: counterpartyFor(purposeHint), signalKind: "merchant" as const,
  confidence: 82, source: "curated" as const, reviewStatus: "active" as const, reviewedAt: "2026-10-01",
  // Deliberately no currency or direction. Provider identity is not settlement evidence.
})));

export const normalizeRegionalDescriptor = (value: string) => value.normalize("NFKC").toLowerCase()
  .replace(/[^\p{L}\p{N}]+/gu, " ").trim().replace(/\s+/g, " ");

const aliasPattern = (alias: string, koreanBranch: boolean) => {
  const name = normalizeRegionalDescriptor(alias);
  // Accept attached Hangul branch names ending in 점, not arbitrary substrings.
  const suffix = koreanBranch && /[가-힣]/u.test(name) ? "(?:[가-힣0-9]{0,12}점)?" : "";
  return new RegExp(`(?:^| )(${name}${suffix})(?= |$)`, "u");
};

const contextPatterns = new Map(KOREA_INDONESIA_CORPUS.flatMap(entry => entry.aliases.map(alias => [
  `${entry.id}\u0000${normalizeRegionalDescriptor(alias)}`, aliasPattern(alias, entry.countryCode === "KR"),
] as const)));

export const matchesRegionalContextAlias = (entryId: string, alias: string, normalizedText: string) =>
  contextPatterns.get(`${entryId}\u0000${normalizeRegionalDescriptor(alias)}`)?.test(normalizedText) ?? false;

const categoryPatterns = KOREA_INDONESIA_CORPUS.flatMap(entry => [...entry.aliases, ...entry.categoryAliases].map(alias => ({
  entry, pattern: aliasPattern(alias, entry.countryCode === "KR"),
})));

export const getRegionalMerchantCategoryHint = (value: string, country?: "KR" | "ID"): string | null => {
  const text = normalizeRegionalDescriptor(value);
  const matches = categoryPatterns.flatMap(({ entry, pattern }) => {
    if (country && entry.countryCode !== country) return [];
    const match = pattern.exec(text);
    return match ? [{ category: entry.categoryHint!, start: match.index, end: match.index + match[0].length }] : [];
  });
  // A longer service name wins over a contained parent brand. Distinct conflicting
  // merchants remain uncertain instead of relying on array order.
  const specific = matches.filter(a => !matches.some(b => b.start <= a.start && b.end >= a.end && b.end - b.start > a.end - a.start));
  const categories = new Set(specific.map(match => match.category));
  return categories.size > 1 ? "Other" : specific[0]?.category ?? null;
};
