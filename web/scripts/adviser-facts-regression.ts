import { mock } from "node:test";
import { answerAdviserFact } from "../lib/adviser-facts.server";
import { prisma } from "../lib/prisma";
import { askCloverCorePrompts } from "../../shared/ask-clover-examples";
import { analyzeReport, defaultReportView, reportPeriod } from "../../shared/reports/analysis";
import { consolidatedAccountSummary } from "../../shared/account-summary";
import { reportAccountBalance } from "../lib/report-balances";
import { askCloverExamples } from "../../shared/ask-clover-examples";
import { adviserBeforePaydayWindow, adviserExplicitPayday, asksForGcashSpending } from "../lib/adviser-facts";
import { getGoalProgressSnapshot } from "../lib/goals";
import { calendarDayStart, calendarQueryRange } from '../lib/calendar-query-window';
import assert from 'node:assert/strict';
import { adviserFactIntent, adviserSpendingByCurrency, asksForMultipleCurrencies, adviserSpendingComparison, asksForSpendingDrivers, adviserRequestedCurrency, declinesChart, adviserFactWindow, adviserPaymentWindow, adviserSpendingFacts, adviserTopCount, adviserPaymentFacts, adviserCashFacts, resolveAdviserFactQuestion } from '../lib/adviser-facts';
import { getTransactionSummaryTypeOverrides } from '../lib/transaction-summary';
import { buildAdviserChart } from '../lib/adviser-chart';
import { parseAdviserChart, adviserChartPeriodLabel, adviserChartReportHref } from '../../shared/adviser-chart';
import { serializeFinancialCommitment } from '../lib/commitments';
import { adviserCircleCurrencyFollowUp, adviserCircleQuestion, answerAdviserAccount, answerAdviserCircle, answerAdviserGoals, isAdviserGoalStatusQuestion } from '../lib/adviser-page-answer';
import { askPageContext } from '../../shared/ask-clover-page';
const now = new Date('2026-10-26T04:00:00Z');
const [sweldo, payday, gcash] = askCloverExamples;
assert.deepEqual(askCloverCorePrompts.map(example => adviserFactIntent(example.label)), ["spending", "payments", "cash"]);
assert.deepEqual(askCloverExamples.map(example => adviserFactIntent(example.label)), ["spending", "payments", "spending"]);
assert.equal(adviserFactIntent(`Add a transaction for “${sweldo.label}”`), null);
assert.deepEqual(adviserBeforePaydayWindow("2026-02-25", 31), {
  from: "2026-02-25", to: "2026-02-27", payday: "2026-02-28",
});
assert.deepEqual(adviserBeforePaydayWindow("2026-02-28", 31), {
  from: "2026-02-28", to: "2026-03-30", payday: "2026-03-31",
});
const everydayFollowUp = (question: string, latest: string) => resolveAdviserFactQuestion(latest, [
  { role: "user", content: question }, { role: "user", content: latest },
]);
assert.equal(adviserExplicitPayday(everydayFollowUp(payday.label, "2026-11-15")), "2026-11-15");
const gcashCurrencyFollowUp = everydayFollowUp(gcash.label, "In PHP");
assert.ok(asksForGcashSpending(gcashCurrencyFollowUp));
assert.equal(adviserRequestedCurrency(gcashCurrencyFollowUp), "PHP");
assert.match(gcashCurrencyFollowUp, /last month/i);
assert.equal(askPageContext('/accounts/institutions/bpi').accountId, undefined);
assert.equal(askPageContext('/accounts/account-1').accountId, 'account-1');
assert.match(answerAdviserAccount({ name: 'Bank', currency: 'PHP', balance: 50, bankSnapshot: {
    bankBalanceAt: '2026-10-20T18:00:00Z', bankConnectionStatus: 'disconnected',
} }, now, 'Asia/Manila'), /2026-10-21.*unlinked/);
assert.match(answerAdviserAccount({ name: 'Bank', currency: 'PHP', balance: null }, now, 'Asia/Manila'), /don’t have a recorded balance/);
const mixedCircle = { name: 'Trip', expenseCurrencyTotals: { PHP: 100, USD: 20 }, contributionCurrencyTotals: {} };
const mixedChart = answerAdviserCircle(mixedCircle, { from: '2026-10-01', to: '2026-10-31' }, 'Chart shared expenses', true);
assert.match(mixedChart.reply, /PHP.*USD.*Choose a currency/);
assert.equal(mixedChart.visualization, null);
for (const q of ['What were my three biggest spending categories last month?', 'Show my spending by category for September 1–30, 2026, excluding transfers.']) {
    assert.equal(adviserFactIntent(q), 'spending');
    assert.deepEqual(adviserFactWindow(q, now, 'Asia/Manila'), { from: '2026-09-01', to: '2026-09-30' });
}
assert.deepEqual(adviserFactWindow('September 2 to 29 2026 spending', now, 'UTC'), { from: '2026-09-02', to: '2026-09-29' });
assert.deepEqual(adviserFactWindow('last month', new Date('2026-10-31T23:30Z'), 'Asia/Manila'), { from: '2026-10-01', to: '2026-10-31' });
assert.throws(() => adviserFactWindow('2026-09-30 to 2026-09-01', now, 'UTC'));
assert.throws(() => adviserFactWindow('September 1–31 2026', now, 'UTC'));
assert.equal(adviserTopCount('my three biggest spending categories'), 3);
assert.equal(adviserTopCount('top 5 categories'), 5);
assert.equal(adviserFactIntent('Which payments are due in the next 30 days?'), 'payments');
assert.equal(adviserFactIntent("What's due in the next 30 days?"), 'payments');
assert.deepEqual(adviserFactWindow('May I see my spending categories last month?', now, 'Asia/Manila'), { from: '2026-09-01', to: '2026-09-30' });
assert.deepEqual(adviserFactWindow('Spending categories in May', now, 'Asia/Manila'), { from: '2026-05-01', to: '2026-05-31' });
assert.equal(adviserFactIntent('How much available cash do I have?'), 'cash');
assert.equal(adviserFactIntent('How much can I spend on food?'), null);
assert.deepEqual(adviserPaymentWindow('next 30 days', now, 'Asia/Manila'), { from: '2026-10-26', to: '2026-11-24', days: 30 });
assert.throws(() => adviserPaymentWindow('next 999 days', now, 'UTC'));
const row = { id: 'a', accountId: 'one', date: '2026-09-10', amount: '100', currency: 'PHP', type: 'expense' as const, categoryName: 'Transfers', rawPayload: { transferPairId: 'pair', amountDelta: -100 } };
const other = { ...row, id: 'b', accountId: 'two', type: 'income' as const, rawPayload: { transferPairId: 'pair', amountDelta: 100 } };
assert.deepEqual([...getTransactionSummaryTypeOverrides([row, other]).values()], ['transfer', 'transfer']);
for (const change of [{ currency: 'USD' }, { accountId: 'one' }, { amount: '101' }, { amount: 'invalid' }, { date: '2026-09-30' }, { reviewStatus: 'edited' }])
    assert.equal(getTransactionSummaryTypeOverrides([row, { ...other, ...change }]).size, 0);
