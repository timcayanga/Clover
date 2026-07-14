import { type CommitmentRecurrence, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { hasCompatibleTable } from "@/lib/data-engine";
import { getUpcomingStatementReminders, type StatementReminder } from "@/lib/statement-reminders";
import {
  buildRecurringMerchantFamilySignature,
  classifyRecurringObligation,
  detectRecurringPatterns,
  getRecurringSourceTransactions,
  makeRecurringSuppressionKey,
} from "@/lib/recurring-detection";

type PlannedPaymentTransactionLike = {
  id: string;
  workspaceId: string;
  accountId: string | null;
  date: Date;
  amount: unknown;
  currency: string | null;
  type: "income" | "expense" | "transfer";
  merchantRaw: string;
  merchantClean: string | null;
  description: string | null;
  rawPayload: Prisma.JsonValue;
  importFileId: string | null;
  account: {
    id: string;
    name: string;
    institution: string | null;
  };
};

export type PlannedPaymentSuggestion = {
  id: string;
  sourceKind: "statement_reminder" | "installment" | "recurring_transaction";
  title: string;
  counterparty: string | null;
  amount: string | null;
  currency: string;
  dueDate: string | null;
  recurrence: CommitmentRecurrence;
  accountId: string | null;
  accountName: string | null;
  statementCheckpointId: string | null;
  installmentTerms: string | null;
  notes: string | null;
  sourceLabel: string;
  sourceDetail: string | null;
  reasonSummary: string | null;
  reasonTags: string[];
  confidenceTier: "high" | "medium" | "low";
  confidence: number;
  sourceFileName: string | null;
};

type ConfirmedRecurringMemory = {
  normalizedKey: string;
  familyKey: string;
  recurrence: CommitmentRecurrence;
  nextDueDate: Date | null;
  dueDate: Date | null;
  accountId: string | null;
  currency: string;
};

const DAY_IN_MS = 24 * 60 * 60 * 1000;
const INSTALLMENT_SIGNAL =
  /\b(installment|amortization|credit-?to-?cash|balance conversion|balance summary|sip balance|sip|paylite|easy\s*installment|easy\s*pay)\b|\b\d{1,2}\s*(?:\/|of)\s*\d{1,2}\s*(?:installments?|payments?)\b/i;
const GENERIC_RECURRING_TITLE_PATTERN =
  /^(payment|repayment|subscription|service|bill|utilities|loan payment|statement payment|installment|dues|fee)$/i;
const POTENTIAL_RECURRING_SIGNAL =
  /\b(subscription|subscr(?:iption)?|monthly|annual|membership|premium|dues|rent|lease|internet|broadband|wifi|phone|mobile\s+plan|electric|water|utility|utilities|insurance|mortgage|loan|repayment|amortization|tuition|school\s+fee|gym|fitness|netflix|spotify|youtube|icloud|google|notion|openai|chatgpt|adobe|microsoft|canva|scribd|linkedin|globe|smart|pldt|meralco|maynilad|prime|apple\s+services?|figma|zoom|dropbox|airalo|slack|autosweep|easytrip|beep\s+card|parking\s+subscription)\b/i;
const POTENTIAL_RECURRING_LOOKBACK_DAYS = 400;

const normalizeWhitespace = (value: string) => value.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
const ordinalDay = (value: number) =>
  `${value}${value % 10 === 1 && value % 100 !== 11 ? "st" : value % 10 === 2 && value % 100 !== 12 ? "nd" : value % 10 === 3 && value % 100 !== 13 ? "rd" : "th"}`;

const normalizeKey = (value: string | null | undefined) =>
  normalizeWhitespace(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const parseAmount = (value: unknown) => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? Math.abs(parsed) : 0;
};

const countDistinctMonths = (dates: Date[]) =>
  new Set(dates.map((date) => `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`)).size;

const getMonthIndex = (date: Date) => date.getUTCFullYear() * 12 + date.getUTCMonth();

const getMedianNumber = (values: number[]) => {
  const sorted = [...values].sort((left, right) => left - right);
  if (sorted.length === 0) {
    return 0;
  }

  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2 : sorted[middle] ?? 0;
};

export const getRecurringConfidenceTier = (confidence: number): "high" | "medium" | "low" => {
  if (confidence >= 85) {
    return "high";
  }
  if (confidence >= 70) {
    return "medium";
  }
  return "low";
};

const formatAmountRange = (minimumAmount: number | null, maximumAmount: number | null, currency: string) => {
  if (minimumAmount === null || maximumAmount === null) {
    return null;
  }

  const formatter = new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: currency || "PHP",
    minimumFractionDigits: 2,
  });

  if (Math.abs(minimumAmount - maximumAmount) < 0.01) {
    return formatter.format(minimumAmount);
  }

  return `${formatter.format(minimumAmount)} to ${formatter.format(maximumAmount)}`;
};

