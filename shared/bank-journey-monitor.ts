/** Operational metadata only. Never accepts provider bodies, credentials or amounts. */
export const BANK_JOURNEY_STAGES = ['link_request','finverse_open','link_url_created','provider_status_request','authorization_return','token_exchange','token_refresh','retrieval','product_accounts','product_online_transactions','product_historical_transactions','product_statements','account_list','account_selection','transaction_page','transaction_fetch','clover_save','data_available','first_data_displayed','cancelled','resume'] as const;
export type BankJourneyStage = typeof BANK_JOURNEY_STAGES[number];
export type BankJourneyOutcome = 'started'|'succeeded'|'pending'|'failed'|'cancelled';
export type BankFailure = 'credentials_or_mfa'|'authorization_expired'|'rate_limited'|'provider_timeout'|'bank_unavailable'|'provider_rejected'|'selection_required'|'configuration'|'clover_error'|'unknown';
export function bankFailure(error: unknown): {error_code:string;failure_category:BankFailure;http_status?:number} {
 const e=error&&typeof error==='object'?error as Record<string,unknown>:{};
 const status=typeof e.status==='number'&&Number.isInteger(e.status)&&e.status>=100&&e.status<=599?e.status:undefined;
 const code=typeof e.providerCode==='string'&&/^[A-Z][A-Z0-9_]{1,63}$/.test(e.providerCode)?e.providerCode:undefined;
 // Only classify messages we own, or known structured provider codes. Never persist message text.
 const internal=typeof e.message==='string'&&/^(FINVERSE_[A-Z_]+)$/.test(e.message)?e.message:undefined;
 const key=code??internal??(e.name==='TimeoutError'||e.name==='AbortError'?'PROVIDER_TIMEOUT':status?`HTTP_${status}`:'UNCLASSIFIED');
 const category:BankFailure=/CREDENTIAL|MFA|OTP|LOGIN_FAILED/.test(key)?'credentials_or_mfa':/EXPIRED|RELINK|INVALID_TOKEN/.test(key)?'authorization_expired':status===429?'rate_limited':/TIMEOUT/.test(key)?'provider_timeout':status&&status>=500?'bank_unavailable':/CONFIGURED|DISABLED/.test(key)?'configuration':status&&status>=400?'provider_rejected':key.startsWith('CLOVER_')?'clover_error':'unknown';
 return {error_code:key,failure_category:category,...(status?{http_status:status}:{})};
}
export function bankFix(category:string) {
 const fixes:Record<string,{owner:string;fix:string}>={
  credentials_or_mfa:{owner:'Bank / provider',fix:'Inspect the structured authentication code. Offer a single reconnect action and preserve the pending setup; do not automatically repeat MFA.'},
  authorization_expired:{owner:'Clover / provider',fix:'Resume through secure authorization and preserve selected accounts; check token refresh and callback expiry.'},
  rate_limited:{owner:'Clover',fix:'Honor provider retry timing, coalesce polling and prevent overlapping syncs.'},
  provider_timeout:{owner:'Clover / provider',fix:'Separate provider wait from Clover processing; retain the setup and resume without restarting authentication.'},
  bank_unavailable:{owner:'Bank / provider',fix:'Check the affected bank product status and provider incident; retain financial data and offer manual import.'},
  provider_rejected:{owner:'Clover / provider',fix:'Inspect the endpoint and structured provider code before changing permissions or requesting a retry.'},
  selection_required:{owner:'Clover',fix:'Open the account-selection step directly and preserve the authorization.'},
  configuration:{owner:'Clover',fix:'Check provider credentials, redirect configuration and environment isolation.'},
  clover_error:{owner:'Clover',fix:'Trace the operation ID through account mapping, persistence and display; preserve confirmed records.'},
  unknown:{owner:'Investigation',fix:'Insufficient evidence for a specific fix. Inspect the stage and trace; do not label missing telemetry as a bank failure.'},
 };
 return fixes[category]??fixes.unknown;
}
export function bankProviderStage(path:string):BankJourneyStage|null {
 const endpoint=path.split('?')[0];
 return endpoint==='/link/token'?'link_url_created':endpoint==='/auth/token'?'token_exchange':endpoint==='/auth/token/refresh'?'token_refresh':endpoint==='/login_identity'?'provider_status_request':endpoint==='/accounts'?'account_list':endpoint==='/transactions'?'transaction_page':null;
}
export function safeProviderCode(body:unknown):string|undefined {
 const b=body&&typeof body==='object'?body as Record<string,unknown>:{};
 const first=Array.isArray(b.errors)?b.errors[0]:undefined;
 const c=b.error_code??b.code??(first&&typeof first==='object'?(first as Record<string,unknown>).error_code:undefined);
 return typeof c==='string'&&/^[A-Z][A-Z0-9_]{1,63}$/.test(c)?c:undefined;
}
export function percentile(values:number[],q:number) {if(!values.length)return null;const s=[...values].sort((a,b)=>a-b);return s[Math.min(s.length-1,Math.max(0,Math.ceil(q*s.length)-1))];}

/** Finverse product results are separate: an optional statement error is not a whole-link failure. */
export function bankProductEvidence(identity:unknown){
 const root=identity&&typeof identity==='object'?identity as Record<string,unknown>:{};
 const products=root.product_status&&typeof root.product_status==='object'?root.product_status as Record<string,unknown>:{};
 return (['accounts','online_transactions','historical_transactions','statements'] as const).flatMap(product=>{
  const p=products[product];if(!p||typeof p!=='object')return [];const body=p as Record<string,unknown>;
  if(typeof body.status!=='string'||! /^[A-Z_]{2,80}$/.test(body.status))return [];
  const failed=['ERROR','TEMPORARILY_UNAVAILABLE_FOR_INSTITUTION'].includes(body.status);
  return [{stage:`product_${product}` as BankJourneyStage,status:body.status,outcome:(failed?'failed':['SUCCESS','WARNING'].includes(body.status)?'succeeded':'pending') as BankJourneyOutcome,code:safeProviderCode(body)??(failed?'PRODUCT_RETRIEVAL_FAILED':undefined)}];
 });
}
