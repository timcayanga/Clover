// Run only for a receipt-related release. Leaves a labeled bill in the designated QA account.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile, writeFile, mkdir, rename} from 'node:fs/promises';
import {createRequire} from 'node:module';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {origin as staging,qaUser,cases,checkItems,withReceiptLock,stagingRun} from './receipt-staging-run.mjs';
import {chromium} from 'playwright';
import {approvedOrigin} from './access-matrix.mjs';
import {signIn,tierAccount} from './auth-browser.mjs';
import {validProof} from './receipt-release.mjs';

const [target, gitSha, mode] = process.argv.slice(2);
const small = mode === '--smoke';
assert(!mode || (small && target === 'https://staging.clover.ph'));
const origin = approvedOrigin(target);
assert.equal(origin,target);
assert.match(gitSha,/^[0-9a-f]{40}$/);
const qa = path.dirname(fileURLToPath(import.meta.url));
const config = JSON.parse(await readFile(path.join(qa,'config.local.json'),'utf8'));
const account = tierAccount(await readFile(config.credentialsByOrigin[origin],'utf8'),'Pro');
assert(account,'Missing designated Pro QA credentials.');
const health = async () => {
  const response = await fetch(origin+'/api/health',{redirect:'error',signal:AbortSignal.timeout(10000)});
  assert(response.ok);
  const {build} = await response.json();
  assert.equal(build.gitSha,gitSha,'Release SHA differs from live.');
  assert(build.deploymentId);
  return build;
};
const build = await health();
const root = process.env.CLOVER_QA_SOURCE_ROOT || config.isolatedSourceRoot || path.dirname(qa);
const fixtureClient = createRequire(path.join(root,'web/package.json'))('esbuild').buildSync({
  entryPoints:[path.join(root,'web/lib/preview-receipt-client.ts')],bundle:true,write:false,
  format:'iife',globalName:'qaReceipt',platform:'browser'
}).outputFiles[0].text;
const outputRoot = path.join(qa,'state',small ? 'receipt-smoke' : 'receipt-releases',new URL(origin).hostname,gitSha);
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
async function runCase(fixture,isolatedWorkspace,runId){
const folder=small?path.join(outputRoot,runId,fixture.name):outputRoot;
const title=small?'QA '+fixture.name+' '+runId:'QA Receipt '+build.deploymentId;
const browser = await chromium.launch();
try {
  const page = await browser.newPage({serviceWorkers:'block'});
  // Generate repeatable identical bytes for reruns of this deployment. Noise around the
  // paper exercises the application's chunk upload while keeping the printed text legible.
  const png = await page.evaluate(({seed,small,fixture}) => {
    const canvas = document.createElement('canvas');
    canvas.width=1900; canvas.height=1650;
    const ctx=canvas.getContext('2d'), pixels=ctx.createImageData(canvas.width,canvas.height);
    let state=seed || 1;
    if (!small) for(let i=0;i<pixels.data.length;i+=4) {
      state=(Math.imul(state,1664525)+1013904223)>>>0;
      pixels.data[i]=state>>>24; pixels.data[i+1]=state>>>16 & 255;
      pixels.data[i+2]=state>>>8 & 255; pixels.data[i+3]=255;
    }
    ctx.putImageData(pixels,0,0); ctx.fillStyle='white'; if(small) ctx.fillRect(0,0,canvas.width,canvas.height); ctx.fillRect(300,270,1300,1100);
    ctx.fillStyle='black'; ctx.font='48px monospace';
    ['CLOVER QA CAFE','Manila, Philippines','2026-11-19','',...fixture.items.map(([name,amount])=>'1 '+name+'         PHP '+amount.toFixed(2)),
      '','TOTAL AMOUNT     PHP '+fixture.total.toFixed(2),'Paid in cash'].forEach((line,i)=>ctx.fillText(line,415,415+i*100));
    if (small) {
      // Give each deployment distinct bytes while keeping the retry byte-for-byte identical.
      ctx.fillStyle = 'rgb('+[(seed>>>16)&255,(seed>>>8)&255,seed&255].join(',')+')';
      ctx.fillRect(0,0,2,2);
    }
    return canvas.toDataURL('image/png').split(',')[1];
  },{small,fixture,seed:Number.parseInt(digest(title).slice(0,8),16)});
  const bytes=Buffer.from(png,'base64');
  assert(small ? bytes.length>0 && bytes.length<250000 : bytes.length>4500000);
  if (origin === 'https://staging.clover.ph' && (small || process.env.CLOVER_QA_STAGING_SESSION === '1')) {
    const secretKey = process.env.CLERK_SECRET_KEY;
    assert(secretKey?.startsWith('sk_test_'), 'Expected staging Clerk credentials.');
    const {createClerkClient} = createRequire(path.join(root,'web/package.json'))('@clerk/backend');
    const clerk = createClerkClient({secretKey});
    const users = small ? {data:[{id:qaUser}]} : await clerk.users.getUserList({emailAddress:[account.email],limit:2});
    assert.equal(users.data.length,1,'Designated staging QA identity is unavailable.');
    const ticket = await clerk.signInTokens.createSignInToken({userId:users.data[0].id,expiresInSeconds:60});
    await page.goto(origin+'/sign-in',{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>window.Clerk?.loaded);
    assert.equal(new URL(page.url()).origin,origin);
    await page.evaluate(async token=>{
      const attempt = await window.Clerk.client.signIn.create({strategy:'ticket',ticket:token});
      if(attempt.status!=='complete') throw Error('Staging QA session unavailable.');
      await window.Clerk.setActive({session:attempt.createdSessionId});
    },ticket.token);
  } else {
    await signIn(page,origin,account);
  }
  await page.goto(origin+'/split-bill',{waitUntil:'domcontentloaded'});
  assert.equal(new URL(page.url()).origin,origin);
  const api=page.request;
  const readJson = async (url,headers={}) => {
    for (let attempt=0; attempt<2; attempt++) {
      const r=await api.get(origin+url,{maxRedirects:0,timeout:20000,headers});
      if (r.ok()) return r.json();
      if (attempt || r.status()<500) throw Error(url+' readback HTTP '+r.status());
      await new Promise(resolve=>setTimeout(resolve,1500));
    }
  };
  const {workspaces}=await readJson('/api/workspaces');
  const personal=workspaces.filter(w=>w.type==='personal' && (isolatedWorkspace?w.id===isolatedWorkspace:w.name==='Personal'));
  assert.equal(personal.length,1,'Expected one Personal profile in the designated QA account.');
  const workspaceId=personal[0].id;
  await page.addScriptTag({content:fixtureClient});
  const trace=[];
  async function upload() {
    const start=Date.now();
    const draft=await page.evaluate(async ({png,workspaceId})=>{
      const file=new File([Uint8Array.from(atob(png),c=>c.charCodeAt(0))],'clover-release-qa.png',{type:'image/png'});
      const url='/api/split-bill-receipts/preview?progressive=1&scope=main&workspaceId='+encodeURIComponent(workspaceId);
      const response=await window.qaReceipt.previewReceiptFile(file,url);
      if(!response.ok)throw Error('Preview HTTP '+response.status);
      let result=await response.json();
      if(result.refining) {
        const refined=await fetch(url+'&refine='+encodeURIComponent(result.draftId),{method:'POST'});
        if(!refined.ok)throw Error('Refinement HTTP '+refined.status);
        result=await refined.json();
      }
      return result;
    },{png,workspaceId});
    assert.match(draft.preview.merchantName,/clover qa cafe/i);
    assert.equal(Number(draft.preview.total),fixture.total);
    assert.equal(draft.preview.currency,'PHP');
    checkItems(draft.preview.items,fixture);
    assert(draft.attemptId && draft.draftId && draft.receiptStorageKey);
    trace.push({event:'uploaded',fileSha256:digest(bytes),bytes:bytes.length,durationMs:Date.now()-start,draftId:draft.draftId});
    return draft;
  }
  const first=await upload();
  const body=d=>({title,total:d.preview.total,currency:d.preview.currency,billDate:d.preview.billDate,
    sourceType:'receipt',receiptStorageKey:d.receiptStorageKey,participants:[{id:d.attemptId,name:'Clover QA'}],
    items:d.preview.items.map(({description,amount})=>({description,amount,participantIds:[d.attemptId]})),
    expense:{workspaceId,splitOnly:true,attemptId:d.attemptId}});
  let committedId;
  const endpoint=origin+'/api/split-bills';
  let saveStatus, saveError;
  const interruptSave=async route=>{
    if (route.request().method()!=='POST') return route.fallback();
    try {
      const response=await route.fetch({maxRedirects:0});
      saveStatus=response.status();
      const result=await response.json().catch(()=>({}));
      if(response.ok()) committedId=result.bill?.id;
      else saveError=String(result.error || result.code || '').slice(-220);
    } finally {await route.abort('connectionreset');}
  };
  await page.route(endpoint,interruptSave);
  const lost=await page.evaluate(async payload=>{
    try {await fetch('/api/split-bills',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)}); return false;}
    catch {return true;}
  },body(first));
  await page.unroute(endpoint,interruptSave);
  assert(lost && committedId,'Expected a committed QA bill followed by a lost save response. Save HTTP '+saveStatus+' '+(saveError||''));
  trace.push({event:'save-response-lost',billId:committedId});
  const second=await upload();
  assert.equal(second.draftId,first.draftId); assert.equal(second.attemptId,first.attemptId);
  const retried=await api.post(endpoint,{headers:{Origin:origin},data:body(second),maxRedirects:0});
  assert(retried.ok(),'Retry save failed.');
  const {bill}=await retried.json();
  assert.equal(bill.id,committedId,'Retry returned a different bill.');
  trace.push({event:'retried',billId:bill.id});
  await mkdir(folder,{recursive:true});
  await writeFile(path.join(folder,'save-retry-trace.json'),JSON.stringify(trace,null,2));
  await page.reload({waitUntil:'domcontentloaded'});
  // Read just the designated participant's ledger on staging. The full QA
  // account history can be large and is outside the scope of this smoke check.
  let ledger;
  if (small) {
    await page.waitForFunction(()=>window.Clerk?.loaded);
    const token=await page.evaluate(async ()=>{
      return window.Clerk.session.getToken();
    });
    assert(token,'No active QA session for ledger readback.');
    ledger=await readJson('/api/mobile/v1/split-bills?view=ledger&person=Clover%20QA',{Authorization:'Bearer '+token});
  } else {
    ledger=await readJson('/api/split-bills');
  }
  const {bills}=ledger;
  const matches=bills.filter(b=>b.title===title || b.receiptStorageKey===first.receiptStorageKey);
  assert.equal(matches.length,1); assert.equal(matches[0].id,committedId);
  checkItems(matches[0].items,fixture);
  assert.equal(matches[0].currency,'PHP');
  const actualTotalMinor=Math.round(Number(matches[0].total)*100);
  trace.push({event:'reloaded',matchingIds:matches.map(b=>b.id),actualTotalMinor,items:matches[0].items.map(({description,amount})=>({description,amount}))});
  const traceText=JSON.stringify(trace,null,2);
  const proof={origin,gitSha,deploymentId:build.deploymentId,traceSha256:digest(traceText),fileSha256:digest(bytes),
    retryFileSha256:digest(bytes),fileBytes:bytes.length,interruption:'save-response-lost',firstBillId:committedId,
    retryBillId:bill.id,matchingIdsAfterReload:matches.map(b=>b.id),expectedTotalMinor:fixture.total*100,actualTotalMinor};
  assert(validProof(proof,origin,await health(),small ? "small-staging" : "large"),'Release or receipt evidence mismatch.');
  await mkdir(folder,{recursive:true});
  await writeFile(path.join(folder,'redacted-trace.json'),traceText);
  await writeFile(path.join(folder,'result.tmp'),JSON.stringify(proof,null,2));
  await rename(path.join(folder,'result.tmp'),path.join(folder,'result.json'));
  console.log('Verified live upload, lost save response, retry, and one persisted QA bill:',folder);
} finally {await browser.close();}
}
async function run(){
  if (!small) return runCase(cases[0]);
  const secretKey=process.env.CLERK_SECRET_KEY;
  assert(secretKey?.startsWith('sk_test_'),'Supply the staging Clerk test key.');
  const {createClerkClient}=createRequire(path.join(root,'web/package.json'))('@clerk/backend');
  await stagingRun({clerk:createClerkClient({secretKey}),folder:outputRoot,runCase,checkBuild:async()=>{const final=await health();assert.equal(final.deploymentId,build.deploymentId);return final;}});
}
if(origin===staging) await withReceiptLock(run);
else await run();
