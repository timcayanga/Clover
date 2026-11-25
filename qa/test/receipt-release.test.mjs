import {test} from 'node:test';
import assert from 'node:assert/strict';
import {touchesReceiptFlow,validProof} from '../receipt-release.mjs';
test('receipt release classification includes transport and financial data changes',()=>{
  for(const file of ['shared/receipt-upload.ts','web/workers/import-processor.ts','mobile/src/api.ts','web/app/api/split-bills/route.ts','web/prisma/schema.prisma'])
    assert(touchesReceiptFlow([file]),file);
  assert.equal(touchesReceiptFlow(['qa/live-receipt.mjs','docs/receipt-review.md','web/app/help/page.tsx']),false);
});
test('receipt evidence must match the release, byte identity, interrupted save and reloaded ledger',()=>{
  const origin='https://staging.clover.ph', build={gitSha:'a'.repeat(40),deploymentId:'deployment'};
  const p={origin,...build,fileSha256:'b'.repeat(64),retryFileSha256:'b'.repeat(64),traceSha256:'c'.repeat(64),firstBillId:'one',retryBillId:'one',
    matchingIdsAfterReload:['one'],interruption:'save-response-lost',fileBytes:5000000,actualTotalMinor:8000,expectedTotalMinor:8000};
  assert(validProof(p,origin,build));
  const small={...p,fileBytes:42000};
  assert(validProof(small,origin,build,'small-staging'));
  assert(!validProof(small,origin,build));
  assert(!validProof({...small,matchingIdsAfterReload:['one','two']},origin,build,'small-staging'));
  assert(!validProof({...small,origin:'https://clover.ph'},'https://clover.ph',build,'small-staging'));
  for(const changed of [{origin:'https://clover.ph'},{deploymentId:'different'},{retryFileSha256:'0'.repeat(64)},{matchingIdsAfterReload:['one','two']},
    {actualTotalMinor:16000},{retryBillId:'new'},{fileBytes:4000000},{interruption:'none'}]) assert(!validProof({...p,...changed},origin,build));
});

import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {receiptReleaseCheck} from '../receipt-release.mjs';
test('unchanged deployments skip live uploads and outstanding receipt checks carry forward',async t=>{
  const qa=await mkdtemp(path.join(tmpdir(),'receipt-gate-'));
  t.after(()=>rm(qa,{recursive:true,force:true}));
  const origin='https://staging.clover.ph',build={deploymentId:'one',gitSha:'1'.repeat(40)};
  const previous=path.join(qa,'output','2026-11-01'),outputDir=path.join(qa,'output','2026-11-02');
  await mkdir(previous,{recursive:true});
  const report={target:origin,liveBuild:build};
  const args={qa,root:qa,outputDir,origin,build};
  await writeFile(path.join(previous,'report.json'),JSON.stringify(report));
  assert.equal((await receiptReleaseCheck(args)).pending,false);
  report.receiptRelease={base:'0'.repeat(40),pending:true};
  await writeFile(path.join(previous,'report.json'),JSON.stringify(report));
  assert.equal((await receiptReleaseCheck(args)).pending,true);
  assert.equal((await receiptReleaseCheck({...args,origin:'https://clover.ph'})).pending,true);
});
