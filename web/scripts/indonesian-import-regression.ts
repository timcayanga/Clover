import assert from "node:assert/strict";
import * as XLSX from "xlsx";
import { parseIndonesianAmount, parseIndonesianDate } from "../lib/indonesian-financial-text";
import { parseImportText, parseImportTextGenericOnly, parseAmountValue } from "../lib/import-parser";
import { detectCurrencyEvidence, normalizeGlobalCurrencyCode } from "../lib/financial-identity-detection";
import { parseReceiptText, assessReceiptPreviewQuality } from "../lib/split-bill";
import { assessFinancialUploadScope } from "../lib/financial-upload-scope";
import { decodeSpreadsheetWorkbookBytes } from "../lib/spreadsheet-import.server";
import { assertSafeImportEvidence } from "../lib/import-evidence-safety";
import { buildLayoutAwarePdfTextFromContentItems, pdfTextLayerLooksSufficientForParsing, shouldRetryImageOcrBestEffort } from "../lib/import-file-text.server";
import { resolveTransactionContext } from "../lib/context-corpus";
import { fingerprintImportSurface } from "../lib/import-parser-routing";
import { formatCurrencyAmount } from "../lib/currency-format";

// Original synthetic records, with no customer files or actual account identifiers.
for (const [text, expected] of [
  ["Rp125.000",125000], ["Rp1.250.000,50",1250000.5], ["Rp. 25.000,-",25000], ["125.000",125000],
  ["125000,5",125000.5], ["1,5 juta rupiah",1500000], ["-Rp25.000",-25000], ["(Rp25.000)",-25000],
  ["125.000 DB",-125000], ["125.000 CR",125000], ["IDR 1,250,000.50",1250000.5], ["125000.50",125000.5],
] as const) assert.equal(parseIndonesianAmount(text), expected, text);
for (const text of ["12.34.567", "1.250,00.00", "125,000", "Rp--25.000", "Rp25.000 USD", "25.000 10.000", "-25000 CR", "+25000 DB", "99999999999999999"])
  assert.equal(parseIndonesianAmount(text), null, text);
assert.equal(parseIndonesianAmount("42,96436", true), 42.96436);
assert.equal(parseAmountValue("Rp125.000"), 125000);
for (const value of ["Rp", "Rp.", "IDR", "Rupiah"]) assert.equal(normalizeGlobalCurrencyCode(value), "IDR");
assert.equal(detectCurrencyEvidence("Total Rp125.000").currency, "IDR");
assert.equal(detectCurrencyEvidence("ERP1000 reference").currency, null);
assert.equal(detectCurrencyEvidence("Mutasi (Rp)").currency, "IDR");
assert.equal(formatCurrencyAmount("1250000.50", "IDR", "id-ID"), "Rp1.250.000,50");
assert.equal(detectCurrencyEvidence("Mata uang: IDR\nMata uang: USD").ambiguous, true);
assert.equal(detectCurrencyEvidence("Mata uang pembayaran: IDR\nMata uang asli: USD").currency, "IDR");
for (const date of ["01/09/2026", "1 September 2026", "Selasa, 1 September 2026 00:15 WIB", "2026-09-01 23:59 WITA", "01.09.2026 12.30 WIT"]) {
  assert.equal(parseIndonesianDate(date)?.toISOString().slice(0,10), "2026-09-01", date);
}
for (const date of ["31 April 2026", "29 Februari 2025", "01/09", "01/09/26", "30 September 2026 25:00 WIB"]) assert.equal(parseIndonesianDate(date), null, date);
assert.equal(parseIndonesianDate("29 Februari 2024")?.toISOString().slice(0,10), "2024-02-29");

