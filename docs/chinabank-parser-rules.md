# China Bank Parser Rules

This document captures the current China Bank parsing guidance for Clover.

## Scope

- Applies to China Bank statement PDFs.
- Preserve raw statement text and normalized transactions separately.
- Prefer deterministic parsing before any OCR or model fallback.

## Statement Shape

- China Bank statements in the sample set use a statement-period summary box plus a transaction table.
- The summary box usually includes beginning balance, total debit, total credit, and ending balance.
- Transaction rows can be fragmented across OCR lines, especially on image-heavy PDFs.

## Parsing Guidance

- Trust the transaction table over footer text, page markers, or repeated summary blocks.
- Keep check numbers, references, and reversal markers in raw payloads when present.
- Preserve long account-holder names when they wrap across lines.
- Treat housekeeping, reversal, and memo rows separately from ordinary debit and credit activity.

## Review

- Rows with ambiguous debit versus credit direction should go to review instead of being auto-confirmed.
- If OCR output is too fragmented to reconstruct the running balance reliably, fall back to the OpenAI OCR path rather than inventing rows.