assert.equal(getTransactionSummaryTypeOverrides([row]).size, 0);
assert.equal(getTransactionSummaryTypeOverrides([row, other, { ...other, id: 'third' }]).size, 0);
assert.equal(getTransactionSummaryTypeOverrides([{ ...row, rawPayload: {} }]).size, 0, 'An external payment is not internal merely because its category says Transfers');
const reimbursement = { ...row, merchantRaw: 'Reimbursement from a member', rawPayload: { splitBillId: 'bill', amountDelta: 100 } };
assert.equal(getTransactionSummaryTypeOverrides([reimbursement]).get('a'), 'income');
assert.equal(getTransactionSummaryTypeOverrides([{ ...reimbursement, reviewStatus: 'edited' }]).size, 0);
const reportRow = { id: 'r', accountId: 'one', account: 'Cash', merchant: 'Food', date: '2026-09-01', amount: 10, currency: 'PHP', type: 'expense' as const, category: 'Food' };
const facts = adviserSpendingFacts([reportRow, { ...reportRow, id: 'last', date: '2026-09-30', amount: 20 }, { ...reportRow, id: 'outside', date: '2026-08-31', amount: 1000 }, { ...reportRow, id: 'fx', currency: 'USD', amount: 1000 }, { ...reportRow, id: 'transfer', type: 'transfer', amount: 1000 }], 'PHP', { from: '2026-09-01', to: '2026-09-30' }, 3);
assert.equal(facts.total, 30);
assert.equal(facts.rowCount, 2);
const tutorialRows = [
    { ...reportRow, amount: 2350.445, category: 'Transport' },
    { ...reportRow, id: 'groceries', date: '2026-09-30', amount: 13750.554, category: 'Groceries' },
    { ...reportRow, id: 'food', date: '2026-09-02', amount: 8942.11, category: 'Food' },
    { ...reportRow, id: 'transfer', type: 'transfer' as const, amount: 44619.50, category: 'Transfers' },
    { ...reportRow, id: 'october', date: '2026-10-01', amount: 5000, category: 'Other' },
];
const september = adviserFactWindow('Where did my money go last month?', now, 'Asia/Manila');
const adviserSeptember = adviserSpendingFacts(tutorialRows, 'PHP', september, 3);
const reportSeptember = analyzeReport(tutorialRows, reportPeriod({ ...defaultReportView, range: 'custom', ...september }, '2026-10-26'));
assert.equal(adviserSeptember.total, reportSeptember.current.expense);
assert.deepEqual(adviserSeptember.categories, reportSeptember.categories.map(({ name, amount }) => ({ label: name, amount })));
assert.equal(adviserSeptember.rowCount, 3);
const chart = buildAdviserChart('spending categories', [{ date: new Date('2026-09-02'), amount: 30, currency: 'PHP', type: 'expense', category: { name: 'Food' } }], { from: '2026-09-01T00:00Z', through: '2026-09-30T23:59:59Z' });
assert(parseAdviserChart(chart));
assert.equal(chart?.from, '2026-09-01T00:00Z');
assert.equal(buildAdviserChart('spending', []), null);
const base = { id: 'c', workspaceId: 'w', title: 'Confirmed rent', kind: 'planned_payment' as const, counterparty: null, amount: '100', currency: 'PHP', dueDate: new Date('2026-09-30'), plannedPaymentDate: null, nextDueDate: new Date('2026-09-30'), recurrence: 'monthly' as const, tracking: null, notes: null, accountId: null, transactionId: null, evidenceTransactionIds: [], statementCheckpointId: null, status: 'active' as const, source: 'manual', confidence: 100, createdAt: now, updatedAt: now };
const c = serializeFinancialCommitment(base);
const window = { from: '2026-10-01', to: '2026-11-30' };
assert.deepEqual(adviserPaymentFacts([
    { ...c, id: 'paid', recurrence: 'once', dueDate: '2026-11-10', completedPaymentDates: ['2026-11-10'] },
    { ...c, id: 'due', recurrence: 'once', plannedPaymentDate: '2026-11-06', dueDate: '2026-11-12', source: 'recurring_detection' },
    { ...c, id: 'payday', recurrence: 'once', plannedPaymentDate: '2026-11-11', dueDate: '2026-11-15' },
    { ...c, id: 'reminder', kind: 'reminder', dueDate: '2026-11-12' },
    { ...c, id: 'suggested', recurrence: 'once', dueDate: '2026-11-12', source: 'unconfirmed_suggestion' },
], adviserBeforePaydayWindow('2026-11-08', 15), 'PHP', 'due').map(p => p.id), ['due']);
assert.deepEqual(adviserPaymentFacts([c], window, 'PHP').map(p => p.date), ['2026-10-30', '2026-11-30']);
assert.deepEqual(adviserPaymentFacts([{ ...c, completedPaymentDates: ['2026-10-30'] }], window, 'PHP').map(p => p.date), ['2026-11-30']);
for (const change of [{ status: 'paused' as const }, { kind: 'receivable' as const }, { currency: 'USD' }, { source: 'unconfirmed_suggestion' }])
    assert.equal(adviserPaymentFacts([{ ...c, ...change }], window, 'PHP').length, 0);
