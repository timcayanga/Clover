import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { resolveReceiptAccountHintToAccount } from "../lib/receipt-account-resolution";
import { resolveReceiptCategoryWithPaymentEvidence } from "../lib/receipt-transaction-classification";
import { parseReceiptText } from "../lib/split-bill";
import { getImportImageHashDistance } from "../lib/import-image-perceptual-hash";
import { buildReceiptSummaryFromReceiptTransaction } from "../lib/import-receipt-summary";
import { inferOpenAIDocumentFamily } from "../lib/openai-import-parser";
import { repairReceiptDateFromEvidence } from "../lib/receipt-date-evidence";

assert.equal(
  inferOpenAIDocumentFamily({
    fileName: "restaurant-receipt.jpg",
    text: "好食特 Restaurant. Paid via GCash. Total PHP 1,250.00.",
    detectedMetadata: null,
    importMode: "receipt",
  }),
  "generic_document",
  "Mentioning a wallet as the payment method must not send a merchant receipt through the slower wallet parser."
);
assert.equal(
  inferOpenAIDocumentFamily({
    fileName: "wallet-confirmation.jpg",
    text: "GCash Transaction Details. Express Send. Sent to Maria. Reference No. 123456.",
    detectedMetadata: null,
    importMode: "receipt",
  }),
  "wallet_screenshot",
  "A genuine wallet transfer screen must retain wallet-specific extraction."
);
assert.equal(
  repairReceiptDateFromEvidence({
    transaction_date: "2026-10-13",
    parser_evidence: {
      source_text: "Transaction date: 13 October 2025",
    },
  }).transaction_date,
  "2025-10-13",
  "The explicit printed year must repair an otherwise matching model date."
);
assert.equal(
  repairReceiptDateFromEvidence({
    transaction_date: "2026-10-13",
    parser_evidence: {
      source_text: "Transaction date: 10/13/2025",
    },
  }).transaction_date,
  "2025-10-13",
  "Numeric receipt evidence must repair the year without changing the supported month and day."
);

const receiptText = [
  "UNKNOWN MERCHANT",
  "08/16/2026",
  "POS PURCHASE APPROVED",
  "Terminal ID 883104",
  "Card No. 1014",
  "TOTAL PHP 1,250.00",
].join("\n");

const preview = parseReceiptText(receiptText);
assert.equal(preview.receiptAccountMatch?.accountName, "Card");
assert.equal(preview.receiptAccountMatch?.accountLast4, "1014");

const account = resolveReceiptAccountHintToAccount(
  preview.receiptAccountMatch,
  [
    {
      id: "rcbc-1014",
      name: "RCBC 1014",
      institution: "RCBC",
      accountNumber: "4297341138681014",
      type: "credit_card",
      currency: "PHP",
    },
    {
      id: "bpi-3012",
      name: "BPI 3012",
      institution: "BPI",
      accountNumber: "3012",
      type: "bank",
      currency: "PHP",
    },
  ]
);
assert.equal(account?.accountId, "rcbc-1014");

const committedReceiptSummary = buildReceiptSummaryFromReceiptTransaction(
  {
    fileName: "committed-receipt.png",
    importFileId: "import-committed",
    accountType: "cash",
    receiptTransaction: {
      id: "transaction-committed",
      accountId: "cash-php",
      accountName: "Cash (PHP)",
      categoryId: "food-category",
      categoryName: "Food & Dining",
      reviewStatus: "confirmed",
      date: "2026-08-30T00:00:00.000Z",
      amount: "315.75",
      currency: "PHP",
      type: "expense",
      merchantRaw: "QA SUMMIT CAFE",
      merchantClean: "QA Summit Cafe",
    },
  },
  (params) => ({
    fileName: params.fileName,
    rowsImported: params.importedRows,
    accountId: params.accountId,
    accountName: params.accountName,
    institution: params.institution,
    accountNumber: params.accountNumber,
    accountType: params.accountType,
    balance: params.balance ?? null,
    optimisticAccountId: params.optimisticAccountId,
    previewTransactions: params.previewTransactions,
    optimistic: false,
    incomeTotal: 0,
    expenseTotal: 315.75,
    netTotal: -315.75,
    topCategoryName: "Food & Dining",
    topCategoryAmount: 315.75,
    topCategoryShare: 1,
    topMerchantName: "QA Summit Cafe",
    topMerchantCount: 1,
  })
);
assert.equal(committedReceiptSummary?.previewTransactions?.[0]?.id, "transaction-committed");
assert.equal(committedReceiptSummary?.previewTransactions?.[0]?.categoryName, "Food & Dining");
assert.equal(committedReceiptSummary?.previewTransactions?.[0]?.reviewStatus, "confirmed");

