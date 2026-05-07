import type { Prisma } from "@prisma/client";
import { guessCategoryName } from "@/lib/import-parser";
import { summarizeMerchantText } from "@/lib/merchant-labels";

type TransactionType = "income" | "expense" | "transfer";

const isMeaningfulCategoryName = (value?: string | null) => {
  const normalized = (value ?? "").trim().toLowerCase();
  return Boolean(normalized && normalized !== "other");
};

const getRawPayloadCategoryName = (rawPayload: Prisma.JsonValue | null | undefined) => {
  if (!rawPayload || typeof rawPayload !== "object" || Array.isArray(rawPayload)) {
    return null;
  }

  const payload = rawPayload as Record<string, unknown>;
  const candidate = payload.categoryName ?? payload.category ?? payload.normalizedCategory;
  return typeof candidate === "string" && candidate.trim() ? candidate.trim() : null;
};

const getAubCategoryOverride = (merchantText: string) => {
  const lower = merchantText.toLowerCase();

  if (
    /internal clearing|encashment|check issued|atm withdrawal|atm fee inquiry|finance charge|tax withheld|service fee|debit movement|\bicc\b|\bilnsdm1?\b|\bdm1\b|\benc\b|\bck1\b/.test(
      lower
    )
  ) {
    return "Financial";
  }

  if (/cash deposit|check deposit|interest earned|credit movement|\bnftc\b|\bwftc\b|\bcd\b|\bpdck3\b|\bint\b/.test(lower)) {
    return "Income";
  }

  if (/instapay credit|instapay debit|fund transfer/.test(lower)) {
    return "Transfers";
  }

  return null;
};

const getGcashCategoryOverride = (merchantText: string) => {
  const lower = merchantText.toLowerCase();

  if (
    /auto cash-?in|gcashcashin|gcash cash in|wallet transfer|gcash transfer|cash in|cash out|send money|received money|received gcash|sent gcash|fund transfer|(?:edi\/)?mbpay/.test(
      lower
    )
  ) {
    return "Transfers";
  }

  if (/buy load|load transaction/.test(lower)) {
    return "Bills & Utilities";
  }

  if (/boost campaign|cashback|reward/.test(lower)) {
    return "Income";
  }

  if (/interest applied|interest boost reward|transfer fee|service fee|finance charge/.test(lower)) {
    return "Financial";
  }

  if (/payment to|bills payment/.test(lower)) {
    return "Shopping";
  }

  return null;
};

const getGenericCategoryOverride = (merchantText: string) => {
  const lower = merchantText.toLowerCase();

  if (
    /fund transfer|bank transfer|instapay transfer|transfer to other bank|transfer from other bank|gcash cash in|gcashcashin|wallet transfer|cash in|cash out|send money|received money/.test(
      lower
    )
  ) {
    return "Transfers";
  }

  if (/epsaten|el\/?espay|payroll credit|interest earned|interest applied|cash deposit|check deposit/.test(lower)) {
    return "Income";
  }

  if (/atm withdrawal|atmwdl|cash withdrawal/.test(lower)) {
    return "Cash & ATM";
  }

  if (/buy load|load transaction|bills payment/.test(lower)) {
    return "Bills & Utilities";
  }

  return null;
};

export const getEffectiveTransactionMerchantName = (params: {
  merchantClean?: string | null;
  merchantRaw: string;
  institution?: string | null;
}) => {
  const cleaned = params.merchantClean?.trim();
  if (cleaned) {
    const summarizedClean = summarizeMerchantText(cleaned, params.institution);
    return summarizedClean || cleaned;
  }

  const summarized = summarizeMerchantText(params.merchantRaw, params.institution);
  return summarized || params.merchantRaw;
};

export const getEffectiveTransactionCategoryName = (params: {
  categoryName?: string | null;
  rawPayload?: Prisma.JsonValue | null;
  merchantRaw: string;
  merchantClean?: string | null;
  institution?: string | null;
  type: TransactionType;
}) => {
  const directCategory = params.categoryName?.trim() ?? null;
  if (isMeaningfulCategoryName(directCategory)) {
    return directCategory;
  }

  const rawPayloadCategory = getRawPayloadCategoryName(params.rawPayload);
  if (isMeaningfulCategoryName(rawPayloadCategory)) {
    return rawPayloadCategory;
  }

  const effectiveMerchantName = getEffectiveTransactionMerchantName({
    merchantClean: params.merchantClean,
    merchantRaw: params.merchantRaw,
    institution: params.institution,
  });

  if (/\b(?:aub|asia united bank)\b/i.test((params.institution ?? "").trim())) {
    const aubOverride = getAubCategoryOverride(effectiveMerchantName);
    if (aubOverride) {
      return aubOverride;
    }
  }

  if (/\bgcash\b/i.test((params.institution ?? "").trim())) {
    const gcashOverride = getGcashCategoryOverride(effectiveMerchantName || params.merchantRaw);
    if (gcashOverride) {
      return gcashOverride;
    }
  }

  const genericOverride = getGenericCategoryOverride(effectiveMerchantName || params.merchantRaw);
  if (genericOverride) {
    return genericOverride;
  }
  const heuristic = guessCategoryName(effectiveMerchantName || params.merchantRaw, params.type);
  return heuristic || directCategory || rawPayloadCategory || null;
};
