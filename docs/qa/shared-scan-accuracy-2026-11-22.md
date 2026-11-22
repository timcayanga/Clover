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

## Follow-up on the same 11 original photos

The shared server reader was replayed on the same byte-verified originals and frozen labels before and after the second set of changes. Timing covers local extraction on this Mac. It excludes network upload, cloud processing and time to display the bill on a phone. These photos were used to diagnose the errors and therefore do not provide an independent estimate of accuracy on new receipts.

| Measurement | Before | After |
| --- | ---: | ---: |
| Printed total | 7/11 | 11/11 |
| Merchant | 3/8 | 7/8 |
| Purchase date | 5/8 | 7/8 |
| Currency | 1/2 | 1/2 |
| Item description | 23/67 | 47/67 |
| Quantity | 12/67 | 27/67 |
| Unit price | 1/15 | 13/15 |
| Line amount on a matched item | 23/67 | 47/67 |
| Unmatched output descriptions | 40 | 14 |
| Photos with every labeled item field exact | 1/11 | 3/11 |
| Median reader time | 6.56 s | 4.40 s |
| Slowest reader time | 17.38 s | 10.16 s |

Steeply tilted photos could pair a drink with the price on the next row. The OCR reader now estimates steeper slopes when multiple text regions independently support the angle. The parser can match a printed quantity and price on a separate line to the item above it, check a printed quantity column against the total count, and check purchase rows against a subtotal. It recovers a damaged payable amount only when the visible digits agree with the independently reconciled items and service charge. Explicitly conflicting totals still require review. A paid sales invoice with matching total and payment can be recognized while an outstanding balance continues to block that rule.

Unnecessary second full-image reads also delayed previews. A verified item table and matching printed payable total now allow the reader to return earlier. Blank captures previously triggered the OCR worker's failure cooldown, delaying the next readable upload. A successful scan containing no text now leaves the worker available. Generic service and VAT labels no longer supply a peso currency by themselves. Receipt editors preserve a verified amount when only the currency needs attention.

| Photo | Exact descriptions | Unmatched outputs | Remaining discrepancy or review outcome |
| --- | ---: | ---: | --- |
| 1 | 7/7 | 0 | Observable core fields and names matched. |
| 2 | 3/3 | 0 | Tilted rows recovered. A merchant was suggested where the independent label could not establish one. |
| 3 | 9/9 | 0 | Merchant punctuation still differs. |
| 4 | 2/2 | 0 | Observable core fields and names matched. |
| 5 | 10/11 | 1 | One description still differs from the label. |
| 6 | 4/9 | 5 | The quantity column is better separated, but five names differ and the reader suggested a date without an observable label. |
| 7 | 1/2 | 1 | One wrapped description still differs. |
| 8 | 1/6 | 5 | Five descriptions differ, up from four before. Arithmetic reconciliation established the prices but did not establish the spelling. |
| 9 | 5/5 | 0 | All names matched. No unsupported currency was supplied. |
| 10 | 5/5 | 0 | Total and names now match. |
| 11 | 0/8 | 2 | The total was recovered. Date and currency are missing and none of the eight descriptions matched. |

All 11 results went to review. The next accuracy work should compare the affected item crops with an independent reading, particularly on photos 6, 8 and 11, then check new photos before extending automatic acceptance. Physical capture-to-visible-bill latency remains unmeasured in this replay.

The supplied Spirits Library JPEG also passed through the local Split Bills HTTP preview immediately after a blank capture. The handler returned the three labeled drinks, November 19, 2026, the 120.54 service charge and the 1,470.54 total in 3.52 seconds with offline adapters.

## Third pass on original photos and scan routes

A 253 × 450 receipt thumbnail explained the largest item failure. At the original detection scale the reader missed the price column and treated an address and receipt identifier as purchases. Detecting small text on a larger grid recovered the printed date and two credible price readings from the original pixels. The detector still reads the original image for recognition. On a damaged table, only suggestions supported by an explicit two-decimal price on the same row survive. A partial price such as “8.8” no longer creates an 8.80 allocation in that table. The two surviving descriptions still differ from the printed spellings.

A second receipt had quantities floating between names and prices. Clover now accepts an observed quantity when the word, quantity and price occupy the same row, at least two rows establish the quantity column and their counts are compatible with the printed count. Unseen quantities stay unknown. A bare “Reference” heading no longer supplies a merchant. The reader also reuses the detector's pixel arrays while building the text mask and avoids repeated dictionary and probability-array lookups when decoding text.

