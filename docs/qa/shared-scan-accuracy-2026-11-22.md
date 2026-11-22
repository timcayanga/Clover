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

## Column order and native upload follow-up

Apple Vision sometimes reads the entire description column before the price column. A slightly out-of-frame text box could also discard the geometry for an entire receipt. Clover now clips Vision boxes to the image and uses spatially joined rows when printed amounts independently reconcile. The source transcript stays available for review.

On the iOS simulator, passing the 11 original photos through Vision and the shared parser yielded six exact totals and five withheld totals. One receipt qualified to skip another OCR pass, with nine correctly priced rows and a printed total of ₱7,782.95. The previous device-only reading returned ₱3,380. The simulator check covered recognition and qualification. The Android emulator still lacked enough disk space to start.

The shared server reader matched 11/11 totals, 7/8 labeled merchants, 8/8 labeled dates and 1/2 labeled currencies. It also proposed a date for one photo whose date could not be independently read. It matched 50/67 item descriptions and produced three exact tables. Eleven output descriptions had no exact reference match, including spelling and quantity-prefix differences. The previous run matched 51 descriptions. The stricter quantity rule retains an ambiguous leading “1” on one dish while protecting numeric product names. All 11 previews required review. Median local server reading time was 3.80 seconds and the maximum was 9.40 seconds.

For the original Spirits Library photo, both the multipart preview and the native assembled-byte preview returned the three named purchases, a ₱120.54 service charge, and ₱1,470.54 total while preserving the original bytes. Route times were 3.11 and 3.95 seconds respectively, excluding network and UI. The integration test isolates authentication and storage. A separate store test reassembles and verifies a four-part file larger than 4.5 MiB and rejects a corrupted part. Native receipt and adviser readers now consume the verified bytes directly. Extensionless CSV and DOCX fixtures with parameterized MIME types produced identical text through the immediate and stored readers.

## Follow-up on conflicting readings, item spelling and mobile statement previews

- The amount check stripped uppercase “DUE” as a possible currency code before comparing two OCR readings. It now checks the complete printed label first. An independently reread date can also resolve a disagreement inside a timestamp. The parser retains the printed time and source evidence when the date is uncertain.
- A focused crop could satisfy the first-pass return condition. The reader now checks full-frame evidence before returning a crop-derived result. Full-frame normalization for the more expensive fallback runs only when needed.
- Receipt descriptions can include more than one independently supported correction. They are applied in a single pass so a replacement cannot trigger another. Two agreeing readings can repair an interior missing letter or a spacing error in a punctuated description. The item correction path excludes numeric fields.
- The pinned Latin and Korean recognition networks both end in Softmax. Clover now stops comparing character probabilities once one exceeds one half. A synthetic printed line produced identical winning classes at every position with both decoders. In nine interleaved repetitions, median time for 100 character-decoding passes fell from 3.14 to 0.76 ms (Latin) and from 78.32 to 53.39 ms (Korean). This measures character selection after inference.
- Mobile offline previews now use the provider MIME type for extensionless photos, PDFs, CSVs and TSVs. Both native PDF readers need a temporary path ending in .pdf. Queued PDFs now receive that suffix. Delimited previews recognize a transaction header below an export title and skip decrypting and copying files that exceed the local text display limit.

### Remaining discrepancies on the 11-photo diagnostic set

| Photo | Finding |
| --- | --- |
| 1, 2, 4, 5, 10 | All labeled descriptions and observable core fields matched. Exact description matches do not establish quantities or unit prices. |
| 3 | The merchant matched apart from the printed final period. All nine descriptions matched. |
| 6 | Three item spellings differed. The proposed date could not be independently verified against the label. |
| 7 | An extra space split an item name. |
| 8 | Four names differed in spelling or punctuation. |
| 9 | The reader retained a leading “1” where a quantity header was unavailable. |
| 11 | Two priced rows were returned, both with spelling differences. The reader withheld the other six. The labeled peso marker was missing from the OCR reading. |

All eleven totals matched and all eleven previews required review. An installed Android end-to-end scan remains unverified because the emulator rejected startup for insufficient disk space. Mobile host tests exercise the production picker and queue adapters with filesystem and picker test doubles.

