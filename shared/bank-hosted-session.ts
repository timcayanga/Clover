import { bankElapsed } from './bank-stage-measurements';
type HostedSignal={stage:'finverse_open'|'hosted_session_ended';outcome:'started'|'succeeded'|'pending'|'failed';durationMs?:number;sessionResult?:'returned'|'closed'|'launch_failed'};
/** System-auth promise lifetime is NOT page load time or an authentication/MFA result. */
export async function runBankHostedSession<T extends {type:string}>(open:()=>Promise<T>,report:(signal:HostedSignal)=>Promise<unknown>,now=()=>performance.now()){
 const send=(event:HostedSignal)=>{void Promise.resolve().then(()=>report(event)).catch(()=>{});};
 const started=now();send({stage:'finverse_open',outcome:'started'});
 try{const result=await open();send({stage:'hosted_session_ended',outcome:result.type==='success'?'succeeded':'pending',sessionResult:result.type==='success'?'returned':'closed',durationMs:bankElapsed(started,now())});return result;}
 catch(error){send({stage:'hosted_session_ended',outcome:'failed',sessionResult:'launch_failed',durationMs:bankElapsed(started,now())});throw error;}
}
