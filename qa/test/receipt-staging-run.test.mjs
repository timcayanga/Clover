import {test} from 'node:test';
import assert from 'node:assert/strict';
import {verifyCases,checkItems,cases,withReceiptLock} from '../receipt-staging-run.mjs';
import {createServer} from 'node:net';

const manifest=Object.fromEntries(Array.from({length:21},(_,i)=>['table'+i,{count:i,sha256:'a'.repeat(64)}]));
function harness(fail=false,changed=false) {
  const events=[]; let active=0;
  return {events,params:{
    runId:'test',
    diagnose:async action=>{
      events.push(action);
      return {excludedProfiles:['learning-verification-test'],baseline:manifest,preservation:manifest,changedOutsideBatch:changed?['Transaction']:[],retainedCheckpointUnchanged:true};
    },
    record:async()=>{},
    runCase:async fixture=>{
      assert.equal(++active,1);
      events.push(fixture.name);
      await new Promise(r=>setImmediate(r));
      active--;
      if(fail)throw Error('failed case');
    },
  }};
}
test('one full snapshot pair brackets all sequential cases',async()=>{
  const h=harness();await verifyCases(h.params);
  assert.deepEqual(h.events,['start-batch','coffee','lunch','preview-batch-preservation']);
});
test('failed case still compares once and a preservation mismatch fails the suite',async()=>{
  const h=harness(true);await assert.rejects(verifyCases(h.params),/failed case/);
  assert.deepEqual(h.events,['start-batch','coffee','preview-batch-preservation']);
  await assert.rejects(verifyCases(harness(false,true).params));
});
test('mislabeled, mispriced or missing lines fail even if the total matches',()=>{
  const rows=[{description:'Sandwich',amount:'125.00'},{description:'Tea',amount:'45'}];checkItems(rows,cases[1]);
  for(const wrong of [[rows[0]],rows.map(x=>({...x,description:'Sandwich'})),rows.map((x,i)=>({...x,amount:i?44:126}))])assert.throws(()=>checkItems(wrong,cases[1]));
});
test('another process cannot acquire the same port while the run is active',async()=>{
  const probe=createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));const port=probe.address().port;await new Promise(r=>probe.close(r));
  await withReceiptLock(async()=>{await assert.rejects(withReceiptLock(()=>assert.fail(),port),{code:'EADDRINUSE'});},port);
  await withReceiptLock(async()=>{},port);
});
