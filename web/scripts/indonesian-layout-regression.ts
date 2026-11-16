import assert from "node:assert/strict";
import * as XLSX from "xlsx";
import { parseImportText, parseImportTextGenericOnly } from "../lib/import-parser";
import { buildLayoutAwarePdfTextFromContentItems, pdfTextLayerLooksSufficientForParsing } from "../lib/import-file-text.server";
import { decodeSpreadsheetWorkbookBytes } from "../lib/spreadsheet-import.server";

// Synthetic records only. Test financial evidence, not real customer accounts.
const csv = (text:string) => parseImportText(text,"mutasi.csv","text/csv");
const period = "Mata uang;IDR\nPeriode;September 2026\nTanggal;Keterangan;Debet;Kredit;Saldo\n29/09;Warung;25000;0;975000\n30/09;Gaji;0;1000000;1975000";
const periodRows = csv(period);
assert.deepEqual(periodRows.map(r=>r.date),["2026-09-29","2026-09-30"]);
assert.equal(periodRows[0]?.rawPayload?.dateFromPeriod,true);
assert.equal(periodRows[0]?.rawPayload?.sourceDateText,"29/09");
assert.equal((periodRows[0]?.rawPayload?.sourceCells as string[])[0],"29/09");
for (const text of [period.replace("September 2026","Februari 2026"),period.replace("September 2026","30 Februari 2026 - 31 Maret 2026"),
  period.replace("29/09","31/09"),period.replace("29/09","2026-10-01"),period.replace("Periode;September 2026\n",""),
  period.replace("Periode;September 2026","Periode;September 2026\nPeriode;Oktober 2026")]) assert.throws(()=>csv(text),/Nothing was added/);
assert.deepEqual(csv(period+"\nPeriode;Oktober 2026\n01/10;Warung;25000;0;1950000").map(r=>r.date),["2026-09-29","2026-09-30","2026-10-01"]);
const wrappedCsv = period.replace("\n30/09;Gaji", "\n;Cabang Jakarta;;;\n;Lantai dua;;;\n30/09;Gaji");
const wrappedCsvRow = csv(wrappedCsv)[0]!;
assert.equal(wrappedCsvRow.description,"Warung Cabang Jakarta Lantai dua");
assert.equal((wrappedCsvRow.rawPayload?.continuationSourceRows as unknown[]).length,2);
assert.throws(()=>csv(wrappedCsv.replace(";Cabang Jakarta;;;","31/09;Cabang Jakarta;;;")),/Nothing was added/);

const conflicting = [
  "Tanggal;Keterangan;Nominal;Jenis transaksi\n30/09/2026;Warung;-25000;Pemasukan",
  "Tanggal;Keterangan;Debet;Nominal\n30/09/2026;Warung;25000;50000",
  "Tanggal;Keterangan;Kredit\n30/09/2026;Koreksi;-25000",
  "Tanggal;Keterangan;Debet;Jenis transaksi\n30/09/2026;Warung;25000;Pemasukan",
  "Tanggal;Keterangan;Nominal;Jenis transaksi\n30/09/2026;Warung;25000 CR;Pembayaran",
  "Tanggal;Keterangan;Debet\n30/09/2026;Warung;25000 CR",
  "Tanggal;Keterangan;Nominal;Jenis transaksi\n30/09/2026;Warung;Rp+25000;Pembayaran",
];
for (const text of conflicting) {
  const row=csv("Mata uang;IDR\n"+text)[0]!;
  assert.equal(row.rawPayload?.directionConflict,true);
  assert.equal(row.rawPayload?.reviewRequired,true);
  assert.ok(row.confidence! < 70);
}
assert.equal(csv("Mata uang;IDR\nTanggal;Keterangan;Debet;Nominal\n30/09/2026;Warung;25000;25000")[0]?.rawPayload?.reviewRequired,undefined);
assert.throws(()=>csv("Mata uang;IDR\nTanggal;Keterangan;Nominal;Jumlah transaksi\n30/09/2026;Warung;25000;50000"),/duplicate Indonesian financial columns/);

