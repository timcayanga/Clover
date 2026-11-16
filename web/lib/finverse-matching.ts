import { matchesConfirmedCardNumber } from "../../shared/card-replacement";
import { normalizeBankName } from "./data-qa-banks";
/** Preserve the first metered identity when Finverse rotates IDs on reauthorization. */
export function bankLinkUsageIdentity(link: { externalAccountId: string; normalizedPayload?: unknown }) {
  const payload = link.normalizedPayload as { quotaIdentity?: unknown } | null;
  return typeof payload?.quotaIdentity === "string" && payload.quotaIdentity ? payload.quotaIdentity : link.externalAccountId;
}
/** Never collapse masks into apparently complete account numbers. */
export const cleanBankNumber = (value?: string | null) => (value ?? '').replace(/[\s-]/g, '').toUpperCase();
const institutionKey = (value?: string | null) => (normalizeBankName(value) ?? value ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
export function bankNumbersMatch(left?: string | null, right?: string | null) {
  const a = cleanBankNumber(left), b = cleanBankNumber(right);
  if (!a || !b) return false;
  if (/^\d+$/.test(a) && /^\d+$/.test(b)) return a === b;
  // A length-preserving mask and at least four visible digits are required.
  if (a.length !== b.length || (a.match(/\d/g)?.length ?? 0) < 4 || (b.match(/\d/g)?.length ?? 0) < 4) return false;
  return [...a].every((c, i) => c === b[i] || /[*x•]/i.test(c) || /[*x•]/i.test(b[i]));
}
export function matchingBankAccounts<T extends { institution?: string | null; accountNumber?: string | null; cardNumberHistory?: unknown; currency: string; type: string }>(accounts: T[], incoming: { institution?: string | null; accountNumber?: string | null; currency: string; type: string }) {
  const institution = institutionKey(incoming.institution);
  return accounts.filter(a => institution && institutionKey(a.institution) === institution && a.currency === incoming.currency && a.type === incoming.type && (bankNumbersMatch(a.accountNumber, incoming.accountNumber) || matchesConfirmedCardNumber(a, incoming.accountNumber)));
}
type BankTransactionText = {
  merchantRaw?: string | null;
  merchantClean?: string | null;
  description?: string | null;
};

const transferText = (row: BankTransactionText) =>
  /transfer|insta\s*pay|peso\s*net|cash[ -]?(in|out)/i.test([row.merchantRaw, row.merchantClean, row.description].join(" "));

const transactionReferences = (row: BankTransactionText) =>
  new Set(
    [...[row.merchantRaw, row.description].join(" ").matchAll(
      /\bref(?:erence)?(?:\s+(?:no\.?|number|id))?(?:\s*[:#-]\s*|\s+)([A-Z0-9]{6,})\b/gi
    )].map((match) => match[1].toUpperCase()).filter((reference) => /\d/.test(reference))
  );

/** Callers scope candidates to the same account, day, currency, amount and direction. */
export function bankTransactionMatches(a: BankTransactionText, b: BankTransactionText) {
  const left = transactionReferences(a);
  const right = transactionReferences(b);
  return left.size === 1 && right.size === 1 && [...left].some((reference) => right.has(reference));
}

export function bankTransactionsNeedReview(a: BankTransactionText, b: BankTransactionText) {
  const left = transactionReferences(a);
  const right = transactionReferences(b);
  if (left.size && right.size) return [...left].some((reference) => right.has(reference));
  return !(transferText(a) || transferText(b));
}

export const bankInstitutionsMatch=(left?:string|null,right?:string|null)=>Boolean(institutionKey(left) && institutionKey(left)===institutionKey(right));
