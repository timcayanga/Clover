import type { Prisma } from "@prisma/client";
import { guessCategoryName } from "@/lib/import-parser";
import { summarizeMerchantText } from "@/lib/merchant-labels";

type TransactionType = "income" | "expense" | "transfer";

const isMeaningfulCategoryName = (value?: string | null) => {
  const normalized = (value ?? "").trim().toLowerCase();
  return Boolean(normalized && normalized !== "other");
};

const isBroadCategoryName = (value?: string | null) => {
  const normalized = (value ?? "").trim().toLowerCase();
  return normalized === "income" || normalized === "other" || normalized === "transfer" || normalized === "transfers";
};

const getRawPayloadCategoryName = (rawPayload: Prisma.JsonValue | null | undefined) => {
  if (!rawPayload || typeof rawPayload !== "object" || Array.isArray(rawPayload)) {
    return null;
  }

  const payload = rawPayload as Record<string, unknown>;
  const candidate = payload.categoryName ?? payload.category ?? payload.normalizedCategory;
  return typeof candidate === "string" && candidate.trim() ? candidate.trim() : null;
};

const getRawPayloadMerchantText = (rawPayload: Prisma.JsonValue | null | undefined) => {
  if (!rawPayload || typeof rawPayload !== "object" || Array.isArray(rawPayload)) {
    return null;
  }

  const payload = rawPayload as Record<string, unknown>;
  const candidateKeys = [
    "merchantClean",
    "merchantRaw",
    "merchant",
    "description",
    "name",
    "payee",
    "label",
    "title",
    "transactionName",
    "transaction_name",
    "narration",
    "details",
    "memo",
    "rawText",
  ];

  for (const key of candidateKeys) {
    const candidate = payload[key];
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }

  return null;
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

  if (/service\s*charge|servicecharge|bank charge|dhl duty collection/.test(lower)) {
    return "Financial";
  }

  if (/credit-to-cash|cash\s*advance|cashadvance/.test(lower)) {
    return "Financial";
  }

  if (/expressnet|megalinkw?|\/drw\b|atm withdrawal|atmwdl|cash withdrawal/.test(lower)) {
    return "Cash & ATM";
  }

  if (/epsaten|el\/?espay|payroll credit|interest earned|interest applied|cash deposit|check deposit/.test(lower)) {
    return "Income";
  }

  if (/cash\s*in\b|cashin\b/.test(lower)) {
    return "Income";
  }

  if (/mercury\s*drug|pharmacy|drug\s*store|health\s*center|hospital|clinic/.test(lower)) {
    return "Health & Wellness";
  }

  if (/rob\s*supermarket|robinsons?\s*supermarket|supermarket/.test(lower)) {
    return "Food & Dining";
  }

  if (/buy load|load transaction|bills payment/.test(lower)) {
    return "Bills & Utilities";
  }

  return null;
};

const getBdoCategoryOverride = (merchantText: string) => {
  const lower = merchantText.toLowerCase();

  if (/bank\s+transfer|pob\s+ibft|ibft\s+bn|fund\s+transfer|interbank\s+deposit|received\s+a\/c|reciv(?:ed)?\s+a\/c/.test(lower)) {
    return "Transfers";
  }

  if (/atm\s+withdrawal|cash\s+withdrawal|w\/d\s+fr\s+sav|wdrawal|cw\b|\/drw\b/.test(lower)) {
    return "Cash & ATM";
  }

  if (/salary|payroll|interest|cash\s+deposit|funds?\s+deposited/.test(lower)) {
    return "Income";
  }

  return null;
};

export const getEffectiveTransactionMerchantName = (params: {
  merchantClean?: string | null;
  merchantRaw: string;
  rawPayload?: Prisma.JsonValue | null;
  institution?: string | null;
}) => {
  const cleaned = params.merchantClean?.trim();
  if (cleaned) {
    const summarizedClean = summarizeMerchantText(cleaned, params.institution);
    return summarizedClean || cleaned;
  }

  const rawPayloadMerchantText = getRawPayloadMerchantText(params.rawPayload);
  if (rawPayloadMerchantText) {
    const summarizedRawPayloadText = summarizeMerchantText(rawPayloadMerchantText, params.institution);
    return summarizedRawPayloadText || rawPayloadMerchantText;
  }

  const summarized = summarizeMerchantText(params.merchantRaw, params.institution);
  return summarized || params.merchantRaw;
};

export const getEffectiveTransactionCategoryName = (params: {
  categoryName?: string | null;
  rawPayload?: Prisma.JsonValue | null;
  merchantRaw: string;
  merchantClean?: string | null;
  description?: string | null;
  institution?: string | null;
  source?: string | null;
  type: TransactionType;
}) => {
  const directCategory = params.categoryName?.trim() ?? null;
  const rawPayloadCategory = getRawPayloadCategoryName(params.rawPayload);
  const hasImportedRawPayload =
    Boolean(params.rawPayload) && typeof params.rawPayload === "object" && !Array.isArray(params.rawPayload);
  const isImportedRow = params.source === "upload";
  const genericOverride = getGenericCategoryOverride(
    getEffectiveTransactionMerchantName({
      merchantClean: params.merchantClean,
      merchantRaw: params.merchantRaw,
      rawPayload: params.rawPayload,
      institution: params.institution,
    }) || params.merchantRaw
  );

  const effectiveMerchantName = getEffectiveTransactionMerchantName({
    merchantClean: params.merchantClean,
    merchantRaw: params.merchantRaw,
    rawPayload: params.rawPayload,
    institution: params.institution,
  });

  const descriptionText =
    typeof params.description === "string" && params.description.trim() ? params.description.trim() : null;
  const heuristic = guessCategoryName(effectiveMerchantName || descriptionText || params.merchantRaw, params.type);

  if (/\bbdo\b/i.test((params.institution ?? "").trim())) {
    const bdoOverride = getBdoCategoryOverride(effectiveMerchantName || descriptionText || params.merchantRaw);
    if (bdoOverride) {
      if (!isImportedRow || isBroadCategoryName(directCategory) || isBroadCategoryName(rawPayloadCategory)) {
        return bdoOverride;
      }
    }
  }

  if (isMeaningfulCategoryName(directCategory)) {
    if (isImportedRow && isBroadCategoryName(directCategory)) {
      if (isMeaningfulCategoryName(genericOverride) && genericOverride !== directCategory) {
        return genericOverride;
      }

      if (isMeaningfulCategoryName(heuristic) && heuristic !== directCategory) {
        return heuristic;
      }
    }

    return directCategory;
  }

  if (isMeaningfulCategoryName(rawPayloadCategory)) {
    if ((isImportedRow || hasImportedRawPayload) && isBroadCategoryName(rawPayloadCategory)) {
      if (isMeaningfulCategoryName(genericOverride) && genericOverride !== rawPayloadCategory) {
        return genericOverride;
      }

      if (isMeaningfulCategoryName(heuristic) && heuristic !== rawPayloadCategory) {
        return heuristic;
      }
    }

    return rawPayloadCategory;
  }

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

  if (genericOverride) {
    return genericOverride;
  }
  return heuristic || directCategory || rawPayloadCategory || null;
};
