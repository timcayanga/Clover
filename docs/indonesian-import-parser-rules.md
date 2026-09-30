# Indonesian financial imports

## Scope and evidence

These rules cover Bahasa Indonesia financial text and Rupiah (IDR) on new imports. Language, institution country and a user's default currency do not prove the document's currency. Preserve confirmed data and keep original files, source cells/lines, headers, row indexes and report metadata separate from normalized values.

- Recognize `Rp`, `Rp.`, `IDR` and `rupiah`. Indonesian dot grouping and comma decimals mean `Rp125.000` is 125000 IDR and `Rp1.250.000,50` is 1250000.50 IDR. Do not divide by 100.
- Support explicit ribu/rb, juta/jt, miliar and triliun multipliers, including labeled report/column units. Do not apply the multiplier twice to an explicitly denominated cell.
- Bare `125,000` in a money cell is ambiguous and must not silently become 125 or 125000. Reject malformed grouping, contradictory signs and unrelated numeric tokens. Explicit international decimal notation remains supported.
- Quantities can have more fractional digits than money. Native Excel numbers must survive locale serialization, especially `42.96436` fund units. Account numbers, security codes and receipt IDs are strings, including leading zeros.
- Parse day/month/year, ISO dates and Indonesian month names. Validate actual calendar dates and WIB/WITA/WIT clock suffixes, preserving the printed calendar day. Never invent a missing year.

## Bank and account tables

- Reuse the structured ledger parser with Tanggal/Tgl, Keterangan/Uraian/Deskripsi, Nominal/Mutasi, Debet/Kredit, Saldo, Mata Uang and account metadata aliases. Prefer recognizable headers when selecting a CSV delimiter; decimal commas and two-column report metadata must not displace the actual table delimiter.
- Debet/DB is outgoing, Kredit/CR incoming. Keep running balances separate from movements and reconcile them. Unsigned amounts without direction, currency conflicts and reconciliation differences require review. Completed refunds are incoming; pending, failed and cancelled rows are not completed purchases.
- Preserve original/foreign amount and currency separately from settlement values. Never identify the purchase merchant or an internal transfer solely from QRIS or BI-FAST.
- Only parse bank PDFs/OCR locally when the labeled column boundaries are intact. Require explicit currency. Repeated identical headers are allowed; reordered, additional, incomplete or collapsed columns go to backup/review. Never select the final number as spending or an account identifier as an amount.
- Preserve original PDF line text and line number. These document-derived rows require review even when the columns reconcile.
- Account balances are snapshots, not transactions. Conflicting report metadata, multiple currencies under one account identity and contradictory balances for the same date fail before persistence. A missing snapshot date is explicitly marked for review, rather than silently treated as a source date.

## Receipts and images

- Recognize struk/kuitansi/kwitansi, merchant/date/receipt-number labels, and explicit item tables. Known joined OCR header words such as NamaBarang can be normalized; do not repair arbitrary monetary digits.
- Keep Total Bayar/Jumlah Bayar separate from Tunai/Uang Diterima and Kembali/Kembalian. The amount tendered and change are not spending.
- Reconcile item quantity, unit price, subtotal, printed PPN/Pajak, service charges, discounts and rounding. Do not assume a tax rate or add included tax twice.
- Conflicting totals, identities or dates, incomplete item rows, invalid arithmetic, missing currency and cancellation/refund evidence prevent the reliable local path. Expiry/reprint labels are not purchase dates.
- Use bounded English/Indonesian OCR retries when the first pass identifies Indonesian financial text and is weak. Preserve the consent-gated visual backup when OCR remains incomplete. OCR support is not a guarantee of accurate photos.
- Grouped prices count as single numbers in receipt-quality checks. Ordinary IDR amounts must not be rejected by a threshold calibrated to smaller nominal currency values.

## Investments and workbook coverage

- Nama Reksa Dana/Nama Saham/Nama Produk plus Nilai Investasi/Nilai Pasar are holdings snapshots, never expenses. Require the provider, valuation date and currency, either in columns or explicit report metadata.
- Preserve Jumlah Unit/Unit Penyertaan separately from monetary value, account numbers and product codes. A scheduled monthly contribution is not proof of a purchase or cost basis. Conflicting metadata or repeated unresolved holding identities fail safely.
- Support labeled XLSX, XLS, XLSB and ODS tables through the existing workbook reader. Preserve worksheet names, real date serials and padded IDs; fail on unreadable financial sheets instead of claiming partial success. Existing XLSM handling remains in the shared reader.
- Keep confidence/review reasons with extracted values. Backup outputs are suggestions; durable merchant learning still requires user confirmation. No migrations, new environment variables or confirmed-record rewrites are part of this change.

## Verification and limits

`npm --prefix web run qa:indonesian-import` covers amounts, dates, currency conflicts, CSV ledgers, balances, PDF column extraction, receipts, cancellation, QRIS, investment metadata and actual XLSX/XLS/XLSB/ODS bytes. It runs in the standard release/pre-push gate and CI. Existing Korean, structured-import, financial-identity, arbitration and confirmed-data checks remain required.

On 1 October 2026, original synthetic bank/receipt PDFs were rendered and visually inspected. The normal file reader preserved all three bank rows, their IDR amounts and account `00001234`; local OCR of the receipt PNG recovered total 60000 IDR, two items, receipt `000123` and date 2026-09-30. These samples contain no customer data and were not sent to external AI. They do not establish coverage of every Indonesian bank, e-wallet, handwritten receipt or brokerage format.

## Primary references

- Indonesian language authority, EYD punctuation: https://ejaan.kemendikdasmen.go.id/eyd/penggunaan-tanda-baca/tanda-titik/
- EYD numbers and monetary notation: https://ejaan.kemendikdasmen.go.id/eyd/penulisan-kata/angka-dan-bilangan/
- Bank Indonesia QRIS, including different transaction uses: https://www.bi.go.id/id/fungsi-utama/sistem-pembayaran/ritel/kanal-layanan/qris/default.aspx
- BCA myBCA Bisnis guide (column terminology only, not a customer fixture or claim of complete BCA support): https://www.bca.co.id/-/media/Files/Bisnis/Layanan/e-banking/myBCA-Bisnis/20250901-buku-panduan-mybca-bisnis
