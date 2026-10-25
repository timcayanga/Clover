import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseHeldNativeSource,hasVerifiedHeldNativeRows,buildSeaBankIndonesiaLegacyPdfEvidence} from '../lib/held-source-contracts';
import {isSourceReviewRequiredError} from '../lib/import-source-review';
const text=readFileSync('scripts/fixtures/reviewed-parser-corpus/seabank-id-dormant-opening.txt','utf8');
const parsed=parseHeldNativeSource(text)!;
assert.equal(parsed.rows.length,3);assert.equal(parsed.metadata.confidence,85);
assert.equal(parsed.rows.filter(row=>row.date==='2026-05-30'&&row.amount==='500.00').length,2);
assert.equal(hasVerifiedHeldNativeRows(text,parsed.rows),true);
for(const change of [
  (s:string)=>s.replace('SEABANK_ID_LEGACY_DAY | 31 MAY | 1.000 | 1 | 0',''),
  (s:string)=>s.replaceAll('IDR','PHP'),
  (s:string)=>s.replace('PT Bank Seabank Indonesia','PT Bank Seabank Philippines'),
  (s:string)=>s.replace('Lembaga Penjamin Simpanan (LPS)','unverified issuer'),
  (s:string)=>s.replaceAll('S01-221101SYNTHETIC','S01-270101SYNTHETIC'),
  (s:string)=>s.replace('S01-221101SYNTHETIC','S01-221102SYNTHETIC'),
  (s:string)=>s.replace('SEABANK_ID_LEGACY_TXN | 30 MAY','SEABANK_ID_LEGACY_TXN | 29 MAY'),
  (s:string)=>s.replace('SEABANK_ID_LEGACY_DAY | 30 MAY | 0','SEABANK_ID_LEGACY_DAY | 30 MAY | 1'),
  (s:string)=>s.replace('SEABANK_ID_LEGACY_MONTH | MAY | interest | 1','SEABANK_ID_LEGACY_MONTH | MAY | interest | 2'),
  (s:string)=>s.replace('page 2 of 2','page 2 of 3'),
  (s:string)=>s.replace('SEABANK_ID_LEGACY_COUNTS 2 2','SEABANK_ID_LEGACY_COUNTS 1 2'),
])assert.throws(()=>parseHeldNativeSource(change(text)),isSourceReviewRequiredError);
const changed=structuredClone(parsed.rows);(changed[0].rawPayload!.dormantOpeningProof as Record<string,unknown>).serialPeriodConflict=false;
assert.equal(hasVerifiedHeldNativeRows(text,changed),false,'Review evidence cannot be stripped from the trusted source');
const cell=(str:string,x:number,y:number,width:number)=>({str,transform:[1,0,0,1,x,y],width});
const pub=[cell('01 J',488.52,773.6,23.04),cell('UN',511.56,773.6,17.328),cell('202',531.852,773.6,20.196),cell('6',552.048,773.6,6.672)];
const header=[...pub,cell('SEABANK ACCOUNT: 90100000',40,704.75,142.44),cell('0654',182.44,704.75,22.24),cell('01',232.75,562.25,11.22),cell('MAY',246.44,562.25,21.65),cell('202',270.56,562.25,16.83),cell('6',287.39,562.25,5.56),cell('to 31',295.42,562.25,22.65),cell('MAY',320.54,562.25,21.65),cell('202',344.66,562.25,16.83),cell('6',361.49,562.25,5.56)];
const broken=text.replaceAll('01 JUN 2026','01 J UN 202 6').replace('SEABANK ACCOUNT: 901000000654','SEABANK ACCOUNT: 90100000 0654').replace('01 MAY 2026 to 31 MAY 2026','01 MAY 202 6 to 31 MAY 202 6');
const proofs=[buildSeaBankIndonesiaLegacyPdfEvidence(header,'none'),buildSeaBankIndonesiaLegacyPdfEvidence(pub,'none')].flatMap(result=>result.lines.filter(line=>line.startsWith('SEABANK_ID_LEGACY_HEADER_GLYPHS')));
assert.equal(proofs.length,2);
const restored=broken+'\n'+proofs.join('\n');
assert.deepEqual(parseHeldNativeSource(restored)!.rows.map(row=>[row.date,row.amount,row.accountNumber]),parsed.rows.map(row=>[row.date,row.amount,row.accountNumber]));
assert.throws(()=>parseHeldNativeSource(broken),isSourceReviewRequiredError);
assert.throws(()=>parseHeldNativeSource(restored.replace('01 J UN 202 6','01 J UN 202 5')),isSourceReviewRequiredError,'Glyph evidence must bind to original native text');
const splitDate=buildSeaBankIndonesiaLegacyPdfEvidence([cell('30',48.5,275.85,10.098),cell('MAY',60.821,275.85,19.485),cell('Example Transfer',173.55,275.85,70),cell('500',530,275.85,14.77)],'transactions');
assert(splitDate.lines.some(line=>line==='SEABANK_ID_LEGACY_TXN | 30 MAY | incoming | 500 | Example Transfer'));
const old=readFileSync('scripts/fixtures/reviewed-parser-corpus/seabank-id-legacy-daily.txt','utf8');
assert.equal(parseHeldNativeSource(old)!.rows.length,4);
assert.throws(()=>parseHeldNativeSource(old.replaceAll('INDONESIA','PHILIPPINES')),isSourceReviewRequiredError);
assert.throws(()=>parseHeldNativeSource(old.replaceAll('S01-260228SYNTHETIC','S01-221101SYNTHETIC')),isSourceReviewRequiredError);
console.log('Dormant SeaBank: zero-prefix proof, exact active days/IDR/issuer/date authority, retained serial review, native touching glyphs, repeated credits and unchanged legacy refusals passed.');
