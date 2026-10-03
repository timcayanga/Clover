import { getInstitutionSuggestionGroups } from "./institution-suggestions";
import { simpleEntryCandidates } from "./adviser-entry-intent";
import { entryAccount, type EntryAccount, type EntryDraft, type EntryFormContext } from "./adviser-entry-types";

type PaymentAccount = { id: string; name: string; institution?: string | null; type: string; currency: string | null };
const paymentTypes = new Set(["bank", "cash", "credit_card", "wallet"]);
const normalize = (value: string) => value.trim().toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
const typeFromName = (name: string): EntryAccount["type"] | null =>
  /\b(?:credit card|visa|mastercard)\b/i.test(name) ? "credit_card" :
  /\bcash\b/i.test(name) ? "cash" : /\bwallet\b/i.test(name) ? "wallet" :
  /\b(?:bank|savings|checking|current account)\b/i.test(name) ? "bank" : null;

function resolvePaymentAccount(name: string, accounts: PaymentAccount[], currency?: string) {
  const key = normalize(name);
  const eligible = accounts.filter(account => paymentTypes.has(account.type) && (!currency || account.currency === currency));
  const exact = eligible.filter(account => normalize(account.name) === key);
  const matches = exact.length ? exact : eligible.filter(account =>
    normalize(account.institution ?? "") === key || normalize(account.name).startsWith(`${key} `));
  return matches;
}

/** A named missing payment account is proposed with the transaction, never saved here. */
export function prepareSimpleAccountEntries(question: string, context: EntryFormContext | undefined, accounts: PaymentAccount[]) {
  const candidates = simpleEntryCandidates(question, context);
  if (!candidates) return null;
  const drafted: EntryAccount[] = [];
  const questions: string[] = [];
  for (const candidate of candidates) {
    const row = candidate.transaction;
    if (!candidate.accountName) continue;
    const matches = resolvePaymentAccount(candidate.accountName, accounts, candidate.explicitCurrency);
    if (matches.length === 1) {
      row.accountId = matches[0].id;
      row.currency = matches[0].currency ?? "";
      if (!row.currency) questions.push(`Which currency do you use for ${matches[0].name}?`);
      continue;
    }
    if (matches.length > 1) {
      questions.push(`Which ${candidate.accountName} account did you use: ${matches.map(account => `${account.name}${account.currency ? ` (${account.currency})` : ""}`).join(" or ")}?`);
      continue;
    }
    // Do not duplicate a known account just because the currency differs.
    if (resolvePaymentAccount(candidate.accountName, accounts).length) {
      questions.push(`The currency does not match your ${candidate.accountName} account. Which account and currency did you use?`);
      continue;
    }
    const stem = normalize(candidate.accountName.replace(/\b(?:credit card|visa|mastercard|bank|savings|checking|current account|wallet)\b/gi, ""));
    const known = getInstitutionSuggestionGroups(stem, "account").flatMap(group => group.items)
      .filter(institution => [institution.label, ...institution.aliases].some(alias => normalize(alias) === stem));
    const institution = known.length === 1 ? known[0] : null;
    const type = typeFromName(candidate.accountName) ?? (institution?.category === "bank" ? "bank" : institution?.category === "wallet" ? "wallet" : null);
    if (!type) {
      questions.push(`Is ${candidate.accountName} a bank account, wallet, credit card, or cash account? I’ll add it with this transaction after you review.`);
      continue;
    }
    let account = drafted.find(item => normalize(item.name) === normalize(candidate.accountName) && item.currency === row.currency);
    if (!account) {
      account = { ...entryAccount(`account-${drafted.length + 1}`), name: candidate.accountName,
        institution: institution?.label ?? "", type, balance: "0", currency: row.currency };
      drafted.push(account);
    }
    row.accountId = `new:${account.key}`;
    if (!row.currency) questions.push(`Which currency do you use for ${account.name}?`);
  }
  if (candidates.some(candidate => !candidate.transaction.accountId) && !questions.length) questions.push("Which account did you use?");
  const introduction = drafted.length ? `I’ve prepared ${drafted.map(account => account.name).join(", ")} as a new account with a starting balance of 0, together with your transaction. ` : "";
  return { accounts: drafted, transactions: candidates.map(candidate => candidate.transaction), confidence: questions.length ? 60 : drafted.length ? 85 : 95,
    reply: `${introduction}${[...new Set(questions)].join(" ") || "Review the amount, account, suggested category, currency and date."} Nothing is saved until you confirm.` };
}

/** A short account answer can resolve one missing account without another model call. */
export function completeEntryAccountChoice(question: string, draft: EntryDraft | undefined, accounts: PaymentAccount[]) {
  if (!draft || draft.transactions.length !== 1 || draft.transactions[0].accountId) return null;
  const name = question.trim().replace(/^(?:use|from|using|with)\s+/i, "");
  const matches = resolvePaymentAccount(name, accounts);
  if (matches.length !== 1 || !matches[0].currency || draft.transactions.some(row => row.currency && row.currency !== matches[0].currency)) return null;
  return { accounts: draft.accounts, receipts: draft.receipts, attachmentIds: draft.attachmentIds, confidence: 95,
    transactions: draft.transactions.map(row => ({ ...row, accountId: matches[0].id, currency: matches[0].currency! })),
    reply: `I’ve selected ${matches[0].name}. Review the transaction details before confirming. Nothing is saved yet.` };
}
