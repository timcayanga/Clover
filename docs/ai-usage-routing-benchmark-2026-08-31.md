# AI usage, routing, speed, and accuracy benchmark

Date: 2026-08-31

Baseline revision: `3b364d0c`

Post-improvement revision: current staging worktree after financial scope gates and exact model-call metering

## Measurement rules

- Historical token counts for imports and Adviser are not called exact because the old audit records did not persist provider usage fields.
- Historical import routing is measured from retained import files and `import.openai_fallback` audit records.
- Parser speed and extraction coverage are measured by replaying the same local PDF corpus against both revisions without writing financial records.
- The replay's coverage metrics are parser proxies, not manually verified field-level truth for every row.
- Post-improvement token telemetry records provider-reported input, cached input, output, reasoning, and total tokens for each model call.

## Controlled parser replay

| Corpus | Files | Locally parsed | Vision required | Protected | Rows | Date coverage | Name coverage | Identity coverage |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Samples | 82 | 65 | 17 | 0 | 2,642 | 99.2% | 100.0% | 100.0% |
| Actual statements | 81 | 45 | 1 | 35 | 1,458 | 100.0% | 100.0% | 100.0% |
| Combined | 163 | 110 | 18 | 35 | 4,100 | 99.5% | 100.0% | 100.0% |

Among the 128 readable, unlocked PDFs, 110, or 85.9%, completed through the deterministic text parser. The other 18, or 14.1%, required a visual path. Protected PDFs are excluded from this routing denominator because they require a password before either parser can read them.

## Baseline versus post-improvement replay

| Measure | Baseline | Post-improvement | Result |
| --- | ---: | ---: | --- |
| Sample rows | 2,642 | 2,642 | No regression |
| Sample median local time | 24 ms | 25 ms | Equivalent |
| Sample p95 local time | 133 ms | 134 ms | Equivalent |
| Actual-statement rows | 1,458 | 1,458 | No regression |
| Actual-statement median local time | 16 ms | 16 ms | No regression |
| Actual-statement p95 local time | 73 ms | 73 ms | No regression |
| Non-financial Adviser requests | Could reach model work | Rejected before workspace or model work | 0 tokens post-change |
| Clear non-financial uploads | Could reach backup parsing | Rejected before backup parsing | 0 tokens post-change |

The sample timing comparison uses three warmed runs per revision. Mean local time was 45 ms per file for both revisions. Single cold runs were excluded from the comparison because PDF font initialization introduced unrelated warm-up variance.

## Observed production routing baseline

| Period | Uploads | Local/no audited paid fallback | Audited paid fallback | Paid fallback rate |
| --- | ---: | ---: | ---: | ---: |
| Lifetime retained files | 801 | 766 | 35 | 4.4% |
| Last 30 days | 77 | 48 | 29 | 37.7% |
| Last 7 days | 23 | 7 | 16 | 69.6% |

There were 51 historical paid fallback calls across 48 files, including files no longer retained. The model mix was 37 GPT-5.5 calls, 9 GPT-5.1 calls, and 5 GPT-5.4 Mini calls.

The high recent fallback percentage reflects the recent receipt and unfamiliar-image test mix, not the long-term mix of ordinary deterministic statement imports.

## Historical speed and QA score

| File family | QA-covered files | Paid fallback rate | Median parser time | p95 parser time | Average QA score |
| --- | ---: | ---: | ---: | ---: | ---: |
| Images | 171 | 18.1% | 4.49 s | 28.23 s | 79.5 |
| PDFs | 336 | 0.9% | 3.52 s | 19.95 s | 82.0 |
| Structured CSV or spreadsheet | 24 | 0.0% | 0 ms | 1.02 s | 79.8 |
| Other deterministic files | 87 | 0.0% | 0.45 s | 1.77 s | 94.6 |

The structured-file total workflow time is higher than parser time because confirmation and background workflow time are included separately. It should not be interpreted as model latency.

## Token usage by use case

| Use case | Baseline measurement | Post-improvement behavior |
| --- | --- | --- |
| Deterministic CSV, spreadsheet, or known statement | 0 model tokens | 0 model tokens |
| Clear non-financial upload | Previously unmetered and could escalate | 0 model tokens after the local scope rejection |
| Receipt or screenshot using backup vision | Historical exact input unavailable; retained model output is approximately 845 to 1,197 tokens per successful call on average, estimated from response length | Exact input, cached input, output, reasoning, total tokens, model, stage, and latency are now audited per call |
| Complex or visual statement using backup parsing | Historical exact totals unavailable | Exact per-call usage is now audited; deterministic-ready statements still skip the model |
| Split-bill receipt backup | Historical exact totals unavailable | Exact per-call usage is now audited |
| Adviser out-of-scope question | Could consume a normal Adviser request | 0 model tokens |
| Adviser deterministic clarification or fallback | 0 model tokens | 0 model tokens and now audited as local |
| Adviser financial question | Historical calls were not metered; the prior planning assumption of 10,000 input plus 1,000 output equals 11,000 raw API tokens, not 7,500 raw tokens | Exact provider usage is audited on new traffic; one call for direct answers and usually two calls for tool-backed answers |

Historical import output token estimates use response characters divided by four and are deliberately labeled estimates. Image and PDF input token usage cannot be reconstructed reliably from the old audit payloads.

## Adviser routing

All 11 recorded historical Adviser questions are financial under the new scope classifier. Ten select one focused tool and one is answerable directly from grounded context. The average selected tool count is 0.91 per question, rather than sending the full 27-tool catalog. Because the observed questions were all in scope, the new scope gate would not reduce their call count; it prevents future non-financial use from consuming any model tokens.

## Post-improvement instrumentation

Each import model call now emits a separate `import.openai_model_call` audit with:

- model and stage
- import mode and document family
- input and cached-input tokens
- output and reasoning tokens
- total tokens
- image count and output budget
- request duration and request sequence

This makes the next production benchmark exact without storing document content in the token-usage audit.

## Remaining measurement gap

No post-change production Adviser or import model calls had occurred when this benchmark was run. Exact post-change averages therefore start accumulating only after deployment and new usage. The controlled corpus proves no deterministic parsing regression, but it cannot substitute for provider-reported token counts on live visual requests.
