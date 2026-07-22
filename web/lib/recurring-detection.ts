import { Prisma, type CommitmentRecurrence } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { hasCompatibleTable } from "@/lib/data-engine";

type RecurringSourceTransaction = {
  id: string;
  workspaceId: string;
  accountId: string | null;
  date: Date;
  amount: { toString: () => string } | string | number;
  currency: string | null;
  type: "income" | "expense" | "transfer";
  merchantRaw: string;
  merchantClean: string | null;
  description?: string | null;
  category?: {
    name: string;
  } | null;
  account?: {
    id: string | null;
    name: string | null;
    institution: string | null;
  } | null;
  importFile?: {
    fileName: string;
  } | null;
};

type DetectedRecurringPattern = {
  workspaceId: string;
  accountId: string | null;
  merchantRaw: string;
  merchantClean: string | null;
  canonicalTitle: string;
  amount: number;
  minimumAmount: number;
  maximumAmount: number;
  currency: string;
  frequency: CommitmentRecurrence;
  firstSeenDate: Date;
  lastSeenDate: Date;
  nextExpectedDate: Date;
  expectedDayOfMonth: number | null;
  transactionCount: number;
  confidence: number;
  reasonSummary: string;
  reasonTags: string[];
  suppressionKey: string;
  rawPayload: Prisma.InputJsonValue;
  account: {
    id: string | null;
    name: string | null;
    institution: string | null;
  } | null;
  importFile: {
    fileName: string;
  } | null;
};

export type RecurringObligationType =
  | "subscription"
  | "utility"
  | "loan"
  | "insurance"
  | "rent"
  | "statement_payment"
  | "general";

const recurringKeywordPattern =
  /\b(rent|lease|landlord|internet|bill|billing|utility|utilities|subscription|subscr(?:iption)?|monthly|annual|membership|premium|dues|installment|statement\s+payment|payment\s+due|electric|water|phone|mobile\s+plan|broadband|wifi|insurance|mortgage|loan|repayment|amortization|tuition|school\s+fee|gym|fitness|netflix|spotify|youtube|icloud|google|notion|openai|chatgpt|adobe|microsoft|canva|scribd|linkedin|globe|smart|pldt|meralco|maynilad|prime|apple\s+services?|figma|zoom|dropbox|airalo|slack|autosweep|easytrip|beep\s+card|parking\s+subscription)\b/i;
const recurringExclusionPattern =
  /\b(transfer|instapay|instapay dr|fund transfer|outward|inward|cash payment|bills payment|payment to card|card payment|atm withdrawal|cash advance|top up|cash in|incoming credit|received gcash|gcash received|load purchase|refund|reversal)\b/i;
const recurringNoiseTitlePattern =
  /^(transfer from|transfer to|interbank transfer|instapay ?fee|instapay dr|load purchase|paymaya load purchase|maya load purchase|gcash received|received gcash|in app purchase for mobile|atm withdrawal|withholding tax|interest applied|mobile load|service fee|fee|invno)/i;
const recurringCanonicalNoisePattern =
  /\b(load purchase|paymaya load|maya load|gcash received|received gcash|instapay dr|service fee|point of sale|^fee$|invno)\b/i;
const recurringRescuePattern =
  /\b(subscription|subscr(?:iption)?|monthly|annual|membership|premium|dues|rent|lease|internet|broadband|wifi|phone|mobile\s+plan|electric|water|utility|utilities|insurance|mortgage|loan|repayment|amortization|installment|statement\s+payment|payment\s+due|tuition|school\s+fee|gym|fitness|netflix|spotify|youtube|icloud|google|notion|openai|chatgpt|adobe|microsoft|canva|scribd|linkedin|globe|smart|pldt|meralco|maynilad|apple\s+services?|figma|zoom|dropbox|airalo|slack|autosweep|easytrip|beep\s+card|parking\s+subscription)\b/i;
const recurringPositiveTransferPattern =
  /\b(statement\s+payment|payment\s+due|loan|repayment|amortization|installment|insurance|premium|rent|lease|internet|phone|electric|water|utility|utilities|subscription|membership|dues|gym|fitness|netflix|spotify|youtube|icloud|google|notion|openai|chatgpt|adobe|canva|linkedin|pldt|meralco|globe|smart|maynilad|figma|zoom|dropbox|airalo|slack|tuition|school\s+fee|autosweep|easytrip|beep\s+card|parking\s+subscription)\b/i;
const recurringCreditLikeExclusionPattern =
  /\b(salary|payroll|bonus|interest earned|interest applied|interest credited|incoming credit|received money|cash deposit|deposit|received gcash|gcash received|refund|reversal|credit memo)\b/i;
const recurringCategoryRescueSet = new Set(["bills & utilities", "insurance", "loans", "housing", "education", "subscriptions", "health & wellness"]);
const recurringStrongCategorySet = new Set(["insurance", "loans", "subscriptions"]);
const recurringDiscretionaryCategorySet = new Set(["food & dining", "shopping", "travel & lifestyle", "entertainment", "transport"]);
const recurringDiscretionaryMerchantPattern =
  /\b(grab|toby'?s\s+estate|coffee|cafe|restaurant|bistro|bakery|starbucks|jollibee|mcdonald'?s|foodpanda)\b/i;

