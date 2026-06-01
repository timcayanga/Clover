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
  return (
    normalized === "income" ||
    normalized === "other" ||
    normalized === "transfer" ||
    normalized === "transfers" ||
    normalized === "financial" ||
    normalized === "cash & atm"
  );
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

  if (/atm withdrawal/.test(lower)) {
    return "Cash & ATM";
  }

  if (/atm fee inquiry/.test(lower)) {
    return "Financial";
  }

  if (
    /cash deposit|check deposit|credit movement|debit movement|internal clearing|internal clearing on-us|on-us transaction|encashment|check issued|instapay credit|instapay debit|fund transfer|\bicc\b|\bilnsdm1?\b|\bdm1\b|\benc\b|\bck1\b|\bpdck3\b|\bdrt\b|\bcd\b|\bonus\b|\bnftc\b|\bwftc\b/.test(
      lower
    )
  ) {
    return "Transfers";
  }

  if (/interest earned|\bint\b/.test(lower)) {
    return "Income";
  }

  if (/finance charge|tax withheld|service fee/.test(lower)) {
    return "Financial";
  }

  return null;
};

const getGcashCategoryOverride = (merchantText: string) => {
  const lower = merchantText.toLowerCase();

  if (/deposit to gsave|withdraw from gsave|seamoney credit|maribank credit/.test(lower)) {
    return "Financial";
  }

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
    /fund transfer|bank transfer|instapay transfer|transfer to other bank|transfer from other bank|wallet transfer|cash out|send money|received money/.test(
      lower
    )
  ) {
    return "Transfers";
  }

  if (/payment\s*-\s*thank\s*you|payment\s+thank\s+you|paymentthankyou|card\s+payment|credit\s+card\s+payment/.test(lower)) {
    return "Transfers";
  }

  if (/shopee|puregold|price\s+club/.test(lower)) {
    return "Shopping";
  }

  if (/service\s*charge|servicecharge|finance\s*charge|financecharge|bank charge|dhl duty collection/.test(lower)) {
    return "Financial";
  }

  if (/credit-to-cash|cash\s*advance|cashadvance/.test(lower)) {
    return "Financial";
  }

  if (/expressnet|megalinkw?|\/drw\b|atm withdrawal|atmwdl|cash withdrawal/.test(lower)) {
    return "Cash & ATM";
  }

  if (/payroll credit|interest earned|interest applied|cash deposit|check deposit/.test(lower)) {
    return "Income";
  }

  if (/gcash\s+cash\s+in|gcashcashin/.test(lower)) {
    return "Transfers";
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

const getInstitutionSpecificCategoryOverride = (institution: string | null | undefined, merchantText: string) => {
  const normalizedInstitution = (institution ?? "").trim();

  if (/\beast\s*west\b/i.test(normalizedInstitution) || /eastwest/i.test(normalizedInstitution)) {
    if (/\bcash\s+deposit\b/i.test(merchantText)) {
      return "Cash & ATM";
    }
  }

  if (/\b(?:aub|asia united bank)\b/i.test(normalizedInstitution)) {
    return getAubCategoryOverride(merchantText);
  }

  if (/\bgcash\b/i.test(normalizedInstitution)) {
    return getGcashCategoryOverride(merchantText);
  }

  if (/\bbdo\b/i.test(normalizedInstitution)) {
    return getBdoCategoryOverride(merchantText);
  }

  return null;
};

const getBdoCategoryOverride = (merchantText: string) => {
  const lower = merchantText.toLowerCase();

  if (/incoming\s+transfer|interbank\s+deposit|funds?\s+deposited|received\s+a\/c|reciv(?:ed)?\s+a\/c|cash\s+deposit|salary|payroll|interest|intrest|credit\s+movement/.test(lower)) {
    return "Income";
  }

  if (/bank\s+transfer|pob\s+ibft|ibft\s+bn|fund\s+transfer|transfer\s+to|payment\s+to|debit\s+movement/.test(lower)) {
    return "Other";
  }

  if (/internal\s+clearing|internal\s+clearing\s+on-us|on-us\s+transaction|encashment|check\s+issued|check\s+deposit|dm1|icc|ilnsdm1|pdck3|cm1|drt|cd|ck1/.test(lower)) {
    return "Transfers";
  }

  if (/atm\s+withdrawal|cash\s+withdrawal|w\/d\s+fr\s+sav|wdrawal|cw\b|\/drw\b/.test(lower)) {
    return "Cash & ATM";
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

export const getLandbankTransactionDisplayOverride = (params: {
  institution?: string | null;
  merchantRaw: string;
  merchantClean?: string | null;
  description?: string | null;
  rawPayload?: Prisma.JsonValue | null;
}) => {
  if (!/\blandbank\b/i.test(String(params.institution ?? ""))) {
    return null;
  }

  const merchantText = [
    params.merchantClean?.trim() || "",
    params.merchantRaw?.trim() || "",
    params.description?.trim() || "",
    getRawPayloadMerchantText(params.rawPayload) ?? "",
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (/cash\s+out\s*-\s*order|atm\s+withdrawal|\bcash\s+out\b|\bwithdrawal\b/.test(merchantText)) {
    return { categoryName: "Cash & ATM", type: "expense" as const };
  }

  if (/cash\s+deposit/.test(merchantText)) {
    return { categoryName: "Cash & ATM", type: "income" as const };
  }

  return null;
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
  const effectiveMerchantName = getEffectiveTransactionMerchantName({
    merchantClean: params.merchantClean,
    merchantRaw: params.merchantRaw,
    rawPayload: params.rawPayload,
    institution: params.institution,
  });
  const descriptionText =
    typeof params.description === "string" && params.description.trim() ? params.description.trim() : null;
  const institutionOverride = getInstitutionSpecificCategoryOverride(
    params.institution,
    [effectiveMerchantName, params.merchantRaw, descriptionText].filter(Boolean).join(" ")
  );
  const genericOverride = getGenericCategoryOverride(
    [effectiveMerchantName, params.merchantRaw, descriptionText].filter(Boolean).join(" ")
  );
  const overrideText = [effectiveMerchantName, params.merchantRaw, descriptionText].filter(Boolean).join(" ");
  if (
    params.institution &&
    /\bgcash\b/i.test(params.institution) &&
    institutionOverride === "Financial" &&
    /deposit to gsave|withdraw from gsave|seamoney credit|maribank credit/i.test(overrideText)
  ) {
    return institutionOverride;
  }
  const heuristic = guessCategoryName(effectiveMerchantName || descriptionText || params.merchantRaw, params.type);

  if (isMeaningfulCategoryName(directCategory)) {
    if ((isImportedRow || hasImportedRawPayload) && isBroadCategoryName(directCategory)) {
      if (institutionOverride === directCategory) {
        return directCategory;
      }
      if (isMeaningfulCategoryName(institutionOverride) && institutionOverride !== directCategory) {
        return institutionOverride;
      }
      if (isMeaningfulCategoryName(genericOverride) && genericOverride !== directCategory) {
        return genericOverride;
      }
    }

    return directCategory;
  }

  if (isMeaningfulCategoryName(rawPayloadCategory)) {
    if ((isImportedRow || hasImportedRawPayload) && isBroadCategoryName(rawPayloadCategory)) {
      if (institutionOverride === rawPayloadCategory) {
        return rawPayloadCategory;
      }
      if (isMeaningfulCategoryName(institutionOverride) && institutionOverride !== rawPayloadCategory) {
        return institutionOverride;
      }
      if (isMeaningfulCategoryName(genericOverride) && genericOverride !== rawPayloadCategory) {
        return genericOverride;
      }
    }

    return rawPayloadCategory;
  }

  if (isMeaningfulCategoryName(institutionOverride)) {
    return institutionOverride;
  }

  if (genericOverride) {
    return genericOverride;
  }

  if (isImportedRow || hasImportedRawPayload) {
    return directCategory || rawPayloadCategory || null;
  }

  return heuristic || directCategory || rawPayloadCategory || null;
};
