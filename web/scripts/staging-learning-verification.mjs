// Explicit live diagnostic. Never part of unattended CI; no production target.
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClerkClient } from '@clerk/backend';
import dotenv from 'dotenv';
const option = name => process.argv.find(x => x.startsWith(name + '='))?.slice(name.length + 1);
assert(process.argv.includes('--execute'), 'Pass --execute for explicitly authorized staging verification');
const output = option('--output'), envFile = option('--env'), sha = option('--sha'), phase = option('--phase');
assert(output && envFile && /^[a-f0-9]{40}$/.test(sha ?? ''));
assert(['start', 'loop', 'inspect', 'prepare-checkpoints', 'repair-reference', 'retry', 'finish'].includes(phase));
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const origin = 'https://staging.clover.ph', qaId = 'user_3JJ1IGtRLHyU8hwh7AIRM8xAh8z';
const env = dotenv.parse(readFileSync(envFile));
assert(env.CLERK_SECRET_KEY?.startsWith('sk_test_'), 'Development Clerk key required');
// Deliberately ignore every database/R2/provider setting in the supplied file.
const clerk = createClerkClient({ secretKey: env.CLERK_SECRET_KEY });
mkdirSync(output, { recursive: true, mode: 0o700 });
const statePath = join(output, 'run.json');
let state = existsSync(statePath) ? JSON.parse(readFileSync(statePath)) : { runId: randomUUID(), sha, imports: {}, checks: [] };
assert.equal(state.sha, sha, 'Do not silently switch releases within a verification run');
const save = () => writeFileSync(statePath, JSON.stringify(state, null, 2) + '\n', { mode: 0o600 });
const artifact = (name, data) => writeFileSync(join(output, name + '.json'), JSON.stringify(data, null, 2) + '\n', { mode: 0o600 });
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const sessions = new Map();
async function request(role, path, { body, method = 'GET', form, binary = false } = {}) {
  assert(path.startsWith('/api/'));
  let session = sessions.get(role);
  if (!session) {
    const id = role === 'qa' ? qaId : (await clerk.users.getUserList({ emailAddress: ['hello@clover.ph'] })).data[0]?.id;
    assert(id, 'Existing staging identity unavailable');
    session = await clerk.sessions.createSession({ userId: id }); sessions.set(role, session);
  }
  const { jwt } = await clerk.sessions.getToken(session.id);
  const response = await fetch(origin + path, { method, headers: { Authorization: `Bearer ${jwt}`, Origin: origin, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: form ?? (body ? JSON.stringify(body) : undefined), signal: AbortSignal.timeout(90000) });
  if (!response.ok) throw new Error(`${method} ${path} returned ${response.status}: ${(await response.text()).slice(0, 300)}`);
  return binary ? Buffer.from(await response.arrayBuffer()) : response.json();
}
const diagnostic = action => request('admin', '/api/admin/learning-verification', { method: 'POST', body: { runId: state.runId, action } });
async function inspect(label) {
  const report = await diagnostic('inspect'); artifact(label, report);
  assert.deepEqual(report.changedOutsideProfile, [], 'Established records changed; stop and investigate');
  return report;
}
async function settleLearning(allowReviewWait = false) {
  for (let i = 0; i < 12; i++) {
    const listing = await request('admin', '/api/admin/learning-jobs');
    const jobs = listing.jobs.filter(j => j.workspaceId === state.workspaceId);
    const failed = jobs.filter(j => j.status === 'failed'); assert.equal(failed.length, 0, 'Learning failed; inspect before continuing');
    const waitingForReview = j => allowReviewWait && j.status === 'queued' && j.errorCode === 'SOURCE_NOT_READY';
    const queued = jobs.filter(j => j.status === 'queued' && !waitingForReview(j));
    for (const job of queued) await request('admin', '/api/admin/learning-jobs', { method: 'POST', body: { id: job.id } });
    if (jobs.length && jobs.every(j => ['completed', 'cancelled'].includes(j.status) || waitingForReview(j))) return;
    await new Promise(r => setTimeout(r, 1000));
  }
  throw new Error('Learning did not settle');
}
async function upload(key, sourceName, mode, transform) {
  const source = readFileSync(join(root, 'web/scripts/fixtures/reviewed-parser-corpus', sourceName));
  const manifest = JSON.parse(readFileSync(join(root, 'web/scripts/fixtures/reviewed-parser-corpus/manifest.json')));
  assert.equal(digest(source), manifest.cases.find(x => x.source === sourceName)?.sha256);
  let bytes = transform ? Buffer.from(transform(source.toString())) : source;
  let uploadName = `${key}-${sourceName}`, fileType = 'text/csv';
  if (mode === 'receipt') {
    const pdfName = `${key}.pdf`;
    const pdfManifest = JSON.parse(readFileSync(join(output, 'inputs/manifest.json'))).find(row => row.name === pdfName);
    bytes = readFileSync(join(output, 'inputs', pdfName));
    assert.equal(pdfManifest.sourceTextSha256, digest(source)); assert.equal(pdfManifest.dateChanged, !!transform);
    assert.equal(pdfManifest.extractedTextVerified, true); assert.equal(digest(bytes), pdfManifest.sha256);
    uploadName = pdfName; fileType = 'application/pdf';
  }
  let item = state.imports[key];
  if (!item) {
    item = state.imports[key] = { id: randomUUID(), sourceName, sourceSha256: digest(source), uploadSha256: digest(bytes), derivative: !!transform || mode === 'receipt', uploadName, uploaded: false };
    save();
  }
  if (!item.uploaded) {
    const form = new FormData();
    form.set('file', new File([bytes], uploadName, { type: fileType }));
    form.set('workspaceId', state.workspaceId); form.set('fileName', uploadName); form.set('fileType', fileType);
    form.set('importMode', mode); form.set('forceInlineProcessing', 'true');
    const initial = await request('qa', `/api/imports/${item.id}/process`, { method: 'POST', form }); artifact(`${key}-upload`, initial);
    item.uploaded = true; save();
  }
  for (let poll = 0; poll < 40; poll++) {
    const result = await request('qa', `/api/imports/${item.id}/status`); artifact(`${key}-status`, result);
    if (result.importFile?.status === 'done') {
      const downloaded = await request('qa', `/api/imports/${item.id}/file`, { binary: true });
      assert.equal(digest(downloaded), item.uploadSha256, 'Source bytes changed in storage'); item.sourceVerified = true; save(); return result;
    }
    if (result.importFile?.status === 'failed') throw new Error(`Import ${key} failed at ${result.importFile.processingPhase}`);
    await new Promise(r => setTimeout(r, 1000));
  }
  throw new Error(`Import ${key} did not finish`);
}
try {
  const health = await (await fetch(origin + '/api/health?learning-verification=' + randomUUID())).json();
  assert.equal(health.build.environment, 'preview'); assert.equal(health.build.gitSha, sha); artifact('build', health.build);
  if (phase === 'start') {
    save(); // Persist the idempotency identity before a possibly ambiguous network outcome.
    const result = await diagnostic('start'); state.workspaceId = result.workspaceId; state.baseline = result.baseline; save();
    console.log(JSON.stringify({ runId: state.runId, workspaceId: state.workspaceId, baseline: result.baseline }));
  } else {
    assert(state.workspaceId, 'Run --phase=start first');
    if (phase === 'loop') {
      await request('qa', `/api/categories?workspaceId=${state.workspaceId}`);
      if (!state.categoryId) { const c = await request('qa', '/api/categories', { method: 'POST', body: { workspaceId: state.workspaceId, name: 'Reviewed learning meals', type: 'expense' } }); state.categoryId = c.category.id; save(); }
      await upload('statement-first', 'repeated-and-multicurrency.csv', 'statement');
      await settleLearning();
      const before = await inspect('statement-before-correction');
      const rows = before.transactions.filter(t => t.importFileId === state.imports['statement-first'].id);
      assert.equal(rows.length, 3); assert.equal(rows.filter(t => t.merchantRaw === 'Repeated coffee').length, 2);
      const coffee = rows.find(t => t.merchantRaw === 'Repeated coffee'); assert.equal(coffee.currency, 'PHP');
      const account = before.accounts.find(a => a.id === coffee.accountId); assert.equal(account.accountNumber, '0001');
      if (!state.corrected) {
        await request('qa', `/api/transactions/${coffee.id}`, { method: 'PATCH', body: { merchantClean: 'My reviewed coffee', categoryId: state.categoryId, reviewStatus: 'edited' } });
        await request('qa', `/api/accounts/${account.id}`, { method: 'PATCH', body: { workspaceId: state.workspaceId, name: 'My reviewed travel account' } });
        state.corrected = true; state.correctedTransactionId = coffee.id; save();
      }
      await settleLearning(); const corrected = await inspect('statement-corrected');
      const locked = corrected.transactions.find(t => t.id === coffee.id);
      assert(corrected.signals.some(s => s.transactionId === coffee.id && s.source === 'manual_recategorization' && s.categoryId === state.categoryId));
      assert(corrected.accountRules.some(r => r.accountId === account.id && r.source === 'manual_account_update'));
      await upload('statement-later', 'repeated-and-multicurrency.csv', 'statement', text => text.replaceAll('2026-09-15', '2026-09-16'));
      await settleLearning(); const after = await inspect('statement-after-later-import');
      assert.deepEqual(after.transactions.find(t => t.id === coffee.id), locked, 'Later import changed a confirmed correction');
      const later = after.transactions.filter(t => t.importFileId === state.imports['statement-later'].id);
      assert.equal(later.length, 3); const learned = later.filter(t => t.merchantRaw === 'Repeated coffee'); assert.equal(learned.length, 2);
      for (const t of learned) { assert.equal(t.merchantClean, 'My reviewed coffee'); assert.equal(t.categoryId, state.categoryId); assert.equal(t.accountId, account.id); assert.equal(t.currency, 'PHP'); assert.equal(Number(t.amount), 25); }
      assert.equal(later.find(t => t.merchantRaw === 'Salary').currency, 'USD');
      assert.equal(after.accounts.find(a => a.id === account.id).name, 'My reviewed travel account');
      state.checks = [...new Set([...state.checks, 'statement_correction_retrieved', 'account_identity_preserved', 'confirmed_correction_unchanged', 'legitimate_repeats_preserved', 'PHP_USD_preserved'])]; save();
      await upload('receipt-first', 'receipt-php-items.txt', 'receipt'); await settleLearning(true);
      const receipts = await inspect('receipt-before-correction'); const receipt = receipts.transactions.find(t => t.importFileId === state.imports['receipt-first'].id);
      assert(receipt); assert.equal(Number(receipt.amount), 172.8); assert.equal(receipt.currency, 'PHP');
      if (!state.receiptCorrected) { await request('qa', `/api/transactions/${receipt.id}`, { method: 'PATCH', body: { merchantClean: 'My reviewed cafe', categoryId: state.categoryId, reviewStatus: 'edited' } }); state.receiptCorrected = true; save(); }
      await settleLearning(); const reviewedReceipt = await inspect('receipt-corrected'); const lockedReceipt = reviewedReceipt.transactions.find(t => t.id === receipt.id);
      await upload('receipt-later', 'receipt-php-items.txt', 'receipt', text => text.replace('Jan 12, 2026', 'Jan 13, 2026')); await settleLearning(true);
      const final = await inspect('loop-complete'); const learnedReceipt = final.transactions.find(t => t.importFileId === state.imports['receipt-later'].id);
      assert.equal(learnedReceipt?.merchantClean, 'My reviewed cafe'); assert.equal(learnedReceipt.categoryId, state.categoryId); assert.equal(Number(learnedReceipt.amount), 172.8); assert.equal(learnedReceipt.currency, 'PHP');
      assert.deepEqual(final.transactions.find(t => t.id === receipt.id), lockedReceipt);
      state.checks.push('receipt_correction_retrieved', 'receipt_total_preserved', 'source_bytes_unchanged'); save(); console.log(JSON.stringify({ checks: state.checks }));
    } else if (phase === 'prepare-checkpoints' || phase === 'repair-reference') {
      const result = await diagnostic(phase); artifact(phase, result); console.log(JSON.stringify(result));
    } else if (phase === 'retry') {
      const report = await inspect('before-retry');
      for (const id of [report.failureJobId, report.interruptionJobId]) { assert(id); await request('admin', '/api/admin/learning-jobs', { method: 'POST', body: { id } }); }
      await inspect('after-retry');
    } else if (phase === 'finish') {
      for (const required of ['statement_correction_retrieved', 'receipt_correction_retrieved', 'account_identity_preserved', 'confirmed_correction_unchanged', 'legitimate_repeats_preserved', 'PHP_USD_preserved', 'receipt_total_preserved', 'source_bytes_unchanged']) assert(state.checks.includes(required), `Missing live check: ${required}`);
      assert.equal(Object.keys(state.imports).length, 4); assert(Object.values(state.imports).every(item => item.sourceVerified));
      const first = await inspect('before-idempotence');
      assert.deepEqual(first.changedProtectedFinancial, []);
      for (const id of [first.failureJobId, first.interruptionJobId]) { const job = first.jobs.find(j => j.id === id); assert.equal(job?.status, 'completed'); assert.equal(job.nextIndex, 3); await request('admin', '/api/admin/learning-jobs', { method: 'POST', body: { id } }); }
      const last = await inspect('final'); assert.deepEqual(last.changedProtectedFinancial, []);
      const ordered = rows => [...rows].sort((a,b) => a.id.localeCompare(b.id));
      for (const key of ['rules', 'signals', 'accountRules', 'templates', 'transactions', 'accounts', 'files', 'parsedRows']) assert.deepEqual(ordered(first[key]), ordered(last[key]), `Retry changed ${key}`);
      assert(last.jobs.some(j => j.runs.some(r => r.errorCode === 'CATEGORY_UNAVAILABLE')));
      assert(last.jobs.some(j => j.runs.some(r => r.errorCode === 'LEASE_EXPIRED')));
      state.checks.push('failure_reason_retained', 'checkpoint_resume', 'expired_lease_recovered', 'completed_retry_idempotent', 'all_baseline_hashes_unchanged'); state.passed = true; save();
      console.log(JSON.stringify({ passed: true, runId: state.runId, checks: state.checks, unchanged: last.current }));
    } else { const report = await inspect('inspection'); console.log(JSON.stringify({ workspaceId: report.workspaceId, changed: report.changedOutsideProfile, protectedChanged: report.changedProtectedFinancial, jobs: report.jobs.map(j => ({ id: j.id, source: j.source, status: j.status, nextIndex: j.nextIndex, totalItems: j.totalItems, errorCode: j.errorCode })) })); }
  }
} finally { for (const session of sessions.values()) await clerk.sessions.revokeSession(session.id); }