const addMonths = (date: Date, months: number) => {
  const next = new Date(date);
  const day = next.getDate();
  next.setMonth(next.getMonth() + months, 1);
  const lastDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
  next.setDate(Math.min(day, lastDay));
  return next;
};

const absoluteDayDistance = (left: Date, right: Date) => Math.round(Math.abs(right.getTime() - left.getTime()) / DAY_IN_MS);

const selectRememberedDueDate = (patternDueDate: Date, memory: ConfirmedRecurringMemory | null) => {
  if (!memory) {
    return patternDueDate;
  }

  const candidates = [memory.nextDueDate, memory.dueDate].filter((value): value is Date => Boolean(value));
  for (const candidate of candidates) {
    if (candidate.getTime() > Date.now() - DAY_IN_MS && absoluteDayDistance(candidate, patternDueDate) <= 45) {
      return candidate;
    }
  }

  return patternDueDate;
};

const getReminderKey = (reminder: StatementReminder) =>
  normalizeKey([reminder.accountName, reminder.institution ?? ""].filter(Boolean).join(" "));

const getTransactionText = (transaction: PlannedPaymentTransactionLike) =>
  [
    transaction.merchantClean ?? "",
    transaction.merchantRaw ?? "",
    transaction.description ?? "",
    typeof transaction.rawPayload === "object" && transaction.rawPayload !== null && !Array.isArray(transaction.rawPayload)
      ? [
          (transaction.rawPayload as Record<string, unknown>).description,
          (transaction.rawPayload as Record<string, unknown>).line,
          (transaction.rawPayload as Record<string, unknown>).memo,
        ]
          .filter((value): value is string => typeof value === "string")
          .join(" ")
      : "",
  ]
    .filter(Boolean)
    .join(" ");

const extractInstallmentTerms = (text: string) => {
  const normalized = text.replace(/\s+/g, " ");
  const explicitMatch = normalized.match(/\b(?:of|\/)\s*(\d{1,3})\s*(?:months?|payments?|installments?)\b/i);
  if (explicitMatch?.[1]) {
    return Number(explicitMatch[1]);
  }

  const compactMatch = normalized.match(/\b(\d{1,3})\s*\/\s*(\d{1,3})\s*(?:installments?|payments?)\b/i);
  if (compactMatch?.[2]) {
    return Number(compactMatch[2]);
  }

  const xOfYMatch = normalized.match(/\b(\d{1,3})\s*of\s*(\d{1,3})\s*(?:installments?|payments?)\b/i);
  if (xOfYMatch?.[2]) {
    return Number(xOfYMatch[2]);
  }

  return null;
};

const readTransactionImportFileName = (transaction: unknown) => {
  const rawPayload = transaction && typeof transaction === "object" && !Array.isArray(transaction)
    ? (transaction as Record<string, unknown>).rawPayload
    : null;
  if (!rawPayload || typeof rawPayload !== "object" || Array.isArray(rawPayload)) {
    return null;
  }

  const fileName = (rawPayload as Record<string, unknown>).sourceFileName;
  return typeof fileName === "string" && fileName.trim() ? fileName.trim() : null;
};

const readPatternMetric = (payload: unknown, key: string) => {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }

  const value = (payload as Record<string, unknown>)[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
};

const describeRecurringSuggestionType = (title: string, reasonTags: string[]) => {
  const obligationType = classifyRecurringObligation({
    text: [title, ...reasonTags].join(" "),
    categoryNames: reasonTags,
  });

  switch (obligationType) {
    case "subscription":
      return { sourceLabel: "Subscription candidate", tag: "subscription" };
    case "utility":
      return { sourceLabel: "Bill candidate", tag: "utility" };
    case "loan":
      return { sourceLabel: "Loan payment candidate", tag: "loan" };
    case "insurance":
      return { sourceLabel: "Insurance candidate", tag: "insurance" };
    case "rent":
      return { sourceLabel: "Rent candidate", tag: "rent" };
    case "statement_payment":
      return { sourceLabel: "Statement payment candidate", tag: "statement payment" };
    default:
      return { sourceLabel: "Recurring transaction", tag: null };
  }
};

