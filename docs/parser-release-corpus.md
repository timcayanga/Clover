# Parser and enrichment release contract

`npm run qa:prepush` is the required local and CI release gate. Its `qa:release` now includes `qa:parsers`: historical inline contracts, the reviewed portable corpus, merchant/learning/account-identity checks, and actual worker persistence against a new disposable PostgreSQL database. A missing fixture, changed checksum, failed assertion, missing PostgreSQL binary, occupied test port, or database test failure fails the gate. There are no release skip/filter/update modes. The runner discards the caller's database URLs and cloud credentials; it never initializes, migrates, or deletes a shared database.

The frozen knowledge baseline remains commit `901b242f1bce74ebf73fabdff3608c30ead6e03a` and the independently sealed 9 October preservation archive. This work does not rewrite that archive, load it into production, reprocess existing imports, or promote past machine suggestions into user confirmations.

## Corpus and review authority

`web/scripts/fixtures/reviewed-parser-corpus/manifest.json` inventories portable sources, representations, checksums, expected fields and review reasons. `review-lock.json` binds the complete reviewed case, including its expectation and provenance. Stable case IDs, exact ordered row counts, original currencies, account IDs, amounts and specified source fields are release requirements. The comparator includes deliberate negative checks for dropped/extra occurrences, changed amount/currency/account and missing evidence.

The initial portable corpus contains 23 synthetic fixtures and 104 transaction/item observations reviewed by Codex against the source text and arithmetic. It is **not** a claim of human approval, a model-training count, or certification of every bank/app layout. The five workbook fixtures encode the same reviewed ledger in different containers; they are five format checks, not five independent financial examples. Screenshot and receipt transcripts test parsing after OCR; original image recognition remains covered separately by the existing OCR suites. Existing institution, regional, financial-exchange, spreadsheet, app-migration, bank-sync, merchant and arbitration suites remain in the release gate.

Do not commit customer documents, production snapshots, or private labels. Preserve their originals in the private knowledge archive. Public documents require recorded provenance and reuse rights before promotion. A filename match, model prediction, high confidence, successful upload, provider Cleared/Reconciled flag or repeated example is not evidence of human confirmation.

## Protected persistence

The fresh-database gate uses real Prisma, the import worker and transactions. Only framework cache/after hooks and outbound providers are isolated. It checks:

- All confirmed, edited and rejected row fields and timestamps survive reimport, including amounts, dates, categories, descriptions, transfer/exclusion flags, raw evidence and normalized values.
- Existing manual entries, manual rules and correction signals survive unrelated imports.
- Account names, leading-zero identifiers, institution, type, currency and current balances survive historical imports. Matching identities in another Profile are isolated; same-name currency accounts remain distinct.
- Two identical purchases remain two transactions; an overlapping source with one extra occurrence adds exactly one. Renaming/retrying the same source adds none after user edits.
- Import source hashes/storage references, parsed rows and transaction evidence remain separate and traceable.
- Existing migration tests exercise categories, tags, split parents/children, transfers, multiple source apps, mixed currencies, invalid-file atomicity and 1,000-row persistence. Existing bank tests exercise linked-account reuse, duplicate/review behavior, protected reimports and concurrent refresh limits.

These are regression guarantees for the tested paths, not proof against every possible import. A new source family or incident needs its own minimized example and expected results.

## Changing the corpus

1. Retain the original source, checksum, provenance and any actual user correction. Put uncertain or unavailable-source examples in the review queue, not the passing corpus.
2. Create a shareable synthetic/anonymized reproduction without overwriting the original. State whether it is bytes, extracted text, OCR or provider payload. Keep private evidence outside Git.
3. Read the source independently and specify exact amounts/dates/directions, currencies, account identity, occurrence counts, balances, source evidence and expected review behavior. Do not generate expected labels from the parser being tested.
4. Add a stable case ID and review basis. Update the review lock only after source review; there is deliberately no automatic snapshot-update command. Changes to existing expected financial values must explain the source evidence and be reviewed as behavior changes. Never remove or loosen a case merely to pass a refactor.
5. Run the complete gate. For parser/extraction changes, also run the retained private replay using existing originals. A missing original is an actionable inventory issue, not permission to invent a replacement label or request wholesale reuploads.

