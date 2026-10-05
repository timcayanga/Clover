# Receipt date handoff and repeated error notices

## Incident

A production camera receipt had a visible short date (`09/09/26`). The model retained that printed representation. Persistence interpreted it as a date, while the completeness gate required ISO and returned `receipt_review_required`, leaving no transaction. The import lasted approximately 22 seconds from upload registration to the failed status.

The abbreviated `Inv. No.` header also missed early receipt classification, so a photo went through general-document extraction. A separate cache bug compared a receipt quality score out of ten with percentage thresholds, preventing reuse of a valid extraction.

## Changes

- Normalize evidence-supported short dates, including two-digit years, and repeat normalization after the final vision/transcript candidate is selected. Keep original source text/model audit evidence. Ignore explicitly labeled printer/accreditation/expiry dates. Ambiguous dates remain unresolved unless existing evidence resolves them.
- Recognize abbreviated invoice headings with settlement evidence, retaining statement-table exclusions. This enables the existing compact receipt extraction path sooner.
- Convert cached receipt quality to percentages; reject cache entries with validation issues/critical findings.
- Valid receipts go through the existing transaction commit path rather than a separate draft review. Truly missing/ambiguous required fields still retain the safe incomplete draft; this patch does not invent financial fields or remove that legacy editor.
- Native: persist that an error notice was shown, retain source and import history, and reset the notice on an explicit retry. This source change needs a future native build. Existing binaries do not configure Expo Updates.
- Web: dismissed activity IDs persist across browser restarts. No financial content is put in that dismissal list.

## Verification

- Receipt regressions cover short dates, invalid dates, ambiguous dates, leap years, footer dates, original-evidence preservation, abbreviated invoice classification, and cache quality scales.
- Offline queue regression covers relaunch, retained source, unchanged error status, and explicit retry.
- `web/scripts/receipt-date-cache-db.ts --execute` uses only the dedicated loopback database on port 55439, creates/deletes a synthetic QA user, prohibits provider requests, processes a short-date cached receipt through the worker, and verifies one correct transaction after repeated processing. Measured 262 ms locally, zero cloud requests. This excludes capture, network upload, cold starts and first-time model latency; it is not a physical-device sub-10-second claim.