const buildReminderSuggestions = (reminders: StatementReminder[], existingCheckpointIds: Set<string>) => {
  const suggestions: PlannedPaymentSuggestion[] = [];

  for (const reminder of reminders) {
    const dueDate = new Date(reminder.paymentDueDate);
    if (existingCheckpointIds.has(reminder.checkpointId)) {
      continue;
    }
    const key = `statement_reminder::${reminder.checkpointId}`;
    const dueDayLabel =
      reminder.dueDayOfMonth === null
        ? null
        : `Usually around the ${ordinalDay(reminder.dueDayOfMonth)}`;
    const sourceLabel =
      reminder.detectionSource === "projected"
        ? "Projected statement due date"
        : reminder.detectionSource === "inferred_history"
          ? "Inferred statement due date"
          : "Statement due date";
    const reasonSummary =
      reminder.detectionSource === "projected"
        ? "Projected from past uploaded statements and your usual monthly due date."
        : reminder.detectionSource === "inferred_history"
          ? "Inferred from your statement history and due-date timing."
          : "Detected directly from an uploaded statement due date.";

    suggestions.push({
      id: key,
      sourceKind: "statement_reminder",
      title: `${reminder.accountName} payment`,
      counterparty: reminder.accountName,
      amount: reminder.totalAmountDue.toFixed(2),
      currency: (reminder.currency ?? "PHP").trim().toUpperCase() || "PHP",
      dueDate: dueDate.toISOString(),
      recurrence: "monthly",
      accountId: reminder.accountId,
      accountName: reminder.accountName,
      statementCheckpointId: reminder.checkpointId,
      installmentTerms: null,
      notes:
        reminder.statementStartDate || reminder.statementEndDate
          ? `Statement ${reminder.statementStartDate ?? "start"} to ${reminder.statementEndDate ?? "end"}; due from ${reminder.sourceFileName ?? "uploaded statement"}.`
          : `Due from ${reminder.sourceFileName ?? "uploaded statement"}.`,
      sourceLabel,
      sourceDetail: [
        `Due ${new Intl.DateTimeFormat("en-PH", { month: "short", day: "2-digit", year: "numeric" }).format(dueDate)}`,
        dueDayLabel,
      ]
        .filter(Boolean)
        .join(" · "),
      reasonSummary,
      reasonTags: [
        "statement due date",
        "uploaded file",
        ...(reminder.detectionSource === "projected" ? ["projected"] : reminder.detectionSource === "inferred_history" ? ["history inferred"] : []),
      ],
      confidenceTier: getRecurringConfidenceTier(reminder.detectionSource === "explicit" ? 92 : reminder.detectionSource === "projected" ? 88 : 84),
      confidence: reminder.detectionSource === "explicit" ? 92 : reminder.detectionSource === "projected" ? 88 : 84,
      sourceFileName: reminder.sourceFileName,
    });

  }

  return suggestions;
};

