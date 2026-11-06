import { defaultReportView, reportDay } from "../../shared/reports/analysis";
import { reportTransactionParams } from "../../shared/reports/drilldown";
import { adviserChartWindow, asksForChart } from "./adviser-page-answer";
import { spendableAccountTypes } from "../../shared/account-summary";
import { prisma } from './prisma';
import { buildActiveWorkspaceTransactionWhere } from './transaction-query';
import { normalizeReportRows, reportTransactionSelect } from './report-rows';
import { reportAccountBalance } from './report-balances';
import { accountSectionType } from '../../shared/account-presentation';
import { normalizeAccountBalanceSign } from './account-balance';
import { finverseBalances } from './finverse-balances';
import { serializeFinancialCommitment } from './commitments';
import { normalizeRegionalPreferences } from './regional-preferences';
import { adviserFactIntent, adviserRequestedCurrency, adviserSpendingComparison, adviserSpendingByCurrency, asksForMultipleCurrencies, asksForSpendingDrivers, adviserFactWindow, declinesChart, adviserTopCount, adviserSpendingFacts, adviserPaymentWindow, adviserPaymentFacts, adviserCashFacts, adviserFactMoney } from './adviser-facts';
export async function loadAdviserAccountFacts(workspaceId: string, accountId?: string) {
    const [accounts, snapshots] = await Promise.all([
        prisma.account.findMany({ where: { workspaceId, ...(accountId ? { id: accountId } : {}) }, include: { transactions: { where: { deletedAt: null, isExcluded: false, account: { OR: [{ source: { in: ["manual", "adviser_manual"] } }, { type: "cash" }] } }, select: { id: true, date: true, createdAt: true, amount: true, currency: true, type: true, merchantRaw: true, merchantClean: true, description: true, rawPayload: true } }, statementCheckpoints: true } }),
        finverseBalances(workspaceId, accountId ? [accountId] : undefined),
    ]);
    return accounts.map(a => {
        const type = accountSectionType(a);
        const balance = snapshots.has(a.id) ? Number(snapshots.get(a.id)!.bankBalance) : reportAccountBalance({ ...a, type, transactions: a.transactions.map(t => ({ ...t, amount: t.amount.toString(), rawPayload: t.rawPayload as Parameters<typeof reportAccountBalance>[0]['transactions'][number]['rawPayload'] })) });
        return { ...a, type, bankSnapshot: snapshots.get(a.id), balance: balance === null ? null : normalizeAccountBalanceSign(type, balance) };
    });
}
async function loadAdviserReportRows(workspaceId: string, timeZone: string) {
    const records = await prisma.transaction.findMany({
        where: buildActiveWorkspaceTransactionWhere(workspaceId), select: reportTransactionSelect(workspaceId),
    });
    return { records, reportRows: normalizeReportRows(records, timeZone) };
}

export async function loadAdviserBudgetBaseline(input: {
    workspaceId: string; currency: string; timeZone: string; now: Date; chart?: boolean;
}) {
    const { workspaceId, currency, timeZone, now, chart } = input;
    const window = adviserFactWindow('last 30 days', now, timeZone);
    const { reportRows } = await loadAdviserReportRows(workspaceId, timeZone);
    const spending = adviserSpendingFacts(reportRows, currency, window, null);
    if (!spending.rowCount) {
        return { reply: `I don’t see any recorded ${currency} spending in the last 30 days to use as a baseline.`, visualization: null };
    }
    const top = spending.categories.slice(0, 3);
    const money = (amount: number) => adviserFactMoney(amount, currency);
    const largest = top[0];
    return {
        reply: `You recorded ${money(spending.total)} in spending over the last 30 days, excluding transfers. ${largest.label} was the largest category at ${money(largest.amount)}. Use that history as a starting point and add any bills Clover hasn’t seen yet.`,
        visualization: (chart ?? top.length > 1) ? {
            title: 'Top spending categories in the last 30 days', currency,
            ...adviserChartWindow(window.from, window.to, timeZone),
            bars: top.map(({ label, amount }) => ({ label: label.slice(0, 100), amount })),
        } : null,
    };
}