The generic upload worker previously discarded word positions in two places. It now retains them when isolating a receipt in a photo and when recovering a receipt after statement processing yields no rows. Device OCR eligibility uses the same region evidence. Plain photo transcripts from fallback OCR now use the same item-table checks. Those changes cover the receipt paths behind Add, Transactions, Split Bills, Circles and investment uploads. Bank and investment documents still follow their document-specific readers. Regression checks exercised PDF page coverage, screenshot routing and PDAX, GCrypto, GFunds and GoTrade example documents.

The supplied Spirits Library JPEG produced the printed 1,470.54 total, all three drinks, the 120.54 service charge and the November 19 purchase date in 3.35 seconds through the local Split Bills preview. This includes the HTTP handler with offline adapters, after a blank scan. Physical-device upload, network transit and a production UI render were outside this run.

The same 11 labeled photos yielded the following shared-reader results. All 11 still went to review.

| Measure | Previous pass | This pass |
| --- | ---: | ---: |
| Merchant | 7/8 | 7/8 |
| Date | 7/8 | 8/8 |
| Currency | 1/2 | 1/2 |
| Total | 11/11 | 11/11 |
| Item description | 47/67 | 48/67 |
| Quantity | 27/67 | 28/67 |
| Unit price | 13/15 | 13/15 |
| Matched item amount | 47/67 | 48/67 |
| Median reader time | 4.40 s | 4.24 s |
| Slowest reader time | 10.16 s | 9.83 s |

| Photo | Exact names | Unmatched outputs | Core field discrepancies |
| --- | ---: | ---: | --- |
| 1 | 7/7 | 0 | None |
| 2 | 3/3 | 0 | None |
| 3 | 9/9 | 0 | merchant mismatch |
| 4 | 2/2 | 0 | None |
| 5 | 10/11 | 1 | None |
| 6 | 4/9 | 5 | date supplied without an observable label |
| 7 | 1/2 | 1 | None |
| 8 | 2/6 | 4 | None |
| 9 | 5/5 | 0 | None |
| 10 | 5/5 | 0 | None |
| 11 | 0/8 | 2 | currency missing |

Spelling, punctuation and word breaks still account for mismatches. Photo 6 also has a suggested date that the independent label could not establish. Photo 11 has two readable prices with imperfect names and no verified currency. Further work on these examples needs clearer source pixels or independent corroboration. This was a diagnostic replay on familiar images.

## Fourth pass on spelling and recognition time

On the same 11 byte-verified photos, some alternate readings already contained the right word. Choosing the most confident whole line discarded it. Clover now considers a one-letter substitution in an item word when another recognizer supports it and either the competing reading agrees or a separate high-confidence printed line contains the same spelling. The correction affects the proposed item description. The original transcript remains available. A word containing a number is excluded from this rule. On the diagnostic receipts this recovered “Katsudon”, “Jamon” and “Paella”.

Generic Add, Transactions, account, recurring and investment receipt uploads use the shared import worker. Main and scoped Split Bills and Circles use the shared receipt preview. Ask Clover attachments now use corroborated item spellings when the phrase occurs once and the shared parser used it for a purchased item. The attachment retains the original transcript and file. Ordinary text attachments keep their literal contents. Bank statements, investment holdings and trades continue through their own parsers.

| Shared server reader, same 11 photos | Previous pass | This pass |
| --- | ---: | ---: |
| Exact printed total | 11/11 | 11/11 |
| Exact labeled date | 8/8 | 8/8 |
| Exact labeled merchant | 7/8 | 7/8 |
| Exact labeled currency | 1/2 | 1/2 |
| Exact item description | 48/67 | 51/67 |
| Exact quantity on matched items | 28/67 | 31/67 |
| Exact unit price on matched items | 13/15 | 14/15 |
| Exact amount on matched items | 48/67 | 51/67 |
| Unmatched output descriptions | 13 | 10 |
| Fully exact item tables | 3/11 | 3/11 |
| Median local elapsed | 4.24 s | 4.22 s |
| Slowest local elapsed | 9.83 s | 10.11 s |

All the item names matched on photos 1–5, 9 and 10. Photo 6 matched six of nine names, with three spelling discrepancies and a suggested date that the label could not verify. Photo 7 retained a split word (one of two names exact). Photo 8 retained four name discrepancies (two of six exact). Photo 11 retained two imperfect names out of eight labeled items, with the currency unresolved. Photo 3's merchant still differs in punctuation. A correct amount alone does not validate an item name. All 11 previews went to review.

Recognition now calculates normalized pixel values with lookup tables checked against the original Float32 arithmetic for every possible byte value. High-confidence price-only boxes can skip the script-identification pass. A Korean signal triggers recognition of the remaining prices, verified with a synthetic Korean receipt image. Directly resizing crops during perspective correction lost three correct totals in a replay and was discarded. A batching experiment also did not establish a consistent speed advantage. The median and worst-case observations above do not establish a further end-to-end speed improvement.

