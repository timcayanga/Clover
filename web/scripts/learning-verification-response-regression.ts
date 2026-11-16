import assert from 'node:assert/strict';
import {brotliDecompressSync} from 'node:zlib';
import {learningVerificationResponse} from '../lib/learning-verification-response.server';

async function main(){
 const source='Invented source evidence: IDR 125.000; 05 JAN 2026; account 901000000456; Voucher Wallet Transfer; 原文\n'.repeat(1500);
 const report={accounts:[{accountNumber:'901000000456',currency:'IDR',balance:'0.00',name:'Confirmed account'}],rows:Array.from({length:476},(_,index)=>({id:String(index),date:'2026-01-05T12:00:00.000Z',amount:'40.00',currency:'IDR',sourceRowIndex:index+1,reference:'00000123',reviewStatus:'confirmed',rawPayload:{sourceDocumentText:source,line:'Original occurrence '+index},updatedAt:'2026-10-13T00:00:00.000Z'})),jobs:[{status:'completed',nextIndex:476}],preservation:{count:53250,unchanged:true}};
 const original=JSON.stringify(report);assert(Buffer.byteLength(original)>4_500_000);
 const response=learningVerificationResponse(report,'gzip, br;q=1');
 assert.equal(response.headers.get('Content-Encoding'),'br');assert.equal(response.headers.get('Cache-Control'),'no-store');assert.equal(response.headers.get('Vary'),'Accept-Encoding');
 const bytes=Buffer.from(await response.arrayBuffer());assert(bytes.byteLength<4_500_000,'A large full-evidence diagnostic fits the transport budget without dropping rows or fields');
 assert.equal(brotliDecompressSync(bytes).toString('utf8'),original,'Every complete JSON byte, occurrence, leading zero, Unicode and timestamp survives');
 for(const unsupported of [null,'gzip','br;q=0','br;q=NaN','br;q=-1']){const plain=learningVerificationResponse(report,unsupported);assert.equal(plain.headers.get('Content-Encoding'),null);assert.deepEqual(await plain.json(),report);}
 const small={rows:[{amount:'0.00',currency:'SGD',source:'empty snapshot'}]};const plain=learningVerificationResponse(small,'br');assert.equal(plain.headers.get('Content-Encoding'),null);assert.deepEqual(await plain.json(),small);
 console.log('Learning verification transport: complete large evidence, financial fields, legitimate occurrences and unsupported-client compatibility passed.');
}
main().catch(error=>{console.error(error);process.exitCode=1});
