import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import {decodeSpreadsheetWorkbookBytes} from '../lib/spreadsheet-import.server';
import {parseImportText} from '../lib/import-parser';
async function main(){
 const workbook=XLSX.utils.book_new();
 workbook.Workbook={WBProps:{date1904:true}};
 const sheet=XLSX.utils.aoa_to_sheet([['Date','Description','Amount','Account Number','Direction'],[1,'Coffee',100,1234,'Debit']]);
 sheet.A2={t:'n',v:1,z:'yyyy-mm-dd'};sheet.D2.z='0000000000000';
 XLSX.utils.book_append_sheet(workbook,sheet,'Metrobank');
 const decode=()=>decodeSpreadsheetWorkbookBytes(new Uint8Array(XLSX.write(workbook,{type:'buffer',bookType:'xlsx'})));
 const text=await decode();assert.match(text,/1904-01-02/);assert.match(text,/0000000001234/);
 sheet.C2={t:'n',v:150,f:'100+50'};
 assert.match(await decode(),/Coffee,150/,'Use saved formula value rather than formula text');
 sheet.C2={t:'e',v:7,f:'1\/0'};
 await assert.rejects(decode(),/Recalculate and save/);
 const mixed=XLSX.utils.book_new();
 XLSX.utils.book_append_sheet(mixed,XLSX.utils.aoa_to_sheet([['Account Name','Balance'],['Cash',100]]),'Accounts');
 XLSX.utils.book_append_sheet(mixed,XLSX.utils.aoa_to_sheet([['Portfolio amounts'],['Unrecognized fund layout',400]]),'Investments');
 const decoded=await decodeSpreadsheetWorkbookBytes(new Uint8Array(XLSX.write(mixed,{type:'buffer',bookType:'xlsx'})));
 assert.equal(parseImportText(decoded,'mixed.xlsx','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet').length,0,'Partial financial workbook must reach backup rather than silently discard a sheet');
 console.log('Workbook safety: 1904 dates, padded account numbers, formula cache/error and incomplete-sheet backup routing passed.');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
