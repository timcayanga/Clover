import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import { bankLinkPresentation, bankSyncDate, bankUnlinkMessage, preferredBankLinks, type BankLinkCard } from '../../shared/bank-link-presentation';
const account: BankLinkCard = {id:'card',connectionId:'active',name:'Savings',last4:'1234',logoUrl:'logo',lastSyncedAt:'2026-10-02T12:23:18Z',status:'ready',syncError:null,authorizationAvailable:true,institutionId:'bank'};
assert.deepEqual(bankLinkPresentation(account),{relink:false,pending:false,label:'Connected'});
for (const change of [{status:'disconnected'},{unlinkedAt:'2026-10-03'},{authorizationAvailable:false},{syncError:'Bank authorization expired. Reconnect securely to sync again.'},{status:'link_pending'}]) assert.equal(bankLinkPresentation({...account,...change}).label,'Unlinked');
assert.equal(bankLinkPresentation({...account,status:'disconnect_pending'}).pending,true);
assert.equal(bankLinkPresentation({...account,syncError:'Temporary network error'}).relink,false);
assert(bankUnlinkMessage('disconnect_pending').startsWith('Unlinking'));
assert(!bankUnlinkMessage('disconnect_pending').startsWith('Bank unlinked'));
assert(bankUnlinkMessage('unlinked').startsWith('Bank unlinked'));
assert.equal(bankSyncDate('invalid'),null);
assert.equal(bankSyncDate(null),null);
assert(!bankSyncDate(account.lastSyncedAt)?.includes(':'));
const old={...account,connectionId:'old',status:'disconnected',lastSyncedAt:'2026-10-04'};
for (const links of [[old,account],[account,old]]) assert.equal(preferredBankLinks(links)[0].connectionId,'active');
assert.equal(preferredBankLinks([{...old,lastSyncedAt:'2026-09-01'},old])[0].lastSyncedAt,'2026-10-04');

// Run the actual route with an isolated persistence boundary: no live bank/user writes.
const fixture=`
export const requireAuth=async()=>({userId:'owner'});
export const assertWorkspaceAccess=async(user,id)=>{if(id!=='profile')throw Error('WORKSPACE_NOT_FOUND');return {userId:user};};
export const getProAccess=async()=>({planTier:'pro'});
export const bankLifecycleOverview=async()=>({});
export const getAccountBrand=()=>({fallbackIconSrc:'bank.png'});
export let scoped=false;
export const prisma={finverseConnection:{findMany:async({where,select})=>{
 if(where.workspaceId!=='profile'||where.user.clerkUserId!=='owner')throw Error('unsafe ownership');
 const detail=where.accountLinks?.some?.accountId;
 if(detail){if(detail!=='card')return []; if(where.status||where.encryptedRefreshToken)throw Error('history filtered out');if(select.accountLinks.where.workspaceId!=='profile'||select.accountLinks.where.accountId?.not!==null||select.accountLinks.where.unlinkedAt!==undefined)throw Error('missing shared login context');scoped=true;}
 else if(where.status?.not!=='disconnected'||where.encryptedRefreshToken?.not!==null||select.accountLinks.where.unlinkedAt!==null)throw Error('picker includes inactive');
 return [{id:'revoked',institutionId:'bpi',institutionName:'BPI',status:'disconnected',encryptedRefreshToken:null,lastSyncedAt:new Date('2026-10-02'),syncError:null,accountLinks:[{unlinkedAt:new Date('2026-10-03'),account:{id:'card',name:'Savings',institution:'BPI',accountNumber:'1234',type:'bank'}},{unlinkedAt:new Date('2026-10-03'),account:{id:'shared-sibling',name:'Shared login savings',institution:'BPI',accountNumber:'5678',type:'bank'}}]},...(detail?[]:[{id:'active',institutionId:'bpi',status:'ready',encryptedRefreshToken:'NEVER-EXPOSE-TOKEN',lastSyncedAt:new Date('2026-10-04'),accountLinks:[{unlinkedAt:null,account:{id:'card',name:'Savings',accountNumber:'1234',type:'bank'}}]}])];
}}};`;
async function main(){
 const bundle=await build({stdin:{contents:`export {GET} from './app/api/integrations/finverse/connections/route';export {scoped} from 'fixture';`,resolveDir:process.cwd()},bundle:true,platform:'node',format:'cjs',packages:'external',write:false,plugins:[{name:'isolated-bank-links',setup(b){b.onResolve({filter:/^(fixture|@\/lib\/(auth|workspace-access|prisma|account-brand|pro-access|finverse-lifecycle))$/},()=>({path:'fixture',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:fixture,loader:'ts',resolveDir:process.cwd()}));}}]});
 const mod={exports:{} as any};new Function('require','module','exports',bundle.outputFiles[0].text)(createRequire(resolve('package.json')),mod,mod.exports);
 const api=mod.exports;
 const detail=await api.GET(new Request('https://test/connections?view=picker&workspaceId=profile&accountId=card'));assert.equal(detail.status,200);const body=await detail.json();assert(api.scoped);assert.equal(body.accounts.length,2);assert(body.accounts.some(a=>a.id==='shared-sibling'),'Unlink confirmation must retain other accounts sharing the bank login');assert.equal(bankLinkPresentation(body.accounts[0]).label,'Unlinked');assert.equal(body.accounts[0].institutionId,'bpi');
 const picker=await (await api.GET(new Request('https://test/connections?view=picker&workspaceId=profile'))).json();assert.equal(picker.accounts[0].connectionId,'active');assert(!JSON.stringify(picker).includes('NEVER-EXPOSE-TOKEN'));
 const other=await api.GET(new Request('https://test/connections?workspaceId=foreign&accountId=card'));assert.equal(other.status,404);
 const missing=await (await api.GET(new Request('https://test/connections?workspaceId=profile&accountId=foreign'))).json();assert.equal(missing.accounts.length,0);
 const source=readFileSync('app/accounts/[accountId]/page.tsx','utf8');assert(source.indexOf('<FinancialAccountCard\n',source.indexOf('accounts-detail__hero-layout'))<source.indexOf('<FinverseConnectButton key='));assert(!source.includes('Historical bank balance'));assert(!source.includes('toLocaleString()'));
 console.log('Bank connection states, date-only display, current-link preference, scoped history, ownership and secret projection passed.');
}
void main();