assert.equal(adviserPaymentFacts([{ ...c, tracking: { version: 1, amountType: 'fixed', paymentAmount: 100, totalPayments: 1, paymentsMade: 1, endDate: null, debtType: '', balanceDate: null, liabilityAccountId: null, interestRate: null, reminderDays: null, reference: '', monthEnd: false } }], window, 'PHP').length, 0);
const summary = adviserCashFacts([{ type: 'bank', currency: 'PHP', balance: 100 }, { type: 'wallet', currency: 'PHP', balance: -5 }, { type: 'cash', currency: 'PHP', balance: 25 }, { type: 'investment', currency: 'PHP', balance: 1000 }, { type: 'bank', currency: 'USD', balance: 999 }], 'PHP');
assert.equal(summary.values[1], 125);
const checkpointDate = new Date('2026-09-30');
const cashBalance = reportAccountBalance({
    id: 'cash',
    type: 'cash',
    currency: 'PHP',
    source: 'manual',
    balance: '500',
    statementCheckpoints: [{
        endingBalance: '500', status: 'matched', statementEndDate: checkpointDate,
        createdAt: checkpointDate, sourceMetadata: { importMode: 'statement' },
    }],
    transactions: [{
        id: 'paid', date: new Date('2026-10-01'), createdAt: new Date('2026-10-01'), amount: '425', currency: 'PHP', type: 'expense' as const,
        merchantRaw: 'Groceries', merchantClean: 'Groceries', description: null, rawPayload: null,
    }],
});
assert.equal(cashBalance, 75);
const availableAccounts = [
    { type: 'bank', currency: 'PHP', balance: 255763.50 },
    { type: 'cash', currency: 'PHP', balance: cashBalance },
    { type: 'wallet', currency: 'PHP', balance: null },
    { type: 'investment', currency: 'PHP', balance: null },
    { type: 'bank', currency: 'USD', balance: 200 },
];
const available = adviserCashFacts(availableAccounts, 'PHP');
assert.equal(available.values[1], 255838.50);
assert.equal(available.values[1], consolidatedAccountSummary(availableAccounts.filter(row => row.currency === 'PHP'), 'PHP', {}).values[1]);
assert.equal(available.unknown, 1);
assert.equal(available.accountCount, 3);
assert.equal(adviserCashFacts(availableAccounts, 'EUR').accountCount, 0);
console.log('PASS Adviser facts: full calendar windows, exact top-N, currency/transfer exclusions, durable pair proof and negative controls, canonical schedule/completion, chart boundaries and spendable totals.');
const followUp = resolveAdviserFactQuestion('Use September 1–30 2026, excluding transfers.', [{ role: 'user', content: 'What were my three biggest spending categories last month?' }, { role: 'assistant', content: 'Old October summary with 999999 in transfers.' }, { role: 'user', content: 'Use September 1–30 2026, excluding transfers.' }]);
assert.equal(adviserFactIntent(followUp), 'spending');
assert.equal(adviserTopCount(followUp), 3);
assert.deepEqual(adviserFactWindow(followUp, now, 'Asia/Manila'), { from: '2026-09-01', to: '2026-09-30' });
assert.equal(calendarDayStart('2026-09-01', 'Asia/Manila').toISOString(), '2026-08-31T16:00:00.000Z');
const dst = calendarQueryRange({ gte: new Date('2026-11-01'), lte: new Date('2026-11-01T23:59:59.999Z') }, 'America/New_York');
assert.equal(dst.gte!.toISOString(), '2026-11-01T04:00:00.000Z');
assert.equal(dst.lte!.toISOString(), '2026-11-02T04:59:59.999Z');
assert.deepEqual(adviserPaymentWindow('Which payments are due next month?', now, 'Asia/Manila'), { from: '2026-11-01', to: '2026-11-30', days: 30 });
assert.deepEqual(adviserPaymentWindow('Which payments are due from 2026-11-01 to 2026-11-07?', now, 'Asia/Manila'), { from: '2026-11-01', to: '2026-11-07', days: 7 });

