import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let consent = true, allowance = true, calls = 0;
const diagnostics: Array<{ reason: string }> = [];
for (const [name, exports] of [
  ['../lib/ai-consent', { maySendToCloudAi: async () => consent }],
  ['../lib/clover-token-usage', { mayUseImportCloudAi: async () => allowance, calculateModelCloverTokens: () => 0 }],
] as const) {
  const path = require.resolve(name);
  require.cache[path] = { id: path, filename: path, loaded: true, exports } as NodeModule;
}
process.env.OPENAI_API_KEY = 'qa-never-sent';
process.env.OPENAI_IMPORT_PARSER_PRIMARY = 'false';
globalThis.fetch = async (input) => {
  assert.equal(String(input), 'https://api.openai.com/v1/responses');
  calls++;
  // A terminal provider failure must return once, never retry through confirmation.
  return new Response(JSON.stringify({ error: { message: 'QA terminal response', code: 'invalid_request_error' } }), { status: 400 });
};
async function main() {
  const { parseImportTextWithOpenAIFallback } = await import('../lib/openai-import-parser');
  const params = {
    onDiagnostic: (diagnostic: { reason: string }) => { diagnostics.push(diagnostic); },
    consentUserId: 'qa', text: 'GCash Transaction History\nDate and Time Description Reference No. Debit Credit Balance\nSTARTING BALANCE 100.00\nUnreadable financial transactions\nENDING BALANCE 50.00',
    fileName: 'statement.pdf', fileType: 'application/pdf', importMode: 'statement' as const,
    detectedMetadata: { institution: 'GCash', accountNumber: '09050000001', accountName: 'GCash', accountType: 'wallet' as const, currency: 'PHP', openingBalance: 100, endingBalance: 50, startDate: null, endDate: null, confidence: 90 },
    parsedRows: [],
  };
  assert.equal(await parseImportTextWithOpenAIFallback(params), null);
  assert.equal(calls, 1, 'Zero local rows must reach backup despite strong metadata');
  await parseImportTextWithOpenAIFallback({ ...params, forceFallback: true, parsedRows: [{ date: '2026-10-23', amount: '50.00', currency: 'PHP', type: 'expense' }] });
  assert.equal(calls, 2, 'An explicit quality-gate handoff cannot be vetoed by metadata confidence');
  consent = false; await parseImportTextWithOpenAIFallback(params);
  assert.equal(calls, 2, 'Consent still protects every transmission');
  consent = true; allowance = false; await parseImportTextWithOpenAIFallback(params);
  assert.equal(calls, 2, 'Quota still protects every model request');
  allowance = true; await parseImportTextWithOpenAIFallback({ ...params, forceFallback: true, detectedMetadata: null, text: 'Curriculum vitae. Experienced designer applying for graduate study. Education, academic history and professional experience. '.repeat(8), fileName: 'resume.pdf' });
  assert.equal(calls, 2, 'Forced fallback never bypasses the financial scope check');
  assert(diagnostics.some(d => d.reason === 'consent_required'));
  assert(diagnostics.some(d => d.reason === 'quota_exhausted'));
  assert(diagnostics.some(d => d.reason === 'provider_error'));
  console.log('Backup: empty local results, explicit quality handoff, terminal provider failure, consent, quota and financial scope passed.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
