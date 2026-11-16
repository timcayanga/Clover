# Metrobank reconciliation — 27 September 2026

The production investigation found a full uploaded account number and a matching length-preserving provider mask (seven visible digits, not a seven-digit account). Existing strict identity matching supports this; it must not be weakened to suffix-only matching. The older duplicate was not automatically merged.

User-authorized repair retained the uploaded account and 18 existing rows unchanged, moved 14 provider rows without changing their IDs/raw payloads, and remapped the existing bank link and account rule. Three bank rows had no nearby uploaded overlap. Eleven possible overlaps/direction or posting-date conflicts are excluded and pending review; confirmed edits are never overwritten. All 14 provider records remained unchanged. The empty duplicate card was removed inside the same serializable transaction; a protected local backup and database audit preserve its original record. No fresh bank sync or authorization was initiated.

Display fixes prevent stale import projections and checkpoint inference from overriding provider snapshots, preserve bank origin, and use bank snapshots in desktop Adviser and Reports. A zero bank balance is authoritative. Strict masked identity and reconciliation/cached balance regressions are part of qa:finverse.

The reconciliation CLI is dry-run by default. Applying requires explicit source/target IDs, a new protected backup file path, compatible bank identity, no confirmed source edits, dependency checks and --apply. Potential transaction overlaps remain excluded for review instead of silently choosing which financial data is correct.
