import { prisma } from './prisma';
import { buildActiveWorkspaceTransactionWhere } from './transaction-query';
import { normalizeReportRows, reportTransactionSelect } from './report-rows';
import { reportAccountBalance } from './report-balances';
import { accountSectionType } from '../../shared/account-presentation';
import { normalizeAccountBalanceSign } from './account-balance';
import { finverseBalances } from './finverse-balances';
import { serializeFinancialCommitment } from './commitments';
import { normalizeRegionalPreferences } from './regional-preferences';
import { adviserFactIntent, adviserFactWindow, adviserTopCount, adviserSpendingFacts, adviserPaymentWindow, adviserPaymentFacts, adviserCashFacts, adviserFactMoney } from './adviser-facts';
export async function loadAdviserAccountFacts(workspaceId: string) {
    const [accounts, snapshots] = await Promise.all([
        prisma.account.findMany({ where: { workspaceId }, include: { transactions: { where: { deletedAt: null, isExcluded: false }, select: { id: true, date: true, createdAt: true, amount: true, currency: true, type: true, merchantRaw: true, merchantClean: true, description: true, rawPayload: true } }, statementCheckpoints: true } }),
        finverseBalances(workspaceId),
    ]);
    return accounts.map(a => {
        const type = accountSectionType(a);
        const balance = snapshots.has(a.id) ? Number(snapshots.get(a.id)!.bankBalance) : reportAccountBalance({ ...a, type, transactions: a.transactions.map(t => ({ ...t, amount: t.amount.toString(), rawPayload: t.rawPayload as Parameters<typeof reportAccountBalance>[0]['transactions'][number]['rawPayload'] })) });
        return { ...a, type, balance: balance === null ? null : normalizeAccountBalanceSign(type, balance) };
    });
}
/** Authorized read-only fact path. The caller must verify active Profile access first. */
export async function answerAdviserFact(input: {
    workspaceId: string;
    profileName: string;
    question: string;
    regionalPreferences: unknown;
    now: Date;
}) {
    const intent = adviserFactIntent(input.question);
    if (!intent)
        return null;
    const { baseCurrency, timeZone } = normalizeRegionalPreferences(input.regionalPreferences);
    // Currency codes only; words such as "the" must never become a currency.
    const requested = input.question.match(/\b(PHP|USD|EUR|GBP|SGD|HKD|JPY|AUD|CAD|CNY|INR|MYR|IDR|THB|VND|AED)\b/i)?.[1]?.toUpperCase();
    const currency = requested ?? (/₱/.test(input.question) ? 'PHP' : baseCurrency);
    const grounding = { workspaceId: input.workspaceId, profile: input.profileName, currency, timeZone, asOf: input.now.toISOString() };
    const action = (href: string, label: string) => [{ id: 'fact-source', kind: 'navigate', type: 'navigate', label, description: '', href }];
    const common = { answerSource: 'local', actions: [] as ReturnType<typeof action>, suggestions: [], grounding };
    try {
        if (/\ball currencies\b/i.test(input.question))
            return { ...common, reply: 'Please choose a currency for this answer. I can show each currency separately; I will not add unconverted amounts together.', visualization: null, requiresInput: 'currency' };
        if (intent === 'spending') {
            const window = adviserFactWindow(input.question, input.now, timeZone);
            const records = await prisma.transaction.findMany({ where: buildActiveWorkspaceTransactionWhere(input.workspaceId), select: reportTransactionSelect(input.workspaceId) });
            const facts = adviserSpendingFacts(normalizeReportRows(records, timeZone), currency, window, adviserTopCount(input.question));
            const scope = `${input.profileName} · ${window.from} to ${window.to} · ${currency}`;
            const params = new URLSearchParams({ section: 'spending', range: 'custom', from: window.from, to: window.to, currency, transfers: 'exclude' });
            const visualization = facts.rowCount ? { title: `Spending categories · ${window.from} to ${window.to}`, currency, from: window.from + 'T00:00:00.000Z', through: window.to + 'T23:59:59.999Z', bars: facts.allCategories.slice(0, 6).concat(facts.allCategories.length > 6 ? [{ label: 'Other categories', amount: facts.allCategories.slice(6).reduce((s, c) => s + c.amount, 0) }] : []) } : null;
            return { ...common, actions: action('/reports?' + params, 'View matching report'), reply: `${scope}\n\n${facts.rowCount ? facts.categories.map((c, i) => `${i + 1}. ${c.label}: ${adviserFactMoney(c.amount, currency)}`).join('\n') : 'No recorded expenses were found for this Profile, currency, and period.'}\n\nTotal recorded expenses: ${adviserFactMoney(facts.total, currency)}. Transfers are excluded; income is not spending. Only ${currency} transactions are included.`, grounding: { ...grounding, transactionCount: facts.rowCount, historyThrough: window.to }, visualization, financialFacts: { intent, ...window, currency, ...facts } };
        }
        if (intent === 'payments') {
            const window = adviserPaymentWindow(input.question, input.now, timeZone);
            const records = await prisma.financialCommitment.findMany({ where: { workspaceId: input.workspaceId, status: 'active' }, include: { occurrences: { select: { dueDate: true, completedAt: true } } } });
            const commitments = records.map(r => ({ ...serializeFinancialCommitment(r), completedPaymentDates: r.occurrences.map(o => o.dueDate.toISOString().slice(0, 10)) }));
            const payments = adviserPaymentFacts(commitments, window, currency);
            const unknownDates = commitments.filter(c => c.currency === currency && c.kind !== 'receivable' && !/suggest|infer|candidate/i.test(c.source) && !c.dueDate && !c.nextDueDate && !c.plannedPaymentDate).length;
            return { ...common, actions: action('/recurring', 'Review confirmed payments'), reply: `${input.profileName} · ${window.from} to ${window.to} (next ${window.days} calendar days) · ${currency}\n\n${payments.length ? payments.map(p => `${p.label}: ${p.amount === null ? 'amount not recorded' : adviserFactMoney(p.amount, currency)} · ${p.date}${p.date !== p.dueDate ? ` (due ${p.dueDate})` : ''}`).join('\n') : 'No confirmed unpaid payments with recorded dates were found in this window.'}\n\nOnly active, recorded commitments are included. Unconfirmed suggestions and completed payments are excluded.${unknownDates ? ` ${unknownDates} commitment(s) have no recorded date and cannot be placed in this window.` : ''} Other currencies are not combined.`, visualization: null, financialFacts: { intent, ...window, currency, payments } };
        }
        const accounts = await loadAdviserAccountFacts(input.workspaceId);
        const facts = adviserCashFacts(accounts, currency);
        const amount = facts.values[1];
        return { ...common, actions: action('/accounts?currency=' + currency, 'Check Accounts'), reply: `${input.profileName} · ${currency}\n\n${facts.unknown ? 'Known spendable subtotal' : 'Available cash (Accounts Spendable)'}: ${adviserFactMoney(amount ?? 0, currency)}.\n\nThis matches Accounts’ Spendable total: positive bank, wallet, and cash balances. Investments and debts are excluded.${facts.unknown ? ` ${facts.unknown} account balance(s) are unavailable; this is a subtotal, not a complete balance.` : ''} Only ${currency} accounts are included; other currencies are not added without conversion. Spendable is not an estimate of what is safe to spend after bills.`, visualization: null, financialFacts: { intent, currency, spendable: amount, unknown: facts.unknown, accounts: accounts.filter(a => a.currency === currency).map(a => ({ id: a.id, name: a.name, type: a.type, currency: a.currency, balance: a.balance })) } };
    }
    catch (error) {
        // A failed read is not an empty ledger. Never fall through to stale prompt context or a model-generated breakdown.
        const invalid = error instanceof Error && /Please choose|Choose a payment window/.test(error.message);
        return { ...common, reply: invalid ? (error as Error).message : `I couldn't retrieve a complete ${intent === 'spending' ? 'spending breakdown' : intent === 'payments' ? 'payment schedule' : 'account balance'} for ${input.profileName}. Please retry; I won't substitute older summaries or estimate missing figures.`, visualization: null, dataUnavailable: !invalid, requiresInput: invalid ? 'date_window' : undefined };
    }
}
