import { getStrongMerchantCategoryHint } from "@/lib/merchant-category-hints";
import { summarizeMerchantText } from "@/lib/merchant-labels";

export type MerchantEnrichmentInput = {
  merchantRaw?: string | null;
  merchantClean?: string | null;
  description?: string | null;
  categoryName?: string | null;
  preserveCategory?: boolean;
  type?: "income" | "expense" | "transfer";
  institution?: string | null;
};

export type MerchantEnrichmentResult = MerchantEnrichmentInput & {
  merchantClean: string | null;
  categoryName: string | null;
  type: "income" | "expense" | "transfer";
  applied: boolean;
  reason: string | null;
};

const nonEmpty = (value: string | null | undefined) => (typeof value === "string" && value.trim() ? value.trim() : null);

const isAllCapsMerchant = (value: string) => /[A-Z]{4,}/.test(value) && value === value.toUpperCase();

export const applyDeterministicMerchantRescue = (input: MerchantEnrichmentInput): MerchantEnrichmentResult => {
  const raw = nonEmpty(input.merchantRaw);
  const clean = nonEmpty(input.merchantClean);
  const description = nonEmpty(input.description);
  const sourceText = [raw, description].filter(Boolean).join(" ") || clean || "";
  const normalizedCandidate = sourceText ? nonEmpty(summarizeMerchantText(sourceText, input.institution)) : null;
  const merchantClean =
    normalizedCandidate && (!clean || clean === raw || (raw ? isAllCapsMerchant(raw) : false))
      ? normalizedCandidate
      : clean;
  const hintSource = [raw, clean, description].filter(Boolean).join(" ");
  const hint = hintSource ? getStrongMerchantCategoryHint([hintSource, normalizedCandidate].filter(Boolean).join(" ")) : null;
  const currentCategory = nonEmpty(input.categoryName);
  // Imported rows are not confirmed data. A strong merchant identity is more
  // reliable than a parser's generic transfer guess (for example, "DiDi
  // Tianjin" is ride-hailing, not a person-to-person transfer). Structured
  // files can mark their supplied category as authoritative.
  const categoryName =
    !input.preserveCategory &&
    hint &&
    (!currentCategory || currentCategory.toLowerCase() === "other" || currentCategory.toLowerCase() === "transfers")
      ? hint
      : currentCategory;
  const type =
    categoryName === "Transfers"
      ? "transfer"
      : categoryName === "Income"
        ? "income"
        : input.type ?? "expense";
  const applied = merchantClean !== clean || categoryName !== currentCategory || type !== (input.type ?? "expense");

  return {
    ...input,
    merchantClean,
    categoryName,
    type,
    applied,
    reason: applied
      ? categoryName !== currentCategory
        ? "strong_merchant_category_hint"
        : "merchant_label_normalized"
      : null,
  };
};
