/** Offline, read-only verification. Never imports Prisma or any parser/AI service. */
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,dirname} from 'node:path';
import {spawnSync} from 'node:child_process';
import {z} from 'zod';
import {validateBankStatement} from '../../shared/bank-statement-validation';
const row=z.object({id:z.string().min(1),page:z.number().int(),date:z.string(),currency:z.string(),signedAmount:z.string(),description:z.string(),reference:z.string().optional()}).strict();
const truthSchema=z.object({version:z.literal(1),sourceFile:z.string().min(1),source:z.object({kind:z.enum(['original','synthetic']),sha256:z.string(),pageCount:z.number().int(),reviewedPages:z.array(z.number().int()).max(1000),labelMethod:z.enum(['manual_original_review','synthetic']),reviewer:z.string(),reviewStatus:z.enum(['agent_reviewed','human_confirmed']),confidence:z.number().min(0).max(1)}),bankId:z.string().min(1),accountId:z.string().min(1),ledgerAccountId:z.string().min(1),accountBinding:z.enum(['confirmed','unconfirmed']),dateBasisVerified:z.boolean(),period:z.object({from:z.string(),through:z.string()}),rows:z.array(row).max(50000),balance:z.object({currency:z.string(),opening:z.string(),closing:z.string(),convention:z.enum(['asset','liability'])}).optional()}).strict();
const observed=z.object({id:z.string(),accountId:z.string(),date:z.string().nullable(),currency:z.string().nullable(),signedAmount:z.string().nullable(),description:z.string(),status:z.enum(['booked','pending','unknown'])}).strict();
const snapshotSchema=z.object({version:z.literal(1),bankId:z.string(),accountId:z.string(),ledgerAccountId:z.string(),capturedAt:z.string(),dataAsOfDate:z.string().nullable(),coverage:z.object({from:z.string().nullable(),through:z.string().nullable(),evidence:z.string().nullable()}),retrieval:z.enum(['verified_complete','unknown','truncated']),provider:z.array(observed).max(50000),ledger:z.array(observed).max(50000),links:z.array(z.object({providerId:z.string(),ledgerId:z.string().nullable()}).strict()).max(50000),balance:z.object({currency:z.string(),amount:z.string(),asOfDate:z.string().nullable(),cutoff:z.enum(['statement_close','unknown'])}).nullable().optional()}).strict();
function arg(name:string){const index=process.argv.indexOf(name);return index>=0?process.argv[index+1]:undefined;}
async function main(){
 const labelsPath=arg('--labels'),snapshotPath=arg('--snapshot'),out=arg('--out');if(!labelsPath||!snapshotPath||!out)throw Error('Usage: --labels labels.json --snapshot snapshot.json --out report.json [--from YYYY-MM-DD --through YYYY-MM-DD]');
 const truth=truthSchema.parse(JSON.parse(await readFile(labelsPath,'utf8'))),snapshotBytes=await readFile(snapshotPath),snapshot=snapshotSchema.parse(JSON.parse(snapshotBytes.toString()));
 const sourcePath=resolve(dirname(resolve(labelsPath)),truth.sourceFile);if(resolve(out)===sourcePath||resolve(out)===resolve(labelsPath)||resolve(out)===resolve(snapshotPath))throw Error('Report must not overwrite a source, labels or snapshot');
 const bytes=await readFile(sourcePath);if(bytes.subarray(0,5).toString()!=='%PDF-')throw Error('Original source must be a PDF');
 const probe=spawnSync('python3',['-c','import sys;from pypdf import PdfReader;r=PdfReader(sys.argv[1]);assert not r.is_encrypted or r.decrypt(\"\");print(len(r.pages))',sourcePath],{encoding:'utf8',timeout:15000,maxBuffer:10000});
 if(probe.status!==0||!/^[1-9]\d*\s*$/.test(probe.stdout))throw Error('Cannot verify PDF page count: use an unlocked source and Python pypdf');
 const from=arg('--from'),through=arg('--through');if(Boolean(from)!==Boolean(through))throw Error('Supply both --from and --through');
 const report=validateBankStatement(truth,snapshot,from&&through?{from,through}:truth.period,{sha256:createHash('sha256').update(bytes).digest('hex'),pageCount:Number(probe.stdout)});
 await writeFile(out,JSON.stringify({...report,snapshotSha256:createHash('sha256').update(snapshotBytes).digest('hex'),generatedAt:new Date().toISOString()},null,2)+'\n',{mode:0o600});
 console.log(JSON.stringify({status:report.status,scope:report.scope,provider:{exact:report.provider.coreExact,expected:report.provider.expectedOccurrences,missing:report.provider.missing.length,extra:report.provider.extra.length},ledger:{exact:report.ledger.coreExact,expected:report.ledger.expectedOccurrences,missing:report.ledger.missing.length,extra:report.ledger.extra.length},blockers:report.blockers,bankWideAccuracyClaimAllowed:false}));
 if((!process.argv.includes('--diagnostic')||process.argv.includes('--require-verified'))&&report.status!=='verified_for_this_account_and_window')process.exitCode=2;
}
main().catch(error=>{console.error(error instanceof z.ZodError?'Invalid verification input':error instanceof Error?error.message:'Verification failed');process.exitCode=1;});