const preamble = "Nama bank;Bank Contoh\nNama rekening;Tabungan Uji\nNomor rekening;00001234\nMata uang;IDR";
const header = "Tanggal;Keterangan;Debet;Kredit;Saldo";
const data = ["01/09/2026;Warung Contoh;125.000,50;0;874.999,50", "02/09/2026;Gaji;0;2.500.000;3.374.999,50"];
const ledger = [preamble, header, ...data].join("\n");
const parse = (text: string) => parseImportText(text, "mutasi.csv", "text/csv");
const rows = parse(ledger);
assert.deepEqual(rows.map(row => row.amount), ["125000.50","2500000.00"]);
assert.deepEqual(rows.map(row => row.type), ["expense","income"]);
assert.deepEqual(rows.map(row => row.date), ["2026-09-01","2026-09-02"]);
assert.ok(rows.every(row => row.currency === "IDR" && row.accountNumber === "00001234"));
assert.deepEqual(rows.map(row => row.rawPayload?.balance), [874999.5,3374999.5]);
for (const bad of [data[1]!.replace("2.500.000", "??"), data[1]!.replace("02/09/2026", "31/04/2026"), data[1]!.replace("Gaji", ""), data[1]!.replace(";0;2.500.000", ";500;2.500.000")])
  assert.throws(() => parse([preamble,header,data[0],bad].join("\n")), /safely/);
assert.throws(() => parse("Nomor rekening;99999999\n" + ledger), /conflicting Indonesian/);
const statuses = parse("Mata uang;IDR\nTanggal;Keterangan;Nominal;Jenis transaksi;Status transaksi\n01/09/2026;Belanja;25.000;Pembayaran;Berhasil\n02/09/2026;Refund;25.000;;Refund selesai\n03/09/2026;Belanja lain;50.000;Pembayaran;Gagal\n04/09/2026;Belum bayar;10.000;Pembayaran;Menunggu");
assert.equal(statuses.length, 2);
assert.deepEqual(statuses.map(row => row.type), ["expense","income"]);
const unknownCurrency = parse("Tanggal;Keterangan;Debet\n01/09/2026;Warung Contoh;125.000")[0]!;
assert.equal(unknownCurrency.currency, null);
assert.equal(unknownCurrency.rawPayload?.reviewRequired, true);
const scaled = parse("Satuan;ribu rupiah\nTanggal;Keterangan;Debet\n01/09/2026;Warung Contoh;125,5")[0]!;
assert.equal(scaled.amount,"125500.00"); assert.equal(scaled.currency,"IDR");
assert.equal(parse([preamble,header,";SALDO AWAL;;;1.000.000",...data].join("\n")).length,2);
const snapshot = parse("Mata uang;IDR\nTanggal laporan;1 September 2026\nNama rekening;Saldo;Jenis rekening;Nomor rekening\nTabungan Uji;1.250.000,50;Tabungan;000123")[0]!;
assert.equal(snapshot.rawPayload?.kind, "account_snapshot_marker");
assert.equal(snapshot.rawPayload?.balance, 1250000.5);
assert.equal(snapshot.date, "2026-09-01");
assert.throws(() => parse("Nama rekening;Saldo\nTabungan;125.000"), /currency/);

const documentPreamble = ["Nama bank: Bank Contoh", "Nama rekening: Tabungan Uji", "Nomor rekening: 00001234", "Mata uang: IDR"];
const docHeader = "Tanggal  Keterangan  Debet  Kredit  Saldo";
const docRows = data.map(line => line.replace(/;/g,"  "));
const document = [...documentPreamble, docHeader, ...docRows].join("\n");
for (const parser of [parseImportText, parseImportTextGenericOnly]) {
  const result = parser(document,"mutasi.pdf","application/pdf");
  assert.deepEqual(result.map(row=>row.amount), ["125000.50","2500000.00"]);
  assert.equal(result[0]?.rawPayload?.sourceText, docRows[0]);
  assert.equal(result[0]?.rawPayload?.sourceLineNumber, 6);
  assert.ok(result.every(row => row.rawPayload?.reviewRequired));
  assert.doesNotThrow(()=>assertSafeImportEvidence(result, document));
  assert.equal(parser(document.replace(/ {2,}/g," "),"mutasi.pdf","application/pdf").length,0);
  assert.equal(parser(document.replace(docHeader, docHeader + " Cabang"),"mutasi.pdf","application/pdf").length,0);
}
assert.throws(()=>assertSafeImportEvidence([{amount:"3374999.50",confidence:100,rawPayload:{line:docRows[1]}}],document), /Nothing was added/);
assert.throws(()=>assertSafeImportEvidence([{amount:"2026",rawPayload:{sourceText:"1 September 2026 Warung Rp25.000",accountCurrency:"IDR"}}]), /Nothing was added/);
assert.doesNotThrow(()=>assertSafeImportEvidence([{amount:"2026",rawPayload:{sourceText:"1 September 2026 Warung Rp2.026",accountCurrency:"IDR"}}]));
const cellRows = [...documentPreamble.map(text=>[text]), docHeader.split(/ {2,}/), ...docRows.map(line=>line.split(/ {2,}/))];
const xs=[10,160,340,450,570];
const layout = buildLayoutAwarePdfTextFromContentItems(cellRows.flatMap((cells,row)=>cells.map((str,col)=>({str,transform:[1,0,0,1,xs[col]!,700-row*20],width:col===0?100:70,height:10}))));
assert.match(layout,/Warung Contoh\t125\.000,50/);
assert.equal(pdfTextLayerLooksSufficientForParsing(layout),true);
assert.equal(parseImportText(layout,"mutasi.pdf","application/pdf").length,2);
assert.equal(pdfTextLayerLooksSufficientForParsing(layout.replace("Warung", "\uFFFD")),false);