## Private replay

From `web/` run:

```sh
CLOVER_STATEMENT_ROOT="/path/to/preserved/Bank Statements" npm run qa:parsers:private
```

The private suite also checks every field of all 104 China Bank rows against the retained July/August labels; it never substitutes a transcript generated from those expected answers when PDF extraction fails. The private suite retains its original file inventory and fails when required files are absent. `CLOVER_PARSER_CASE` is a local diagnostic filter only and is stripped by the release runner. `CLOVER_SKIP_FIXTURE_CORPUS` is rejected. CI runs portable inline contracts explicitly with `--portable`, never silently reports private documents as checked.

Local PostgreSQL 16 or newer is required. The runner discovers `pg_config`/Homebrew/Ubuntu binaries; `CLOVER_QA_PG_BIN` can select a binary directory. Port 55441 must be free. It creates a fresh temporary cluster and schema, runs all checks and stops/removes its cluster even when a test fails. No environment file or live database is required.

## Historical repairs in this release

- Replaced the obsolete exact v13 cache assertion with a version-floor contract, so normal future cache invalidations do not suppress thousands of historical checks.
- Preserved receipt arithmetic/item tests while requiring unknown-currency examples to remain unresolved and review-required. Positive split/fast-path fixtures now contain explicit currency evidence. Noisy merchant prefixes remain in the conservative baseline rather than claiming OCR noise was removed. Ramen examples without clear currency evidence must remain off the automatic fast path.
- A source review of the historical BDO full-month table found eight transactions, not the old expectation of two. A narrowly selected native-text path now requires every row, both movement totals and the closing balance to reconcile, preserving full years and exact amounts without fragmented-text amount rounding. Other BDO paths remain intact.
- The integer-only receipt safety reader must defer decimal `Total Amount` and `Bill Amount` summaries to the existing decimal reader. It must not consume those receipts as empty integer previews.
- Restored failure reporting for historical follow-up cases; previously collected China Bank/EastWest errors could be printed as an overall success.
- Hybrid China Bank/EastWest PDFs must not bypass OCR on an empty or numeric-only text layer. Their table OCR preserves row boundaries. EastWest identifiers receive a separate lossless header pass to avoid JPEG glyph corruption. China Bank's formatted account stops before adjacent summary balances.
- The two retained EastWest published templates have different source headers: the Excel/PDF variant has a blank account; the Word/PDF variant prints one. The fallback now uses source identity, retains its extracted text, and caps suggestions at 45 confidence because the source variants contain conflicting balances/directions. Historical balance hints remain explicitly separate from verified source balances. This repairs unsupported template assumptions without replacing confirmed user data.
- Cache v39 applies to future extraction results. No existing confirmed records, learned rules or source artifacts are migrated or deleted.

## Verification on 9 October 2026

- The complete root `npm run qa:prepush` passed, including all existing application checks, security audits, type checks, iOS/Android bundles and the web build.
- All 23 reviewed fixtures passed (104 transaction/item observations), as did the historical inline contracts and merchant, correction-learning and account-identity checks.
- The retained private replay passed 44 primary file fixtures and its dedicated institution follow-ups. The repaired China Bank deep check matched all 104 original-PDF rows against the retained July/August labels without substituting expected answers as input.
- Fresh PostgreSQL tests passed 1,062 migration transactions, bank-import persistence and the new preservation scenarios. The 1,000-row worker completed in 1.688 seconds against the unchanged 10-second limit, with zero provider calls.

These counts describe regression coverage, not newly trained examples or human-confirmed labels. The sealed knowledge snapshot and production data are outside this test execution.

## Durable learning extension

The release gate also applies the additive learning migration to retained legacy records and runs fault-injected learning/job/API checks in the disposable database. See [the durable learning contract](durable-learning.md). Preserve immutable observations, atomic outbox/checkpoints, manual authority, inactive exclusion, older-rule retrieval and failure history alongside the financial preservation requirements above.
