/** Timing values never contain account IDs, balances, credentials or provider page contents. */
export const BANK_MAX_CLIENT_INTERVAL_MS = 24 * 60 * 60 * 1000;
export function bankClientDuration(value:unknown):number|undefined {
 return typeof value==='number'&&Number.isFinite(value)&&value>=0&&value<=BANK_MAX_CLIENT_INTERVAL_MS?Math.round(value):undefined;
}
export function bankElapsed(start:number|undefined,now:number){return start===undefined?undefined:bankClientDuration(now-start);}
export function bankHalfVisible(rect:{x:number;y:number;width:number;height:number},viewport:{width:number;height:number}){
 const {x,y,width:w,height:h}=rect;if(![x,y,w,h,viewport.width,viewport.height].every(Number.isFinite)||w<=0||h<=0)return false;
 const visibleWidth=Math.max(0,Math.min(x+w,viewport.width)-Math.max(x,0));
 const visibleHeight=Math.max(0,Math.min(y+h,viewport.height)-Math.max(y,0));
 return visibleWidth*visibleHeight>=w*h/2;
}
export type BankPhaseObservation={attemptId:string;stage:string;outcome:string;observedAt:string;durationMs?:number;requestToVisibleMs?:number;timingBoundary?:string;syncAttemptId?:string};
const definitions=[
 {key:'hosted_page_ready',label:'Hosted page ready',unavailable:'Redirect/system-auth transport has no page-ready callback.'},
 {key:'authentication',label:'Hosted authentication',unavailable:'Provider login-step timestamps are not exposed by the current integration.'},
 {key:'mfa',label:'Hosted MFA',unavailable:'Provider MFA-step timestamps are not exposed by the current integration.'},
 {key:'link_preparation',label:'Finverse URL request',direct:'link_url_created'},
 {key:'hosted_flow',label:'Launch request → authorization return',start:'finverse_open',end:'authorization_return',startOutcome:'started',note:'Includes page loading, login/MFA, human wait and time away; not authentication-only time.'},
 {key:'session_lifetime',label:'System-auth session lifetime (returned)',direct:'hosted_session_ended',boundary:'client_auth_session_lifetime',note:'System-browser promise lifetime includes hosted work and user wait; it is not a page-load or MFA timer.'},
 {key:'account_fetch',label:'Provider account-list request',direct:'account_list'},
 {key:'return_to_list',label:'Authorization return → visible-list acknowledgement',start:'authorization_return',end:'account_list_displayed',note:'Includes retrieval, delivery, rendering and acknowledgement network time.'},
 {key:'list_delivery',label:'List ready → visible-list acknowledgement',perSync:true,start:'account_list_ready',end:'account_list_displayed',note:'Server-observed interval includes both network legs.'},
 {key:'list_render',label:'Account-list response → visible rows',direct:'account_list_displayed',boundary:'client_payload_to_visible'},
 {key:'list_request_to_visible',label:'Client sync request → visible accounts',direct:'account_list_displayed',field:'requestToVisibleMs',boundary:'client_payload_to_visible'},
 {key:'selection_decision',label:'Visible accounts → selection submitted',direct:'account_selection_submitted',boundary:'client_visible_list_to_submit'},
 {key:'selection_mapping',label:'Selection submitted → accounts mapped',perSync:true,start:'account_selection_submitted',end:'account_selection'},
 {key:'data_render',label:'Usable-data response → first visible data',direct:'first_data_displayed',boundary:'client_payload_to_visible'},
 {key:'data_request_to_visible',label:'Client sync request → first visible data',direct:'first_data_displayed',field:'requestToVisibleMs',boundary:'client_payload_to_visible'},
 {key:'save_to_visible',label:'Usable data saved → visible-data acknowledgement',perSync:true,start:'data_available',end:'first_data_displayed',note:'Server-observed interval includes delivery and acknowledgement network time.'},
] as const;
export function bankStageMeasurements(events:BankPhaseObservation[]){
 return definitions.map(d=>{
  const samples:number[]=[];let missing=0;
  if('direct' in d){for(const e of events.filter(e=>e.stage===d.direct&&e.outcome==='succeeded')){const n=bankClientDuration('field'in d?e.requestToVisibleMs:e.durationMs);if(n!==undefined&&(!('boundary'in d)||e.timingBoundary===d.boundary))samples.push(n);else missing++;}}
  if('start' in d){
   const pairs=new Map<string,BankPhaseObservation[]>();for(const e of events){const key='perSync'in d?e.syncAttemptId??e.attemptId:e.attemptId;const rows=pairs.get(key)??[];rows.push(e);pairs.set(key,rows);}
   for(const steps of pairs.values()){
   const ordered=[...steps].sort((a,b)=>Date.parse(a.observedAt)-Date.parse(b.observedAt));
   const end=ordered.find(e=>e.stage===d.end&&e.outcome==='succeeded');if(!end)continue;
   const start=ordered.find(e=>e.stage===d.start&&e.outcome===('startOutcome'in d?d.startOutcome:'succeeded')&&Date.parse(e.observedAt)<=Date.parse(end.observedAt));
   if(start)samples.push(Date.parse(end.observedAt)-Date.parse(start.observedAt));else missing++;
  }}
  const sorted=samples.filter(Number.isFinite).sort((a,b)=>a-b);const q=(fraction:number)=>sorted.length?sorted[Math.ceil(sorted.length*fraction)-1]:null;
  return {key:d.key,label:d.label,availability:'unavailable'in d?'unavailable':'measured_when_observed',note:'unavailable'in d?d.unavailable:'note'in d?d.note:'Client intervals use a monotonic clock; absent samples remain unmeasured.',samples:sorted.length,missingStartOrDuration:missing,p50Ms:q(.5),p90Ms:q(.9)};
 });
}
