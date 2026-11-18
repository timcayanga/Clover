/** These describe a server sync request, not proof that data was displayed or a provider refresh completed. */
export const BANK_SYNC_RESULTS=['complete','up_to_date','partial','empty','retrieving','selection_required','authorization_required','action_required','rate_limited','blocked','failed','interrupted','unknown'] as const;
export type BankSyncResult=typeof BANK_SYNC_RESULTS[number];
export function bankSyncResponse(status:number,payload:unknown):{result:BankSyncResult;outcome:'succeeded'|'pending'|'failed'}{
 const b=payload&&typeof payload==='object'?payload as Record<string,unknown>:{};
 if(status===429)return {result:'rate_limited',outcome:'pending'};
 if(status>=500||status===422)return {result:'failed',outcome:'failed'};
 if(status<200||status>=300)return {result:b.reconnectRequired===true?'action_required':'blocked',outcome:'pending'};
 if(b.status==='retrieving')return {result:'retrieving',outcome:'pending'};
 if(b.status==='select_accounts')return {result:'selection_required',outcome:'pending'};
 if(b.status==='authorize')return {result:'authorization_required',outcome:'pending'};
 if(b.status==='ready'){
  if(b.dataStatus==='partial')return {result:'partial',outcome:'succeeded'};
  if(b.dataStatus==='empty')return {result:'empty',outcome:'succeeded'};
  const t=b.transactions&&typeof b.transactions==='object'?b.transactions as Record<string,unknown>:{};
  if(b.dataStatus==='complete')return {result:t.imported===0&&typeof t.existing==='number'&&t.existing>0?'up_to_date':'complete',outcome:'succeeded'};
 }
 return {result:'unknown',outcome:'pending'};
}
export function bankSyncRunId(value:unknown){return typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)?value:undefined;}
export type BankSyncObservation={connectionId:string;attemptId:string;syncAttemptId?:string;syncRunId?:string;syncRequestKind?:string;syncResult?:string;stage:string;outcome:string;observedAt:string;durationMs?:number;errorCode?:string};
export function bankSyncReport(events:BankSyncObservation[],now=Date.now()){
 const grouped=new Map<string,BankSyncObservation[]>();for(const e of events){if(!e.syncAttemptId)continue;const key=e.connectionId+':'+e.syncAttemptId;const rows=grouped.get(key)??[];rows.push(e);grouped.set(key,rows);}
 const requests=[...grouped.values()].filter(rows=>rows.some(e=>e.stage==='sync_started'||e.stage==='sync_finished')).map(rows=>{
  const start=rows.find(e=>e.stage==='sync_started');const end=rows.find(e=>e.stage==='sync_finished');const first=start??rows[0];
  return {syncAttemptId:first.syncAttemptId!,syncRunId:first.syncRunId??first.syncAttemptId!,connectionId:first.connectionId,requestKind:first.syncRequestKind??'legacy_request',startedAt:first.observedAt,result:end?.syncResult??'not_finished',durationMs:end?.durationMs??null,errorCode:end?.errorCode??null,incompleteAfter15Minutes:!end&&now-Date.parse(first.observedAt)>900000};
 });
 const runs=new Map<string,typeof requests>();for(const r of requests){const key=r.connectionId+':'+r.syncRunId;const list=runs.get(key)??[];list.push(r);runs.set(key,list);}
 return {requests:requests.length,visibleRequests:[...grouped.values()].filter(rows=>rows.some(e=>e.stage==='first_data_displayed'&&e.outcome==='succeeded')).length,clientRuns:[...runs.values()].filter(rs=>rs.some(r=>r.requestKind!=='legacy_request')).length,legacyRequests:requests.filter(r=>r.requestKind==='legacy_request').length,incompleteAfter15Minutes:requests.filter(r=>r.incompleteAfter15Minutes).length,
 results:[...BANK_SYNC_RESULTS,'not_finished'].map(result=>({result,count:requests.filter(r=>r.result===result).length})),
 runs:[...runs.values()].map(rs=>{const ordered=[...rs].sort((a,b)=>a.startedAt.localeCompare(b.startedAt));const last=ordered.at(-1)!;return {syncRunId:last.syncRunId,connectionId:last.connectionId,coverage:rs.every(r=>r.requestKind==='legacy_request')?'request_only':'client_grouped',requestCount:rs.length,latestResult:last.result,recovered:rs.some(r=>r.result==='failed')&&['complete','up_to_date'].includes(last.result)};}),
 recent:requests.sort((a,b)=>b.startedAt.localeCompare(a.startedAt)).slice(0,100)};
}
