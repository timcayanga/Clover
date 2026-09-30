# Korean financial imports

## Scope

Korean (Hangul) text and KRW are independent signals. Never assign currency solely from language, merchant country or the user's home currency. These rules apply to new imports; they do not rewrite confirmed transactions, accounts or historical balances.

## Recognition and evidence

- Local OCR loads English and Korean together. Unreadable photographs still need the consent-gated backup parser; extra OCR language support does not guarantee correct extraction.
- Preserve original images/files, original Korean text, source cells, headers, worksheet metadata and row indexes. Normalize NFKC/full-width characters only in a working copy.
- Read Korean year-month-day dates, including year/month/day suffixes, dot-separated dates, compact YYYYMMDD and local time suffixes. Reject invalid calendar dates. Do not shift a printed date because of timezone conversion.
- Interpret ₩, ￦, KRW and numeric 원 suffixes as currency evidence. Explicit currency columns and metadata take precedence over an inferred country.
- Won can be integer-valued. Never divide 12,000원 by 100. Support explicit descending Arabic-number 천/만/억 amount expressions and monetary column units; reject ambiguous expressions rather than dropping a multiplier.

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
- Decode UTF-8/UTF-16 normally. Consider EUC-KR/CP949 only after strict UTF-8 fails, strict Korean decoding succeeds, and a single row contains either at least three financial headers (including date and money) or the complete asset/provider/value/valuation-date investment header. Unrelated labels scattered through prose are insufficient. Retain Windows-1252 compatibility.
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

## Expanded layouts and validation (30 September 2026)

- Receipt item parsing follows the printed column order: quantity/amount, unit price/quantity/amount, or quantity/unit price/amount. Wrapped item names and Latin item names in a Korean receipt are allowed; missing numeric columns are never invented.
- Explicit merchant labels can use a colon, a space, or a separate value line. Conflicting merchant labels require review. Compact YYYYMMDD dates are accepted with explicit transaction labels.
- Validate item arithmetic separately from VAT reconciliation. Conflicting or negative tax/discount/service amounts, unexplained rows, or inconsistent tax components block the fast path. Service charges and discounts are applied only when explicitly labeled and reconciled.
- Parse descending Arabic-number unit expressions such as `2억 3천만원` and `1만 2천 500원`. Repeated/increasing units, malformed comma grouping, multiple signs, arbitrary text, and unsafe numeric magnitudes are rejected. This does not support fully written-out Korean numerals.
- A `단위: 천원` table preamble applies to monetary columns, never account numbers, dates, quantities, or an unlabeled foreign amount. A column-specific unit takes precedence. Original currency and amount columns remain separate from settled billing amounts.
- Korean references retain their letters for exact-repeat detection. Distinct references that happen to share digits are distinct transactions.
- Completed refund statuses can supply incoming direction when there is no explicit direction; pending refunds and unposted/cancelled rows remain excluded. A conflicting refund direction requires review. KRW running balances use cent-level comparison rather than a percentage tolerance that would hide whole-Won discrepancies.
- Unreadable dated Korean ledger rows stop the local parse instead of silently dropping a financial row. Low-confidence direction/currency/balance results carry matching confidence and review reasons.
- Korean financial worksheets participate in the existing complete-workbook coverage check. An unreadable financial sheet requests backup evaluation of the complete workbook.

### Korean investment inventories

- Support explicitly delimited CSV/TSV and workbook tables with `종목명`/`펀드명`, `증권사`/`플랫폼`, `평가금액`, and `평가일`/`기준일` columns. Optional quantity, security code and monthly contribution values remain separate.
- Reuse Clover's investment-summary snapshots, one named investment per provider. Do not create spending, trades, cost basis, or an aggregate total card. A shared statement account number is retained as provenance rather than merging distinct investments through that number.
- Preserve fractional holdings quantities and security codes. Require an explicit readable valuation date and currency. Ambiguous currency, duplicate columns, repeated investment identities or an unreadable investment row stop the local parse.
- Investment and transaction tables can coexist on a worksheet; keep both with worksheet, section and source-cell evidence. Source row indexes follow the existing decoded worksheet representation, which omits blank rows.
- This is labeled inventory support, not a verified institution-specific Korean brokerage integration. Unfamiliar brokerage statements and screenshots still use backup/review.

### OCR and backup coverage

- A weak local Korean image result now receives up to two additional full-frame segmentation passes. Receipt labels select receipt scoring even when the image filename is generic. Keep the best complete candidate instead of concatenating contradictory OCR amounts.
- OCR statement comparison keys preserve Hangul rather than dropping it as non-Latin noise.
- Backup instructions now explicitly cover Korean column order, unit examples, original versus billed currency, leading-zero security codes, and missing worksheet coverage. Existing AI consent and validation gates still apply.
- `qa:korean-import` includes extended synthetic fixtures and actual XLSX byte decoding. Local OCR checks on a clean synthetic image and public sample 1 recovered merchant/date evidence, but missing item/total evidence still required review. No external AI accuracy claim is made from those OCR checks.

## Document fidelity and incomplete-row safeguards

- Scope unformatted spreadsheet date serial conversion to the current table headers, including Korean transaction and valuation dates. Support both Excel date systems, late headers, shifted columns and side-by-side tables. A subsequent quantity or account-number header stops prior date conversion; blank separators alone do not discard the current date system. Explicit cell date formats remain authoritative.
- Keep leading-zero security/account identifiers and fractional quantities intact. Regression fixtures round-trip actual XLSX, XLS, XLSB and ODS bytes in both date systems.
- Carry explicit section-level money units forward for transaction amounts, fees and balances. A switch from `천원` to `원` must stop multiplying later values by 1,000. Foreign/original amounts retain their existing independent currency treatment.
- A populated, unreadable debit/credit/amount field cannot be ignored just because another column is readable. A transaction with missing date or description cannot disappear alongside valid rows. Stop the local parse for correction/backup evaluation; do not invent values.
- Balance snapshots honor explicit preamble valuation dates. Invalid supplied dates fail closed; only genuinely absent dates use upload day, with lower confidence and an explicit review reason. Preserve original snapshot cells and headers.
- Reject contradictory currency evidence or different balances for the same account/currency/date. Stop snapshots sharing an account identity across currencies, because the existing confirmation resolver groups through account numbers/names and could otherwise collapse those balances. Ask for distinct currency-account identities. These rules govern new parsing only and do not modify persisted customer records.
- PDF text quality recognizes Korean dates and whole-Won amounts. Only a Korean financial table with multiple dated monetary rows can skip redundant OCR; sparse text, missing pages and replacement/private-use glyphs retain fallback. Dates and bare identifiers alone are not money evidence. This is text-quality routing, not a new institution-specific PDF parser.
- `qa:korean-import` includes `korean-document-regression.ts` for legacy holdings, workbook semantics, section units, incomplete rows, snapshot safety and PDF OCR decisions. These synthetic checks do not establish accuracy for every photographed receipt or bank layout.
