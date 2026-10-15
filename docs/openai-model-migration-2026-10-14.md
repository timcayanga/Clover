# OpenAI model migration — 14 October 2026

## Selected routing

- Ask Clover: `gpt-4.1-mini` → `gpt-6-luna`, explicitly `reasoning.effort=none` in tool selection, streaming replies and ordinary replies.
- Unpublished Help Center drafting: `gpt-4.1-mini` → `gpt-6-luna`, same approved-domain search restrictions, token/tool/attempt limits, schema validation and human publication approval.
- Backup **text** extraction: remove the `gpt-5.1` environment override in favor of `gpt-5.4-mini`, explicitly no reasoning for text-only calls. Image OCR/receipt fast model remains `gpt-5.4-mini`; strong/PDF models remain `gpt-5.5`. Deterministic parsing remains preferred. No financial records or learned rules are migrated.

OpenAI documents retirement of GPT-4.1 mini on 14 January 2027 and GPT-5.1 on 1 April 2027. Sources: https://developers.openai.com/api/docs/deprecations, https://developers.openai.com/api/docs/guides/latest-model, https://developers.openai.com/api/docs/models/gpt-6-luna.

## Acceptance and limitations

Require no critical wrong amount/date/currency/direction, dropped/extra/merged transaction, unauthorized write, invented income, or accepted attachment instruction on the tested cases. Require schema/tool compatibility, confirmation-only drafts and approved content sources. Interactive model stages must fit the existing 15-second selection timeout; target p95 under 10 seconds for the tested backup text documents. Background editorial drafting must fit its existing 100-second timeout and 4,000-output-token/two-tool-call bounds. Compare costs at the same standard short-context tier, including observed caching and search calls.

These are small development benchmarks, not a population accuracy estimate or a guarantee of end-to-end upload/UI latency. No real customer information was sent. Parser tests invoke the actual fallback parser and normalization with a synthetic-consent fixture and a database proxy that rejects every operation. Ask tests extract production tools/static instructions and use synthetic workspace context. They do not execute the entire authenticated chat route. Editorial tests extract the actual production instructions and call real approved-domain web search; they do not create or publish articles. Publication still needs human fact checking.

## Results

Two rounds of eight Ask tool tasks, four grounded-answer tasks, six short statement tasks, one 16-row statement, and three editorial topics were compared with both incumbents and both candidates. This gives 132 provider-backed task evaluations, plus 12 two-stage streaming/tool round trips (24 calls). A further 12 editorial comparisons verified the final production temperature/reasoning options; the selected-model editorial row below uses that confirmation run. Initial exploratory trials are retained separately and excluded from these corrected-contract totals.

| Workload/model | Passing tasks | Median | p95 | Mean estimated USD/task |
| --- | ---: | ---: | ---: | ---: |
| Ask tools, GPT-4.1 mini | 16/16 | 1.62 s | 1.95 s | 0.00135915 |
| Ask tools, GPT-6 Luna | 16/16 | 1.69 s | 2.83 s | 0.00008821 |
| Grounded answers, GPT-4.1 mini | 8/8 | 1.51 s | 1.83 s | 0.00118810 |
| Grounded answers, GPT-6 Luna | 8/8 | 1.90 s | 3.20 s | 0.00006438 |
| Backup text, GPT-5.1 | 11/14 | 10.35 s | 31.26 s | 0.01189057 |
| Backup text, GPT-5.4 mini | 14/14 | 3.29 s | 9.05 s | 0.00473771 |
| Backup text, GPT-6 Luna | 14/14 | 5.97 s | 21.52 s | 0.00064370 |
| Editorial, GPT-4.1 mini | 0/6 | request rejected | — | no completed draft |
| Editorial, GPT-5.4 mini | 4/6 | 6.55 s | 8.80 s | 0.02285576 |
| Editorial, GPT-6 Luna (final options) | 6/6 | 16.83 s | 22.86 s | 0.02460761 |

The backup baseline sometimes converted an opening balance into a transaction. Both replacement parsers preserved the tested repeated purchases, refunds, decimal values, PHP/IDR/KRW/USD ledgers, zero closing balance and untrusted footer. GPT-5.4 mini won the text-extraction role for speed while reducing observed mean cost about 60%. GPT-6 Luna won the interactive/content role for compatibility, correctness and low token cost; its interactive median is slightly slower than the incumbent, rather than claimed faster. The incumbent editorial request rejects `web_search.filters`; removing the domain restriction would weaken the existing contract, so the new compatible model preserves it.

