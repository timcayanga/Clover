# Import Parser Arbitration

This layer protects unknown, changed, and previously trained statement formats from being persisted solely because one parser recognized the institution.

## Candidate ladder

For document statements, Clover can compare:

1. The trained or institution-specific deterministic parser.
2. The institution-neutral generic statement or credit-card parser.
3. The schema-validated backup parser when routing requires it.

Structured spreadsheets keep their deterministic schema parser and do not enter the document challenger path.

## Selection rules

- The trained parser remains preferred when candidates are close.
- A challenger replaces the trained parser only when the trained result is critical or the challenger is non-critical and materially better.
- Candidate quality includes row validation, extraction evidence, currency consistency, and financial reconciliation.
- Opening and ending balances are reconciled when direction is explicit and unresolved transfers are absent.
- Running-balance movements are compared with transaction amounts when the source exposes balances.
- Close candidates that materially disagree are kept review-required rather than silently merged.
- Candidate rows are never loosely combined. Clover selects one candidate and preserves its source evidence.

## Layout drift

- A learned statement-family signature is compared with the current document signature.
- Low signature overlap with a weak template match marks the layout as drifted.
- Drift prevents the trained parser from taking the fast path and activates backup verification.
- A changed layout is a new version of the institution format; it does not overwrite confirmed data or a prior parser template.

## Persistence safety

- Critical candidates remain fail-closed.
- Arbitration metadata is stored with parsed-row provenance for audit and Admin diagnostics.
- Ambiguous winners are marked pending review.
- Merchant enrichment remains downstream of safe row extraction and cannot make an unsafe candidate valid.
