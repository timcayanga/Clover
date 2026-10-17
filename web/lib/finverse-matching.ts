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
export function matchingBankAccounts<T extends { institution?: string | null; accountNumber?: string | null; currency: string; type: string }>(accounts: T[], incoming: { institution?: string | null; accountNumber?: string | null; currency: string; type: string }) {
  const institution = institutionKey(incoming.institution);
  return accounts.filter(a => institution && institutionKey(a.institution) === institution && a.currency === incoming.currency && a.type === incoming.type && bankNumbersMatch(a.accountNumber, incoming.accountNumber));
}
export const bankTransactionText = (value?: string | null) => (value ?? '').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
const genericBankLabel = (text: string) => /^(banktransaction|fundtransfer|fundstransfer|transfer|banktransfer|instapay|pesonet|cashin|cashout|instapaycashin|deposit|withdrawal|credit|debit)$/.test(text);
const transferText = (row: { merchantRaw?: string | null; merchantClean?: string | null; description?: string | null }) => /transfer|insta\s*pay|peso\s*net|cash[ -]?(in|out)/i.test([row.merchantRaw,row.merchantClean,row.description].join(" "));
/** Amount/date alone is not duplicate evidence for separate money movements. */
export function bankTransactionsNeedReview(a: Parameters<typeof bankTransactionMatches>[0], b: typeof a) {
  return !(transferText(a) || transferText(b)) || bankTransactionMatches(a,b);
}
export function bankTransactionMatches(a: { merchantRaw?: string | null; merchantClean?: string | null; description?: string | null }, b: typeof a) {
  const references = (row: typeof a) => [...[row.merchantRaw,row.description].join(" ").matchAll(/\bref(?:erence)?(?:\s*(?:no\.?|number|id))?\s*[:#-]?\s*([A-Z0-9]{6,})\b/gi)].map(match=>match[1].toUpperCase());
  const leftRefs=references(a),rightRefs=references(b);
  if(leftRefs.length && rightRefs.length) return leftRefs.some(ref=>rightRefs.includes(ref));
  const left = [a.merchantRaw, a.merchantClean, a.description].map(bankTransactionText).filter(s => s.length >= 4 && !genericBankLabel(s));
  return [b.merchantRaw, b.merchantClean, b.description].map(bankTransactionText).some(s => s.length >= 4 && !genericBankLabel(s) && left.includes(s));
}

export const bankInstitutionsMatch=(left?:string|null,right?:string|null)=>Boolean(institutionKey(left) && institutionKey(left)===institutionKey(right));
