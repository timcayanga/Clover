import type { Prisma } from "@prisma/client";
import { guessCategoryFallback } from "@/lib/data-engine";
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

  if (/internal clearing|encashment|check issued|atm withdrawal|atm fee inquiry|finance charge|tax withheld|service fee|debit movement/.test(lower)) {
    return "Financial";
  }

  if (/cash deposit|check deposit|interest earned|credit movement/.test(lower)) {
    return "Income";
  }

  if (/instapay credit|instapay debit|fund transfer/.test(lower)) {
    return "Transfers";
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
    return cleaned;
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

  if ((params.institution ?? "").trim().toLowerCase() === "aub") {
    const aubOverride = getAubCategoryOverride(effectiveMerchantName);
    if (aubOverride) {
      return aubOverride;
    }
  }

  const heuristic = guessCategoryFallback(effectiveMerchantName || params.merchantRaw, params.type);
  return heuristic || directCategory || rawPayloadCategory || null;
};