const buildInstallmentSuggestions = (
  transactions: PlannedPaymentTransactionLike[],
  reminders: StatementReminder[],
  existingCommitmentKeys: Set<string>
) => {
  const reminderByAccountId = new Map<string, StatementReminder>();
  const reminderByAccountKey = new Map<string, StatementReminder>();

  for (const reminder of reminders) {
    if (reminder.accountId) {
      reminderByAccountId.set(reminder.accountId, reminder);
    }
    reminderByAccountKey.set(getReminderKey(reminder), reminder);
  }

  const grouped = new Map<string, PlannedPaymentTransactionLike[]>();

  for (const transaction of transactions) {
    if (transaction.type !== "expense") {
      continue;
    }

    const text = getTransactionText(transaction);
    if (!INSTALLMENT_SIGNAL.test(text)) {
      continue;
    }

    const merchantLabel = transaction.merchantClean ?? transaction.merchantRaw ?? transaction.description ?? "installment";
    const merchantKey = buildRecurringMerchantFamilySignature(merchantLabel) || normalizeKey(merchantLabel);
    if (!merchantKey) {
      continue;
    }

    const groupKey = [transaction.accountId ?? transaction.account.name, transaction.currency ?? "PHP", merchantKey].join("::");
    grouped.set(groupKey, [...(grouped.get(groupKey) ?? []), transaction]);
  }

  const suggestions: PlannedPaymentSuggestion[] = [];

  for (const [groupKey, group] of grouped.entries()) {
    if (group.length === 0) {
      continue;
    }

    const first = group[0] as PlannedPaymentTransactionLike;
    const last = group[group.length - 1] as PlannedPaymentTransactionLike;
    const distinctMonthCount = countDistinctMonths(group.map((transaction) => transaction.date));
    const title = (first.merchantClean ?? first.merchantRaw ?? first.description ?? "Installment").trim();
    const amount = group.reduce((sum, transaction) => sum + parseAmount(transaction.amount), 0) / group.length;
    const reminder =
      (first.accountId ? reminderByAccountId.get(first.accountId) : null) ??
      reminderByAccountKey.get(normalizeKey([first.account.name, first.account.institution ?? ""].filter(Boolean).join(" "))) ??
      null;
    const dueDate = reminder ? new Date(reminder.paymentDueDate) : addMonths(last.date, 1);
    const installmentTerms = extractInstallmentTerms(getTransactionText(first));
    const hasStrongInstallmentSignal = Boolean(installmentTerms) || group.some((transaction) => /\b\d{1,2}\s*(?:\/|of)\s*\d{1,2}\b/i.test(getTransactionText(transaction)));
    const key = `installment::${groupKey}`;

    if (existingCommitmentKeys.has(key) || (!hasStrongInstallmentSignal && distinctMonthCount < 2)) {
      continue;
    }

    const currentInstallmentMatch = getTransactionText(last).match(/\b(\d{1,2})\s*(?:\/|of)\s*(\d{1,2})\s*(?:installments?|payments?)\b/i);
    const currentInstallmentNumber =
      currentInstallmentMatch?.[1] && Number.isFinite(Number(currentInstallmentMatch[1])) ? Number(currentInstallmentMatch[1]) : null;
    const resolvedInstallmentTerms =
      installmentTerms ??
      (currentInstallmentMatch?.[2] && Number.isFinite(Number(currentInstallmentMatch[2])) ? Number(currentInstallmentMatch[2]) : null);
    const remainingInstallments =
      resolvedInstallmentTerms && currentInstallmentNumber ? Math.max(resolvedInstallmentTerms - currentInstallmentNumber, 0) : null;
    const confidence = Math.min(
      95,
      62 +
        Math.min(group.length, 4) * 7 +
        Math.min(distinctMonthCount, 3) * 5 +
        (resolvedInstallmentTerms ? 10 : 0) +
        (reminder ? 4 : 0)
    );

    suggestions.push({
      id: key,
      sourceKind: "installment",
      title,
      counterparty: title,
      amount: amount > 0 ? amount.toFixed(2) : null,
      currency: (first.currency ?? "PHP").trim().toUpperCase() || "PHP",
      dueDate: dueDate.toISOString(),
      recurrence: "monthly",
      accountId: first.accountId,
      accountName: first.account.name,
      statementCheckpointId: reminder?.checkpointId ?? null,
      installmentTerms: resolvedInstallmentTerms ? `${resolvedInstallmentTerms} month${resolvedInstallmentTerms === 1 ? "" : "s"}` : null,
      notes: [
        `Detected from ${group.length} installment transaction${group.length === 1 ? "" : "s"} across ${distinctMonthCount} month${distinctMonthCount === 1 ? "" : "s"}.`,
        currentInstallmentNumber && resolvedInstallmentTerms
          ? `Looks like payment ${currentInstallmentNumber} of ${resolvedInstallmentTerms}${remainingInstallments !== null ? ` with ${remainingInstallments} remaining` : ""}.`
          : null,
        reminder?.sourceFileName ? `Linked to ${reminder.sourceFileName}.` : null,
      ]
        .filter(Boolean)
        .join(" "),
      sourceLabel: "Installment detected",
      sourceDetail: reminder
        ? `Due ${new Intl.DateTimeFormat("en-PH", { month: "short", day: "2-digit", year: "numeric" }).format(dueDate)}`
        : `Last seen ${new Intl.DateTimeFormat("en-PH", { month: "short", day: "2-digit", year: "numeric" }).format(last.date)}`,
      reasonSummary: resolvedInstallmentTerms
        ? `Installment terms suggest ${resolvedInstallmentTerms} payments and Clover found matching charges across multiple months.`
        : "Repeated installment-style charges were detected across recent statements.",
      reasonTags: resolvedInstallmentTerms ? ["installment terms", "repeated charge", "multi-month"] : ["installment signal", "repeated charge", "multi-month"],
      confidenceTier: getRecurringConfidenceTier(confidence),
      confidence,
      sourceFileName: readTransactionImportFileName(first),
    });
  }

  return suggestions;
};

