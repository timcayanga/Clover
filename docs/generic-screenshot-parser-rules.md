# Generic Screenshot Parser Rules

These rules apply when an uploaded screenshot does not match a trained institution parser.

## Account and product overviews

- Recognize repeated account cards only when the screen has account/product overview signals such as `Your products`, `My accounts`, or `Balances`.
- Emit one `account_snapshot_marker` per visible account card when an account identity and balance are present.
- Keep the row review-required and preserve the OCR source text in `rawPayload`.
- Do not infer an institution, account type, currency, or investment units beyond what the screenshot explicitly supports.

## Mobile activity screens

- Recognize a generic activity/transaction screen only when it contains both transaction-history signals and signed monetary values or explicit direction labels such as Expense paid.
- Pair a date header, following description lines, and the next amount conservatively. OCR may omit whitespace after the comma in a full date (for example, Sep 07,2026); it must still start a new transaction block.
- Emit low-confidence, review-required rows with `rawPayload.kind = generic_mobile_screenshot_transaction`.
- Never let the generic fallback override a trained parser, a deterministic statement parser, or confirmed financial data.

## Cold and untrained visual layouts

- Before any AI fallback, score extracted local text, deterministic rows, financial metadata, filename hints, currency-and-amount evidence, and table headers. A confidently non-financial document must stop before the model call.
- The scope check must fail open when local OCR is sparse or inconclusive. Ordinary camera filenames, foreign-language receipts, and low-light images remain eligible for visual parsing rather than being rejected for missing English keywords.
- Treat a coupon, voucher, promotion, menu, or advertisement as non-financial when it lacks evidence of a completed purchase. Prices and expiry dates alone are not proof of payment. Surface a friendly, non-retryable message asking for the full receipt with its purchase date and total.
- A receipt that contains a coupon or discount line remains eligible when the image also shows completed-purchase evidence such as a grand total, amount paid, payment method, receipt number, or transaction ID.
- Use the deterministic parser first. The cold-layout path only applies when a statement image or rendered PDF has no usable local rows and weak or unknown identity.
- Send at most two representative pages to the fast backup model for the first decision. This keeps a new layout from paying the full multi-page vision cost when the compact result is already complete.
- Require visible evidence for every extracted row. A usable fast result needs account or institution identity, dated rows, finite amounts, transaction names, and parser evidence.
- Escalate automatically to the strong backup model with the available representative pages when the fast result is empty, under-counted, undated, unsupported, or missing account identity.
- Prefer the stronger result only when its candidate-quality score exceeds the fast result. Never replace a more complete result merely because a stronger model was called.
- Keep inferred or low-confidence fields review-required. Backup parsing must not overwrite confirmed financial records.
- Record backup model, decision duration, schema validation, quality score, and routing outcome in import metadata for QA and Admin diagnostics.
- When source OCR text is blank, derive the reusable statement-family signature from validated rows and resolved account metadata so the successful import can contribute to future routing history.

## Receipt time to usable

- Publish a receipt transaction as soon as merchant, total, date, currency, and the best supported account are safely persisted. The user must not wait for data QA, merchant cleanup, category refinement, duplicate analysis, recurring analysis, or learning before the transaction becomes visible.
- Use the same visible-first handoff for transaction-bearing digital notes. Structured statements, spreadsheets, PDFs, screenshots, and delimited files also publish core rows before post-visible QA and enrichment.
- Queue post-visible cleanup through the durable import enrichment job. Enrichment must update the existing transaction in place and must never create a second transaction for the same receipt.
- Start enrichment immediately for imports of 25 rows or fewer and within one second for larger imports. Resume from the durable row cursor after a timeout instead of rescanning completed batches.
- Load merchant rules, account rules, training signals, and negative feedback in parallel once per job. Reuse that snapshot across batches, evaluate only suggested or review-pending rows, and batch transaction updates.
- Scope post-enrichment transfer reconciliation to the imported date window rather than scanning unrelated workspace history.
- Background work may refine only suggested or review-pending data. Never overwrite a transaction that the user edited, confirmed, or rejected.
- A failure in optional receipt-detail linking, Split Bills creation, QA, or enrichment must not retroactively mark an already-visible core transaction as failed.
- Record time-to-usable separately from background completion time so Clover can monitor both the immediate experience and eventual enrichment health.