const receipt = "STRUK PEMBELIAN\nNama Toko: Warung Contoh\nTanggal: 30 September 2026 12:30 WIB\nNo Struk: 000123\nNama Barang  Qty  Harga  Jumlah\nNasi Goreng  2  25.000  50.000\nTeh Manis  1  10.000  10.000\nTotal: Rp60.000\nTunai: Rp100.000\nKembali: Rp40.000";
const preview = parseReceiptText(receipt);
assert.equal(preview.currency,"IDR"); assert.equal(preview.total,"60000.00"); assert.equal(preview.documentNumber,"000123");
assert.equal(preview.billDate,"2026-09-30"); assert.equal(preview.items.length,2); assert.equal(preview.requiresReview,false);
assert.equal(assessReceiptPreviewQuality(preview).reliableForFastPath,true);
assert.equal(parseReceiptText(receipt.replace("Nama Barang", "NamaBarang")).items.length,2);
const largerReceipt = receipt.replace(/\d{2,3}\.000/g, amount => (Number(amount.replace(".","")) * 10).toLocaleString("id-ID"));
assert.equal(assessReceiptPreviewQuality(parseReceiptText(largerReceipt)).reliableForFastPath,true);
assert.equal(fingerprintImportSurface({importMode:"statement",fileType:"image/png",imageImport:true,textPreview:receipt}).kind,"receipt_like");
assert.equal(shouldRetryImageOcrBestEffort({firstPassText:receipt.replace("Nama Barang", "Unreadable labels"),importMode:"receipt"}),true);
assert.equal(parseReceiptText(receipt+"\nBerlaku hingga: 31 Desember 2026\nTanggal cetak: 1 Oktober 2026").billDate,"2026-09-30");
for(const extra of ["\nTotal: Rp65.000","\nTanggal: 1 Oktober 2026","\nNo Struk: 009999"]) assert.equal(parseReceiptText(receipt+extra).requiresReview,true);
assert.equal(parseReceiptText(receipt+"\nStatus: Dibatalkan").total,null);
for (const status of ["Status: Refund selesai", "Status pembayaran: Pengembalian dana", "Status transaksi: Gagal", "Status pembayaran: Menunggu"])
  assert.equal(parseReceiptText(receipt+"\n"+status).total,null);
