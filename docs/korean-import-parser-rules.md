# Korean financial imports

## Scope

Korean (Hangul) text and KRW are independent signals. Never assign currency solely from language, merchant country or the user's home currency. These rules apply to new imports; they do not rewrite confirmed transactions, accounts or historical balances.

## Recognition and evidence

- Local OCR loads English and Korean together. Unreadable photographs still need the consent-gated backup parser; extra OCR language support does not guarantee correct extraction.
- Preserve original images/files, original Korean text, source cells, headers, worksheet metadata and row indexes. Normalize NFKC/full-width characters only in a working copy.
- Read Korean year-month-day dates, including year/month/day suffixes, dot-separated dates, compact YYYYMMDD and local time suffixes. Reject invalid calendar dates. Do not shift a printed date because of timezone conversion.
- Interpret ₩, ￦, KRW and numeric 원 suffixes as currency evidence. Explicit currency columns and metadata take precedence over an inferred country.
- Won can be integer-valued. Never divide 12,000원 by 100. Support explicit simple 천/만/억 amount multipliers and supported monetary column units; reject unsupported compound forms rather than dropping the multiplier.

## Receipts

- Recognize explicit merchant labels, total, tax, discount and item-table labels. Preserve Hangul names and descriptions. Do not treat a payment rail as the merchant.
- Distinguish 합계/결제금액 (total), 소계 (subtotal), 부가세 (VAT), 할인 (discount), 받은금액 (cash tendered) and 거스름돈 (change).
- Do not add VAT twice. Use a net subtotal only when the tax components reconcile with the printed total.
- Parse item rows only under an explicit item/quantity/amount header. Never create separate transactions for the item table, tax, payment amount or change.
- Conflicting totals, missing currency/date/merchant, unreconciled items and cancellation/refund evidence block the deterministic fast path. No guessed PHP currency or purchase total.
- Business-registration and VAT evidence may suggest KRW for review; it is not explicit currency confirmation.
- Cancellation receipts must not become positive purchase transactions. The backup parser distinguishes void authorization from a posted refund.

## Structured files

- Use the existing ledger/inventory parsers with Korean header aliases and the existing audit trail.
- Decode UTF-8/UTF-16 normally. Consider EUC-KR/CP949 only after strict UTF-8 fails, strict Korean decoding succeeds, and at least three financial headers (including date and money) are recognized. Retain Windows-1252 compatibility.
- Preserve workbook preamble account metadata and currency. Missing account columns must not replace detected KRW with PHP.
- 입금/수입 are incoming; 출금/지출 are outgoing. Explicit columns take precedence. Ambiguous unsigned movements require review.
- Ignore cancelled/pending/failed rows and aggregate total rows. Balance tables create snapshots, never spending. Unknown-currency Korean balance tables fail before persistence.
- Preserve original/foreign amount and currency separately from settled values. Arbitrary Korean brokerage layouts still require the existing holdings backup path; do not advertise institution-specific coverage without fixtures.

## Enrichment and display

- Merchant learning keys preserve Unicode letters and numbers, so confirmed edits for different Korean merchants remain distinct.
- Existing learning authority and confirmed-data protections still apply. Backup suggestions are not trusted merchant rules until confirmed.
- Known merchant/category hints remain suggestions. Do not translate away the original merchant or infer a merchant from Kakao Pay/Naver Pay alone.
- KRW whole amounts display without `.00` on web and native. Nonzero fractional values remain visible for conversions/valuations. Storage and calculation precision do not change.
- No schema migration or new environment variables are required. Increment extraction-cache version so old OCR/parse results are not reused for new processing.

## Verification

`npm --prefix web run qa:korean-import` covers synthetic receipts, Korean ledgers/workbook routing, CP949 headers, currency units, calendar dates, foreign currency, cancellations, ambiguous fields and display. Existing import and confirmed-data suites must continue passing.

Public sample source: https://huggingface.co/datasets/HumynLabs/Korean_Receipts_Dataset (publisher-declared CC BY 4.0; mixed collected/simulated provenance). Keep downloaded images outside Git. Local OCR checks of samples 1, 10 and 20 produced incomplete/low-confidence text, correctly retained on the backup/review path. Those checks are not evidence of complete extraction accuracy, and no sample was sent to external AI or imported into a customer account.
