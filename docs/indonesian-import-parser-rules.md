# Indonesian financial imports

Structured JSON exports also follow `docs/financial-exchange-parser-rules.md`. The regional adapter distinguishes JSON numbers from localized Rupiah strings, preserves printed dates and source account identities, and reuses ledger direction/status/review checks. Unreadable populated records reject the entire export. `qa:bank-export-corpus` adds original synthetic Indonesian/Korean export and encoded-file cases. Native SNAP envelopes remain unsupported; this does not add bank connections.

## Scope and evidence

These rules cover Bahasa Indonesia financial text and Rupiah (IDR) on new imports. Language, institution country and a user's default currency do not prove the document's currency. Preserve confirmed data and keep original files, source cells/lines, headers, row indexes and report metadata separate from normalized values.

- Recognize `Rp`, `Rp.`, `IDR` and `rupiah`. Indonesian dot grouping and comma decimals mean `Rp125.000` is 125000 IDR and `Rp1.250.000,50` is 1250000.50 IDR. Do not divide by 100.
- Support explicit ribu/rb, juta/jt, miliar and triliun multipliers, including labeled report/column units. Do not apply the multiplier twice to an explicitly denominated cell.
- Bare `125,000` in a money cell is ambiguous and must not silently become 125 or 125000. Reject malformed grouping, contradictory signs and unrelated numeric tokens. Explicit international decimal notation remains supported.
- Quantities can have more fractional digits than money. Native Excel numbers must survive locale serialization, especially `42.96436` fund units. Account numbers, security codes and receipt IDs are strings, including leading zeros.
- Parse day/month/year, ISO dates and Indonesian month names. Validate actual calendar dates and WIB/WITA/WIT clock suffixes, preserving the printed calendar day. Never invent a missing year.
- Preserve explicitly prefixed/suffixed foreign ISO amounts (`USD25.00`, `25,50 EUR`) independently of IDR settlement amounts. Do not infer conversion rates or scale foreign amounts using a Rupiah report unit. Reject malformed populated fees, balances and original amounts instead of silently dropping them; currency disagreements require review.

## Bank and account tables

- Reuse the structured ledger parser with Tanggal/Tgl, Keterangan/Uraian/Deskripsi, Nominal/Mutasi, Debet/Kredit, Saldo, Mata Uang and account metadata aliases. Prefer recognizable headers when selecting a CSV delimiter; decimal commas and two-column report metadata must not displace the actual table delimiter.
- Debet/DB is outgoing, Kredit/CR incoming. Keep running balances separate from movements and reconcile them. Unsigned amounts without direction, currency conflicts and reconciliation differences require review. Completed refunds are incoming; pending, failed and cancelled rows are not completed purchases.
- Preserve original/foreign amount and currency separately from settlement values. Never identify the purchase merchant or an internal transfer solely from QRIS or BI-FAST.
- Only parse bank PDFs/OCR locally when the labeled column boundaries are intact. Require explicit currency. Known columns may be reordered; repeated page headers must retain the same order. Unknown, additional, incomplete or collapsed columns go to backup/review. Never select the final number as spending or an account identifier as an amount.
- Preserve original PDF line text and line number. These document-derived rows require review even when the columns reconcile.
- Resolve `29/09` only from a printed `Periode` month/year or full date range with exactly one matching calendar date. This applies to bank PDF/OCR tables and Indonesian CSV/Excel ledgers. Keep the period scoped to its worksheet or explicit table section, preserving source cells, original date and period evidence. Reject conflicting periods, dates outside the period, ambiguous years and invalid calendar days. Unlabeled CSV dates still cannot borrow the current year.
- Preserve blank PDF cells using printed header coordinates only when the placement is unambiguous. Empty debit, credit and balance columns are not zero-valued transactions. A clearly aligned description-only continuation belongs to the preceding row; retain its text and line number. Unaligned or monetary continuation lines require fallback/review.
- Consecutive description-only continuation rows in Indonesian CSV ledgers retain every line and its source index. A nonempty invalid date must not be hidden as a continuation.
- `Cabang`, `CBG` and `Kode Cabang` are branch identifiers, not amounts or account numbers. `Jumlah` is an amount only within the bank-table adapter. Retain original headers and cells even when normalizing them for the shared ledger parser.
- Contradictory amount signs, transaction types, debit/credit evidence and differing populated amount columns require review with reduced confidence. Duplicate canonical financial columns fail safely instead of silently choosing the first one. These checks do not rewrite confirmed transactions.
- `Belum dibayar`, `Belum lunas` and `Menunggu pembayaran` are unpaid, not posted spending. A generic `Selesai`/Completed history label requires review because some wallets place expired and refunded records there. Explicit successful refunds are incoming; conflicting debit/type evidence requires review.
- Account balances are snapshots, not transactions. Conflicting report metadata, multiple currencies under one account identity and contradictory balances for the same date fail before persistence. A missing snapshot date is explicitly marked for review, rather than silently treated as a source date.

