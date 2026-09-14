# Clover native offline and on-device design

Figma: [04 — Offline & On-device](https://www.figma.com/design/FNnCmCj90szZAnZ6twMPCy/Screens?node-id=1206-472062).

Fourteen new light/dark mobile screens cover Sync & Offline, working offline, pending changes, conflicts, on-device Adviser, model availability and offline file previews. They retain the shared mobile navigation and semantic Clover colors. The frames are 390 × 844 minimum, with non-clipping layout. These designs describe native app behavior; desktop/mobile web remain online clients.

## Device data and access

- SQLCipher database, scoped by API environment and Clerk user. A random 256-bit key stays in SecureStore; iOS uses device-only, unlocked keychain access. Encryption availability is checked and fails closed. Unsupported/old builds continue using the online API.
- iOS database directory is excluded from backups and uses complete file protection. Android backups are disabled. Files selected for import are stored as encrypted original bytes, up to ten files of 3.5 MB each. Decrypted temporary copies are removed after use and on next launch after an interruption.
- A server data-wipe epoch purges stale cached records and outboxes on reconnection; stale queued operations cannot restore a pre-wipe record.
- First sign-in and first data download need a connection. Cached authorization is limited to seven days. Sign-out explicitly warns about unsynced changes and purges local financial data. HTTP authorization errors never become an offline-cache success. Reconnection checks Profile ownership before sending the outbox.
- Download this Profile fetches Home, accounts, choices and up to 600 transactions. Other supported pages become available after being opened online. Financial lists and charts show downloaded snapshots; partial history and pending edits are disclosed. Shared Circles, billing, provider connections, destructive operations and linked transfers require a connection.
- Sync is attempted on connectivity return and app foreground. Mobile operating systems may suspend the app; background completion is not promised.

## Financial changes

Offline creation supports manual income/expense transactions. Offline detail editing supports name, note and tags on a previously downloaded transaction. Amount/account/currency changes and linked transfers require a connection. Confirmed source data is not overwritten by AI.

Each queued mutation has a durable UUID. A server-only journal, the transaction mutation and an audit entry commit atomically. Concurrent/repeated sends return the original receipt. Reusing a UUID for different content is rejected. Updates compare the server's `updatedAt`; conflicts show both versions and require an explicit choice. Keeping an edit creates a fresh operation against the reviewed version. Raw source payloads remain intact. User-confirmed category choices reuse Clover's learning pipeline.

The file queue checks its stable import ID before upload/retry. Once the server acknowledges the source, the original follows the existing parser, enrichment, duplicate and review pipeline. Local PDF/image OCR reads up to five pages and 40,000 characters; CSV/TSV previews show bounded source rows without guessing ambiguous dates or transaction direction. Unsupported encodings/formats remain queued for full online parsing. Supported local models can explain a partial preview and suggest fields/categories with confidence and source evidence. These estimates remain review-only; local previews never create or confirm imported transactions.

## On-device tools

- Supported OS speech recognition is forced to run on device when offline. If unavailable, the UI offers typing; it does not silently send audio to a server.
- iOS uses Vision/PDFKit for text extraction and Apple's Foundation Models when the device has an available Apple Intelligence model. Android uses bundled ML Kit OCR and the ML Kit Prompt API/Gemini Nano when available. Model downloads require a connection and explicit action. Capability checks handle unsupported devices.
- Adviser calculates current-month downloaded income/spending with integer minor units, separates currencies and excludes transfers/excluded rows. The language model receives only this summary and the question; it explains rather than calculates authoritative balances. Suggestions never execute financial changes. Missing data, model failure or local allowance exhaustion leaves the calculated summary available.
- Exact matches to at least two consistent, downloaded, confirmed merchant records may suggest a category with confidence and a reason. Applying it is an explicit user action on a draft.
- Cloud is a separate, visible mode. On-device questions are not silently forwarded to cloud. Broader Adviser questions may need cloud data/context.

## Local allowance

User-approved policy: Free 50 / Pro 500 local model requests per UTC calendar month. Cloud token limits do not change. Math, OCR and transcription do not consume local requests.

The server reserves device portions (10 Free / 50 Pro at a time) under an account-wide lock. Reservations across devices cannot exceed the monthly allowance. Used receipts are monotonic. The encrypted device counter increments before inference and refunds failed inference. A reservation expires at the monthly boundary; connect to renew. Abandoned/reinstalled-device reservations remain reserved through expiry. Fully offline enforcement is best effort on a tampered/rooted device; it is not equivalent to server-side billing enforcement.

## Build and release requirements

Native builds require iOS 17+ and Android 8+ (API 26, required by ML Kit Prompt). Native dependencies require a new iOS/Android build; a Vercel deployment does not update installed binaries. Expo Go does not provide this encrypted/native functionality. Apple export-compliance answers must account for the newly bundled SQLCipher cryptography, so the previous blanket `ITSAppUsesNonExemptEncryption: false` setting has been removed. Complete the release declaration before store submission.

Physical-device acceptance still needs airplane-mode restart, device locking, local speech in supported languages, OCR accuracy on representative files, Apple Intelligence/Gemini Nano availability and inference, memory/battery checks, and reconnection with conflicting edits. Compiling a bridge does not certify these device-dependent behaviors.
