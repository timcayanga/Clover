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
  accountNumber: string | null;
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

const normalizeWhitespace = (value: string) => value.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();

const normalizeToken = (value: string) =>
  normalizeWhitespace(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

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