The final local server replay took 4.94 seconds at the median and 12.82 seconds at the maximum, compared with 3.80 and 9.40 seconds in the previous pass. The character-decoder benchmark improved, but these full-path samples do not establish a latency win. The original Spirits Library receipt passed the multipart preview in 4.69 seconds and the assembled mobile-file preview in 3.82 seconds. Both verified the three purchases, service charge, date, total and retained original. The final iOS simulator replay matched six totals, withheld five and qualified one for skipping a second read. The statement and file suites passed 18 structured fixtures, PDF page coverage, native upload password and corruption checks, and 70 offline checks.

### Shared reader and upload follow-up

The same eleven labeled originals yielded 11/11 exact payable totals, 51/67 exact item descriptions (previously 50/67), 7/8 exact observable merchants, 8/8 exact observable dates and 1/2 exact observable currencies. All eleven remained review previews. Photo 9 now separates the quantity from the first product using the printed column geometry and reconciled prices. The outstanding discrepancies on photos 3, 6, 7, 8 and 11 above still apply. Ten output descriptions failed to match a labeled item, including spelling differences. Photo 6 still proposes a date without an independently observable label.

The server reader now skips its third recognition attempt for text-only lines on which two recognizers agree with high character confidence. Numerical and disputed lines retain the extra read. The server replay measured 3.58 seconds at the median and 9.19 seconds at the maximum. These eleven local observations include neither upload transit nor device UI. The Spirits Library JPEG passed both the multipart handler (7.57 seconds) and the assembled native upload handler (6.54 seconds) during concurrent verification.

**iOS.** Apple Vision on the simulator returned six matching totals and withheld five. Two readings qualified to skip server OCR after quality assessment, up from one. Both had the correct total and date. The PDF probe accepted both pages of the text PDF and rejected the incomplete text layer.

**Android.** The installed-app emulator failed its disk-space check. Camera/library/file adapter and queue tests passed on the host. These do not measure Android ML Kit, camera hardware, picker UI, network transit or time to a visible draft.

**Statements and other uploads.** Format coverage passed for 22 selectable extensions and 18 structured-file fixtures. PDF layout/page coverage, password handling, investment screenshot routing, direct Split Bills entry, image formats and 70 offline checks passed. Ask Clover now recognizes supported extensionless attachments by their supplied media type, and uses the photo upload path for extensionless photos. Workbook parsing reuses decoded cells across formatting and extraction. Web and mobile TypeScript checks passed.

### Receipt field evidence, statement decoding and mobile rereads

The server replay recovered 11/11 totals, 8/8 observable dates, 2/2 observable currencies, 7/8 observable merchants and 51/67 item descriptions. All eleven remained review previews. The masked month on photo 6 is now withheld. An OCR fragment resembling the start of January on a different product row had allowed a weak date through. Corroboration now requires a second date that resolves to the same day. On photo 11, the final payable amount includes a plain P before the digits and the receipt has a printed Philippine address. The currency reader now recognizes that combination, including wrapped amounts. A profile setting alone cannot qualify it.

The remaining merchant discrepancy on photo 3 is the final period after the company suffix. On photos 6–8 the remaining differences include spelling, punctuation and a product wrapped midword. On photo 11 only two prices could be matched to rows, and both descriptions contained letter substitutions. Checks of the underlying OCR alternatives found several cases where both Latin reads agreed on an incorrect spelling. Substituting the fixture label would conceal that uncertainty.

The shared receipt reader now accepts a reconciled Bill Amount for skipping another read. Where the available item table proves only the subtotal, a different payable total continues through review or fallback. A full-frame statement or clear rejection also takes precedence over a provisional crop.

On Chromium, the production PDF reader extracted identical content and page counts from a two-page PDF with and without a filename extension. An encrypted extensionless copy prompted for its password, rejected the wrong password and extracted with the correct one. Unencrypted extraction now opens the PDF once and releases its worker on completion or timeout. On the server, the retained AUB credit-card statement exposed a missing JBIG2 decoder path. The replay with packaged PDF.js codecs passed without the missing-codec warning. All 44 private parser fixtures and the 104-row China Bank check passed.

On iOS Simulator, Apple Vision evidence with optical coordinates produced six correct totals and withheld five. The diagnostic runner now accepts the same structured evidence for repeatable device comparisons. The PDF probe also checked complete and incomplete text layers. On Android the native OCR code compiled, and host tests exercised the selected-photo flow. When both Android resolution settings decode the identical image size, a complete ML Kit reading is reused. Incomplete or unreadable results still trigger the full read. The emulator again failed its free-space check. Actual Android ML Kit output, system pickers, physical cameras and capture-to-visible-draft latency remain unmeasured.