assert.equal(
  resolveReceiptCategoryWithPaymentEvidence({
    proposedCategory: "Transfers",
    receiptContext: receiptText,
  }),
  "Shopping"
);
assert.equal(
  resolveReceiptCategoryWithPaymentEvidence({
    proposedCategory: "Transfers",
    receiptContext: "GCash transfer receipt. Sent via GCash to recipient account 09171234567. POS reference 9912.",
  }),
  "Transfers"
);
assert.equal(
  resolveReceiptCategoryWithPaymentEvidence({
    proposedCategory: "Transfers",
    receiptContext: "QA City Market sales receipt. Total USD 29.70.",
  }),
  null,
  "A generic Transfers guess must not override purchase-receipt merchant context."
);

const root = process.cwd();
const importModalSource = readFileSync(join(root, "components/import-files-modal.tsx"), "utf8");
const imageCompressionSource = readFileSync(join(root, "lib/import-image-compression.ts"), "utf8");
const transactionsPageSource = readFileSync(join(root, "app/transactions/page.tsx"), "utf8");
const cloverShellSource = readFileSync(join(root, "components/clover-shell.tsx"), "utf8");
const uploadDockSource = readFileSync(join(root, "components/import-upload-dock.tsx"), "utf8");
const importEventsRouteSource = readFileSync(join(root, "app/api/imports/[importId]/events/route.ts"), "utf8");
assert.equal(getImportImageHashDistance("0000000000000000", "0000000000000000"), 0);
assert.equal(getImportImageHashDistance("0000000000000000", "0000000000000001"), 1);
assert.match(
  transactionsPageSource,
  /const handlePhotoCaptureChange =[\s\S]{0,420}?openImportFiles\(files, false, "receipt"\);/,
  "PWA camera and photo-library uploads must route directly to the receipt parser."
);
assert.match(
  transactionsPageSource,
  /const importedCurrency = String\([\s\S]{0,220}?summary\.previewTransactions\?\.\[0\]\?\.currency[\s\S]{0,700}?currency: importedCurrency/,
  "a newly created foreign-currency cash account must not appear as PHP during optimistic receipt visibility"
);
assert.match(
  cloverShellSource,
  /handleQuickAddPhotoChange[\s\S]{0,420}?setQuickAddImportMode\("receipt"\)[\s\S]{0,120}?setQuickAddModal\("import"\)/,
  "The shared Camera and Receipt Photo entry points must route directly to the receipt parser on every device."
);
assert.match(
  cloverShellSource,
  /handleQuickAddFileChange[\s\S]{0,420}?setQuickAddImportMode\("statement"\)[\s\S]{0,120}?setQuickAddModal\("import"\)/,
  "The mixed-file picker must remain conservative for statement screenshots."
);
assert.match(
  cloverShellSource,
  /defaultImportMode=\{quickAddImportMode\}/,
  "The shared uploader must pass its explicit receipt or statement intent into the import modal."
);
assert.match(
  cloverShellSource,
  /shell-quick-add-popover__item--receipt[\s\S]{0,420}?Receipt Photo/,
  "Desktop and tablet users must have an explicit receipt-photo upload entry point."
);
assert.match(
  transactionsPageSource,
  /defaultImportMode=\{importSeedMode\}/,
  "The selected camera import mode must be handed to the import modal."
);
assert.match(
  importModalSource,
  /defaultImportMode = "statement"[\s\S]{0,1200}?selectedImportMode: ImportImageMode = defaultImportMode/,
  "The import modal must honor an explicit receipt mode while keeping statement uploads as the default."
);
assert.match(
  transactionsPageSource,
  /Boolean\(options\?\.background\)[\s\S]{0,180}?fetchedTransactions\.length < stableBaseTransactions\.length[\s\S]{0,180}?exactServerTotalCount <= stableBaseTransactions\.length/,
  "A settling background response must not temporarily erase already-visible transactions."
);
assert.match(
  transactionsPageSource,
  /const hasOptimisticImportedTransactions =[\s\S]{0,180}?transaction\.id\.startsWith\("optimistic-"\)/,
  "A filtered Transactions view must preserve the newly published receipt while its background read catches up."
);
assert.match(
  transactionsPageSource,
  /const shouldPreserveImportedTransactions =[\s\S]{0,260}?hasRecentImportEvidence \|\| hasOptimisticImportedTransactions/,
  "Filtered settlement reads must use the optimistic receipt marker even before import activity state rerenders."
);
assert.match(
  transactionsPageSource,
  /Receipt completion must always return Transactions[\s\S]{0,900}?setCurrencyFilter\(""\)[\s\S]{0,900}?setDateFilterMode\("ltd"\)[\s\S]{0,900}?setTransactionsPage\(1\)/,
  "Receipt completion must clear stale mobile drilldowns and return to the inclusive first page."
);
assert.match(
  transactionsPageSource,
  /postImportRefreshVersion[\s\S]{0,900}?pageOverride: 1[\s\S]{0,300}?preserveKnownTotal: true/,
  "Transactions must perform an authoritative unfiltered refresh after React commits the import reset."
);
assert.match(
  transactionsPageSource,
  /mergeImportedPreviewTransactions\(current, previewTransactions\);[\s\S]{0,180}?transactionsRef\.current = next/,
  "The import callback must expose its new receipt row to the same-turn settlement refresh."
);
assert.match(
  transactionsPageSource,
  /const isServerBackedImportSummary = previewTransactions\.some[\s\S]{0,220}?!transaction\.id\.startsWith\("optimistic-"\)/,
  "A server-backed import snapshot must remain authoritative instead of being replaced by an immediate stale list read."
);
assert.match(
  transactionsPageSource,
  /if \(!isServerBackedImportSummary && !importRefreshInFlightRef\.current\)/,
  "Server-backed import summaries must skip the immediate settlement refresh."
);
assert.match(
  transactionsPageSource,
  /const recentImportFileIds = new Set[\s\S]{0,700}?const receiptTransactionsToPreserve = getImportedTransactionsToPreserve\(transactionsRef\.current\)[\s\S]{0,500}?mergeImportedWorkspaceTransactions\([\s\S]{0,120}?receiptTransactionsToPreserve/,
  "A stale cache update must not remove a recent committed or optimistic receipt from the current workspace."
);
assert.match(
  transactionsPageSource,
  /Math\.floor\(transactions\.length \/ MOBILE_TRANSACTIONS_BATCH_SIZE\) \+ 1/,
  "Mobile pagination must continue from the 25-row first page without skipping a 12-row batch."
);
assert.match(
  transactionsPageSource,
  /setMobilePaginationExhausted\(fetchedTransactions\.length === 0 \|\| appendedUniqueTransactionCount === 0\)/,
  "Mobile pagination must stop when a server page adds no transactions."
);
assert.match(
  transactionsPageSource,
  /setWorkspaceCurrencyCodes\(\(current\) => Array\.from\(new Set\(\[\.\.\.current, \.\.\.importedPreviewCurrencyCodes\]\)\)\.sort\(\)\)/,
  "A newly imported foreign currency must become filterable before a route remount."
);
assert.match(
  transactionsPageSource,
  /Receipt completion must always return Transactions[\s\S]{0,900}?setCurrencyFilter\(""\)/,
  "Every completed receipt must return to All Currencies so a foreign-currency row cannot lock the table."
);
assert.match(transactionsPageSource, /persistSelectedCurrency\(selectedWorkspaceId, ""\)/);
assert.match(
  importModalSource,
  /file\.size > Math\.min\(imageOptimizationTarget, MAX_IMPORT_FILE_SIZE\)/,
  "Large camera photos must be optimized proactively rather than only after exceeding the upload limit."
);
assert.match(
  imageCompressionSource,
  /RECEIPT_IMPORT_IMAGE_TARGET_SIZE = 1_250_000[\s\S]{0,2000}?isReceiptProfile \? 1_800 : 2_600/,
  "Receipt photos should use a smaller upload and pixel budget without reducing statement resolution."
);
assert.match(
  importModalSource,
  /defaultImportMode === "receipt" \? "receipt" : "default"[\s\S]{0,1800}?photo_optimization_complete/,
  "Explicit receipt capture should use and measure the receipt-specific image profile."
);
assert.match(
  uploadDockSource,
  /primaryActionLabel = isComplete \|\| tone === "error" \? "Close import progress" : "Cancel upload"/,
  "The progress X must cancel an active upload and close only after completion."
);
assert.match(
  importModalSource,
  /launchInBackground\s*\|\|\s*showImportProgressDock[\s\S]{0,220}?return;/,
  "progress-only imports must not set the blocking import-modal visibility flag"
);

const workerSource = readFileSync(join(root, "workers/import-processor.ts"), "utf8");
const processRouteSource = readFileSync(join(root, "app/api/imports/[importId]/process/route.ts"), "utf8");
const openAIParserSource = readFileSync(join(root, "lib/openai-import-parser.ts"), "utf8");
const directReceiptResponseSource = importModalSource.slice(
  importModalSource.indexOf('if (resolvedResponseImportMode === "receipt" && processPayload?.receiptTransaction)'),
  importModalSource.indexOf('const importedLabel =', importModalSource.indexOf('if (resolvedResponseImportMode === "receipt" && processPayload?.receiptTransaction)'))
);
assert.doesNotMatch(
  directReceiptResponseSource,
  /router\.refresh\(\)/,
  "A durable receipt response must not be replaced by an immediate route refresh."
);
assert.match(
  processRouteSource,
  /resolvedResponseImportMode === "receipt" && visibleRows > 0[\s\S]{0,180}?loadCommittedReceiptTransactionForResponse\(importId\)/,
  "A completed receipt process response must directly recover its committed transaction when the status snapshot races the write."
);
assert.match(
  openAIParserSource,
  /OPENAI_RECEIPT_CORE_VISION_MAX_LONGEST_EDGE = 1120/,
  "The core-first server request should compact easy receipt images more aggressively than its detail pass."
);
assert.match(
  openAIParserSource,
  /useReceiptCoreImageBudget[\s\S]{0,1800}?OPENAI_RECEIPT_CORE_VISION_MAX_LONGEST_EDGE/,
  "The core-first image budget must be applied to the first model request."
);
assert.match(
  openAIParserSource,
  /useLowDetailReceiptFastPath[\s\S]{0,12000}?\? "low" : "auto"/,
  "single generic receipt photos should use low image detail for the first structured request"
);
assert.match(
  openAIParserSource,
  /structured_receipt_detail_retry[\s\S]{0,1800}?scoreReceiptExtractionCandidate/,
  "incomplete low-detail receipt reads should be compared against a high-detail retry"
);
assert.match(
  openAIParserSource,
  /const openAIReceiptCoreJsonSchema =[\s\S]{0,3600}?transactions: \{[\s\S]{0,120}?type: "array",[\s\S]{0,120}?maxItems: 0,[\s\S]{0,240}?items: \{[\s\S]{0,80}?type: "object"/,
  "ordinary receipts should use a compact core-only response contract"
);
assert.match(
  importModalSource,
  /processPayload\?\.receiptTransaction[\s\S]{0,260}?\? "receipt"[\s\S]{0,800}?resolvedResponseImportMode !== itemImportMode/,
  "server-detected receipts should switch out of the statement confirmation path"
);
assert.match(
  workerSource,
  /resolvedImportMode\?: ImportImageMode/,
  "the worker should return its final receipt versus statement decision"
);
assert.match(workerSource, /resolvedImportMode: effectiveImportMode/);
assert.match(
  processRouteSource,
  /const resolvedResponseImportMode = result\.resolvedImportMode \?\? importMode \?\? "statement";[\s\S]{0,1600}?importMode: resolvedResponseImportMode/,
  "the process response should expose a server-detected receipt mode"
);
assert.match(
  importModalSource,
  /resolvedResponseImportMode === "receipt" && processPayload\?\.receiptTransaction[\s\S]{0,2600}?onImported\(receiptSummary\)/,
  "inline receipt responses should publish their durable transaction immediately"
);
assert.match(
  openAIParserSource,
  /useReceiptCoreOnly[\s\S]{0,300}?\? 900/,
  "core receipt extraction should use a bounded output budget"
);
assert.match(
  openAIParserSource,
  /const RECEIPT_VISION_HEDGE_DELAY_MS = 2_500/,
  "slow receipt vision should have a bounded hedge delay"
);
assert.match(
  openAIParserSource,
  /const shouldHedgeSlowReceiptVision =\s*isReceiptMode &&/,
  "a slow one-page receipt read should start a bounded fallback without waiting for the primary timeout"
);
assert.match(openAIParserSource, /const firstResult = await Promise\.race\(\[primaryPromise, delayedHedgePromise\]\)/);
assert.match(
  openAIParserSource,
  /firstResult\.source === "primary"\) hedgeController\.abort\(\)[\s\S]{0,120}?primaryController\.abort\(\)/,
  "the losing hedged receipt request should be cancelled after a usable response"
);
assert.match(
  importModalSource,
  /const NEAR_VISIBLE_IMPORT_PROGRESS_POLL_INTERVAL_MS = 350/,
  "the near-visible import phase should use a short polling interval"
);
assert.match(
  importModalSource,
  /new EventSource\([\s\S]{0,180}?\/api\/imports\/\$\{importFileId\}\/events\?mode=[\s\S]{0,7000}?completionTransport: "server_sent_event"/,
  "the uploader should react to server-pushed receipt visibility while retaining polling fallback"
);
assert.match(
  importModalSource,
  /receiptModeDetectedInFlight[\s\S]{0,18000}?statusDecision\.kind === "visible"[\s\S]{0,1200}?progress: 99[\s\S]{0,700}?placing it in Transactions/,
  "A lightweight progress poll must not report 100% or refresh before the committed receipt row is available."
);
assert.match(
  importModalSource,
  /handleVisibleImportEvent[\s\S]{0,2600}?buildReceiptSummaryFromReceiptTransaction[\s\S]{0,1200}?onImported\(visibleReceiptSummary\)/,
  "server-pushed receipt visibility should publish the new row into the open transaction table"
);
assert.match(
  importEventsRouteSource,
  /receiptTransaction: snapshot\.receiptTransaction[\s\S]{0,900}?categoryName: snapshot\.receiptTransaction\.categoryName[\s\S]{0,500}?amount: snapshot\.receiptTransaction\.amount[\s\S]{0,500}?merchantClean: snapshot\.receiptTransaction\.merchantClean/,
  "the one-time visible event should carry enough receipt fields for immediate UI insertion"
);
assert.match(
  importEventsRouteSource,
  /IMPORT_STATUS_STREAM_NEAR_VISIBLE_POLL_MS = 250[\s\S]{0,8000}?processingPhase === "reconciling"/,
  "the server event stream should tighten its cadence only near visible completion"
);
assert.match(
  importEventsRouteSource,
  /let nextPollMs = IMPORT_STATUS_STREAM_ACTIVE_RECEIPT_POLL_MS/,
  "a fast camera receipt should not wait behind the general document polling cadence"
);
assert.match(
  importEventsRouteSource,
  /receiptCadenceDetected = new URL\(request\.url\)\.searchParams\.get\("mode"\) === "receipt"/,
  "An explicit receipt upload must request the fast visibility cadence."
);
assert.match(
  importEventsRouteSource,
  /receiptCadenceDetected =\s*receiptCadenceDetected \|\|[\s\S]{0,280}?nextPollMs =[\s\S]{0,420}?receiptCadenceDetected[\s\S]{0,120}?IMPORT_STATUS_STREAM_ACTIVE_RECEIPT_POLL_MS/,
  "Once a receipt is explicit or detected, its visibility stream must keep the fast cadence through persistence."
);
assert.match(
  importEventsRouteSource,
  /!visibleEventSent && Number\(progress\.confirmedTransactionsCount \?\? 0\) > 0/,
  "A committed receipt must trigger a fresh structured snapshot even if an earlier done snapshot raced the transaction write."
);
assert.match(
  importEventsRouteSource,
  /IMPORT_STATUS_STREAM_STARTUP_RETRIES = 5[\s\S]{0,5000}?for \(let attempt = 1; !importFile[\s\S]{0,700}?fetchImportFileStatusCompat\(importId\)/,
  "the visibility stream should survive the upload-record creation race"
);
assert.match(
  importModalSource,
  /processResponseSettled = true;[\s\S]{0,500}?setTimeout[\s\S]{0,300}?importEventStream\?\.close\(\)[\s\S]{0,80}?5_000/,
  "the response handoff should leave enough time for the structured visibility event"
);
assert.match(
  importEventsRouteSource,
  /export const preferredRegion = "sin1"/,
  "receipt visibility streaming should stay colocated with the import worker and database"
);
assert.match(
  workerSource,
  /visible_total_and_date_matched: true[\s\S]{0,180}?openai_call_avoided: true/,
  "perceptual receipt cache reuse must require matching visible financial evidence"
);
assert.match(
  workerSource,
  /burger\|sandwich[\s\S]{0,220}?juice\|pastry\|bread[\s\S]{0,220}?receiptContextText/,
  "common receipt food items should override an unsupported Transfers guess"
);
assert.match(
  workerSource,
  /receiptCoreOnly: effectiveImportMode === "receipt" && !receiptNeedsCompleteFirstPass/,
  "split, trained, cached, and explicitly complex receipts must stay on the complete first-pass path"
);
assert.match(
  workerSource,
  /schedulePostVisibleImportWork\(`receipt-details:\$\{importFileId\}`[\s\S]{0,5000}?preservedConfirmedCore: true/,
  "full line-item extraction should run after visibility without replacing confirmed core fields"
);
assert.match(
  workerSource,
  /RECEIPT_VISIBLE_TARGET_MS = 8_000[\s\S]{0,100}?RECEIPT_VISIBLE_SLOW_BUDGET_MS = 12_000/,
  "receipt telemetry should enforce explicit target and slow-tail budgets"
);
assert.match(
  workerSource,
  /const cashAccountIdPromise =[\s\S]{0,7000}?const \[cashAccountId, receiptCategoryId\] = await Promise\.all/,
  "receipt account resolution and category persistence should overlap on the visible path"
);
assert.match(
  importModalSource,
  /processingPhase === "reconciling" \|\| nextProgress >= 90[\s\S]{0,160}?NEAR_VISIBLE_IMPORT_PROGRESS_POLL_INTERVAL_MS/,
  "receipt visibility should be detected promptly without increasing polling throughout the entire upload"
);
assert.match(
  importModalSource,
  /const queuedImportMode =[\s\S]{0,220}?queuedImportMode !== "receipt" && !isGenericMobileScreenshotFileName/,
  "Receipt uploads must never create a transient filename-derived account."
);
const confirmBackgroundGuard = importModalSource.slice(
  importModalSource.indexOf("const confirmItemImport ="),
  importModalSource.indexOf("const getProgressDetail =")
);
assert.match(
  confirmBackgroundGuard,
  /const emitImportError =[\s\S]{0,520}?if \(!backgroundOnly\)[\s\S]{0,160}?closeImportAfterError/,
  "Optional background confirmation failures must not surface as visible import failures."
);
assert.match(
  confirmBackgroundGuard,
  /const settledVisible = backgroundOnly\s*\? true\s*:\s*await waitForSettledVisibility/,
  "A background confirmation must not re-run the blocking visible-settlement UI gate."
);
assert.match(
  workerSource,
  /const chooseBetterReceiptDetails =[\s\S]{0,1200}?candidateQuality\.score > currentQuality\.score \? candidate : current/,
  "model receipt details must not replace a more complete deterministic receipt preview"
);
assert.match(
  workerSource,
  /const isGenericReceiptMerchantLabel[\s\S]{0,1400}?merchant_raw: previewMerchant[\s\S]{0,180}?merchant_clean: previewMerchant/,
  "Generic document headings must yield to a supported merchant parsed from the receipt."
);
assert.match(workerSource, /receiptDetails = preferSpecificReceiptMerchant\(receiptDetails, receiptPreview\)/);
assert.match(
  openAIParserSource,
  /merchant must be the actual business name[\s\S]{0,280}?Test Receipt[\s\S]{0,280}?Official Receipt/,
  "The fast vision prompt must not return a document heading as the merchant."
);
assert.match(
  openAIParserSource,
  /Return transaction_date as ISO YYYY-MM-DD[\s\S]{0,220}?locale, language, and currency/,
  "Receipt vision must normalize complete dates while using visible locale evidence to resolve date order."
);
assert.match(
  workerSource,
  /effectiveImportMode === "receipt"\s*\? resolvedReceiptAccountId \?\? documentCashAccountId/,
  "receipt documents must prefer the uniquely resolved payment account over Cash"
);
assert.match(
  workerSource,
  /const receiptAccountCurrency =[\s\S]{0,180}?receiptDetails\?\.currency \?\? resolvedMetadata\.currency[\s\S]{0,500}?resolveWorkspaceCashAccountId/,
  "foreign-currency receipts must resolve their Cash account from the receipt currency, not fallback metadata"
);
assert.match(
  workerSource,
  /const cashAccountIdPromise = explicitlyResolvedReceiptAccountId[\s\S]{0,180}?resolveWorkspaceCashAccountId\(String\(importFile\.workspaceId\), receiptCurrency\)/,
  "receipt confirmation must fall back to a same-currency Cash account when there is no explicit payment-account match"
);
assert.match(
  workerSource,
  /importModeCarriesAccountBalance\(effectiveImportMode\)[\s\S]{0,160}?resolvedMetadata\.endingBalance/,
  "receipt totals must remain transaction evidence and must not be persisted as Cash ending balances"
);
assert.match(
  workerSource,
  /const receiptFileNameDate = parseDateValue\([\s\S]{0,500}?const receiptDateInferredFromFileName = !explicitReceiptDate && Boolean\(receiptFileNameDate\)/,
  "receipts with a missing extracted date should recover an explicit date from the source filename"
);
assert.match(
  workerSource,
  /reviewStatus: receiptNeedsReview \|\| receiptDateInferredFromFileName \? "pending_review" : "confirmed"/,
  "filename-inferred receipt dates must remain review-required"
);
assert.match(
  workerSource,
  /resolveReceiptCategoryWithPaymentEvidence\(\{[\s\S]{0,180}?proposedCategory: trainedCategoryName/,
  "trained receipt categories must still pass through POS-versus-transfer safety"
);
const receiptConfirmationSection = workerSource.slice(
  workerSource.indexOf('if (createdTransactionId) {', workerSource.indexOf('if (importMode === "receipt")')),
  workerSource.indexOf('if (createdTransactionId && documentImport?.id)', workerSource.indexOf('if (importMode === "receipt")'))
);
assert.match(
  receiptConfirmationSection,
  /processingMessage: "Receipt is ready\. Clover is refining names and categories in the background\."[\s\S]{0,180}?confirmedTransactionsCount: 1/,
  "receipt confirmation must publish the core transaction before post-visible detail work"
);
assert.match(
  receiptConfirmationSection,
  /upsertImportEnrichmentJob[\s\S]{0,500}?processImportEnrichmentJobsInBackground/,
  "receipt cleanup must use the durable enrichment job and post-visible scheduler"
);
assert.doesNotMatch(
  receiptConfirmationSection,
  /await processImportEnrichmentJobs\(/,
  "receipt confirmation must not wait for enrichment before becoming visible"
);
const receiptFastHandoffSection = workerSource.slice(
  workerSource.indexOf("const isFastTransactionDocument ="),
  workerSource.indexOf("try {\n    const qaRunResult", workerSource.indexOf("const isFastTransactionDocument ="))
);
assert.match(
  receiptFastHandoffSection,
  /effectiveImportMode === "receipt" \? "fast_receipt" : "fast_notes"[\s\S]{0,12000}?recordImportDataQaInBackground/,
  "receipt QA must start only after the usable transaction handoff"
);
assert.match(
  receiptFastHandoffSection,
  /effectiveImportMode === "notes" && rows\.length > 0/,
  "digital-note transactions must use the same visible-first handoff as receipts"
);
assert.match(
  receiptFastHandoffSection,
  /time_to_usable_ms/,
  "receipt handoff must emit time-to-usable telemetry"
);
assert.match(
  workerSource,
  /loadPersistedDataQaRowsForImport[\s\S]{0,2200}?params\.importMode === "receipt"[\s\S]{0,900}?persistedRows\.length > 0 \? persistedRows : parsedRowsAtHandoff/,
  "receipt QA must score the persisted visible transaction instead of an empty parser-row array"
);
assert.match(
  workerSource,
  /const usableDurationMs = Math\.max\(0, Date\.now\(\) - params\.startedAt\)[\s\S]{0,1800}?timeToUsableMs: usableDurationMs[\s\S]{0,300}?parsingMs: params\.parsingDurationMs \?\? usableDurationMs/,
  "receipt QA timing must be captured before the delayed background callback"
);
assert.doesNotMatch(
  workerSource.slice(
    workerSource.indexOf("const recordImportDataQaInBackground ="),
    workerSource.indexOf("const deleteTransactionsForImportWithTx", workerSource.indexOf("const recordImportDataQaInBackground ="))
  ),
  /totalMs: Date\.now\(\) - params\.startedAt|parsingMs: Date\.now\(\) - params\.startedAt/,
  "the QA scheduler delay must not inflate receipt processing duration"
);

assert.match(
  workerSource,
  /const initialStartIndex = Math\.max\(0, Math\.min\(totalRows, Number\(job\.lastRowIndex \?\? 0\)\)\)/,
  "enrichment retries must resume from the durable row cursor"
);
assert.match(
  workerSource,
  /candidateRows = batchRows[\s\S]{0,500}?eligibleSourceIndices\.has\(sourceRowIndex\)/,
  "enrichment must filter out ineligible rows before loading the rule engine"
);
assert.match(
  workerSource,
  /const appliedUpdates = await applyImportEnrichmentTransactionUpdates\(transactionUpdates\)/,
  "enrichment transaction writes must use one guarded bulk update per batch"
);
assert.match(
  workerSource,
  /normalizedTotalRows <= 25 \? 0 : 1_000/,
  "small-import enrichment should begin immediately and large imports should not wait five seconds"
);

const dataEngineSource = readFileSync(join(root, "lib/data-engine.ts"), "utf8");
assert.match(
  dataEngineSource,
  /loadImportEnrichmentTrainingContext[\s\S]{0,500}?Promise\.all\(\[/,
  "enrichment training inputs must load in parallel"
);
assert.match(
  dataEngineSource,
  /params\.trainingContext \?\? \(await loadImportEnrichmentTrainingContext/,
  "one training snapshot must be reusable across every batch in a job"
);

console.log("Receipt camera import regression checks passed.");
