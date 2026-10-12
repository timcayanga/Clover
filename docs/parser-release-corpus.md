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

## BPI checkpoint incident regression

`bpi-checkpoint-db-regression.ts` adds the exact four-page synthetic PDF from the staging verification to the permanent release gate; `fixtures/bpi-checkpoint/review.json` records its independent source review and immutable checksum. Its 100 PHP 10 purchases total PHP 1,000. The colon-delimited bill/due dates and closing total must be captured, transaction coverage remains August 1–25, and the absent opening balance must remain absent. Positive tests use an explicitly added synthetic previous-balance header; these are separate derivatives, not changes to the retained PDF.

The real worker test verifies the account's liability sign, completed processing with an explicit missing-evidence reason, cent-level mismatches, repeated occurrences and currency guards. It recreates a legacy checkpoint and proves preview is read-only and repair changes only that checkpoint. All other complete rows across the 21 protected tables, including confirmed edits, raw imports, account balances and every learned rule/job, must hash identically. Repeat repair is a no-op, and a confirmed amount edit blocks it.

The staging-only operator diagnostic permits this reviewed checkpoint repair only in its original owned verification Profile, verifies downloaded source bytes, requires a preview hash, checks preservation atomically, and journals the complete before/after checkpoint. It does not reprocess the import or reset any source, transaction, cache or learning record.

Live verification also exposed a status-read write: comparing serialized object key order treated PostgreSQL JSONB account summaries as changed on every poll. Summary publication now compares structural values and uses the checkpoint's observed version for its write. Real status-handler tests require repeated settled GETs to leave the full checkpoint (including its timestamp) unchanged; a delayed response must not overwrite a newer repair. The original baseline and the timestamp-only observation remain separate evidence, rather than silently refreshing the baseline.

The fresh-upload check additionally requires the statement date to survive metadata normalization/template merging into the persisted checkpoint, independently of transaction coverage and the due date. The current source can supply this date even when older cached metadata predates the field; old caches and templates are not reset. The first published BPI account summary must already use the same liability sign as the stored account, so settlement does not depend on a later status poll repairing the projection.

The separately reviewed `bpi-checkpoint/signed-payment.txt` fixture reproduces a real-source reconciliation issue using invented identities, merchants and amounts. Its four rows include a negative payment, two identical foreign purchases and a third foreign purchase. Reconciliation must use signed statement amounts without changing Clover's established Financial/expense payment classification; a normalized/source magnitude conflict blocks reconciliation. The real worker must persist all four rows, both repeated occurrences, PHP amounts and the correct negative card balance. The original customer PDF, independent full-ledger review and live staging evidence stay in the private knowledge archive, outside Git.

## Scribd pilot, 12 October 2026

The additive `posb-column-ledger`, `gcash-bill-fee-email` and `maribank-retained-column-repeats` cases bring the portable corpus to 27 sources / 117 transaction or item observations. Their expected values were independently specified from invented source documents, never generated from parser output. `scribd-pilot-db-regression.ts` runs real persistence and durable jobs, checks printed columns and missing pages, preserves repeated movements and receipt identities, and requires repeat confirmation to retain all financial/account/learning fields and timestamps.

The private download catalogue records source URL, checksum, download method, duplicate status, review authority and unresolved reuse rights. Originals and real labels stay outside Git. A download is not an accepted training example. Incomplete documents remain quarantined; duplicate sources are reused as preservation coverage and are not counted as new training. The first batch contains two new complete examples (POSB and GCash), one byte-identical retained MariBank example, and one partial Boost Bank source (printed page 1 of 5). No old imports, corrections or learning projections are refreshed.

The retry regression exposed an unchanged-balance account write. Confirmation now updates a single-account balance only when its database value differs (or is null). This preserves the account timestamp on retry without changing balance selection, confirmed transaction protection or learning semantics.

The native-body GCash representation retains the same invented bill/fee ledger without its image-only email subject. Source receipt fields and the interrupted biller label must identify it. The stored-file native-layer fast path requires complete fields; named receipts use an additional cache version, with the old version retained unchanged. The private original is replayed through `readImportedFileTextWithCacheInfo`, matching normal upload preflight rather than only the direct-file reader.

## Scribd second batch

The `cimb-consolidated-zero-account` and `bca-transfer-components` examples extend the portable corpus to29 representations /124 observations. Invented expectations were independently specified: four CIMB movements plus one empty-account marker; one BCA principal and fee. These are regression observations, not a newly trained-document count.

`scribd-batch-two-db-regression.ts` is part of the mandatory real-worker release gate. It checks physical/printed pages, dates, running balances, repeated references, zero-activity account visibility, native BCA columns, payer/recipient separation, principal/fee currency, explicit absence of bank-balance anchors, first/repeated status reads, no-op confirmation and completed durable jobs. Invalid recognized proofs cannot create financial rows or learning jobs. Later user edits, current balances and custom identities survive historical confirmation.

Status publication also compares balances as exact decimals: `34.10` and `34.1` must not cause a checkpoint rewrite. Missing balances remain distinct from zero, and real amount or identity changes remain detectable. The permanent worker regression exercises the publication helper as well as snapshot loading.