The web and mobile type checks, 22 upload-extension checks, 18 structured-file fixtures, PDF page and password checks, three investment screenshot regressions and the mobile picker, transfer and queue checks passed. The Spirits Library original again reconciled to three purchases and ₱120.54 service, totaling ₱1,470.54, through both multipart and assembled native-file preview handlers. During concurrent OCR and statement testing the 11-photo server run took 7.86 seconds at the median and 42.75 seconds at maximum. This captures host contention and excludes upload and app rendering.

A separate server-only run processed the eleven photos sequentially after the other suites finished. It matched every total, with a median of 3.30 seconds and a maximum of 12.09 seconds. The preceding revision measured 3.58 and 9.19 seconds respectively in its local replay. These small runs do not establish a sustained improvement to worst-case latency.

## Shared photo evidence and statement encoding

General imports now apply the photo reader’s amount, date and currency evidence rules when the input contains optical coordinates. Previously the same scan could yield an amount in general import even when the direct receipt reader withheld it. A competing reading of a payable amount now triggers review when the currency follows the digits or occupies a separate block. Both readings remain available in the original evidence. In the promotional-footer regression, the phone returned the survey offer before the purchase in its raw transcript. Reconstructing the purchase region before checking currency prevented the survey’s USD offer from overriding a PHP sale.

Mobile table previews now detect Unicode from the original bytes, including little- and big-endian UTF-16 bank exports with and without byte-order marks. The tests include a mobile text decoder restricted to UTF-8 and a truncated file. The investment checks exercised GoTrade, PDAX and GCrypto screenshots using their own document parsers. The upload suite covered 22 extensions, including 18 structured-file cases, plus separate PDF coverage and password checks.

The OCR worker now groups adjacent short lines with identical padding. On the same 11 source images, alternating the order of the old and new workers, the median recognition time moved from 2.948 to 2.853 seconds. Nine images were faster. All eleven had identical raw text and item spelling suggestions. Increasing recognition resolution on the four difficult photos did not recover further exact descriptions, so the resolution setting was retained.

The original Spirits Library image produced three purchases totaling ₱1,350 and a separate ₱120.54 service charge through both preview handlers. The iOS simulator Vision probe produced six exact totals and withheld five. It matched 18 of 67 item descriptions on its own. The PDF probe distinguished complete and partial text layers. Android native OCR compiled and the host upload, navigation, queue and mobile type checks passed. The emulator refused to boot due to insufficient disk space. Physical picker dismissal, camera behavior and elapsed time until the bill appears in the app remain unverified.

The final server replay matched 11 of 11 totals, eight of eight observable dates, seven of eight observable merchant names, two of two observable currencies and 51 of 67 item descriptions. Ten output descriptions could not be matched to the labels. With other verification running, elapsed server parsing time was 10.27 seconds at the median and 22.82 seconds at maximum. The isolated worker comparison above measures recognition only.

## Native library uploads, receipt totals and statement preview rows

Generic photos selected from the mobile library or file picker now start their full on-device read from the picker URI while Clover retains the original. Previously this early preparation covered camera captures and explicit receipt mode. Other images used the encrypted queue copy during transfer. General imports still use full-image evidence so a cropped bank or investment screenshot cannot qualify solely because it resembles a receipt. The mobile tests exercise both platform branches, including partial and unavailable native OCR.

The receipt parser reconstructs the optical layout once per photo parse and reuses it for purchase fields and clipped-total detection. On the Spirits Library iOS transcript, alternating the old and new parser in the same process gave median batch means of 5.20 and 4.93 milliseconds per parse. This measures only the work after OCR. In local handler tests, the full Spirits Library upload took 3.14 seconds through multipart and 2.87 seconds through an assembled mobile file. Both produced all three exact item names, ₱1,350 subtotal, ₱120.54 service charge and ₱1,470.54 total.

Regression cases now cover survey dates interleaved with purchase amounts, disputed integer totals in Korean and Indonesian layouts, decimal-comma amounts with space grouping, and clipped cents before a trailing currency. A counted purchase table must agree with its printed row count or unit count. The quick extraction check also catches a second contradictory Bill Total even when the first table adds up. These checks retain the raw readings for review.

