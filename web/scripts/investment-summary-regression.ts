import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import { parseImportText, parseImportTextGenericOnly, detectStatementMetadata } from '../lib/import-parser';
import { decodeSpreadsheetWorkbookBytes } from '../lib/spreadsheet-import.server';

// Same reported column layout, with synthetic balances and quantities.
const header = ['Investment','Platform','Contrib/ Month','Units/ Shares','Market Value','Valuation Date'];
const data = [
 ['COOP','Ayala','1000','-','40400.00','9/23/2026'],
 ['BPI US Equity Index Feeder Fund','BPI Invest','1500','42.96436','13159.54','9/23/2026'],
 ['ATRAM Global Tech Feeder Fund','GFunds','500','20.09621','10307.12','9/23/2026'],
 ['ATRAM Global Consumer Feeder Fund','GFunds','500','42.50333','8892.51','9/23/2026'],
];
const text = [header,...data].map(row=>row.join(' ')).join('\n');
function check(rows: ReturnType<typeof parseImportText>) {
 assert.equal(rows.length,4);
 assert.deepEqual(rows.map(r=>r.accountName),data.map(r=>r[0]));
 assert.deepEqual(rows.map(r=>r.institution),['Ayala','BPI','GFunds','GFunds']);
 assert.deepEqual(rows.map(r=>r.rawPayload?.marketValue),[40400,13159.54,10307.12,8892.51]);
 assert.deepEqual(rows.map(r=>r.rawPayload?.quantity),[undefined,42.96436,20.09621,42.50333]);
 assert.ok(rows.every(r=>r.rawPayload?.kind==='account_snapshot_marker' && r.amount==='0.00' && r.type==='transfer'));
 assert.ok(rows.every(r=>r.date==='2026-09-23' && r.rawPayload?.reviewRequired===true));
 assert.ok(rows.every(r=>r.rawPayload?.totalCost===undefined));
}
for(const parse of [parseImportText,parseImportTextGenericOnly]) {
 check(parse(text,'renamed.png','image/png'));
 assert.throws(()=>parse(text.replace('10307.12','unreadable'),'renamed.png','image/png'),/safely/);
 assert.throws(()=>parse(header.join(' '),'renamed.png','image/png'),/No investment balances/);
 check(parse(text + '\nTotal 72659.17', 'summary.png', 'image/png'));
 assert.throws(()=>parse(text.replace('Market Value Valuation Date', 'Valuation Date Market Value'), 'summary.png', 'image/png'), /column order/);
 const ledger=parse('Date Description Amount\n9/23/2026 Coffee 150.00','unknown.png','image/png');
 assert.ok(!ledger.some(r=>r.amount==='2026'),'A year must never be an amount');
}
assert.equal(detectStatementMetadata(text)?.institution,null,'Mixed platforms must not collapse into GFunds');
async function runWorkbookChecks() {
const workbook=XLSX.utils.book_new();
XLSX.utils.book_append_sheet(workbook,XLSX.utils.aoa_to_sheet([header,...data]),'Investments');
const bytes=XLSX.write(workbook,{type:'buffer',bookType:'xlsx'});
const decoded=await decodeSpreadsheetWorkbookBytes(bytes);
check(parseImportText(decoded,'summary.xlsx','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'));
XLSX.utils.book_append_sheet(workbook,XLSX.utils.aoa_to_sheet([['Date','Description','Amount'],['2026-09-23','Coffee','-150.00']]),'Transactions');
const mixed=await decodeSpreadsheetWorkbookBytes(XLSX.write(workbook,{type:'buffer',bookType:'xlsx'}));
const mixedRows=parseImportText(mixed,'mixed.xlsx','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
assert.equal(mixedRows.length,5);
check(mixedRows.filter(r=>r.rawPayload?.source==='investment_summary'));
assert.equal(mixedRows.filter(r=>r.type==='expense').length,1,'Only the real ledger purchase becomes an expense');
console.log('PASS investment summaries: screenshot/workbook, separate platforms, precise balances/units, no expenses or year amounts, ambiguous rows fail closed.');

}
runWorkbookChecks().catch(error => { console.error(error); process.exitCode = 1; });
