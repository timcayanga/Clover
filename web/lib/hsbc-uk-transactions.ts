import { getStrongMerchantCategoryHint } from "@/lib/merchant-category-hints";

const readPayload = (value: unknown) =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const normalizeTransactionCode = (value: unknown) =>
  String(value ?? "").trim().toUpperCase();

export const isHsbcUkCardPurchasePayload = (rawPayload: unknown) => {
  const payload = readPayload(rawPayload);
  if (!payload || String(payload.bank ?? "").trim().toUpperCase() !== "HSBC") {
    return false;
  }

  return ["VIS", "VMS", ")))", ">>>", "))", ">>"].includes(
    normalizeTransactionCode(payload.transactionCode)
  );
};

export const getHsbcUkParsedDirection = (
  rawPayload: unknown
): "income" | "expense" | null => {
  const payload = readPayload(rawPayload);
  const direction = String(payload?.parsedDirectionType ?? "").trim().toLowerCase();
  return direction === "income" || direction === "expense" ? direction : null;
};

export const resolveHsbcUkTransactionCategory = (params: {
  categoryName: string;
  merchantRaw?: string | null;
  merchantClean?: string | null;
  description?: string | null;
  rawPayload?: unknown;
}) => {
  if (!isHsbcUkCardPurchasePayload(params.rawPayload)) {
    return params.categoryName;
  }

  const merchantText = [params.merchantClean, params.merchantRaw, params.description]
    .filter((value): value is string => Boolean(value?.trim()))
    .join(" ");
  const merchantCategory = getStrongMerchantCategoryHint(merchantText);
  if (merchantCategory) {
    return merchantCategory;
  }

  return /^transfers?$/i.test(params.categoryName.trim())
    ? "Other"
    : params.categoryName;
};