The mobile CSV/TSV preview now retains the first 20 display rows while validating the remaining records. It handles carriage-return-only exports and refers to physical source lines through delimiter directives, blank lines and quoted multiline descriptions. A malformed row after the preview limit still triggers review. The mobile offline suite passed 71 checks. Statement and investment regression coverage included PDF layout, page counts, password retry, structured file bytes and GoTrade, GCrypto and PDAX screenshots. All 22 supported upload extensions and 18 structured-file cases passed.

Apple Vision on iOS Simulator matched six totals, withheld five and matched 18 of 67 item descriptions before server fallback. On the supplied photo it misread both the year and a drink price. The complete server preview recovered both. With about 560 MiB free, the Android emulator refused to boot. The Android evidence for this revision covers host tests and mobile type checking. Neither capture-to-visible-draft timing nor physical camera and picker interactions were measured.

The final server replay matched all 11 totals, all eight observable dates, both observable currencies, seven of eight observable merchant names and 51 of 67 item descriptions. Ten proposed descriptions could not be matched to labeled items. Under concurrent local verification, server parsing took 7.41 seconds at the median and 25.68 seconds at maximum. These measurements exclude transfer and draft rendering. In a separate contrast-enhancement experiment on the four hardest originals, two more names became readable on one photo, but the enhanced read also joined three products into one and lost the correct total on another photo. The production code retains the original image treatment.

## Register receipts and bank statement photos

Two register layouts unnecessarily ran a second OCR engine. One prints “Total Amount” before a service charge and “Total Due” afterwards. The other prints a subtotal, an abbreviated charge and a final total. Clover now accepts the first scan as a reviewable draft when the purchase rows, unit prices, printed count, charge and final amount reconcile. An extra total, tip, discount or contradictory count sends the photo through the existing fallback. Bank statement photos with dated rows ending in parenthesized debits or CR/DR amounts can now select the statement reader.

In a local before/after replay, both register photos went from one extra full-image recognition pass to zero. The old reader took 35.2 and 17.9 seconds. Two runs of the updated reader took 7.4–9.2 and 8.0–9.7 seconds respectively. Other verification was running concurrently, and these measurements exclude network transfer and screen rendering.

A comparison of unmatched descriptions identified three spelling substitutions on photo 6, one split word on photo 7, and four spelling or punctuation mismatches on photo 8. On photo 11 only two of eight labeled rows were returned and both names contained a character substitution. The single merchant mismatch was a missing period in the printed corporate suffix. Preserve the source and keep these drafts editable. Adding sample-specific menu replacements would mask errors on this set.

After the other suites finished, a sequential replay measured 6.07 → 2.79 seconds and 6.57 → 2.99 seconds for those two photos. Both kept their printed totals and complete item descriptions in the full corpus replay. Across all 11 images, the shared reader matched all totals, eight of eight observable dates, seven of eight observable merchants and 51 of 67 descriptions. Median and maximum parsing times under concurrent verification were 10.76 and 35.95 seconds. These small diagnostic runs do not establish production latency.

The private statement suite passed 44 fixtures and a separate 104-row China Bank check. The upload suite passed 22 format checks and exercised 18 structured file fixtures. iOS Simulator ran receipt recognition and complete/incomplete PDF probes. Android OCR compiled and the host upload and navigation checks passed. The Android emulator required more free disk space than the host had available. Physical camera, picker dismissal and visible draft timings remain unverified on both platforms.

## File picker routing and partial receipt drafts

A file provider can send a JPEG or PDF with a generic MIME type. The import worker now uses the original extension to identify these uploads. The native receipt preview test submitted the Spirits Library JPEG as a generic file. Both preview paths returned the printed ₱1,470.54 and the three purchased drinks. A two-page PDF produced identical extracted text with the explicit and generic MIME types.

Raw server OCR and device OCR now use the same evidence rules for missing or ambiguous fields. A printed payable can populate the bill even when some items are missing. A conflicting payable or incomplete set of items cannot silently determine a split. Backup recognition must reconcile amounts before supplying item rows and provide printed evidence before filling an unknown currency.

Two additional itemized receipts with uncertain dates or merchant names produced editable previews in 2.27–3.13 seconds locally across the multipart and native upload handlers, with zero backup-reader calls. The 11-photo replay still matched all totals and 51 of 67 item descriptions. These measurements cover local handler execution. Upload, real camera capture and on-device rendering require separate timing.