## Persistent import visibility

- Persist the import record, raw source reference, parser phase, parsed-row count, and confirmed-row count before reporting progress to the browser.
- Keep routine progress polling read-only and limited to the import record. Load full settlement and account projections only at visibility, failure, or a stale recovery checkpoint.
- A navigation or browser remount must restore active progress from durable server state. Long-running parsing remains visible and can resume from its last checkpoint without re-uploading the source file.
- Do not run parsing inside a status `GET`. Recovery uses a separate resumable request with the same regional placement and execution window as normal import processing.
- Report success only after persisted transactions and account projections settle. Then invalidate Home, Accounts, Transactions, Adviser, and other dependent views so the imported result appears without a manual refresh.
- A server-owned recovery sweep must claim stale imports atomically and resume from persisted parsed rows before repeating OCR or AI extraction.
- Scheduled recovery must also drain bounded enrichment batches so cleanup continues when every browser is closed. On Hobby infrastructure, keep a nightly fallback while immediate requests and resumable browser activity remain the fast paths.

## Unfamiliar institution and currency identity

- Run trained institution parsers first. Generic identity detection must never override a dedicated parser result.
- Prefer explicit labels such as `Bank name`, `Financial institution`, `Account provider`, `Statement currency`, and `Account currency`.
- An unfamiliar institution name may be accepted from the statement header only when the document also has statement/account signals. Do not infer the user's institution from beneficiary, recipient, intermediary, payee, merchant, or transfer text.
- Support ISO currency codes and unambiguous regional symbols worldwide. Prefix-qualified symbols such as `A$`, `C$`, `S$`, `HK$`, `R$`, `CN¥`, and `JP¥` are stronger than bare symbols.
- Bare `$` and `¥` are ambiguous. Leave currency unset and retain the ambiguity evidence for review unless an explicit code, currency name, or labeled statement field resolves it.
- Statement-level currency labels outrank transaction-level foreign/original-currency amounts. Conflicting high-confidence labels must remain unresolved instead of selecting the first match.
- Preserve institution/currency confidence and evidence in detected metadata so cold-layout QA and Admin diagnostics can explain the decision.
- Treat explicit product labels such as `Account Type: Wallet`, `Wallet Account`, or `E-wallet Statement` as stronger account-type evidence than the generic `bank` fallback. A transaction description that merely mentions a wallet or wallet transfer is not enough to reclassify the account.

## Investment semantics

- Shares, units, and principal are optional fields and must only be emitted when the screenshot labels them.
- Time deposits should carry deposit, maturity, interest-rate, tenure, and maturity-date metadata when visible, but must not be represented as share/unit holdings.
- Ambiguous values belong in the review queue rather than being auto-confirmed.

### Timestamped activity lists

A transaction-history screen with multiple signed amounts represents separate events, not receipt line items. Keep date/time headings out of descriptions and retain repeated same-day purchases when timestamps differ. Generic layout rows remain pending review with raw source evidence.

Unsigned activity amounts with explicit direction labels (for example Expense paid PHP 25.00) and multiple full dates are transaction history, not a single receipt. Support a date and merchant on the same line; retain review-required status for generic fallback rows.

### Investment summary tables

- A table headed Investment, Platform, Contrib/ Month, Units/ Shares, Market Value and Valuation Date is a holdings inventory, not a transaction ledger.
- Preserve each named investment and its own platform. BPI Invest maps to BPI; GFunds funds stay separate. Do not assign every row to the last recognized provider.
- Use Market Value as the snapshot balance, Units/ Shares as quantity when present, and Valuation Date as the snapshot date. Monthly contributions are neither expenses nor total cost basis.
- Keep uncertain currency and classification review-required. A COOP entry without units must not acquire invented shares.
- Require every non-total row to parse safely; incomplete or unfamiliar OCR column layouts fail closed with an actionable message.
- Generic amount extraction must remove the date before looking for money, so a trailing year cannot become an amount.
- Deterministic investment inventories remain separate account groups during confirmation and cannot be replaced by an AI-generated expense ledger.
