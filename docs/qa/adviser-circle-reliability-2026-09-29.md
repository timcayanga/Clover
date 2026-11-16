# Adviser reliability and Circle member photos

Observed during production demo-account setup:
- "What is an emergency fund?" and "Check upcoming bills" were rejected by the finance scope gate.
- A weekly account-checking routine mentioning a credit card was routed to product recommendations.
- PHP summaries included USD income without conversion. Month/category requests were sent to literal transaction text search and could incorrectly report no expenses.
- Outstanding loan principal was treated as an upcoming installment; budget status used a rolling window without account/category/cadence matching.
- The Clerk provider returned no initial session when Stay signed in was disabled, interrupting client token refresh despite valid server page requests. Preserve Clerk's active session while ignoring the optional remembered-session override.
- Permission reads converted every backend error to HTTP 401; fetching permission unnecessarily synchronized Clerk profiles and refreshed plans.
- Circle membership displayed initials despite existing shared-person photos.

Changes:
- Expand supported financial concepts and bill commands while preserving unrelated-topic rejection. Product recommendations require recommendation/selection intent.
- Filter calculation inputs by requested/default currency before aggregating; preserve transaction currency in evidence. Resolve explicit calendar months without falling back to unrelated historical rows for empty periods.
- Calculate general month/category expense summaries directly. Use the existing budget engine for account/category/currency/cadence rules. Loan payment estimates use recorded installments; unknown installments are disclosed.
- Read existing identities directly for permission checks, retain authentication and consent enforcement, distinguish service failures, and retry transient read failures once. A failed read never grants consent.
- Load Circle photos only after access is established. Prefer a member's Clerk profile photo, otherwise match one unambiguous shared person within the Circle owner's directory. No global name search. Web and native displays fall back to initials on missing/broken images.

Tests:
- `qa:adviser-reliability`: original failed prompts, recommendation distinction, month/year boundaries, currency selection, installment-vs-balance semantics, budget currency/period arithmetic, photo matching and ambiguity, permission retry/fail-closed behavior.
- Existing Adviser everyday, scope, routing, Circle, and collection-loading regressions.
- Required repository `qa:prepush`, including web/native type checks and production builds.

No schema migration or changes to existing confirmed financial records are required.