assert.equal(adviserPaymentFacts([{...c,kind:'debt',amount:'1000000',tracking:null}],{from:'2026-10-01',to:'2026-10-31'},'PHP')[0].amount,null,'An outstanding debt is not a known installment');

const calendarChart=parseAdviserChart({...chart!,calendarWindow:{from:'2026-09-01',through:'2026-09-30'}})!;
assert.equal(adviserChartPeriodLabel(calendarChart,'en-US'),'9/1/2026 – 9/30/2026');
assert.equal(parseAdviserChart({...calendarChart,calendarWindow:{from:'2026-09-01',through:'2026-09-31'}}),null);
assert.deepEqual(parseAdviserChart(JSON.parse(JSON.stringify(calendarChart)))?.calendarWindow,calendarChart.calendarWindow);

const reportLink=new URL(adviserChartReportHref(calendarChart),'https://clover.ph');assert.equal(reportLink.pathname,'/reports');assert.equal(reportLink.searchParams.get('from'),'2026-09-01');assert.equal(reportLink.searchParams.get('to'),'2026-09-30');assert.equal(reportLink.searchParams.get('currency'),'PHP');

assert.equal(isAdviserGoalStatusQuestion("How are my goals progressing?", false), true);
assert.equal(isAdviserGoalStatusQuestion("How much is left?", false), false);
assert.equal(isAdviserGoalStatusQuestion("How much is left?", true), true);
assert.equal(isAdviserGoalStatusQuestion("Update my savings goal", true), false);
const goalProgress = getGoalProgressSnapshot({
  goalKey: "track_spending", targetAmount: 100, currentNet: -125,
  currentSpend: 125, monthlyIncome: null, currentSavingsRate: null,
  previousSavingsRate: null, spendDelta: null, recurringShare: 0,
}, "PHP");
const goal = {
  id: "goal-1", goal: "track_spending", name: "Spending cap", category: "Spending",
  targetAmount: 100, currency: "PHP", cadence: "monthly" as const, purpose: "", legacy: false,
  progress: goalProgress,
  activity: { start: "2026-09-30T16:00:00.000Z", end: "2026-10-30T16:00:00.000Z", spending: 125, income: 0, investmentFlow: 0 },
};
const goalAnswer = answerAdviserGoals([goal], true);
assert.match(goalAnswer.reply, /125.*100.*25\.00 over/);
assert.deepEqual(parseAdviserChart(goalAnswer.visualization)?.bars, [{ label: "Spent", amount: 125 }, { label: "Limit", amount: 100 }]);
assert.deepEqual(goalAnswer.visualization?.calendarWindow, { from: "2026-10-01", through: "2026-10-30" });
assert.equal(answerAdviserGoals([goal, { ...goal, id: "goal-2", currency: "USD" }], true).visualization, null);

