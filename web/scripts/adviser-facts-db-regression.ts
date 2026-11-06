import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { randomUUID, createHash } from 'node:crypto';
import { reportDay, shiftDay } from '../../shared/reports/analysis';
const url = new URL(process.env.DATABASE_URL ?? 'http://invalid');
assert.equal(url.hostname, '127.0.0.1');
assert.equal(url.port, process.env.CLOVER_QA_PARSER_PORT ?? '55441');
assert.equal(url.pathname, '/clover_migration_qa');
assert(process.argv.includes('--execute'));
const require = createRequire(import.meta.url);
let network = 0;
globalThis.fetch = async () => { network++; throw new Error('Fact QA prohibits provider calls'); };
async function main() {
    const { prisma: db } = await import('../lib/prisma');
    const now = new Date();
    const today = reportDay(now, 'Asia/Manila');
    const prior = new Date(today);
    prior.setUTCMonth(prior.getUTCMonth() - 1, 1);
    const from = prior.toISOString().slice(0, 10);
    const end = new Date(Date.UTC(prior.getUTCFullYear(), prior.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
    const user = await db.user.create({ data: { clerkUserId: randomUUID(), email: randomUUID() + '@example.invalid', environment: 'staging', regionalPreferences: { baseCurrency: 'PHP', timeZone: 'Asia/Manila' } } });
    let currentRequest: Request;
    let native = false;
    let local = true;
    let cookieProfile = '';
    const mocks: Record<string, unknown> = {
        '../lib/auth': { isLocalDevHost: async () => local, requireAuth: async () => ({ userId: user.clerkUserId }), getSessionContext: async () => ({ userId: user.clerkUserId }) },
        '../lib/user-context': { getOrCreateCurrentUser: async () => user },
        '../lib/ai-consent': { maySendToCloudAi: async () => true, assertCloudAiConsent: async () => { } },
        '../lib/app-preferences': { getAppPreferences: async () => ({ privacy: { adviserUsesContext: true } }) },
        '../lib/mobile-request-context': { getMobileRequestContext: () => native ? { request: currentRequest } : null },
        'next/headers': { cookies: async () => ({ get: () => cookieProfile ? { value: cookieProfile } : undefined }) },
    };
    const saved = new Map<string, NodeModule | undefined>();
    for (const [path, exports] of Object.entries(mocks)) {
        const id = require.resolve(path);
        saved.set(id, require.cache[id]);
        require.cache[id] = { id, filename: id, loaded: true, exports } as NodeModule;
    }
    try {
        const workspace = await db.workspace.create({ data: { userId: user.id, name: 'Personal' } });
        const other = await db.workspace.create({ data: { userId: user.id, name: 'Other Profile' } });
        const bank = await db.account.create({ data: { workspaceId: workspace.id, name: 'Bank', type: 'bank', source: 'upload', currency: 'PHP', balance: 1000 } });
        const cash = await db.account.create({ data: { workspaceId: workspace.id, name: 'Cash', type: 'cash', source: 'manual', currency: 'PHP', balance: 1000 } });
        const wallet = await db.account.create({ data: { workspaceId: workspace.id, name: 'Wallet', type: 'wallet', source: 'upload', currency: 'PHP', balance: -200 } });
        await db.account.createMany({ data: [{ workspaceId: workspace.id, name: 'Investments', type: 'investment', source: 'upload', currency: 'PHP', balance: 100000 }, { workspaceId: workspace.id, name: 'USD', type: 'bank', source: 'upload', currency: 'USD', balance: 900 }, { workspaceId: other.id, name: 'Unshared', type: 'bank', source: 'upload', currency: 'PHP', balance: 777777 }] });
        const source = await db.importFile.create({ data: { workspaceId: workspace.id, fileName: 'retained.pdf', fileType: 'application/pdf', storageKey: 'qa/' + randomUUID(), status: 'done' } });
        await db.accountStatementCheckpoint.create({ data: { workspaceId: workspace.id, accountId: bank.id, importFileId: source.id, endingBalance: 900, status: 'reconciled', statementEndDate: new Date(), sourceMetadata: { importMode: 'statement' } } });
        const receipt = await db.importFile.create({ data: { workspaceId: workspace.id, fileName: 'receipt.png', fileType: 'image/png', storageKey: 'qa/' + randomUUID(), status: 'done' } });
        await db.accountStatementCheckpoint.create({ data: { workspaceId: workspace.id, accountId: bank.id, importFileId: receipt.id, endingBalance: 999999, status: 'reconciled', sourceMetadata: { importMode: 'receipt' } } });
        const cats = await Promise.all(['Food', 'Travel', 'Housing', 'Transfers'].map(name => db.category.create({ data: { workspaceId: workspace.id, name, type: 'expense' } })));
        const row = async (amount: number, category: string, extra: Record<string, unknown> = {}) => db.transaction.create({ data: { workspaceId: workspace.id, accountId: bank.id, date: new Date(from), amount, currency: 'PHP', type: 'expense', merchantRaw: category, reviewStatus: 'confirmed', categoryId: cats.find(c => c.name === category)!.id, ...extra } });
        await row(900, 'Travel');
        await row(25, 'Food', { date: new Date(Date.parse(from + 'T00:00Z') - 8 * 3600000) });
        await row(88888, 'Food', { date: new Date(end + 'T16:00Z') });
        await row(700, 'Housing');
        await row(500, 'Food', { date: new Date(end + 'T15:59:59Z') });
        await row(90000, 'Food', { date: new Date(shiftDay(from, -1) + 'T12:00Z') });
        await row(80000, 'Food', { currency: 'USD' });
        await row(70000, 'Food', { deletedAt: new Date() });
        await row(60000, 'Food', { isExcluded: true });
        await row(1000, 'Transfers', { rawPayload: { transferPairId: 'retained-pair', amountDelta: -1000 } });
        await row(1000, 'Transfers', { accountId: wallet.id, type: 'income', rawPayload: { transferPairId: 'retained-pair', amountDelta: 1000 } });
        await row(60, 'Transfers', { merchantRaw: 'Reimbursement from member', rawPayload: { splitBillId: 'existing-bill', amountDelta: 60 } });
        await db.transaction.create({ data: { workspaceId: workspace.id, accountId: cash.id, date: new Date(today), amount: 425, currency: 'PHP', type: 'expense', merchantRaw: 'User purchase', reviewStatus: 'edited' } });
        await db.transaction.createMany({ data: Array.from({ length: 5001 }, (_, i) => ({ workspaceId: workspace.id, accountId: bank.id, date: new Date(today), amount: 0, currency: 'PHP', type: 'expense' as const, merchantRaw: `Recent zero draft ${i}`, reviewStatus: 'confirmed' as const })) });
        const commitment = await db.financialCommitment.create({ data: { workspaceId: workspace.id, title: 'Confirmed payment', kind: 'planned_payment', amount: 250, currency: 'PHP', dueDate: new Date(shiftDay(today, 20)), status: 'active', source: 'manual' } });
        const completed = await db.financialCommitment.create({ data: { workspaceId: workspace.id, title: 'Already paid', kind: 'planned_payment', amount: 99, currency: 'PHP', dueDate: new Date(shiftDay(today, 2)), status: 'active', source: 'manual' } });
        await db.financialCommitmentOccurrence.create({ data: { workspaceId: workspace.id, commitmentId: completed.id, dueDate: completed.dueDate!, completedAt: new Date() } });
        await db.financialCommitment.createMany({ data: [{ workspaceId: workspace.id, title: 'Stale old payment', kind: 'planned_payment', amount: 999, currency: 'PHP', dueDate: new Date(shiftDay(today, -40)), status: 'active', source: 'manual' }, { workspaceId: workspace.id, title: 'Unconfirmed Bookshop', kind: 'planned_payment', amount: 999, currency: 'PHP', dueDate: new Date(shiftDay(today, 5)), status: 'active', source: 'unconfirmed_suggestion' }, { workspaceId: workspace.id, title: 'USD bill', kind: 'planned_payment', amount: 999, currency: 'USD', dueDate: new Date(shiftDay(today, 5)), status: 'active', source: 'manual' }, { workspaceId: other.id, title: 'Other Profile payment', kind: 'planned_payment', amount: 999, currency: 'PHP', dueDate: new Date(shiftDay(today, 5)), status: 'active', source: 'manual' }] });
        await db.financialCommitment.createMany({ data: Array.from({ length: 24 }, (_, i) => ({ workspaceId: workspace.id, title: `Confirmed extra ${i}`, kind: 'planned_payment' as const, amount: 10, currency: 'PHP', dueDate: new Date(shiftDay(today, 3 + i % 18)), status: 'active' as const, source: 'manual' })) });
        const circle = await db.circle.create({ data: { ownerUserId: user.id, name: 'Household', currency: 'PHP' } });
        const sharedExpense = await db.transaction.findFirstOrThrow({ where: { workspaceId: workspace.id, merchantRaw: 'User purchase' } });
        await db.circleSharedTransaction.create({ data: { circleId: circle.id, transactionId: sharedExpense.id, sharedByUserId: user.id } });
        await db.circleContribution.createMany({ data: [
            { circleId: circle.id, amount: 200, currency: 'PHP', contributionDate: now },
            { circleId: circle.id, amount: 50, currency: 'USD', contributionDate: now },
        ] });
        const digest = async () => createHash('sha256').update(JSON.stringify(await Promise.all([db.account.findMany({ where: { workspaceId: { in: [workspace.id, other.id] } }, orderBy: { id: 'asc' } }), db.transaction.findMany({ where: { workspaceId: { in: [workspace.id, other.id] } }, orderBy: { id: 'asc' } }), db.financialCommitment.findMany({ where: { workspaceId: { in: [workspace.id, other.id] } }, orderBy: { id: 'asc' } }), db.financialCommitmentOccurrence.findMany({ where: { workspaceId: workspace.id }, orderBy: { id: 'asc' } }), db.accountStatementCheckpoint.findMany({ where: { workspaceId: workspace.id }, orderBy: { id: 'asc' } }), db.learningJob.findMany({ where: { workspaceId: workspace.id }, orderBy: { id: 'asc' } })]))).digest('hex');
        const before = await digest();
        const { POST } = await import('../app/api/adviser/chat/route');
        const ask = async (question: string, id = workspace.id) => { currentRequest = new Request('https://clover.ph/api/adviser/chat?workspaceId=' + id, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ messages: [{ role: 'assistant', content: 'Old October summary: 999999 in transfers.' }, { role: 'user', content: question }], stream: true }) }); const r = await POST(currentRequest); return { status: r.status, body: await r.json() }; };
        const regionalBudget = await ask('How should I budget for living expenses here with a chart?');
        assert.equal(regionalBudget.status, 200);
        assert.equal(regionalBudget.body.answerSource, 'local');
        assert.match(regionalBudget.body.reply, /main budget in PHP.*last 30 days/s);
        assert.equal(regionalBudget.body.visualization?.currency, 'PHP');
        assert.equal(regionalBudget.body.visualization?.calendarWindow.from, shiftDay(today, -29));
        assert.equal(regionalBudget.body.visualization?.calendarWindow.through, today);
        const emptyRegionalBudget = await ask('How should I budget for living expenses in CHF?');
        assert.match(emptyRegionalBudget.body.reply, /main budget in CHF.*don’t see any recorded CHF spending/s);
        assert.equal(emptyRegionalBudget.body.visualization, null);
        const spending = await ask('What were my three biggest spending categories last month?');
        assert.equal(spending.status, 200);
        assert.equal(spending.body.financialFacts.total, 2125);
        assert.deepEqual(spending.body.financialFacts.categories.map((c: {
            label: string;
        }) => c.label), ['Travel', 'Housing', 'Food']);
        assert.equal(spending.body.financialFacts.from, from);
        assert.deepEqual(spending.body.visualization.calendarWindow,{from,through:end});
        assert.equal(reportDay(new Date(spending.body.visualization.from),'Asia/Manila'),from);
        assert.equal(reportDay(new Date(spending.body.visualization.through),'Asia/Manila'),end);

        assert.equal(spending.body.financialFacts.to, end);
        const housingAction = spending.body.actions.find((item: { label: string }) => item.label === "View Housing transactions");
        assert(housingAction, "An exact category can open its underlying transactions");
        const housingParams = new URL(housingAction.href, "https://clover.ph").searchParams;
        assert.equal(housingParams.get("types"), "debit");
        assert.equal(housingParams.get("categories"), cats.find(c => c.name === "Housing")!.id);
        assert.equal(housingParams.get("customStart"), from);
        assert.equal(housingParams.get("customEnd"), end);
        assert.equal(spending.body.visualization.bars.reduce((s: number, c: {
            amount: number;
        }) => s + c.amount, 0), 2125);
        assert.doesNotMatch(spending.body.reply, /999999/);
        const explicit = await ask(`Show spending by category for ${from} to ${end}, excluding transfers.`);
        assert.equal(explicit.body.financialFacts.total, 2125);
        // Compare the real paginated and full Transactions API totals, not a copied arithmetic implementation.
        const { GET: transactionsGET } = await import('../app/api/transactions/route');
        local = false;
        for (const mode of ['light', 'full']) {
            const response = await transactionsGET(new Request(`https://clover.ph/api/transactions?workspaceId=${workspace.id}&currency=PHP&dateFilterMode=custom&customStart=${from}&customEnd=${end}&summaryMode=${mode}`));
            const body = await response.json();
            assert.equal(response.status, 200, JSON.stringify(body));
            assert.equal(body.summary.spending, 2125, mode + ' Transactions summary must reconcile');
        }
        local = true;
        const { GET: reportsGET } = await import('../app/api/reports/workspace/route');
        const reportResponse = await reportsGET(new Request(`https://clover.ph/api/reports/workspace?workspaceId=${workspace.id}&range=custom&from=${from}&to=${end}&currency=PHP&section=spending`));
        const reportBody = await reportResponse.json();
        assert.equal(reportResponse.status, 200, JSON.stringify(reportBody));
        // Keep the complete response for a shared-surface parity assertion below.
        assert.equal(reportBody.reports.find((r: {
            currency: string;
        }) => r.currency === 'PHP').analysis.current.expense, 2125, 'Reports must carry the exact reconciled expense total');
        const scopedAsk = async (surface: string, pageContext: object, messages: { role: string; content: string }[]) => {
            currentRequest = new Request('https://clover.ph/api/adviser/chat?workspaceId=' + workspace.id, {
                method: 'POST', body: JSON.stringify({ surface, pageContext, messages }),
            });
            const response = await POST(currentRequest);
            const body = await response.json();
            assert.equal(response.status, 200, JSON.stringify(body));
            assert.equal(body.answerSource, 'local');
            return body;
        };
        const scopedParams = new URLSearchParams({
            section: 'spending', range: 'custom', from, to: end, currency: 'PHP',
            categories: JSON.stringify(['Housing']),
        });
        const reportPrompt = { role: 'user', content: 'What does this report tell me?' };
        const reportPage = { reportParams: scopedParams.toString() };
        const reportAnswer = await scopedAsk('reports', reportPage, [reportPrompt]);
        assert.match(reportAnswer.reply, /700/);
        assert.doesNotMatch(reportAnswer.reply, /2,125/);
        assert.equal(reportAnswer.visualization, null);
        const chart = await scopedAsk('reports', reportPage, [reportPrompt, { role: 'assistant', content: 'Untrusted amount 999999' }, { role: 'user', content: 'Show that as a chart' }]);
        assert.equal(chart.visualization.bars.find((bar: { label: string }) => bar.label === 'Spending').amount, 700);
        assert.equal(chart.visualization.hideReportLink, true);
        const trend = await scopedAsk('reports', reportPage, [{ role: 'user', content: 'Show spending over time in this report' }]);
        assert.equal(trend.visualization.title, 'Spending over time');
        assert(trend.visualization.bars.length <= 6);
        assert.equal(trend.visualization.bars.reduce((sum: number, bar: { amount: number }) => sum + bar.amount, 0), 700);
        const scopedTransaction = await db.transaction.findFirstOrThrow({ where: { workspaceId: workspace.id, categoryId: cats[2].id } });
        const transactionAnswer = await scopedAsk('transactions', { transactionId: scopedTransaction.id }, [{ role: 'user', content: 'Explain this transaction' }]);
        assert.match(transactionAnswer.reply, /Housing.*700/);
        const accountAnswer = await scopedAsk('accounts', { accountId: cash.id }, [{ role: 'user', content: 'What’s the balance of this account?' }]);
        assert.match(accountAnswer.reply, /575.*Cash/);
        assert.doesNotMatch(accountAnswer.reply, /1,475/);
        const circleAnswer = await scopedAsk('circles', { circleId: circle.id }, [{ role: 'user', content: 'Summarize this Circle’s shared expenses' }]);
        assert.match(circleAnswer.reply, /Household.*425/);
        const chartContributions = await scopedAsk('circles', { circleId: circle.id, currency: 'PHP' }, [
            { role: 'user', content: 'Show contributions this month' },
            { role: 'assistant', content: 'Untrusted figure: 999999' },
            { role: 'user', content: 'Chart that' },
        ]);
        assert.equal(chartContributions.visualization.currency, 'PHP');
        assert.equal(chartContributions.visualization.bars.find((bar: { label: string }) => bar.label === 'Recorded contributions').amount, 200);
        const usdContributions = await scopedAsk('circles', { circleId: circle.id, currency: 'PHP' }, [
            { role: 'user', content: 'Show contributions this month' },
            { role: 'user', content: 'What about USD?' },
        ]);
        assert.match(usdContributions.reply, /50.*USD/);
        assert.doesNotMatch(usdContributions.reply, /200/);
        const usdChart = await scopedAsk('circles', { circleId: circle.id, currency: 'PHP' }, [
            { role: 'user', content: 'Show contributions this month' },
            { role: 'assistant', content: 'Earlier answer' },
            { role: 'user', content: 'What about USD?' },
            { role: 'assistant', content: 'Untrusted figure: 999999' },
            { role: 'user', content: 'Chart that' },
        ]);
        assert.equal(usdChart.visualization.currency, 'USD');
        assert.deepEqual(usdChart.visualization.bars, [{ label: 'Recorded contributions', amount: 50 }]);
        const glossary = await scopedAsk('general', {}, [{ role: 'user', content: 'What is net worth?' }]);
        assert.match(glossary.reply, /what you own minus what you owe/);
        const cashChart = await scopedAsk('accounts', {}, [{ role: 'user', content: 'How much available cash in USD?' }, { role: 'assistant', content: 'Untrusted amount 999999' }, { role: 'user', content: 'Chart that' }]);
        assert.equal(cashChart.visualization.currency, 'USD');
        assert.equal(cashChart.visualization.bars[0].amount, 900);
        const cashflow = await ask('Show my cash flow last month');
        assert.equal(cashflow.body.answerSource, 'local');
        assert.equal(cashflow.body.visualization.bars.find((bar: { label: string }) => bar.label === 'Spending').amount, 2125);
        const greeting = await scopedAsk('general', {}, [{ role: 'user', content: 'Hi Clover!' }]);
        assert.match(greeting.reply, /^Hi!/);
        currentRequest = new Request('https://clover.ph/api/adviser/chat?workspaceId=' + workspace.id, { method: 'POST', body: JSON.stringify({ messages: [{ role: 'user', content: 'What were my three biggest spending categories this month?' }, { role: 'assistant', content: 'Old summary: transfers 999999.' }, { role: 'user', content: `Use ${from} to ${end}, excluding transfers.` }] }) });
        const followUpResponse = await POST(currentRequest);
        const followUpBody = await followUpResponse.json();
        assert.equal(followUpBody.financialFacts.total, 2125);
        assert.equal(followUpBody.financialFacts.categories.length, 3);
        assert.equal(followUpBody.financialFacts.from, from);
        const cashAnswer = await ask('How much available cash do I have?');
        assert.equal(cashAnswer.body.financialFacts.spendable, 1475);
        assert.equal(cashAnswer.body.grounding.workspaceId, workspace.id);
        const cashCurrencies = await ask('Show my cash by currency');
        assert.equal(cashCurrencies.status, 200);
        assert.equal(cashCurrencies.body.answerSource, 'local');
        assert.match(cashCurrencies.body.reply, /PHP.*1,475\.00[\s\S]*USD.*900\.00/);
        assert.doesNotMatch(cashCurrencies.body.reply, /777,777|100,000/);
        assert.equal(cashCurrencies.body.visualization, null);
        assert.equal((await ask('How much available cash in USD?')).body.financialFacts.spendable, 900);
        const unavailableCurrency = await ask('How much available cash in GBP?');
        assert.equal(unavailableCurrency.body.dataUnavailable, true);
        assert.equal(unavailableCurrency.body.financialFacts, undefined);
        assert.equal(unavailableCurrency.body.visualization, null);
        const payments = await ask('Which payments are due in the next 30 days?');
        assert.equal(payments.body.financialFacts.payments.length, 25, 'Confirmed payments must not stop at a 20-record context cap');
        assert(payments.body.financialFacts.payments.some((p: {
            id: string;
        }) => p.id === commitment.id));
        assert.equal(payments.body.financialFacts.payments.find((p: { id: string }) => p.id === commitment.id).dueDate, shiftDay(today, 20));
        assert.match(payments.body.reply, /See 20 more in Recurring/);
        assert.doesNotMatch(payments.body.reply, /Bookshop|Stale old|Already paid|Other Profile payment/);
        assert.equal((await ask('How much available cash?', other.id)).body.financialFacts.spendable, 777777);
        native = true;
        assert.equal((await ask('How much available cash?')).body.financialFacts.spendable, 1475);
        native = false;
        cookieProfile = 'missing';
        currentRequest = new Request('https://clover.ph/api/adviser/chat', { method: 'POST', body: JSON.stringify({ messages: [{ role: 'user', content: 'How much available cash?' }] }) });
        assert.equal((await POST(currentRequest)).status, 404);
        cookieProfile = '';
        const find = db.transaction.findMany;
        Object.assign(db.transaction, { findMany: async () => { throw new Error('Injected database timeout'); } });
        try {
            const unavailable = await ask('What were my three biggest spending categories last month?');
            assert.equal(unavailable.body.dataUnavailable, true);
            assert.equal(unavailable.body.visualization, null);
            assert.equal(unavailable.body.financialFacts, undefined);
            assert.match(unavailable.body.reply, /couldn't retrieve/);
        }
        finally {
            Object.assign(db.transaction, { findMany: find });
        }
        assert.equal(await digest(), before, 'Entire financial records, checkpoints and learning remain byte-identical');
        const { loadActivityInsightNotifications } = await import('../lib/activity-insight-notifications.server');
        const insightTime = new Date('2026-11-06T12:00:00Z');
        const insightRow = {
            workspaceId: workspace.id, accountId: bank.id, date: insightTime, createdAt: insightTime,
            amount: 20, currency: 'PHP', type: 'expense' as const, merchantRaw: 'Fixture',
            reviewStatus: 'confirmed' as const,
        };
        const connection = await db.finverseConnection.create({ data: {
            userId: user.id, workspaceId: workspace.id, stateHash: randomUUID(), stateExpiresAt: insightTime, institutionName: 'BPI',
        } });
        for (let i = 0; i < 5; i++) {
            const transaction = await db.transaction.create({ data: insightRow });
            await db.finverseTransactionRecord.create({ data: {
                connectionId: connection.id, externalTransactionId: `bank-${i}`, externalAccountId: 'bank',
                transactionId: transaction.id, rawPayload: {}, normalizedPayload: {},
            } });
        }
        await db.transaction.createMany({ data: Array.from({ length: 9 }, () => ({
            ...insightRow, rawPayload: { source: 'manual' },
        })) });
        assert.equal((await loadActivityInsightNotifications(workspace.id, insightTime)).length, 0);
        await db.transaction.create({ data: { ...insightRow, rawPayload: { source: 'manual' } } });
        await db.transaction.createMany({ data: Array.from({ length: 10 }, () => ({
            ...insightRow, importFileId: source.id,
        })) });
        const ready = await loadActivityInsightNotifications(workspace.id, insightTime);
        assert.equal(ready.length, 2, 'Only the statement and manual activity reached ten records');
        assert(ready.some(item => item.title.includes('retained.pdf')));
        assert(ready.some(item => item.title.includes('manual entries')));
        assert.equal((await loadActivityInsightNotifications(other.id, insightTime)).length, 0);
        console.log('PASS activity insights: saved statement, cumulative manual entry, insufficient bank sync and Profile isolation.');
        assert.equal(network, 0);
        console.log('PASS real Adviser POST: complete-month categories/chart, current confirmed payments, Accounts spendable, explicit currency, native/web/Profile isolation, stale-history refusal, unavailable-data response, zero provider calls and complete financial/learning preservation.');
    }
    finally {
        for (const [id, module] of saved) {
            if (module)
                require.cache[id] = module;
            else
                delete require.cache[id];
        }
        await db.user.delete({ where: { id: user.id } });
        await db.$disconnect();
    }
}
main().catch(e => { console.error(e); process.exitCode = 1; });
