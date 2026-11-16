import { reportDay, shiftDay, validReportDate, summarizeReportSpending, type ReportRow } from '../../shared/reports/analysis';
import { consolidatedAccountSummary, spendableAccountTypes } from '../../shared/account-summary';
import { buildRecurringCalendarOccurrences } from './recurring-calendar';
import { recurringCompletionDate, recurringPaymentAmount } from './recurring-tracking';
import type { FinancialCommitmentSummary } from './commitments';
import { formatCurrencyAmount } from './currency-format';
const multipleCurrencyScope = /\b(?:all currencies|by currency|across (?:my |all )?currencies|each currency)\b/i;
export const asksForMultipleCurrencies = (question: string) => multipleCurrencyScope.test(question);

export const asksWhereMoneyWent = (question: string) =>
    /^(?:please )?where (?:did|has) my money go(?:ne)?\b/i.test(question.trim());
export const asksHowMuchIsAvailable = (question: string) =>
    /^(?:please )?how much do i have available(?:[.!?\s]|$)/i.test(question.trim()) &&
    !/\b(?:before|after|next|last|tomorrow|yesterday|on|as of)\b/i.test(question);
export const asksWhereSweldoWent = (question: string) => /^where did my sweldo go\b/i.test(question.trim());
export const asksForGcashSpending = (question: string) => /^how much did i spend (?:through|using|via) gcash\b/i.test(question.trim());
export const asksForBillsBeforePayday = (question: string) =>
    /\b(?:bills?|payments?|what(?:[’']s| is))\s+(?:(?:are|is)\s+)?due\s+before (?:my )?(?:next )?payday\b/i.test(question);

export const adviserExplicitPayday = (question: string) =>
    /\bpayday(?: is|:)? (20\d{2}-\d{2}-\d{2})\b/i.exec(question)?.[1];

export function adviserBeforePaydayWindow(today: string, paydayDay: number) {
    const date = new Date(`${today}T00:00:00Z`);
    const dayInMonth = (offset: number) => {
        const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + offset + 1, 0)).getUTCDate();
        return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + offset, Math.min(paydayDay, lastDay))).toISOString().slice(0, 10);
    };
    const payday = dayInMonth(0) > today ? dayInMonth(0) : dayInMonth(1);
    return { from: today, to: shiftDay(payday, -1), payday };
}