The supplied Spirits Library photo passed the local Split Bills preview in 3.16 seconds with the three printed drinks, 120.54 service charge and 1,470.54 total. An offline Ask Clover attachment test verified the corrected text and retained raw evidence. The regression suites checked bank/investment screenshot routing, PDF coverage, receipt intake and settlements. Production traffic, device capture and upload latency were outside this run.

## Mobile upload and statement follow-up

Native uploads previously kept the first partial device reading even when the complete reading became available during the transfer. Finalization now prefers completed evidence while retaining the bounded partial fallback. Native file selection also accepts supported MIME types for extensionless files supplied by document providers. Native and web now share the format list. Structured imports reuse preloaded bytes, avoiding a second full file read.

### iOS

Apple Vision in the iOS simulator found the printed 1,470.54 on the supplied photo, and PDFKit read both pages of a fictional statement. Simulator Safari executed Clover’s resumable upload code against a local receiver. The original JPEG, a two-page PDF, CSV, a 5,280,000-byte CSV and a 7,762,071-byte synthetic JPEG all arrived byte-for-byte intact. The large JPEG required five parts. These checks covered OS recognition and transport separately. Native picker and camera interaction remain unverified.

### Android

Host-side Android and iOS adapter tests passed for Expo form encoding, file selection, size checks, cancellation and queue handoff. The Android emulator refused startup due to insufficient host disk space. Android OCR, system pickers and the installed app remain unverified.

### Statements, files and accuracy

The format suite checked 22 accepted extensions and parsed 15 structured formats through multipart upload and native queue fixtures. It verified that preloaded bytes produce the same parser result without rereading the file. The 69 offline checks passed, including completed OCR arriving after the partial result during upload. PDF page coverage, layout, text-layer routing and password retry checks passed. Two local bank PDFs with usable text layers returned text in 73 and 29 ms. A scanned sample needed a multi-page OCR pass. Those samples lack independent row labels in this checkout, so extraction is the extent of the real-statement claim.

The supplied receipt passed the local Split Bills preview in 3.20 seconds. The timer excludes camera, network and app rendering. No production latency distribution was measured.

## Follow-up on statement uploads and native OCR

| Observed failure | Correction and verification |
|---|---|
| File validation rejected an OFX 2 document with an XML declaration. UTF-16 financial exports could also be rejected or garbled. | The validator recognizes the OFX document after its declaration. Validation, direct extraction and stored extraction now use the existing encoding-aware financial text decoder. Byte-level fixtures include XML OFX, UTF-16LE OFX and UTF-16BE MT940. |
| A workbook named “export-from-csv.xlsx” could reach the CSV decoder after upload. | Delimited-file selection now checks the extension and MIME type. The upload regression compares direct and stored text across 18 fixtures, including workbooks whose names contain “csv”. Changed extraction routes use fresh cache versions. |
| A PDF could be labeled fully read when a page produced no text. | Both native readers count pages yielding text. A simulator test of the iOS module’s PDF code reported two readable pages for a two-page sample and one readable page with incomplete coverage when the second page was blank. |
| Minor word-spacing errors could persist despite two agreeing readings. | Allow a one-space correction in a letter-only item phrase when the alternate and independent readings agree. Tests cover agreement, disagreement and low confidence. The 11-photo replay still had 51/67 exact descriptions, so this change demonstrates no aggregate accuracy gain on this sample. |

PDF password detection now scans bytes directly. Across 12 original local statement PDFs (6,422,143 bytes), the old and new probes agreed on every result. Median total marker-scan time across nine repetitions with Uint8Array inputs was 11.2 ms before and 9.0 ms after. This measures the password check only.

The shared reader returned 11/11 exact receipt totals with a 4.03-second median and 9.90-second maximum. Every receipt remained reviewable. The original Spirits Library photo passed the local Split Bills preview in 3.26 seconds in an isolated run and 6.63 seconds during concurrent tests. These observations do not establish a production latency improvement.

On the booted iOS 27.2 simulator, the native Vision recognizer ran on all 11 original photos. Only one proposed total matched using its output on its own. With the module’s bounding boxes and alternative readings passed through Clover’s device-evidence qualification, all 11 were routed to further processing. This tested the recognition and selection stages independently of upload and screen rendering.

The Android Kotlin OCR module compiled against the Android SDK, Expo and ML Kit dependencies. Mobile picker, byte handling, upload navigation and offline regression tests passed on the host. The Android emulator refused to boot due to insufficient host disk space. Android ML Kit recognition and picker interaction still need runtime verification. No physical devices, store packages or production writes were used.
