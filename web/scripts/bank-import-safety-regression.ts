import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import { createBankImportOverlapMatcher } from '../lib/bank-import-overlap';
import { findBestImportedAccountMatch } from '../lib/workspace-cache';

async function main() {
 const row={id:'bank-1',accountId:'account',date:new Date('2026-09-20'),amount:'100.00',currency:'PHP',type:'expense',merchantRaw:'Coffee Store',merchantClean:'User title',description:'User note'};
 const original=JSON.stringify(row);
 const match=createBankImportOverlapMatcher([row,{...row,id:'bank-2'}]);
 assert.equal(match({...row,merchantRaw:'COFFEE STORE',merchantClean:null,description:null}),'ambiguous');
 assert.equal(match({...row,merchantRaw:'Other merchant',merchantClean:null,description:null}),'ambiguous');
 assert.equal(match({...row,accountId:'different'}),'new');
 assert.equal(match({...row,currency:'USD'}),'new');
 assert.equal(match({...row,type:'income'}),'new');
 assert.equal(match(row),'ambiguous','Matching merchant and amount must preserve both purchases');
 const referenced = { ...row, description: 'Payment reference: ABC123456' };
 const second = { ...row, id: 'bank-2', description: 'Payment reference: XYZ123456' };
 const matchReference = createBankImportOverlapMatcher([referenced, second]);
 assert.equal(matchReference({ ...row, description: 'Payment reference: OTHER123456' }),'new');
 assert.equal(matchReference(referenced),'matched');
 assert.equal(matchReference(second),'matched');
 assert.equal(matchReference(referenced),'new','A bank row can be claimed only once');
 const ambiguousReference = createBankImportOverlapMatcher([referenced, { ...referenced, id: 'bank-3' }]);
 assert.equal(ambiguousReference(referenced),'ambiguous','Two candidates with the same reference cannot establish one-to-one overlap');
 assert.equal(JSON.stringify(row),original);
 const account={id:'existing',name:'Metrobank Savings',institution:'Metrobank',accountNumber:'0012345678901',type:'bank',currency:'PHP'};
 assert.equal(findBestImportedAccountMatch([account],{...account,name:'Uploaded savings'})?.id,'existing');
 const worker=readFileSync('workers/import-processor.ts','utf8');
 const protectedGuard=worker.indexOf('if (!canPatchImportedClassification) continue;');
 assert(protectedGuard>0 && protectedGuard<worker.indexOf('await tx.transaction.update({',protectedGuard));

 const fixture=`let entries=[];let tail=Promise.resolve();
 export const prisma={$transaction(fn){const result=tail.then(()=>fn({$executeRaw:async()=>{},auditLog:{findMany:async({where})=>entries.filter(e=>e.entityId===where.entityId&&e.actorUserId===where.actorUserId&&e.createdAt>where.createdAt.gt).sort((a,b)=>a.createdAt-b.createdAt),create:async({data})=>{entries.push(data);return data;}}}));tail=result.catch(()=>{});return result;}};`;
 const output=await build({stdin:{contents:"export * from './lib/finverse-refresh-limit';",resolveDir:process.cwd()},bundle:true,platform:'node',format:'cjs',packages:'external',write:false,plugins:[{name:'fixture',setup(b){b.onResolve({filter:/^\.\/prisma$/},()=>({path:'fixture',namespace:'test'}));b.onLoad({filter:/.*/,namespace:'test'},()=>({contents:fixture,loader:'ts'}));}}]});
 const require=createRequire(resolve('package.json'));const Module=require('node:module');const m=new Module(resolve('limit-fixture.cjs'));m.filename=resolve('limit-fixture.cjs');m.paths=Module._nodeModulePaths(process.cwd());m._compile(output.outputFiles[0].text,m.filename);
 const {reserveBankRefresh,BankRefreshLimitError}=m.exports;
 const connection={id:'connection',userId:'user',workspaceId:'profile'};const now=new Date('2026-09-27T12:00Z');
 const results=await Promise.allSettled(Array.from({length:8},()=>reserveBankRefresh(connection,now)));
 assert.equal(results.filter(r=>r.status==='fulfilled').length,4,'Concurrent calls share four durable reservations');
 for(const result of results)if(result.status==='rejected'){assert(result.reason instanceof BankRefreshLimitError);assert.equal(result.reason.retryAt.toISOString(),'2026-09-28T12:00:00.000Z');}
 await reserveBankRefresh({...connection,id:'other'},now);
 await assert.rejects(reserveBankRefresh(connection,new Date(+now+86400000-1)),BankRefreshLimitError);
 await reserveBankRefresh(connection,new Date(+now+86400000));
 console.log('Bank import safety: account reuse, one-to-one overlaps, identity isolation, protected edits and concurrent rolling refresh limit passed.');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