const resolveTurns = (...questions: string[]) => resolveAdviserFactQuestion(
    questions[questions.length - 1],
    questions.flatMap((content, index) => index === questions.length - 1
        ? [{ role: 'user', content }]
        : [{ role: 'user', content }, { role: 'assistant', content: 'Old result in JPY for 2025-01-01.' }]),
);
const spendingChain = ['Top 5 spending categories from 2026-09-01 to 2026-09-30 in PHP', 'What about in USD?', 'Top three instead'];
const chainedChart = resolveTurns(...spendingChain, 'Show me a chart');
assert.equal(adviserFactIntent(chainedChart), 'spending');
assert.equal(adviserRequestedCurrency(chainedChart), 'USD');
assert.equal(adviserTopCount(chainedChart), 3);
assert.deepEqual(adviserFactWindow(chainedChart, now, 'Asia/Manila'), { from: '2026-09-01', to: '2026-09-30' });
assert.match(chainedChart, /show.*chart/i);
const revised = resolveTurns(...spendingChain, 'What about this month?', 'Just the numbers');
assert.deepEqual(adviserFactWindow(revised, now, 'Asia/Manila'), { from: '2026-10-01', to: '2026-10-26' });
assert.equal(adviserRequestedCurrency(revised), 'USD');
assert.equal(adviserTopCount(revised), 3);
assert.equal(declinesChart(revised), true);
assert.equal(declinesChart(resolveTurns(...spendingChain, 'No chart', 'Show that as a chart')), false);
assert.equal(resolveTurns(...spendingChain, 'Book a flight in USD'), 'Book a flight in USD');
assert.equal(resolveTurns(...spendingChain, 'Tell me about investments', 'In USD'), 'In USD');
const paymentsChain = resolveTurns('Which payments are due next month in PHP?', 'What about the next 2 weeks?', 'In SGD');
assert.equal(adviserPaymentWindow(paymentsChain, now, 'Asia/Manila').days, 14);
assert.equal(adviserRequestedCurrency(paymentsChain), 'SGD');

