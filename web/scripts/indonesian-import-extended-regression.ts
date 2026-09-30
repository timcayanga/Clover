import assert from "node:assert/strict";
import * as XLSX from "xlsx";
import { readIndonesianMoney } from "../lib/indonesian-money";
import { parseImportText, parseImportTextGenericOnly } from "../lib/import-parser";
import { parseIndonesianPaymentProof } from "../lib/indonesian-payment-proof";
import { parseReceiptText, assessReceiptPreviewQuality } from "../lib/split-bill";
import { assertSafeImportEvidence } from "../lib/import-evidence-safety";
import { decodeSpreadsheetWorkbookBytes } from "../lib/spreadsheet-import.server";
import { readIndonesianStatementPeriod, resolveIndonesianStatementDate } from "../lib/indonesian-statement-period";
import { pdfTextLayerLooksSufficientForParsing, mergeCompatibleStatementTextCandidates, mergeCompatibleStatementTextCandidateConsensus } from "../lib/import-file-text.server";

// Original synthetic records, never customer data or real account identifiers.
for (const [text,value,code] of [["USD 25.00",25,"USD"],["USD25,50",25.5,"USD"],["25,50 EUR",25.5,"EUR"],
  ["(USD 25.00)",-25,"USD"],["-SGD 1.250,50",-1250.5,"SGD"],["Rp25.000",25000,"IDR"],["25.000",25000,null]] as const)
  assert.deepEqual(readIndonesianMoney(text),{amount:value,currency:code});
for (const text of ["USD 25 EUR","Rp25.000 USD","XXX 25.00","USD25,000","USD25.00 extra","USD --25.00"]) assert.equal(readIndonesianMoney(text).amount,null,text);
const parse = (text:string) => parseImportText(text,"mutasi.csv","text/csv");
const foreign = "Mata uang;IDR\nTanggal;Keterangan;Debet;Nominal asli;Mata uang asli;Biaya admin;Saldo\n30/09/2026;Toko Luar Negeri;400.000;USD25.00;USD;Rp1.000;Rp599.000";
const row=parse(foreign)[0]!;
assert.equal(row.amount,"400000.00");assert.equal(row.currency,"IDR");
assert.equal(row.rawPayload?.originalAmount,25);assert.equal(row.rawPayload?.originalCurrency,"USD");
assert.equal(row.rawPayload?.fee,1000);assert.equal(row.rawPayload?.balance,599000);
assert.equal(row.rawPayload?.reviewRequired,undefined);
for (const broken of [foreign.replace("USD25.00","??"),foreign.replace("Rp1.000","??"),foreign.replace("Rp599.000","??")]) assert.throws(()=>parse(broken),/safely/);
assert.equal(parse(foreign.replace("USD25.00","EUR25.00"))[0]?.rawPayload?.reviewRequired,true);
assert.equal(parse(foreign.replace("Rp1.000","USD 1.00"))[0]?.rawPayload?.reviewRequired,true);
assert.equal(parse(foreign.replace("400.000","USD400.00"))[0]?.rawPayload?.reviewRequired,true);
assert.equal(parse(foreign.replace("Mata uang;IDR\n", "").replace("400.000","USD400.00"))[0]?.currency,"USD");
const statusHeader="Mata uang;IDR\nTanggal;Keterangan;Nominal;Jenis transaksi;Status transaksi\n30/09/2026;Belanja;25000;Pembayaran;";
for (const status of ["Belum dibayar","Belum lunas","Menunggu pembayaran","Gagal","Kadaluarsa"]) assert.equal(parse(statusHeader+status).length,0,status);
assert.equal(parse(statusHeader+"Selesai")[0]?.rawPayload?.reviewRequired,true);
assert.equal(parse(statusHeader+"Berhasil")[0]?.rawPayload?.reviewRequired,undefined);
for (const status of ["Refund berhasil", "Pengembalian dana berhasil"]) {
  assert.equal(parse(statusHeader.replace(";Pembayaran;",";;")+status)[0]?.type,"income");
  assert.equal(parse(statusHeader+status)[0]?.rawPayload?.reviewRequired,true,"A refund cannot silently remain an expense");
}

