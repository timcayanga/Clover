import assert from 'node:assert/strict';
import {createServer} from 'node:net';
import {randomUUID} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';

export const origin='https://staging.clover.ph';
export const qaUser='user_3JJ1IGtRLHyU8hwh7AIRM8xAh8z';
export const cases=[
  {name:'coffee',items:[['Coffee',80]],total:80},
  {name:'lunch',items:[['Sandwich',125],['Tea',45]],total:170},
];

export async function withReceiptLock(work,port=55479) {
  const lock=createServer(socket=>socket.end());
  await new Promise((resolve,reject)=>{
    lock.once('error',reject);
    lock.listen({host:'127.0.0.1',port,exclusive:true},resolve);
  });
  try {return await work();} finally {await new Promise(resolve=>lock.close(resolve));}
}

export function checkItems(items,fixture) {
  const normalized=items.map(({description,amount})=>[description.trim().toLowerCase(),Number(amount)]);
  assert.deepEqual(normalized,fixture.items.map(([name,amount])=>[name.toLowerCase(),amount]));
}

export async function verifyCases({diagnose,runCase,record,runId=randomUUID()}) {
  const workspace='learning-verification-'+runId;
  const baseline=await diagnose('start-batch',runId);
  try {
    assert.deepEqual(baseline.excludedProfiles,[workspace]);
    assert.equal(Object.keys(baseline.baseline).length,21);
    for(const row of Object.values(baseline.baseline)){
      assert(Number.isSafeInteger(row.count)&&row.count>=0);
      assert.match(row.sha256,/^[a-f0-9]{64}$/);
    }
    await record('before',baseline.baseline);
    for (const fixture of cases) await runCase(fixture,workspace,runId);
  } finally {
    const final=await diagnose('preview-batch-preservation',runId);
    await record('after',final.preservation);
    assert.deepEqual(final.excludedProfiles,[workspace]);
    assert.equal(final.retainedCheckpointUnchanged,true);
    assert.deepEqual(final.changedOutsideBatch,[]);
    assert.deepEqual(final.preservation,baseline.baseline);
  }
}

export async function stagingRun({clerk,folder,runCase,checkBuild}) {
  const runId=randomUUID(),dir=path.join(folder,runId);
  await mkdir(dir,{recursive:true});
  const record=(key,value)=>writeFile(path.join(dir,key+'.json'),JSON.stringify(value,null,2),{flag:'wx',mode:0o600});
  const session=await clerk.sessions.createSession({userId:'user_3GabiXIEsKHn4Uw3MCASna94V9J'});
  try {
    async function diagnose(action,runId){
      const {jwt}=await clerk.sessions.getToken(session.id);
      const res=await fetch(origin+'/api/admin/learning-verification',{method:'POST',redirect:'error',
        headers:{Authorization:'Bearer '+jwt,Origin:origin,'Content-Type':'application/json'},
        body:JSON.stringify({action,runId,runIds:[runId]}),signal:AbortSignal.timeout(300000)});
      if(!res.ok)throw Error(action+' HTTP '+res.status+' '+(await res.json()).error);
      return res.json();
    }
    await verifyCases({diagnose,record,runCase,runId});
    const build=await checkBuild();
    await record('passed',{runId,build,cases:cases.map(c=>c.name)});
    console.log('Staging receipt preservation verified:',dir);
  } catch(error) {
    await record('failed',{runId,error:String(error.message)});
    throw error;
  } finally {await clerk.sessions.revokeSession(session.id);}
}
