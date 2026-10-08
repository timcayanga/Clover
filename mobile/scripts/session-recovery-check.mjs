import assert from 'node:assert/strict';
import { createSessionRecovery, recoverableSession, alreadySignedIn } from '../src/session-recovery.ts';
const deferred = () => { let resolve; const promise=new Promise(r=>resolve=r);return {promise,resolve}; };
const tick = () => new Promise(r=>setImmediate(r));
const client = (sessions=[],lastActiveSessionId=null) => ({sessions,lastActiveSessionId,reload:async()=>{},isNew:()=>false});
const active = id => ({id,status:'active'});
assert.equal(recoverableSession(client([active('a')])),'a');
assert.equal(recoverableSession(client([active('a'),active('b')],'b')),'b');
assert.equal(recoverableSession(client([active('a'),active('b')])),null,'Never guess among identities');
for(const status of ['pending','ended','expired','revoked','abandoned']) {
 assert.equal(recoverableSession(client([{id:'a',status}], 'a')),null);
 assert.equal(recoverableSession(client([{id:'a',status},active('b')], 'a')),null,'Do not switch away from an unfinished/revoked preferred session');
}
assert.equal(recoverableSession(client([{...active('a'),currentTask:{key:'verify'}}],'a')),null);
assert.equal(recoverableSession({...client([active('a'),active('b')]),signUp:{status:'complete',createdSessionId:'b'}}),'b');
assert.equal(recoverableSession({...client([{id:'old',status:'ended'},active('new')],'old'),signIn:{status:'complete',createdSessionId:'new'}}),'new','Completed sign-in takes priority over a prior ended identity');
assert.equal(recoverableSession({...client([active('a'),active('b')],'b'),signIn:{status:'complete',createdSessionId:'a'}}),'b','Prefer last active identity over an old completed attempt');
assert.equal(recoverableSession({...client([active('a'),{id:'b',status:'pending'}],'b'),signIn:{status:'complete',createdSessionId:'a'}}),null,'Pending verification must not restore an older identity');
assert.equal(recoverableSession(client([active('old'),{id:'new',status:'pending'}])),null,'Without a last-active identity, incomplete verification must not restore a different user');
assert(alreadySignedIn({errors:[{code:'session_exists'}]}));
assert(alreadySignedIn({errors:[{longMessage:"You're already signed in."}]}));
assert(!alreadySignedIn({errors:[{code:'form_password_incorrect'}]}));
assert(!alreadySignedIn(null));

// Successful server session creation with interrupted local activation.
{
 const gate=deferred(), activations=[]; let reads=0;
 const c=client();c.reload=async()=>{reads++;await gate.promise;c.sessions=[active('verified')];c.lastActiveSessionId='verified'};
 const clerk={client:c,setActive:async({session})=>activations.push(session)};
 const recovery=createSessionRecovery(()=>clerk);
 const first=recovery.recover(),second=recovery.recover();
 assert.equal(first,second,'Foreground + login retry share one verification');assert.equal(reads,1);assert.deepEqual(activations,[]);
 gate.resolve();assert.equal(await first,true);assert.deepEqual(activations,['verified']);
}
// Reload replaces stale resources. Never activate a formerly cached session.
{
 const activations=[],clerk={client:client([active('stale')],'stale'),setActive:async({session})=>activations.push(session)};
 clerk.client.reload=async()=>{clerk.client=client([{id:'stale',status:'revoked'}],'stale')};
 assert.equal(await createSessionRecovery(()=>clerk).recover(),false);assert.deepEqual(activations,[]);
}
// Explicit sign-out/unmount cancels verification still in flight.
{
 const gate=deferred(),activations=[],c=client([active('a')],'a');c.reload=()=>gate.promise;
 const recovery=createSessionRecovery(()=>({client:c,setActive:async({session})=>activations.push(session)}));
 const pending=recovery.recover();recovery.cancel();gate.resolve();assert.equal(await pending,false);assert.deepEqual(activations,[]);
}
// Connection failures/timeouts must not trap the entry UI or activate late results.
{
 const gate=deferred(),activations=[],c=client([active('a')],'a');c.reload=()=>gate.promise;
 const recovery=createSessionRecovery(()=>({client:c,setActive:async({session})=>activations.push(session)}),5);
 assert.equal(await recovery.recover(),false);gate.resolve();await tick();assert.deepEqual(activations,[]);
 c.reload=async()=>{throw Error('offline')};assert.equal(await recovery.recover(),false);
 c.reload=async()=>{};assert.equal(await recovery.recover(),true);assert.deepEqual(activations,['a']);
}
{
 let reads=0; const c=client();c.isNew=()=>true;c.reload=async()=>{reads++};
 assert.equal(await createSessionRecovery(()=>({client:c,setActive:async()=>assert.fail('No session')})).recover(),false);
 assert.equal(reads,0,'Brand new installations do not wait for a pointless auth refresh');
}
console.log('PASS interrupted authentication recovery: server verification, concurrent resumes, identity selection, pending MFA exclusion, revocation, logout, timeout and retry');
