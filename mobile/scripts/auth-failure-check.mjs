import assert from 'node:assert/strict';
import { authFailure, needsSignInVerification } from '../../shared/auth-failure.ts';
for (const [error,reason] of [
 [{errors:[{code:'form_password_incorrect'}]},'credentials'],
 [{errors:[{code:'session_exists'}]},'session_exists'],
 [{status:429},'rate_limited'], [{status:503},'provider_unavailable'],
 [{name:'ClerkOfflineError'},'network'], [{code:'ERR_REQUEST_CANCELED'},'user_canceled'],
 [{errors:[{code:'form_code_incorrect'}]},'verification'], [null,'authentication_error'],
 [{message:'secret email@example.com token=secret',errors:[{code:'email@example.com'}]},'authentication_error']
]) {const result=authFailure(error);assert.equal(result.reason,reason);assert.deepEqual(Object.keys(result),['reason','status']);assert(!JSON.stringify(result).includes('secret'));assert(!JSON.stringify(result).includes('@'));}
assert(needsSignInVerification('needs_client_trust'));assert(needsSignInVerification('needs_second_factor'));
for(const status of [null,'complete','needs_first_factor','needs_new_password']) assert(!needsSignInVerification(status));
console.log('PASS privacy-safe auth diagnosis and device-trust/MFA continuation');
