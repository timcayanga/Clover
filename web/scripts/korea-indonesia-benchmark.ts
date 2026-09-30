import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { cpus, platform, arch } from "node:os";
import { performance } from "node:perf_hooks";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { parseImportText, type ParsedImportRow } from "../lib/import-parser";
import { parseReceiptText, assessReceiptPreviewQuality } from "../lib/split-bill";
import { decodeSpreadsheetWorkbookBytes } from "../lib/spreadsheet-import.server";
import { decodeStructuredDelimitedBytes } from "../lib/structured-delimited-decoder";

// Targets are fixed before the baseline. Expected answers never come from parser output.
const targets = { deterministicP95Ms: 250, workbookP95Ms: 500, publicTotalCoverage: 0.95,
  returnedPublicTotalPrecision: 1, safetyPassRate: 1, fixtureAccuracy: 1,
  stress1000P95Ms: 1000, stress10000P95Ms: 10000 };
const args = process.argv.slice(2);
const option = (key: string, fallback: string) => args.find(arg => arg.startsWith(`${key}=`))?.slice(key.length + 1) ?? fallback;
const iterations = Number(option("--iterations", "15"));
const stressIterations = Number(option("--stress-iterations", "5"));
assert.ok(Number.isInteger(iterations) && iterations >= 1 && iterations <= 100);
assert.ok(Number.isInteger(stressIterations) && stressIterations >= 1 && stressIterations <= 20);
const root = new URL("./fixtures/", import.meta.url);
const read = (file: string) => readFileSync(new URL(file, root));
const json = (file: string) => JSON.parse(read(file).toString("utf8"));
const checksum = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
// Hash the loaded files, not a Git diff: hook-specific Git worktree variables
// can make a child process compare a different checkout or produce huge output.
const runtimeSources = ["data-engine.ts", "import-file-text.server.ts", "import-parser.ts", "korean-receipt.ts", "indonesian-receipt.ts", "unlocalized-receipt.ts", "split-bill.ts"];
const runtimeSourceHashes = Object.fromEntries(runtimeSources.map(file => [file, checksum(readFileSync(new URL(`../lib/${file}`, import.meta.url)))]));
const percentile = (values: number[], p: number) => [...values].sort((a,b) => a-b)[Math.max(0,Math.ceil(values.length * p)-1)] ?? 0;
const summarize = (values: number[]) => ({ samples: values.length, medianMs: +percentile(values,.5).toFixed(3), p95Ms: +percentile(values,.95).toFixed(3), maxMs: +Math.max(...values,0).toFixed(3) });
const subset = (actual: unknown, expected: unknown) => {
  if (expected && typeof expected === "object" && !Array.isArray(expected)) {
    assert.ok(actual && typeof actual === "object");
    for (const [key,value] of Object.entries(expected)) subset((actual as Record<string,unknown>)[key],value);
  } else assert.deepEqual(actual,expected);
};
type Test = { id: string; country: string; group: string; run: () => unknown | Promise<unknown>; verify: (result: any) => void };
const tests: Test[] = [];
const bank = json("korea-indonesia-bank-exports/cases.json");
for (const c of bank.cases) {
  assert.equal(checksum(c.input),c.sha256);
  const bytes = c.bytesBase64 ? Buffer.from(c.bytesBase64,"base64") : null;
  if (bytes) assert.equal(checksum(bytes),c.bytesSha256);
  tests.push({ id:c.id,country:c.country,group:"bank-export",run:()=> {
    const text = bytes ? decodeStructuredDelimitedBytes(bytes) : c.input;
    try { return { rows:parseImportText(text,c.fileName,c.fileName.endsWith(".json")?"application/json":"text/csv",c.context) }; }
    catch(error) { return {error:String(error)}; }
  },verify:result=>{
    if(c.expectedError) { assert.match(result.error??"",/Nothing was added|safely|incomplete|conflicting|unsupported/i); return; }
    assert.equal(result.error,undefined); assert.equal(result.rows.length,c.expectedRows.length);
    result.rows.forEach((row:ParsedImportRow,i:number)=> {
      subset(row,c.expectedRows[i]);
      if(c.review) {assert.equal(row.rawPayload?.reviewRequired,true);assert.ok(row.parserConfidence!<80);}
      if(c.fileName.endsWith(".json")) {
        const input=JSON.parse(c.input);
        assert.deepEqual(row.rawPayload?.sourceRecord,input.transactions[row.rawPayload?.sourceIndex as number]);
      }
    });
  }});
}
const publicManifest=json("korea-indonesia-public/manifest.json");
const publicOutcomes: Record<string,{ country:string; exact:boolean; returned:boolean; safe:boolean; expected:string; actual:string|null }>={};
for(const c of publicManifest.cases) {
 const text=read(`korea-indonesia-public/${c.file}`).toString("utf8"); assert.equal(checksum(text),c.textSha256);
 tests.push({id:c.id,country:c.country,group:"public-receipt",run:()=>parseReceiptText(text),verify:result=>{
   const safe=result.requiresReview===true && !assessReceiptPreviewQuality(result).reliableForFastPath && result.currency===c.expected.currency && result.receiptText===text;
   publicOutcomes[c.id]={country:c.country,exact:result.total===c.expected.printedTotal,returned:result.total!==null,safe,expected:c.expected.printedTotal,actual:result.total};
   assert.ok(safe,"An incomplete excerpt must not invent currency or enter fast acceptance");
   if(result.total!==null) assert.equal(result.total,c.expected.printedTotal,"A returned total must be exact");
 }});
}
const expectedAmounts: Record<string,string[]>={KR:["4500.00","2500.00","32000.00","18500.00","16000.00","1600.00","4000000.00","4500.00"],ID:["25000.00","28000.50","150000.00","32500.00","350000.00","55000.00","200000.00","25000.00"]};
for(const c of json("korea-indonesia/manifest.json").files) {
 const bytes=read(`korea-indonesia/${c.file}`); assert.equal(checksum(bytes),c.sha256);
 const workbook=c.kind==="workbook";
 tests.push({id:c.file,country:c.country,group:workbook?"workbook":"synthetic-file",run:async()=>{
   const text=workbook?await decodeSpreadsheetWorkbookBytes(bytes):decodeStructuredDelimitedBytes(bytes);
   if(c.kind==="receipt-text")return parseReceiptText(text);
   try{return {rows:parseImportText(text,c.file,workbook?"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":"text/csv")};}
   catch(error){return {error:String(error)};}
 },verify:result=>{
   if(c.kind==="receipt-text") { assert.equal(result.total,c.country==="KR"?"9000.00":"50000.00");assert.equal(result.currency,c.country==="KR"?"KRW":"IDR");assert.equal(result.items.length,1);return; }
   if(c.kind==="rejected-ledger"){assert.match(result.error??"",/safely/);return;}
   assert.equal(result.error,undefined);assert.equal(result.rows.length,c.expectedRecords);
   const holdings=result.rows.filter((row:ParsedImportRow)=>row.rawPayload?.kind==="account_snapshot_marker");
   if(c.kind==="holdings"||workbook) {
     assert.deepEqual(holdings.map((row:ParsedImportRow)=>row.rawPayload?.marketValue),c.country==="KR"?[230000,120000]:[1250000.5,125.5]);
     assert.deepEqual(holdings.map((row:ParsedImportRow)=>row.rawPayload?.quantity),c.country==="KR"?[42.96436,20.12345]:[42.96436,.125]);
   }
   if(c.file.includes("ledger")||workbook) {
     const ledger=result.rows.filter((row:ParsedImportRow)=>row.rawPayload?.kind!=="account_snapshot_marker");
     assert.deepEqual(ledger.map((row:ParsedImportRow)=>row.amount),expectedAmounts[c.country]);
     assert.deepEqual(ledger.map((row:ParsedImportRow)=>row.type),[...Array(7).fill("expense"),"income"]);
     assert.ok(ledger.every((row:ParsedImportRow)=>row.currency===(c.country==="KR"?"KRW":"IDR")));
   }
   if(c.file.includes("foreign"))assert.ok(result.rows.every((row:ParsedImportRow)=>row.currency==="USD"));
 }});
}
if(!args.includes("--no-stress"))for(const country of ["KR","ID"]) for(const size of [1000,10000]) {
 const headers=country==="KR"?"거래일자;적요;거래금액;입출금구분;통화;계좌번호;거래번호":"Tanggal;Keterangan;Nominal;Jenis transaksi;Mata uang;Nomor rekening;Referensi";
 const lines=Array.from({length:size},(_,i)=>{
  const date=new Date(Date.UTC(2024,0,1)+i*3600000).toISOString().slice(0,10);
  const incoming=i%5===0,amount=country==="KR"?(incoming?25000:12500):(incoming?25000.75:12500.5);
  return {date,amount,type:incoming?"income":"expense",line:[date,(country==="KR"?"이디야커피 강남점":"KOPI KENANGAN JAKARTA")+` ${i%20}`,amount.toFixed(2),incoming?"income":"expense",country==="KR"?"KRW":"IDR","00001234",`SYNTHETIC-${i}`].join(";")};
 });
 const text=[headers,...lines.map(row=>row.line)].join("\n");
 tests.push({id:`${country.toLowerCase()}-stress-${size}`,country,group:`stress-${size}`,run:()=>parseImportText(text,"synthetic-stress.csv","text/csv"),verify:result=>{
  assert.equal(result.length,size);
  result.forEach((row:ParsedImportRow,i:number)=>{assert.equal(row.amount,lines[i].amount.toFixed(2));assert.equal(row.type,lines[i].type);assert.equal(row.date,lines[i].date);assert.equal(row.currency,country==="KR"?"KRW":"IDR");assert.equal(row.accountNumber,"00001234");assert.equal(row.rawPayload?.reference,`SYNTHETIC-${i}`);});
 }});
}
async function main(){
 const results:any[]=[];
 for(const test of tests) {
  const durations:number[]=[];let failure:string|null=null;
  const firstStart=performance.now();const first=await test.run();const firstMs=performance.now()-firstStart;
  try{test.verify(first);}catch(error){failure=String(error);}
  const count=test.group.startsWith("stress-")?stressIterations:iterations;
  for(let i=0;i<count;i++){const start=performance.now();const value=await test.run();durations.push(performance.now()-start);try{test.verify(value);}catch(error){failure=String(error);}}
  results.push({id:test.id,country:test.country,group:test.group,passed:!failure,failure,firstInvocationMs:+firstMs.toFixed(3),timing:summarize(durations),durationsMs:durations});
  if(test.group.startsWith("stress-"))console.log(`${test.id}: p95 ${percentile(durations,.95).toFixed(1)}ms; ${failure??"exact"}`);
 }
 const groups=Array.from(new Set(results.map(r=>`${r.country}/${r.group}`))).map(key=>{
  const matches=results.filter(r=>`${r.country}/${r.group}`===key),group=matches[0].group;
  const limit=group==="workbook"?targets.workbookP95Ms:group==="stress-1000"?targets.stress1000P95Ms:group==="stress-10000"?targets.stress10000P95Ms:targets.deterministicP95Ms;
  return {key,documents:matches.length,passed:matches.filter(r=>r.passed).length,timing:summarize(matches.flatMap(r=>r.durationsMs)),worstDocumentP95Ms:Math.max(...matches.map(r=>r.timing.p95Ms)),limitMs:limit,speedPassed:matches.every(r=>r.timing.p95Ms<=limit)};
 });
 const receiptAccuracy=["KR","ID"].map(country=>{const items=Object.values(publicOutcomes).filter(r=>r.country===country);const exact=items.filter(r=>r.exact).length,returned=items.filter(r=>r.returned).length;return {country,total:items.length,exact,unresolved:items.length-returned,wrong:returned-exact,coverage:exact/items.length,precision:returned?exact/returned:0,safe:items.filter(r=>r.safe).length};});
 const accuracyPassed=results.every(r=>r.passed)&&receiptAccuracy.every(r=>r.coverage>=targets.publicTotalCoverage&&r.precision===1&&r.safe===r.total);
 const speedPassed=groups.every(g=>g.speedPassed);
 const report={timestamp:new Date().toISOString(),commit:execFileSync("git",["rev-parse","HEAD"],{encoding:"utf8"}).trim(),runtimeSourceHashes,targets,iterations,stressIterations,environment:{node:process.version,platform:platform(),arch:arch(),cpu:cpus()[0]?.model,logicalCpus:cpus().length,maxRssKiB:process.resourceUsage().maxRSS},method:"Sequential, disk inputs preloaded; one first invocation followed by repeated warm calls; correctness assertions excluded from timing. Workbook and legacy-byte decoding included. No network, OCR, model, queue, persistence or end-to-end upload timing. Development corpus, not independent holdout.",accuracyPassed,speedPassed,receiptAccuracy,groups,publicOutcomes,results};
 const output=option("--out","/tmp/clover-regional-benchmark/latest.json");mkdirSync(dirname(output),{recursive:true});writeFileSync(output,JSON.stringify(report,null,2)+"\n");
 console.log(JSON.stringify({accuracyPassed,speedPassed,receiptAccuracy,groups,report:output},null,2));
 if(!accuracyPassed||(!args.includes("--no-speed-gate")&&!speedPassed))process.exitCode=1;
}
main().catch(error=>{console.error(error);process.exitCode=1;});