const recurringMerchantAliases = [
  { pattern: /\bopenai\b.*\b(chatgpt|subscr(?:iption)?)\b|\bchatgpt\b/i, label: "OpenAI ChatGPT" },
  { pattern: /\bnetflix\b/i, label: "Netflix" },
  { pattern: /\bspotify\b/i, label: "Spotify" },
  { pattern: /\bdisney\b.*\bplus\b|\bdisney\+\b/i, label: "Disney+" },
  { pattern: /\bprime\b.*\b(video|membership)\b|\bamazon\b.*\bprime\b/i, label: "Amazon Prime" },
  { pattern: /\bapple\b.*\bmusic\b/i, label: "Apple Music" },
  { pattern: /\b(?:youtube|yt)\b.*\b(premium|prem|music|subscription)?\b|\byt\s+prem\b/i, label: "YouTube" },
  { pattern: /\bapple\b.*\b(icloud|itunes|bill|services?)\b|\bicloud\b/i, label: "Apple / iCloud" },
  { pattern: /\bgoogle\b.*\b(one|storage|workspace|subscription)?\b/i, label: "Google" },
  { pattern: /\badobe\b/i, label: "Adobe" },
  { pattern: /\bcanva\b/i, label: "Canva" },
  { pattern: /\bfigma\b/i, label: "Figma" },
  { pattern: /\bzoom\b/i, label: "Zoom" },
  { pattern: /\bdropbox\b/i, label: "Dropbox" },
  { pattern: /\bairalo\b/i, label: "Airalo" },
  { pattern: /\bslack\b/i, label: "Slack" },
  { pattern: /\bnotion\b/i, label: "Notion" },
  { pattern: /\bscribd\b/i, label: "Scribd" },
  { pattern: /\blinkedin\b/i, label: "LinkedIn" },
  { pattern: /\bmicrosoft\b.*\b(365|subscription|office)\b/i, label: "Microsoft" },
  { pattern: /\bmeralco\b/i, label: "Meralco" },
  { pattern: /\bpldt\b/i, label: "PLDT" },
  { pattern: /\bglobe\b/i, label: "Globe" },
  { pattern: /\bsmart\b/i, label: "Smart" },
  { pattern: /\bgrab\b.*\b(unlimited|subscription|plus)\b/i, label: "Grab" },
  { pattern: /\bautosweep\b/i, label: "Autosweep" },
  { pattern: /\beasytrip\b/i, label: "Easytrip" },
  { pattern: /\bbeep\b.*\b(card|reload|load)\b|\bbeep\s+card\b/i, label: "Beep Card" },
  { pattern: /\b(?:rent|lease)\b/i, label: "Rent" },
  { pattern: /\b(?:tuition|school\s+fee|school\s+payment)\b/i, label: "Tuition" },
  { pattern: /\b(anytime\s+fitness|fitness\s+first|gold'?s\s+gym|classpass|gym\s+membership)\b/i, label: "Gym Membership" },
  { pattern: /\bamazon web services\b|\baws\b/i, label: "Amazon Web Services" },
];

const recurringFamilyNoisePattern =
  /\b(?:subscription|subscr(?:iption)?|recurring|monthly|autopay|premium|membership|member|plan|service|services|merchant|purchase|ecommerce|online|intl|international|foreign|debit|credit|visa|mastercard|pos|approval|reference|ref|auth|descriptor|statement|biller|billers?|invno)\b/g;
const variableAmountRecurringPattern =
  /\b(rent|lease|internet|bill|utility|utilities|electric|water|phone|insurance|mortgage|loan|repayment|amortization|dues|tuition|school\s+fee|globe|smart|pldt|meralco|maynilad|autosweep|easytrip|beep\s+card)\b/i;

export const normalizeRecurringMerchantKey = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/^\d{1,2}\s*:\s*\d{2}\s*/g, " ")
    .replace(/\b(?:bills?\s+payment(?:\s+to)?|payment\s+to|pay(?:ment)?\s+for|one\s+click)\b/g, " ")
    .replace(/\b(?:ref(?:erence)?|auth(?:orization)?|approval|trace|trace\s*no|txn|rrn|stan|invoice|order)\s*[:#-]?\s*[a-z0-9-]+\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\bsubscr(?:iption)?\b/g, " subscription ")
    .replace(/\b\d{4,}\b/g, " ")
    .replace(/\b[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}\b/g, " ")
    .replace(/\b(?:[a-z]{2,4}\.com|com|phl|ph|sgp|usa|us|irl|sg|my|hk|au)\b/g, " ")
    .replace(/\b(?:makati|taguig|pasig|quezon|mandaluyong|angeles|manila|city)\b/g, " ")
    .replace(/\b(?:branch|store|merchant|retail|digital|transaction|trx|memo|description|desc)\b/g, " ")
    .replace(/\b(pos|visa|mastercard|debit|credit|online|payment|pay|ph|inc|corp|co|ref|auth|card)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();

export const buildRecurringMerchantFamilySignature = (value: string) => {
  const normalized = normalizeRecurringMerchantKey(value)
    .replace(recurringFamilyNoisePattern, " ")
    .replace(/\s+/g, " ")
    .trim();

  const tokens = normalized
    .split(" ")
    .filter((token) => token.length >= 3)
    .filter((token) => !/^\d+$/.test(token));

  if (tokens.length === 0) {
    return normalized;
  }

  return tokens.slice(0, 2).join(" ");
};

const canonicalizeRecurringMerchant = (value: string) => {
  const normalized = normalizeRecurringMerchantKey(value);
  for (const alias of recurringMerchantAliases) {
    if (alias.pattern.test(normalized)) {
      return alias.label;
    }
  }

  return normalized
    .replace(/\b(?:subscription|monthly|autopay|premium|membership|fee)\b/g, " ")
    .replace(/\b(?:postpaid|telecom|utilities?)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim() || buildRecurringMerchantFamilySignature(value);
};

const buildRecurringCandidateText = (transaction: Pick<RecurringSourceTransaction, "merchantRaw" | "merchantClean" | "description" | "category" | "account">) =>
  [
    transaction.merchantClean ?? "",
    transaction.merchantRaw ?? "",
    transaction.description ?? "",
    transaction.category?.name ?? "",
    transaction.account?.institution ?? "",
    transaction.account?.name ?? "",
  ]
    .join(" ")
    .trim();

const isRecurringCandidateTransaction = (transaction: RecurringSourceTransaction) => {
  const textBlob = buildRecurringCandidateText(transaction).toLowerCase();
  const categoryName = transaction.category?.name?.trim().toLowerCase() ?? "";

  if (transaction.type === "expense") {
    if (recurringCreditLikeExclusionPattern.test(textBlob)) {
      return false;
    }

    if (recurringExclusionPattern.test(textBlob) && !recurringPositiveTransferPattern.test(textBlob)) {
      return false;
    }

    return true;
  }

  if (recurringCreditLikeExclusionPattern.test(textBlob)) {
    return false;
  }

  const hasRecurringSignal =
    recurringRescuePattern.test(textBlob) ||
    recurringKeywordPattern.test(textBlob) ||
    recurringMerchantAliases.some((alias) => alias.pattern.test(textBlob));
  const hasRecurringCategory = recurringCategoryRescueSet.has(categoryName);
  const looksExpenseLikeTransfer =
    transaction.type === "transfer" && recurringPositiveTransferPattern.test(textBlob);

  return hasRecurringSignal && (hasRecurringCategory || looksExpenseLikeTransfer || transaction.type !== "income");
};

const isDismissedRecurringPattern = (value: Prisma.JsonValue | null | undefined) =>
  Boolean(
    value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      (value as Record<string, unknown>).dismissed === true
  );

const toAmount = (value: RecurringSourceTransaction["amount"]) => {
  const parsed = Number(value?.toString?.() ?? value ?? 0);
  return Number.isFinite(parsed) ? Math.abs(parsed) : 0;
};

const median = (values: number[]) => {
  const sorted = values.filter(Number.isFinite).sort((left, right) => left - right);
  if (sorted.length === 0) {
    return 0;
  }

  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2 : (sorted[middle] ?? 0);
};

const average = (values: number[]) => {
  const filtered = values.filter(Number.isFinite);
  return filtered.length > 0 ? filtered.reduce((sum, value) => sum + value, 0) / filtered.length : 0;
};

const ordinal = (value: number) =>
  `${value}${value % 10 === 1 && value % 100 !== 11 ? "st" : value % 10 === 2 && value % 100 !== 12 ? "nd" : value % 10 === 3 && value % 100 !== 13 ? "rd" : "th"}`;

const daysBetween = (left: Date, right: Date) => Math.round(Math.abs(right.getTime() - left.getTime()) / 86_400_000);

const monthDiff = (left: Date, right: Date) =>
  (right.getFullYear() - left.getFullYear()) * 12 + right.getMonth() - left.getMonth();

const getMonthKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;

const addMonths = (date: Date, months: number) => {
  const next = new Date(date);
  const day = next.getDate();
  next.setMonth(next.getMonth() + months, 1);
  const lastDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
  next.setDate(Math.min(day, lastDay));
  return next;
};

const addDays = (date: Date, days: number) => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
};

const pickMonthlyRepresentativeTransactions = (transactions: RecurringSourceTransaction[]) => {
  const grouped = transactions.reduce((map, transaction) => {
    const key = getMonthKey(transaction.date);
    map.set(key, [...(map.get(key) ?? []), transaction]);
    return map;
  }, new Map<string, RecurringSourceTransaction[]>());

  const amounts = transactions.map((transaction) => toAmount(transaction.amount)).filter((amount) => amount > 0);
  const typicalAmount = median(amounts);
  const anchorDay = Math.round(median(transactions.map((transaction) => transaction.date.getDate())));

  return Array.from(grouped.values())
    .map((monthTransactions) =>
      [...monthTransactions].sort((left, right) => {
        const leftAmountDistance = Math.abs(toAmount(left.amount) - typicalAmount);
        const rightAmountDistance = Math.abs(toAmount(right.amount) - typicalAmount);
        if (leftAmountDistance !== rightAmountDistance) {
          return leftAmountDistance - rightAmountDistance;
        }

        const leftDayDistance = Math.abs(left.date.getDate() - anchorDay);
        const rightDayDistance = Math.abs(right.date.getDate() - anchorDay);
        if (leftDayDistance !== rightDayDistance) {
          return leftDayDistance - rightDayDistance;
        }

        return left.date.getTime() - right.date.getTime();
      })[0] as RecurringSourceTransaction
    )
    .sort((left, right) => left.date.getTime() - right.date.getTime());
};

const rollPatternDateForward = (
  candidateDate: Date,
  recurrence: CommitmentRecurrence,
  expectedDayOfMonth: number | null
) => {
  const now = new Date();
  let next = new Date(candidateDate);

  if (expectedDayOfMonth !== null && ["monthly", "quarterly", "annual"].includes(recurrence)) {
    next.setDate(Math.min(expectedDayOfMonth, 28));
  }

  const bump = () => {
    if (recurrence === "weekly") {
      next = addDays(next, 7);
      return;
    }
    if (recurrence === "biweekly") {
      next = addDays(next, 14);
      return;
    }
    if (recurrence === "quarterly") {
      next = addMonths(next, 3);
      return;
    }
    if (recurrence === "annual") {
      next = addMonths(next, 12);
      return;
    }
    next = addMonths(next, 1);
  };

  while (next.getTime() <= now.getTime()) {
    bump();
  }

  return next;
};

export const classifyRecurringObligation = (params: {
  text: string;
  categoryNames?: string[];
}): RecurringObligationType => {
  const normalizedText = params.text.toLowerCase();
  const categories = new Set((params.categoryNames ?? []).map((value) => value.toLowerCase()));

  if (/\b(netflix|spotify|youtube|disney|prime|apple music|icloud|google one|chatgpt|canva|adobe|scribd|linkedin|notion|figma|zoom|dropbox|airalo|slack|subscription|subscr|gym|fitness)\b/.test(normalizedText)) {
    return "subscription";
  }

  if (/\b(mortgage|loan|repayment|amortization|installment|credit to cash)\b/.test(normalizedText) || categories.has("loans")) {
    return "loan";
  }

  if (/\b(insurance|premium policy|insure)\b/.test(normalizedText) || categories.has("insurance")) {
    return "insurance";
  }

  if (/\b(rent|landlord|lease)\b/.test(normalizedText)) {
    return "rent";
  }

  if (/\b(card payment|statement payment|amount due|total amount due|minimum amount due)\b/.test(normalizedText)) {
    return "statement_payment";
  }

  if (
    /\b(internet|phone|electric|water|utility|utilities|pldt|globe|smart|meralco|broadband|postpaid|autosweep|easytrip|beep\s+card|parking\s+subscription)\b/.test(normalizedText) ||
    categories.has("bills & utilities")
  ) {
    return "utility";
  }

  return "general";
};

export const makeRecurringSuppressionKey = (params: {
  accountId: string | null;
  currency: string | null;
  title: string | null;
}) =>
  [params.accountId ?? "workspace", (params.currency ?? "PHP").trim().toUpperCase() || "PHP", normalizeRecurringMerchantKey(params.title ?? "")]
    .join("::");

const scoreRecurringLabelCandidate = (value: string) => {
  const normalized = normalizeRecurringMerchantKey(value);
  if (!normalized) {
    return Number.NEGATIVE_INFINITY;
  }

  let score = normalized.split(" ").filter(Boolean).length;

  if (recurringNoiseTitlePattern.test(normalized)) {
    score -= 6;
  }
  if (recurringExclusionPattern.test(normalized)) {
    score -= 4;
  }
  if (recurringMerchantAliases.some((alias) => alias.pattern.test(normalized))) {
    score += 8;
  }
  if (recurringKeywordPattern.test(normalized) || recurringRescuePattern.test(normalized)) {
    score += 4;
  }
  if (recurringPositiveTransferPattern.test(normalized)) {
    score += 2;
  }
  if (/\d{4,}/.test(value)) {
    score -= 1;
  }
  if (/^\d{1,2}[-/: ]\d{1,2}/.test(value) || value.replace(/\D/g, "").length >= 8) {
    score -= 3;
  }

  return score;
};

const selectPreferredRecurringLabel = (transaction: Pick<RecurringSourceTransaction, "merchantRaw" | "merchantClean" | "description">) => {
  const normalizedMerchant = transaction.merchantClean?.trim() ?? "";
  if (
    normalizedMerchant &&
    normalizeRecurringMerchantKey(normalizedMerchant) &&
    !recurringNoiseTitlePattern.test(normalizedMerchant) &&
    !recurringCanonicalNoisePattern.test(normalizedMerchant)
  ) {
    return normalizedMerchant;
  }

  const candidates = [transaction.merchantClean, transaction.merchantRaw, transaction.description]
    .map((value) => (value ?? "").trim())
    .filter(Boolean);

  if (candidates.length === 0) {
    return "";
  }

  return candidates
    .map((value) => ({ value, score: scoreRecurringLabelCandidate(value) }))
    .sort((left, right) => right.score - left.score || right.value.length - left.value.length)[0]?.value ?? candidates[0] ?? "";
};

const buildRecurringGroupingKey = (value: string) => {
  const normalized = normalizeRecurringMerchantKey(value);
  if (!normalized) {
    return "";
  }

  const alias = recurringMerchantAliases.find((candidate) => candidate.pattern.test(normalized));
  if (alias) {
    return alias.label.toLowerCase();
  }

  return buildRecurringMerchantFamilySignature(value) || canonicalizeRecurringMerchant(value) || normalized;
};

const inferFrequency = (
  dates: Date[],
  options?: {
    allowUtilityMonthlyBias?: boolean;
  }
): { frequency: CommitmentRecurrence | null; nextExpectedDate: Date | null; cadenceConfidence: number } => {
  const sortedDates = [...dates].sort((left, right) => left.getTime() - right.getTime());
  if (sortedDates.length < 2) {
    return { frequency: null, nextExpectedDate: null, cadenceConfidence: 0 };
  }

  const intervals = sortedDates.slice(1).map((date, index) => daysBetween(sortedDates[index] as Date, date));
  const typicalInterval = median(intervals);
  const lastSeenDate = sortedDates[sortedDates.length - 1] as Date;
  const monthlyAnchorDay = Math.round(median(sortedDates.map((date) => date.getDate())));
  const monthlyRepresentativeDates = Array.from(
    sortedDates.reduce((groups, date) => {
      const key = getMonthKey(date);
      groups.set(key, [...(groups.get(key) ?? []), date]);
      return groups;
    }, new Map<string, Date[]>()).values()
  )
    .map((monthDates) =>
      [...monthDates].sort(
        (left, right) =>
          Math.abs(left.getDate() - monthlyAnchorDay) - Math.abs(right.getDate() - monthlyAnchorDay) ||
          left.getTime() - right.getTime()
      )[0] as Date
    )
    .sort((left, right) => left.getTime() - right.getTime());
  const sameDayOfMonthCount = monthlyRepresentativeDates.filter((date) => Math.abs(date.getDate() - monthlyAnchorDay) <= 5).length;
  const monthGaps = monthlyRepresentativeDates.slice(1).map((date, index) => monthDiff(monthlyRepresentativeDates[index] as Date, date));
  const positiveMonthGaps = monthGaps.filter((gap) => gap > 0);
  const representativeIntervals = monthlyRepresentativeDates.slice(1).map((date, index) => daysBetween(monthlyRepresentativeDates[index] as Date, date));
  const representativeTypicalInterval = median(representativeIntervals);
  const looksMonthlyAcrossGaps =
    positiveMonthGaps.length > 0 &&
    sameDayOfMonthCount >= Math.min(2, monthlyRepresentativeDates.length) &&
    positiveMonthGaps.every((gap) => gap >= 1 && gap <= 2);
  const looksUtilityMonthlyAcrossMonths =
    Boolean(options?.allowUtilityMonthlyBias) &&
    monthlyRepresentativeDates.length >= 2 &&
    positiveMonthGaps.length === monthlyRepresentativeDates.length - 1 &&
    positiveMonthGaps.every((gap) => gap === 1) &&
    representativeTypicalInterval >= 10 &&
    representativeTypicalInterval <= 45;
  const looksAnnualAcrossGaps =
    positiveMonthGaps.length > 0 &&
    sameDayOfMonthCount >= Math.min(2, monthlyRepresentativeDates.length) &&
    positiveMonthGaps.every((gap) => gap >= 10 && gap <= 14);

  if (typicalInterval >= 6 && typicalInterval <= 8) {
    return { frequency: "weekly", nextExpectedDate: addDays(lastSeenDate, 7), cadenceConfidence: 84 };
  }

  if (
    (typicalInterval >= 25 && typicalInterval <= 35) ||
    (representativeTypicalInterval >= 25 && representativeTypicalInterval <= 35) ||
    looksMonthlyAcrossGaps ||
    looksUtilityMonthlyAcrossMonths
  ) {
    return {
      frequency: "monthly",
      nextExpectedDate: addMonths(lastSeenDate, 1),
      cadenceConfidence: looksMonthlyAcrossGaps ? 78 : looksUtilityMonthlyAcrossMonths ? 74 : 86,
    };
  }

  if (typicalInterval >= 12 && typicalInterval <= 16) {
    return { frequency: "biweekly", nextExpectedDate: addDays(lastSeenDate, 14), cadenceConfidence: 82 };
  }

  if (typicalInterval >= 80 && typicalInterval <= 100) {
    return { frequency: "quarterly", nextExpectedDate: addMonths(lastSeenDate, 3), cadenceConfidence: 78 };
  }

  if ((typicalInterval >= 300 && typicalInterval <= 430) || looksAnnualAcrossGaps) {
    return { frequency: "annual", nextExpectedDate: addMonths(lastSeenDate, 12), cadenceConfidence: looksAnnualAcrossGaps ? 80 : 72 };
  }

  return { frequency: null, nextExpectedDate: null, cadenceConfidence: 0 };
};

const buildPatternFromTransactions = (
  transactions: RecurringSourceTransaction[],
  scope: "account" | "workspace"
): DetectedRecurringPattern | null => {
  const candidateTransactions = transactions
    .filter((transaction) => isRecurringCandidateTransaction(transaction))
    .sort((left, right) => left.date.getTime() - right.date.getTime());
  if (candidateTransactions.length < 2) {
    return null;
  }

  const distinctMonthCount = new Set(candidateTransactions.map((transaction) => getMonthKey(transaction.date))).size;
  if (distinctMonthCount < 2) {
    return null;
  }
  const representativeTransactions =
    candidateTransactions.length > distinctMonthCount ? pickMonthlyRepresentativeTransactions(candidateTransactions) : candidateTransactions;

  const amounts = candidateTransactions.map((transaction) => toAmount(transaction.amount)).filter((amount) => amount > 0);
  const typicalAmount = median(amounts);
  if (typicalAmount <= 0) {
    return null;
  }

  const textBlob = candidateTransactions
    .map(
      (transaction) =>
        `${transaction.merchantClean ?? ""} ${transaction.merchantRaw} ${transaction.description ?? ""} ${transaction.category?.name ?? ""}`
    )
    .join(" ");
  const categoryNames = new Set(candidateTransactions.map((transaction) => transaction.category?.name?.toLowerCase() ?? ""));
  const hasKeywordSignal = recurringKeywordPattern.test(textBlob) || categoryNames.has("bills & utilities");
  const hasDirectObligationSignal =
    recurringRescuePattern.test(textBlob) ||
    recurringMerchantAliases.some((alias) => alias.pattern.test(textBlob)) ||
    Array.from(categoryNames).some((categoryName) => recurringStrongCategorySet.has(categoryName));
  const looksDiscretionary =
    recurringDiscretionaryMerchantPattern.test(textBlob) ||
    Array.from(categoryNames).some((categoryName) => recurringDiscretionaryCategorySet.has(categoryName));
  const amountTolerance = Math.max(20, typicalAmount * (hasKeywordSignal ? 0.28 : 0.18));
  const stableAmountCount = amounts.filter((amount) => Math.abs(amount - typicalAmount) <= amountTolerance).length;
  const amountStability = stableAmountCount / Math.max(amounts.length, 1);
  const preferredMerchantLabels = candidateTransactions.map((transaction) => selectPreferredRecurringLabel(transaction)).filter(Boolean);
  const normalizedMerchantTitles = candidateTransactions
    .map((transaction) => transaction.merchantClean?.trim() ?? "")
    .filter((value) => Boolean(value) && !recurringNoiseTitlePattern.test(value) && !recurringCanonicalNoisePattern.test(value));
  const normalizedMerchantTitle = Array.from(
    normalizedMerchantTitles.reduce((counts, value) => {
      counts.set(value, (counts.get(value) ?? 0) + 1);
      return counts;
    }, new Map<string, number>()).entries()
  ).sort((left, right) => right[1] - left[1])[0]?.[0];
  const canonicalTitle =
    normalizedMerchantTitle ||
    canonicalizeRecurringMerchant(
      preferredMerchantLabels
        .find((value) => Boolean(value && canonicalizeRecurringMerchant(value).length > 0)) ?? candidateTransactions[0]?.merchantRaw ?? ""
    ) ||
    normalizeRecurringMerchantKey(candidateTransactions[0]?.merchantRaw ?? "");
  if (!canonicalTitle) {
    return null;
  }
  if (recurringNoiseTitlePattern.test(canonicalTitle) || recurringCanonicalNoisePattern.test(canonicalTitle)) {
    return null;
  }
  const hasVariableAmountSignal =
    variableAmountRecurringPattern.test(textBlob) ||
    categoryNames.has("bills & utilities") ||
    categoryNames.has("insurance") ||
    categoryNames.has("loans");
  const looksTransferLike = recurringExclusionPattern.test(textBlob);
  const obligationType = classifyRecurringObligation({
    text: textBlob,
    categoryNames: Array.from(categoryNames).filter(Boolean),
  });
  const cadence = inferFrequency(representativeTransactions.map((transaction) => transaction.date), {
    allowUtilityMonthlyBias: ["utility", "statement_payment", "loan", "insurance"].includes(obligationType),
  });
  const dateDays = representativeTransactions.map((transaction) => transaction.date.getDate());
  const expectedDayOfMonth = cadence.frequency === "monthly" || cadence.frequency === "quarterly" || cadence.frequency === "annual"
    ? Math.round(median(dateDays))
    : null;
  const dayVariance =
    expectedDayOfMonth === null ? 0 : average(dateDays.map((day) => Math.abs(day - expectedDayOfMonth)));
  const hasMonthlyAnchorSignal =
    distinctMonthCount >= 2 &&
    expectedDayOfMonth !== null &&
    ["monthly", "quarterly", "annual"].includes(cadence.frequency ?? "") &&
    dayVariance <= 5.5;
  const allowsHighVarianceRecurringBill =
    hasKeywordSignal &&
    ["utility", "statement_payment", "loan", "insurance"].includes(obligationType) &&
    ["monthly", "quarterly", "annual"].includes(cadence.frequency ?? "") &&
    distinctMonthCount >= 2;

  if (!cadence.frequency || !cadence.nextExpectedDate) {
    return null;
  }

  // Timing and a similar amount are not enough for everyday merchants. Two-month
  // suggestions need an explicit subscription, bill, loan, utility, or known-biller signal.
  if (!hasDirectObligationSignal && (looksDiscretionary || distinctMonthCount < 3)) {
    return null;
  }

  if (looksTransferLike && !hasKeywordSignal) {
    return null;
  }

  if (!hasKeywordSignal && !["monthly", "quarterly", "annual"].includes(cadence.frequency)) {
    return null;
  }

  if (!hasKeywordSignal && amountStability < 0.85 && !hasMonthlyAnchorSignal) {
    return null;
  }

  if (!hasKeywordSignal && amountStability < 0.65 && candidateTransactions.length < 3 && distinctMonthCount < 3) {
    return null;
  }

  if (
    hasKeywordSignal &&
    hasVariableAmountSignal &&
    ["monthly", "quarterly", "annual"].includes(cadence.frequency) &&
    distinctMonthCount >= 2 &&
    (amountStability >= 0.35 || allowsHighVarianceRecurringBill)
  ) {
    // Variable utilities and similar bills often fluctuate because of usage or FX conversion.
  } else if (hasKeywordSignal && amountStability < 0.55 && candidateTransactions.length < 3 && !allowsHighVarianceRecurringBill) {
    return null;
  } else if (hasKeywordSignal && amountStability < 0.35) {
    return null;
  }

  const uniqueAccountKeys = new Set(
    candidateTransactions.map((transaction) =>
      [
        transaction.accountId ?? "",
        transaction.account?.institution ?? "",
        transaction.account?.name ?? "",
      ].join("::")
    )
  );
  const spansMultipleAccounts = uniqueAccountKeys.size > 1;
  if (scope === "workspace" && !spansMultipleAccounts) {
    return null;
  }

  const first = candidateTransactions[0] as RecurringSourceTransaction;
  const last = candidateTransactions[candidateTransactions.length - 1] as RecurringSourceTransaction;
  const nextExpectedDate = rollPatternDateForward(cadence.nextExpectedDate, cadence.frequency, expectedDayOfMonth);
  const reasonSummary = [
    cadence.frequency ? `${cadence.frequency} cadence` : null,
    expectedDayOfMonth !== null ? `around the ${ordinal(expectedDayOfMonth)}` : null,
    obligationType !== "general" ? `${obligationType.replace(/_/g, " ")} pattern` : null,
    hasKeywordSignal ? "merchant looks like a bill or subscription" : null,
    hasVariableAmountSignal && amountStability < 0.75 ? "amount changes like a utility or bill" : null,
    amountStability >= 0.9 ? "amount stays very consistent" : amountStability >= 0.75 ? "amount stays fairly close" : null,
    spansMultipleAccounts ? "seen across multiple accounts" : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const reasonTags = [
    cadence.frequency ? cadence.frequency : null,
    expectedDayOfMonth !== null ? "same date" : null,
    obligationType !== "general" ? obligationType.replace(/_/g, " ") : null,
    hasKeywordSignal ? "known merchant" : null,
    hasVariableAmountSignal && amountStability < 0.75 ? "variable amount" : null,
    amountStability >= 0.9 ? "stable amount" : amountStability >= 0.75 ? "close amount" : null,
    spansMultipleAccounts ? "cross-account" : null,
  ].filter((value): value is string => Boolean(value));
  const suppressionKey = makeRecurringSuppressionKey({
    accountId: scope === "workspace" ? null : first.accountId,
    currency: first.currency,
    title: canonicalTitle,
  });
  const familySuppressionKey = buildRecurringMerchantFamilySignature(canonicalTitle);
  const confidence = Math.min(
    96,
    Math.round(
      35 +
        Math.min(candidateTransactions.length, 6) * 7 +
        Math.min(distinctMonthCount, 4) * 3 +
        cadence.cadenceConfidence * 0.25 +
        amountStability * 20 +
        (expectedDayOfMonth !== null ? Math.max(0, 8 - Math.min(dayVariance, 8)) : 0) +
        (hasKeywordSignal ? 10 : 0) +
        (spansMultipleAccounts ? 6 : 0)
    )
  );

  if (confidence < 62) {
    return null;
  }

  return {
    workspaceId: first.workspaceId,
    accountId: scope === "workspace" && spansMultipleAccounts ? null : first.accountId,
    merchantRaw: first.merchantRaw,
    merchantClean: canonicalTitle,
    canonicalTitle,
    amount: Number(typicalAmount.toFixed(2)),
    minimumAmount: Number(Math.min(...amounts).toFixed(2)),
    maximumAmount: Number(Math.max(...amounts).toFixed(2)),
    currency: (first.currency ?? "PHP").trim().toUpperCase() || "PHP",
    frequency: cadence.frequency,
    firstSeenDate: first.date,
    lastSeenDate: last.date,
    nextExpectedDate,
    expectedDayOfMonth,
    transactionCount: candidateTransactions.length,
    confidence,
    reasonSummary,
    reasonTags,
    suppressionKey,
    account: last.account ?? null,
    importFile: last.importFile ?? null,
    rawPayload: {
      source: "recurring_detection",
      scope,
      transactionIds: candidateTransactions.map((transaction) => transaction.id),
      amountStability,
      distinctMonthCount,
      hasKeywordSignal,
      hasDirectObligationSignal,
      looksDiscretionary,
      hasVariableAmountSignal,
      looksTransferLike,
      canonicalTitle,
      accountCount: uniqueAccountKeys.size,
      obligationType,
      minimumAmount: Number(Math.min(...amounts).toFixed(2)),
      maximumAmount: Number(Math.max(...amounts).toFixed(2)),
      expectedDayOfMonth,
      dayVariance: Number(dayVariance.toFixed(2)),
      reasonSummary,
      reasonTags,
      suppressionKey,
      familySuppressionKey,
    },
  };
};

export const detectRecurringPatterns = (transactions: RecurringSourceTransaction[]) => {
  const accountGroups = new Map<string, RecurringSourceTransaction[]>();
  const workspaceGroups = new Map<string, RecurringSourceTransaction[]>();

  for (const transaction of transactions) {
    if (!isRecurringCandidateTransaction(transaction)) {
      continue;
    }

    const preferredMerchantLabel = selectPreferredRecurringLabel(transaction);
    const merchantKey = buildRecurringGroupingKey(preferredMerchantLabel);
    if (!merchantKey) {
      continue;
    }

    const currency = (transaction.currency ?? "PHP").trim().toUpperCase() || "PHP";
    const accountKey = `${transaction.workspaceId}::${transaction.accountId ?? "workspace"}::${currency}::${merchantKey}`;
    const workspaceKey = `${transaction.workspaceId}::workspace::${currency}::${merchantKey}`;
    accountGroups.set(accountKey, [...(accountGroups.get(accountKey) ?? []), transaction]);
    workspaceGroups.set(workspaceKey, [...(workspaceGroups.get(workspaceKey) ?? []), transaction]);
  }

  const patterns = [
    ...Array.from(accountGroups.values()).map((group) => buildPatternFromTransactions(group, "account")),
    ...Array.from(workspaceGroups.values()).map((group) => buildPatternFromTransactions(group, "workspace")),
  ].filter((pattern): pattern is DetectedRecurringPattern => Boolean(pattern));

  const dedupedPatterns = new Map<string, DetectedRecurringPattern>();
  for (const pattern of patterns) {
    const key = [pattern.currency, normalizeRecurringMerchantKey(pattern.canonicalTitle)].join("::");
    const existing = dedupedPatterns.get(key);
    if (
      !existing ||
      pattern.confidence > existing.confidence ||
      pattern.transactionCount > existing.transactionCount ||
      (pattern.accountId === null && existing.accountId !== null)
    ) {
      dedupedPatterns.set(key, pattern);
    }
  }

  return Array.from(dedupedPatterns.values())
    .filter((pattern): pattern is DetectedRecurringPattern => Boolean(pattern))
    .sort((left, right) => right.confidence - left.confidence || right.transactionCount - left.transactionCount);
};

const buildRecurringDedupKey = (transaction: RecurringSourceTransaction) =>
  [
    transaction.workspaceId,
    transaction.accountId ?? transaction.account?.name ?? "workspace",
    (transaction.currency ?? "PHP").trim().toUpperCase() || "PHP",
    transaction.date.toISOString().slice(0, 10),
    normalizeRecurringMerchantKey(transaction.merchantClean ?? transaction.merchantRaw),
    toAmount(transaction.amount).toFixed(2),
  ].join("::");

export const getRecurringSourceTransactions = async (workspaceId: string): Promise<RecurringSourceTransaction[]> => {
  const hasTransactionTable = await hasCompatibleTable("Transaction");
  const hasParsedTransactionTable = await hasCompatibleTable("ParsedTransaction");

  const [transactions, parsedTransactions] = await Promise.all([
    hasTransactionTable
      ? prisma.transaction.findMany({
          where: {
            workspaceId,
            deletedAt: null,
            isExcluded: false,
            date: {
              gte: new Date(Date.now() - 400 * 24 * 60 * 60 * 1000),
            },
          },
          select: {
            id: true,
            workspaceId: true,
            accountId: true,
            date: true,
            amount: true,
            currency: true,
            type: true,
            merchantRaw: true,
            merchantClean: true,
            description: true,
            category: {
              select: {
                name: true,
              },
            },
            account: {
              select: {
                id: true,
                name: true,
                institution: true,
              },
            },
            importFile: {
              select: {
                fileName: true,
              },
            },
          },
          orderBy: [{ date: "asc" }, { merchantClean: "asc" }, { merchantRaw: "asc" }],
          take: 1200,
        })
      : Promise.resolve([]),
    hasParsedTransactionTable
      ? prisma.parsedTransaction.findMany({
          where: {
            workspaceId,
            date: {
              gte: new Date(Date.now() - 400 * 24 * 60 * 60 * 1000),
            },
          },
          select: {
            id: true,
            workspaceId: true,
            date: true,
            amount: true,
            currency: true,
            merchantRaw: true,
            merchantClean: true,
            categoryName: true,
            accountName: true,
            institution: true,
            importFile: {
              select: {
                fileName: true,
              },
            },
          },
          orderBy: [{ date: "asc" }, { merchantClean: "asc" }, { merchantRaw: "asc" }],
          take: 1200,
        })
      : Promise.resolve([]),
  ]);

  const normalizedTransactions: RecurringSourceTransaction[] = transactions.map((transaction) => ({
    id: transaction.id,
    workspaceId: transaction.workspaceId,
    accountId: transaction.accountId,
    date: transaction.date,
    amount: transaction.amount,
    currency: transaction.currency,
    type: transaction.type,
    merchantRaw: transaction.merchantRaw,
    merchantClean: transaction.merchantClean,
    description: transaction.description,
    category: transaction.category ?? null,
    account: transaction.account ?? null,
    importFile: transaction.importFile ?? null,
  }));

  const normalizedParsedTransactions: RecurringSourceTransaction[] = parsedTransactions.flatMap((transaction) => {
    if (!transaction.date || !transaction.merchantRaw || transaction.amount === null) {
      return [];
    }

    return [
      {
        id: `parsed:${transaction.id}`,
        workspaceId: transaction.workspaceId,
        accountId: null,
        date: transaction.date,
        amount: transaction.amount,
        currency: transaction.currency,
        type: "expense" as const,
        merchantRaw: transaction.merchantRaw,
        merchantClean: transaction.merchantClean,
        description: transaction.merchantRaw,
        category: transaction.categoryName ? { name: transaction.categoryName } : null,
        account: {
          id: null,
          name: transaction.accountName ?? null,
          institution: transaction.institution ?? null,
        },
        importFile: transaction.importFile ?? null,
      },
    ];
  });

  const combined: RecurringSourceTransaction[] = [...normalizedTransactions, ...normalizedParsedTransactions];

  const deduped = new Map<string, RecurringSourceTransaction>();
  for (const transaction of combined) {
    if (!isRecurringCandidateTransaction(transaction)) {
      continue;
    }

    const key = buildRecurringDedupKey(transaction);
    if (!deduped.has(key)) {
      deduped.set(key, transaction);
    }
  }

  return Array.from(deduped.values()).sort(
    (left, right) => left.date.getTime() - right.date.getTime() || left.merchantRaw.localeCompare(right.merchantRaw)
  );
};

export const syncWorkspaceRecurringPatterns = async (workspaceId: string) => {
  if (!(await hasCompatibleTable("RecurringPattern"))) {
    return [];
  }

  const transactions = await getRecurringSourceTransactions(workspaceId);
  const detectedPatterns = detectRecurringPatterns(transactions);
  const existingCommitments = await prisma.financialCommitment.findMany({
    where: { workspaceId, status: { not: "resolved" } },
    select: { title: true, counterparty: true, accountId: true, currency: true },
  });
  const existingCommitmentKeys = new Set(
    existingCommitments.map((commitment) =>
      [
        commitment.accountId ?? "workspace",
        (commitment.currency ?? "PHP").toUpperCase(),
        normalizeRecurringMerchantKey(commitment.counterparty ?? commitment.title),
      ].join("::")
    )
  );
  const existingCommitmentFamilies = new Map<
    string,
    {
      canonicalTitle: string;
      accountId: string | null;
      currency: string;
    }
  >();
  for (const commitment of existingCommitments) {
    const title = (commitment.counterparty ?? commitment.title ?? "").trim();
    if (!title) {
      continue;
    }

    const familyKey = [
      commitment.accountId ?? "workspace",
      (commitment.currency ?? "PHP").toUpperCase(),
      buildRecurringMerchantFamilySignature(title),
    ].join("::");
    if (!familyKey.endsWith("::")) {
      existingCommitmentFamilies.set(familyKey, {
        canonicalTitle: title,
        accountId: commitment.accountId ?? null,
        currency: (commitment.currency ?? "PHP").toUpperCase(),
      });
    }
  }
  const dismissedPatterns = await prisma.recurringPattern.findMany({
    where: {
      workspaceId,
      rawPayload: {
        path: ["dismissed"],
        equals: true,
      },
    },
    select: {
      accountId: true,
      currency: true,
      merchantClean: true,
      merchantRaw: true,
      rawPayload: true,
    },
  });
  const dismissedSuppressionKeys = new Set(
    dismissedPatterns.map((pattern) => {
      const payload =
        pattern.rawPayload && typeof pattern.rawPayload === "object" && !Array.isArray(pattern.rawPayload)
          ? (pattern.rawPayload as Record<string, unknown>)
          : null;
      return typeof payload?.suppressionKey === "string"
        ? payload.suppressionKey
        : makeRecurringSuppressionKey({
            accountId: pattern.accountId,
            currency: pattern.currency,
            title: pattern.merchantClean ?? pattern.merchantRaw,
          });
    })
  );
  const dismissedFamilyKeys = new Set(
    dismissedPatterns
      .map((pattern) => {
        const payload =
          pattern.rawPayload && typeof pattern.rawPayload === "object" && !Array.isArray(pattern.rawPayload)
            ? (pattern.rawPayload as Record<string, unknown>)
            : null;
        if (typeof payload?.familySuppressionKey === "string" && payload.familySuppressionKey.trim()) {
          return payload.familySuppressionKey.trim();
        }
        return buildRecurringMerchantFamilySignature(pattern.merchantClean ?? pattern.merchantRaw ?? "");
      })
      .filter(Boolean)
  );

  const patterns = detectedPatterns
    .map((pattern) => {
      const familyKey = [
        pattern.accountId ?? "workspace",
        pattern.currency,
        buildRecurringMerchantFamilySignature(pattern.canonicalTitle),
      ].join("::");
      const matchedCommitmentFamily = existingCommitmentFamilies.get(familyKey);
      if (!matchedCommitmentFamily) {
        return pattern;
      }

      const boostedConfidence = Math.min(99, Math.max(pattern.confidence, 90));
      return {
        ...pattern,
        merchantClean: matchedCommitmentFamily.canonicalTitle,
        canonicalTitle: matchedCommitmentFamily.canonicalTitle,
        confidence: boostedConfidence,
        reasonSummary: `${pattern.reasonSummary} · matched confirmed commitment family`,
        reasonTags: [...new Set([...pattern.reasonTags, "confirmed family"])],
        rawPayload: {
          ...(pattern.rawPayload && typeof pattern.rawPayload === "object" && !Array.isArray(pattern.rawPayload)
            ? (pattern.rawPayload as Record<string, unknown>)
            : {}),
          matchedCommitmentFamily: matchedCommitmentFamily.canonicalTitle,
          confidenceBoostReason: "confirmed_commitment_family",
        },
      };
    })
    .filter((pattern) => {
    const key = [pattern.accountId ?? "workspace", pattern.currency, normalizeRecurringMerchantKey(pattern.canonicalTitle)].join("::");
    const familyKey = [pattern.accountId ?? "workspace", pattern.currency, buildRecurringMerchantFamilySignature(pattern.canonicalTitle)].join("::");
    return (
      !existingCommitmentKeys.has(key) &&
      !existingCommitmentFamilies.has(familyKey) &&
      !dismissedSuppressionKeys.has(pattern.suppressionKey) &&
      !dismissedFamilyKeys.has(buildRecurringMerchantFamilySignature(pattern.canonicalTitle))
    );
    });

  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw<Array<{ locked: string }>>`
      SELECT pg_advisory_xact_lock(hashtextextended(${`recurring-pattern-sync:${workspaceId}`}, 0))::text AS locked
    `;

    const existingPatterns = await tx.recurringPattern.findMany({
      where: { workspaceId },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        accountId: true,
        currency: true,
        merchantClean: true,
        merchantRaw: true,
        rawPayload: true,
      },
    });

    const seenActivePatternFamilies = new Set<string>();
    const duplicatePatternIds = existingPatterns.flatMap((pattern) => {
      if (isDismissedRecurringPattern(pattern.rawPayload)) {
        return [];
      }

      const familyKey = [
        (pattern.currency ?? "PHP").trim().toUpperCase() || "PHP",
        buildRecurringMerchantFamilySignature(pattern.merchantClean ?? pattern.merchantRaw ?? ""),
      ].join("::");
      if (!familyKey.endsWith("::") && seenActivePatternFamilies.has(familyKey)) {
        return [pattern.id];
      }
      seenActivePatternFamilies.add(familyKey);
      return [];
    });

    const activeSuppressionKeys = new Set(patterns.map((pattern) => pattern.suppressionKey));
    const activeFamilyKeys = new Set(
      patterns.map((pattern) => [pattern.accountId ?? "workspace", pattern.currency, buildRecurringMerchantFamilySignature(pattern.canonicalTitle)].join("::"))
    );
    const stalePatternIds = existingPatterns
      .filter((pattern) => {
        if (isDismissedRecurringPattern(pattern.rawPayload)) {
          return false;
        }

        const payload =
          pattern.rawPayload && typeof pattern.rawPayload === "object" && !Array.isArray(pattern.rawPayload)
            ? (pattern.rawPayload as Record<string, unknown>)
            : null;
        const suppressionKey =
          typeof payload?.suppressionKey === "string"
            ? payload.suppressionKey
            : makeRecurringSuppressionKey({
                accountId: pattern.accountId,
                currency: pattern.currency,
                title: pattern.merchantClean ?? pattern.merchantRaw,
              });
        const familyKey = [
          pattern.accountId ?? "workspace",
          pattern.currency,
          buildRecurringMerchantFamilySignature(pattern.merchantClean ?? pattern.merchantRaw ?? ""),
        ].join("::");

        return !activeSuppressionKeys.has(suppressionKey) && !activeFamilyKeys.has(familyKey);
      })
      .map((pattern) => pattern.id);

    const patternIdsToDelete = [...new Set([...stalePatternIds, ...duplicatePatternIds])];
    if (patternIdsToDelete.length > 0) {
      await tx.recurringPattern.deleteMany({
        where: {
          id: {
            in: patternIdsToDelete,
          },
        },
      });
    }

    for (const pattern of patterns) {
      const existingPattern = await tx.recurringPattern.findFirst({
        where: {
          workspaceId,
          accountId: pattern.accountId,
          currency: pattern.currency,
          OR: [
            { merchantClean: pattern.merchantClean },
            { merchantRaw: pattern.merchantRaw },
          ],
        },
        orderBy: { updatedAt: "desc" },
      });

      if (existingPattern) {
        if (isDismissedRecurringPattern(existingPattern.rawPayload)) {
          continue;
        }

        await tx.recurringPattern.update({
          where: { id: existingPattern.id },
          data: {
            merchantRaw: pattern.merchantRaw,
            merchantClean: pattern.canonicalTitle,
            amount: pattern.amount,
            frequency: pattern.frequency,
            firstSeenDate: pattern.firstSeenDate,
            lastSeenDate: pattern.lastSeenDate,
            nextExpectedDate: pattern.nextExpectedDate,
            transactionCount: pattern.transactionCount,
            confidence: pattern.confidence,
            rawPayload: pattern.rawPayload,
          },
        });
      } else {
        await tx.recurringPattern.create({
          data: {
            workspaceId: pattern.workspaceId,
            accountId: pattern.accountId,
            merchantRaw: pattern.merchantRaw,
            merchantClean: pattern.canonicalTitle,
            amount: pattern.amount,
            currency: pattern.currency,
            frequency: pattern.frequency,
            firstSeenDate: pattern.firstSeenDate,
            lastSeenDate: pattern.lastSeenDate,
            nextExpectedDate: pattern.nextExpectedDate,
            transactionCount: pattern.transactionCount,
            confidence: pattern.confidence,
            rawPayload: pattern.rawPayload,
          },
        });
      }
    }
  });

  return patterns;
};