const buildRecurringTransactionSuggestions = (
  transactions: Awaited<ReturnType<typeof getRecurringSourceTransactions>>,
  existingCommitmentKeys: Set<string>,
  dismissedSuppressionKeys: Set<string>,
  dismissedFamilyKeys: Set<string>,
  confirmedRecurringMemoryByTitle: Map<string, ConfirmedRecurringMemory[]>,
  confirmedRecurringMemoryByFamily: Map<string, ConfirmedRecurringMemory[]>
) => {
  const suggestions: PlannedPaymentSuggestion[] = [];
  const patterns = detectRecurringPatterns(transactions).filter((pattern) => pattern.transactionCount >= 2);
  const detectedFamilyKeys = new Set<string>();

  for (const pattern of patterns) {
    const title = (pattern.canonicalTitle || pattern.merchantClean || pattern.merchantRaw).trim();
    if (!title || GENERIC_RECURRING_TITLE_PATTERN.test(title)) {
      continue;
    }
    const key = `recurring_transaction::${[
      pattern.accountId ?? "workspace",
      pattern.currency,
      normalizeKey(title),
    ].join("::")}`;
    const familyKey = buildRecurringMerchantFamilySignature(title);
    detectedFamilyKeys.add(`${pattern.accountId ?? "workspace"}::${pattern.currency}::${familyKey}`);
    if (
      existingCommitmentKeys.has(key) ||
      dismissedSuppressionKeys.has(pattern.suppressionKey) ||
      dismissedFamilyKeys.has(familyKey)
    ) {
      continue;
    }

    const amountRange = formatAmountRange(pattern.minimumAmount ?? null, pattern.maximumAmount ?? null, pattern.currency);
    const scheduleDetail =
      pattern.expectedDayOfMonth && ["monthly", "quarterly", "annual"].includes(pattern.frequency)
        ? `${pattern.frequency} around the ${ordinalDay(pattern.expectedDayOfMonth)}`
        : pattern.frequency;
    const normalizedTitle = normalizeKey(title);
    const confirmedMatches = [
      ...(confirmedRecurringMemoryByTitle.get(normalizedTitle) ?? []),
      ...(confirmedRecurringMemoryByFamily.get(familyKey) ?? []),
    ];
    const confirmedMatch =
      confirmedMatches.find(
        (memory) =>
          memory.currency === pattern.currency &&
          (memory.accountId === null || pattern.accountId === null || memory.accountId === pattern.accountId)
      ) ?? confirmedMatches[0] ?? null;
    const hasConfirmedMatch = Boolean(confirmedMatch);
    const dueDate = selectRememberedDueDate(pattern.nextExpectedDate, confirmedMatch);
    const daysUntilDue = Math.round((dueDate.getTime() - Date.now()) / DAY_IN_MS);
    const distinctMonthCount = readPatternMetric(pattern.rawPayload, "distinctMonthCount");
    const accountCount = readPatternMetric(pattern.rawPayload, "accountCount");
    const suggestionType = describeRecurringSuggestionType(title, pattern.reasonTags);
    const reasonTags = suggestionType.tag && !pattern.reasonTags.includes(suggestionType.tag)
      ? [suggestionType.tag, ...pattern.reasonTags]
      : pattern.reasonTags;

    if (GENERIC_RECURRING_TITLE_PATTERN.test(title) && !hasConfirmedMatch) {
      continue;
    }

    if (pattern.frequency === "annual" && daysUntilDue > 180) {
      continue;
    }

    const confidence = Math.min(98, pattern.confidence + (hasConfirmedMatch ? 6 : 0));
    suggestions.push({
      id: key,
      sourceKind: "recurring_transaction",
      title,
      counterparty: title,
      amount: pattern.amount > 0 ? pattern.amount.toFixed(2) : null,
      currency: pattern.currency,
      dueDate: dueDate.toISOString(),
      recurrence: confirmedMatch?.recurrence ?? pattern.frequency,
      accountId: pattern.accountId,
      accountName: pattern.account?.name ?? (accountCount && accountCount > 1 ? "Multiple accounts" : null),
      statementCheckpointId: null,
      installmentTerms: null,
      notes: [
        `Detected from ${pattern.transactionCount} similar transaction${pattern.transactionCount === 1 ? "" : "s"} across recent uploads.`,
        distinctMonthCount && distinctMonthCount > 1 ? `Seen across ${distinctMonthCount} months.` : null,
        amountRange ? `Usually ${amountRange}.` : null,
        dueDate ? `Next expected around ${new Intl.DateTimeFormat("en-PH", { month: "short", day: "2-digit", year: "numeric" }).format(dueDate)}.` : null,
      ]
        .filter(Boolean)
        .join(" "),
      sourceLabel: suggestionType.sourceLabel,
      sourceDetail: [
        scheduleDetail ? `Looks ${scheduleDetail}` : null,
        distinctMonthCount && distinctMonthCount > 1 ? `Seen in ${distinctMonthCount} months` : null,
        accountCount && accountCount > 1 ? `Across ${accountCount} accounts` : null,
        hasConfirmedMatch ? "matched your saved recurring item" : null,
        `Seen through ${new Intl.DateTimeFormat("en-PH", { month: "short", day: "2-digit", year: "numeric" }).format(pattern.lastSeenDate)}`,
      ]
        .filter(Boolean)
        .join(" · "),
      reasonSummary: hasConfirmedMatch ? `${pattern.reasonSummary} · matched your saved recurring schedule` : pattern.reasonSummary,
      reasonTags: hasConfirmedMatch ? [...reasonTags, "confirmed before", "saved schedule"] : reasonTags,
      confidenceTier: getRecurringConfidenceTier(confidence),
      confidence,
      sourceFileName: pattern.importFile?.fileName ?? null,
    });
  }

  const potentialGroups = new Map<string, (typeof transactions)[number][]>();
  const lookbackCutoff = Date.now() - POTENTIAL_RECURRING_LOOKBACK_DAYS * DAY_IN_MS;

  for (const transaction of transactions) {
    if (transaction.type !== "expense" || transaction.date.getTime() < lookbackCutoff) {
      continue;
    }

    const text = [transaction.merchantClean, transaction.merchantRaw, transaction.description].filter(Boolean).join(" ");
    if (!POTENTIAL_RECURRING_SIGNAL.test(text)) {
      continue;
    }

    const title = (transaction.merchantClean ?? transaction.merchantRaw ?? transaction.description ?? "").trim();
    const familyKey = buildRecurringMerchantFamilySignature(title);
    const currency = (transaction.currency ?? "PHP").trim().toUpperCase() || "PHP";
    const groupKey = `${transaction.accountId ?? "workspace"}::${currency}::${familyKey}`;
    if (!familyKey || detectedFamilyKeys.has(groupKey)) {
      continue;
    }

    potentialGroups.set(groupKey, [...(potentialGroups.get(groupKey) ?? []), transaction]);
  }

  for (const [groupKey, group] of potentialGroups.entries()) {
    const latest = [...group].sort((left, right) => right.date.getTime() - left.date.getTime())[0];
    if (!latest) {
      continue;
    }
    const distinctMonthCount = countDistinctMonths(group.map((transaction) => transaction.date));
    if (distinctMonthCount < 2) {
      continue;
    }

    const title = (latest.merchantClean ?? latest.merchantRaw ?? latest.description ?? "").trim();
    if (!title || GENERIC_RECURRING_TITLE_PATTERN.test(title)) {
      continue;
    }

    const currency = (latest.currency ?? "PHP").trim().toUpperCase() || "PHP";
    const familyKey = buildRecurringMerchantFamilySignature(title);
    const normalizedTitle = normalizeKey(title);
    const commitmentKey = `recurring_transaction::${[latest.accountId ?? "workspace", currency, normalizedTitle].join("::")}`;
    if (
      existingCommitmentKeys.has(commitmentKey) ||
      dismissedFamilyKeys.has(familyKey) ||
      dismissedSuppressionKeys.has(makeRecurringSuppressionKey({ accountId: latest.accountId, currency, title }))
    ) {
      continue;
    }

    const dueDate = new Date(latest.date);
    while (dueDate.getTime() <= Date.now()) {
      const next = addMonths(dueDate, 1);
      dueDate.setTime(next.getTime());
    }
    const suggestionType = describeRecurringSuggestionType(title, ["potential recurring"]);
    const amounts = group.map((transaction) => parseAmount(transaction.amount)).filter((value) => value > 0);
    const minimumAmount = amounts.length > 0 ? Math.min(...amounts) : null;
    const maximumAmount = amounts.length > 0 ? Math.max(...amounts) : null;
    const amountRange = formatAmountRange(minimumAmount, maximumAmount, currency);
    const monthIndexes = [...new Set(group.map((transaction) => getMonthIndex(transaction.date)))].sort((left, right) => left - right);
    const monthGaps = monthIndexes.slice(1).map((month, index) => month - (monthIndexes[index] ?? month));
    if (monthGaps.some((gap) => gap < 1 || gap > 2)) {
      continue;
    }

    const expectedDay = Math.round(getMedianNumber(group.map((transaction) => transaction.date.getUTCDate())));
    const averageDayVariance = group.reduce((sum, transaction) => sum + Math.abs(transaction.date.getUTCDate() - expectedDay), 0) / group.length;
    const medianAmount = getMedianNumber(amounts);
    const amountTolerance = Math.max(20, medianAmount * 0.35);
    const stableAmountCount = amounts.filter((value) => Math.abs(value - medianAmount) <= amountTolerance).length;
    const amountStability = amounts.length > 0 ? stableAmountCount / amounts.length : 0;
    const allowsVariableAmount = /\b(rent|lease|internet|bill|utility|utilities|electric|water|phone|insurance|mortgage|loan|repayment|amortization|dues|tuition|school\s+fee|globe|smart|pldt|meralco|maynilad)\b/i.test(title);
    if (averageDayVariance > 8 || (amounts.length > 0 && amountStability < 0.5 && !allowsVariableAmount)) {
      continue;
    }

    const amount = parseAmount(latest.amount);
    const confidence = Math.min(
      78,
      50 +
        Math.min(distinctMonthCount, 4) * 5 +
        (averageDayVariance <= 5 ? 8 : 3) +
        (amountRange ? 5 : 0) +
        (amountStability >= 0.75 ? 5 : allowsVariableAmount ? 2 : 0)
    );

    suggestions.push({
      id: `potential_recurring_transaction::${groupKey}`,
      sourceKind: "recurring_transaction",
      title,
      counterparty: title,
      amount: amount > 0 ? amount.toFixed(2) : null,
      currency,
      dueDate: dueDate.toISOString(),
      recurrence: "monthly",
      accountId: latest.accountId,
      accountName: latest.account?.name ?? null,
      statementCheckpointId: null,
      installmentTerms: null,
      notes: [
        `Clover found ${group.length} matching transaction${group.length === 1 ? "" : "s"} across ${distinctMonthCount} months.`,
        `Charges usually occur around the ${ordinalDay(expectedDay)}.`,
        amountRange ? `Amounts are usually ${amountRange}.` : null,
        allowsVariableAmount && amountStability < 0.75 ? "The amount varies like a bill or utility." : null,
        "Review the evidence before adding it to your recurring schedule.",
      ].filter(Boolean).join(" "),
      sourceLabel: "Potential recurring payment",
      sourceDetail: `Seen across ${distinctMonthCount} consecutive months · around the ${ordinalDay(expectedDay)} · last seen ${new Intl.DateTimeFormat("en-PH", { month: "short", day: "2-digit", year: "numeric" }).format(latest.date)}`,
      reasonSummary: `The same merchant family appears across consecutive months with a ${suggestionType.tag ?? "recurring"} signal, similar timing, and ${allowsVariableAmount ? "bill-like" : "similar"} amounts.`,
      reasonTags: [suggestionType.tag ?? "recurring signal", "multi-month", "similar date", allowsVariableAmount && amountStability < 0.75 ? "variable amount" : "similar amount", "needs confirmation"],
      confidenceTier: getRecurringConfidenceTier(confidence),
      confidence,
      sourceFileName: readTransactionImportFileName(latest),
    });
  }

  return suggestions;
};