## Receipt PDFs, file retries and mobile OCR

A one-page PDF with selectable purchase rows could run two rendered OCR passes and acquire a spurious second item. Using the same synthetic EUR 20.00 receipt, the previous reader took 3,415 ms and returned two rows. The revised reader took 60 ms and returned the single printed row, two teas totaling EUR 20.00. The comparison ran sequentially in one local process, with the previous reader first. A regression also counts rasterizations and requires zero for this case. Clover uses this shortcut only for a single intact page with purchase evidence, a reconciled item table and a matching payable. Split Bills now identifies a locked PDF before attempting visual backup or saving an empty draft.

For photos and receipt PDFs, a printed unit-price column is separated from the name when its value times the quantity matches the row amount. An ambiguous numeric date stays open for review across slash, dash and dot separators. A second reader cannot fill it by choosing between the same ambiguous interpretations. The cached reader normalizes file types for duplicate reads of the same source, including PDFs received as generic files. An empty extraction remains eligible for retry. Mobile web reuses the selected blob for small multipart uploads. Tests check the bytes delivered and the number of local file reads.

On the 11 labeled photos, the server matched 11 totals, 8 of 8 observable dates, 7 of 8 observable merchants, 2 of 2 observable currencies and 51 of 67 item descriptions. Three complete item tables matched every labeled field. It still proposed one date the reference could not establish. The unresolved item spellings, wrapped name and missing rows described above persist.

| iOS Simulator OCR configuration | Correct totals / 11 | Exact item descriptions / 67 |
| --- | ---: | ---: |
| Current 2,000-pixel image | 6 | 18 |
| Language correction enabled | 4 | 11 |
| 2,800-pixel image | 5 | 21 |

The iOS comparison ran the same 11 original images through Apple Vision with structured line evidence. The existing setting retained the most correct payable totals. The iOS PDF probes reported two readable pages for the complete document and withheld completion for the partially unreadable document. Android host tests covered upload bytes, pickers, previews, queue retention and OCR retry. The Android emulator refused to boot due to insufficient free storage. No physical camera or installed-app latency was measured.

The final local photo replay measured 4.44 seconds at the median and 18.80 seconds at the maximum for the shared server reader. These times exclude file transfer and app rendering. The statement suite passed 44 private fixtures and a separate 104-row China Bank check. A disposable database test verified the PDF cache hit across picker types, workspace isolation and the review payload.

### Receipt dates, OCR ranking and statement attachments

A numeric date header became a ₱2,026 purchase, and a short reference number became a ₱123.45 purchase. Both contaminated the inferred subtotal. The shared item reader now treats these headers as boundaries, keeps genuine product names such as Date Cake, and separates a currency marker from the item name. The compact image verification path also checks the photo parser's date and payable evidence. It declines ambiguous dates and checks structured device evidence before choosing a smaller image.

Each distinct OCR candidate now receives one parse and one quality assessment per ranking call. An interleaved local microbenchmark with five candidate readings, including two duplicates, measured 5.57 ms before and 1.59 ms after at the median, selecting the same text. Recognition, transport and screen rendering take additional time. The shared server reader took 5.31 seconds at the median and 28.73 seconds at the maximum during concurrent testing. It recovered all 11 printed totals and 51 of 67 exact item descriptions. The standalone iOS Simulator reading matched 6 totals and 18 descriptions. Missing and misspelled names still warrant review.

Ask Clover web now uses the existing staged upload for large PDFs, delimited tables and spreadsheets, with the same 25 MiB source limit as photos. The plain-text and extracted-text bounds still apply. Chrome transported three synthetic 5,200,123-byte files labeled as PDF, TSV and JPEG in four parts apiece to a local receiver, with matching SHA-256 at reassembly. File decoding was covered separately by the format and statement suites. The private statement checks passed 44 fixtures and a separate 104-row China Bank reconciliation. EastWest, Landbank and UCPB lacked private fixtures in that suite. GoTrade, PDAX and GCrypto routing checks passed.

The iOS PDF probe recognized two readable pages and flagged an incomplete document. Android host checks passed for picker outcomes, byte limits, interrupted uploads, OCR reuse and retry. The Android emulator reported insufficient disk space at startup. Installed-app camera, picker interaction and production performance remain unverified in this run.

### Additional receipt, statement and upload checks

