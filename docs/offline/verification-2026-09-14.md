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

### Native OCR warm-up benchmark

Use `mobile/scripts/native-ocr-warmup-harness.tsx` as the entry for a local Debug build, following the harness setup above. Place two distinct synthetic PNGs named `qa-receipt.png` and `qa-warmup.png` in the app document directory. Print `125.00` on the measured receipt and use readable synthetic text on the warm-up image. For each trial, write `qa-ocr-trial.json` with `arm` set to `cold` or `warm`, a unique `trial` ID, and an optional `idleMs` value. Force stop and relaunch the app between every trial, including warm trials. The harness writes one `qa-ocr-result-<trial>.json` per run.

Alternate arms on each physical device with the same build and fixtures. Compare at least ten trials per arm on each older iPhone and low-end Android model, including a short or zero idle interval. Compare median and p90 `firstUseMs`, OCR correctness, failed trials, idle overruns, and longest JS frame gap. Use Xcode Instruments or Android system tracing to check native frame time and peak memory. The JS frame measurement alone covers JS responsiveness. Enable warming only for device groups with a repeatable first-use improvement and no observed regression in correctness, frame time, or memory.