const compareQuestion = 'Did I spend more this month than last month?';
assert.equal(adviserFactIntent(compareQuestion), 'spending-change');
assert.equal(adviserFactIntent('How has my spending changed at this store?'), null);
const compareFollowUp = resolveTurns(compareQuestion, 'In USD', 'Show me a chart');
assert.equal(adviserFactIntent(compareFollowUp), 'spending-change');
assert.equal(adviserRequestedCurrency(compareFollowUp), 'USD');
assert.equal(adviserFactIntent("What changed in my spending this month?"), "spending-change");
const comparisonRows: Parameters<typeof adviserSpendingComparison>[0] = ([
    { id: 'a', date: '2026-03-28', amount: 200, currency: 'PHP', type: 'expense', category: 'Food' },
    { id: 'b', date: '2026-03-31', amount: 900, currency: 'PHP', type: 'expense', category: 'Food' },
    { id: 'c', date: '2026-02-28', amount: 120, currency: 'PHP', type: 'expense', category: 'Food' },
    { id: 'd', date: '2026-02-28', amount: 900, currency: 'PHP', type: 'transfer', category: 'Transfers' },
    { id: 'e', date: '2026-03-27', amount: 900, currency: 'USD', type: 'expense', category: 'Food' },
] as const).map(row => ({ ...row, merchant: "Test merchant", accountId: "test-account", account: "Test account" }));
const comparison = adviserSpendingComparison(comparisonRows, 'PHP', new Date('2026-03-31T12:00:00Z'), 'Asia/Manila', true);
assert.deepEqual(comparison.recent, { from: '2026-03-01', to: '2026-03-28' });
assert.deepEqual(comparison.earlier, { from: '2026-02-01', to: '2026-02-28' });
assert.equal(comparison.change, 80);

const driversQuestion = resolveTurns(compareQuestion, "In USD", "Which categories drove that?", "Show me a chart");
assert.equal(adviserFactIntent(driversQuestion), "spending-change");
assert.equal(adviserRequestedCurrency(driversQuestion), "USD");
assert.equal(asksForSpendingDrivers(driversQuestion), true);
assert.equal(declinesChart(resolveTurns(compareQuestion, "Why?", "Just the numbers")), true);
assert.equal(resolveTurns(compareQuestion, "Show me my goals", "Why?"), "Why?");
const baseRow = comparisonRows[0];
const withOffsets = adviserSpendingComparison([
    ...comparisonRows,
    { ...baseRow, id: "earlier-shopping", date: "2026-02-14", category: "Shopping", amount: 80 },
    { ...baseRow, id: "recent-travel", category: "Travel", amount: 35 },
    { ...baseRow, id: "earlier-travel", date: "2026-02-14", category: "Travel", amount: 35 },
], "PHP", new Date("2026-03-31T12:00:00Z"), "Asia/Manila", true);
assert.equal(withOffsets.change, 0);
assert.deepEqual(withOffsets.drivers, [{ label: "Food", change: 80 }, { label: "Shopping", change: -80 }]);

assert.equal(adviserRequestedCurrency(resolveTurns(compareQuestion, "In CHF", "Show me a chart")), "CHF");
assert.equal(adviserRequestedCurrency("Show all currencies"), undefined);

const allSpending = 'Show spending by currency this month';
assert.equal(adviserFactIntent(allSpending), 'spending');
const currencyOverview = resolveTurns('Show spending categories last month in PHP', 'All currencies');
assert.equal(asksForMultipleCurrencies(currencyOverview), true);
assert.equal(adviserRequestedCurrency(currencyOverview), undefined);
assert.deepEqual(adviserFactWindow(currencyOverview, now, 'Asia/Manila'), { from: '2026-09-01', to: '2026-09-30' });
const currencyChart = resolveTurns(allSpending, 'In USD', 'Show me a chart');
assert.equal(asksForMultipleCurrencies(currencyChart), false);
assert.equal(adviserRequestedCurrency(currencyChart), 'USD');
assert.deepEqual(adviserFactWindow(currencyChart, now, 'Asia/Manila'), { from: '2026-10-01', to: '2026-10-26' });
assert.equal(asksForMultipleCurrencies(resolveTurns(allSpending, 'Just the numbers')), true);
assert.deepEqual(adviserSpendingByCurrency(comparisonRows, { from: '2026-02-28', to: '2026-03-28' }, 'USD'), [
    { currency: 'USD', total: 900 },
    { currency: 'PHP', total: 320 },
]);