## Receipts and images

- Recognize struk/kuitansi/kwitansi, merchant/date/receipt-number labels, and explicit item tables. Known joined OCR header words such as NamaBarang can be normalized; do not repair arbitrary monetary digits.
- Keep Total Bayar/Jumlah Bayar separate from Tunai/Uang Diterima and Kembali/Kembalian. The amount tendered and change are not spending.
- Reconcile item quantity, unit price, subtotal, printed PPN/Pajak, service charges, discounts and rounding. Do not assume a tax rate or add included tax twice.
- Conflicting totals, identities or dates, incomplete item rows, invalid arithmetic, missing currency and cancellation/refund evidence prevent the reliable local path. Expiry/reprint labels are not purchase dates.
- Use bounded English/Indonesian OCR retries when the first pass identifies Indonesian financial text and is weak. Preserve the consent-gated visual backup when OCR remains incomplete. OCR support is not a guarantee of accurate photos.
- Grouped prices count as single numbers in receipt-quality checks. Ordinary IDR amounts must not be rejected by a threshold calibrated to smaller nominal currency values.

## Labeled payment and refund proofs

- Recognize a single `Bukti Pembayaran`, `Bukti Transaksi`, `Detail Transaksi`, `Rincian Transaksi` or `Bukti Pengembalian Dana` with labeled final status. This is a generic layout adapter, not a claim of complete support for a particular e-wallet.
- Require a valid date, merchant, transaction/reference ID, explicit currency, completed payment/refund status and a positive paid/refunded total. Read inline labels and separate label/value lines. Preserve every label/value line and its position.
- Emit one reviewable movement. Principal plus admin fee minus discount must match the paid total when printed. Do not create extra transactions for principal, fees, reference numbers, dates or balances. Do not infer a merchant/category or own-account transfer from the payment network.
- A reported remaining balance stays in `reportedBalance`, never the account-balance field. No account balance or confirmed record is rewritten by this parser.
- Reject conflicting duplicate fields, contradictory direction/currency, unknown labeled Rupiah charges, unsupported transfer proofs and multiple proofs combined into one image. The consent-gated backup/review path remains available. Failed/unpaid proofs do not become completed purchases.
- Payment/refund proofs cannot use the ordinary purchase-receipt shortcut. Unsupported generic line/last-number rows are blocked before persistence unless the parser has document/field evidence.
- Keep complete payment-proof OCR candidates intact; do not apply bank-row stitching or cross-candidate line merging to their labeled fields. Complete validated PDF proofs can use native text directly; incomplete or conflicting proofs still require fallback/review.

## Investments and workbook coverage

- Nama Reksa Dana/Nama Saham/Nama Produk plus Nilai Investasi/Nilai Pasar are holdings snapshots, never expenses. Require the provider, valuation date and currency, either in columns or explicit report metadata.
- Preserve Jumlah Unit/Unit Penyertaan separately from monetary value, account numbers and product codes. A scheduled monthly contribution is not proof of a purchase or cost basis. Conflicting metadata or repeated unresolved holding identities fail safely.
- Support labeled XLSX, XLS, XLSB and ODS tables through the existing workbook reader. Preserve worksheet names, real date serials and padded IDs; fail on unreadable financial sheets instead of claiming partial success. Existing XLSM handling remains in the shared reader.
- Keep confidence/review reasons with extracted values. Backup outputs are suggestions; durable merchant learning still requires user confirmation. No migrations, new environment variables or confirmed-record rewrites are part of this change.

## Merchant enrichment and category review

