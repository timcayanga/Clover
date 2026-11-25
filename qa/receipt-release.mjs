import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {readFile, readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';

const exec = promisify(execFile);
const gitSha = /^[0-9a-f]{40}$/;
const affected = /receipt|upload|import|split[-_]?bill|circles?|native[-_]?api|mobile[-_]?api|api\/mobile|mobile\/src\/(api|app)\.|prisma\/schema|prisma\/migrations|package(-lock)?\.json/i;

export function touchesReceiptFlow(files) {
  return files.some(file => !/^(docs|qa)\//.test(file) && affected.test(file));
}

// The release operator records the actual live requests and subsequent ledger read.
// Missing evidence stays pending across daily runs, including unrelated later changes.
export async function receiptReleaseCheck({qa, root, outputDir, origin, build}) {
  const head = build?.gitSha;
  const directories = (await readdir(path.join(qa, 'output'))).filter(name =>
    /^\d{4}-/.test(name) && name < path.basename(outputDir)).sort().reverse();
  let previous;
  for (const name of directories) {
    let record;
    try { record = JSON.parse(await readFile(path.join(qa, 'output', name, 'report.json'), 'utf8')); }
    catch (error) { if (error.code === 'ENOENT') continue; throw error; }
    if (record.target && new URL(record.target).origin === origin && gitSha.test(record.liveBuild?.gitSha)) {
      previous = record; break;
    }
  }
  const base = previous?.receiptRelease?.pending ? previous.receiptRelease.base : previous?.liveBuild?.gitSha;
  const gate = {base: base ?? null, head, pending:true};
  if (!gitSha.test(head) || !build.deploymentId) return {...gate, detail:'Deployment identity unavailable.'};
  if (!previous?.receiptRelease?.pending && base === head && previous.liveBuild.deploymentId === build.deploymentId)
    return {...gate, pending:false, detail:'No new deployed source revision since the prior observation.'};
  if (gitSha.test(base) && base !== head && !previous?.receiptRelease?.pending) {
    try {
      const {stdout} = await exec('git', ['diff','--no-renames','--name-only',base,head,'--'], {cwd:root});
      if (!touchesReceiptFlow(stdout.trim().split('\n')))
        return {...gate,pending:false,detail:'Deployed diff contains no receipt-flow changes.'};
    } catch { /* Unknown diff requires evidence. */ }
  }
  const folder = path.join(qa,'state','receipt-releases',new URL(origin).hostname,head);
  try {
    const proof = JSON.parse(await readFile(path.join(folder,'result.json'),'utf8'));
    if (!validProof(proof,origin,build)) throw Error('Incomplete or mismatched receipt proof.');
    const artifact = await readFile(path.join(folder,'redacted-trace.json'));
    if (createHash('sha256').update(artifact).digest('hex') !== proof.traceSha256) throw Error('Trace checksum mismatch.');
    return {...gate,pending:false,verified:true,detail:'Matched release upload, interrupted response, identical retry and single ledger row.',evidence:folder};
  } catch {
    return {...gate, detail:'Live receipt release check pending. Follow qa/receipt-release.md in the fictional QA workspace.'};
  }
}

export function validProof(p, origin, build, size = "large") {
  const sha256 = /^[a-f0-9]{64}$/;
  return p?.origin === origin && p.gitSha === build.gitSha && p.deploymentId === build.deploymentId &&
    sha256.test(p.traceSha256) && sha256.test(p.fileSha256) && p.retryFileSha256 === p.fileSha256 &&
    (size === "small-staging" ? origin === "https://staging.clover.ph" && p.fileBytes > 0 && p.fileBytes < 250000 : p.fileBytes > 4500000) && p.interruption === 'save-response-lost' &&
    typeof p.firstBillId === 'string' && p.firstBillId.length > 0 && p.retryBillId === p.firstBillId &&
    Array.isArray(p.matchingIdsAfterReload) && p.matchingIdsAfterReload.length === 1 &&
    p.matchingIdsAfterReload[0] === p.firstBillId && Number.isSafeInteger(p.expectedTotalMinor) &&
    p.expectedTotalMinor > 0 && p.actualTotalMinor === p.expectedTotalMinor;
}
