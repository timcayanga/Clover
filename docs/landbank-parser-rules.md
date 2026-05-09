# Landbank Parser Rules

This document captures the current LandBank parsing guidance for Clover.

## Scope

- Applies to Land Bank of the Philippines statement PDFs.
- Keep raw and normalized data separate.
- Prefer deterministic parsing before any AI fallback.

## Statement Shape

- LandBank statements in the sample set behave like a running-balance ledger.
- Use statement dates and balance movements to infer transaction direction when possible.
- Preserve the statement account number and account holder exactly as printed.

## Transaction Rules

- `TRANSFER (Internet Banking)` should normalize as a transfer.
- `Cash Out - Order` should normalize as a cash/ATM-style expense or transfer-like outflow, depending on the surrounding statement context.

## Parsing Guidance

- Keep transaction descriptions intact in raw payloads.
- Do not collapse transfer and cash-out activity into generic spend unless the statement is genuinely ambiguous.

## Review

- Any row that cannot be confidently classified as transfer versus cash withdrawal should be routed to review.

