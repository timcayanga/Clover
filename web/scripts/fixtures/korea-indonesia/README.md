# Korean and Indonesian import evaluation corpus

These are original synthetic examples for repeatable parser evaluation, not scraped customer documents, labeled production data or model fine-tuning records. Amounts, dates, identities and line items are invented. Merchant/provider identities come from the reviewed official-source pack in `docs/korea-indonesia-corpus-sources.md`.

## Coverage

- Two localized debit/credit ledgers: eight rows each, including incoming refunds, merchant categories, source references and leading-zero account identifiers.
- Two foreign-currency exports: explicit USD and source categories that override merchant suggestions.
- Two holdings inventories: fractional units, valuation dates, mixed IDR/USD investments and total rows that must not become spending.
- Two receipt text fixtures: Korean and Indonesian totals, item quantities and payment/change lines. These are OCR-like text; they do not measure OCR image accuracy.
- Two rejected ledgers with contradictory populated debit and credit cells.
- Two actual XLSX workbooks, each combining its ledger and holdings on separate named sheets. Holdings use native numeric cells to test quantity precision; account identifiers remain strings.

The workbooks intentionally reuse the CSV records. Count 12 files, not 12 independent real-world institution layouts. The manifest records file types, expected records, provenance and SHA-256 hashes. Exact field expectations live in `web/scripts/korea-indonesia-corpus-regression.ts`, independent of the production corpus definitions.

Run `npm --prefix web run qa:regional-corpus` from the repository root. This checks every new provider alias, then routes the documents through Clover’s parser and real workbook decoder. It also checks boundary collisions, NFKC forms, Korean attached branch names, cross-country ambiguity, fee/top-up precedence, source currency, source cells, category confidence and confirmed merchant rules.

No live API, AI call, bank refresh or database write is used by this suite. Passing it demonstrates these labeled examples only; scans, photographed receipts, bank-specific layouts and ambiguous descriptors still need consented representative documents and review.
