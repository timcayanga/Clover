/** Live Responses tool round-trip, assistant history, final-phase and SSE checks. */
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import ts from 'typescript';
import {openAIInteractiveOptions} from '../lib/openai-model-policy';
import {extractFinalOpenAIText,createOpenAIFinalTextStream} from '../lib/openai-response-text';
assert.equal(process.env.CLOVER_MODEL_MIGRATION_EVAL,'1');
const key=readFileSync('/tmp/clover-model-migration-key','utf8').trim();
const sf=ts.createSourceFile('route.ts',readFileSync('app/api/adviser/chat/route.ts','utf8'),ts.ScriptTarget.Latest,true);
let toolNode:ts.Expression|undefined;const strings:string[]=[];
function visit(n:ts.Node){
 if(ts.isVariableDeclaration(n)&&n.name.getText(sf)==='allTools')toolNode=n.initializer;
 if(ts.isVariableDeclaration(n)&&n.name.getText(sf)==='systemPrompt'){
  function literal(x:ts.Node){if(ts.isStringLiteral(x))strings.push(x.text);else ts.forEachChild(x,literal)}literal(n.initializer!);
 }
 ts.forEachChild(n,visit);
}
visit(sf);assert.ok(toolNode);
const tools=new Function(ts.transpile('const tools='+toolNode.getText(sf),{target:ts.ScriptTarget.ES2022})+';return tools;')();
const results:any[]=[];
async function request(body:any){
 const r=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify({...body,store:false}),signal:AbortSignal.timeout(30000)});
 if(!r.ok)throw new Error(await r.text());return r;
}
async function main(){
 for(let round=0;round<3;round++)for(const model of ['gpt-4.1-mini','gpt-6-luna'])for(const kind of ['cash','draft','clarify']){
  const started=performance.now();let firstMs:number|null=null,reply='',status='';const calls:any[]=[],phases:any[]=[];
  try{
   const name=kind==='cash'?'calculate_safe_to_spend':'prepare_write_action';
   const input:any[]=[{role:'system',content:strings.join('\n')+'\nToday 2026-10-14. Default PHP. Existing account bpi-qa (BPI). Do not execute writes.'}];
   if(kind==='clarify')input.push({role:'user',content:'Can I afford a laptop?'},{role:'assistant',phase:'final_answer',content:'What price are you considering?'},{role:'user',content:'I have not decided the price. What do you need to check?'});
   else input.push({role:'user',content:kind==='cash'?'What is safe to spend over the next 14 days?':'Prepare a lunch expense of PHP 500 from BPI today.'});
   const options=openAIInteractiveOptions(model);
   if(kind!=='clarify'){
    const selected=await(await request({model,...options,max_output_tokens:kind==='cash'?450:12000,tools:tools.filter((x:any)=>x.name===name),tool_choice:'required',parallel_tool_calls:true,input})).json();
    calls.push(selected.usage);assert.equal(selected.status,'completed');
    const fc=selected.output.filter((x:any)=>x.type==='function_call');assert.equal(fc.length,1);assert.equal(fc[0].name,name);
    const result=kind==='cash'?{currency:'PHP',availableCash:10000,knownObligations:3000,recommendedBuffer:1000,safeToSpend:6000,expectedIncome:0,confidence:'grounded'}:{status:'confirmation_required',draft:{merchant:'Lunch',amount:'500',currency:'PHP',accountId:'bpi-qa',date:'2026-10-14'},saved:false};
    // Original phase-tagged output is replayed verbatim, exactly as in the route.
    input.push(...selected.output,{type:'function_call_output',call_id:fc[0].call_id,output:JSON.stringify(result)});
   }
   const replyStarted=performance.now();
   const response=await request({model,...options,prompt_cache_key:'clover-adviser-v1',stream:true,max_output_tokens:900,tools:[],input});
   const reader=response.body!.getReader(),decoder=new TextDecoder(),finalDelta=createOpenAIFinalTextStream();let pending='',payload:any=null;
   while(true){
    const chunk=await reader.read();pending+=decoder.decode(chunk.value??new Uint8Array(),{stream:!chunk.done});let i;
    while((i=pending.indexOf('\n\n'))>=0){
     const event=pending.slice(0,i);pending=pending.slice(i+2);
     for(const line of event.split('\n'))if(line.startsWith('data: ')&&line!=='data: [DONE]'){
      const e=JSON.parse(line.slice(6));
      if(e.type==='response.output_item.added')phases.push({id:e.item?.id,phase:e.item?.phase??null,type:e.item?.type});
      const delta=finalDelta(e);if(delta){firstMs??=Math.round(performance.now()-replyStarted);reply+=delta;}
      if(e.type==='response.completed'){payload=e.response;status=payload.status;calls.push(payload.usage);}
     }
    }
    if(chunk.done)break;
   }
   const finalText=extractFinalOpenAIText(payload);
   const grounded=kind==='cash'?/6[,.]?000/.test(reply)&&/buffer|reserve/i.test(reply)
    :kind==='draft'?/500/.test(reply)&&/confirm|draft|review|prepared|would you like/i.test(reply)&&!/\b(I (?:have )?(?:saved|added|created)|successfully (?:saved|added))\b/i.test(reply)
    :/price|cost/i.test(reply)&&!/(?:PHP|₱|\$)\s*\d/i.test(reply);
   const checks={completed:status==='completed',streamed:firstMs!==null,finalOnly:reply.trim()===finalText,grounded};
   results.push({model,kind,round,checks,passed:Object.values(checks).every(Boolean),firstMs,ms:Math.round(performance.now()-started),calls,phases,reply,finalText});
  }catch(e){results.push({model,kind,round,passed:false,error:e instanceof Error?e.message:String(e),ms:Math.round(performance.now()-started),firstMs,calls,phases,reply});}
  mkdirSync('../output/model-migration-2026-10-14',{recursive:true});
  writeFileSync('../output/model-migration-2026-10-14/stream-phase-results.json',JSON.stringify({results},null,2));
  const r=results.at(-1);console.log(JSON.stringify({model,kind,round,passed:r.passed,ms:r.ms,firstMs,error:r.error}));
 }
}
main().catch(e=>{console.error(e);process.exitCode=1});
