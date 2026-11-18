import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import { after } from 'next/server';
import { headers } from 'next/headers';
import { browserContext } from '../../shared/analytics';
import { prisma } from './prisma';
import { capturePostHogServerEvent } from './analytics-server';
import { bankFailure, bankProviderStage, bankProductEvidence, type BankJourneyStage, type BankJourneyOutcome } from '../../shared/bank-journey-monitor';
type Connection={id:string;workspaceId:string;userId:string;institutionId?:string|null;institutionName?:string|null;createdAt:Date};
type Context={requestId:string;started:number;attemptId?:string;attemptStarted?:number;kind:'link'|'sync'|'callback'|'display';connection?:Connection;clerkUserId?:string;platform?:string;appVersion?:string;appBuild?:string;selectedBankId?:string;selectedBankName?:string;lastProviderError?:unknown};
const scope=new AsyncLocalStorage<Context>();
const persistedStages=new Map<string,number>();
export function withBankMonitoring<T>(kind:Context['kind'],work:()=>Promise<T>){return scope.run({requestId:randomUUID(),started:Date.now(),kind},work);}
export async function bindBankMonitoring(connection:Connection,clerkUserId:string,newAttempt=false){
 const c=scope.getStore();if(!c)return;
 c.connection=connection;c.clerkUserId=clerkUserId;
 try{const h=await headers();const native=h.get('x-clover-platform');const ua=h.get('user-agent')??'';c.platform=native==='ios'||native==='android'?native:ua?browserContext(ua).platform:undefined;c.appVersion=h.get('x-clover-app-version')?.slice(0,40)??undefined;c.appBuild=h.get('x-clover-app-build')?.slice(0,40)??undefined;if(c.appVersion&&!/^\d+(?:\.\d+){1,3}(?:[-+][A-Za-z0-9.]{1,16})?$/.test(c.appVersion))c.appVersion=undefined;if(c.appBuild&&!/^\d{1,16}$/.test(c.appBuild))c.appBuild=undefined;}catch{/* Background workers may not have request headers. */}
 c.attemptId=connection.id;c.attemptStarted=+connection.createdAt;
 try {
 if(newAttempt){c.attemptId=randomUUID();c.attemptStarted=Date.now();await prisma.auditLog.create({data:{workspaceId:connection.workspaceId,actorUserId:connection.userId,entity:'BankJourney',entityId:connection.id,action:'bank_journey.attempt_started',metadata:{attempt_id:c.attemptId,journey_kind:'refresh',...(c.platform?{platform:c.platform}:{}),...(c.appVersion?{app_version:c.appVersion}:{}),...(c.appBuild?{app_build:c.appBuild}:{})}}});}
 else {const previous=await prisma.auditLog.findFirst({where:{workspaceId:connection.workspaceId,entity:'BankJourney',entityId:connection.id,action:'bank_journey.attempt_started'},orderBy:{createdAt:'desc'},select:{metadata:true,createdAt:true}}).catch(()=>null);const m=previous?.metadata as {attempt_id?:string}|null;c.attemptId=m?.attempt_id??connection.id;c.attemptStarted=previous?.createdAt?+previous.createdAt:+connection.createdAt;}
 const selected=await prisma.auditLog.findFirst({where:{workspaceId:connection.workspaceId,entity:'BankJourney',entityId:connection.id,action:{in:['bank_journey.bank_selected.succeeded','bank_journey.bank_selection_validated.succeeded']}},orderBy:[{action:'desc'},{createdAt:'desc'}],select:{metadata:true}}).catch(()=>null);
 const selection=selected?.metadata as {bank_id?:string;bank_name?:string}|null;
 c.selectedBankId=selection?.bank_id&&selection.bank_id!=='unknown'?selection.bank_id:connection.institutionId??undefined;
 c.selectedBankName=selection?.bank_name&&selection.bank_name!=='Unknown bank'?selection.bank_name:c.selectedBankId===connection.institutionId?connection.institutionName??undefined:undefined;
 if(c.kind==='callback'){
 const origin=await prisma.auditLog.findFirst({where:{workspaceId:connection.workspaceId,entity:'BankJourney',entityId:connection.id,action:'bank_journey.link_request.started',metadata:{path:['attempt_id'],equals:c.attemptId}},orderBy:{createdAt:'desc'},select:{metadata:true}}).catch(()=>null);
 const m=origin?.metadata as {platform?:string;app_version?:string;app_build?:string}|null;
 if(m?.platform&&['ios','android','mobile_web','desktop_web'].includes(m.platform)){c.platform=m.platform;c.appVersion=m.app_version;c.appBuild=m.app_build;}
 }
 }catch{/* Diagnostics cannot fail a bank operation. */}
}
export function bankJourney(stage:BankJourneyStage,outcome:BankJourneyOutcome,detail:{durable?:boolean;durationMs?:number;error?:unknown;accountCount?:number;transactionCount?:number;providerStatus?:string;dataKind?:'balance'|'transaction';repeatable?:boolean;timingBoundary?:'stage_request_to_response'|'clover_processing_intervals'|'clover_browser_launch_request'|'provider_retrieval_observed_wait'}={}){
 const live=scope.getStore();if(!live?.connection||!live.clerkUserId)return;
 const c={...live}, connection=c.connection!;
 const cacheKey=[connection.id,c.attemptId,stage,outcome,detail.repeatable?c.requestId:''].join(':');
 if((persistedStages.get(cacheKey)??0)>Date.now())return;
 const duration=detail.durationMs??(stage==='link_request'&&outcome==='succeeded'?Date.now()-c.started:undefined);
 const metadata={...(c.platform?{platform:c.platform}:{}),...(c.appVersion?{app_version:c.appVersion}:{}),...(c.appBuild?{app_build:c.appBuild}:{}),...(c.selectedBankId?{selected_bank_id:c.selectedBankId}:{}),...(c.selectedBankName?{selected_bank_name:c.selectedBankName}:{}),schema_version:1,stage,outcome,observed_at:new Date().toISOString(),bank_id:c.selectedBankId??connection.institutionId??'unknown',bank_name:c.selectedBankName??(c.selectedBankId&&c.selectedBankId!==connection.institutionId?undefined:connection.institutionName)??'Unknown bank',resolved_bank_id:connection.institutionId??'unknown',resolved_bank_name:connection.institutionName??'Unknown bank',connection_id:connection.id,attempt_id:c.attemptId??connection.id,operation_id:c.requestId,journey_kind:c.attemptId===connection.id?'link':'refresh',
  ...(typeof duration==='number'&&Number.isFinite(duration)?{duration_ms:Math.max(0,Math.round(duration)),timing_boundary:detail.timingBoundary??'stage_request_to_response'}:{}),
  journey_elapsed_ms:Math.max(0,Date.now()-(c.attemptStarted??+connection.createdAt)),
  ...(detail.error?bankFailure(detail.error):{}),
  ...(detail.accountCount!==undefined?{account_count:Math.max(0,Math.trunc(detail.accountCount))}:{}),
  ...(detail.transactionCount!==undefined?{transaction_count:Math.max(0,Math.trunc(detail.transactionCount))}:{}),
  ...(detail.providerStatus&&/^[A-Z_]{2,80}$/.test(detail.providerStatus)?{provider_status:detail.providerStatus}:{}),...(detail.dataKind?{data_kind:detail.dataKind}:{})};
 const persist=async()=>{try{
  const action=`bank_journey.${stage}.${outcome}`;
  const saved=await prisma.$transaction(async tx=>{
   await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`bank-journey:${connection.id}`},0))`;
   const prior=await tx.auditLog.findFirst({where:{workspaceId:connection.workspaceId,entity:'BankJourney',entityId:connection.id,action,metadata:{path:[detail.repeatable?'operation_id':'attempt_id'],equals:detail.repeatable?c.requestId:metadata.attempt_id}},select:{id:true}});
   if(prior)return false;
   if(stage==='retrieval'&&outcome==='succeeded'&&metadata.duration_ms===undefined){
    const start=await tx.auditLog.findFirst({where:{workspaceId:connection.workspaceId,entity:'BankJourney',entityId:connection.id,action:'bank_journey.retrieval.started',metadata:{path:['attempt_id'],equals:metadata.attempt_id}},select:{metadata:true}});
    const observed=(start?.metadata as {observed_at?:string}|null)?.observed_at;
    if(observed&&Number.isFinite(Date.parse(observed))){metadata.duration_ms=Math.max(0,Date.parse(metadata.observed_at)-Date.parse(observed));metadata.timing_boundary='provider_retrieval_observed_wait';}
   }
   await tx.auditLog.create({data:{workspaceId:connection.workspaceId,actorUserId:connection.userId,entity:'BankJourney',entityId:connection.id,action,metadata}});return true;
  });
  persistedStages.set(cacheKey,Date.now()+60*60_000);if(persistedStages.size>4096)persistedStages.delete(persistedStages.keys().next().value!);
  if(saved)await capturePostHogServerEvent('bank_journey_stage',c.clerkUserId!,metadata);
 }catch{/* Operational diagnostics must never change a bank or financial outcome. */}};
 if(detail.durable)return persist();
 try{after(persist);}catch{void persist();}
}
export function bankJourneyFailure(error:unknown,stage:BankJourneyStage){const c=scope.getStore();if(c?.lastProviderError===error)return;bankJourney(stage,"failed",{error});}
export function bankProviderResult(path:string,started:number,error?:unknown){const stage=bankProviderStage(path);if(!stage)return;if(error){const c=scope.getStore();if(c)c.lastProviderError=error;}bankJourney(stage,error?'failed':'succeeded',{durationMs:Date.now()-started,error,repeatable:Boolean(error)});}

export function bankProducts(identity:unknown){for(const p of bankProductEvidence(identity))bankJourney(p.stage,p.outcome,{providerStatus:p.status,...(p.code?{error:{providerCode:p.code}}:{})});}
