# Import timing follow-up — 20 September 2026

The earlier 15 successful import runs established functional correctness, but did not establish all independent stage durations. This change adds timing-only logs around real execution boundaries, without new database writes or schema changes.

`[import-timing]` records contain an import ID, unique span ID, stage, start/end wall-clock anchors, outcome, and monotonic elapsed milliseconds. They contain no filenames, extracted text, financial values, or error messages. An unfinished span is incomplete evidence, not a success. Parent and child spans overlap and must not be summed.

- `text_extraction`: actual text/cache extraction call.
- `model_extraction_and_parse` / `receipt_core_vision`: a structured model call that combines visual extraction and parsing; report the combined operation, not a fictional independent OCR stage.
- `parsing_to_candidate_commit`: parser entry through persisted candidate rows. Includes any model fallback and raw-source wait.
- `candidate_persistence`: candidate replacement/insertion and count update, including the required schema guard and normalization wait.
- `normalized_transaction_commit`: requested confirmation transaction through commit, including pool and lock waits.
- `post_response_queue` / `receipt_processing_queue`: scheduling start through entry to processing in the same runtime. These include scheduling database work; local external-worker paths need separate instrumentation.
- `enrichment_attempt`: one claimed enrichment attempt through durable terminal state. Started-only retry spans remain incomplete; this does not assert total queue/retry coverage.
- `receipt_detail_queue`, `receipt_detail_enrichment`, `receipt_detail_persistence`: scheduling, detailed image/model refinement, and its final writes. Core transaction fields remain preserved by the existing refinement implementation.

Processing and status responses expose a server-clock anchor. Browser request/response timestamps bracket offset uncertainty; do not subtract raw client and server timestamps. A processing-response anchor belongs to that processing runtime; status responses may belong to another runtime. Missing or overly broad bounds remain a measurement gap.

Mobile file inputs now paint a local, accessible “Preparing upload” status before mounting the heavier transaction import surface. The two-frame handoff preserves the selected files, clears the input so the same file can be selected again, and cancels the pending frame on unmount. Empty selections do not start imports. This acknowledgement is only feedback, not proof that upload or parsing completed.

Validation and live-run results are recorded separately; these changes alone do not mark speed cases Pass.