The case-by-case replay located the unsupported purchase date on photo 5. The printed numeric date had two possible interpretations. A damaged price read as 4.90.00 had been counted as a second numeric date. Clover now uses calendar-valid dates in that check. All eight observable dates matched and all three unobservable dates were withheld. The supplied Spirits Library image returned the three printed items and their individual prices, the ₱1,350 subtotal, ₱120.54 charge and ₱1,470.54 total. The local preview handler took 3.13 seconds through multipart and 2.77 seconds through assembled mobile upload, with offline adapters.

The shared item reader had removed letters from Café and Éclair, dropped priced non-Latin names, interpreted the start of Orderly as an order heading, and stripped the product number from Vitamin B 12 even with a separate currency and line price. Transcript and optical-envelope regressions now cover these cases. The preexisting 11-photo set matched 51 of 67 exact item names and 11 of 11 totals. Its remaining discrepancies were examined individually.

| Photos | Finding | Handling |
| --- | --- | --- |
| 1–5, 9, 10 | Every labeled item name matched. The merchant in photo 3 differed by a final period absent from the OCR header. | Preserve the observed spelling. Photo 5’s ambiguous date now goes to review. |
| 6 | Six of nine names matched. | Preserve uncertain transcriptions for review. The masked date remains empty. |
| 7 | A till wrapped a word between two printed lines. The OCR boxes contained two separate fragments. | Keep the fragments visible until spelling is corroborated. |
| 8 | Two of six names matched. OCR confused punctuation, letters and digits. | A matching item sum establishes the amount but cannot confirm the spelling. |
| 11 | Neither of the two recovered item descriptions matched exactly. Six further labeled items lacked recoverable price associations. | Keep the printed payable and allow item review without allocating unsupported amounts. |

Clover now recognizes a printed Bill Amount with receipt evidence. A separately printed subtotal, payable and complete set of reconciling purchase rows can finish the local preview while the date or merchant stays open. A generated undated ₱30 receipt took 1.44 seconds in each of two previous-reader trials and 0.92–0.93 seconds in two revised-reader trials. The old reader made two further recognition passes. The revised reader made none. Local OCR also consumes existing image buffers directly, avoiding base64 conversion for crops and repeated encoding of PDF pages. The final 11-photo server replay took 4.21 seconds at the median and 17.03 seconds at the maximum. Network transit and UI rendering were outside these timings.

The statement suite passed 44 private fixtures, inline contracts and a separate 104-row China Bank check. Photo formats, password retry, scanned-PDF page coverage and investment screenshot routes passed. iOS Simulator Vision alone recovered six totals and 18 exact descriptions across the same photos. Its PDF probe distinguished complete and partial page coverage. Simulator Safari delivered a PDF, a JPEG and a four-part 5,700,018-byte CSV to a loopback receiver with exact byte hashes. Chromium also exercised web multipart and the resumable native protocol with a 5,200,123-byte synthetic file. Android host upload and navigation tests and mobile type checking passed. The configured Android emulator refused to boot for lack of disk space. Installed-app picker behavior, physical cameras and production timings remain unverified.

### Digital receipts, text attachments and resumed mobile uploads

A single-page digital receipt with two priced items and separately printed gross and bill amounts reproduced a second parsing error. The previous reader requested rasterization twice and returned “Official Receipt Tea” as the first purchase. The revised shared file reader kept the original PDF text, matched Tea at 10.00 and Coffee at 20.00, and returned the printed 30.00 without rasterization. It checks a single native text page, receipt routing, clean characters and reconciling purchase evidence before taking this path. The updated preview integration also returned the correct Spirits Library items and total through multipart in 3.01 seconds and assembled upload in 2.71 seconds. Those local handler measurements exclude network and screen rendering.

Reopening a cached mobile preview hid partial PDF page coverage. Cached previews now validate the saved evidence and show the same coverage as a fresh read. On a resumed photo upload a cached partial read could suppress recognition after the original recognition task had ended. A complete read that finishes during transfer can now replace it. A slow read can still fall back to the partial result immediately. Regression checks exercise both platform evidence formats, malformed caches and completed and incomplete retries.

Ask Clover previously accepted TXT and Markdown attachments but decoded only UTF-8. The attachment reader now uses the shared Unicode decoder for UTF-8 and UTF-16 and gives a readable export instruction for damaged text. Tests include accented characters and the peso symbol in both UTF-16 byte orders. The original upload bytes remain available for the source record.
