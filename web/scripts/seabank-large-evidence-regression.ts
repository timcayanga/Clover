import assert from 'node:assert/strict';
import { parseHeldNativeSource, hasVerifiedHeldNativeRows } from '../lib/held-source-contracts';
import { SourceReviewRequiredError } from '../lib/import-source-review';

const movements = Array.from({ length: 200 }, (_, index) => {
  const outgoing = index % 2 === 0;
  return `SEABANK_ID_TXN | 07 JAN | ${outgoing ? 'outgoing' : 'incoming'} | 1 | ${outgoing ? '99' : '100'} | Invented recurring shop payment sequence ${index}`;
});

export const completeLargeSeaBankLedger = `REKENING KORAN
NO. REKENING SEABANK: 901000000123
cs@seabank.co.id
RINGKASAN REKENING
01 JAN 2026 sampai 31 JAN 2026
REKENING SALDO AWAL (IDR) TRANSAKSI KELUAR (IDR) TRANSAKSI MASUK (IDR) SALDO AKHIR (IDR)
TABUNGAN 100 100 100 100 TOTAL: 100
TABUNGAN - RINCIAN TRANSAKSI
TANGGAL TRANSAKSI KELUAR (IDR) MASUK (IDR) SALDO AKHIR (IDR)
halaman 1 dr 2
Ketentuan Umum
halaman 2 dr 2
SEABANK_ID_NATIVE_PAGES 2
SEABANK_ID_ROW_COUNT 100
${movements.slice(0, 100).join('\n')}
SEABANK_ID_ROW_COUNT 100
${movements.slice(100).join('\n')}`;

const parsed = parseHeldNativeSource(completeLargeSeaBankLedger);
assert(parsed);
assert.equal(parsed.rows.length, 200);
assert.equal(parsed.metadata.openingBalance, 100);
assert.equal(parsed.metadata.endingBalance, 100);
assert.equal(parsed.metadata.currency, 'IDR');
assert(hasVerifiedHeldNativeRows(completeLargeSeaBankLedger, parsed.rows));
assert.equal(parsed.rows[0].rawPayload?.sourceDocumentText, completeLargeSeaBankLedger);
assert(parsed.rows.slice(1).every(row => row.rawPayload?.sourceDocumentText === undefined && row.rawPayload?.sourceDocumentTextRowIndex === 1 && typeof row.rawPayload?.line === 'string'));
assert.deepEqual(parsed.rows.map(row => row.rawPayload?.physicalPage), [...Array(100).fill(1), ...Array(100).fill(2)]);
assert.equal(new Set(parsed.rows.map(row => row.rawPayload?.sourceRowIndex)).size, 200, 'Every repeated movement keeps a separate source occurrence');
const storedBytes = Buffer.byteLength(JSON.stringify(parsed.rows));
assert(storedBytes < completeLargeSeaBankLedger.length * 20, 'Native source text should not multiply with row count');
assert.throws(() => parseHeldNativeSource(completeLargeSeaBankLedger.replace('99 | Invented recurring shop payment sequence 0', '98 | Invented recurring shop payment sequence 0')), SourceReviewRequiredError);
assert.throws(() => parseHeldNativeSource(completeLargeSeaBankLedger.replace('SEABANK_ID_ROW_COUNT 100', 'SEABANK_ID_ROW_COUNT 99')), SourceReviewRequiredError);
console.log('Large SeaBank ledger: 200 occurrences, exact IDR balances, bounded full-source evidence and unsafe negatives passed.');
