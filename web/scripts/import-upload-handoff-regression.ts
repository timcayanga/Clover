import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readImportedFileTextWithCacheInfo } from "@/lib/import-file-text.server";
import { getImportQueueName } from "@/lib/import-queue";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const webRoot = join(scriptDir, "..");

const section = (source: string, start: string, end: string) => {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.notEqual(startIndex, -1, `Missing section start: ${start}`);
  assert.notEqual(endIndex, -1, `Missing section end: ${end}`);
  return source.slice(startIndex, endIndex);
};

const main = async () => {
  const [modalSource, passwordModalSource, processRouteSource, progressRouteSource, confirmRouteSource, workerSource, importQueueSource, importProcessorSource, importFileTextSource, statusSnapshotSource, settledVisibilitySource, filePostSource, visibilityRulesSource, transactionsPageSource, accountsPageSource, pageDropSource, globalImportActivitySource, vercelConfigSource] = await Promise.all([
    readFile(join(webRoot, "components/import-files-modal.tsx"), "utf8"),
    readFile(join(webRoot, "components/import-password-modal.tsx"), "utf8"),
    readFile(join(webRoot, "app/api/imports/[importId]/process/route.ts"), "utf8"),
    readFile(join(webRoot, "app/api/imports/[importId]/progress/route.ts"), "utf8"),
    readFile(join(webRoot, "app/api/imports/[importId]/confirm/route.ts"), "utf8"),
    readFile(join(webRoot, "workers/imports-worker.ts"), "utf8"),
    readFile(join(webRoot, "lib/import-queue.ts"), "utf8"),
    readFile(join(webRoot, "workers/import-processor.ts"), "utf8"),
    readFile(join(webRoot, "lib/import-file-text.server.ts"), "utf8"),
    readFile(join(webRoot, "lib/import-status-snapshot.ts"), "utf8"),
    readFile(join(webRoot, "lib/import-settled-visibility.ts"), "utf8"),
    readFile(join(webRoot, "lib/import-file-post.ts"), "utf8"),
    readFile(join(webRoot, "lib/import-visibility-rules.ts"), "utf8"),
    readFile(join(webRoot, "app/transactions/page.tsx"), "utf8"),
    readFile(join(webRoot, "app/accounts/page.tsx"), "utf8"),
    readFile(join(webRoot, "components/page-file-drop-zone.tsx"), "utf8"),
    readFile(join(webRoot, "components/global-import-activity.tsx"), "utf8"),
    readFile(join(webRoot, "vercel.json"), "utf8"),
  ]);
  const optimisticSummarySource = await readFile(join(webRoot, "lib/import-optimistic-summary.ts"), "utf8");
  const accountDetailsSource = await readFile(join(webRoot, "app/accounts/[accountId]/page.tsx"), "utf8");
  const accountsRouteSource = await readFile(join(webRoot, "app/api/accounts/route.ts"), "utf8");
  const uploadDockSource = await readFile(join(webRoot, "components/import-upload-dock.tsx"), "utf8");
  const globalStylesSource = await readFile(join(webRoot, "app/globals.css"), "utf8");
  const localPreparseSource = section(
    modalSource,
    "async function preparsePendingItemLocally",
    "const removeItem"
  );
  const uploadHandoffSource = section(modalSource, "const processFile", "const processResponse = await");

  assert.match(modalSource, /autoStartRef\.current = true;[\s\S]{0,500}scheduleQueuedImport\(\);/);
  assert.match(modalSource, /const scheduleQueuedImport = \(delayMs = 0\) =>/);
  assert.match(modalSource, /void handleStartImportRef\.current\(\)/);
  assert.match(modalSource, /uploadRunnerActiveRef\.current = true/);
  assert.match(modalSource, /itemsRef\.current = nextItems;\s*setItems\(nextItems\);/);
  assert.match(filePostSource, /xhr\.upload\.onload = \(\) => \{\s*onProgress\?\.\(100\);/);
  assert.match(visibilityRulesSource, /Boolean\(item\.importFileId\)[\s\S]{0,100}IMPORT_PROGRESS_PREPARING/);
  assert.match(modalSource, /scheduleQueuedImport\(150\)/);
  assert.match(modalSource, /canonical_import_adopted/);
  assert.match(modalSource, /startedImportMonitorKeys\.has\(monitorKey\)/);
  assert.match(
    modalSource,
    /startedImportMonitorKeys\.delete\(`\$\{importModalInstanceIdRef\.current\}:\$\{workspaceId\}:\$\{currentItem\.importFileId \?\? ""\}`\)/,
    "Unlocking a password-protected file must start a fresh status monitor."
  );
  assert.match(
    modalSource,
    /progress: IMPORT_PROGRESS\.uploading,[\s\S]{0,300}detail: passwordAccepted \? "Password verified\. Clover is opening the statement\."/,
    "A password retry must replace any stale completion activity with an active upload stage."
  );
  assert.match(
    modalSource,
    /const password = submittedPassword\?\.trim\(\) \?\? item\.password\.trim\(\);[\s\S]{0,700}const passwordAccepted = await validatePdfPassword\(item\.file, password\);[\s\S]{0,600}if \(passwordAccepted === false\)/,
    "A protected PDF must validate its password before it re-enters the upload pipeline."
  );
  assert.match(
    passwordModalSource,
    /value=\{passwordDraft\}[\s\S]{0,150}onChange=\{\(event\) => setPasswordDraft\(event\.target\.value\)\}[\s\S]{0,900}disabled=\{validating \|\| !passwordDraft\.trim\(\)\}[\s\S]{0,100}\{validating \? "Checking password\.\.\." : "Unlock file"\}/,
    "The password dialog must show a stable validation state instead of exposing import progress prematurely."
  );
  assert.match(
    modalSource,
    /const handleCancelPasswordImport = \(itemId: string\) =>[\s\S]{0,3000}clearImportActivity\(\);[\s\S]{0,200}onClose\(\);/,
    "Canceling the only password-protected file must clear its import activity before closing."
  );
  assert.match(
    modalSource,
    /itemsRef\.current = remainingItems;\s*setItems\(remainingItems\);/,
    "A canceled password-protected file must be removed from the imperative queue immediately."
  );
  assert.match(
    modalSource,
    /fetch\(`\/api\/imports\/\$\{encodeURIComponent\(canceledItem\.importFileId\)\}`,[\s\S]{0,100}method: "DELETE"/,
    "Canceling a staged password-protected import must retire its server record."
  );
  assert.match(
    passwordModalSource,
    /onClick=\{\(\) => onCancel\(activeFile\.id\)\}/,
    "The password backdrop and close control must cancel the active file rather than merely hide the prompt."
  );
  assert.doesNotMatch(
    passwordModalSource,
    />\s*Close\s*</,
    "The password prompt should use the top-right close control instead of a secondary Close button."
  );
  assert.doesNotMatch(
    modalSource,
    /item\.status === "needs_password" \|\|\s*hasVisibleImportData\(item, localPreparseSummaryByItemIdRef\.current\.get\(item\.id\)\)/,
    "Waiting for a password is not a completed import and must never contribute 100% progress."
  );
  assert.match(modalSource, /const settledVisible = await waitForSettledVisibility\(/);
  assert.match(
    optimisticSummarySource,
    /currency: previewTransactions\?\.\[0\]\?\.currency \?\? null/,
    "An optimistic account must retain the currency parsed from its statement rows."
  );
  assert.match(
    modalSource,
    /const resolvedProcessCurrency = normalizeInstitutionCurrency\([\s\S]{0,500}getUploadSummaryCurrencies\(localPreparseSummary\)\[0\]/,
    "Queued imports must resolve currency from server metadata or the local statement preview before publishing an account."
  );
  assert.match(
    modalSource,
    /processingPhase === "account_match_needs_confirmation"[\s\S]{0,800}await confirmItemImport\([\s\S]{0,600}currency: resolvedStatementCurrency[\s\S]{0,300}serverResolveAccount: true/,
    "An explicit statement upload must confirm a deleted-account restoration with its parsed currency."
  );
  assert.match(
    modalSource,
    /accountConfirmationPhase === "account_match_needs_confirmation"[\s\S]{0,1800}progressLabel: "Confirming account"[\s\S]{0,3000}await monitorQueuedImportAndConfirm\(/,
    "A process response that pauses for deleted-account confirmation must stay visible and resume the durable server flow."
  );
  assert.match(
    modalSource,
    /accountConfirmationPhase === "account_match_needs_confirmation"[\s\S]{0,6000}const localRecoverableSummary/,
    "Deleted-account confirmation must be handled before a local preview can be mistaken for durable success."
  );
  assert.match(
    modalSource,
    /const resolvedAccountId =\s*serverResolveAccount\s*\? null\s*:/,
    "Deleted-account restoration must let the server resolve the durable account instead of creating a browser-side placeholder."
  );
  assert.match(
    modalSource,
    /const durableAccountId =[\s\S]{0,500}confirmed\.result\?\.accountId[\s\S]{0,500}confirmedAccountSummaries/,
    "The client must publish the account ID returned by durable confirmation."
  );
  assert.match(
    modalSource,
    /currency: confirmedAccountSummary\?\.currency \?\? summaryContext\.currency \?\? null/,
    "The immediate Accounts card must prefer the server-confirmed currency over a provisional browser preview."
  );
  assert.match(
    accountsPageSource,
    /const buildOptimisticImportedAccount = \(\s*summary: UploadInsightsSummary,\s*workspaceId: string[\s\S]{0,1800}workspaceId,/,
    "An immediate imported account must retain its workspace while the durable Accounts refresh settles."
  );
  assert.match(
    accountsPageSource,
    /\.map\(\(accountSummary\) => buildOptimisticImportedAccount\(accountSummary, selectedWorkspaceId\)\)/,
    "Accounts must scope every immediate imported card to the active workspace."
  );
  assert.match(
    accountsPageSource,
    /setStatementCheckpoints\(\(current\) =>[\s\S]{0,300}!importedAccountIds\.has\(checkpoint\.accountId\)/,
    "A newly confirmed balance must not remain hidden behind the previous statement checkpoint."
  );
  assert.match(
    importProcessorSource,
    /requiresDeletedAccountConfirmation[\s\S]{0,300}!requiresDeletedAccountConfirmation[\s\S]{0,200}lastParsedRowsReady > 0/,
    "Deleted-account confirmation must return immediately instead of entering save retries."
  );
  assert.match(
    modalSource,
    /balanceSources: \[confirmedAccountSummary\?\.balance \?\? null, accountBalance\]/,
    "The immediate Accounts card must prefer the server-confirmed balance over a provisional browser preview."
  );
  assert.match(
    accountsRouteSource,
    /normalizeAccountRuleKey\(account\.name, account\.institution\) === candidateKey[\s\S]{0,200}normalizeAccountCurrency\(account\) === normalizedCurrency/,
    "Explicit-currency account creation must not reuse a same-name account in another currency."
  );
  assert.doesNotMatch(
    modalSource,
    /processingPhase === "account_match_needs_confirmation"[\s\S]{0,400}closeImportAfterError\(/,
    "A deleted-account match must not strand an explicit upload at a false terminal state."
  );
  assert.match(
    modalSource,
    /const accountOnlyImport = importedRows <= 0;[\s\S]{0,300}accountOnlyImport \? "Making accounts visible" : "Making transactions visible"/,
    "Balance-only imports must report account visibility instead of waiting on nonexistent transactions."
  );
  assert.match(
    modalSource,
    /accountOnlyImport[\s\S]{0,300}"Clover saved the balances, but the accounts are taking longer than expected to appear\./,
    "Balance-only visibility timeouts must explain that account publication is delayed."
  );
  assert.match(modalSource, /progressLabel: "Imported successfully"/);
  assert.match(
    modalSource,
    /progressFloor: Number\(itemsRef\.current\.find\(\(entry\) => entry\.id === itemId\)\?\.progress \?\? IMPORT_PROGRESS\.uploading\)/,
    "Live import polling must advance from the last visible stage, not force every server phase into one percentage."
  );
  assert.match(
    globalImportActivitySource,
    /if \(activity\.status === "done"\) \{[\s\S]{0,700}<ImportUploadDock[\s\S]{0,300}tone="success"/,
    "A background import must show an explicit success result before it is dismissed."
  );
  assert.match(
    globalImportActivitySource,
    /const completedImportDismissDelayMs = 10 \* 1000;/,
    "Completed import success should remain visible for ten seconds."
  );
  assert.match(
    modalSource,
    /if \(primaryVisibilityCompletedRef\.current\) \{[\s\S]{0,700}snapshot\?\.status === "done"[\s\S]{0,400}surface: "background"/,
    "A page remount must hand a completed foreground import to the global success dock."
  );
  assert.doesNotMatch(
    accountDetailsSource,
    /about \$\{minutes\}|less than 1 min left/,
    "Account Details must not show an uncalibrated enrichment ETA."
  );
  assert.match(
    accountDetailsSource,
    /detail: "cleaning up names and categories"/,
    "Account Details should describe active enrichment without inventing a completion time."
  );
  assert.match(
    globalImportActivitySource,
    /if \(!activity \|\| activity\.status !== "done"\) \{[\s\S]{0,1000}current\.status !== "done" \|\| current\.updatedAt !== activity\.updatedAt[\s\S]{0,400}clearImportActivity\(\);[\s\S]{0,120}setActivity\(null\);/,
    "A completed background import should dismiss its success dock without hiding a newer import."
  );
  assert.match(
    uploadDockSource,
    /className="import-upload-dock__close import-upload-dock__close--dismiss"/,
    "The import progress dismiss control must have close-only styling."
  );
  assert.match(
    globalStylesSource,
    /\.import-upload-dock__close--dismiss\s*\{[\s\S]{0,180}background: transparent;[\s\S]{0,100}box-shadow: none;/,
    "The import progress X must blend into the modal instead of rendering inside a circle."
  );
  assert.doesNotMatch(processRouteSource, /Fast preflight routed/, "Progress copy should describe user-visible work, not internal parser jargon.");
  assert.match(
    modalSource,
    /const showCompactProgress = launchInBackground && compactProgressUnlocked && progressSessionActive/,
    "A standard upload must remain in its modal; only explicitly backgrounded work may use the compact dock."
  );
  assert.match(
    modalSource,
    /const showImportProgressDock = items\.length > 0 && progressSessionActive && !activePasswordItem/,
    "Once a file is queued, the file picker must yield to the dedicated progress surface."
  );
  assert.doesNotMatch(
    modalSource,
    /useEffect\(\(\) => \{\s*if \(typeof document === "undefined" \|\| !open \|\| backgroundOnly \|\| launchInBackground \|\| showImportProgressDock\)/,
    "The active import dock must keep the global legacy dock suppressed."
  );
  assert.match(
    modalSource,
    /visibleBatchProgressFloorRef\.current = preserveMonotonicImportProgress\(/,
    "Foreground batch progress must remain monotonic while file states reconcile."
  );
  assert.match(
    modalSource,
    /queue\.every\(isPasswordUnlockedPdfBatchItem\)/,
    "Verified encrypted PDF batches should use bounded concurrent extraction."
  );
  assert.match(
    modalSource,
    /const activeProgressContribution = items\.reduce\(/,
    "Batch progress should include every in-flight file rather than only the first active item."
  );
  assert.match(
    modalSource,
    /<ImportUploadDock[\s\S]{0,1000}progress=\{visibleOverallProgress\}/,
    "The visible upload dock must receive real foreground progress, not a reset 0% display value."
  );
  assert.match(
    modalSource,
    /await monitorQueuedImportAndConfirm\(itemId, importFileId, null,[\s\S]{0,10000}backgroundOnly: false/,
    "An import without an account ID must stay in foreground reconciliation until the monitor verifies visible rows."
  );
  assert.match(
    modalSource,
    /\) : showImportProgressDock \? \(\s*<ImportUploadDock/,
    "Queued uploads must render the progress dock instead of the selected-account file-picker card."
  );
  assert.match(
    modalSource,
    /setLaunchInBackground\(backgroundOnly\);[\s\S]{0,180}importActivitySurfaceRef\.current = backgroundOnly \? "background" : "modal"/,
    "Starting an ordinary upload must not force it into the background."
  );
  assert.match(
    modalSource,
    /activity-store update can race[\s\S]{0,500}hardStopVisibleImportModal\("visible"\);/,
    "An activity-store race must settle the visible modal instead of closing it."
  );
  assert.doesNotMatch(
    modalSource,
    /hasCompletedBatchNow[\s\S]{0,500}window\.setTimeout\([\s\S]{0,250}onClose\(\)[\s\S]{0,100}, 0\)/,
    "A completed server job must not close the modal before UI visibility is verified."
  );
  assert.doesNotMatch(
    modalSource,
    /successfulImportAutoCloseTimerRef|scheduleSuccessfulImportAutoClose/,
    "A verified foreground import must keep its success confirmation visible until the user dismisses it."
  );
  assert.doesNotMatch(
    modalSource,
    /primaryVisibilityCompletedRef\.current = true;[\s\S]{0,300}onClose\(\)/,
    "Completing the visibility contract must not automatically close the foreground success state."
  );
  assert.match(
    modalSource,
    /tone=\{currentErrorItem \? "error" : hasCompletedBatch \? "success" : "default"\}[\s\S]{0,1400}summary=\{completedImportSummary\}/,
    "A completed foreground import must render an explicit success dock with its result summary before it auto-closes."
  );
  assert.match(
    uploadDockSource,
    /isComplete && tone === "success"[\s\S]{0,300}<strong>Import complete<\/strong>/,
    "The completed dock must say Import complete rather than relying on 100% alone."
  );
  assert.match(
    uploadDockSource,
    /displayedStageRef[\s\S]{0,1200}stageCandidate\.rank > displayedStageRef\.current\.rank/,
    "A long-running import must not flicker backward through earlier progress phases."
  );
  assert.match(
    globalStylesSource,
    /\.transactions-mobile-simple-row__category-icon \.category-brand-mark__glyph-icon\s*\{\s*width: 62%;\s*height: 62%;/,
    "Mobile category badges must retain the same inset artwork scale used on desktop."
  );
  assert.doesNotMatch(
    modalSource,
    /if \(\(backgroundOnly \|\| launchInBackground\) && !activePasswordItem\) \{\s*return null;/,
    "A visible import launched in the background must render its progress dock instead of disappearing."
  );
  assert.match(settledVisibilitySource, /\/progress`/);
  assert.match(
    settledVisibilitySource,
    /if \(params\.importedRows > 0 && params\.importFileId\) \{\s*return true;\s*\}/,
    "A row-backed import returned by process/confirm must use that durable response as its visibility boundary."
  );
  assert.match(
    settledVisibilitySource,
    /if \(accountId && params\.importedRows <= 0\) \{[\s\S]{0,400}waitWithStatusStream/,
    "An account-only import must still verify that its account and expected balance were published."
  );
  assert.doesNotMatch(
    settledVisibilitySource,
    /transaction\?\.importFileId === params\.importFileId/,
    "Historical statement imports must not wait for their rows to appear on page 1 of a date-sorted account feed."
  );
  assert.match(settledVisibilitySource, /params\.importedRows > 0 \? null : expectedBalance/);
  assert.doesNotMatch(
    settledVisibilitySource,
    /parsedRowsCount >= params\.importedRows/,
    "Parsed staging rows must not satisfy the transaction visibility contract."
  );
  assert.match(
    confirmRouteSource,
    /importFile\.status === "done"[\s\S]{0,800}savedTransactionsCount >= recordedConfirmedTransactions/,
    "Repeated confirmation requests should return the already committed import without rerunning confirmation."
  );
  assert.match(
    confirmRouteSource,
    /importFile\.status === "queued" \|\| importFile\.status === "processing"[\s\S]{0,1600}if \(canTakeOverStrandedConfirmation\)[\s\S]{0,1600}status: "staged"/,
    "The confirmation endpoint must return a cheap staged response unless parsed rows have genuinely stopped progressing."
  );
  assert.match(
    modalSource,
    /const maxStagedAttempts = backgroundOnly \? 90 : 15;/,
    "Background confirmation should wait for the worker result without timing out before a normal statement save completes."
  );
  assert.match(
    modalSource,
    /progressLabel: "Saving transactions"[\s\S]{0,600}Clover is saving transactions to your workspace\./,
    "The modal must not report 100% before the transactions are durable and visible."
  );
  assert.match(
    modalSource,
    /const receiptImportedRows = Math\.max\([\s\S]{0,900}await waitForSettledVisibility\(/,
    "Receipt completion must wait for its committed transaction before publishing 100%."
  );
  const duplicateSource = section(modalSource, "if (processPayload?.duplicate)", "capturePostHogClientEvent(\"import_parsed_successfully\"");
  assert.doesNotMatch(duplicateSource, /incomeTotal:\s*0/);
  assert.doesNotMatch(duplicateSource, /await Promise\.resolve\(onImported/);
  assert.doesNotMatch(duplicateSource, /router\.refresh\(\)/);
  assert.match(duplicateSource, /return \{ status: "done", importedRows: 0, summary: null \}/);
  assert.doesNotMatch(
    transactionsPageSource,
    /pendingImportSummary\.optimistic[\s\S]{0,500}setImportOpen\(false\)/,
    "The transactions page must not close the modal before its visibility contract completes."
  );
  assert.doesNotMatch(
    accountsPageSource,
    /pendingImportSummary\.optimistic[\s\S]{0,500}setImportOpen\(false\)/,
    "The Accounts page must leave success timing to the import modal instead of closing it as soon as the account appears."
  );
  assert.match(transactionsPageSource, /const importedTransactionsRefreshDelays = \[400\]/);
  assert.match(
    transactionsPageSource,
    /await Promise\.all\(\[\s*loadWorkspaceMetadata[\s\S]{0,500}loadTransactionsPage/,
    "Post-import settlement must avoid sequential database retry bursts."
  );
  assert.match(
    accountsPageSource,
    /const resolvedBankLabel = row\.institution \?\? relatedTransactionInstitution \?\? checkpointInstitution \?\? null/,
    "An Accounts card must prefer its confirmed account identity over provisional checkpoint metadata."
  );
  assert.match(
    importProcessorSource,
    /accountName: account\.name,[\s\S]{0,250}institution: account\.institution,[\s\S]{0,250}accountType: account\.type,[\s\S]{0,700}publishedAccountSummaries/,
    "Import finalization must write the confirmed account identity back to its checkpoint metadata."
  );
  assert.match(
    importProcessorSource,
    /groupIsSnapshotOnly[\s\S]{0,500}groupEndingBalance === null[\s\S]{0,450}data: \{ balance: "0" \}/,
    "A newly detected snapshot account without a visible balance must settle at zero instead of remaining indeterminate."
  );
  assert.match(
    importProcessorSource,
    /isDeterministicPdaxPortfolioSnapshot[\s\S]{0,6000}replaceInvestmentHoldingsCompat/,
    "A PDAX portfolio bucket must not be persisted as a fake investment holding."
  );
  assert.match(
    importProcessorSource,
    /Portfolio buckets \(PHP, Crypto, Bonds, Gold\) are totals, not[\s\S]{0,700}if \(!symbol \|\| !assetName \|\| quantity === null \|\| marketValue === null\)/,
    "PDAX snapshot buckets require a visible instrument symbol, name, quantity, and value before becoming holdings."
  );
  assert.match(
    accountsPageSource,
    /const hasResolvedBalance[\s\S]{0,220}return Number\.isFinite\(numeric\);/,
    "A confirmed zero balance must be treated as a settled account value, not loading."
  );
  assert.match(
    accountsPageSource,
    /const hasAuthoritativeBalances = expectedSummaries\.every\([\s\S]{0,400}accountSummary\.optimistic === false[\s\S]{0,1200}acceptConfirmedZeroBalances: hasAuthoritativeBalances/,
    "Accounts must distinguish a confirmed zero from a provisional zero while an import settles."
  );
  assert.match(
    accountDetailsSource,
    /typeof nextAccount\.balance === "string" && nextAccount\.balance\.trim\(\)[\s\S]{0,120}\? nextAccount\.balance/,
    "Account Details must accept an explicit live zero instead of restoring a stale cached amount."
  );
  assert.match(
    accountsPageSource,
    /const refreshImportedAccountProjection = \([\s\S]{0,300}summary: UploadInsightsSummary,[\s\S]{0,3600}const retryDelaysMs = \[0, 350, 750, 1_250, 2_000\][\s\S]{0,2200}accountProjectionMatchesImport/,
    "Every import must keep refreshing Accounts until the authoritative balance reflects the confirmed import."
  );
  assert.match(
    accountsPageSource,
    /const accountProjectionRefreshesRef = useRef\([\s\S]{0,180}new Map<string, \{ key: string; promise: Promise<void> \}>\(\)/,
    "Accounts must track active projection refreshes by workspace."
  );
  assert.match(
    accountsPageSource,
    /const activeRefresh = accountProjectionRefreshesRef\.current\.get\(workspaceId\);[\s\S]{0,180}activeRefresh\?\.key === refreshKey[\s\S]{0,120}return activeRefresh\.promise;/,
    "Duplicate import-completion signals must share one account projection refresh instead of racing independent request loops."
  );
  assert.match(
    accountsPageSource,
    /const persistAccountsWorkspaceSnapshot = useCallback\([\s\S]{0,650}workspaceCacheWriteDepthRef\.current \+= 1[\s\S]{0,500}workspaceCacheWriteDepthRef\.current -= 1/,
    "Accounts must bracket its own cache persistence writes."
  );
  assert.match(
    accountsPageSource,
    /const handleWorkspaceCacheUpdated = \(event: Event\) => \{[\s\S]{0,500}workspaceCacheWriteDepthRef\.current > 0[\s\S]{0,80}return;/,
    "Accounts must ignore the synchronous cache event emitted by its own persistence write."
  );
  assert.match(
    accountsPageSource,
    /const getUploadAccountLoadingContext = \(account: Account\)[\s\S]{0,800}const latestCheckpoint = getLatestCheckpointForAccount\(account, statementCheckpoints\)/,
    "Account cards and totals must use the same canonical checkpoint resolver."
  );
  assert.match(
    accountsPageSource,
    /await refreshImportedAccountProjection\(settledSummary\)[\s\S]{0,500}setMessage\("Import complete\. Accounts and Transactions are updated\."\)/,
    "Accounts must finish projection settlement before reporting an import as updated."
  );
  assert.match(
    accountsPageSource,
    /const POST_IMPORT_RECONCILIATION_DELAYS_MS = \[2_500, 7_500, 15_000\] as const/,
    "Accounts must keep reconciling slower server-side balance projections after the import modal completes."
  );
  assert.match(
    accountsPageSource,
    /const schedulePostImportWorkspaceReconciliation = \(workspaceId: string\)[\s\S]{0,1700}awaitHydration: true,[\s\S]{0,300}forceFresh: true/,
    "Post-import reconciliation must use fresh, fully hydrated account data instead of a cached projection."
  );
  assert.match(
    accountsPageSource,
    /await refreshImportedAccountProjection\(settledSummary\)[\s\S]{0,300}schedulePostImportWorkspaceReconciliation\(selectedWorkspaceId\)/,
    "An Accounts-page upload must schedule continued balance reconciliation without delaying import success."
  );
  assert.match(
    transactionsPageSource,
    /importRefreshInFlightRef\.current = true;[\s\S]{0,250}await refreshTransactionsAfterImport\(selectedWorkspaceId\)/,
    "Transactions imports must wait for their first authoritative refresh before reporting success."
  );
  assert.match(
    accountsPageSource,
    /optimistic-import-\$\{\[summary\.fileName, summary\.institution \?\? "", summary\.accountName, summary\.accountNumber \?\? ""\]/,
    "An account-only import must retain a temporary card when its canonical account ID is still pending."
  );
  assert.match(
    modalSource,
    /seedImportedWorkspaceCaches\(workspaceId, queuedVisibleSummary\)/,
    "The global import flow must publish visible account summaries into the workspace cache."
  );
  assert.match(
    accountsPageSource,
    /const completedImportRefreshKeyRef = useRef<string \| null>\(null\);/,
    "Accounts must retain a per-import refresh key to prevent duplicate hydration work."
  );
  assert.match(
    accountsPageSource,
    /removedStalePdaxBucketHoldings[\s\S]{0,700}void loadWorkspaceData\(workspaceId, \{ silent: true, awaitHydration: true \}\);/,
    "Accounts must adopt a maintenance repair that removes stale PDAX portfolio buckets without a manual reload."
  );
  assert.match(
    accountsPageSource,
    /importActivityIsComplete\(importActivitySnapshot\)[\s\S]{0,1400}forceFresh: true/,
    "Accounts must rehydrate from completed imports, including zero-transaction account inventories, without a manual page reload."
  );
  assert.match(
    accountsPageSource,
    /subscribeImportedSummary\(\(\{ workspaceId, summary \}\)[\s\S]{0,1000}refreshImportedAccountProjection\(summary\)/,
    "Accounts must react to imports completed through Clover's global uploader."
  );
  assert.match(
    accountsPageSource,
    /useState<ReturnType<typeof readImportActivity>>\(null\)/,
    "Accounts must restore browser import activity after mount so the server and first client render remain hydration-safe."
  );
  assert.match(
    accountsPageSource,
    /clearRepublishedWorkspaceAccountDeletionMarkers\(workspaceId, republishedInventoryAccountIds\)/,
    "A completed inventory import must clear stale browser deletion markers for accounts the server explicitly republished."
  );
  assert.match(
    transactionsPageSource,
    /nextIsEmpty && currentHasValue && mergedTransactionsWithImports\.length > 0\)/,
    "Visible transactions must not be paired with an empty cash-flow summary."
  );
  assert.match(
    transactionsPageSource,
    /nextFinancialsAreEmpty && currentFinancialsHaveValue && hasRecentImportEvidence/,
    "A transient empty aggregate response must not erase cash-flow cards during import settlement."
  );
  assert.match(
    transactionsPageSource,
    /nextTransactionsSnapshot[\s\S]{0,1200}buildVisibleTransactionSummary/,
    "Imported preview rows should update transaction cards in the same UI commit."
  );
  assert.match(
    modalSource,
    /const emittedSummaries = await Promise\.all\(serverAccountSummaries\.map\(async \(accountSummary\) =>/,
    "Multi-account workbook previews should hydrate concurrently instead of adding one serial request per account."
  );
  assert.match(
    modalSource,
    /for \(const accountUploadSummary of emittedSummaries\)[\s\S]{0,800}await Promise\.resolve\(onImported\(combinedSummary\)\)/,
    "A multi-account workbook should publish one coherent Accounts and Transactions update."
  );
  assert.match(
    transactionsPageSource,
    /The visible table is intentionally paged\.[\s\S]{0,650}getCachedTransactionsWorkspace\(selectedWorkspaceId \?\? ""\)\?\.summary\?\.totalCount/,
    "Optimistic preview rows must preserve the known workspace total until the authoritative page refresh arrives."
  );
  assert.doesNotMatch(modalSource, /if \(busy \|\| !workspaceId \|\| !autoStartRef\.current\)/);
  assert.match(modalSource, /const incomingKeys = new Set\(nextFiles\.map\(fileKey\)\)/);
  assert.match(modalSource, /const serverImportStillActive = hasActiveServerImport\(itemsRef\.current\)/);
  assert.match(modalSource, /reportImportClientStage\("file_input_changed"/);
  assert.doesNotMatch(
    localPreparseSource,
    /requestPasswordForItem/,
    "Advisory local parsing must not block upload by opening the password flow."
  );
  assert.match(uploadHandoffSource, /postFileWithProgress\(/);
  assert.match(modalSource, /const IN_FLIGHT_IMPORT_PROGRESS_INITIAL_DELAY_MS = 400;/);
  assert.match(modalSource, /const IN_FLIGHT_IMPORT_PROGRESS_POLL_INTERVAL_MS = 500;/);
  assert.match(
    uploadHandoffSource,
    /fetch\(`\/api\/imports\/\$\{importFileId\}\/progress`, \{ cache: "no-store" \}\)/,
    "The modal should read durable server phases from the lightweight endpoint while the multipart request is open."
  );
  assert.doesNotMatch(uploadHandoffSource, /\/status`, \{ cache: "no-store" \}/);
  assert.doesNotMatch(progressRouteSource, /confirmImportFile|processImportFileText|loadImportStatusSnapshot|updateImportFileCompat/);
  assert.match(progressRouteSource, /visibleImportComplete: confirmedTransactionsCount > 0/);
  assert.match(
    uploadHandoffSource,
    /statusDecision\.kind === "visible"[\s\S]{0,900}status: "done"[\s\S]{0,900}progress: 100[\s\S]{0,1200}router\.refresh\(\)/,
    "Durably committed rows should show an explicit 100% success and refresh the current page before the process response finishes."
  );
  assert.match(processRouteSource, /sourceFingerprint: fileFingerprint/);
  assert.match(
    processRouteSource,
    /const shouldProcessHighConfidenceTextPdfInline =[\s\S]{0,350}parsedMetadataConfidence >= 85/,
    "Small, high-confidence text PDFs should use the inline statement path instead of waiting for queue handoff."
  );
  assert.match(
    processRouteSource,
    /const shouldQueueBackupRouteImmediately =[\s\S]{0,700}localDev &&/,
    "Serverless backup-routed PDFs must not rely on a best-effort post-response queue before confirmation."
  );
  assert.match(
    processRouteSource,
    /const shouldQueuePdfImmediately =[\s\S]{0,700}localDev &&/,
    "Serverless PDFs must remain on the durable inline path instead of becoming stranded queued_retry imports."
  );
  assert.match(
    processRouteSource,
    /const shouldQueueStatementImageAfterUpload =\s*localDev && isStatementImageUpload/,
    "Production statement screenshots must stay on the durable inline request path."
  );
  const statusRouteSource = await readFile(join(webRoot, "app/api/imports/[importId]/status/route.ts"), "utf8");
  const staleStatementImageQueueSource = section(statusRouteSource, "if (staleStatementImageQueue)", "const staleStatementImageEmptyDone");
  assert.doesNotMatch(
    staleStatementImageQueueSource,
    /after\(async \(\) =>/,
    "A stranded screenshot must be recovered by the status request, not another best-effort callback."
  );
  assert.match(
    statusRouteSource,
    /const isRecoverableStatementFile[\s\S]{0,300}application\/pdf[\s\S]{0,300}avif\|pdf/,
    "Import status recovery must include PDF statements, not only screenshots."
  );
  const staleStatementReconcilingSource = section(
    statusRouteSource,
    "if (staleStatementImageReconciling)",
    "const staleStatementImageStaged"
  );
  assert.doesNotMatch(
    staleStatementReconcilingSource,
    /after\(async \(\) =>/,
    "A parsed statement stranded during final save must be confirmed inside the recovery request."
  );
  assert.match(
    confirmRouteSource,
    /canTakeOverStrandedConfirmation[\s\S]{0,1500}confirmImportFile\(importId, payload\.accountId \?\? null,[\s\S]{0,200}allowDeletedAccountRecreation: true/,
    "Confirmation polling must take over a parsed import when the original worker stops progressing."
  );
  const confirmationAccountsSource = section(
    importProcessorSource,
    "const confirmationAccountGroups",
    "const account = accountByGroupKey"
  );
  assert.match(
    confirmationAccountsSource,
    /\{ throwOnError: true \}/,
    "Account-resolution errors must reach the import route instead of being replaced by a generic missing-account error."
  );
  assert.match(
    transactionsPageSource,
    /const shouldPreserveImportedTransactions =[\s\S]{0,180}!hasServerSideFilters &&\s*\(requestPage === 1 \|\| Boolean\(options\?\.append\)\)/,
    "Optimistic import rows must not be merged into later server-paginated transaction pages."
  );
  const confirmationSource = section(importProcessorSource, "export const confirmImportFile", "if (isDocumentImport)");
  assert.match(
    confirmationSource,
    /planLimits\?\.transactionLimit != null/,
    "Unlimited workspaces must not calculate transaction usage on the visible import-confirmation path."
  );
  assert.doesNotMatch(
    confirmationSource,
    /Promise\.all\(\[[\s\S]{0,240}getWorkspaceOwnerPlanUsage/,
    "The transaction-usage aggregate must not run in parallel for every confirmation."
  );
  assert.match(
    processRouteSource,
    /if \(importId && isTransientDatabaseCapacityError\(error\)\) \{[\s\S]{0,1200}if \(!localDev\) \{[\s\S]{0,1200}status: "failed"[\s\S]{0,1200}code: "I-107"/,
    "A serverless database-capacity error must become a retryable failure, not an unconsumed queued_retry job."
  );
  assert.ok(
    processRouteSource.indexOf('const importProcessorPromise = import("@/workers/import-processor");') <
      processRouteSource.indexOf("const formData = await _request.formData();"),
    "The import worker should begin loading before multipart decoding so cold module startup overlaps the upload handoff."
  );
  assert.doesNotMatch(
    processRouteSource,
    /await import\("@\/workers\/import-processor"\)/,
    "Import processing should reuse the request-started worker load instead of starting a late module import on the critical path."
  );
  assert.ok(
    processRouteSource.indexOf('const importFileTextPromise = import("@/lib/import-file-text.server");') <
      processRouteSource.indexOf("const formData = await _request.formData();"),
    "The extraction module should begin loading before multipart decoding so cold PDF readers overlap the upload handoff."
  );
  assert.match(
    processRouteSource,
    /const rawStorageKey = String\(importFile\.storageKey[\s\S]{0,220}const uploadPromise = uploadObject\(rawStorageKey, bytes/,
    "Raw-file storage should begin immediately after byte validation, before duplicate-import reconciliation."
  );
  assert.match(
    processRouteSource,
    /export const preferredRegion = "sin1"/,
    "The database-heavy import processor must run in Singapore with Clover's database."
  );
  assert.deepEqual(
    JSON.parse(vercelConfigSource).regions,
    ["sin1"],
    "Vercel project configuration must place generated functions in Singapore, not only rely on route metadata."
  );
  assert.doesNotMatch(
    processRouteSource,
    /const reusableRawImport = await prisma\.importFile\.findFirst/,
    "A cross-import raw-file lookup must not delay starting the new upload."
  );
  assert.match(processRouteSource, /canonicalImportFileId: canonicalImport\.id/);
  assert.match(processRouteSource, /candidateIndex < currentCandidateIndex/);
  assert.doesNotMatch(
    pageDropSource,
    /window\.addEventListener\("drop", handleDrop/,
    "One physical drop must not be delivered once by window and again by document."
  );
  assert.match(processRouteSource, /countTransactionsByImportFileCompat\(candidate\.id\)/);
  assert.match(
    processRouteSource,
    /const activeCanonicalImportCutoff = new Date\(Date\.now\(\) - 90 \* 1000\)/,
    "An in-flight duplicate owner must have a bounded freshness window."
  );
  assert.match(
    processRouteSource,
    /candidate\.updatedAt >= activeCanonicalImportCutoff[\s\S]{0,300}candidate\.processingPhase !== "queued_retry"/,
    "A stale or queued-retry import with no committed transactions must not become the canonical duplicate owner."
  );
  assert.doesNotMatch(
    processRouteSource,
    /const canonicalVisible = Boolean\([\s\S]{0,300}canonicalParsedRows > 0/,
    "Parsed staging rows must not make an import visible or eligible as a duplicate."
  );
  assert.match(
    processRouteSource,
    /const cachedDocRecordPromise = shouldUseCachedExtractionRecord[\s\S]{0,700}if \(!allowDuplicateStatement\)/,
    "The extraction-cache lookup should overlap canonical-import election instead of waiting behind it."
  );
  assert.match(
    processRouteSource,
    /rawFileReady:\s*canProcessImageFromRequestBytes \|\| canExtractPdfFromRequestBytes\s*\? uploadPromise\s*:\s*null/,
    "Request-byte PDFs should overlap storage and parsing, with the worker preserving the raw-file write boundary."
  );
  assert.match(
    processRouteSource,
    /const shouldProcessInlineSpreadsheet = canProcessSpreadsheetFromRequestBytes/,
    "Spreadsheet request bytes should use the deterministic inline path instead of a second background handoff."
  );
  assert.match(
    processRouteSource,
    /Unable to finish spreadsheet raw file upload/,
    "Spreadsheet parsing may run from immutable request bytes, but the raw workbook upload must remain scheduled for audit."
  );
  assert.match(processRouteSource, /await uploadPromise;[\s\S]{0,500}processingMessage: canonicalStillProcessing/);
  assert.match(importProcessorSource, /sourceFingerprint: importFile\.sourceFingerprint/);
  assert.match(
    importProcessorSource,
    /const documentCheckpointPromise =[\s\S]{0,600}Promise\.all\(\[[\s\S]{0,400}documentCheckpointPromise/,
    "Confirmation should overlap checkpoint loading with plan-limit reads instead of serializing database round trips."
  );
  assert.match(
    importProcessorSource,
    /const confirmationInputsPromise = \(async \(\) => \{[\s\S]{0,7000}const confirmationReadSnapshotPromise = confirmationInputsPromise\.then/,
    "Confirmation should start matching reads before it enters the statement transaction."
  );
  assert.match(
    importProcessorSource,
    /const \[confirmationReadSnapshot, readSnapshotReadyAt\] = await Promise\.all\([\s\S]{0,180}const \[existingCategories, workspaceAccountsForTransferMatching, existingRowsForAccount\] = confirmationReadSnapshot;/,
    "Confirmation should reuse the preloaded matching reads instead of serializing them in the transaction."
  );
  assert.match(importProcessorSource, /countTransactionsByImportFileCompat\(sourceMatch\.id\)/);
  assert.match(importProcessorSource, /already imported and skipped the duplicate/);
  assert.match(
    settledVisibilitySource,
    /if \(params\.importedRows > 0 && params\.importFileId\) \{\s*return true;/,
    "A committed statement result should not wait for an additional client-side visibility poll."
  );
  assert.match(
    importProcessorSource,
    /const shouldMaterializeAccountBeforeConfirmation =\s*effectiveImportMode === "portfolio" \|\| effectiveImportMode === "account_detail"/,
    "Only account-document imports should materialize accounts before confirmation; statements should not pay for account matching twice."
  );
  const templateLearningSource = section(
    importProcessorSource,
    "const runTemplateLearning = async () =>",
    'if (await hasCompatibleTable("AccountStatementCheckpoint"))'
  );
  assert.match(
    templateLearningSource,
    /schedulePostVisibleImportWork\(`template-learning:\$\{importFileId\}`,[\s\S]{0,900}10_000\);/,
    "Statement-template learning must run after the import becomes visible so rule promotion cannot contend with account persistence."
  );
  assert.doesNotMatch(
    templateLearningSource,
    /void runTemplateLearning\(\)/,
    "Small statements must not start template promotion on the visible-row critical path."
  );
  assert.match(
    importProcessorSource,
    /const preliminaryNeedsVisualBackupAssets =[\s\S]{0,300}!textForParse\.trim\(\)[\s\S]{0,300}!preliminaryHasKnownInstitution/,
    "Readable PDFs from known institutions should not prefetch heavy visual backup assets."
  );
  assert.match(
    importProcessorSource,
    /shouldUseVisionFallback && needsVisualBackupAssets/,
    "Backup validation should only render PDF pages when the document genuinely requires vision."
  );
  assert.match(
    importFileTextSource,
    /nodeRequire\.resolve\("pdfjs-dist\/package\.json"\)[\s\S]{0,700}standardFontDataUrl/,
    "The server PDF reader should resolve packaged PDF.js standard fonts instead of emitting one warning per page."
  );
  assert.match(importProcessorSource, /textCacheInfo\?\.fileFingerprint[\s\S]{0,180}importFile\.sourceFingerprint/);
  assert.doesNotMatch(
    uploadHandoffSource,
    /await extractTextFromFile/,
    "The original file must reach the server without waiting for browser-side parsing."
  );
  assert.ok(
    (processRouteSource.match(/if \(isImportPasswordError\(error, errorMessage\)\) \{\s*throw error;/g) ?? []).length >= 2,
    "Both server PDF preflight paths must return password errors to the API boundary."
  );
  assert.match(workerSource, /if \(isPdfPasswordError\(error\)\) \{\s*job\.discard\(\);/);
  assert.match(workerSource, /processingPhase: "password_required"/);
  assert.match(workerSource, /getImportQueueName\(\)/, "The worker and producer must share the environment-scoped queue.");
  assert.match(importQueueSource, /getDeploymentEnvironment\(\)/);
  const originalVercelEnvironment = process.env.VERCEL_ENV;
  const originalNodeEnvironment = process.env.NODE_ENV;
  try {
    process.env.VERCEL_ENV = "production";
    assert.equal(getImportQueueName(), "import-processing");
    process.env.VERCEL_ENV = "preview";
    assert.equal(getImportQueueName(), "import-processing-staging");
    delete process.env.VERCEL_ENV;
    process.env.NODE_ENV = "development";
    assert.equal(getImportQueueName(), "import-processing-local", "Local QA must never consume staging or production import jobs.");
  } finally {
    if (originalVercelEnvironment === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = originalVercelEnvironment;
    if (originalNodeEnvironment === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalNodeEnvironment;
  }
  assert.match(
    importFileTextSource,
    /if \(!pdfJsBaseUrl \|\| isPdfPasswordError\(error\)\) \{\s*throw error;/,
    "Password failures must not repeat PDF extraction before prompting the user."
  );
  const pdfOcrRoutingSource = section(importFileTextSource, "const shouldPreferPdfOcrFirst", "const shouldAvoidPdfRenderForServerless");
  assert.doesNotMatch(pdfOcrRoutingSource, /bank cert|bank-cert|bankstatementandbankcert/);
  assert.match(processRouteSource, /resolveImportFileExtractionCacheVersion\(effectiveFileName\)/);
  assert.match(importFileTextSource, /v12-pdf-text-first|resolveImportFileExtractionCacheVersion/);
  assert.match(importProcessorSource, /SELECT pg_advisory_xact_lock/);
  assert.match(importProcessorSource, /SELECT 1::int AS acquired FROM confirmation_lock/);
  assert.match(
    importProcessorSource,
    /const lockedImportFile = await tx\.importFile\.findUnique\([\s\S]{0,900}savedTransactionsCount >= lockedConfirmedTransactions/,
    "A competing confirmation request must return the first committed result after it acquires the statement lock."
  );
  assert.doesNotMatch(importProcessorSource, /SELECT pg_try_advisory_xact_lock/);
  assert.match(statusSnapshotSource, /confirmedTransactionsCount > confirmedTransactionsCountBefore/);
  const directBytesText = await readImportedFileTextWithCacheInfo({
    storageKey: "qa/nonexistent/direct-request-bytes.csv",
    fileType: "text/csv",
    fileName: "direct-request-bytes.csv",
    importMode: "statement",
    sourceBytes: new TextEncoder().encode("date,amount,merchant\n2026-07-19,12.34,QA"),
  });
  assert.match(
    directBytesText.text,
    /12\.34,QA/,
    "Request-byte extraction must not download the just-uploaded file from storage."
  );
  assert.match(
    importProcessorSource,
    /if \(options\.rawFileReady\) \{\s*await options\.rawFileReady;/,
    "Normalized import writes must wait for durable raw-file storage."
  );
  assert.match(
    importProcessorSource,
    /cachedRowsMatchCurrentParser &&/,
    "Cached extracted text may be reused only when its parsed rows still match the current deterministic parser."
  );

  console.log("[PASS] Uploads start immediately, while encrypted files prompt once instead of entering parser retries.");
};

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