- Recognize specific Indonesian service and merchant evidence before person-name heuristics. Short descriptors such as `GoFood Indonesia`, `Ruangguru Indonesia` and `Gaji September` must not become transfers just because they resemble names.
- Suggest food delivery, groceries, transport/fuel, education, healthcare, utilities and shopping using bounded provider names and explicit Bahasa phrases. Keep these suggestions below confirmed confidence. Vocabulary does not infer currency, country or account ownership.
- Preserve GoFood/ShopeeFood, GoRide/GoCar and GoPay/ShopeePay as different services. Keep named submerchants and branches in the label and preserve original source descriptions separately. Do not collapse all wallet merchants to a single learned identity.
- A standalone `Biaya Admin`/`Biaya Adm`, `Biaya Transfer`, `Biaya Tarik Tunai` or `Pajak Bunga` row suggests Financial. A fee mentioned inside a purchase description must not recategorize the entire purchase. `Gaji` and `Bunga Tabungan` suggest Income only when printed money-in evidence agrees.
- QRIS, BI-FAST, Xendit and wallet funding alone do not establish a purchase category or own-account transfer. Keep ambiguous categories as Other, at low confidence, with a review reason; do not turn that uncertainty into a 99-confidence override during enrichment. Printed debit/credit direction remains intact.
- Respect explicit spreadsheet categories and exact user-confirmed merchant rules, including categories such as Transfers that differ from the general merchant suggestion. Backup extraction follows the same semantics; its outputs remain suggestions rather than shared learned rules.
- Corrected corpus groups distinguish food delivery from subscriptions, schools from healthcare, fuel from utilities, groceries from ecommerce and urban transit from travel booking. SeaBank and blu by BCA are bank context, not wallets. Generic Gojek/Grab app names do not specify which service was used.
- Extraction cache version `v24` and backup prompt version `clover_bank_statement_extraction_v11` prevent older extraction suggestions from masking these changes on new processing. Existing confirmed transactions are not rewritten.

## Verification and limits

`npm --prefix web run qa:indonesian-import` covers amounts, dates, currency conflicts, CSV ledgers, balances, PDF column extraction, statement-period dates, receipts, payment/refund proofs, unpaid/ambiguous statuses, QRIS, investment metadata and actual XLSX/XLS/XLSB/ODS bytes. The layout suite adds reordered/empty columns, description continuations, branch identifiers, contradictory movement evidence, duplicate columns and worksheet-scoped periods. The enrichment suite additionally covers local classification, raw evidence, backup-result rescue, category confidence, foreign-currency controls and exact confirmed-rule precedence. All four suites run in the standard release/pre-push gate and CI. Existing Korean, structured-import, financial-identity, arbitration and confirmed-data checks remain required.

On 1 October 2026, original synthetic bank/receipt PDFs were rendered and visually inspected. The normal file reader preserved all three bank rows, their IDR amounts and account `00001234`; local OCR of the receipt PNG recovered total 60000 IDR, two items, receipt `000123` and date 2026-09-30. These samples contain no customer data and were not sent to external AI. They do not establish coverage of every Indonesian bank, e-wallet, handwritten receipt or brokerage format.

Additional synthetic file checks on the same date verified a statement PDF with `29/09` and `30/09` resolved from `Periode: September 2026`, and matching payment-proof PDF/PNG files. Both proof files produced exactly one 26000 IDR expense, retaining the 1000 admin fee, reference `00001234` and reported balance 174000 as evidence. The PDF used its native text; the image used local OCR. No customer records or external AI calls were involved.

A subsequent synthetic PDF with blank debit/credit cells, a wrapped description and an empty final balance was visually inspected and processed through the normal file reader. Native text extraction retained three movements (25000 out, 1000000 in, 1000 out), joined only the aligned description continuation, resolved dates from the printed period and left the final balance null. Workbook-byte tests covered separate September/October periods in XLSX, XLS, XLSB and ODS worksheets. These are layout checks, not certification of all Indonesian bank exports.

## Primary references

