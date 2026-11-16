type ReceiptAccountHint = {
  accountName: string | null;
  accountLast4: string | null;
  confidence: number;
  reason: string | null;
};

type CandidateAccount = {
  id: string;
  name: string;
  institution: string | null;
  accountNumber?: string | null;
  importIdentityInstitution?: string | null;
  importIdentityAccountNumber?: string | null;
  type: string;
  currency?: string | null;
};

type ResolvedReceiptAccount = {
  accountId: string;
  accountName: string;
  institution: string | null;
  accountLast4: string | null;
  confidence: number;
  reason: string;
};

export type ReceiptInstitutionFallbackHint = {
  institution: string | null;
  accountName?: string | null;
  accountType?: string | null;
  reason?: string | null;
};

export type ReceiptInstitutionAccountDraft = {
  accountName: string;
  institution: string | null;
  accountType: string;
  reason: string;
};

const normalizeWhitespace = (value: string) => value.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();

const normalizeToken = (value: string) =>
  normalizeWhitespace(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const canonicalInstitutionKey = (value?: string | null) =>
  normalizeToken(value ?? "")
    .replace(/\bunion bank of the philippines\b/g, "unionbank")
    .replace(/\bunion bank\b/g, "unionbank")
    .replace(/\bchina bank\b/g, "chinabank")
    .replace(/\bmetro bank\b/g, "metrobank")
    .replace(/\bphilippine national bank\b/g, "pnb")
    .replace(/\bg cash\b/g, "gcash");

const extractLastFourDigits = (value?: string | null) => {
  if (!value) {
    return null;
  }

  const digits = String(value).replace(/\D/g, "");
  if (digits.length < 4) {
    return null;
  }

  return digits.slice(-4);
};

const accountNameSignals = [
  { pattern: /^(?:card|credit card|debit card)$/i, type: "credit_card" },
  { pattern: /\bvisa\b/i, type: "credit_card" },
  { pattern: /\bmastercard\b/i, type: "credit_card" },
  { pattern: /\bamex\b|\bamerican express\b/i, type: "credit_card" },
  { pattern: /\bgcash\b/i, type: "wallet" },
  { pattern: /\bmaya\b/i, type: "wallet" },
  { pattern: /\bwise\b/i, type: "bank" },
  { pattern: /\bpaypal\b/i, type: "wallet" },
];

const getCandidateLast4 = (account: CandidateAccount) =>
  extractLastFourDigits(account.accountNumber) ?? extractLastFourDigits(account.name);

const getHintAccountType = (hintName: string) => {
  const signal = accountNameSignals.find((entry) => entry.pattern.test(hintName));
  return signal?.type ?? null;
};

export const resolveReceiptAccountHintToAccount = (
  hint: ReceiptAccountHint | null,
  accounts: CandidateAccount[]
): ResolvedReceiptAccount | null => {
  if (!hint?.accountName && !hint?.accountLast4) {
    return null;
  }

  const hintName = normalizeToken(hint.accountName ?? "");
  const hintLast4 = hint.accountLast4?.replace(/\D/g, "").slice(-4) ?? null;
  const hintAccountType = getHintAccountType(hintName);

  const scored = accounts
    .map((account) => {
      const accountName = normalizeToken(account.name);
      const institution = normalizeToken(account.institution ?? "");
      const accountLast4 = getCandidateLast4(account);
      let score = 0;
      const reasons: string[] = [];

      if (hintLast4 && accountLast4 && hintLast4 === accountLast4) {
        score += 60;
        reasons.push(`last4 ${hintLast4}`);
      }

      if (hintName) {
        if (accountName === hintName) {
          score += 30;
          reasons.push("matching account name");
        } else if (accountName.includes(hintName) || hintName.includes(accountName)) {
          score += 20;
          reasons.push("similar account name");
        }

        if (institution && (institution === hintName || institution.includes(hintName) || hintName.includes(institution))) {
          score += 18;
          reasons.push("matching institution");
        }
      }

      const signal = hintAccountType;
      if (signal) {
        if (account.type === signal) {
          score += 16;
          reasons.push(`matching ${signal}`);
        } else {
          score -= 10;
          reasons.push(`type mismatch`);
        }
      }

      if (hint.confidence >= 90) {
        score += 4;
      }

      if (account.currency && /PHP/i.test(account.currency)) {
        score += 1;
      }

      return {
        account,
        score,
        reasons,
        accountLast4,
      };
    })
    .filter((entry) => entry.score >= 40)
    .sort((left, right) => right.score - left.score);

  if (scored.length === 0) {
    return null;
  }

  const topScore = scored[0]?.score ?? 0;
  const topMatches = scored.filter((entry) => entry.score === topScore);
  if (topMatches.length !== 1 || topScore < 70) {
    return null;
  }

  const best = topMatches[0];
  if (!best) {
    return null;
  }

  return {
    accountId: best.account.id,
    accountName: best.account.name,
    institution: best.account.institution ?? null,
    accountLast4: best.accountLast4,
    confidence: Math.min(99, Math.max(70, topScore)),
    reason: best.reasons.join(", ") || "Matched receipt account hint to saved account",
  };
};

export const resolveReceiptInstitutionFallbackToAccount = (
  hint: ReceiptInstitutionFallbackHint | null,
  accounts: CandidateAccount[]
): ResolvedReceiptAccount | null => {
  const institutionKey = canonicalInstitutionKey(hint?.institution ?? hint?.accountName ?? null);
  if (!institutionKey) {
    return null;
  }

  const hintedType = normalizeToken(hint?.accountType ?? "");
  const candidates = accounts.filter((account) => {
    const accountInstitutionKey = canonicalInstitutionKey(account.institution ?? account.name);
    if (!accountInstitutionKey) {
      return false;
    }

    const institutionMatches =
      accountInstitutionKey === institutionKey ||
      accountInstitutionKey.includes(institutionKey) ||
      institutionKey.includes(accountInstitutionKey);

    if (!institutionMatches) {
      return false;
    }

    if (hintedType && normalizeToken(account.type) !== hintedType) {
      return false;
    }

    return true;
  });

  if (candidates.length !== 1) {
    return null;
  }

  const account = candidates[0];
  if (!account) {
    return null;
  }

  return {
    accountId: account.id,
    accountName: account.name,
    institution: account.institution ?? null,
    accountLast4: getCandidateLast4(account),
    confidence: 72,
    reason:
      hint?.reason?.trim() ||
      `Matched ${hint?.institution ?? hint?.accountName ?? "institution"} screenshot to the only saved ${account.institution ?? account.name} account`,
  };
};

export const buildReceiptInstitutionAccountDraft = (
  hint: ReceiptInstitutionFallbackHint | null
): ReceiptInstitutionAccountDraft | null => {
  const institutionKey = canonicalInstitutionKey(hint?.institution ?? hint?.accountName ?? null);
  if (!institutionKey) {
    return null;
  }

  const hintedType = normalizeToken(hint?.accountType ?? "");
  const fallbackName = normalizeWhitespace(hint?.accountName ?? hint?.institution ?? "");
  const fallbackInstitution = normalizeWhitespace(hint?.institution ?? hint?.accountName ?? "") || null;
  const fallbackReason =
    hint?.reason?.trim() ||
    `Detected ${(fallbackInstitution ?? fallbackName) || "wallet"} screenshot with no existing matching account.`;

  if (institutionKey === "gcash") {
    return {
      accountName: "GCash",
      institution: "GCash",
      accountType: "wallet",
      reason: fallbackReason,
    };
  }

  if (institutionKey === "maya") {
    return {
      accountName: "Maya Wallet",
      institution: "Maya",
      accountType: "wallet",
      reason: fallbackReason,
    };
  }

  if (institutionKey === "unionbank") {
    return {
      accountName: "UnionBank",
      institution: "UnionBank",
      accountType: hintedType || "bank",
      reason: fallbackReason,
    };
  }

  if (institutionKey === "chinabank") {
    return {
      accountName: "Chinabank",
      institution: "Chinabank",
      accountType: hintedType || "bank",
      reason: fallbackReason,
    };
  }

  if (institutionKey === "metrobank") {
    return {
      accountName: "Metrobank",
      institution: "Metrobank",
      accountType: hintedType || "bank",
      reason: fallbackReason,
    };
  }

  if (institutionKey === "pnb") {
    return {
      accountName: "PNB",
      institution: "PNB",
      accountType: hintedType || "bank",
      reason: fallbackReason,
    };
  }

  const inferredType = hintedType || getHintAccountType(fallbackName) || "bank";
  const inferredName = fallbackName || fallbackInstitution || "Imported account";
  return {
    accountName: inferredName,
    institution: fallbackInstitution,
    accountType: inferredType,
    reason: fallbackReason,
  };
};

export type PrintedPaymentIdentity = {
  method: "card" | "credit" | "debit" | "wallet";
  issuer: string | null;
  suffix: string | null;
};

const wallets = /\b(?:gcash|g cash|paymaya|maya|grabpay|gopay|ovo|dana|paypal|wise)\b/iu;
const paymentLine = /^(?:(?:paid|payment)\s+(?:with|by|via)\b|(?:payment method|form of payment|card issuer|issuing bank|issuer|card number|card ending|card last\s*4)\b|(?:credit|debit) card\b|(?:card|visa|mastercard|amex|jcb|gcash|maya|paymaya|grabpay|gopay|ovo|dana|paypal|wallet)\s*(?:[:：]|\b(?:payment|paid|ending)\b|[*x•]{2,}))/iu;
const explicitIssuer = /^(?:card issuer|issuing bank|issuer)\s*[:：]\s*([\p{L} .&-]{2,65})$/iu;
const containsToken = (text: string, value: string) => Boolean(value && ` ${text} `.includes(` ${value} `));
const issuerKey = (value?: string | null) => canonicalInstitutionKey(value)
  .replace(/\bbank of the philippine islands\b/g, "bpi")
  .replace(/\bbanco de oro\b/g, "bdo")
  .replace(/\bpay ?maya\b/g, "maya");

export function readPrintedPaymentIdentity(text: string, accounts: CandidateAccount[]): PrintedPaymentIdentity | "ambiguous" | null {
  const institutionKeys = [...new Set(accounts.flatMap(account => [issuerKey(account.institution), issuerKey(account.importIdentityInstitution)]))].filter(Boolean);
  const lines = text.normalize("NFKC").split(/\r?\n/u).map(line => line.trim());
  const relevant = lines.filter(line => paymentLine.test(line) ||
    /^(?:gcash|maya|paymaya|grabpay|gopay|ovo|dana|paypal|wallet)\s+(?:[A-Z]{3}\s*|[₱$€£]\s*)?\d[\d,.]*\.\d{2}$/iu.test(line));
  if (!relevant.length) return null;
  const issuers = new Set<string>();
  const suffixes = new Set<string>();
  let method: PrintedPaymentIdentity["method"] = "card";
  for (const line of relevant) {
    const wallet = line.match(wallets)?.[0];
    if (wallet) {
      method = "wallet";
      issuers.add(issuerKey(wallet));
    } else if (method !== "wallet" && /\bdebit\s+card\b/iu.test(line)) {
      method = "debit";
    } else if (method === "card" && /\bcredit\s+card\b/iu.test(line)) {
      method = "credit";
    }
    const issuer = line.match(explicitIssuer)?.[1];
    if (issuer) issuers.add(issuerKey(issuer));
    else if (!wallet) {
      for (const key of institutionKeys) if (containsToken(issuerKey(line), key)) issuers.add(key);
    }
    const suffix = line.match(/(?:[*x•]{2,}\s*|(?:\bending(?:\s+in)?|\blast\s*4|^card number)\s*[:：#-]?\s*)\b(\d{4})(?!\d)/iu)?.[1];
    if (suffix) suffixes.add(suffix);
  }
  if (issuers.size > 1 || suffixes.size > 1) return "ambiguous";
  const issuer = [...issuers][0] ?? null;
  const suffix = [...suffixes][0] ?? null;
  return issuer || suffix || relevant.some(line => /\b(?:debit|credit|card|visa|mastercard|amex|wallet)\b/iu.test(line))
    ? { method, issuer, suffix } : null;
}

export const receiptPaymentHistoryKey = (identity: PrintedPaymentIdentity | null) =>
  identity?.issuer && identity.suffix ? `${identity.method}:${identity.issuer}:${identity.suffix}` : null;

export function matchPrintedReceiptAccount(
  identity: PrintedPaymentIdentity,
  accounts: CandidateAccount[],
  currency: string | null,
  confirmedAccountIds: string[] = [],
) {
  const candidates = accounts.filter(account => {
    if (currency && account.currency?.toUpperCase() !== currency.toUpperCase()) return false;
    if (identity.method === "wallet" && account.type !== "wallet") return false;
    if (identity.method === "credit" && account.type !== "credit_card") return false;
    if (identity.method === "debit" && account.type !== "bank" && account.type !== "wallet") return false;
    if (identity.method === "card" && account.type !== "credit_card" && account.type !== "bank") return false;
    if (identity.issuer && issuerKey(account.institution) !== identity.issuer &&
        issuerKey(account.importIdentityInstitution) !== identity.issuer &&
        !containsToken(issuerKey(account.name), identity.issuer)) return false;
    return true;
  });
  const history = new Set(confirmedAccountIds);
  const savedSuffix = (account: CandidateAccount) =>
    extractLastFourDigits(account.accountNumber) ?? extractLastFourDigits(account.importIdentityAccountNumber) ?? account.name.match(/(?:^|[\s*•-])(\d{4})$/u)?.[1] ?? null;
  const exact = identity.suffix ? candidates.filter(account => savedSuffix(account) === identity.suffix) : candidates;
  const remembered = identity.suffix && history.size === 1
    ? candidates.filter(account => !savedSuffix(account) && history.has(account.id)) : [];
  const matches = exact.length ? exact : remembered;
  const account = matches.length === 1 && (identity.issuer || identity.suffix) ? matches[0] : null;
  const suggested = matches.length > 1 ? matches.filter(candidate => history.has(candidate.id)) : [];
  return {
    resolution: account ? {
      accountId: account.id, accountName: account.name, institution: account.institution,
      accountLast4: savedSuffix(account) ?? identity.suffix,
      confidence: remembered.includes(account) ? 85 : identity.suffix ? 95 : 80,
      reason: remembered.includes(account) ? "Previously confirmed payment account" : "Matched printed payment details",
    } : null,
    candidateIds: (matches.length ? matches : candidates).map(candidate => candidate.id),
    suggestedAccountId: suggested.length === 1 ? suggested[0].id : null,
  };
}