Real documents are replayed privately through the normal stored-file reader and worker before staging uploads. The named cache versions are additional namespaces; no old cache, projection, signal, template or original file is refreshed or deleted.

## Scribd third batch regression extension

Nine independently invented cases extend the corpus to38 representations /146 observations. Existing cases and their review locks remain unchanged. The mandatory scribd-batch-three-db-regression checks multiple/wrapped GCash receipts, UPSave/wrapped CIMB summaries, a complete single FastPlus ledger, negative POSB balances/zero disclosures/ATM fees and additional BCA native/mirrored layouts. Actual workers must preserve complete identities, currency, balances, source occurrences, confirmed edits and evidence, finish durable jobs and leave settled reads/repeat confirmation unchanged.

The staging-only read-only batch preservation diagnostic excludes only explicitly supplied actor-owned verification runs (maximum32), with fixed QA-user/environment checks. It hashes every historical protected row including null-Profile records, retaining the original baseline. It never accepts arbitrary Profile IDs or resets data. The existing retained BPI checkpoint is compared separately.

The privately retained Maya Savings source remains outside accepted training while its normalized timestamp contract and overlap protection are unresolved. Its original, independent labels and failed replay evidence are preserved. A download or approximate date-only parse is not an accepted full-fidelity example.

The biller-account extension preserves identifiers split between Account/Number labels. The staging diagnostic retrieves missing legacy structured values from unchanged source text as a read-only projection, separately from financial/raw rows. It does not reset prior learning or patch confirmed data.

## Scribd fourth batch regression extension

Five independently invented source contracts extend the passing corpus to43 representations /158 financial or item observations (zero-account markers remain separately retained). Existing sources, financial expectations and review locks are unchanged. The mandatory scribd-batch-four-db-regression exercises native payment clocks and tax identities, POSB address/date coverage and signed reversals, bilingual BCA authorization/explicit fees, full real-worker fields, durable jobs, first/repeated status reads, no-op confirmation, and preservation after confirmed edits/current balances.

The private batch retains original PDFs, URLs, checksums, independent labels, initial failures and rejected candidates separately. Public download titles/page counts are discovery metadata, not source truth. A malformed card summary, incomplete extraction, unsupported concatenated period or unknown payer identity is not repaired by changing expected labels. No historical sources, caches, learning projections or confirmed finance are refreshed.

## Fifth Scribd batch coverage

Five independently invented native receipt/savings examples extend the portable corpus to48 representations /170 financial or item observations. All43 previous cases, source bytes, expectations and review locks remain unchanged. `scribd-batch-five-db-regression.ts` is part of the unchanged mandatory release gate and exercises real financial persistence, native field roles, source clocks, complete-page/row coverage, legitimate repeats, durable learning, stable status/publication and no-op confirmation. Existing confirmed edits and customized current account balances survive both retries and a separate older savings statement.

The private batch keeps complete originals, immutable independent labels, initial extraction/selection failures and rejected candidates outside Git. A download or completed job is not sufficient evidence of correct training. Receipt totals/components must reconcile without doubling expense rows; incomplete OCR, unknown payment accounts, invalid periods and source conflicts remain reviewable instead of being repaired through generated expected labels.

## Scribd sixth batch regression extension

Four independently invented savings contracts extend the corpus to 52 representations: two empty snapshots, one ATM ledger and one POSB eEveryday Savings ledger. The previous 48 sources, expected fields and review locks remain unchanged; The two snapshot observations are account markers; the MariBank ATM ledger adds five source movements, and the POSB savings alias adds four. The mandatory `scribd-batch-six-db-regression` checks complete explicit empty source evidence, zero finance, unchanged nonzero savings balances, source/current balance separation, existing customized SeaBank identity and timestamp preservation, completed durable learning and no-op first/repeated status and confirmation. Invalid dates, missing pages, hidden dated rows and nonzero source flows in an empty ledger fail review. ATM checks preserve two distinct MariBank withdrawals and two fee expenses, exactly two same-currency Cash counterparts, existing bank/Cash balances, and settled projection/count/learning no-ops. POSB eEveryday reuses the established strict Payroll protocol and checks its separate fee, Cash counterpart and retry/settlement no-ops.

Actual downloaded originals remain outside Git and must pass the reader plus real-worker contract before staging learning. No-activity originals may teach account evidence without fabricating merchant corrections or movements. Duplicate uploads, conflicting identities, unsupported periods and contradictory printed running balances remain separately inventoried.

## Seventh Scribd batch: explicit bill protection

Two independently invented GCash examples add five component observations, bringing the reviewed corpus to54 cases /186 observations. All52 previous source bytes, reviewed expectations and locks remain unchanged. The mandatory `scribd-batch-seven-db-regression.ts` exercises a separately labeled GInsure charge, zero/positive fees, exact arithmetic, missing/conflicting charges, duplicate reply art, source identities, clocks, durable jobs, confirmed edits and repeat-read/confirmation preservation. Actual privately retained originals must independently reconcile and pass the normal stored-file reader and real worker before staging acceptance.

Future receipt-cache assertions follow v45; the pilot database test retains and compares every field/timestamp of actual v39/v40/v42 cache records beside the added namespace. Historical financial expectations remain unchanged. The bounded insurance-label adapter handles an amount between Bill and Protect without rewriting raw source evidence.
