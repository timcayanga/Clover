# Original receipt photo labels

The private diagnostic manifest lives at `~/Documents/Clover File Organization/Receipt Photo QA/original-receipt-labels.json`. It references unchanged photo bytes under the local Receipt Samples library. Keep the originals and labels private. The repository holds the label contract and the validator.

```sh
node web/scripts/fixtures/original-receipt-photos/verify.mjs
```

Pass a manifest path as the first argument or set `CLOVER_RECEIPT_SAMPLES_ROOT` to use another authorized local copy. The validator checks the SHA-256 of each original, source scope, uniqueness, field states, value formats, and capture-quality coverage. It prints only aggregate counts.

Each case has a stable ID and source family. Reuse the source family for another capture or crop of the same document. These photos may overlap earlier Clover training. Use this set for diagnostics and keep it outside held-out release scoring.

- An `observed` value is transcribed from the photo. Unknown states distinguish text that is absent, unreadable, occluded, cropped, or ambiguous. Ambiguous dates can retain the printed text alongside the state. Use the transaction date, not a print, accreditation, or filename date.
- Amounts use decimal strings. Unit price and extended line amount are separate. Leave the unit price `not_printed` when the paper shows only the extension. Keep repeated rows and a printed zero.
- Currency symbols or codes support observed currency. Geographic evidence may support a separate `currencyHint` and is excluded from printed-currency accuracy.
- The total retains its printed label. Record whether the document supplies payment evidence separately. A temporary bill may have an amount due with unconfirmed payment.
- Adjustments retain their printed labels and accounting roles. Included VAT and reference subtotals are not added again. Tender and change are settlement evidence. A discount against a pre-tax amount stays on that basis. Preserve printed discrepancies in the notes instead of correcting the source.
- Run each parser on identical original bytes with an opaque filename carrying only the original extension. Keep labels, paths, hints, and quality metadata outside parser input. Score readable fields and each item occurrence independently. Report guesses for unobservable fields and extra rows separately. When the source is partial, limit completeness claims to the visible evidence.

No classifier verdict or parser output was used to create these labels.

## Compare extraction routes

From `web/`, run `npx tsx scripts/receipt-photo-route-accuracy.ts --local` with the image reader, OCR dependencies, and locally cached OCR assets installed. The local run does not submit the source photos to model providers. It compares Clover's server receipt reader (including its existing local fallbacks) and standalone PP-OCR. To add the macOS Apple Vision probe, compile `scripts/fixtures/original-receipt-photos/apple-vision-probe.swift` with `swiftc` and pass the executable through `CLOVER_RECEIPT_VISION_PROBE`. The probe uses Clover's iOS OCR settings on macOS followed by the shared receipt parser. It does not exercise the device upload contract or iOS runtime.

For device or backup runs, export an authorized, private JSON array and run `npx tsx scripts/receipt-photo-route-accuracy.ts --score /private/route-output.json`. Each entry includes `id`, `route`, `outcome` (`extracted`, `review`, `rejected`, `failed`, or `unavailable`), `core` (merchant, date as YYYY-MM-DD, currency, total), and `items` (description, quantity, unitPrice, lineAmount). Pass normalized decimal strings without currency signs or grouping separators, and null for missing fields. Keep the case ID outside the OCR or model input. These reports emit aggregate counts only.

Text exactness ignores capitalization and whitespace. Numeric exactness ignores decimal display formatting. A failed or rejected attempt counts as a miss for every observable field. Unavailable cases report separately and do not enter accuracy or review denominators. All-core accuracy requires every core field to be present in the label. The report also counts photos with every **observable** core field correct. Item completeness counts matched description occurrences, including legitimate repeats. Quantity and price exactness also require an exact description match. Extra rows are counted only where the photo's item labels are complete. For local probes the review count uses the receipt preview flag and missing core fields. A production capture should export the actual user-facing review outcome.

The diagnostic corpus is small and has only two photos with all four printed core fields observable. Compare results on the same fixture set and mode. Preserve the local baseline coverage alongside the scores.

To run only a platform OCR probe, use `--vision-only` and set `CLOVER_RECEIPT_VISION_PLATFORM` to `ios_simulator` or `android_emulator` as applicable. The probe executable reads original bytes on stdin and sends raw recognized text to the scorer on stdout. Do not log the text. Build the Swift probe for the iPhone Simulator SDK and use a wrapper that invokes it through `simctl spawn` for the iOS simulator comparison. These probes evaluate the OCR-to-shared-parser boundary. They leave upload, layout-evidence transport, provider arbitration, and actual UI review behavior outside the test.

