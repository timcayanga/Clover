# Shared scan accuracy and speed

## What failed on the supplied photo

| Observed error | Cause and correction |
| --- | --- |
| A ₱5,566.87 allocation and an empty bill amount | The general OCR parser admitted an audit number, damaged headings and VAT summary lines as purchases. Clover now reads the bounded purchase table and checks its rows against the printed subtotal, service charge and total. The accepted table supplies the bill amount and quantities. |
| Truncated and misspelled drink names | Grouping text by horizontal position on a tilted receipt separated names from prices. The reader preserves the recognizer’s row order when that table reconciles, including wrapped descriptions. Unclear names can still need a user edit. |
| The same photo failed from a generic upload | A camera filename and statement import mode were insufficient to identify this document. Full-frame purchase and settlement evidence now sends a generic upload to receipt processing. Bank and investment screenshots still have separate routing checks. |
| A plausible but incorrect year | Two OCR hypotheses disagreed about the final year digit. The reader can independently reread that small part of the source and withhold the disputed date when it cannot corroborate either reading. |
| Another merchant’s receipt could acquire a December 2024 date and mixed payment method | Item names and a particular total triggered constants copied from a past receipt. Removed those shortcuts. The printed date, merchant evidence and payment evidence now determine these fields. |
| Slow or unavailable local preview | Reconciled purchases skip full-image reprocessing. Cached imports reuse the reading. The split preview checks cloud allowance only when it needs a provider. A cloud quota limit can no longer prevent local OCR. |

The earlier Split Bills change saves receipts in the bill list, supports incomplete bills, and handles account/category defaults and onboarding. This follow-up addresses extraction and routing. The recorded 30-second UI wait includes steps outside the measured OCR and API calls.

## Channel coverage

| Entry point | Path checked |
| --- | --- |
| Add, Transactions, account and recurring uploads, investment trade entry | Shared upload reader and import worker. A receipt photo with a generic filename was processed through a disposable database. Banking and investment screenshot fixtures exercise their own classifications. |
| Split Bills and scoped group, person and Circle receipts | Shared split-receipt preview. The actual HTTP handler processed the supplied image with offline auth, cloud quota and object-storage adapters. The test verifies the original bytes are retained. |
| Ask Clover attachments | The attachment reader reuses file bytes and sends readable text to the adviser. The OCR evidence envelope stays out of the prompt. |
| PDFs and statements | The reader reuses the first native PDF text extraction on supported fallbacks. Page completeness, password handling and OCR fallback still apply. |

## Reproduction and measured results

The supplied photo produced three drinks at ₱350, ₱480 and ₱520, a ₱1,350 subtotal, a ₱120.54 service charge and a ₱1,470.54 total dated November 19, 2026. The local split preview took 4.65 and 6.56 seconds in two runs. The import worker saved one Food & Dining transaction pending review in 4.34–5.37 seconds across replays. Reprocessing the completed source left one transaction. Using the generic filename, direct reading took 4.36 seconds, an uncached worker read took 3.22 seconds, and a repeated cached read took 6 ms. Before the shared fix the generic direct read took 8.98 seconds and returned no total or items. These are local observations, with other tests sharing this Mac.

Run the dedicated image integration from the web directory with `tsx scripts/receipt-photo-preview-integration.ts <original-jpeg>`. The test exercises the server handler and excludes upload transit, device camera time and cloud OCR. The camera, reconciliation, receipt review, source resume and retry, bank and investment screenshots, and PDF coverage suites provide separate regression coverage. The private parser run passed 44 fixtures, the portable inline contracts passed separately, and 33 public Korean and Indonesian text fixtures matched their labeled totals.

## Accuracy beyond this receipt

On a separate local diagnostic set of 11 labeled original photos, all 11 were sent to review. In the final photo replay, the shared reader and photo parser matched 7 of 11 totals, 5 of 8 labeled dates, 3 of 8 labeled merchants, and 1 of 2 labeled currencies. They matched 23 of 67 printed item descriptions exactly. Forty returned descriptions did not exactly match a labeled item. This count includes spelling differences and extra rows. Raw OCR text alone cannot establish how many were invented. Only one complete item table matched all labeled fields.

The diagnostic set is small and includes difficult photos. It provides no population accuracy estimate. The highest-value remaining checks are to compare unmatched item names and amounts to their boxes on the original, corroborate conflicting merchant/header candidates independently, and measure capture-to-visible-bill latency on physical devices with network transit and cloud fallback. Further changes should be scored on separately held-out images before expanding automatic saving. No current iPhone or Android end-to-end latency measurement is included here.

### Individual photo results

Photos follow the frozen diagnostic manifest order. The last two columns compare exact descriptions. An unmatched output can be a misspelling, a partial description, or a spurious row.

| Photo | Core field discrepancies | Descriptions matched | Unmatched output rows |
| --- | --- | --- | --- |
| 1 | merchant mismatch | 2/7 | 12 |
| 2 | date missing, total missing | 0/3 | 0 |
| 3 | merchant mismatch, currency supplied without an observable label | 9/9 | 0 |
| 4 | merchant mismatch, date supplied without an observable label, currency supplied without an observable label | 0/2 | 2 |
| 5 | merchant supplied without an observable label, date supplied without an observable label, currency supplied without an observable label | 1/11 | 11 |
| 6 | merchant missing, total missing | 0/9 | 0 |
| 7 | merchant mismatch, date missing | 0/2 | 6 |
| 8 | All observable fields matched | 2/6 | 5 |
| 9 | currency supplied without an observable label | 5/5 | 0 |
| 10 | merchant supplied without an observable label, currency supplied without an observable label, total mismatch | 4/5 | 1 |
| 11 | date missing, currency missing, total mismatch | 0/8 | 3 |
