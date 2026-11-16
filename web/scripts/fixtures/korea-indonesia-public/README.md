# Public Korean and Indonesian receipt corpus

**Latest original-image result:** the October 1 local OCR follow-up below now passes all eight original totals in three repeats (24/24), with warm p95 19.69 seconds. Older failed baselines below are retained for comparison. Native device OCR is still untested.

33 financial text excerpts: seven Korean receipt images and 26 Indonesian CORD annotations. These are separate from Clover's synthetic fixtures in `../korea-indonesia/`.

## Sources and attribution

- [Korean Receipts Dataset](https://huggingface.co/datasets/HumynLabs/Korean_Receipts_Dataset), HumynLabs / KAI-KratosAI, [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/), revision `656cef561f4b8ff22e46d6785bc2807e78af99a1`. Seven images were visually inspected and financial lines manually transcribed. The publisher describes field-collected, simulated and crowdsourced material; do not describe every image as a verified real customer purchase.
- [CORD v2](https://huggingface.co/datasets/naver-clova-ix/cord-v2), NAVER CLOVA, [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/), revision `7f0115a4b758a71d6473b8d085751692da2fef98`. Attribution: Seunghyun Park, Seung Shin, Bado Lee, Junyeop Lee, Jaeheung Surh, Minjoon Seo and Hwalsuk Lee (2019), *CORD: A Consolidated Receipt Dataset for Post-OCR Parsing*, Document Intelligence Workshop at NeurIPS. [Upstream documentation](https://github.com/clovaai/cord).

Retrieved October 1, 2026. Changes/adaptations are described below and per case in `manifest.json`. No endorsement by the original authors is implied.

CORD's public release contains 1,000 documents, not the entire 11,000-document research collection. This expansion uses train rows 0–25 only. It does not include the entire release. The current dataset-server `first-rows` response was obtained while the dataset metadata reported the recorded revision; each original `ground_truth` string is hashed separately.

## What is preserved

Each manifest case has a source reference, revision through its source record, original source hash, exact fixture hash, transformation description, receipt family, expected printed total, expected extraction/review behavior, and known limitations. CORD `gt_parse` financial annotations are retained separately from the input text; no annotation field name is inserted into the input. Menu words are joined by the published `row_id`, sorted vertically and horizontally. Summary regions retain their published `valid_line` word order, including value-before-label layouts.

Korean excerpts preserve visible prices, labels, dates, relevant item lines, payment components and whitespace variation. Contact details, person names, business registration numbers, card numbers, authorization codes, loyalty data, document identifiers and barcodes/QR contents are omitted. Product SKU numbers remain where needed to exercise item layout. Original images are not redistributed. No personal details are reconstructed from CORD's omitted fields.

`kr-humyn-01` and `kr-humyn-04` show the same purchase in two receipt formats. They share one family and must stay together in any future split. There are 32 families, not 33 independent purchases. The reissued receipt and split-payment example are not evidence of new transactions or permission to create separate expenses.

## Coverage and limits

- Korean: VAT-inclusive retail, delivery modifiers and free options, card-slip summaries, two-digit years, horizontal tax columns, negative discount rows, partner discount/card splits, reissued receipts, and SKU/item wrapping.
- Indonesian: comma and dot grouping, mixed separators, tax/service/rounding, cash/change, zero-priced items, submenus, item discounts, coupon/card components, quantity prefixes and suffixes, abbreviated totals, and value-before-label summaries.
- This is a convenience sample for **development regression**, not a random production sample or an untouched holdout. The corpus-only regression performs no training, fine-tuning, external AI call or customer-record mutation. The separately documented live follow-up below invokes the configured AI backup on public images in isolated QA Profiles.
- These tests evaluate post-OCR text parsing. They do **not** measure image recognition, scan quality, PDF parsing, upload routing, model fallback accuracy, confirmed-record deduplication or end-to-end imports. Layout transcription and omitted identity fields affect the result.
- Printed totals are independently retained even where extraction must remain unresolved. CORD labels can contain transcription mistakes; do not silently repair them to fit the parser.

## Regression result

Run `npm --prefix web run qa:public-receipt-corpus` from the repository root. The same command runs in `qa:release` / `qa:prepush`.

The benchmark started at 31 exact printed totals and two explicitly unresolved totals. After final-total precedence and guarded value-first summary fixes, all 33 printed totals are exact, with **zero automatically accepted excerpts**. All 33 still require review because currency, identity, table layout or payment details are incomplete/ambiguous. The previously unresolved examples, `id-cord-train-0004` and `id-cord-train-0006`, remain in the manifest with unchanged source text and printed ground truth. Conflicting, unreadable, cancelled and refunded summaries remain unresolved in separate adversarial controls.

This result measures the supplied text excerpts, not image OCR. The image benchmark uses a separate manifest, original-image hashes and separately reported results. Do not present 33/33 as photo recognition accuracy.

The corpus caught a generic fallback defect: integer-style amounts could be interpreted as cents and missing currency defaulted to PHP. `unlocalized-receipt.ts` now produces a conservative summary preview for supported integer-formatted receipts with missing currency or explicit IDR. It preserves the raw text, requires review, does not manufacture a merchant or item table, and declines conflicting/invalid totals. Date presence does not bypass the guard. Known explicit other currencies and established regional parsers keep their existing paths. The global Indonesian amount parser remains strict about bare comma grouping.


## Speed and accuracy benchmark, October 1

Machine-readable baseline, three final text/file runs, and before/after original-image results are in `benchmark-results-2026-10-01.json`. The source commit is the pre-fix baseline; the final runtime diff hash identifies the tested uncommitted fixes. Benchmarks ran sequentially on an Apple M1, Node 25.9.0, macOS ARM64. They are local measurements, not Vercel latency promises.

Targets were set before the baseline: exact authored financial-field/rejection assertions; at least 95% exact printed-total coverage **per country**, with no wrong returned text totals; all incomplete excerpts requiring review; warmed per-document p95 below 250 ms for text, 500 ms for workbook decoding/parsing, 1 second for 1,000 rows and 10 seconds for 10,000 rows. Each final run used 15 warm calls per small document and five per stress file, plus a separately recorded first call. Assertions and input-file reads are excluded from timing; byte/workbook decoding is included.

All 134 small-fixture assertions and four stress files passed in three consecutive final runs. All 33 public text totals were exact, up from 31. Amounts, directions, dates, currencies, account identifiers and source references are checked where independently authored ground truth exists. This does not imply every merchant, category, absent field or unfamiliar file layout is correct.

Worst per-document warm p95 across the three final runs:

| Workload | Measured | Target |
| --- | ---: | ---: |
| Small text/encoded fixtures | 4.48 ms | 250 ms |
| XLSX decoding plus parsing | 6.57 ms | 500 ms |
| 1,000-row CSV | 248.54 ms | 1,000 ms |
| 10,000-row CSV | 2,390.40 ms | 10,000 ms |

**Original-image OCR did not meet the accuracy target.** Eight separately hashed public originals (four per country) were tested twice through the actual local upload reader and receipt parser. Only one of four Korean totals and none of four Indonesian totals were consistently exact. Warm p95 was 24.24 seconds against a 30-second target. Two incorrect local totals and five unresolved totals remain; all eight outputs require review and none qualifies for the fast path. The baseline had one incorrect Indonesian total eligible for the fast path with an unsupported PHP default. That safety failure is now blocked, but a safe failure is not counted as an accurate extraction.

The image sample is a small diagnostic subset of the development corpus, not an estimate of all Clover uploads. Original-image preprocessing, local OCR and parsing are timed; cloud AI, uploading, queues and database writes are excluded. At the time of that local-only report, cloud backup and complete import verification were pending a staging test account with AI-processing consent. The authorized live follow-up below now covers that path. The original local-only report is retained unchanged. Additional local deskew/language experiments added time without sufficient accuracy gains and were removed.

### Reproduce

From `web/`:

```sh
npm run qa:regional-benchmark -- --iterations=15 --stress-iterations=5 --out=/tmp/clover-regional-benchmark/text.json
npm run qa:regional-image-benchmark -- --download --repeats=2 --out=/tmp/clover-regional-benchmark/photos.json
```

The image command downloads only public originals to temporary storage, verifies their hashes, and exits nonzero if accuracy, speed or safety fails. Existing files are reused only after hash verification. Changed upstream images must not silently replace ground truth. Full OCR transcripts remain local temporary files, outside Git; source attribution and dataset revisions are recorded above and in the manifests.

`qa:regional-accuracy` runs the deterministic accuracy gate in `qa:release`/`qa:prepush`; hardware-dependent timing and external image downloads remain explicit benchmark commands. Timing failures do not loosen the correctness gate. The same root `qa:prepush` command runs in GitHub Actions.

## Live staging follow-up, October 1

Used the dedicated staging QA account after enabling the current **Pro** tier (`premium` internally), with AI consent and fresh isolated Profiles. No paid subscription was created. Production and pre-existing confirmed records were not changed.

The final runtime was `fc0daf00959ddb6066a4e99d2103a70c9690244e`. See [the machine-readable report](benchmark-staging-results-2026-10-01.json) for source hashes, runtime hashes, each failed iteration, final case results, positive controls and local measurements.

Eight original public images were uploaded through the authenticated staging multipart API, storage, processing queue, configured AI backup and persisted-result read. They ran three times in fresh Profiles, so **24 attempts means eight distinct images**, not 24 independent documents. Filenames were neutral and expected values were never supplied to the parser. Before follow-up runs, original images were visually audited: all four CORD dates are obscured; all four CORD images and Korean 01/19 lack printed currency. Their correct outcome is a preserved receipt preview and explicit review, not an invented currency/date or endless retry. Korean 03/10 have complete source evidence and must save transactions. `liveExpected` and `sourceAudit` in the image manifest record these expectations separately from total ground truth.

The unchanged baseline contained 6/8 correct totals, four imports still retrying after 180 seconds, and two confirmed transactions with unsupported currency. Follow-ups fixed terminal review, currency evidence, image detail, tender-versus-total mistakes, thousands grouping, merchant-versus-product identity and legitimate decimal preservation. A receipt's original model response stays available for audit. Conflicting total/tender evidence triggers one bounded reread; missing source details do not keep generating retries.

Final results:

| Gate | Observed | Target |
| --- | ---: | ---: |
| Korean exact totals | 12/12 | ≥95% |
| Indonesian exact totals | 12/12 | ≥95% |
| Correct save/review and currency outcomes | 24/24 | 24/24 |
| Incorrect/unsupported confirmed transactions | 0 | 0 |
| Server upload-to-outcome p95 | 7.30 s | ≤12 s |
| Client upload/polling p95 | 8.98 s | ≤30 s |

The checked-in live QA script also passed a separate fresh-profile run: 8/8 exact totals and correct outcomes, server p95 6.52 seconds and client p95 11.35 seconds. This repeats the same eight documents; it does not expand the corpus.

Two additional clearly labeled synthetic images rendered from the existing Korean/Indonesian text fixtures saved correctly. Amount, currency, date, merchant, expense type and Food & Dining category matched the independent expectations. An incomplete receipt's resume request returned HTTP 400; the receipt stayed review-required with unchanged processing timestamp and zero transactions.

A fresh local run passed 134 small fixtures and four stress files. Worst per-document p95 was 4.22 ms for small text, 11.00 ms for XLSX, 289.55 ms for 1,000 rows, and 3,091.88 ms for 10,000 rows. All 33 public text totals remained exact. These are local parser measurements, separate from cloud latency.

**Limits:** local OCR alone still fails the image accuracy gate (1/8 consistently exact), so the cloud fallback remains necessary on this set. The live image benchmark checks totals and selected core outcomes, not every item, merchant or category. Logo extraction can still be incomplete on blurred examples. These development documents have informed the fixes and are not an untouched holdout. No phone UI, production traffic or store binary is covered by these measurements.

### Repeat the live staging test

`web/scripts/korea-indonesia-staging-benchmark.mjs` refuses implicit execution, production credentials and non-preview deployments, pins the exact staging SHA, checks the QA account's Pro tier and existing AI consent, and revokes only its own temporary session on exit. It creates new QA Profiles and uploads; it is intentionally excluded from unattended release checks. Store raw output outside Git because original public images can contain identifying receipt text.

Download the original images with the earlier image benchmark (the local OCR accuracy gate is expected to fail), then run from the repository root with a protected **staging development** environment file:

```sh
node --env-file=/secure/path/staging-qa.env web/scripts/korea-indonesia-staging-benchmark.mjs \
  --execute --sha=fc0daf00959ddb6066a4e99d2103a70c9690244e \
  --images-dir=/tmp/clover-regional-benchmark/images \
  --output-dir=/tmp/clover-regional-live --label=repeat --repeats=3
```

Use the active staging SHA if newer code is intentionally being evaluated. Never substitute production credentials or loosen a failed accuracy assertion to make a run pass.

## Local OCR recovery, October 1

The original-image accuracy gap is now closed for this diagnostic set. [Machine-readable results](benchmark-local-ocr-results-2026-10-01.json) retain the unchanged source hashes and total expectations, runtime file hashes and all three final rounds on Node 22.23.3 / Apple M1. The actual upload reader preserves its successful Tesseract first pass and uses a bounded, CPU-only PP-OCRv5 rescue before expensive crop retries. It corrects perspective/row association, decodes each model's embedded alphabet and keeps raw optical evidence separate from normalized receipt text. Narrow label/spacing repairs never change digits or manufacture currency. See [runtime and safety notes](../../../../docs/local-receipt-ocr.md).

| Gate | Final result | Existing target |
| --- | ---: | ---: |
| Korean exact printed totals | 12/12, all four documents consistent | ≥95% per country |
| Indonesian exact printed totals | 12/12, all four documents consistent | ≥95% per country |
| Incorrect fast acceptance | 0 | 0 |
| Warm reader + parser p95 | 19.69 s | ≤30 s |

All 24 outputs used the new local engine and remained review-required. The engine-only trial was faster (warm p95 6.81 s); 19.69 s is the final complete-reader figure, including the retained first pass. A separate empty-model-cache probe downloaded and initialized all three verified models and read an Indonesian image in 4.17 seconds. These are local timings, not Vercel or phone performance promises.

The previous local-only result was 1/8 consistently exact and 24.24 seconds warm p95. Thresholds were not reduced, difficult originals were not removed, expected totals were never given to OCR, and cloud AI was not invoked in these local runs. Pretrained optical models were integrated; neither ChatGPT nor device models were trained. The successful cloud backup benchmark above is a separate earlier test. These eight development photos have informed the fixes, so this result does not establish ≥95% accuracy on unseen receipts, every field, statements, native OCR or production traffic.