const getSuggestionKindPriority = (suggestion: PlannedPaymentSuggestion) => {
  switch (suggestion.sourceKind) {
    case "statement_reminder":
      return 0;
    case "installment":
      return 1;
    case "recurring_transaction":
      return 2;
    default:
      return 3;
  }
};

export const getPlannedPaymentSuggestions = async (workspaceId: string) => {
  const reminders = await getUpcomingStatementReminders(workspaceId);
  const hasCommitmentTable = await hasCompatibleTable("FinancialCommitment");
  const hasTransactionTable = await hasCompatibleTable("Transaction");
  const hasRecurringPatternTable = await hasCompatibleTable("RecurringPattern");
  const recurringTransactions = await getRecurringSourceTransactions(workspaceId);

  const [existingCommitments, transactions, dismissedPatterns, confirmedRecurringCommitments] = await Promise.all([
    hasCommitmentTable
      ? prisma.financialCommitment.findMany({
          where: {
            workspaceId,
            status: { not: "resolved" },
          },
          select: {
            id: true,
            title: true,
            counterparty: true,
            accountId: true,
            currency: true,
            statementCheckpointId: true,
          },
        })
      : Promise.resolve(
          [] as Array<{
            title: string;
            counterparty: string | null;
            accountId: string | null;
            currency: string | null;
            statementCheckpointId: string | null;
          }>
        ),
    hasTransactionTable
      ? prisma.transaction.findMany({
          where: {
            workspaceId,
            deletedAt: null,
            isExcluded: false,
            type: "expense",
            date: {
              gte: new Date(Date.now() - 400 * DAY_IN_MS),
            },
          },
          orderBy: [{ date: "asc" }, { merchantClean: "asc" }, { merchantRaw: "asc" }],
          take: 1200,
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
            rawPayload: true,
            importFileId: true,
            account: {
              select: {
                id: true,
                name: true,
                institution: true,
              },
            },
          },
        })
      : Promise.resolve([] as PlannedPaymentTransactionLike[]),
    hasRecurringPatternTable
      ? prisma.recurringPattern.findMany({
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
        })
      : Promise.resolve([]),
    hasCommitmentTable
      ? prisma.financialCommitment.findMany({
          where: {
            workspaceId,
            status: { not: "resolved" },
            recurrence: { not: "once" },
          },
          select: {
            title: true,
            counterparty: true,
            accountId: true,
            currency: true,
            recurrence: true,
            dueDate: true,
            nextDueDate: true,
          },
        })
      : Promise.resolve([]),
  ]);

  const existingCheckpointIds = new Set(
    existingCommitments.map((commitment) => commitment.statementCheckpointId).filter((value): value is string => Boolean(value))
  );
  const existingInstallmentKeys = new Set(
    existingCommitments.map((commitment) =>
      `installment::${[
        commitment.accountId ?? "workspace",
        (commitment.currency ?? "PHP").toUpperCase(),
        buildRecurringMerchantFamilySignature(`${commitment.counterparty ?? commitment.title}`) ||
          normalizeKey(`${commitment.counterparty ?? commitment.title}`),
      ].join("::")}`
    )
  );
  const existingRecurringTransactionKeys = new Set(
    existingCommitments.map((commitment) =>
      `recurring_transaction::${[
        commitment.accountId ?? "workspace",
        (commitment.currency ?? "PHP").toUpperCase(),
        normalizeKey(`${commitment.counterparty ?? commitment.title}`),
      ].join("::")}`
    )
  );
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
  const confirmedRecurringMemoryByTitle = new Map<string, ConfirmedRecurringMemory[]>();
  const confirmedRecurringMemoryByFamily = new Map<string, ConfirmedRecurringMemory[]>();
  for (const commitment of confirmedRecurringCommitments) {
    const keys = [normalizeKey(commitment.title), normalizeKey(commitment.counterparty ?? "")].filter(Boolean);
    for (const normalizedKey of keys) {
      const baseLabel = commitment.counterparty ?? commitment.title;
      const familyKey = buildRecurringMerchantFamilySignature(baseLabel);
      const memory = {
        normalizedKey,
        familyKey,
        recurrence: commitment.recurrence,
        nextDueDate: commitment.nextDueDate,
        dueDate: commitment.dueDate,
        accountId: commitment.accountId,
        currency: (commitment.currency ?? "PHP").toUpperCase(),
      };
      confirmedRecurringMemoryByTitle.set(normalizedKey, [
        ...(confirmedRecurringMemoryByTitle.get(normalizedKey) ?? []),
        memory,
      ]);
      confirmedRecurringMemoryByFamily.set(familyKey, [...(confirmedRecurringMemoryByFamily.get(familyKey) ?? []), memory]);
    }
  }

  const reminderSuggestions = buildReminderSuggestions(reminders, existingCheckpointIds);
  const installmentSuggestions = buildInstallmentSuggestions(
    transactions as PlannedPaymentTransactionLike[],
    reminders,
    existingInstallmentKeys
  );
  const recurringTransactionSuggestions = buildRecurringTransactionSuggestions(
    recurringTransactions,
    existingRecurringTransactionKeys,
    dismissedSuppressionKeys,
    dismissedFamilyKeys,
    confirmedRecurringMemoryByTitle,
    confirmedRecurringMemoryByFamily
  );

  return [...reminderSuggestions, ...installmentSuggestions, ...recurringTransactionSuggestions].sort((left, right) => {
    const leftDueDate = new Date(left.dueDate ?? 0).getTime();
    const rightDueDate = new Date(right.dueDate ?? 0).getTime();
    const leftPriority = getSuggestionKindPriority(left);
    const rightPriority = getSuggestionKindPriority(right);

    return (
      leftDueDate - rightDueDate ||
      leftPriority - rightPriority ||
      right.confidence - left.confidence ||
      left.title.localeCompare(right.title)
    );
  });
};
