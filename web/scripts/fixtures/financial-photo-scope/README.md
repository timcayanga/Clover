# Financial photo scope fixtures

The manifest pairs each retained image with its expected verdict, next action, and the visual evidence behind the label. It covers 20 images, including low-light, faded, folded, cropped and handwritten receipts, an image containing two receipts, and lookalikes with prices or finance-related artwork.

| Verdict | Expected behavior | Cases |
| --- | --- | ---: |
| Financial | Allow extraction and apply the normal transaction validation and review rules | 14 |
| Non-financial | Reject with a reason grounded in the image | 3 |
| Uncertain | Keep eligible for further reading or ask for specific evidence | 3 |

For parser tests, treat the manifest as ground truth only after processing the image. Supply the original bytes without the expected label, reason, case ID, or descriptive filename. Score financial images incorrectly rejected, lookalikes incorrectly accepted, and uncertain images hard-rejected separately. Compare both the final verdict and whether the user receives the expected next action. One image with two documents still counts as one scope decision.

Sample-library files are referenced under `Organized Samples` and must stay on the authorized machine. Repository images are existing Clover artwork. Keep the samples byte-for-byte and use SHA-256 to verify identity. The images were visually reviewed for scope. Purchase authenticity, individual extracted fields, and live model performance were outside this review.

This starter set is mostly Philippine and may overlap previous parser training. Use it as a diagnostic set. A separate holdout should add original menus, standalone vouchers, checkout carts, failed-payment screens, and multilingual negatives before using results to set release thresholds.

Run from the repository root:

```sh
node web/scripts/fixtures/financial-photo-scope/verify.mjs
```

On another authorized machine, set `CLOVER_RECEIPT_SAMPLES_ROOT` to its local Receipt Samples directory. The verifier checks labels, source references, and exact bytes without printing image contents.

The metrics script accepts JSON observations with `platform` (`ios`, `android`, `web`, or `server`), `language` (for example `en`, `id`, or `und` if unknown), `documentType`, `imageQuality`, `expected`, and `actual`. Use the actual tested platform and label language, document type, and image quality from the fixture before looking at the model result. Map the fixture verdict `uncertain` to `ambiguous` in the results. Use `null` for an unavailable outcome.

Run from `web/`:

```sh
npx tsx scripts/financial-photo-scope-metrics.ts /path/to/observations.json
```

Add `--backup` for older backup benchmark results that lack labels. The script treats those observations as server results. False rejection uses completed financial cases as its denominator. False acceptance uses completed non-financial cases. The report counts ambiguous rejections, deferrals, and unavailable outcomes separately. A null rate means the group has no completed observations for that denominator.

## Reviewed false rejections and held-out evaluation

`false-rejection-regressions.json` contains reviewed synthetic OCR reproductions of rejection patterns exercised by `qa:financial-scope-gates`. These fixtures measure classifier behavior after OCR. For a confirmed incident, review the original privately, record the prior rejection code and root cause in the private review record, and add a minimized synthetic reproduction with a stable ID, source family, independently assigned verdict, and visible evidence. Use `ambiguous` when review is the correct outcome. Keep customer uploads, their source fingerprints, and private review references outside Git.

The evaluator maintains two private JSON arrays. The holdout index records `id`, `sourceFamily`, `sha256` of the original bytes, and `expected` with `verdict` and `reason`. The exposure index records `sourceFamily` and `sha256` for all originals inspected for rule development, including the diagnostic manifest, backup benchmark source families and the reviewed originals behind synthetic reproductions. Use the same family for derivatives of one document, including crops, re-encodes and OCR transcripts. The evaluator verifies image bytes against the holdout index before scoring.

```sh
node web/scripts/fixtures/financial-photo-scope/verify-holdout.mjs /private/holdout.json /private/exposed.json
```

Keep held-out inputs out of development runs and compare aggregate results separately. If a held-out miss is opened for rule development, move its entire source family into the exposure index, add its regression, and use a fresh unexposed family for future holdout runs. The split check catches matching IDs, byte hashes and recorded families. It relies on the evaluator to record provenance and identify derivatives whose bytes have changed.

## Release audit recovery (19 November 2026)

The original temporary-workspace commands were recovered from General Chat. The three synthetic false-rejection fixtures and twelve synthetic backup-case labels are restored byte-for-byte; their SHA-256 values are `9b5fc438a0929d5a4e76f770a5dd8ec2501917999694367eddc5123e923fa9a8` and `bb3ababf3854a3a293392e807dfcb999bb7dba5d5f174fd98c6664f025f58824`. These are portable regression inputs, not original-image accuracy measurements.

The original-image diagnostic manifest is private and excluded from Git and Vercel uploads. Its original annotations and ordered source paths were recovered from the historical commands; current retained bytes were read back for fingerprints and dimensions. This reconstructs the index without generating labels from parser output; it is not proof that a historical manifest hash survived. The 20 images remain diagnostic/exposed sources, not a blind holdout. No source images were edited or copied into Git.

The retained recovery and private index are in `/Users/TimCayanga1/Documents/Clover/QA/2026-11-19-release-coverage/`. On an authorized machine, place the private `manifest.json` beside this verifier to run the existing diagnostic/benchmark scripts. Missing originals or a missing private index must fail explicitly; do not substitute predictions or treat those checks as portable CI coverage.