## Observed defects and durable labels

Use a minimal synthetic receipt in a regression whenever the original contains private information. Record printed truth separately from the defective output. Keep every reproduction, retake, crop, and re-encoded copy in the same exposure family as its original. These cases stay in development.

| Observed defect | Regression and expected result |
| --- | --- |
| The receipt asked for a date despite a visible purchase date | `receipt-purchase-date-regression.ts` distinguishes the printed purchase date from other dates. `receipt-draft-regression.ts` tests that a genuinely missing date is named when reopening a saved draft. |
| Clover showed a review warning for a suggested PHP currency | `receipt-currency-precedence-regression.ts` covers printed evidence and fallback precedence. Explicit ambiguity in a saved draft requires a currency choice. |
| Recovered or edited values lost their provenance in a saved draft | `receipt-draft-regression.ts` expects the recovered merchant and its supporting label and confidence to survive confirmation. The supplied total keeps its user origin. |
| An unpriced modifier appeared as zero in web details | `receipt-draft-regression.ts` checks the same saved receipt on web and native data paths. Two coffees at PHP 212.50 total PHP 425.00, a printed zero is PHP 0.00, and an unpriced modifier is “Not recorded.” |

## Blind evaluation for release claims

Have someone who did not tune the parser label a fresh, representative set from original captures. Keep the originals and manifest private and separate from diagnostic assets, tuning, and regressions. Use the diagnostic manifest schema with `evaluationSplit: "blind"`. Maintain a private JSON array of prior exposures with `sourceFamily` and `sha256` for each entry, including training, diagnostic, and previous benchmark cases exposed to development. Check near-duplicates during curation and give each document's variants the same family. Keep one primary capture per family for the headline confidence interval. Freeze the manifest and predeclare the population, claimed routes, minimum sample size, and claim wording before collecting outputs.

Run the release as shipped through every route covered by the claim. Record all outcomes, including review, failed, and rejected. Export a private run object with `release`, `manifestSha256` (the SHA-256 of the frozen label file), `routes` (the predeclared route names), and `predictions` (the same array format as above). Use actual user-facing outcomes and values at the stage named in the claim. OCR probes alone cannot substantiate an end-to-end claim.

```sh
cd web
CLOVER_RECEIPT_LABELS=/private/blind-labels.json npx tsx scripts/receipt-photo-route-accuracy.ts \
  --claim /private/diagnostic-labels.json /private/prior-exposures.json /private/release-results.json
```

The command checks the source bytes, overlap by hash and document family, the frozen manifest hash, and complete route coverage. It prints aggregate metrics only. For an automatic all-core claim, use the exact count, eligible count, rate, and 95% Wilson lower bound. Review, rejection, and failure are misses for eligible photos. Disclose how many photos lacked readable core labels and report line-item accuracy separately. Only publish wording supported by the run and its coverage. If a blind case is inspected to fix a defect, retire its entire source family into diagnostics and replace it before the next claim evaluation.

## Compare candidate visual models

Use the same original public QA photos for GPT-5.4 mini (the first-pass baseline in code), GPT-6 Luna, and GPT-5.5. The harness verifies file hashes, rotates model order, checks that the first request uses identical image and prompt bytes, and pins retries to the assigned model. It reports observable per-field exactness, exact completion of all four printed core fields, p90 parser-attempt time, and estimated provider cost including retries. It uses standard rates from the [OpenAI model catalog](https://developers.openai.com/api/docs/models). The timing starts at parser invocation and includes provider responses and parser validation.

```sh
cd web
npx tsx scripts/receipt-model-benchmark.ts --dry-run
CLOVER_RECEIPT_PROVIDER_EVAL=1 npx tsx scripts/receipt-model-benchmark.ts
```

Inject an evaluation key via `OPENAI_API_KEY` for the live run. The dry run makes no provider calls and exercises the request and reporting paths with a simulated failure. Live output is aggregate. The diagnostic photo set excludes private receipts and is separate from the blind claim evaluation. Before replacing the default, require a larger paired set with enough independently labeled complete cases, check that the candidate makes no new core errors on safety cases, and compare latency and cost including failed attempts and retries. A repeated run increases timing observations while leaving the number of independent labeled photos unchanged.

Add `--structured-probe` for an executable that returns the native JSON evidence object, including source, reading-order text, optical lines, page counts, completeness and duration. This exercises the shared photo parser with the same coordinates and alternatives as a mobile upload. Transcript-only and structured results carry distinct route names.
