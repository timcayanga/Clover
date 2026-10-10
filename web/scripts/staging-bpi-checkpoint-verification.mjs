// Explicitly invoked staging verification; never run by unattended CI.
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { createClerkClient } from '@clerk/backend';
import dotenv from 'dotenv';
const option = name => process.argv.find(x => x.startsWith(name + '='))?.slice(name.length + 1);
assert(process.argv.includes('--execute'));
const output = option('--output'), envFile = option('--env'), sha = option('--sha'), phase = option('--phase');
assert(output && envFile && /^[a-f0-9]{40}$/.test(sha ?? ''));
assert(['baseline', 'preview', 'repair', 'fresh'].includes(phase));
const origin = 'https://staging.clover.ph', oldRun = '857a2856-a14e-4d6a-b3ba-da7a4430d57c', importId = '8355c0a1-1b78-490d-868f-3ccb5ce4b1b5';
const sourceSha = '1ca7bedede14497963e97e77782054e15cda64e0bfd74e445df9fdce8f6a3b73';
const env = dotenv.parse(readFileSync(envFile)); assert(env.CLERK_SECRET_KEY?.startsWith('sk_test_'));
// Every database/storage/provider credential in the file is deliberately ignored.
const clerk = createClerkClient({ secretKey: env.CLERK_SECRET_KEY });
mkdirSync(output, { recursive: true, mode: 0o700 });
const artifact = (name, value) => writeFileSync(join(output, name + '.json'), JSON.stringify(value, null, 2) + '\n', { mode: 0o600 });
const read = name => JSON.parse(readFileSync(join(output, name + '.json')));
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const sessions = new Map();
async function request(role, path, { body, method = 'GET', form, binary = false } = {}) {
  assert(path.startsWith('/api/'));
  let session = sessions.get(role);
  if (!session) {
    const userId = role === 'qa' ? 'user_3JJ1IGtRLHyU8hwh7AIRM8xAh8z' : (await clerk.users.getUserList({ emailAddress: ['hello@clover.ph'] })).data[0]?.id;
    assert(userId); session = await clerk.sessions.createSession({ userId }); sessions.set(role, session);
  }
  const { jwt } = await clerk.sessions.getToken(session.id);
  const response = await fetch(origin + path, { method, headers: { Authorization: `Bearer ${jwt}`, Origin: origin, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: form ?? (body ? JSON.stringify(body) : undefined), signal: AbortSignal.timeout(90000) });
  if (!response.ok) throw new Error(`${method} ${path}: ${response.status} ${(await response.text()).slice(0, 350)}`);
  return binary ? Buffer.from(await response.arrayBuffer()) : response.json();
}
const diagnostic = (action, runId = oldRun, extra = {}) => request('admin', '/api/admin/learning-verification', { method: 'POST', body: { runId, action, ...extra } });
const assertCheckpoint = checkpoint => {
  assert.equal(Number(checkpoint.endingBalance), 1000); assert.equal(checkpoint.openingBalance, null);
  assert.equal(checkpoint.statementStartDate, '2026-08-01T12:00:00.000Z'); assert.equal(checkpoint.statementEndDate, '2026-08-25T12:00:00.000Z');
  assert.equal(checkpoint.status, 'pending'); assert.match(checkpoint.mismatchReason, /opening balance/); assert.equal(checkpoint.rowCount, 100);
  const m = checkpoint.sourceMetadata;
  assert.equal(m.statementDate, '2026-09-01T12:00:00.000Z'); assert.equal(m.paymentDueDate, '2026-09-20T12:00:00.000Z');
  assert.equal(m.totalAmountDue, 1000); assert.equal(m.balanceReconciled, false); assert.equal(m.workflowStage, 'complete');
  assert.equal(m.reconciliation.code, 'MISSING_OPENING_BALANCE'); assert.equal(m.reconciliation.reviewRequired, true);
};
try {
  const health = await (await fetch(origin + '/api/health?bpi-checkpoint=' + randomUUID())).json();
  assert.equal(health.build.environment, 'preview'); assert.equal(health.build.gitSha, sha); artifact(phase + '-build', health.build);
  if (phase === 'baseline') {
    assert(!existsSync(join(output, 'baseline.json')), 'Never overwrite the retained baseline');
    const existing = await diagnostic('inspect'); assert.deepEqual(existing.changedOutsideProfile, []);
    artifact('baseline', existing);
    const status = await request('qa', `/api/imports/${importId}/status`); artifact('baseline-status', status);
    assert.equal(status.statementCheckpoint.status, 'pending'); assert.equal(status.statementCheckpoint.endingBalance, null);
    const bytes = await request('qa', `/api/imports/${importId}/file`, { binary: true }); assert.equal(digest(bytes), sourceSha);
    writeFileSync(join(output, 'retained-source.pdf'), bytes, { mode: 0o600 });
  } else if (phase === 'preview') {
    const preview = await diagnostic('preview-bpi-checkpoint');
    assert.deepEqual(preview.plan.checkpoint, read('baseline-status').statementCheckpoint);
    assertCheckpoint({ ...preview.plan.checkpoint, ...preview.plan.patch }); assert.equal(preview.plan.unchanged, false);
    assert.deepEqual(await diagnostic('inspect').then(x => x.financial), read('baseline').financial);
    artifact('preview', preview);
  } else if (phase === 'repair') {
    const preview = read('preview');
    const result = await diagnostic('repair-bpi-checkpoint', oldRun, { expectedPlanHash: preview.plan.planHash }); artifact('repair', result);
    assert.deepEqual(result.preservation, preview.preservation); assertCheckpoint(result.checkpoint);
    const repeatedPreview = await diagnostic('preview-bpi-checkpoint'); artifact('repeat-preview', repeatedPreview);
    assert.equal(repeatedPreview.plan.unchanged, true);
    const repeated = await diagnostic('repair-bpi-checkpoint', oldRun, { expectedPlanHash: repeatedPreview.plan.planHash }); artifact('repeat-repair', repeated);
    assert.equal(repeated.unchanged, true); assert.deepEqual(repeated.checkpoint, result.checkpoint); assert.deepEqual(repeated.preservation, preview.preservation);
    const after = await diagnostic('inspect'); artifact('after-repair', after);
    for (const key of ['accounts', 'transactions', 'files', 'parsedRows', 'rules', 'signals', 'accountRules', 'templates', 'jobs']) assert.deepEqual(after[key], read('baseline')[key], `${key} changed`);
    assert.deepEqual(after.changedOutsideProfile, []);
    const status = await request('qa', `/api/imports/${importId}/status`); artifact('after-status', status); assertCheckpoint(status.statementCheckpoint); assert.equal(status.telemetryPhase, 'complete');
    assert.equal(digest(await request('qa', `/api/imports/${importId}/file`, { binary: true })), sourceSha);
  } else {
    const statePath = join(output, 'fresh-run.json');
    const state = existsSync(statePath) ? read('fresh-run') : { runId: randomUUID(), importId: randomUUID(), sha };
    assert.equal(state.sha, sha); artifact('fresh-run', state);
    if (!state.workspaceId) { const start = await diagnostic('start', state.runId); state.workspaceId = start.workspaceId; artifact('fresh-baseline', start); artifact('fresh-run', state); }
    if (!state.uploaded) {
      const bytes = readFileSync(join(output, 'retained-source.pdf')); assert.equal(digest(bytes), sourceSha);
      const form = new FormData(); form.set('file', new File([bytes], 'retained-bpi-checkpoint.pdf', { type: 'application/pdf' }));
      form.set('workspaceId', state.workspaceId); form.set('fileName', 'retained-bpi-checkpoint.pdf'); form.set('fileType', 'application/pdf'); form.set('importMode', 'statement'); form.set('forceInlineProcessing', 'true');
      artifact('fresh-upload', await request('qa', `/api/imports/${state.importId}/process`, { method: 'POST', form })); state.uploaded = true; artifact('fresh-run', state);
    }
    let done = false;
    for (let poll = 0; poll < 30; poll++) {
      const status = await request('qa', `/api/imports/${state.importId}/status`); artifact('fresh-status', status);
      if (status.importFile?.status === 'failed') throw new Error('Fresh retained-source import failed');
      if (status.importFile?.status === 'done') { assertCheckpoint(status.statementCheckpoint); assert.equal(status.telemetryPhase, 'complete'); done = true; break; }
      await new Promise(r => setTimeout(r, 1000));
    }
    assert(done);
    for (let poll = 0; poll < 15; poll++) {
      const report = await diagnostic('inspect', state.runId); artifact('fresh-after', report);
      assert.deepEqual(report.changedOutsideProfile, []);
      assert.equal(report.transactions.length, 100); assert.equal(report.parsedRows.length, 100); assert.equal(report.accounts.length, 1);
      assert.equal(Number(report.accounts[0].balance), -1000); assert.equal(report.accounts[0].currency, 'PHP'); assert.equal(report.accounts[0].accountNumber, '9999000000008263');
      assert(report.transactions.every(t => Number(t.amount) === 10 && t.type === 'expense' && t.currency === 'PHP'));
      const failed = report.jobs.filter(j => j.status === 'failed'); assert.equal(failed.length, 0);
      if (report.jobs.length && report.jobs.every(j => j.status === 'completed')) break;
      for (const job of report.jobs.filter(j => j.status === 'queued')) await request('admin', '/api/admin/learning-jobs', { method: 'POST', body: { id: job.id } });
      if (poll === 14) throw new Error('Learning did not finish');
      await new Promise(r => setTimeout(r, 1000));
    }
    const beforeRepeat = read('fresh-after');
    artifact('fresh-confirm-repeat', await request('qa', `/api/imports/${state.importId}/confirm`, { method: 'POST', body: {} }));
    const repeat = await diagnostic('inspect', state.runId); artifact('fresh-after-repeat', repeat);
    assert.deepEqual(repeat.changedOutsideProfile, []); assert.deepEqual(repeat.financial, beforeRepeat.financial);
    assert.equal(digest(await request('qa', `/api/imports/${state.importId}/file`, { binary: true })), sourceSha);
    artifact('result', { passed: true, sha, originalCheckpointMetadataRepaired: true, fullReconciliation: false, reason: 'MISSING_OPENING_BALANCE', allExistingLearningAndFinancialRowsPreserved: true, repairRetryNoOp: true, sourceBytesUnchanged: true, freshRetainedPdfPassed: true, freshRows: 100, freshBalance: -1000 });
  }
  console.log(JSON.stringify({ phase, passed: true, sha }));
} finally { await Promise.all([...sessions.values()].map(s => clerk.sessions.revokeSession(s.id).catch(() => null))); }