const reordered = "Nama bank: Bank Contoh\nNomor rekening: 00001234\nMata uang: IDR\nPeriode: September 2026\nKeterangan\tTanggal\tCabang\tJumlah\tSaldo\nWarung\t29/09\t0007\t25.000 DB\t975.000\nCabang Jakarta\t\t\t\t\nGaji\t30/09\t0007\t1.000.000 CR\t1.975.000";
for (const parser of [parseImportText,parseImportTextGenericOnly]) {
  const rows=parser(reordered,"mutasi.pdf","application/pdf");
  assert.deepEqual(rows.map(r=>[r.amount,r.type]),[["25000.00","expense"],["1000000.00","income"]]);
  assert.equal(rows[0]?.description,"Warung Cabang Jakarta");
  assert.equal(rows[0]?.accountNumber,"00001234");
  assert.equal((rows[0]?.rawPayload?.continuationLines as unknown[]).length,1);
  assert.match(String(rows[0]?.rawPayload?.sourceText),/Cabang Jakarta/);
  assert.equal((rows[0]?.rawPayload?.originalHeaders as string[])[2],"Cabang");
  for(const unsafe of [reordered.replace("Cabang Jakarta\t\t\t\t","Cabang Jakarta"),
    reordered.replace("Cabang Jakarta\t\t\t\t","Cabang Jakarta\t\t\t25000\t"),
    reordered.replace("Gaji\t30/09","Gaji\t31/09"),
    reordered.replace("Gaji\t30/09", "Tanggal\tKeterangan\tCabang\tJumlah\tSaldo\nGaji\t30/09")])
    assert.equal(parser(unsafe,"mutasi.pdf","application/pdf").length,0);
}

const textItem=(str:string,x:number,y:number,width=str.length*5)=>({str,transform:[1,0,0,1,x,y],width,height:10});
const items=[textItem("Mata uang: IDR",20,800),textItem("Periode: September 2026",20,780),
  ...["Tanggal","Keterangan","Debet","Kredit","Saldo"].map((s,i)=>textItem(s,[20,120,420,540,660][i]!,740)),
  textItem("29/09",20,720),textItem("Warung",120,720),textItem("25.000",420,720),textItem("975.000",660,720),
  textItem("Cabang Jakarta",120,704),
  textItem("30/09",20,680),textItem("Gaji",120,680),textItem("1.000.000",540,680),textItem("1.975.000",660,680),
  textItem("30/09",20,660),textItem("Biaya admin",120,660),textItem("1.000",420,660)];
const positioned=buildLayoutAwarePdfTextFromContentItems(items);
assert.match(positioned,/29\/09\|Warung\|25\.000\|\|975\.000/);
assert.match(positioned,/\|Cabang Jakarta\|\|\|/);
assert.equal(pdfTextLayerLooksSufficientForParsing(positioned),true);
const positionedRows=parseImportText(positioned.trim(),"mutasi.pdf","application/pdf");
assert.deepEqual(positionedRows.map(r=>[r.amount,r.type]),[["25000.00","expense"],["1000000.00","income"],["1000.00","expense"]]);
assert.equal(positionedRows[2]?.rawPayload?.balance,null,"An empty final balance must stay empty");
assert.equal(positionedRows[0]?.description,"Warung Cabang Jakarta");

async function workbook() {
  const book=XLSX.utils.book_new();
  for(const [sheet,month,date] of [["September","September 2026","30/09"],["October","Oktober 2026","01/10"]]) {
    XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet([["Mata uang","IDR"],["Periode",month],
      ["Tanggal","Keterangan","Debet","Nomor rekening"],[date,"Warung",25000,"00001234"]]),sheet);
  }
  for (const bookType of ["xlsx","xls","xlsb","ods"] as const) {
    const text=await decodeSpreadsheetWorkbookBytes(XLSX.write(book,{bookType,type:"buffer"}));
    const rows=parseImportText(text,`mutasi.${bookType}`,"application/octet-stream");
    assert.deepEqual(rows.map(r=>r.date),["2026-09-30","2026-10-01"]);
    assert.ok(rows.every(r=>r.accountNumber==="00001234"&&r.currency==="IDR"&&r.rawPayload?.dateFromPeriod===true));
  }
  console.log("PASS Indonesian layouts: scoped statement periods, conflicting directions/amounts, duplicate columns, reordered bank columns, branch IDs, wrapped descriptions, positioned PDF empty cells and four workbook formats.");
}
workbook().catch(error=>{console.error(error);process.exitCode=1;});
