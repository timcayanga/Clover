# Clover Domain Modules

This directory contains both general application utilities and Clover's protected financial-data pipeline. Check this map before moving code across module boundaries.

## Protected Pipeline

| Module | Responsibility | Change requirement |
| --- | --- | --- |
| `import-parser.ts` | Detects files and deterministically parses institution formats | Read the matching `docs/*-parser-rules.md` file and run parser regressions |
| `data-engine.ts` | Normalizes parsed records, categorizes them, and learns from confirmed edits | Preserve confirmed values and run both data-engine regressions |
| `merchant-labels.ts` | Durable institution and merchant title normalization | Add rules only when supported by parser evidence |
| `../workers/import-processor.ts` | Coordinates raw files, parsed rows, normalized records, and review state | Preserve idempotency, traceability, and retry behavior |
| `../prisma/schema.prisma` | Defines persisted raw, parsed, normalized, and learned stages | Use a migration and verify staging before production |

Do not merge these stages into a single module or payload. Their separation preserves auditability and prevents uncertain parser output from silently overwriting confirmed financial history.

## Safe Refactoring Sequence

1. Identify callers with static and dynamic import searches.
2. Add or update a regression that captures current behavior.
3. Refactor one boundary at a time without changing persisted shapes.
4. Run `npm run qa:data-engine` from the repository root.
5. Run the relevant parser or feature regression.
6. Verify the full import-to-report flow on staging.

Presentation helpers, formatting utilities, and route adapters may be reorganized more freely, but they should not duplicate parsing, authorization, or persistence rules.