/** Authorized read-only fact path. The caller must verify active Profile access first. */
export async function answerAdviserFact(input: {
    workspaceId: string;
    profileName: string;
    question: string;
    regionalPreferences: unknown;
    contextCurrency?: string;
    otherCurrencies?: string[];
    localCurrency?: string;
    now: Date;
}) {
    const intent = adviserFactIntent(input.question);
    if (!intent)
        return null;
    const { baseCurrency, timeZone } = normalizeRegionalPreferences(input.regionalPreferences);
    const currency = adviserRequestedCurrency(input.question) ??
        (input.contextCurrency && /^[A-Z]{3}$/.test(input.contextCurrency) ? input.contextCurrency : baseCurrency);
    const grounding = { workspaceId: input.workspaceId, profile: input.profileName, currency, timeZone, asOf: input.now.toISOString() };
    const action = (href: string, label: string, id = 'fact-source') => ({ id, kind: 'navigate', type: 'navigate', label, description: '', href });
    const suggestions = (input.otherCurrencies ?? []).filter(code => code !== currency && adviserRequestedCurrency(code) === code)
        .slice(0, 3).map(code => ({ id: `fact-currency-${code}`, group: 'currency', label: `Show in ${code}`, prompt: `In ${code}` }));
    if (input.localCurrency && input.localCurrency !== currency && input.otherCurrencies?.includes(input.localCurrency) &&
        adviserRequestedCurrency(input.localCurrency) === input.localCurrency) {
        const alternate = suggestions.findIndex(item => item.id === `fact-currency-${input.localCurrency}`);
        if (alternate >= 0) suggestions.splice(alternate, 1);
        suggestions.unshift({
            id: 'fact-local-currency', group: 'currency',
            label: `Use local currency (${input.localCurrency})`, prompt: 'In my local currency',
        });
        suggestions.length = Math.min(suggestions.length, 3);
    }
    const common = { answerSource: 'local', actions: [] as ReturnType<typeof action>[], suggestions, grounding };
    try {
        if (intent !== 'spending' && intent !== 'cash' && /\ball currencies\b/i.test(input.question))
            return { ...common, reply: 'Please choose a currency for this answer. I can show each currency separately; I will not add unconverted amounts together.', visualization: null, requiresInput: 'currency' };
        if (intent === 'spending' || intent === 'cashflow' || intent === 'spending-change') {
            const { records, reportRows } = await loadAdviserReportRows(input.workspaceId, timeZone);
            if (intent === 'spending-change') {
                const calendarMonth = /\bthis month\b/i.test(input.question);
                const { recent, earlier, current, previous, change, drivers } = adviserSpendingComparison(reportRows, currency, input.now, timeZone, calendarMonth);
                const money = (amount: number) => adviserFactMoney(amount, currency);
                const scope = calendarMonth ? 'the same number of days at the start of each month' : 'two consecutive 30-day periods';
                const hasBoth = current.rowCount > 0 && previous.rowCount > 0;
                let reply = 'I don’t see recorded spending in either period.';
                if (hasBoth) {
                    const direction = change > 0 ? 'more' : 'less';
                    reply = change === 0
                        ? `Your recorded spending was the same in both periods at ${money(current.total)}.`
                        : `You spent ${money(Math.abs(change))} ${direction} in the recent period (${money(current.total)} versus ${money(previous.total)}).`;
                } else if (current.rowCount || previous.rowCount) {
                    const recorded = current.rowCount ? 'recent' : 'earlier';
                    const missing = current.rowCount ? 'earlier' : 'recent';
                    reply = `I see ${money(current.rowCount ? current.total : previous.total)} in the ${recorded} period. There’s no recorded spending in the ${missing} period to compare it with.`;
                }
                const explainDrivers = asksForSpendingDrivers(input.question);
                const topDrivers = drivers.slice(0, 3);
                const directionLabel = (delta: number) => delta > 0 ? 'up' : 'down';
                if (explainDrivers && hasBoth) {
                    reply = topDrivers.length
                        ? `Here’s where recorded spending changed most:\n\n${topDrivers.map(({ label, change: delta }) =>
                            `• ${label} was ${directionLabel(delta)} ${money(Math.abs(delta))}.`).join('\n')}\n\n${reply}`
                        : 'Recorded spending stayed the same in every category across these periods.';
                }
                const bars = explainDrivers
                    ? topDrivers.map(({ label, change: delta }) => ({
                        label: `${label.slice(0, 92)} (${directionLabel(delta)})`, amount: Math.abs(delta),
                    }))
                    : [{ label: 'Earlier period', amount: previous.total }, { label: 'Recent period', amount: current.total }];
                const visualization = hasBoth && bars.length && !declinesChart(input.question) ? {
                    title: explainDrivers ? 'Biggest changes by category' : 'Spending comparison',
                    currency, ...adviserChartWindow(earlier.from, recent.to, timeZone),
                    bars,
                    hideReportLink: true as const,
                } : null;
                const actions = [earlier, recent].map((period, index) => {
                    const params = new URLSearchParams({ section: 'spending', range: 'custom', from: period.from, to: period.to, currency, transfers: 'exclude' });
                    return action('/reports?' + params, index ? 'View recent spending' : 'View earlier spending', `spending-period-${index}`);
                });
                return { ...common, reply: `${reply} I compared ${scope}, excluding transfers.\n\n${earlier.from} to ${earlier.to} · ${recent.from} to ${recent.to} · ${currency}`, actions, visualization };
            }
            const window = adviserFactWindow(input.question, input.now, timeZone);
            if (intent === 'spending' && asksForMultipleCurrencies(input.question) && !adviserRequestedCurrency(input.question)) {
                const totals = adviserSpendingByCurrency(reportRows, window, currency);
                const listed = totals.slice(0, 8);
                const reportAction = (code: string) => {
                    const params = new URLSearchParams({ section: 'spending', range: 'custom', from: window.from, to: window.to, currency: code, transfers: 'exclude' });
                    return action('/reports?' + params, `Open ${code} report`, `spending-currency-${code}`);
                };
                const breakdown = listed.map(item => `• ${item.currency} · ${adviserFactMoney(item.total, item.currency)}`).join('\n');
                const title = totals.length ? 'Here’s what you spent in each currency, excluding transfers.' : 'I don’t see recorded spending for this period.';
                const next = totals.length && !declinesChart(input.question) ? 'Pick a currency for a category chart.' : '';
                const remaining = totals.length > listed.length ? `Ask for a specific currency to see the other ${totals.length - listed.length}.` : '';
                return {
                    ...common,
                    reply: [title, breakdown, remaining, next, `${input.profileName} · ${window.from} to ${window.to}`].filter(Boolean).join('\n\n'),
                    actions: listed.slice(0, 3).map(item => reportAction(item.currency)),
                    suggestions: listed.filter(item => adviserRequestedCurrency(item.currency) === item.currency).slice(0, 3).map(({ currency: code }) =>
                        ({ id: `fact-currency-${code}`, group: 'currency', label: `Show ${code} breakdown`, prompt: `In ${code}` })),
                    visualization: null,
                };
            }
            if (intent === 'cashflow') {
                const totals = { income: 0, expense: 0, count: 0 };
                for (const row of reportRows) {
                    if (row.currency !== currency || row.date < window.from || row.date > window.to || row.type === 'transfer') continue;
                    totals[row.type] += row.amount;
                    totals.count++;
                }
                const money = (amount: number) => adviserFactMoney(amount, currency);
                const scope = `${input.profileName} · ${window.from} to ${window.to} · ${currency}`;
                const reply = totals.count
                    ? `You recorded ${money(totals.income)} in income and ${money(totals.expense)} in spending. That leaves ${money(totals.income - totals.expense)} in net cash flow, excluding transfers.`
                    : 'I don’t see recorded income or spending for this period and currency.';
                const params = new URLSearchParams({ section: 'overview', range: 'custom', from: window.from, to: window.to, currency, transfers: 'exclude' });
                const visualization = totals.count && !declinesChart(input.question) ? {
                    title: 'Income and spending', currency, ...adviserChartWindow(window.from, window.to, timeZone),
                    bars: [{ label: 'Income', amount: totals.income }, { label: 'Spending', amount: totals.expense }],
                    hideReportLink: true as const,
                } : null;
                return { ...common, reply: `${reply}\n\n${scope}`, actions: [action('/reports?' + params, 'View matching report')], visualization, financialFacts: { intent, currency, ...window, ...totals } };
            }
            const requestedCount = adviserTopCount(input.question);
            const facts = adviserSpendingFacts(reportRows, currency, window, requestedCount);
            const lastRecordedDay = reportRows.reduce<string | undefined>((latest, row) =>
                row.type === 'expense' && row.currency === currency && row.date >= window.from && row.date <= window.to && (!latest || row.date > latest) ? row.date : latest, undefined);
            const scope = `${input.profileName} · ${window.from} to ${window.to} · ${currency}`;
            const params = new URLSearchParams({ section: 'spending', range: 'custom', from: window.from, to: window.to, currency, transfers: 'exclude' });
            const chartBars = facts.categories.slice(0, 6).map(category => ({ label: category.label.slice(0, 100), amount: category.amount }));
            if (facts.categories.length > 6) chartBars.push({
                label: 'Other categories',
                amount: facts.categories.slice(6).reduce((sum, category) => sum + category.amount, 0),
            });
            const showChart = !declinesChart(input.question) && (asksForChart(input.question) || /\b(?:categories|breakdown)\b/i.test(input.question));
            const visualization = showChart && facts.rowCount ? {
                title: requestedCount ? `Top ${facts.categories.length} spending categories` : 'Spending by category',
                currency, ...adviserChartWindow(window.from, window.to, timeZone), bars: chartBars,
            } : null;
            const actions = [action('/reports?' + params, 'View matching report')];
            // The transaction filter uses persisted category IDs and direction.
            // Offer a shortcut only when those filters can reproduce the report's rows.
            const reportCategoryRows = new Map<string, Set<string>>();
            const storedCategoryRows = new Map<string, Set<string>>();
            const addRow = (groups: Map<string, Set<string>>, name: string, id: string) => {
                const ids = groups.get(name) ?? new Set<string>();
                ids.add(id);
                groups.set(name, ids);
            };
            for (const [index, row] of reportRows.entries()) {
                if (row.currency !== currency || row.date < window.from || row.date > window.to) continue;
                if (row.type === 'expense') addRow(reportCategoryRows, row.category, row.id);
                const record = records[index];
                const name = record.category?.name;
                if (record.type === 'expense' && name && name !== 'Transfer' && name !== 'Transfers') {
                    addRow(storedCategoryRows, name, row.id);
                }
            }
            const uniqueCategories = [...new Map(records.flatMap(record =>
                record.category ? [[record.category.id, record.category] as const] : [],
            )).values()];
            for (const [index, category] of facts.categories.slice(0, 3).entries()) {
                const expected = reportCategoryRows.get(category.label);
                const actual = storedCategoryRows.get(category.label);
                if (!expected || !actual || actual.size !== expected.size || [...expected].some(id => !actual.has(id))) continue;
                const query = reportTransactionParams(defaultReportView, currency, window.from, window.to, uniqueCategories, { category: category.label, type: 'expense' });
                actions.push(action('/transactions?' + query, `View ${category.label} transactions`, `fact-category-${index}`));
            }
            const money = (amount: number) => adviserFactMoney(amount, currency);
            const top = facts.categories.slice(0, 6);
            const showCategories = /\b(?:categor(?:y|ies)|breakdown)\b/i.test(input.question);
            const breakdown = showCategories && top.length
                ? `\n\n${top.map(category => `• ${category.label} — ${money(category.amount)}`).join('\n')}`
                : '';
            const summary = facts.rowCount
                ? `You spent ${money(facts.total)} in this period, excluding transfers.`
                : 'There’s no recorded spending for this period and currency.';
            return { ...common, actions, reply: `${summary}${breakdown}\n\n${scope}`, grounding: { ...grounding, transactionCount: facts.rowCount, historyThrough: lastRecordedDay }, visualization, financialFacts: { intent, ...window, currency, ...facts } };
        }
        if (intent === 'payments') {
            const window = adviserPaymentWindow(input.question, input.now, timeZone);
            const records = await prisma.financialCommitment.findMany({ where: { workspaceId: input.workspaceId, status: 'active' }, include: { occurrences: { select: { dueDate: true, completedAt: true } } } });
            const commitments = records.map(r => ({ ...serializeFinancialCommitment(r), completedPaymentDates: r.occurrences.map(o => o.dueDate.toISOString().slice(0, 10)) }));
            const payments = adviserPaymentFacts(commitments, window, currency);
            const unknownDates = commitments.filter(c => c.currency === currency && c.kind !== 'receivable' && !/suggest|infer|candidate/i.test(c.source) && !c.dueDate && !c.nextDueDate && !c.plannedPaymentDate).length;
            const actions = [action('/recurring', 'Review confirmed payments')];
            for (const payment of [...new Map(payments.map(payment => [payment.id, payment])).values()].slice(0, 3)) {
                actions.push(action('/recurring?commitment=' + encodeURIComponent(payment.id), `Open ${payment.label}`, `fact-payment-${payment.id}`));
            }
            const showAll = /\b(?:show|list) (?:me )?all\b/i.test(input.question);
            const listed = showAll ? payments : payments.slice(0, 5);
            const additional = payments.length - listed.length;
            const bars = listed.filter(p => p.amount !== null && p.amount > 0).slice(0, 6).map(p => ({
                label: `${p.label.slice(0, 80)} · ${p.date}`,
                amount: p.amount!,
            }));
            const visualization = asksForChart(input.question) && bars.length
                ? { title: 'Upcoming payments with recorded amounts', currency, ...adviserChartWindow(window.from, window.to, timeZone), bars, hideReportLink: true as const }
                : null;
            const summary = payments.length
                ? `You have ${payments.length} confirmed, unpaid ${payments.length === 1 ? 'payment' : 'payments'} in this window.`
                : 'I don’t see any confirmed, unpaid payments with recorded dates in this window.';
            const details = listed.map(p => `• ${p.label} — ${p.amount === null ? 'amount unknown' : adviserFactMoney(p.amount, currency)} on ${p.date}${p.date !== p.dueDate ? ` (due ${p.dueDate})` : ''}`);
            const limitations = [
                additional ? `See ${additional} more in Recurring.` : '',
                unknownDates ? `${unknownDates} without recorded dates could not be included.` : '',
            ].filter(Boolean);
            const scope = `${input.profileName} · ${window.from} to ${window.to} · ${currency}`;
            return { ...common, actions, reply: [summary, details.join('\n'), ...limitations, scope].filter(Boolean).join('\n\n'), visualization, financialFacts: { intent, ...window, currency, payments } };
        }
        const accounts = await loadAdviserAccountFacts(input.workspaceId);
        if (asksForMultipleCurrencies(input.question) && !adviserRequestedCurrency(input.question)) {
            const spendableAccounts = accounts.filter(account => spendableAccountTypes.includes(account.type));
            const codes = [...new Set(spendableAccounts.map(account => account.currency))]
                .sort((a, b) => Number(b === currency) - Number(a === currency) || a.localeCompare(b));
            const listed = codes.slice(0, 8);
            const lines = listed.map(code => {
                const group = spendableAccounts.filter(account => account.currency === code);
                const facts = adviserCashFacts(group, code);
                const stale = group.some(({ bankSnapshot }) => bankSnapshot &&
                    (bankSnapshot.bankConnectionStatus === 'disconnected' || +input.now - Date.parse(bankSnapshot.bankBalanceAt) > 2 * 86400000));
                const amount = facts.unknown === group.length ? 'balance unavailable' : adviserFactMoney(facts.values[1] ?? 0, code);
                const qualifier = facts.unknown && facts.unknown < group.length ? ' (known balances only)' : '';
                return `• ${code} · ${amount}${qualifier}${stale ? ' · includes an older linked balance' : ''}`;
            });
            const heading = codes.length ? 'Here’s your spendable cash by currency, before upcoming bills.'
                : 'I don’t see bank, wallet, or cash accounts to summarize in this Profile.';
            const remaining = codes.length > listed.length ? `Ask for a specific currency to see the other ${codes.length - listed.length}.` : '';
            const chartHint = codes.length && !declinesChart(input.question) ? 'Pick one currency to chart its account balances.' : '';
            return {
                ...common,
                reply: [heading, lines.join('\n'), remaining, chartHint, input.profileName].filter(Boolean).join('\n\n'),
                actions: [action('/accounts', 'Check Accounts')],
                suggestions: listed.filter(code => adviserRequestedCurrency(code) === code).slice(0, 3).map(code => ({
                    id: `cash-currency-${code}`, group: 'currency', label: `Show ${code} accounts`, prompt: `In ${code}`,
                })),
                visualization: null,
            };
        }
        if (!accounts.some(a => a.currency === currency))
            return { ...common, reply: `No ${currency} accounts are recorded in ${input.profileName}, so I cannot provide an available-cash balance in that currency. Choose one of this Profile’s recorded account currencies.`, visualization: null, dataUnavailable: true, requiresInput: 'currency' };
        const facts = adviserCashFacts(accounts, currency);
        const amount = facts.values[1];
        const snapshotDates = accounts.flatMap(account => account.currency === currency && account.bankSnapshot ? [account.bankSnapshot] : []);
        const staleSnapshots = snapshotDates.filter(snapshot => snapshot.bankConnectionStatus === 'disconnected' || +input.now - Date.parse(snapshot.bankBalanceAt) > 2 * 86400000);
        const oldestSnapshot = staleSnapshots.map(snapshot => snapshot.bankBalanceAt).sort()[0];
        const freshness = oldestSnapshot ? ` ${staleSnapshots.length} linked balance(s) use older or disconnected snapshots, dating back to ${reportDay(new Date(oldestSnapshot), timeZone)}.` : '';
        const money = adviserFactMoney(amount ?? 0, currency);
        const summary = facts.unknown
            ? `I can verify ${money} in spendable cash. ${facts.unknown} account balances are unavailable, so this is a subtotal.`
            : `You have ${money} in spendable cash across your bank, wallet, and cash accounts, before upcoming bills.`;
        const balances = accounts.flatMap(account =>
            account.currency === currency && spendableAccountTypes.includes(account.type) && account.balance !== null && Number.isFinite(account.balance) && account.balance > 0
                ? [{ label: account.name.slice(0, 100), amount: account.balance }]
                : [],
        ).sort((a, b) => b.amount - a.amount);
        const bars = balances.slice(0, 6);
        if (balances.length > 6) bars.push({ label: 'Other spendable accounts', amount: balances.slice(6).reduce((sum, account) => sum + account.amount, 0) });
        const day = reportDay(input.now, timeZone);
        const visualization = asksForChart(input.question) && bars.length
            ? { title: 'Spendable cash by account', currency, ...adviserChartWindow(day, day, timeZone), bars, hideReportLink: true as const }
            : null;
        return { ...common, actions: [action('/accounts?currency=' + currency, 'Check Accounts')], reply: `${summary}${freshness}\n\n${input.profileName} · ${currency}`, visualization, financialFacts: { intent, currency, spendable: amount, unknown: facts.unknown, accounts: accounts.filter(a => a.currency === currency).map(a => ({ id: a.id, name: a.name, type: a.type, currency: a.currency, balance: a.balance })) } };
    }
    catch (error) {
        // A failed read is not an empty ledger. Never fall through to stale prompt context or a model-generated breakdown.
        const invalid = error instanceof Error && /Please choose|Choose a payment window/.test(error.message);
        return { ...common, reply: invalid ? (error as Error).message : `I couldn't retrieve a complete ${intent === 'spending' ? 'spending breakdown' : intent === 'cashflow' ? 'cash flow summary' : intent === 'payments' ? 'payment schedule' : 'account balance'} for ${input.profileName}. Please retry; I won't substitute older summaries or estimate missing figures.`, visualization: null, dataUnavailable: !invalid, requiresInput: invalid ? 'date_window' : undefined };
    }
}