const proof=["BUKTI PEMBAYARAN","Nama dompet: Dompet Uji","Status: Pembayaran berhasil","Tanggal: 30 September 2026 12:30 WIB",
  "Nama merchant: Warung Contoh","Nominal: Rp25.000","Biaya admin: Rp1.000","Total pembayaran: Rp26.000","Saldo akhir: Rp174.000","ID transaksi: 00001234"].join("\n");
for (const parser of [parseImportText,parseImportTextGenericOnly]) {
  const rows=parser(proof,"IMG_1234.png","image/png");assert.equal(rows.length,1);
  const r=rows[0]!; assert.equal(r.amount,"26000.00");assert.equal(r.type,"expense");assert.equal(r.currency,"IDR");
  assert.equal(r.date,"2026-09-30");assert.equal(r.accountName,"Dompet Uji");assert.equal(r.merchantRaw,"Warung Contoh");
  assert.equal(r.rawPayload?.reference,"00001234");assert.equal(r.rawPayload?.reportedBalance,174000);
  assert.equal(r.rawPayload?.balance,undefined,"A payment screenshot cannot overwrite an account balance");
  assert.equal(r.rawPayload?.reviewRequired,true);assert.equal(r.rawPayload?.fee,1000);
  assert.doesNotThrow(()=>assertSafeImportEvidence(rows,proof));
  for(const changed of [proof.replace("Pembayaran berhasil","Gagal"),proof.replace("Pembayaran berhasil","Selesai"),proof.replace("Rp26.000","Rp27.000"),
    proof.replace("Rp1.000","USD 1.00"),proof.replace("30 September 2026","31 September 2026"),proof.replace("ID transaksi: 00001234",""),
    proof+"\nTotal pembayaran: Rp1.000",proof+"\nMata uang: USD",proof+"\nBiaya tambahan: Rp2.000",proof+"\n"+proof,
    proof.replace("BUKTI PEMBAYARAN","DETAIL TRANSAKSI").replace("Pembayaran berhasil","Berhasil"),proof+"\nJenis transaksi: Transfer keluar"])
    assert.equal(parser(changed,"IMG_1234.png","image/png").length,0,changed);
}
assert.equal(parseIndonesianPaymentProof(proof.replaceAll(": ","\n"))?.[0]?.amount,"26000.00");
assert.equal(pdfTextLayerLooksSufficientForParsing(proof),true);
assert.equal(pdfTextLayerLooksSufficientForParsing(proof.replace("Rp26.000","Rp27.000")),false);
assert.equal(pdfTextLayerLooksSufficientForParsing(proof.replace("Warung", "\uFFFDWarung")),false);
const proofCandidates=[{text:proof,label:"native",score:20},{text:proof,label:"ocr",score:20}];
assert.equal(mergeCompatibleStatementTextCandidates(proofCandidates[0]!,proofCandidates[1]!),null);
assert.equal(mergeCompatibleStatementTextCandidateConsensus(proofCandidates),null);
const refund=proof.replace("BUKTI PEMBAYARAN","BUKTI PENGEMBALIAN DANA").replace("Pembayaran berhasil","Pengembalian dana berhasil")
  .replace("Biaya admin: Rp1.000\n","").replace("Total pembayaran: Rp26.000","Total pengembalian dana: Rp25.000");
assert.equal(parseIndonesianPaymentProof(refund)?.[0]?.type,"income");
assert.deepEqual(parseIndonesianPaymentProof(refund+"\nJenis transaksi: Pembayaran"),[]);
assert.deepEqual(parseIndonesianPaymentProof(proof+"\nTanggal: 30 September 2026 13:30 WIB"),[]);
assert.equal(parseReceiptText(refund).total,null,"A refund cannot take the purchase receipt shortcut");
assert.equal(assessReceiptPreviewQuality(parseReceiptText(proof)).reliableForFastPath,false);
assert.throws(()=>assertSafeImportEvidence([{amount:"174000",confidence:100,rawPayload:{line:"Saldo akhir: Rp174.000"}}],proof),/Nothing was added/);