- Indonesian language authority, EYD punctuation: https://ejaan.kemendikdasmen.go.id/eyd/penggunaan-tanda-baca/tanda-titik/
- EYD numbers and monetary notation: https://ejaan.kemendikdasmen.go.id/eyd/penulisan-kata/angka-dan-bilangan/
- Bank Indonesia QRIS, including different transaction uses: https://www.bi.go.id/id/fungsi-utama/sistem-pembayaran/ritel/kanal-layanan/qris/default.aspx
- BCA myBCA Bisnis guide (column terminology only, not a customer fixture or claim of complete BCA support): https://www.bca.co.id/-/media/Files/Bisnis/Layanan/e-banking/myBCA-Bisnis/20250901-buku-panduan-mybca-bisnis
- GoPay transaction-history and payment-proof fields: https://gopay.co.id/bantuan/tentang-gopay/bagaimana-cara-melihat-riwayat-transaksi-gopay
- DANA history status definitions (Completed includes paid, expired or refunded): https://www.dana.id/help-center/article/how-can-i-check-dana-transaction-history
- BCA foreign-currency accounts and e-statements: https://www.bca.co.id/id/Individu/layanan/e-banking/mybca/poket-valas

- Gojek service distinctions: https://www.gojek.com/blog/gojek/cara-pesan
- ShopeeFood food-delivery service: https://www.shopeefood.co.id/
- Ruangguru education: https://www.ruangguru.com/about-us
- Pertamina Dex fuel: https://onesolution.pertamina.com/Insight/Page/ini-dia-jenis-bahan-bakar-mesin-diesel-pertamina
- Indomaret retail: https://www.indomaret.co.id/tentang-kami/tentang-indomaret/
- SeaBank institution: https://www.seabank.co.id/perusahaan/info/seabank
- blu by BCA Digital banking: https://bcadigital.co.id/documents/press/20210630.pdf
- Guardian health and beauty retail: https://guardianindonesia.co.id/
- Watsons Indonesia health and beauty retail: https://www.watsons.co.id/id/
- MRT Jakarta public transport: https://www.jakartamrt.co.id/
- Traveloka travel services: https://www.traveloka.com/en-ph/about-us

## Reviewed merchant corpus and reusable evaluation files

Use `web/lib/korea-indonesia-corpus.ts` for reviewed provider context and `docs/korea-indonesia-corpus-sources.md` for official sources. Category-only aliases must not establish country or currency. Preserve branch/submerchant text, explicit transaction direction and currency, and user-confirmed categories. A row naming incompatible merchant categories remains Other and requires review rather than selecting the first match.

`web/scripts/fixtures/korea-indonesia/` contains original synthetic CSV, receipt-text and actual XLSX examples, a provenance manifest and documented limitations. `qa:regional-corpus` exercises all new aliases through the production category and context paths, and evaluates the files through the parser/workbook reader. These fixtures add repeatable checks, not a claim of coverage for all local institutions or photographed documents.

## Public receipt corpus and unlocalized summary guard

`web/scripts/fixtures/korea-indonesia-public/` contains 26 CORD v2 financial annotation excerpts under CC BY 4.0, with original ground truth separated from parser input. Missing source currency must stay MIXED even when the dataset's country is known. Menu names do not become merchant names; source labels do not fill absent dates or table headers.

After established regional parsing, `unlocalized-receipt.ts` protects integer-formatted receipts from generic cent-repair and PHP defaults. It only returns a low-confidence summary preview, preserves source text, validates whole numeric remainders and duplicate totals, prioritizes explicit grand/due totals over pre-tax totals, and forces review. It never invents item tables or silently learns rules. Full dates do not establish currency. Explicit other currencies keep their existing parser path. The global `parseIndonesianAmount` still rejects bare comma grouping; this guarded receipt preview does not relax bank/ledger parsing.

The speed/accuracy benchmark exposed two unresolved cases (pre-tax TOTAL versus GRAND TOTAL and mixed separators/value-first fields). Final-total precedence and the guarded summary parser now resolve both, without relaxing ledger money parsing. An unreadable or conflicting final total remains unresolved, including cancelled/refunded summaries. `qa:public-receipt-corpus` checks all 33 printed totals and adversarial cases; see its README and the benchmark report for scope and limitations.

The live staging photo benchmark also exposed missing guidance in the compact core vision pass. Both core and detailed readers must distinguish GRAND TOTAL from TUNAI and KEMBALI, and TL/CASH/CG summary labels from currency evidence. Require verbatim total/payment evidence and consistent numeric grouping. Missing printed currency stays null in the raw extraction and MIXED in the required-string document field; it must not create a default-PHP cash account. Redacted core fields require an explicit terminal review, with preserved partial receipt evidence and no transaction, template promotion or futile automatic retry. Bump extraction-cache and prompt versions when changing this behavior so older inferred values cannot be reused.
