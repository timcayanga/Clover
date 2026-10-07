import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import * as XLSX from "xlsx";
import { parseImportText } from "@/lib/import-parser";
import { enrichParsedRowsWithTraining, resolveParsedTransactionCategoryName } from "@/lib/data-engine";
import { decodeSpreadsheetWorkbookBytes } from "@/lib/spreadsheet-import.server";
import { readAppMigration, createMigrationOverlapMatcher } from "@/lib/app-migration-import";
import { persistMigrationTags } from "@/lib/app-migration-persistence";
const parse = (text: string) => parseImportText(text, "export.csv", "text/csv", { currency: "PHP" });
const main = async () => {
 const bluecoins = parse(readFileSync("scripts/fixtures/app-migrations/bluecoins-official-advanced.csv", "utf8"));
 assert.equal(bluecoins.length, 9, "All official Bluecoins sample rows must survive");
 assert.equal(bluecoins[1].merchantRaw, "Grocery items", "Labels are not merchants");
 assert.equal(bluecoins[3].merchantRaw, "Electric bill");
 assert.equal(bluecoins[7].type, "transfer");
 assert.equal(bluecoins[8].type, "transfer");
 assert.equal(readAppMigration(bluecoins[7].rawPayload)?.direction, "expense");
 assert.equal(readAppMigration(bluecoins[8].rawPayload)?.direction, "income");
 assert.deepEqual(readAppMigration(bluecoins[1].rawPayload)?.tags, ["food", "groceries", "chicken", "eggs"]);
 assert.equal(readAppMigration(bluecoins[4].rawPayload)?.splitGroup, readAppMigration(bluecoins[6].rawPayload)?.splitGroup);
 assert.equal(bluecoins[0].categoryName, "Employer / Salary");
 const realbyte = 'Date,Account,Category,Subcategory,Note,Amount,Income/Expense,Description\n09/01/2026,Cash,Food,Lunch,Restaurant,500,Expense,lunch\n09/02/2026,BPI,Work,Stipend,Employer,10000,Income,monthly\n09/03/2026,BPI,Savings,,Transfer,1000,Transfer out,\n09/04/2026,Cash,Food,Lunch,,150,Expense,';
 const rb = parse(realbyte);
 assert.equal(rb.length, 5);
 assert.equal(rb[4].accountName, "Savings");
 assert.equal(readAppMigration(rb[4].rawPayload)?.direction, "income");
 assert.equal(readAppMigration(rb[4].rawPayload)?.derivedTransferLeg, true);
 assert.equal(rb[1].type, "income");
 assert.equal(rb[3].categoryName, "Food / Lunch");
 const moneyLover = parse('Date;Wallet;Category;Amount;Note;Type;Currency\n2026-09-01;Cash;Lunch;"50.000,00";;Expense;IDR\n2026-09-02;BCA;Work;"5.000.000,00";Employer;Income;IDR');
 assert.equal(moneyLover.length, 2); assert.equal(moneyLover[0].amount, "50000.00"); assert.equal(moneyLover[1].type, "income");
 const wallet = parse('date,account,category,amount,currency,ref_currency_amount,payment_type,type,note,tags,excluded\n2026-09-01,BPI,Food,-500,PHP,-9,card,Expense,Lunch,travel|work,true\n2026-09-02,BPI,Pay,9000,PHP,150,transfer,Income,Salary,,false');
 assert.equal(wallet.length, 2); assert.equal(wallet[0].amount, "500.00"); assert.equal(readAppMigration(wallet[0].rawPayload)?.excluded, true);
 assert.deepEqual(readAppMigration(wallet[0].rawPayload)?.tags, ["travel", "work"]);
 const templateText = readFileSync("public/templates/clover-migration.csv", "utf8");
 const template = parse(templateText); assert.equal(template.length, 4);
 // Explicitly supply no DB training context: migration-only enrichment must
 // not query training data or replace the user's labels/accounts/direction.
 const enriched = await enrichParsedRowsWithTraining({ workspaceId: "offline-test-must-not-query", rows: [...rb, ...bluecoins, ...wallet] });
 assert.deepEqual(enriched.map(r => [r.categoryName, r.merchantRaw, r.accountName, r.type]), [...rb, ...bluecoins, ...wallet].map(r => [r.categoryName, r.merchantRaw, r.accountName, r.type]));
 assert.equal(resolveParsedTransactionCategoryName(rb[0]), "Food / Lunch");
 for (const format of ["xlsx", "xls", "ods"] as const) {
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.read(templateText, { type: "string", raw: true }).Sheets.Sheet1, "Transactions");
  const text = await decodeSpreadsheetWorkbookBytes(XLSX.write(book, { type: "buffer", bookType: format }));
  const rows = parseImportText(text, `export.${format}`, "application/octet-stream", { currency: "PHP" });
  assert.equal(rows.length, 4, format); assert.deepEqual(rows.map(r => [r.accountName, r.amount, r.currency, r.type, r.categoryName]), template.map(r => [r.accountName, r.amount, r.currency, r.type, r.categoryName]), format);
 }
 const base = 'Migration Source,Date,Description,Amount,Currency,Account,Type,Category,Status,Transaction ID';
 const repeated = `${base}\nspreadsheet,2026-09-01,Lunch,500,PHP,Cash,Expense,Food,posted,a\nspreadsheet,2026-09-01,Lunch,500,PHP,Cash,Expense,Food,posted,a\nspreadsheet,2026-09-02,Lunch,500,PHP,Cash,Expense,Food,pending,b`;
 const unique = parse(repeated);assert.equal(unique.length, 1);
 assert.equal((unique[0].rawPayload?.migrationSummary as any).inputRows, 3);
 assert.equal((unique[0].rawPayload?.migrationSummary as any).skippedRows.length, 2);
 assert.throws(() => parse(repeated.replace('Food,posted,a\nspreadsheet', 'Food,posted,c\nspreadsheet').replace('2026-09-02,Lunch,500', 'not-a-date,Lunch,500').replace('Food,pending,b', 'Food,posted,b')), /row 4.*date or amount/);
 assert.throws(() => parse(repeated.replace('2026-09-01,Lunch,500,PHP,Cash,Expense,Food,posted,a\nspreadsheet', '2026-09-01,Lunch,501,PHP,Cash,Expense,Food,posted,a\nspreadsheet')), /conflicting values/);
 assert.throws(() => parse('Date,Wallet,Category,Amount,Note\n2026-09-01,Cash,Food,500,Lunch'), /unsigned amount/);
 assert.throws(() => parse(templateText.replace('500,PHP', 'oops,PHP')), /row 2/);
 const noIds = parse(templateText.replace(/example-[^\n]*/g, ''));
 const existing = [{ ...noIds[0], accountId: 'cash' }, { ...noIds[0], accountId: 'cash' }];
 const match = createMigrationOverlapMatcher(existing);
 assert.equal(match({ ...noIds[0], accountId: 'other' }), false);
 assert.equal(match({ ...noIds[0], accountId: 'cash' }), true);
 assert.equal(match({ ...noIds[0], accountId: 'cash' }), true);
 assert.equal(match({ ...noIds[0], accountId: 'cash' }), false, 'Preserve occurrence count');
 // Persistence contract uses only the provided new transaction IDs, batches
 // tags and scopes every lookup to the current Profile.
 const calls:any[]=[];
 await persistMigrationTags({ tag: { createMany: async (x:any) => { calls.push(x); }, findMany: async (x:any) => { assert.equal(x.where.workspaceId,'test-profile'); return [{id:'tag-1',normalizedName:'travel'},{id:'tag-2',normalizedName:'work'}]; } }, transactionTag: { createMany: async(x:any) => { calls.push(x); } } } as any, 'test-profile', [{id:'new-transaction',rawPayload:wallet[0].rawPayload}]);
 assert.deepEqual(calls[1].data.map((x:any)=>x.transactionId), ['new-transaction','new-transaction']);
 const ynabText = readFileSync("scripts/fixtures/app-migrations/ynab-register-synthetic.csv", "utf8");
 const monarchText = readFileSync("scripts/fixtures/app-migrations/monarch-transactions-synthetic.csv", "utf8");
 const ynab = parse(ynabText), monarch = parse(monarchText);
 assert.equal(ynab.length, 7); assert.equal(monarch.length, 7);
 assert(ynab.every(r => readAppMigration(r.rawPayload)?.source === "ynab"));
 assert(monarch.every(r => readAppMigration(r.rawPayload)?.source === "monarch"));
 assert.deepEqual(ynab.map(r => r.amount), ["45.25", "2500.00", "200.00", "200.00", "5.25", "30.00", "20.00"]);
 assert.deepEqual(ynab.map(r => r.type), ["expense", "income", "transfer", "transfer", "income", "expense", "expense"]);
 assert.equal(ynab[0].categoryName, "Living / Groceries"); assert.equal(ynab[0].description, "Apples, bread");
 assert.deepEqual(readAppMigration(ynab[0].rawPayload)?.tags, ["YNAB: Blue"]);
 assert.equal((ynab[0].rawPayload?.migrationSummary as any).skippedRows[0].reason, "starting balance (not income)");
 assert.equal(monarch[0].merchantRaw, "POS CORNER SHOP 0042"); assert.equal(monarch[0].merchantClean, "Corner Shop");
 assert.equal(monarch[0].description, "Lunch, snacks"); assert.equal(monarch[5].type, "income");
 assert.equal(monarch.filter(r => r.type === "transfer").length, 3);
 assert.equal(readAppMigration(monarch[6].rawPayload)?.excluded, true);
 assert.deepEqual(readAppMigration(monarch[0].rawPayload)?.tags, ["household", "food"]);
 const monarchStandard="Date,Merchant,Category,Account,Original Statement,Notes,Amount,Tags\n2026-09-01,Shop,Groceries,Card,POS FOOD,Refund,25,food";
 assert.equal(parseImportText(monarchStandard,"monarch.csv","text/csv",{currency:"CAD"})[0].currency,"CAD");
 assert.throws(()=>parseImportText(monarchStandard,"monarch.csv","text/csv"),/Currency/);
 const ynabStandard="Account,Flag,Date,Payee,Category Group/Category,Category Group,Category,Memo,Outflow,Inflow,Cleared\nChecking,,2026-09-01,Shop,Living: Food,Living,Food,Receipt,25,0,Cleared";
 assert.equal(parseImportText(ynabStandard,"ynab.csv","text/csv",{currency:"SGD"})[0].currency,"SGD");
 assert.throws(()=>parseImportText(ynabStandard,"ynab.csv","text/csv"),/Currency/);
 const newEnriched = await enrichParsedRowsWithTraining({workspaceId:"offline-new-profiles", rows:[...ynab, ...monarch]});
 assert.deepEqual(newEnriched.map(r=>[r.merchantRaw,r.merchantClean,r.categoryName,r.type,r.currency,r.amount]), [...ynab,...monarch].map(r=>[r.merchantRaw,r.merchantClean,r.categoryName,r.type,r.currency,r.amount]));
 const yh = "Account,Flag,Date,Payee,Category Group,Category,Memo,Outflow,Inflow,Cleared,Currency";
 const yrow = (date:string, out="25", incoming="0") => `YNAB,Blue,${date},Shop,Living,Food,Receipt,${out},${incoming},Cleared,USD`;
 assert.throws(()=>parse(yh+"\n"+yrow("03/04/2026")), /ambiguous/);
 assert.throws(()=>parse(yh+"\n"+yrow("2026-02-30")), /invalid/);
 assert.throws(()=>parse(yh+"\n"+yrow("2026-09-01","25","10")), /not both/);
 assert.throws(()=>parse(yh+"\n"+yrow("2026-09-01","-25")), /nonnegative/);
 assert.throws(()=>parse(yh+"\n"+yrow("2026-09-01","fee 25")), /numeric amount/);
 assert.throws(()=>parse(yh+"\n"+yrow("13/04/2026")+"\n"+yrow("04/13/2026")), /mixes/);
 const dmy = parse(yh+"\n"+yrow("13/04/2026")+"\n"+yrow("03/04/2026"));
 assert.equal(dmy[1].date, "2026-04-03");
 const explicit = parse(yh+",Date Format\n"+yrow("03/04/2026")+",MDY");
 assert.equal(explicit[0].date, "2026-03-04");
 const euro = parse(yh.replaceAll(",","\t")+"\n"+yrow("2026-09-01").replaceAll(",","\t").replace("25\t0", "1.234,56\t0,00").replace("USD","EUR"));
 assert.equal(euro[0].amount, "1234.56");
 for (const bad of ["12,34,56", "10 20", "(25", "2-5", "25-", "=25", "0.001"]) {
  assert.throws(()=>parse(yh+"\n"+yrow("2026-09-01",`"${bad}"`)), /amount|decimal|sign/, bad);
 }
 assert.throws(()=>parse(monarchText.replace("Date,Merchant", "Account,Date,Merchant").replace("2026-09-01,Corner", "Other,2026-09-01,Corner")), /Duplicate migration column/);
 assert.equal(parse(monarchText.replace("Currency,Hidden", "Currency,Hidden,Type").replace("USD,false", "USD,false,Transfer"))[0].type,"transfer");
 assert.throws(()=>parse(monarchText.replace("Currency,Hidden", "Currency,Hidden,Type").replace("USD,false", "USD,false,Income")), /conflicts/);
 assert.throws(()=>parse(ynabText.replace("YNAB Checking,Blue", ",Blue")), /Account name/);
 const quoted = parse(monarchText.replace("Lunch, snacks", "Lunch, snacks\nand dinner"));
 assert.equal(quoted[0].description, "Lunch, snacks\nand dinner");
 assert.equal(parse(yh+"\n"+yrow("2026-09-01",'"12,5"'))[0].amount,"12.50");
 assert.equal(parse(yh+"\n"+yrow("2026-09-01",'"1.234,5"'))[0].amount,"1234.50");
 assert.equal(parse(yh+"\n"+yrow("2026-09-01",'"1 234,50"'))[0].amount,"1234.50");
 assert.equal(parse(yh+"\n"+yrow("2026-09-01",'"1,234.50"'))[0].amount,"1234.50");
 const summary=monarch[0].rawPayload?.migrationSummary as any;
 const checking=summary.totals.find((t:any)=>t.account==="Monarch Checking");
 assert.deepEqual([checking.income,checking.expense,checking.transferIn,checking.transferOut,checking.excluded],[2004.5,24.5,0,150,15]);
 const sourceBenchmarks:Record<string,number>={};
 for(const source of ["ynab","monarch"]) {
   const text=source==="ynab" ? yh+"\n"+Array.from({length:10000},(_,i)=>yrow("2026-09-01").replace("Shop",`Shop ${i}`)).join("\n")
     : "Date,Merchant,Category,Account,Original Statement,Notes,Amount,Tags,Currency\n"+Array.from({length:10000},(_,i)=>`2026-09-01,Shop ${i},Food,Monarch,POS ${i},Receipt,-25,work,USD`).join("\n");
   const start=performance.now();const ready=await enrichParsedRowsWithTraining({workspaceId:"offline-source-benchmark",rows:parse(text)});
   sourceBenchmarks[source]=Math.round(performance.now()-start);
   assert.equal(ready.length,10000);assert(ready.every(r=>r.amount==="25.00"&&r.type==="expense"&&r.currency==="USD"));
   assert(sourceBenchmarks[source]<10000,`${source} exceeded 10s: ${sourceBenchmarks[source]}`);
 }
 console.log("New source benchmarks (10,000 rows each):",sourceBenchmarks);
 const before = ynabText.split("\n").filter(line=>!line.includes("Starting Balance")).join("\n");
 const occurrence = createMigrationOverlapMatcher(parse(before).map(r=>({...r,accountId:r.accountName})));
 assert(parse(before).every(r=>occurrence({...r,accountId:r.accountName})));
 for (const input of [ynabText, monarchText]) {
   for (const format of ["xlsx", "xls", "ods"] as const) {
     const book = XLSX.read(input, {type:"string", raw:true});
     const decoded = await decodeSpreadsheetWorkbookBytes(XLSX.write(book,{type:"buffer",bookType:format}));
     const actual = parseImportText(decoded, `migration.${format}`, "application/octet-stream", {currency:"USD"});
     assert.deepEqual(actual.map(r=>[r.amount,r.currency,r.accountName,r.type,r.categoryName]), parse(input).map(r=>[r.amount,r.currency,r.accountName,r.type,r.categoryName]), format);
   }
 }
 const count=10000;
 const large=['Migration Source,Date,Description,Amount,Currency,Account,Type,Category', ...Array.from({length:count},(_,i)=>`spreadsheet,2026-09-01,Purchase ${i},125.50,PHP,Cash,Expense,My food`)].join('\n');
 const start=performance.now(); const rows=parse(large); const ready=await enrichParsedRowsWithTraining({workspaceId:'offline-performance',rows});const elapsed=performance.now()-start;
 assert.equal(ready.length,count);assert(ready.every(r=>r.amount==='125.50'&&r.categoryName==='My food'&&r.type==='expense'));
 assert(elapsed<10000, `10,000 deterministic migration rows exceeded 10s: ${elapsed}ms`);
 console.log(`PASS migrations: 7 adapters, official Bluecoins 9/9, fields/enrichment, workbook formats, invalid rows, duplicates, tags. 10,000 rows parsed+enriched in ${Math.round(elapsed)}ms.`);
};
main().catch(e=>{console.error(e);process.exitCode=1;});