const table = "Nama bank: Bank Contoh\nNomor rekening: 00001234\nMata uang: IDR\nPeriode: September 2026\nTanggal  Keterangan  Debet  Kredit  Saldo\n29/09  Warung Contoh  25.000  0  975.000\n30/09  Gaji  0  1.000.000  1.975.000";
const bank=parseImportText(table,"mutasi.pdf","application/pdf");
assert.deepEqual(bank.map(r=>r.date),["2026-09-29","2026-09-30"]);
assert.equal(bank[0]?.rawPayload?.sourceDateText,"29/09");assert.equal(bank[0]?.rawPayload?.dateFromPeriod,true);
assert.equal((bank[0]?.rawPayload?.statementPeriod as {sourceText:string}).sourceText,"Periode: September 2026");
assert.match(String(bank[0]?.rawPayload?.sourceText),/^29\/09/);
for (const changed of [table.replace("Periode: September 2026\n",""),table.replace("September 2026","Februari 2026"),
  table.replace("29/09","31/09"),table+"\nPeriode: Oktober 2026",table.replace("29/09","29/09/25"),table.replace("29/09","2026-08-29")])
  assert.equal(parseImportText(changed,"mutasi.pdf","application/pdf").length,0);
const crossing=readIndonesianStatementPeriod(["Periode: 15 Desember 2025 s/d 15 Januari 2026"]).period;
assert.equal(resolveIndonesianStatementDate("31/12",crossing)?.date,"2025-12-31");
assert.equal(resolveIndonesianStatementDate("01/01",crossing)?.date,"2026-01-01");
assert.equal(resolveIndonesianStatementDate("01/01",readIndonesianStatementPeriod(["Periode: 1 Januari 2025 sampai 2 Januari 2026"]).period),null);
assert.equal(readIndonesianStatementPeriod(["Periode: 09/2026"]).period?.end,"2026-09-30");
assert.equal(readIndonesianStatementPeriod(["Periode: 31 Februari 2026 - 31 Maret 2026"]).invalid,true);

async function workbook() {
  const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([["Sekuritas","Penyedia Uji"],["Tanggal valuasi","30 September 2026"],
    ["Nama produk","Nilai pasar","Mata uang","Jumlah unit"],["Dana Rupiah",1250000.5,"IDR",42.96436],["Dana Dolar","USD 125.50","USD",0.125]]),"Investasi");
  const text=await decodeSpreadsheetWorkbookBytes(XLSX.write(wb,{bookType:"xlsx",type:"buffer"}));
  const rows=parseImportText(text,"investasi.xlsx","application/octet-stream");
  assert.deepEqual(rows.map(r=>r.currency),["IDR","USD"]);assert.deepEqual(rows.map(r=>r.rawPayload?.marketValue),[1250000.5,125.5]);
  assert.deepEqual(rows.map(r=>r.rawPayload?.quantity),[42.96436,0.125]);
  assert.ok(rows.every(r=>r.rawPayload?.kind==="account_snapshot_marker"));
  const compact="Sekuritas;Penyedia Uji\nTanggal valuasi;30 September 2026\nNama produk;Nilai pasar;Mata uang\nDana Dolar;USD125.50;USD";
  assert.equal(parse(compact)[0]?.rawPayload?.marketValue,125.5);
  assert.throws(()=>parse(compact.replace("USD125.50;USD","USD125.50;IDR")),/safely/);
  console.log("PASS Indonesian extended imports: payment/refund proofs, failed/ambiguous statuses, foreign amounts and units, explicit-period dates, source evidence and mixed-currency XLSX holdings.");
}
workbook().catch(e=>{console.error(e);process.exitCode=1;});
