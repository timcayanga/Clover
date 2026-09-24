import assert from 'node:assert/strict';
import type { Prisma } from '@prisma/client';
import { finalizePortfolioImport, isHoldingsOnlyPortfolio, portfolioConfidence } from '../lib/portfolio-import';
import { projectPortfolio } from '../../shared/investment-portfolio';
const fixture = () => ({
 file: {id:'import',workspaceId:'profile',status:'processing',accountId:null as string|null},
 doc:{id:'document',workspaceId:'profile',documentFamily:'portfolio',institution:'COL Financial',investmentSnapshot:{id:'source',snapshotDate:null}},
 holdings:['FMETF','GTCAP','SM','URC'].map((assetName,i)=>({id:`h${i}`,assetName,assetSymbol:assetName,assetType:'stock',workspaceId:'profile',currency:'PHP',quantity:10,currentValue:1000+i,marketValue:null,costBasis:900,accountId:null as string|null,confidence:.99,status:null as string|null,rawPayload:{currencyEvidence:'PHP' as string|null,parserEvidence:{source_text:`${assetName} 10 PHP ${1000+i}`}},investmentSnapshotId:'source'})),
 accounts:[] as any[],snapshots:[] as any[],audits:[] as any[],tombstones:[] as any[],parsedRows:0,otherAccounts:0,
});
type State=ReturnType<typeof fixture>;
function client(s:State){return {
 workspace:{findUniqueOrThrow:async()=>({userId:'user'})},$queryRaw:async()=>[],
 importFile:{findFirst:async()=>s.file,update:async({data}:any)=>Object.assign(s.file,data)},
 documentImport:{findUnique:async()=>({...s.doc,investmentHoldings:s.holdings})},parsedTransaction:{count:async()=>s.parsedRows},
 account:{findMany:async()=>[...s.accounts],count:async()=>s.accounts.length+s.otherAccounts,create:async({data}:any)=>{const a={...data,id:`a${s.accounts.length}`,updatedAt:new Date().toISOString()};s.accounts.push(a);return a;},update:async()=>{throw Error('Existing account writes forbidden');}},
 accountTombstone:{findMany:async()=>s.tombstones},investmentSnapshot:{upsert:async({where,create}:any)=>{const old=s.snapshots.find(x=>x.id===where.id);if(!old)s.snapshots.push(create);return old??create;}},
 investmentHolding:{update:async({where,data}:any)=>Object.assign(s.holdings.find(h=>h.id===where.id)!,data)},auditLog:{create:async({data}:any)=>s.audits.push(data)},
} as unknown as Prisma.TransactionClient;}
async function run(s:State,limit:number|null=10){const before=structuredClone(s);try{return await finalizePortfolioImport(client(s),{importFileId:'import',workspaceId:'profile',accountLimit:limit});}catch(e){Object.assign(s,before);throw e;}}
async function main(){
 const candidate={mode:'portfolio',schemaValidated:true,localRows:0,backupRows:0,holdings:[{asset_name:'FMETF',current_value:0,market_value:null}]};
 assert.equal(isHoldingsOnlyPortfolio(candidate),true);
 for(const extra of [{mode:'statement'},{schemaValidated:false},{localRows:1},{backupRows:1},{holdings:[]},{holdings:[{asset_name:'x',current_value:null,market_value:null}]}])assert.equal(isHoldingsOnlyPortfolio({...candidate,...extra}),false);
 assert.equal(portfolioConfidence(.99),99);assert.equal(portfolioConfidence(85),85);assert.equal(portfolioConfidence(NaN),0);
 const s=fixture();assert.equal((await run(s))?.holdings,4);assert.equal(s.accounts.length,4);assert.equal(s.snapshots.length,4);assert.equal(s.file.status,'done');assert.equal((s.file as any).confirmedTransactionsCount,0);
 assert.ok(s.holdings.every(h=>h.status==='pending_review'&&h.confidence===99&&h.accountId));assert.ok(s.snapshots.every(x=>x.rawPayload.sourceDocumentImportId==='document'));
 const before=JSON.stringify(s);await run(s);assert.equal(JSON.stringify(s),before);
 const projected=projectPortfolio(s.accounts,s.snapshots.map(x=>({id:x.id,accountId:x.accountId,institution:'COL Financial',currency:x.currency,totalValue:String(x.totalValue),date:'2026-09-25',holdings:s.holdings.filter(h=>h.investmentSnapshotId===x.id).map(h=>({id:h.id,name:h.assetName,symbol:h.assetSymbol,subtype:h.assetType,currency:h.currency,quantity:String(h.quantity),value:String(h.currentValue),cost:String(h.costBasis)}))})));
 assert.equal(projected.length,4,'All four stocks must reach the native portfolio projection');
 const existing=fixture();existing.accounts.push({id:'existing',type:'investment',name:'FMETF',institution:'COL Financial',currency:'PHP',balance:555,investmentQuantity:3});const saved=JSON.stringify(existing.accounts[0]);await run(existing);assert.equal(JSON.stringify(existing.accounts[0]),saved);assert.equal(existing.accounts.length,4);
 const cases:Array<[(s:State)=>void,RegExp]>=[
 [s=>{s.otherAccounts=8},/allowance/],[s=>{s.doc.institution='Unknown'},/provider/],[s=>{s.holdings[3].currentValue=-1},/clear name/],[s=>{s.holdings[0].rawPayload.currencyEvidence=null},/currency/],[s=>{s.holdings[0].status='confirmed'},/reviewed/],[s=>{s.holdings[1].assetName='FMETF'},/duplicate holdings/],[s=>{s.tombstones.push({name:'FMETF',institution:'COL Financial',currency:'PHP'})},/previously deleted/],[s=>{s.holdings[0].accountId='another-profile'},/account link/]];
 for(const [mutate,error] of cases){const s=fixture();mutate(s);const before=JSON.stringify(s);await assert.rejects(run(s),error);assert.equal(JSON.stringify(s),before,'Failure must roll back all writes');}
 const ledger=fixture();ledger.parsedRows=2;assert.equal(await run(ledger),null);assert.equal(ledger.accounts.length,0);
 console.log('Portfolio-only import regression passed: four-stock visibility, retries, native projection, existing-record preservation, quota and rollback guards.');
}
void main();
