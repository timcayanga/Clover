/** Independent statement truth. No parsers, database calls, FX conversion, or financial writes. */
export type BankTruthRow={id:string;page:number;date:string;currency:string;signedAmount:string;description:string;reference?:string};
export type BankObservedRow={id:string;accountId:string;date:string|null;currency:string|null;signedAmount:string|null;description:string;status:'booked'|'pending'|'unknown'};
export type BankStatementTruth={version:1;source:{kind:'original'|'synthetic';sha256:string;pageCount:number;reviewedPages:number[];labelMethod:'manual_original_review'|'synthetic';reviewer:string;reviewStatus:'agent_reviewed'|'human_confirmed';confidence:number};bankId:string;accountId:string;ledgerAccountId:string;accountBinding:'confirmed'|'unconfirmed';dateBasisVerified:boolean;period:{from:string;through:string};rows:BankTruthRow[];balance?:{currency:string;opening:string;closing:string;convention:'asset'|'liability'}};
export type BankValidationSnapshot={version:1;bankId:string;accountId:string;ledgerAccountId:string;capturedAt:string;dataAsOfDate:string|null;coverage:{from:string|null;through:string|null;evidence:string|null};retrieval:'verified_complete'|'unknown'|'truncated';provider:BankObservedRow[];ledger:BankObservedRow[];links:{providerId:string;ledgerId:string|null}[];balance?:{currency:string;amount:string;asOfDate:string|null;cutoff:'statement_close'|'unknown'}|null};
export function bankDecimal(value:unknown){
 if(typeof value!=='string'||!/^[-+]?\d+(?:\.\d+)?$/.test(value)||value.length>100)return null;
 let negative=value.startsWith('-');const [whole,frac='']=value.replace(/^[-+]/,'').split('.');const w=whole.replace(/^0+(?=\d)/,''),f=frac.replace(/0+$/,'');if(w==='0'&&!f)negative=false;
 return (negative?'-':'')+w+(f?'.'+f:'');
}
function sum(values:string[]){const normalized=values.map(bankDecimal);if(normalized.some(v=>v===null))return null;const scale=Math.max(0,...normalized.map(v=>v!.split('.')[1]?.length??0));let result=0n;for(const v of normalized){const negative=v!.startsWith('-');const [w,f='']=v!.replace(/^-/,'').split('.');const n=BigInt(w+f.padEnd(scale,'0'));result+=negative?-n:n;}const digits=(result<0n?-result:result).toString().padStart(scale+1,'0');return bankDecimal((result<0n?'-':'')+(scale?digits.slice(0,-scale)+'.'+digits.slice(-scale):digits));}
const text=(s:string)=>s.normalize('NFKC').toLocaleLowerCase('en').replace(/[^\p{L}\p{N}]+/gu,' ').trim().replace(/\s+/g,' ');
const day=(s:unknown):s is string=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(Date.parse(s+'T00:00:00Z'))&&new Date(s+'T00:00:00Z').toISOString().slice(0,10)===s;
const inRange=(date:string,range:{from:string;through:string})=>date>=range.from&&date<=range.through;
function core(r:{accountId:string;date:string|null;currency:string|null;signedAmount:string|null}){const amount=bankDecimal(r.signedAmount);return day(r.date)&&r.currency&&/^[A-Z]{3}$/.test(r.currency)&&amount!==null?JSON.stringify([r.accountId,r.date,r.currency,amount]):null;}
function compare(expected:BankTruthRow[],observed:BankObservedRow[],accountId:string,range:{from:string;through:string}){
 const expectedRows=expected.map(r=>({...r,accountId})),booked=observed.filter(r=>r.status==='booked');
 const pending=observed.filter(r=>r.status==='pending'&&(!day(r.date)||inRange(r.date,range))).map(r=>r.id);
 const unknown=observed.filter(r=>r.status==='unknown'&&(!day(r.date)||inRange(r.date,range))).map(r=>r.id);
 const outside=booked.filter(r=>day(r.date)&&!inRange(r.date,range));
 const candidates=booked.filter(r=>!day(r.date)||inRange(r.date,range));
 const seenIds=new Set<string>();const duplicateIds:string[]=[];for(const r of candidates){if(seenIds.has(r.id))duplicateIds.push(r.id);seenIds.add(r.id);}
 const buckets=new Map<string,BankObservedRow[]>();const invalid:string[]=[];
 for(const r of candidates){const key=core(r);if(key===null){invalid.push(r.id);continue;}const rows=buckets.get(key)??[];rows.push(r);buckets.set(key,rows);}
 const matched:{statementId:string;observedId:string;descriptionExact:boolean}[]=[],missing:BankTruthRow[]=[];
 const remaining:typeof expectedRows=[];
 for(const e of expectedRows){const rows=buckets.get(core(e)!);const index=rows?.findIndex(r=>text(r.description)===text(e.description))??-1;if(index>=0){const row=rows!.splice(index,1)[0];matched.push({statementId:e.id,observedId:row.id,descriptionExact:true});}else remaining.push(e);}
 for(const e of remaining){const row=buckets.get(core(e)!)?.shift();if(row)matched.push({statementId:e.id,observedId:row.id,descriptionExact:false});else missing.push(e);}
 const extra=[...buckets.values()].flat();
 // Diagnostic hints never count as matches and never remove missing/extra occurrences.
 const possible=missing.slice(0,100).flatMap(e=>{const options=extra.filter(r=>r.accountId===accountId&&text(e.description)!==''&&text(e.description)===text(r.description)&&((r.date===e.date)||(r.currency===e.currency&&bankDecimal(r.signedAmount)===bankDecimal(e.signedAmount))));if(options.length!==1)return [];const r=options[0];if(missing.filter(x=>text(x.description)===text(r.description)&&((r.date===x.date)||(r.currency===x.currency&&bankDecimal(r.signedAmount)===bankDecimal(x.signedAmount)))).length!==1)return [];return [{statementId:e.id,observedId:r.id,confidence:0.4,reason:'unconfirmed_unique_description_candidate',fields:[...(e.date!==r.date?['date']:[]),...(e.currency!==r.currency?['currency']:[]),...(bankDecimal(e.signedAmount)!==bankDecimal(r.signedAmount)?['signed_amount']:[])]}];});
 return {expectedOccurrences:expectedRows.length,observedBookedOccurrences:candidates.length,coreExact:matched.length,descriptionExact:matched.filter(r=>r.descriptionExact).length,missing:missing.map(r=>r.id),extra:extra.map(r=>r.id),invalid,duplicateIds,pending,unknown,outsideWindow:outside.length,possibleFieldMismatches:possible,diagnosticHintsLimited:missing.length>100,matches:matched,
 observedStatementRecall:expectedRows.length?matched.length/expectedRows.length:null,observedStatementPrecision:candidates.length?matched.length/candidates.length:null,
 exact:expectedRows.length>0&&matched.length===expectedRows.length&&matched.length===candidates.length&&invalid.length===0&&duplicateIds.length===0&&unknown.length===0};
}
export function validateBankStatement(truth:BankStatementTruth,snapshot:BankValidationSnapshot,scope=truth.period,integrity:{sha256:string;pageCount:number}){
 const inputIssues:string[]=[];
 if(!day(truth.period.from)||!day(truth.period.through)||truth.period.from>truth.period.through||!day(scope.from)||!day(scope.through)||scope.from>scope.through||scope.from<truth.period.from||scope.through>truth.period.through)inputIssues.push('invalid_comparison_window');
 if(!/^[a-f0-9]{64}$/.test(truth.source.sha256)||truth.source.sha256!==integrity.sha256)inputIssues.push('source_hash_mismatch');
 if(!Number.isInteger(truth.source.pageCount)||truth.source.pageCount<1||truth.source.pageCount!==integrity.pageCount)inputIssues.push('source_page_count_mismatch');
 if(new Set(truth.source.reviewedPages).size!==truth.source.pageCount||!Array.from({length:truth.source.pageCount},(_,i)=>i+1).every(p=>truth.source.reviewedPages.includes(p)))inputIssues.push('source_pages_not_fully_reviewed');
 if(truth.source.reviewStatus!=='human_confirmed')inputIssues.push('labels_await_human_confirmation');
 if(!Number.isFinite(truth.source.confidence)||truth.source.confidence<0||truth.source.confidence>1)inputIssues.push('invalid_label_confidence');
 if(truth.source.labelMethod!=='manual_original_review'||!truth.source.reviewer.trim())inputIssues.push('independent_original_labels_required');
 if(truth.accountBinding!=='confirmed'||truth.accountId!==snapshot.accountId||truth.ledgerAccountId!==snapshot.ledgerAccountId||truth.bankId!==snapshot.bankId)inputIssues.push('account_binding_not_confirmed');
 if(!truth.dateBasisVerified)inputIssues.push('date_basis_not_verified');
 if(new Set(truth.rows.map(r=>r.id)).size!==truth.rows.length)inputIssues.push('duplicate_label_ids');
 if(truth.rows.some(r=>!day(r.date)||!inRange(r.date,truth.period)||bankDecimal(r.signedAmount)===null||!/^[A-Z]{3}$/.test(r.currency)||!r.description.trim()||!Number.isInteger(r.page)||r.page<1||r.page>truth.source.pageCount))inputIssues.push('invalid_label_row');
 const expected=truth.rows.filter(r=>day(r.date)&&inRange(r.date,scope));
 const provider=compare(expected,snapshot.provider,truth.accountId,scope),ledger=compare(expected,snapshot.ledger,truth.ledgerAccountId,scope);
 const ledgerById=new Map(snapshot.ledger.map(r=>[r.id,r]));
 const linksByProvider=new Map<string,typeof snapshot.links>();const targetCounts=new Map<string,number>();for(const link of snapshot.links){const rows=linksByProvider.get(link.providerId)??[];rows.push(link);linksByProvider.set(link.providerId,rows);if(link.ledgerId)targetCounts.set(link.ledgerId,(targetCounts.get(link.ledgerId)??0)+1);}
 const linked=snapshot.provider.filter(r=>r.status==='booked'&&day(r.date)&&inRange(r.date,scope)).map(p=>{
  const mapping=linksByProvider.get(p.id)??[];const row=mapping.length===1&&mapping[0].ledgerId?ledgerById.get(mapping[0].ledgerId):undefined;
  const reused=row&&(targetCounts.get(row.id)??0)>1;
  const fields=!row?['missing_ledger_reference']:[...(reused?['shared_ledger_reference']:[]),...(row.accountId!==truth.ledgerAccountId?['account']:[]),...(row.date!==p.date?['date']:[]),...(row.currency!==p.currency?['currency']:[]),...(bankDecimal(row.signedAmount)===null||bankDecimal(row.signedAmount)!==bankDecimal(p.signedAmount)?['signed_amount']:[]),...(text(row.description)!==text(p.description)?['description']:[])];
  return {providerId:p.id,ledgerId:row?.id??null,fields};
 });
 const providerToLedger={checked:linked.length,coreExact:linked.filter(r=>!r.fields.some(f=>f!=='description')).length,exact:linked.filter(r=>!r.fields.length).length,mismatches:linked.filter(r=>r.fields.length),interpretation:'Internal source-to-ledger fidelity only; never independent statement accuracy.'};
 const coverageKnown=day(snapshot.coverage.from)&&day(snapshot.coverage.through)&&snapshot.coverage.from<=scope.from&&snapshot.coverage.through>=scope.through&&Boolean(snapshot.coverage.evidence?.trim());
 const blockers=[...inputIssues,...(!day(snapshot.dataAsOfDate)||snapshot.dataAsOfDate<scope.through?['snapshot_precedes_statement_cutoff_or_unknown']:[]),...(!coverageKnown?['independent_provider_window_unknown_or_short']:[]),...(snapshot.retrieval!=='verified_complete'?['retrieval_completion_not_verified']:[]),...(truth.source.kind!=='original'?['synthetic_source_not_accuracy_evidence']:[]),...(expected.length===0?['empty_denominator']:[]),...(!provider.exact?['provider_rows_do_not_agree']:[]),...(!ledger.exact?['ledger_rows_do_not_agree']:[]),...(providerToLedger.mismatches.some(r=>r.fields.some(f=>f!=='description'))?['provider_to_ledger_provenance_mismatch']:[]),...(provider.matches.some(m=>!m.descriptionExact)?['provider_descriptions_need_review']:[]),...(ledger.matches.some(m=>!m.descriptionExact)?['ledger_descriptions_need_review']:[])];
 let statementBalance:{status:string;computedClosing?:string|null}={status:'not_printed'};
 if(truth.balance){const b=truth.balance;const currencies=new Set(truth.rows.map(r=>r.currency));const values=truth.rows.map(r=>b.convention==='liability'?bankDecimal(r.signedAmount)?.replace(/^(-?)(.+)$/,(s,negative,rest)=>negative?rest:'-'+rest)??'invalid':r.signedAmount);const computed=currencies.size===1&&currencies.has(b.currency)?sum([b.opening,...values]):null;statementBalance={status:computed!==null&&computed===bankDecimal(b.closing)?'reconciled':'mismatch',computedClosing:computed};if(statementBalance.status!=='reconciled')blockers.push('printed_statement_balance_does_not_reconcile');}
 const snapshotBalance=!truth.balance||!snapshot.balance?'unavailable':scope.from!==truth.period.from||scope.through!==truth.period.through?'different_comparison_window':snapshot.balance.asOfDate===null||snapshot.balance.cutoff!=='statement_close'?'unavailable_statement_cutoff_evidence':snapshot.balance.asOfDate!==truth.period.through?'different_as_of_date':snapshot.balance.currency!==truth.balance.currency?'different_currency':bankDecimal(snapshot.balance.amount)===bankDecimal(truth.balance.closing)?'agrees':'mismatch';
 if(snapshotBalance==='mismatch'||snapshotBalance==='different_currency')blockers.push('matching_cutoff_balance_does_not_agree');
 return {schemaVersion:1,scope,sourceSha256:truth.source.sha256,sourceKind:truth.source.kind,provider,ledger,providerToLedger,statementBalance,snapshotBalance,
 status:blockers.length?'not_verified':'verified_for_this_account_and_window',blockers:[...new Set(blockers)],fullStatement:scope.from===truth.period.from&&scope.through===truth.period.through,
 fullStatementVerified:!blockers.length&&scope.from===truth.period.from&&scope.through===truth.period.through,bankWideAccuracyClaimAllowed:false,claimScope:'This case only; independent held-out accounts and periods are required for a broader claim.'};
}
