# App migration imports, batch 1

## Supported profiles

The adapter recognizes Realbyte's Date/Account/Category/Subcategory/Note/Amount/Income-Expense profile; Money Lover's Wallet/Category/Amount/Note profile; Wallet by BudgetBakers' Account/Category/Amount plus reference-currency or payment-type profile; Bluecoins' numbered standard/advanced template columns; and Clover's explicit Migration Source spreadsheet template.

Recognition is by columns, not filename. CSV, TSV and compatible workbook tables share the adapter. This is transaction-history migration, not a complete app backup restore. ZIP, SQLite, app settings, budgets, recurring rules, attachments and historical opening balances are outside this batch. Unknown layouts continue through the existing generic parser; they do not receive source-preservation guarantees. Money Lover and Wallet profiles use constructed fixtures, not authentic user exports, so do not advertise exhaustive version/language compatibility.

## Financial meaning and preservation

- Deterministic parsing precedes AI. Recognized rows keep names, notes, category paths, original currencies, accounts, tags and exclusions. Income/Expense/Transfer type is authoritative; category wording cannot change it. Reference-currency amounts and conversion rates never replace original transaction amounts.
- Category hierarchy is retained as a full path such as `Food / Lunch`, not a newly created parent/child taxonomy. Bluecoins split components remain separate transactions; original split grouping is retained in raw evidence.
- Bluecoins uses e/i/t and C/R/V. Void/pending/failed/summary rows are counted and skipped. Transfers preserve each signed leg. Unsigned positive transfer legs are supported for Bluecoins' published sample convention.
- Realbyte Transfer out stores its recipient in Category. Create a receiving leg when absent, retain provenance and count the derived row separately. Do not infer cross-currency amounts. Cross-currency transfers should use two explicit template rows with original currencies and amounts.
- For other profiles, unsigned amounts require explicit type. Dates/amounts that cannot be parsed reject the recognized table, identifying the source row. Zero-value transaction records are unsupported. A valid currency column or supplied account currency is required.
- Original cells and headers remain in rawPayload. appMigration holds version/source/row/id/category path/tags/exclusion/direction/split evidence. The first row of each table holds source row counts, skips, derived rows and original-currency account totals. The preview API aggregates these; completion stores imported and skipped counts. Do not interpret movement totals as opening or current account balances.
- Migration-only enrichment avoids training-data queries and merchant inference. Later worker normalization must preserve the same fields and keep explicit source transfers out of bank-transfer reclassification.
- Resolve accounts by explicit selection or exact source name/import identity plus currency in the current Profile. Do not rename existing accounts or overwrite their balances. Serialize new account creation, enforce plan limits and respect deletion tombstones. Same-named accounts in different currencies remain distinct.
- Source IDs prevent duplicate creation without overwriting existing confirmed edits. Without IDs, exact occurrence matching retains legitimate repeated identical transactions. Renaming descriptions/accounts can defeat matching. Existing connected-bank overlap checks still apply; ambiguous evidence remains reviewable.
- Save tags inside the transaction that inserts new transactions. Never replace tags on existing confirmed transactions.

## Verification and provenance

`npm --prefix web run qa:app-migrations` exercises five profiles, XLSX/XLS/ODS, dates, money, types, categories, raw evidence, tags, exclusions, skips, invalid rows, source IDs, repeated occurrences and 10,000-row parse/enrichment timing. It is included in qa:release and the full prepush gate.

`web/scripts/app-migration-db-regression.ts --execute` requires the disposable local database `127.0.0.1:55441/clover_migration_qa`. It uses the real worker and database while prohibiting network/AI calls, checks all five profiles, tags/exclusions/transfers, mixed currencies, preservation of confirmed edits, partial-overlap reimports and a 1,000-row import. Initialize the empty schema with Prisma db push. It never touches production or customer records.

Bluecoins fixture: unmodified public advanced template from https://www.bluecoinsapp.com/csv-templates/Bluecoins_CSV_Advanced_Template.csv. This is a published import example, not proof of every Bluecoins report export. Realbyte fixtures are synthetic rows shaped to its published blank import template. Money Lover, Wallet and Clover fixtures are constructed test data.

Official reference pages, checked 2026-10-07:
- https://help.realbyteapps.com/hc/en-us/articles/360043536233-How-to-import-bulk-data-by-Excel-file
- https://moneylover.zendesk.com/hc/en-us/articles/36369130766617-Export-to-Google-Sheet-CSV
- https://support.budgetbakers.com/hc/en-us/articles/7151606064018-How-to-export-transactions-from-Wallet
- https://www.bluecoinsapp.com/guide/import-export/

The Help Center includes five guides and `/templates/clover-migration.csv`. Each guide explains supported layouts, alternatives and limitations. No new native app build is required for these server-side mappings and Help Center articles.

## Batch 1 verification evidence (2026-10-07)

- Full `npm run qa:prepush` passed before integrating the latest staging artwork changes; the merged tree is checked again before push.
- Parser/enrichment: all five profiles, official Bluecoins sample 9/9, and XLSX/XLS/ODS parity passed. 10,000 rows took approximately 1.6–2.1 seconds on the local machine.
- Real worker/PostgreSQL: all five profiles passed, including tags, exclusions, transfer legs, new rows in partially overlapping uploads, confirmed-edit preservation, and same-named accounts with distinct currencies. 1,000 rows took approximately 1.6 seconds locally. No network or AI provider calls occurred.
- These are synthetic/public-fixture local results, not phone-to-production latency measurements or certification of every source-app export variant. Authentic Money Lover/Wallet exports and wider language/version coverage remain follow-up work.
