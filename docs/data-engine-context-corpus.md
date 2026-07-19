# Data Engine Context Corpus

Version: `2026.07.6`

The context corpus provides regional and global evidence for transaction normalization. It is advisory context: it may enrich a parsed row or increase confidence, but it must not overwrite confirmed transaction fields.

## Current coverage

- Global: Wise, PayPal, card networks, cross-border transfers
- Philippines: GCash, Maya, InstaPay, PESONet, BPI, BDO, UnionBank
- Southeast Asia: Singapore, Malaysia, Indonesia, Thailand, Vietnam
- East Asia: Japan, Hong Kong, Taiwan
- Diaspora and international accounts: India, UAE, SEPA/Europe, United States, United Kingdom, Australia

## Evidence policy

Each entry has aliases, geography, payment rail, institution type, currency, semantic hints, and confidence. Aliases are evidence only; they are not sufficient by themselves to replace a user-confirmed merchant, category, or type.

The resolver returns multiple signals, regional parsing metadata, and a `contextStatus`:

- `matched`: one coherent regional interpretation;
- `ambiguous`: conflicting country or rail evidence, so regional fields and semantic hints are suppressed;
- `unmatched`: no corpus evidence beyond any explicitly supplied currency.

Field-level confidence is tracked separately for geography, rail, institution type, currency, category, and transaction type. Travel and foreign-currency signals are intentionally separate from country inference: an overseas hotel does not prove which country the user visited.

Regional parsing metadata includes likely locale, date order, decimal separator, grouping separator, languages, and common legal-entity suffixes. These values are parsing hints only. The parser must still prefer statement headers, explicit format metadata, and successful statement templates when they disagree.

Every corpus signal is marked as curated, learned, or user-confirmed, with an active, candidate, or retired review status. The quality report checks unique entry IDs, duplicate aliases, valid confidence bounds, and unique regional profiles before a corpus change is accepted.

Repeated confirmed or edited user corrections can now be aggregated into reviewable corpus candidates. Candidates require repeated consistent observations, are capped below deterministic confidence, and remain `source: learned` plus `reviewStatus: candidate` until explicitly reviewed. Conflicting country or currency evidence is retained as evidence rather than auto-resolved.

For generic delimited imports, known regional profiles now provide a conservative fallback for numeric dates and amount separators. Explicit statement parser rules still take precedence; unknown or ambiguous regions fall back to the existing parser and retain the original raw record.

The engine should keep these layers separate:

1. raw statement/OCR text;
2. parsed values;
3. corpus-derived context;
4. normalized values;
5. learned user rules;
6. confirmed user values.

When corpus evidence conflicts with a confirmed value, the confirmed value wins. When evidence is unfamiliar or ambiguous, the row remains reviewable.

## Expansion roadmap

1. Add explicit country, region, payment rail, and evidence fields to normalized payloads.
2. Expand institution and wallet aliases from real imported statements.
3. Use locale-aware date, decimal, language, and legal-entity metadata in generic parsing fallbacks.
4. Add foreign-currency conversion, exchange-fee, and travel-event grouping.
5. Add regional regression fixtures and confidence calibration.
6. Promote repeated, high-quality user corrections into versioned corpus entries only after review.

## Adding an entry

Prefer a narrow alias and an explicit semantic meaning. Include a negative example when an alias is commonly ambiguous. Do not add a merchant to a shared corpus solely because one user confirmed it; that belongs in workspace-scoped learning rules.
