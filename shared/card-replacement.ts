export const CARD_REPLACEMENT_REASONS = ["replaced", "lost", "stolen", "expired", "other"] as const;
export type CardReplacementReason = typeof CARD_REPLACEMENT_REASONS[number];
export type CardReplacement = {
  version: 1; requestId: string; previousLastFour: string | null; newLastFour: string;
  effectiveDate: string; reason: CardReplacementReason; confirmedAt: string; confirmedBy: string;
};
export const supportsCardReplacement = (type: string) => ["bank", "credit_card", "prepaid", "line_of_credit"].includes(type);
export const cardLastFour = (value?: string | null) => {
  const digits = String(value ?? "").replace(/\D/g, "");
  return digits.length >= 4 ? digits.slice(-4) : null;
};
export const maskedCardNumber = (value?: string | null) => cardLastFour(value) ? `•••• ${cardLastFour(value)}` : "Not recorded";
export function readCardReplacements(value: unknown): CardReplacement[] {
  if (!Array.isArray(value)) return [];
  return value.filter((row): row is CardReplacement => Boolean(row && typeof row === "object" && row.version === 1 &&
    typeof row.requestId === "string" && /^\d{4}$/.test(row.newLastFour) &&
    (row.previousLastFour === null || /^\d{4}$/.test(row.previousLastFour)) &&
    typeof row.effectiveDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(row.effectiveDate) && typeof row.confirmedAt === "string" && Number.isFinite(Date.parse(row.confirmedAt)) && typeof row.confirmedBy === "string" && row.confirmedBy.length > 0 &&
    CARD_REPLACEMENT_REASONS.includes(row.reason)));
}
/** Only explicitly confirmed replacement history authorizes these suffix aliases. */
export function matchesConfirmedCardNumber(account: { accountNumber?: string | null; cardNumberHistory?: unknown }, incoming?: string | null) {
  const suffix = cardLastFour(incoming), history = readCardReplacements(account.cardNumberHistory);
  return Boolean(suffix && history.length && [cardLastFour(account.accountNumber), ...history.flatMap(row => [row.previousLastFour, row.newLastFour])].includes(suffix));
}
export function hasAmbiguousReplacementMatch(accounts: Array<{ accountNumber?: string | null; cardNumberHistory?: unknown }>, incoming?: string | null) {
  const suffix = cardLastFour(incoming);
  return Boolean(suffix && accounts.some(account => matchesConfirmedCardNumber(account, incoming)) &&
    accounts.filter(account => matchesConfirmedCardNumber(account, incoming) || cardLastFour(account.accountNumber) === suffix).length > 1);
}
export type PublicCardReplacement = Pick<CardReplacement, "previousLastFour" | "newLastFour" | "effectiveDate" | "reason" | "confirmedAt">;
export const publicCardHistory = (value: unknown) => readCardReplacements(value).map(({ previousLastFour, newLastFour, effectiveDate, reason, confirmedAt }) => ({ previousLastFour, newLastFour, effectiveDate, reason, confirmedAt }));