const allCash = resolveTurns("How much cash do I have in PHP?", "All currencies");
assert.equal(adviserFactIntent(allCash), "cash");
assert.equal(asksForMultipleCurrencies(allCash), true);
assert.equal(adviserRequestedCurrency(allCash), undefined);
const cashChart = resolveTurns("Show my cash by currency", "In USD", "Show me a chart");
assert.equal(adviserFactIntent(cashChart), "cash");
assert.equal(asksForMultipleCurrencies(cashChart), false);
assert.equal(adviserRequestedCurrency(cashChart), "USD");

for (const [phrase, code] of [
    ["Swiss francs", "CHF"], ["chf", "CHF"], ["Mexican pesos", "MXN"],
    ["Kenyan shillings", "KES"], ["Polish zlotys", "PLN"], ["Brazilian reais", "BRL"],
    ["pounds sterling", "GBP"], ["New Taiwan dollars", "TWD"],
]) {
    assert.equal(adviserRequestedCurrency(`Show me in ${phrase}`), code);
    const followUp = resolveTurns("Show my spending by category last month", `In ${phrase}`, "Show me a chart");
    assert.equal(adviserRequestedCurrency(followUp), code);
    assert.deepEqual(adviserFactWindow(followUp, now, "Asia/Manila"), { from: "2026-09-01", to: "2026-09-30" });
}
assert.equal(adviserRequestedCurrency("Show all currencies"), undefined);
assert.equal(adviserRequestedCurrency("Try my other account"), undefined);
assert.equal(adviserRequestedCurrency("Show in TRY"), "TRY");
assert.equal(adviserRequestedCurrency("Show me in Swiss francs instead of USD"), "CHF");
assert.equal(adviserFactIntent(resolveTurns(compareQuestion, "In Swiss francs")), "spending-change");

assert.deepEqual(adviserCircleQuestion("Show contributions this month in Swiss francs"), { text: "Show contributions this month", currency: "CHF" });
assert.equal(adviserCircleCurrencyFollowUp("What about in Mexican pesos?"), "MXN");
assert.equal(adviserCircleCurrencyFollowUp("What about my budget?"), undefined);

for (const [phrase, code] of [
    ["en pesos mexicanos", "MXN"], ["em reais", "BRL"], ["w złotych", "PLN"],
    ["in francs suisses", "CHF"], ["in 日本円", "JPY"], ["in 人民币", "CNY"],
    ["in 한국 원", "KRW"], ["in บาท", "THB"], ["in đồng", "VND"], ["in ₹", "INR"],
]) {
    const followUp = resolveTurns("Show my spending by category last month", phrase, "Show me a chart");
    assert.equal(adviserRequestedCurrency(followUp), code);
    assert.deepEqual(adviserFactWindow(followUp, now, "Asia/Manila"), { from: "2026-09-01", to: "2026-09-30" });
}
assert.equal(adviserRequestedCurrency("Did I spend $100?"), undefined);
assert.equal(adviserRequestedCurrency("Compare ₹100 and ₺100"), undefined);
assert.equal(adviserRequestedCurrency("Try it in all currencies"), undefined);
assert.equal(adviserRequestedCurrency("Look up my account in chf_123"), undefined);

assert.equal(adviserRequestedCurrency("Show spending in West African CFA francs"), "XOF");
assert.equal(adviserRequestedCurrency("Show spending in Central African CFA francs"), "XAF");
assert.equal(adviserRequestedCurrency("Show spending in eastern Caribbean dollars"), "XCD");
assert.equal(adviserRequestedCurrency("Show spending in CFP francs"), "XPF");


