# Offline and on-device work — 14 September 2026

Authorized: offline data/sync first; native speech/OCR and deterministic parsing; local Adviser/enrichment with separate local allowance; preserve cloud limits. Figma additions authorized. Worktree: qa-staging-release. Staging only after full quality gate.

## Acceptance scope
- Encrypted per-user/environment device database. Persistent account/Profile-scoped cached reads and outbox; clear on sign-out with pending-change warning. Never reuse another user's data or treat authorization errors as offline.
- Offline transaction creation and supported detail edits. Durable unique operation IDs, atomic server deduplication, version checks, explicit conflict review. Pending items visible; stale aggregate totals clearly marked. No silent financial overwrite.
- Selected files encrypted at rest, retained across restart, queued for online source-traceable import; local parse/OCR preview never masquerades as confirmed imported data.
- Offline speech explicitly requires supported on-device recognition. Native Foundation Models/Gemini Nano capability checks and on-device text/OCR bridges; unavailable models retain deterministic local tools and explicit online fallback.
- Local Adviser uses only downloaded Profile data, deterministic currency-separated calculations and disclosed coverage. Suggestions require confirmation. Local quota separate from cloud tokens, server-issued device reservations.
- Figma: Sync & offline settings, pending list, conflict review, local Adviser, file preview, model unavailable/download states; light/dark mobile with shared navigation.
- Meaningful replay, restart, race, cross-Profile/user, revoked-access, conflict and quota tests; typecheck/native compile where toolchains permit; staging deployment. Do not claim installed-device/model accuracy certification without device execution.

User approved Free 50 / Pro 500 local requests per month, reserved per device. Cloud allowances are unchanged.
