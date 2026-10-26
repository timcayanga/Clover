import { reportDay, shiftDay, validReportDate, type ReportRow } from '../../shared/reports/analysis';
import { consolidatedAccountSummary } from '../../shared/account-summary';
import { buildRecurringCalendarOccurrences } from './recurring-calendar';
import { recurringCompletionDate, recurringPaymentAmount } from './recurring-tracking';
import type { FinancialCommitmentSummary } from './commitments';
import { formatCurrencyAmount } from './currency-format';
export type AdviserFactIntent = 'spending' | 'payments' | 'cash';
export function adviserFactIntent(question: string): AdviserFactIntent | null {
    if (/\b(?:add|create|record|edit|delete|afford|safe to spend|can i spend)\b/i.test(question))
        return null;
    if (/\b(?:payments?|bills?|commitments?)\b/i.test(question) && /\b(?:due|upcoming|coming|next)\b/i.test(question))
        return 'payments';
    if (/\b(?:available cash|cash available|spendable|liquid balance|cash balance|how much cash)\b/i.test(question))
        return 'cash';
    if (/\b(?:spending|expenses?|spent|spend)\b/i.test(question) && /\b(?:categor(?:y|ies)|breakdown|total|how much)\b/i.test(question) && !/\b(?:budget|limit)\b/i.test(question) && !/\b(?:at|on)\s+(?!(?:transfers?|expenses?|spending)\b)/i.test(question))
        return 'spending';
    return null;
}
/** Clarifications inherit only a prior user request, never an assistant's stale figures. */
export function resolveAdviserFactQuestion(latest: string, messages: Array<{
    role: string;
    content: string;
}>) {
    if (adviserFactIntent(latest))
        return latest;
    if (latest.length > 240 || /\b(?:add|create|record|edit|delete|afford|budget)\b/i.test(latest))
        return latest;
    const clarifies = /\b(?:20\d{2}|january|february|march|april|may|june|july|august|september|october|november|december|this month|last month|previous month|next \d+ days|PHP|USD|EUR|GBP|SGD|MYR|IDR|THB|transfers?|top \d+|three|five)\b/i.test(latest);
    if (!clarifies)
        return latest;
    const prior = messages.slice(0, -1).filter(m => m.role === 'user').slice(-1)[0]?.content;
    const intent = prior ? adviserFactIntent(prior) : null;
    if (!intent)
        return latest;
    const changesPeriod = /\b(?:20\d{2}|january|february|march|april|may|june|july|august|september|october|november|december|this month|last month|previous month|next \d+ days)\b/i.test(latest);
    if (!changesPeriod)
        return latest + '\n' + prior;
    const count = adviserTopCount(latest) ?? adviserTopCount(prior!);
    const inheritedCurrency = prior!.match(/\b(PHP|USD|EUR|GBP|SGD|MYR|IDR|THB)\b/i)?.[1] ?? '';
    return latest + '\n' + inheritedCurrency + ' ' + (intent === 'spending' ? `${count ? `Top ${count} ` : ''}spending categories` : intent === 'payments' ? 'Which payments are due?' : 'How much available cash?');
}
const months = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
/** Inclusive calendar-day boundaries, exactly as Reports filters them. No observed-row date inference. */
export function adviserFactWindow(question: string, now: Date, timeZone: string) {
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
        const named = /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b/i.exec(question);
        const relative = /\b(this|last|previous) month\b/i.exec(question);
        const rolling = /\b(?:last|past)\s+(\d+)\s+days?\b/i.exec(question);
        const [year, month] = today.split('-').map(Number);
        if (named || relative) {
            const tail = named ? question.slice(named.index + named[0].length) : '';
            const dayRange = /^\s+(\d{1,2})(?!\d)(?:st|nd|rd|th)?(?:\s*(?:[-–—]|to|through)\s*(\d{1,2})(?!\d)(?:st|nd|rd|th)?)?/.exec(tail);
            const requestedYear = question.match(/\b(20\d{2})\b/)?.[1];
            const date = new Date(Date.UTC(requestedYear ? Number(requestedYear) : year, named ? months.findIndex(m => m.startsWith(named[1].toLowerCase().slice(0, 3))) : month - 1 - (relative && relative[1].toLowerCase() !== 'this' ? 1 : 0), 1));
            const ym = date.toISOString().slice(0, 7);
            from = ym + '-' + String(dayRange?.[1] ?? 1).padStart(2, '0');
            to = ym + '-' + String(dayRange ? (dayRange[2] ?? dayRange[1]) : new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate()).padStart(2, '0');
            if (!dayRange && to > today && from <= today)
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
    if (!validReportDate(from) || !validReportDate(to) || from > to || to > today)
        throw new Error('Please choose a valid spending period ending today or earlier.');
    return { from, to };
}
export function adviserTopCount(question: string) {
    const m = /\b(?:top|biggest|largest|highest)\s+(\d+|three|five|ten)\b|\b(\d+|three|five|ten)\s+(?:biggest|largest|highest)\b/i.exec(question);
    const value = (m?.[1] ?? m?.[2] ?? '').toLowerCase();
    return value ? Math.max(1, Math.min(20, Number(value) || ({ three: 3, five: 5, ten: 10 }[value] ?? 3))) : null;
}
export function adviserSpendingFacts(rows: ReportRow[], currency: string, window: {
    from: string;
    to: string;
}, limit: number | null) {
    const expenses = rows.filter(r => r.currency === currency && r.type === 'expense' && r.date >= window.from && r.date <= window.to && Number.isFinite(r.amount));
    const categories = new Map<string, number>();
    for (const row of expenses)
        categories.set(row.category, (categories.get(row.category) ?? 0) + Math.abs(row.amount));
    const ranked = [...categories].map(([label, amount]) => ({ label, amount: Math.round(amount * 100) / 100 })).sort((a, b) => b.amount - a.amount || a.label.localeCompare(b.label));
    return { total: Math.round(expenses.reduce((sum, r) => sum + Math.abs(r.amount), 0) * 100) / 100, categories: limit ? ranked.slice(0, limit) : ranked, rowCount: expenses.length, allCategories: ranked };
}
export function adviserPaymentWindow(question: string, now: Date, timeZone: string) {
    const match = /\bnext\s+(\d+)\s+(days?|weeks?)\b/i.exec(question);
    const days = match ? Number(match[1]) * (match[2].toLowerCase().startsWith('week') ? 7 : 1) : 30;
    if (!Number.isSafeInteger(days) || days < 1 || days > 366)
        throw new Error('Choose a payment window from 1 to 366 days.');
    const from = reportDay(now, timeZone);
    return { from, to: shiftDay(from, days - 1), days };
}
/** The same finite-term calendar and completion keys used by Recurring. Suggestions never enter this list. */
export function adviserPaymentFacts(commitments: FinancialCommitmentSummary[], window: {
    from: string;
    to: string;
}, currency: string) {
    const confirmed = commitments.filter(c => c.currency === currency && c.status === 'active' && c.kind !== 'receivable' && !/suggest|infer|candidate/i.test(c.source));
    const result: Array<{
        id: string;
        label: string;
        amount: number | null;
        date: string;
        dueDate: string;
    }> = [];
    for (let date = new Date(window.from.slice(0, 7) + '-01T12:00:00'); date.toISOString().slice(0, 7) <= window.to.slice(0, 7); date.setMonth(date.getMonth() + 1)) {
        for (const occurrence of buildRecurringCalendarOccurrences(confirmed, date.getFullYear(), date.getMonth())) {
            const { commitment: c, dateKey } = occurrence;
            const dueDate = recurringCompletionDate(c, dateKey);
            if (dateKey < window.from || dateKey > window.to || c.completedPaymentDates?.includes(dueDate))
                continue;
            result.push({ id: c.id, label: c.title, amount: recurringPaymentAmount(c, dateKey), date: dateKey, dueDate });
        }
    }
    return result.sort((a, b) => a.date.localeCompare(b.date) || a.label.localeCompare(b.label));
}
export function adviserCashFacts(accounts: Array<{
    type: string;
    currency: string;
    balance: number | null;
}>, currency: string) {
    return consolidatedAccountSummary(accounts.filter(a => a.currency === currency), currency, {});
}
export const adviserFactMoney = (value: number, currency: string) => formatCurrencyAmount(value, currency);