async function checkTutorialAnswers() {
    const bank = { id: 'bank', name: 'BPI', type: 'bank', source: 'finverse', currency: 'PHP', balance: '255763.50', transactions: [], statementCheckpoints: [] };
    const wallet = { ...bank, id: 'wallet', name: 'Wallet', type: 'wallet', balance: null };
    const linkedAt = new Date('2026-10-15T08:00:00Z');
    const rentDate = new Date('2026-11-12');
    const originalAccounts = prisma.account.findMany;
    const originalLinks = prisma.finverseAccountLink.findMany;
    const originalCommitments = prisma.financialCommitment.findMany;
    const originalTransactions = prisma.transaction.findMany;
    const commitments = mock.fn(async () => [
        { ...base, id: 'rent', title: 'Rent', recurrence: 'once', dueDate: rentDate, nextDueDate: rentDate, occurrences: [] },
        { ...base, id: 'paid', title: 'Already paid', recurrence: 'once', dueDate: rentDate, nextDueDate: rentDate, occurrences: [{ dueDate: rentDate }] },
    ]);
    prisma.account.findMany = (async () => [bank, wallet]) as typeof originalAccounts;
    prisma.finverseAccountLink.findMany = (async () => [
        { accountId: bank.id, unlinkedAt: null, normalizedPayload: { balance: bank.balance }, lastSeenAt: linkedAt, connection: { status: 'linked' } },
    ]) as typeof originalLinks;
    prisma.financialCommitment.findMany = commitments as typeof originalCommitments;
    prisma.transaction.findMany = (async () => tutorialRows.map(row => ({
        ...row, date: new Date(row.date + 'T02:00:00Z'), accountId: bank.id, account: bank,
        category: { id: row.category, name: row.category }, merchantRaw: row.merchant, transactionTags: [],
        isTransfer: row.type === 'transfer', isExcluded: false, reviewStatus: 'edited',
    }))) as typeof originalTransactions;
    try {
        const input = { workspaceId: 'qa-personal', profileName: 'Personal', regionalPreferences: { baseCurrency: 'PHP', timeZone: 'Asia/Manila' }, now };
        const spending = await answerAdviserFact({ ...input, question: 'Where did my money go last month?' });
        assert.equal(spending?.answerSource, 'local');
        assert.match(spending?.reply ?? '', /2026-09-01 to 2026-09-30 · PHP/);
        assert.equal(spending?.visualization?.bars.length, 3);
        assert.ok(spending?.actions.some(action => action.href.includes('transfers=exclude')));
        const missingPayday = await answerAdviserFact({ ...input, question: 'What’s due before payday?' });
        assert.match(missingPayday?.reply ?? '', /When is your next payday/);
        assert.equal(commitments.mock.callCount(), 0);
        const payments = await answerAdviserFact({ ...input, question: 'What’s due before payday? Payday is 2026-11-15.' });
        assert.match(payments?.reply ?? '', /1 confirmed, unpaid payment/);
        assert.match(payments?.reply ?? '', /2026-11-12/);
        assert.ok(payments?.actions.some(action => action.href.includes('commitment=rent')));
        const cash = await answerAdviserFact({ ...input, question: 'How much do I have available?' });
        assert.match(cash?.reply ?? '', /255,763.50/);
        assert.match(cash?.reply ?? '', /subtotal/);
        assert.match(cash?.reply ?? '', /2026-10-15/);
        assert.match(cash?.reply ?? '', /As of 2026-10-26/);
        assert.equal(cash?.visualization?.bars.length, 1);
        const missingCash = await answerAdviserFact({ ...input, question: 'How much do I have available in USD?' });
        assert.match(missingCash?.reply ?? '', /don’t see any spendable USD accounts/);
        assert.equal(missingCash?.visualization, null);
    } finally {
        prisma.account.findMany = originalAccounts;
        prisma.finverseAccountLink.findMany = originalLinks;
        prisma.financialCommitment.findMany = originalCommitments;
        prisma.transaction.findMany = originalTransactions;
    }
    console.log('PASS Tutorial answers: local spending, payday lookup, paid occurrence exclusion, and stale and missing balance disclosures.');
}
void checkTutorialAnswers();
