// Explicit live QA tool: creates isolated staging Profiles and uploads public fixtures.
// Never include this in the unattended release gate.
import { createClerkClient } from '@clerk/backend';
import { fileURLToPath } from 'node:url';
import { resolve, dirname, join } from 'node:path';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { randomUUID, createHash } from 'node:crypto';
import assert from 'node:assert/strict';
const option = (name, fallback) => process.argv.find(x => x.startsWith(name + '='))?.slice(name.length + 1) ?? fallback;
const label = option('--label', 'final'), repeats = Number(option('--repeats', '3'));
assert.ok(process.argv.includes('--execute'), 'Pass --execute to authorize live staging uploads');
assert.equal(process.env.CLOVER_DEPLOYMENT_ENVIRONMENT, 'staging');
assert.ok(process.env.CLERK_SECRET_KEY?.startsWith('sk_test_'), 'Use development Clerk credentials only');
assert.match(label, /^[a-z0-9-]{1,40}$/);
assert.ok(Number.isInteger(repeats) && repeats >= 1 && repeats <= 5);
const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const origin = 'https://staging.clover.ph';
const imagesDir = option('--images-dir', '');
const outputDir = option('--output-dir', '');
assert.ok(imagesDir && outputDir, 'Provide --images-dir and --output-dir');
mkdirSync(outputDir, { recursive: true, mode: 0o700 });
const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
const qaId = 'user_3JJ1IGtRLHyU8hwh7AIRM8xAh8z';
let session;
async function qaRequest(route, init = {}) {
    assert.ok(route.startsWith('/api/'));
    if (!session) {
        const user = await clerk.users.getUser(qaId);
        assert.ok(user.emailAddresses.some(e => e.emailAddress === 'clover.qa.20260914a+clerk_test@example.com'));
        session = await clerk.sessions.createSession({ userId: qaId });
        assert.equal(session.userId, qaId);
    }
    const { jwt } = await clerk.sessions.getToken(session.id);
    const response = await fetch(origin + route, { ...init, headers: { Authorization: `Bearer ${jwt}`, Origin: origin, ...init.headers }, signal: init.signal ?? AbortSignal.timeout(60000) });
    const data = await response.json();
    if (!response.ok)
        throw new Error(`${response.status} ${route}: ${String(data.error ?? 'Request failed')}`);
    return data;
}
const manifest = JSON.parse(readFileSync(repo + '/web/scripts/fixtures/korea-indonesia-public/image-benchmark-manifest.json', 'utf8'));
const expectedSha = option('--sha', '');
assert.match(expectedSha, /^[a-f0-9]{40}$/, 'Pin the full staging commit');
try {
    const health = await (await fetch(origin + '/api/health?benchmark=' + randomUUID())).json();
    assert.equal(health.build.environment, 'preview');
    assert.ok(health.build.gitSha.startsWith(expectedSha));
    const entitlement = (await qaRequest('/api/mobile/v1/bootstrap')).entitlement;
    assert.equal(entitlement.planTier, 'premium');
    assert.equal((await qaRequest('/api/mobile/v1/settings/ai-consent')).allowed, true);
    const targets = { exactTotalCoveragePerCountry: .95, incorrectConfirmed: 0, expectedOutcomeCoverage: 1, serverOutcomeP95Ms: 12000, clientOutcomeP95Ms: 30000 };
    const output = join(outputDir, `cloud-${label}.json`), runId = Date.now(), results = [], profiles = [];
    const summary = () => {
        const countries = ['KR', 'ID'].map(country => { const rows = results.filter(x => x.country === country); return { country, attempts: rows.length, exact: rows.filter(x => x.exactTotal).length, coverage: rows.length ? rows.filter(x => x.exactTotal).length / rows.length : 0 }; });
        const p95 = key => { const a = results.map(x => x[key]).filter(Number.isFinite).sort((a, b) => a - b); return a[Math.ceil(a.length * .95) - 1] ?? null; };
        const complete = results.length === manifest.samples.length * repeats;
        const incorrectConfirmed = results.filter(x => x.confirmed && (!x.exactTotal || !x.currencyCorrect || x.expectedOutcome === 'review')).length;
        const serverOutcomeP95Ms = p95('serverOutcomeMs'), clientOutcomeP95Ms = p95('clientOutcomeMs');
        const accuracyPassed = complete && countries.every(x => x.coverage >= targets.exactTotalCoveragePerCountry);
        const safetyPassed = incorrectConfirmed === 0;
        const outcomePassed = complete && results.every(x => x.outcomeCorrect);
        const speedPassed = complete && results.every(x => Number.isFinite(x.serverOutcomeMs)) && serverOutcomeP95Ms <= targets.serverOutcomeP95Ms && clientOutcomeP95Ms <= targets.clientOutcomeP95Ms;
        const data = { runId, label, origin, build: health.build, entitlement, targets, repeats, method: 'Eight public original diagnostic images through real staging authenticated multipart uploads, R2 persistence, queue, AI provider and database reads. Fresh isolated QA Profile per round prevents workspace extraction-cache and duplicate reuse. Neutral filenames; expected data never sent to parser. Exact totals evaluated from persisted receipt documents. Source audit: all four CORD images have deliberately obscured dates, so correct outcome is explicit terminal review with no transaction and no retry; country is not used as proof of currency. Two Korean images explicitly show Won and must save a transaction; the other two lack printed currency and must require review. Expected outcomes were fixed by visual source inspection before these runs. Client time includes token issuance, upload and <=1s polling. Server time is upload timestamp to transaction creation or terminal review update. This small development set is not an independent accuracy estimate or validation of every field.', profiles, complete, accuracyPassed, safetyPassed, outcomePassed, speedPassed, passed: accuracyPassed && safetyPassed && outcomePassed && speedPassed, countries, incorrectConfirmed, serverOutcomeP95Ms, clientOutcomeP95Ms, results };
        writeFileSync(output, JSON.stringify(data, null, 2) + '\n', { mode: 0o600 });
        return data;
    };
    for (let round = 0; round < repeats; round++) {
        const current = await (await fetch(origin + '/api/health?benchmark=' + randomUUID())).json();
        assert.equal(current.build.gitSha, expectedSha, 'Staging changed during benchmark');
        const p = await qaRequest('/api/mobile/v1/settings/profiles', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: `QA KR ID ${runId} ${label} ${round + 1}` }) });
        const workspaceId = p.profile?.id;
        assert.ok(workspaceId);
        profiles.push(workspaceId);
        summary();
        for (const sample of manifest.samples) {
            const bytes = readFileSync(join(imagesDir, sample.fileName));
            assert.equal(createHash('sha256').update(bytes).digest('hex'), sample.sha256);
            const importId = randomUUID(), fileName = `receipt-${randomUUID()}.jpg`, expectation = sample.liveExpected, expectedOutcome = expectation.outcome;
            const form = new FormData();
            form.set('file', new File([bytes], fileName, { type: 'image/jpeg' }));
            form.set('workspaceId', workspaceId);
            form.set('fileName', fileName);
            form.set('fileType', 'image/jpeg');
            form.set('importMode', 'receipt');
            let start = performance.now(), initial, snapshot, error = null;
            try {
                initial = await qaRequest(`/api/imports/${importId}/process`, { method: 'POST', body: form, signal: AbortSignal.timeout(90000) });
                for (let poll = 0; poll < 50; poll++) {
                    snapshot = await qaRequest(`/api/imports/${importId}/status`);
                    if (snapshot.receiptTransaction || snapshot.importFile?.status === 'failed' || performance.now() - start > 60000)
                        break;
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
            }
            catch (e) {
                error = e.message;
            }
            const clientOutcomeMs = +(performance.now() - start).toFixed(1), tx = snapshot?.receiptTransaction, doc = snapshot?.receiptDocument, file = snapshot?.importFile;
            const review = file?.status === 'failed' && file?.processingPhase === 'receipt_review_required';
            const end = tx?.createdAt ?? (review ? file?.updatedAt : null);
            const serverOutcomeMs = end ? Date.parse(end) - Date.parse(file.uploadedAt) : null;
            const meta = snapshot?.statementCheckpoint?.sourceMetadata ?? {};
            const total = doc?.total ?? tx?.amount ?? null;
            const exactTotal = total !== null && Number(total) === Number(sample.expectedTotal);
            const missingFields = meta.receiptReview?.missingFields ?? [];
            const outcomeCorrect = !error && (expectedOutcome === 'review' ? review && !tx && snapshot.canResume === false && expectation.missing.every(f => missingFields.includes(f)) && (!expectation.missing.includes('date') || doc?.transactionDate === null) : !!tx && tx.currency === 'KRW');
            const currencyCorrect = (doc?.currency ?? tx?.currency) === expectation.currency;
            const result = { id: sample.id, country: sample.country, round, importId, workspaceId, expectedTotal: sample.expectedTotal, actualTotal: total, exactTotal, currency: doc?.currency ?? tx?.currency ?? null, expectedOutcome, outcomeCorrect: outcomeCorrect && currencyCorrect, currencyCorrect, confirmed: tx?.reviewStatus === 'confirmed', missingFields, canResume: snapshot?.canResume ?? null, serverOutcomeMs, clientOutcomeMs, model: meta.backupParserModel ?? null, routedThroughBackupParser: meta.routedThroughBackupParser ?? null, parserMs: meta.backupParserDecisionDurationMs ?? null, phase: file?.processingPhase ?? null, queued: initial?.queued ?? null, sourceSha256: sample.sha256, error };
            results.push(result);
            summary();
            console.log(JSON.stringify(result));
            mkdirSync(join(outputDir, `cloud-${label}-private`), { recursive: true, mode: 0o700 });
            writeFileSync(join(outputDir, `cloud-${label}-private`, `${sample.id}-${round}.json`), JSON.stringify(snapshot ?? initial ?? {}, null, 2), { mode: 0o600 });
        }
    }
    const finalHealth = await (await fetch(origin + '/api/health?benchmark=' + randomUUID())).json();
    assert.equal(finalHealth.build.gitSha, expectedSha, 'Staging changed during benchmark');
    const report = summary();
    console.log(JSON.stringify({ report: output, countries: report.countries, passed: report.passed, outcomePassed: report.outcomePassed, serverOutcomeP95Ms: report.serverOutcomeP95Ms, clientOutcomeP95Ms: report.clientOutcomeP95Ms, incorrectConfirmed: report.incorrectConfirmed }));
    if (!report.passed)
        process.exitCode = 1;
}
finally {
    if (session)
        await clerk.sessions.revokeSession(session.id);
}