export type AdviserFactIntent = 'spending' | 'spending-change' | 'payments' | 'cash' | 'cashflow';
export function adviserFactIntent(question: string): AdviserFactIntent | null {
    if (/\b(?:add|create|record|edit|delete|afford|safe to spend|can i spend)\b/i.test(question))
        return null;
    if (asksWhereMoneyWent(question) || asksWhereSweldoWent(question) || asksForGcashSpending(question)) return 'spending';
    if (asksForBillsBeforePayday(question)) return 'payments';
    if (isSpendingChangeQuestion(question)) return 'spending-change';
    if ((/\b(?:payments?|bills?|commitments?)\b/i.test(question) && /\b(?:due|upcoming|coming|next)\b/i.test(question)) || /\bwhat(?:[’']s| is) due\b/i.test(question))
        return 'payments';
    if (asksHowMuchIsAvailable(question) || /\b(?:available cash|cash available|spendable|liquid balance|cash balance|how much cash)\b/i.test(question) ||
        (/\b(?:my cash|cash balances?)\b/i.test(question) && asksForMultipleCurrencies(question)))
        return 'cash';
    if (/\b(?:cash flow|cashflow|income (?:and|vs\.?) (?:expenses|spending)|earn and spend)\b/i.test(question) &&
        /\b(?:this month|last month|previous month|(?:past|last) \d+ days|20\d{2}-\d{2}-\d{2})\b/i.test(question) &&
        !/\b(?:compare|changed?|forecast|predict|next|project|future|over time|by (?:day|week|month|year|account|merchant))\b/i.test(question))
        return 'cashflow';
    if (!/\b(?:over time|by (?:day|week|month|year|merchant|account))\b/i.test(question) && /\b(?:spending|expenses?|spent|spend)\b/i.test(question) && (/\b(?:categor(?:y|ies)|breakdown|total|how much|chart|graph)\b/i.test(question) || asksForMultipleCurrencies(question)) && !/\b(?:budget|limit)\b/i.test(question) && !/\b(?:at|on)\s+(?!(?:transfers?|expenses?|spending)\b)/i.test(question))
        return 'spending';
    return null;
}
const factCurrencyPattern = /\b(PHP|USD|EUR|GBP|SGD|HKD|JPY|AUD|CAD|CNY|INR|MYR|IDR|THB|VND|AED)\b/i;
const otherCurrencyCodes = new Set(Intl.supportedValuesOf("currency").filter(code => code !== "ALL"));
const ambiguousCodes = new Set(["bam", "bob", "cop", "cup", "gel", "mad", "pen", "rub", "top", "try", "won"]);
const currencyNames = new Map<string, string>();
for (const code of otherCurrencyCodes) {
    const formatter = new Intl.NumberFormat("en", { style: "currency", currency: code, currencyDisplay: "name" });
    for (const amount of [1, 2]) {
        const name = formatter.formatToParts(amount).find(part => part.type === "currency")?.value.toLowerCase();
        if (name && name !== code.toLowerCase()) currencyNames.set(name, code);
    }
}
for (const [name, code] of Object.entries({
    "philippine peso": "PHP", "philippine pesos": "PHP", "pounds sterling": "GBP",
    "brazilian reais": "BRL", "renminbi": "CNY", "rmb": "CNY", "chinese yuan": "CNY", "new taiwan dollars": "TWD",
})) currencyNames.set(name, code);

// Common short and local names that differ from the English currency labels.
for (const [code, names] of Object.entries({
    BRL: ["real brasileiro", "reais brasileiros", "reais"],
    MXN: ["peso mexicano", "pesos mexicanos"],
    ARS: ["peso argentino", "pesos argentinos"],
    CLP: ["peso chileno", "pesos chilenos"],
    COP: ["peso colombiano", "pesos colombianos"],
    PEN: ["sol peruano", "soles peruanos"],
    CHF: ["schweizer franken", "franc suisse", "francs suisses", "franco svizzero", "franchi svizzeri"],
    EUR: ["euros"],
    PLN: ["złoty", "złote", "złotych", "polish złoty"],
    CZK: ["česká koruna", "české koruny", "českých korun"],
    JPY: ["yen", "円", "日本円"],
    KRW: ["korean won", "south korean won", "원", "한국 원"],
    CNY: ["yuan", "人民币", "人民幣", "人民币元"],
    TWD: ["新台幣", "新臺幣", "新台币"],
    HKD: ["港幣", "港币", "港元"],
    THB: ["baht", "บาท", "เงินบาท"],
    VND: ["dong", "đồng", "đồng việt nam"],
    IDR: ["rupiah", "rupiah indonesia"],
    MYR: ["ringgit", "ringgit malaysia"],
    INR: ["भारतीय रुपया", "भारतीय रुपये"],
    AED: ["درهم إماراتي", "الدرهم الإماراتي"],
    SAR: ["ريال سعودي", "الريال السعودي"],
    XOF: ["west african cfa franc", "west african cfa francs", "franc cfa ouest-africain"],
    XAF: ["central african cfa franc", "central african cfa francs", "franc cfa d’afrique centrale"],
    XCD: ["east caribbean dollar", "east caribbean dollars", "eastern caribbean dollars"],
    XPF: ["cfp franc", "cfp francs", "franc pacifique", "francs pacifique"],
})) {
    if (otherCurrencyCodes.has(code)) for (const name of names) currencyNames.set(name, code);
}

const currencySymbols: Readonly<Record<string, string>> = {
    "₱": "PHP", "₹": "INR", "₩": "KRW", "₫": "VND", "฿": "THB", "₺": "TRY",
    "₪": "ILS", "₦": "NGN", "₴": "UAH", "₸": "KZT", "₾": "GEL", "₡": "CRC",
    "₲": "PYG", "₵": "GHS", "₭": "LAK", "₮": "MNT", "₼": "AZN", "₽": "RUB",
};

const currencyNamePattern = [...currencyNames.keys()].sort((a, b) => b.length - a.length)
    .map(name => name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
const currencySymbolPattern = new RegExp(`[${Object.keys(currencySymbols).join("")}]`, "gu");
const currencyPhrasePattern = new RegExp(`(?:^|\\b(?:in|en|em|w)[ \t]+)(${currencyNamePattern}|[a-z]{3}|${currencySymbolPattern.source})(?![\\p{L}\\p{M}\\p{N}_])`, "gimu");

function explicitCurrencyPhrase(token: string) {
    const key = token.toLowerCase();
    return currencySymbols[token] ?? currencyNames.get(key) ??
        (otherCurrencyCodes.has(token.toUpperCase()) && (!ambiguousCodes.has(key) || token === token.toUpperCase())
            ? token.toUpperCase() : undefined);
}

export function stripAdviserCurrencyPhrase(question: string) {
    return question.replace(currencyPhrasePattern, (match, token: string) => explicitCurrencyPhrase(token) ? "" : match);
}

const stripCurrencies = (question: string) => stripAdviserCurrencyPhrase(question)
    .replace(new RegExp(factCurrencyPattern, "gi"), "")
    .replace(currencySymbolPattern, "");
const spendingDriversInstruction = 'Break down the change by category.';
export const asksForSpendingDrivers = (question: string) =>
    question.split('\n').includes(spendingDriversInstruction);

const isSpendingDriversFollowUp = (question: string) =>
    /^(?:why|what drove (?:that|the change)|which categories (?:drove (?:that|the change)|changed(?: the most)?)|break (?:that|it) down by category)[.!?]*$/i.test(question.trim());

function isSpendingChangeQuestion(question: string) {
    const clean = stripAdviserCurrencyPhrase(question.replace(spendingDriversInstruction, ''))
        .replace(/^(?:show.*(?:chart|graph)|no chart)\.?$/gim, '').trim().replace(/[.!?]+$/, '');
    return /^(?:how (?:has|did) my spending chang(?:e|ed)(?: this month)?|what changed in my spending this month|(?:compare|chart) (?:my )?spending (?:this month (?:to|vs\.?|versus) last month|for the last 30 days (?:vs\.?|versus) the previous 30 days)|(?:did i spend more|am i spending more) this month(?: than last month)?)$/i.test(clean);
}

export function adviserSpendingComparison(
    rows: ReportRow[], currency: string, now: Date, timeZone: string, calendarMonth: boolean,
) {
    const today = reportDay(now, timeZone);
    let recent = { from: shiftDay(today, -29), to: today };
    let earlier = { from: shiftDay(today, -59), to: shiftDay(today, -30) };
    if (calendarMonth) {
        const start = today.slice(0, 7) + '-01';
        const previousEnd = shiftDay(start, -1);
        const previousStart = previousEnd.slice(0, 7) + '-01';
        const days = Math.min(Number(today.slice(-2)), Number(previousEnd.slice(-2)));
        recent = { from: start, to: shiftDay(start, days - 1) };
        earlier = { from: previousStart, to: shiftDay(previousStart, days - 1) };
    }
    const current = adviserSpendingFacts(rows, currency, recent, null);
    const previous = adviserSpendingFacts(rows, currency, earlier, null);
    const priorByCategory = new Map(previous.allCategories.map(({ label, amount }) => [label, amount]));
    const recentByCategory = new Map(current.allCategories.map(({ label, amount }) => [label, amount]));
    const drivers = [...new Set([...priorByCategory.keys(), ...recentByCategory.keys()])]
        .map(label => ({
            label,
            change: Math.round(((recentByCategory.get(label) ?? 0) - (priorByCategory.get(label) ?? 0)) * 100) / 100,
        }))
        .filter(({ change }) => change !== 0)
        .sort((a, b) => Math.abs(b.change) - Math.abs(a.change) || a.label.localeCompare(b.label));
    return {
        recent, earlier, current, previous, drivers,
        change: Math.round((current.total - previous.total) * 100) / 100,
    };
}

const factPeriodPattern = /\b(?:20\d{2}|january|february|march|april|may(?!\s+(?:i|we|you)\b)|june|july|august|september|october|november|december|(?:this|last|previous|next|past) month|(?:next|past|last) \d+ (?:days?|weeks?))\b/i;
export function adviserRequestedCurrency(question: string) {
    for (const match of question.matchAll(currencyPhrasePattern)) {
        const currency = explicitCurrencyPhrase(match[1]);
        if (currency) return currency;
    }
    const code = question.match(factCurrencyPattern)?.[1].toUpperCase();
    if (code) return code;
    const symbols = new Set([...question].map(char => currencySymbols[char]).filter(Boolean));
    return symbols.size === 1 ? [...symbols][0] : undefined;
}

const noChartInstruction = /\b(?:no (?:chart|graph)|without (?:a )?(?:chart|graph)|just (?:the )?(?:numbers|text))\b/i;
export const declinesChart = (question: string) => noChartInstruction.test(question);
/** A format-only follow-up can reuse a prior user request, never a model answer. */
export function isAdviserChartFollowUp(question: string) {
    return /^(?:and |please )?(?:can you |could you )?(?:(?:show (?:me )?(?:that|it|this) (?:as|in) a (?:bar )?(?:chart|graph))|(?:chart|graph|plot) (?:that|it|this)|(?:show (?:me )?)?(?:a )?(?:bar )?(?:chart|graph))(?: please)?[.!?]*$/i.test(question.trim());
}
/** Clarifications inherit only a prior user request, never an assistant's stale figures. */
export function resolveAdviserFactQuestion(latest: string, messages: Array<{
    role: string;
    content: string;
}>): string {
    if (adviserFactIntent(latest))
        return latest;
    const previousQuestion = messages.slice(0, -1).reverse().find(turn => turn.role === 'user')?.content;
    const suppliedPayday = /^(?:my (?:next )?payday is |on )?(20\d{2}-\d{2}-\d{2})[.!?]*$/i.exec(latest.trim())?.[1];
    if (suppliedPayday && previousQuestion && asksForBillsBeforePayday(previousQuestion)) {
        return `Which bills are due before payday? Payday is ${suppliedPayday}.`;
    }
    if (isAdviserChartFollowUp(latest)) {
        const priorTurns = messages.slice(0, -1);
        const previous = [...priorTurns].reverse().find(turn => turn.role === 'user' && !isAdviserChartFollowUp(turn.content));
        const index = previous ? priorTurns.lastIndexOf(previous) : -1;
        if (index < 0) return latest;
        const earlier = resolveAdviserFactQuestion(priorTurns[index].content, priorTurns.slice(0, index + 1));
        return adviserFactIntent(earlier)
            ? earlier.replace(new RegExp(noChartInstruction, 'gi'), '') + '\nShow that as a chart.'
            : latest;
    }
    if (isSpendingDriversFollowUp(latest)) {
        let index = messages.length - 2;
        while (index >= 0 && messages[index].role !== 'user') index--;
        if (index < 0) return latest;
        const prior = resolveAdviserFactQuestion(messages[index].content, messages.slice(0, index + 1));
        if (adviserFactIntent(prior) !== 'spending-change') return latest;
        return asksForSpendingDrivers(prior) ? prior : `${prior}\n${spendingDriversInstruction}`;
    }
    if (latest.length > 240 || /\b(?:add|create|record|edit|delete|afford|budget)\b/i.test(latest))
        return latest;
    const formatOnly = /^(?:please )?(?:just (?:the )?(?:numbers|text)|no (?:chart|graph)|without (?:a )?(?:chart|graph))[.!?]*$/i.test(latest);
    const changesPeriod = factPeriodPattern.test(latest);
    const switchesToAll = /^(?:show (?:me )?)?(?:in )?(?:all currencies|each currency|by currency)[.!?]*$/i.test(latest);
    if (!switchesToAll && !formatOnly && !changesPeriod && !adviserRequestedCurrency(latest) && !adviserTopCount(latest) &&
        !/\btransfers?\b/i.test(latest))
        return latest;
    // A date or currency in an unrelated request is not a financial clarification.
    // Restrict inherited scope to short date/currency/filter instructions.
    const remainder = stripCurrencies(latest.replace(multipleCurrencyScope, ""))
        .replace(/\d+/g, ' ')
        .replace(/\b(?:january|february|march|april|may|june|july|august|september|october|november|december|use|please|no|yes|only|the|for|from|to|through|on|in|and|with|without|exclude|excluding|include|including|transfers?|income|expenses?|spending|categor(?:y|ies)|breakdown|top|biggest|largest|highest|three|five|ten|full|whole|months?|calendar|this|last|previous|next|past|days?|weeks?|instead|same|show|it|that|these|those|as|of|about|actually|make|can|you|i|want|mean|meant|not|all|exact|exactly|dates?|what|how|just|numbers|text|chart|graph|a|st|nd|rd|th)\b/gi, '')
        .replace(/[\d\s\p{P}\p{S}]/gu, '');
    if (remainder)
        return latest;
    let index = messages.length - 2;
    while (index >= 0 && messages[index].role !== 'user') index--;
    if (index < 0)
        return latest;
    const prior = resolveAdviserFactQuestion(messages[index].content, messages.slice(0, index + 1));
    const intent = adviserFactIntent(prior);
    if (!intent)
        return latest;
    const supportsCurrencyOverview = intent === 'spending' || intent === 'cash';
    if (switchesToAll && !supportsCurrencyOverview) return latest;
    const explicitCurrency = adviserRequestedCurrency(latest);
    const allCurrencies = supportsCurrencyOverview && (switchesToAll || (!explicitCurrency && asksForMultipleCurrencies(prior)));
    const currency = allCurrencies ? undefined : explicitCurrency ?? adviserRequestedCurrency(prior);
    if (intent === 'spending-change') {
        if (changesPeriod || adviserTopCount(latest) || /\btransfers?\b/i.test(latest)) return latest;
        const format = formatOnly || declinesChart(prior) ? 'No chart.' : '';
        return [currency, stripAdviserCurrencyPhrase(prior).trim(), format].filter(Boolean).join('\n');
    }
    const period = changesPeriod ? latest : prior.split('\n').find(line => factPeriodPattern.test(line)) ?? '';
    const count = adviserTopCount(latest) ?? adviserTopCount(prior);
    if (asksForGcashSpending(prior) || asksWhereSweldoWent(prior) || asksWhereMoneyWent(prior) || asksForBillsBeforePayday(prior)) {
        if (switchesToAll) return latest;
        const topic = asksForGcashSpending(prior) ? 'How much did I spend through GCash?'
            : asksWhereSweldoWent(prior) ? 'Where did my sweldo go?'
            : asksWhereMoneyWent(prior) ? 'Where did my money go?' : 'Which bills are due before payday?';
        const payday = adviserExplicitPayday(prior);
        return [topic, currency, period, payday ? `Payday is ${payday}.` : '', formatOnly ? 'No chart.' : ''].filter(Boolean).join('\n');
    }
    const topic = intent === 'spending'  ? allCurrencies ? 'Spending by currency' : `${count ? `Top ${count} ` : ''}spending categories`
        : intent === 'payments' ? 'Which payments are due?'
        : intent === 'cashflow' ? 'Show my cash flow'
        : allCurrencies ? 'Available cash by currency' : 'How much available cash?';
    const format = formatOnly || declinesChart(prior) ? 'No chart.' :
        /\b(?:chart|graph|plot|visuali[sz]e)\b/i.test(prior) ? 'Show as a chart.' : '';
    // Keep the new currency first and use one period clause so old dates cannot leak through.
    return [currency, topic, stripCurrencies(period).replace(new RegExp(multipleCurrencyScope, 'gi'), '').replace(/₱/g, '').replace(new RegExp(noChartInstruction, 'gi'), ''), format].filter(Boolean).join('\n');

}
const months = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
/** Inclusive calendar-day boundaries, exactly as Reports filters them. No observed-row date inference. */
export function adviserFactWindow(question: string, now: Date, timeZone: string, allowFuture = false) {
    const today = reportDay(now, timeZone);
    const iso = [...question.matchAll(/\b(20\d{2}-\d{2}-\d{2})\b/g)].map(m => m[1]);
    let from: string, to: string;
    if (iso.length >= 2)
        [from, to] = iso;
    else if (iso.length === 1) {
        from = iso[0];
        to = /\b(?:since|from)\b/i.test(question) ? today : from;
    }
    else {
        const named = /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may(?!\s+(?:i|we|you|they|he|she|it|have|be)\b)|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b/i.exec(question);
        const relative = /\b(this|last|previous|next) month\b/i.exec(question);
        const rolling = /\b(?:last|past)\s+(\d+)\s+days?\b/i.exec(question);
        const [year, month] = today.split('-').map(Number);
        if (named || relative) {
            const tail = named ? question.slice(named.index + named[0].length) : '';
            const dayRange = /^\s+(\d{1,2})(?!\d)(?:st|nd|rd|th)?(?:\s*(?:[-–—]|to|through)\s*(\d{1,2})(?!\d)(?:st|nd|rd|th)?)?/.exec(tail);
            const requestedYear = question.match(/\b(20\d{2})\b/)?.[1];
            const date = new Date(Date.UTC(requestedYear ? Number(requestedYear) : year, named ? months.findIndex(m => m.startsWith(named[1].toLowerCase().slice(0, 3))) : month - 1 + (relative?.[1].toLowerCase() === 'next' ? 1 : relative && relative[1].toLowerCase() !== 'this' ? -1 : 0), 1));
            const ym = date.toISOString().slice(0, 7);
            from = ym + '-' + String(dayRange?.[1] ?? 1).padStart(2, '0');
            to = ym + '-' + String(dayRange ? (dayRange[2] ?? dayRange[1]) : new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate()).padStart(2, '0');
            if (!allowFuture && !dayRange && to > today && from <= today)
                to = today;
        }
        else if (rolling) {
            const days = Number(rolling[1]);
            if (days < 1 || days > 36600)
                throw new Error('Please choose a valid spending period ending today or earlier.');
            to = today;
            from = shiftDay(today, 1 - days);
        }
        else {
            if (/\b(?:last|previous|this|past)\s+(?:week|year|quarter)\b/i.test(question))
                throw new Error('Please choose explicit spending dates (YYYY-MM-DD to YYYY-MM-DD) so I can match your report.');
            to = today;
            from = shiftDay(today, -29);
        }
    }
    if (!validReportDate(from) || !validReportDate(to) || from > to || (!allowFuture && to > today))
        throw new Error('Please choose a valid spending period ending today or earlier.');
    return { from, to };
}
export function adviserTopCount(question: string) {
    const m = /\b(?:top|biggest|largest|highest)\s+(\d+|three|five|ten)\b|\b(\d+|three|five|ten)\s+(?:biggest|largest|highest)\b/i.exec(question);
    const value = (m?.[1] ?? m?.[2] ?? '').toLowerCase();
    return value ? Math.max(1, Math.min(20, Number(value) || ({ three: 3, five: 5, ten: 10 }[value] ?? 3))) : null;
}
export function adviserSpendingByCurrency(rows: ReportRow[], window: { from: string; to: string }, primaryCurrency: string) {
    const totals = new Map<string, number>();
    for (const row of rows) {
        if (row.type !== 'expense' || row.date < window.from || row.date > window.to || !Number.isFinite(row.amount)) continue;
        totals.set(row.currency, (totals.get(row.currency) ?? 0) + Math.abs(row.amount));
    }
    return [...totals.entries()]
        .sort(([a], [b]) => Number(b === primaryCurrency) - Number(a === primaryCurrency) || a.localeCompare(b))
        .map(([currency, total]) => ({ currency, total: Math.round(total * 100) / 100 }));
}

export function adviserSpendingFacts(rows: ReportRow[], currency: string, window: {
    from: string;
    to: string;
}, limit: number | null) {
    const report = summarizeReportSpending(rows.filter(row => row.currency === currency && row.date >= window.from && row.date <= window.to));
    const ranked = report.categories.map(({ name, amount }) => ({ label: name, amount }));
    return { total: report.total, categories: limit ? ranked.slice(0, limit) : ranked, rowCount: report.rowCount, allCategories: ranked };
}
export function adviserPaymentWindow(question: string, now: Date, timeZone: string) {
    if (/\b(?:20\d{2}-\d{2}-\d{2}|january|february|march|april|may|june|july|august|september|october|november|december|(?:this|next|last|previous) month)\b/i.test(question)) {
        const window = adviserFactWindow(question, now, timeZone, true);
        const days = Math.round((Date.parse(window.to) - Date.parse(window.from)) / 86400000) + 1;
        if (days < 1 || days > 366)
            throw new Error('Choose a payment window from 1 to 366 days.');
        return { ...window, days };
    }
    const match = /\bnext\s+(\d+)\s+(days?|weeks?)\b/i.exec(question);
    const days = match ? Number(match[1]) * (match[2].toLowerCase().startsWith('week') ? 7 : 1) : 30;
    if (!Number.isSafeInteger(days) || days < 1 || days > 366)
        throw new Error('Choose a payment window from 1 to 366 days.');
    const from = reportDay(now, timeZone);
    return { from, to: shiftDay(from, days - 1), days };
}
export const isConfirmedAdviserPayment = (commitment: FinancialCommitmentSummary) =>
    commitment.status === 'active' && (commitment.kind === 'planned_payment' || commitment.kind === 'debt') &&
    !/suggest|infer|candidate/i.test(commitment.source);

/** The same finite-term calendar and completion keys used by Recurring. Suggestions never enter this list. */
export function adviserPaymentFacts(commitments: FinancialCommitmentSummary[], window: {
    from: string;
    to: string;
}, currency: string, dateBasis: 'schedule' | 'due' = 'schedule') {
    const confirmed = commitments.filter(c => c.currency === currency && isConfirmedAdviserPayment(c))
        .map(c => dateBasis === 'due' && c.dueDate ? { ...c, plannedPaymentDate: null } : c);
    const result: Array<{
        id: string;
        label: string;
        amount: number | null;
        date: string;
        dueDate: string;
    }> = [];
    const monthIndex = (day: string) => Number(day.slice(0, 4)) * 12 + Number(day.slice(5, 7)) - 1;
    const lastMonth = monthIndex(window.to);
    for (let month = monthIndex(window.from); month <= lastMonth; month++) {
        for (const occurrence of buildRecurringCalendarOccurrences(confirmed, Math.floor(month / 12), month % 12)) {
            const { commitment: c, dateKey } = occurrence;
            const dueDate = recurringCompletionDate(c, dateKey);
            if (dateKey < window.from || dateKey > window.to || c.completedPaymentDates?.includes(dueDate))
                continue;
            result.push({ id: c.id, label: c.title, amount: c.kind === "debt" ? c.tracking?.paymentAmount ?? null : recurringPaymentAmount(c, dateKey), date: dateKey, dueDate });
        }
    }
    return result.sort((a, b) => a.date.localeCompare(b.date) || a.label.localeCompare(b.label));
}
export function adviserCashFacts(accounts: Array<{
    type: string;
    currency: string;
    balance: number | null;
}>, currency: string) {
    const spendable = accounts.filter(a => a.currency === currency && spendableAccountTypes.includes(a.type));
    return { ...consolidatedAccountSummary(spendable, currency, {}), accountCount: spendable.length };
}
export const adviserFactMoney = (value: number, currency: string) => formatCurrencyAmount(value, currency);