assert.equal(parseReceiptText(receipt.replace("Rp40.000","Rp30.000")).requiresReview,true);
assert.equal(parseReceiptText(receipt.replace("Total: Rp60.000","Total: 60.000").replace(/Rp/g,"")).currency,"MIXED");
const taxed = receipt.slice(0,receipt.indexOf("Total:")) + "Subtotal: Rp60.000\nPPN 10%: Rp6.000\nBiaya layanan: Rp3.000\nDiskon: Rp1.000\nPembulatan: Rp0\nTotal Bayar: Rp68.000\nMetode pembayaran: QRIS";
assert.equal(parseReceiptText(taxed).requiresReview,false); assert.equal(parseReceiptText(taxed).total,"68000.00");
assert.equal(parseReceiptText(taxed.replace("Rp6.000","Rp7.000")).requiresReview,true);
assert.equal(parseReceiptText(receipt + "\nPPN: Rp5.000\nSudah termasuk PPN").requiresReview,false);
assert.equal(assessFinancialUploadScope({text:receipt,fileName:"IMG_1234.jpg"}).decision,"financial");
assert.equal(assessFinancialUploadScope({text:"Kupon Diskon hingga Rp25.000 berlaku 31/12/2026",fileName:"gambar.jpg"}).decision,"non_financial");
assert.equal(shouldRetryImageOcrBestEffort({firstPassText:"Struk Pembelian\nTanggal 30 September 2026\nTotal Rp???",fileName:"IMG_1234.jpg"}),true);
assert.equal(resolveTransactionContext({description:"QRIS",currency:"IDR"}).transactionTypeHint,null);

const holdingRows=[ ["Sekuritas","Penyedia Uji"], ["Tanggal valuasi","30 September 2026"], ["Mata uang","IDR"],
  ["Nama reksa dana","Jumlah unit","Nilai investasi","Kode produk"], ["Reksa Dana Contoh","42,96436","1.250.000,50","000123"] ];
const holdingText=holdingRows.map(row=>row.join(";")).join("\n");
const holdings=parse(holdingText);
assert.equal(holdings.length,1); assert.equal(holdings[0]?.amount,"0.00"); assert.equal(holdings[0]?.rawPayload?.marketValue,1250000.5);
assert.equal(holdings[0]?.rawPayload?.quantity,42.96436); assert.equal(holdings[0]?.rawPayload?.assetSymbol,"000123");
assert.equal(holdings[0]?.date,"2026-09-30"); assert.equal(holdings[0]?.institution,"Penyedia Uji");
assert.throws(()=>parse(holdingText.replace("Tanggal valuasi;30 September 2026\n","")),/safely/);
assert.throws(()=>parse("Sekuritas;Penyedia Lain\n"+holdingText),/conflicting/);
assert.throws(()=>assertSafeImportEvidence([{amount:"1250000.50"}],holdingText),/Nothing was added/);

async function workbookChecks(){
  for(const bookType of ["xlsx","xls","xlsb","ods"] as const){
    const wb=XLSX.utils.book_new();
    const sheet=XLSX.utils.aoa_to_sheet([...holdingRows.slice(0,3),holdingRows[3]!, ["Reksa Dana Contoh",42.96436,1250000.5,123]]);
    sheet.D5.z="000000";
    XLSX.utils.book_append_sheet(wb,sheet,"Investasi");
    XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([["Mata uang","IDR"],["Tanggal","Keterangan","Debet"],[46266,"Belanja",125000.5]]),"Mutasi");
    const text=await decodeSpreadsheetWorkbookBytes(XLSX.write(wb,{type:"buffer",bookType}));
    const rows=parseImportText(text,`contoh.${bookType}`,"application/octet-stream");
    assert.equal(rows.length,2,bookType);
    const h=rows.find(row=>row.rawPayload?.kind==="account_snapshot_marker")!;
    assert.equal(h.rawPayload?.quantity,42.96436,`${bookType} numeric cells cannot be interpreted as thousands`);
    assert.equal(h.rawPayload?.marketValue,1250000.5); assert.equal(h.rawPayload?.assetSymbol,"000123");
    const t=rows.find(row=>row.rawPayload?.source==="structured_transaction_csv")!;
    assert.equal(t.amount,"125000.50"); assert.equal(t.currency,"IDR"); assert.match(t.date!,/^2026-/);
    assert.equal(t.rawPayload?.worksheetName,"Mutasi");
  }
  console.log("PASS Indonesian imports: Rupiah evidence/amounts, calendar dates, bank columns, receipts/tax/change, safe fallback, QRIS context, investment metadata and XLSX/XLS/XLSB/ODS byte routing.");
}
workbookChecks().catch(error=>{console.error(error);process.exitCode=1;});
