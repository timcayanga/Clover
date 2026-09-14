# Offline feature verification — 14 September 2026

Approved policy: Free 50 / Pro 500 local model requests per UTC month. Cloud token limits are unchanged.

## Executed checks

- Pure offline regression suite: 20 scenarios covering durable outbox/replay, conflict resolution, access isolation/expiry, wipe epochs, downloaded history, allowance serialization, encrypted file queue behavior and conservative table previews.
- Isolated PostgreSQL integration: 10 checks. Concurrent replay creates one row/receipt/audit; payload reuse, wrong user, category type mismatch and stale wipe epochs are rejected; concurrent edits preserve confirmed source/financial fields; device reservations cannot exceed the account cap. Fixtures are removed after each run. The migration SQL was applied to the dedicated local database and its RLS/role restrictions checked.
- iOS simulator: full native Debug build succeeded; eight runtime checks passed, including SQLCipher persistence, no plaintext database header/content, wrong-key rejection, purge, concurrent initial opening, native capabilities, synthetic receipt OCR and Foundation Models generation. See native-ios-results.json.
- Android emulator: full native Debug build succeeded; seven runtime checks passed. Gemini Nano is unavailable in this emulator, so model inference was not executed; unavailable capability fallback and bundled OCR were verified. See native-android-results.json.
- Mobile dependency audit has no high/critical findings; existing moderate transitive findings remain.

The native checks found and resolved a first-open database locking race. The full initialization sequence is serialized per identity and passed on both platforms after the fix.

## Reproducing native checks

The harness is `mobile/scripts/native-offline-harness.tsx`, outside the app router. Temporarily use it as the Expo entry for a local Debug build, then restore `mobile/index.ts` to `import 'expo-router/entry';` before any shipping bundle. Place a synthetic receipt named `qa-receipt.png` in the app document directory to include OCR. Results are written to `clover-offline-native-qa.json` in that directory. It uses only synthetic storage identities.

## Remaining device acceptance

Physical-device airplane-mode/restart and lock behavior; speech in supported languages; representative financial-file OCR accuracy; supported Gemini Nano hardware inference; memory/battery behavior and store release signing/compliance. These are not claimed complete by simulator checks. New native binaries are required; Vercel staging updates only the server/web portion.

The complete root `npm run qa:prepush` passed after the final functional changes, using an intentionally unreachable loopback database URL for checks and builds. This includes the existing parser/data-engine/mobile regressions, typechecks, native bundles and web production build.
