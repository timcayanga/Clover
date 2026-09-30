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

The reviewed result is 31 exact printed totals, two explicitly unresolved totals and **zero automatically accepted excerpts**. All 33 require review, because currency, identity, table layout or payment details are incomplete/ambiguous. The two unresolved examples are `id-cord-train-0004` (pre-tax TOTAL versus GRAND TOTAL) and `id-cord-train-0006` (mixed grouping and reversed summary fields). They remain visible in the manifest, rather than being dropped or counted as successful extraction.

The corpus caught a generic fallback defect: integer-style amounts could be interpreted as cents and missing currency defaulted to PHP. `unlocalized-receipt.ts` now produces a conservative summary preview for supported integer-formatted receipts with missing currency or explicit IDR. It preserves the raw text, requires review, does not manufacture a merchant or item table, and declines conflicting/invalid totals. Date presence does not bypass the guard. Known explicit other currencies and established regional parsers keep their existing paths. The global Indonesian amount parser remains strict about bare comma grouping.
