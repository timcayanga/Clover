import { Prisma } from '@prisma/client';
import { prisma } from './prisma';
import { getAdminDataEnvironment } from './admin';
import { customerAnalyticsUserWhere } from './analytics-audience';
import { bankJourneyReport, type BankObservation } from '../../shared/bank-journey-report';
import { safeProviderCode } from '../../shared/bank-journey-monitor';
const object=(v:unknown):Record<string,unknown>=>v&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,unknown>:{};
async function loadBankJourneyReport(params:{from:Date;to:Date;includeStaff:boolean}){
 const environment=getAdminDataEnvironment();const user=params.includeStaff?{environment}:await customerAnalyticsUserWhere(environment);
 const connections=await prisma.finverseConnection.findMany({where:{user,OR:[{createdAt:{gte:params.from,lte:params.to}},{lastSyncAttemptAt:{gte:params.from,lte:params.to}},{lastSyncedAt:{gte:params.from,lte:params.to}}]},select:{id:true,institutionId:true,institutionName:true,status:true,createdAt:true,lastSyncedAt:true,_count:{select:{accountLinks:{where:{accountId:{not:null},unlinkedAt:null}},transactionRecords:true}}},orderBy:{createdAt:'desc'},take:1001});
 const limited=connections.slice(0,1000),ids=limited.map(c=>c.id);
 const [audit,snapshots]=ids.length?await Promise.all([
  prisma.auditLog.findMany({where:{entity:'BankJourney',entityId:{in:ids},createdAt:{gte:params.from,lte:params.to},action:{startsWith:'bank_journey.'}},select:{entityId:true,metadata:true,createdAt:true},orderBy:{createdAt:'asc'},take:50001}),
  prisma.$queryRaw<{id:string;products:unknown}[]>(Prisma.sql`SELECT id, "rawLoginIdentity"->'login_identity'->'product_status' AS products FROM "FinverseConnection" WHERE id IN (${Prisma.join(ids)})`),
 ]):[[],[]];
 const events:BankObservation[]=audit.slice(0,50000).flatMap(row=>{const m=object(row.metadata);return row.entityId&&typeof m.stage==='string'&&typeof m.outcome==='string'&&typeof m.attempt_id==='string'?[{connectionId:row.entityId,observedAt:row.createdAt.toISOString(),stage:m.stage,outcome:m.outcome,attemptId:m.attempt_id,...(typeof m.duration_ms==='number'?{durationMs:m.duration_ms}:{}),...(typeof m.error_code==='string'?{errorCode:m.error_code}:{}),...(typeof m.failure_category==='string'?{category:m.failure_category}:{})}]:[];});
 const banks=bankJourneyReport(limited.map(c=>({id:c.id,bankId:c.institutionId,bankName:c.institutionName,status:c.status,createdAt:c.createdAt.toISOString(),lastSyncedAt:c.lastSyncedAt?.toISOString()??null,mappedAccounts:c._count.accountLinks,providerRecords:c._count.transactionRecords,products:['accounts','online_transactions','historical_transactions','statements'].flatMap(product=>{const p=object(object(snapshots.find(s=>s.id===c.id)?.products)[product]);return typeof p.status==='string'&&/^[A-Z_]{2,80}$/.test(p.status)?[{product,status:p.status,...(safeProviderCode(p)?{code:safeProviderCode(p)}:{})}]:[];})})),events);
 return {generatedAt:new Date().toISOString(),environment,audience:params.includeStaff?'all_including_staff_test':'customers',from:params.from.toISOString(),to:params.to.toISOString(),truncated:connections.length>1000||audit.length>50000,banks,limitations:['Historical provider snapshots show the last observed state, not exact stage timings.','Login and MFA are provider-hosted; only provider-reported outcomes and Clover return are observable.','A produced link URL does not prove the Finverse page loaded.','Missing display telemetry does not prove that financial data was absent.','Provider record counts are not an extraction-accuracy measurement.']};
}
export function bankMonitorRange(from?:string,to?:string){const now=new Date(Math.floor(Date.now()/60_000)*60_000);const end=to&&/^\d{4}-\d{2}-\d{2}$/.test(to)?new Date(to+'T23:59:59.999+08:00'):now;const start=from&&/^\d{4}-\d{2}-\d{2}$/.test(from)?new Date(from+'T00:00:00+08:00'):new Date(+end-30*86400000);if(!Number.isFinite(+start)||!Number.isFinite(+end)||start>end||+end-+start>366*86400000)throw Error('Choose a valid date range up to one year.');return {from:start,to:end};}

const reportCache=new Map<string,{expires:number;value:ReturnType<typeof loadBankJourneyReport>}>();
export function getBankJourneyReport(params:{from:Date;to:Date;includeStaff:boolean}){
 const key=[getAdminDataEnvironment(),+params.from,+params.to,params.includeStaff].join(':');const cached=reportCache.get(key);if(cached&&cached.expires>Date.now())return cached.value;
 const value=loadBankJourneyReport(params);reportCache.set(key,{expires:Date.now()+60_000,value});if(reportCache.size>32)reportCache.delete(reportCache.keys().next().value!);void value.catch(()=>{if(reportCache.get(key)?.value===value)reportCache.delete(key);});return value;
}
