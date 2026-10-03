# Local receipt image OCR

Clover's server receipt reader now keeps its successful Tesseract first pass and uses CPU-only PP-OCRv5 before expensive crop/segmentation retries when that pass needs help. This applies to explicit receipt images in `readUploadedFileText` and the cached import reader. It does not replace native iOS/Android OCR, statement/PDF OCR, or the existing direct-vision import path. No customer data is sent to a model service by this engine; it downloads public model weights only. This is inference with pretrained models, not fine-tuning.

## Recognition and safety

- Detect text regions, rectify tilted crops, recognize Korean and Latin scripts, and reconstruct rows using the page's estimated skew. Preserve original-resolution crops; resizing the detector must not discard recognizer detail.
- Decode with the alphabet embedded in each ONNX file. Similar-looking external dictionaries can shift every output character.
- Compare two bounded optical contrast passes by line confidence, without using expected amounts, filenames, corpus IDs or country metadata. Preserve the chosen raw lines, quadrilaterals, per-line confidence and engine identity in an extraction envelope separate from reading-order text.
- Normalize spacing inside thousands groups/decimal cents, join a standalone summary label with its adjacent numeric value, and handle narrowly bounded final-label OCR confusions. Do not change digits. A damaged Korean payment label needs an independently printed matching amount. Repairs cannot override an existing recognized total. Conflicts, unreadable totals, refunds and missing currency still require review.
- Every preview from this engine remains review-required with confidence capped at 45. Optical confidence is not financial validation. The raw source image and extraction envelope stay available for audit; coordinates are excluded from model prompts and statement parsing.
- The existing cloud fallback is still needed for full-field enrichment and difficult receipts. A correct printed total does not establish merchant, date, currency, items or categorization accuracy.

## Native receipt intake (October 2026)

- Camera/library/file photos start Apple Vision or bundled Android ML Kit text recognition beside their resumable byte transfer. The uploader waits at most four seconds from OCR start; unavailable/slow OCR retains the normal server fallback. No language-model download or cloud allowance is needed for optical recognition.
- The server accepts a bounded, complete one-page OCR envelope as untrusted evidence, keeps an audit alongside the original file, and runs the same deterministic financial-scope and receipt checks. It never accepts client-supplied financial rows. Clearly non-financial text stops before cloud AI; sparse or unclear OCR stays eligible for recovery.
- A complete merchant/date/total core can appear as a review-required transaction without cloud AI. Unreconciled itemization is omitted from suggested financial fields while its source remains preserved. Printer IDs, payment tender, and item counts must not become purchases or totals; a footer accreditation date must not outrank the earlier purchase date. Tax-inclusive totals are valid without adding VAT again.
- When currency is absent, the normalized draft uses the user's current default currency with a `currency_resolution` review marker. The raw parser output never claims that currency was printed. Explicit currency and user corrections are preserved.
- Incomplete receipts remain editable in their saved import. Confirming requires valid merchant, date, positive total, currency and an account in the same Profile/currency. Confirmation is atomic and idempotent; it never recreates deleted transactions or replaces confirmed records.
- Deterministic parsing, device OCR/local model inference and manual draft completion do not consume the cloud allowance. Each cloud request checks allowance. Failed parsing receives a separate, idempotent credit while the provider usage audit remains intact. Reaching the cloud cap must not block file transfer, local extraction, review or saving (ordinary storage/transaction plan limits still apply).
- Pause/cancel is durable and checked before model/confirmation boundaries. The final financial commit shares a row lock with controls. Cancel preserves the source/audit; it does not erase saved transactions. Unconfirmed or cancelled receipts do not promote learned templates.

The target is a usable receipt in under ten seconds, not a guaranteed timeout. An October 2026 replay of a real camera photo measured about 0.91 seconds for Apple Vision on macOS and 0.34 seconds for the worker against a local database, with zero cloud calls. This excludes phone camera, upload, mobile CPU, production database and network latency; physical iOS/Android measurements are still required.

## Runtime and deployment

No new secret or environment variable is required. `onnxruntime-node` 1.30.0 (MIT) and `@techstark/opencv-js` 4.9.0-release.3 (Apache-2.0) run inside a reusable worker. The worker is bounded to one active job per server instance, 25 seconds, 40 megapixel decoded input, 2,800 pixel working edge, 300 text regions and bounded crop widths. OpenCV matrices and ONNX tensors are disposed explicitly. A failed worker is terminated; a one-minute cooldown retains the prior OCR/backup path. Native crashes cannot take down the request process through an unhandled worker error.

The following Apache-2.0 PaddleOCR models are served by RapidAI's versioned `RapidOCR` ModelScope repository at `v3.9.2`. SHA-256 verification is mandatory before loading, including cached files:

| Model | SHA-256 |
| --- | --- |
| `ch_PP-OCRv5_det_mobile.onnx` | `4d97c44a20d30a81aad087d6a396b08f786c4635742afc391f6621f5c6ae78ae` |
| `korean_PP-OCRv5_rec_mobile.onnx` | `cd6e2ea50f6943ca7271eb8c56a877a5a90720b7047fe9c41a2e541a25773c9b` |
| `latin_PP-OCRv5_rec_mobile.onnx` | `b20bd37c168a570f583afbc8cd7925603890efbcdc000a59e22c269d160b5f5a` |

Downloads have a 15-second timeout and a 20 MB per-file limit, including streamed bytes. Models are cached under the OS temporary directory, keyed by checksum. A first request on a fresh instance can include model download time. The checked-in `web/.npmrc` skips optional CUDA/TensorRT downloads. Deployment traces include the worker and Linux x64 CPU runtime, excluding other platforms and GPU binaries. Extraction cache version v33 invalidates old text results without altering confirmed financial records.

Primary model/preprocessing references: [PaddleOCR](https://github.com/PaddlePaddle/PaddleOCR), [RapidOCR model inventory](https://github.com/RapidAI/RapidOCR/blob/main/python/rapidocr/default_models.yaml), [detector](https://github.com/RapidAI/RapidOCR/blob/main/python/rapidocr/ch_ppocr_det/utils.py), [recognizer](https://github.com/RapidAI/RapidOCR/blob/main/python/rapidocr/ch_ppocr_rec/main.py). Model license terms are available upstream; runtime dependencies retain their packaged licenses.

## Verification

`npm --prefix web run qa:local-receipt-ocr` checks skewed row alignment, embedded dictionary integrity, numeric preservation, damaged-label controls, conflicting totals, refunds, audit retention and mandatory review without downloading models or invoking cloud AI. It is included in the normal release gate.

`npm --prefix web run qa:regional-image-benchmark -- --download --repeats=3` runs original, hash-verified public photographs through the real receipt reader and parser. Accuracy means an exact printed total, measured separately for Korea and Indonesia. The unchanged targets are at least 95% per country, warm p95 at most 30 seconds and zero incorrect fast acceptance. Eight images repeated three times are eight distinct documents, not 24 independent samples. This is a development diagnostic, not an independent production accuracy estimate.
