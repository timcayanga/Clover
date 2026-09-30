# Public Korean and Indonesian receipt corpus

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
- This is a convenience sample for **development regression**, not a random production sample or an untouched holdout. No training, fine-tuning, external AI call or customer-record mutation is performed.
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

The image sample is a small diagnostic subset of the development corpus, not an estimate of all Clover uploads. Original-image preprocessing, local OCR and parsing are timed; cloud AI, uploading, queues and database writes are excluded. Cloud backup and complete import verification remain pending a staging test account with AI-processing consent. No financial records or consent settings were changed. Additional local deskew/language experiments added time without sufficient accuracy gains and were removed.

### Reproduce

From `web/`:

```sh
npm run qa:regional-benchmark -- --iterations=15 --stress-iterations=5 --out=/tmp/clover-regional-benchmark/text.json
npm run qa:regional-image-benchmark -- --download --repeats=2 --out=/tmp/clover-regional-benchmark/photos.json
```

The image command downloads only public originals to temporary storage, verifies their hashes, and exits nonzero if accuracy, speed or safety fails. Existing files are reused only after hash verification. Changed upstream images must not silently replace ground truth. Full OCR transcripts remain local temporary files, outside Git; source attribution and dataset revisions are recorded above and in the manifests.

`qa:regional-accuracy` runs the deterministic accuracy gate in `qa:release`/`qa:prepush`; hardware-dependent timing and external image downloads remain explicit benchmark commands. Timing failures do not loosen the correctness gate. The same root `qa:prepush` command runs in GitHub Actions.
