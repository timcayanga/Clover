import assert from 'node:assert/strict';
import { authFailure, needsSignInVerification } from '../../shared/auth-failure.ts';
for (const [error,reason] of [
 [{errors:[{code:'form_password_incorrect'}]},'credentials'],
 [{errors:[{code:'session_exists'}]},'session_exists'],
 [{status:429},'rate_limited'], [{status:503},'provider_unavailable'],
 [{name:'ClerkOfflineError'},'network'], [{code:'ERR_REQUEST_CANCELED'},'user_canceled'],
 [{errors:[{code:'form_code_incorrect'}]},'verification'], [null,'authentication_error'],
 [{message:'secret email@example.com token=secret',errors:[{code:'email@example.com'}]},'authentication_error']
]) {const result=authFailure(error);assert.equal(result.reason,reason);assert.deepEqual(Object.keys(result),['reason','status','provider_code']);assert(!JSON.stringify(result).includes('secret'));assert(!JSON.stringify(result).includes('@'));}
assert.deepEqual(authFailure({status: 422, errors: [{code: 'form_password_incorrect'}]}),
  {reason: 'credentials', status: 422, provider_code: 'form_password_incorrect'});
for (const code of ['user_identifier_fixture', 'constructor', 'toString', 'hidden-password', 'https://fixture.test/']) {
  assert.equal(authFailure({status: 422, errors: [{code}]}).provider_code, 'other');
}
assert.equal(authFailure({status: 422}).provider_code, 'unavailable');
assert.equal(authFailure({status: 422, errors: {code: 'secret'}, code: 1}).provider_code, 'unavailable');
assert(needsSignInVerification('needs_client_trust'));assert(needsSignInVerification('needs_second_factor'));
for(const status of [null,'complete','needs_first_factor','needs_new_password']) assert(!needsSignInVerification(status));
console.log('PASS privacy-safe auth diagnosis and device-trust/MFA continuation');