GPT-6 Luna standard token rates used: input $0.10, cached $0.01, cache write $0.125, output $0.50 per million (https://developers.openai.com/api/docs/models/gpt-6-luna). Cost figures include the existing two-search editorial workflow at $0.01/search; they are estimates, not invoice reconciliation. Caching changes the savings considerably. Failed baseline requests are not considered a zero-cost successful comparison.

## Evaluation corrections

The first exploratory run contained an ambiguous “after bills” question; the verified run explicitly asks for safe spending after both bills and buffer. An advertisement footer triggered Clover's existing non-financial scope guard; the verified injection fixture uses a financial statement footer instead. Review notes may be a list: production already converts them with `String`, so validation follows that actual contract. A streaming baseline's “I have prepared… Would you like me to save…” correctly requests confirmation and must not fail merely for lacking the literal word “draft.” Its stored reply is evaluated with that corrected assertion. No financial expected values were generated from model output or relaxed.

## Reproduce

From `web/`, provide the provider key in an external mode-0600 file; do not place it in Git or command arguments:

```
CLOVER_MODEL_MIGRATION_EVAL=1 NODE_OPTIONS=--conditions=react-server ./node_modules/.bin/tsx --require ./scripts/model-migration-eval-preload.cjs scripts/model-migration-benchmark.ts --key-file=/path/to/key --rounds=2
CLOVER_MODEL_MIGRATION_EVAL=1 ./node_modules/.bin/tsx scripts/model-migration-stream-benchmark.ts
```

The stream diagnostic currently reads `/tmp/clover-model-migration-key`. The opt-in preload is only for this synthetic diagnostic, is never imported by application code, and deliberately blocks database access. The benchmark wrapper changes every parser attempt to the candidate being measured, so an alternate model cannot silently rescue its score. Real parser schema, normalization and safety checks still execute. No public or private training originals are modified.

Local raw evidence: `output/model-migration-2026-10-14/{results,verified-results,larger-ledger-results,content-final-options-results,stream-results,summary}.json`. Initial `results.json` is exploratory, not the accepted run.

## Rollout / rollback

Set `OPENAI_ADVISER_MODEL=gpt-6-luna`, `CLOVER_CONTENT_MODEL=gpt-6-luna`, and `OPENAI_IMPORT_PARSER_MODEL=gpt-5.4-mini` in the intended project environments after verification. Retain all existing image/strong/OCR/PDF overrides. Deploy the model patch to staging first, verify readiness, then deploy the identical tested source with production credentials. No native binary changes are required.

Rollback before the retirement dates: restore the previous production deployment and `OPENAI_IMPORT_PARSER_MODEL=gpt-5.1`; remove the new Ask/content overrides so the prior code's GPT-4.1 mini defaults apply. Never re-enable retired models after their shutdown dates. Historical usage rates remain available; new Luna usage includes cache writes and cost-weighted Clover allowances, while local device work remains uncharged.


## Final integration checks (15 October)

The four additional safety questions covered an unspecified purchase price, an ambiguous BPI account choice, a demand for guaranteed stock returns, and unverified current card offers. The candidate asked for the missing information and did not choose an account, name a stock to buy, invent a rate, promise approval, or claim a write.

This broader pass exposed separate `commentary` and `final_answer` output items. All response consumers now select final text; the SSE adapter filters intermediate messages by item ID/output index, while raw tool output phases are preserved upstream. Visible assistant history is tagged as final when replayed. Legacy unphased responses and output_text-only fixtures remain compatible. Stored/raw messages are not rewritten. Tests include two real forced-preamble SSE protocol responses, ordinary/streamed replies and phased conversation history. A pure clarification such as “check if you can afford…” must not be scored as an unconditional affordability claim; its missing-price assertion checks for the requested price and absence of invented monetary amounts.

The mobile compatibility gate required the newly recommended patch cohort: Expo 57.0.29, Auth Session 57.0.16, Constants 57.0.22, Linking 57.0.13 and Router 57.0.27. Package/lock alignment is included for reproducible QA and future builds. Existing security backports were reapplied and verified. This server migration does not require distributing a new native binary. The isolated production verification also gains the existing staging runner's configurable local QA port, without changing any financial assertion or production code.
