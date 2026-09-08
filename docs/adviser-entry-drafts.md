# Adviser entry drafts and mobile voice

Implemented 2026-09-08. This work spans the `mobile-api-staging` backend worktree and `landing-preview-messaging/mobile` native app. Release the matching API before distributing the native build. No deployment is included.

## User flow

Adviser can receive the current unsaved transaction, account, investment or receipt form through explicit form registration. “Ask Adviser” carries that context into the shared conversation. The web integration registers supported financial forms rather than collecting arbitrary keystrokes. Context stays in memory, is scoped to the selected Profile, and expires after ten minutes on web. Passwords and account numbers are excluded from the allowed context fields.

Users can type multiple expenses/income entries in one message, revise the proposed rows, choose existing or newly drafted accounts, and confirm the batch. Exact merchant/amount lines use deterministic parsing where possible; flexible requests use the existing server model. Uncertain or missing values remain editable. The phone summary model does not rephrase write proposals.

Supported drafts: up to 10 accounts/holdings, 50 transactions and 10 existing receipt attachments, with up to 100 lines per receipt. Investment creation supports holding metadata; transfers and investment trades are not represented as ordinary expense entries. Existing confirmed account/transaction values are not silently replaced.

Receipt items, taxes and discounts belong to a single payment. For existing receipts, Adviser appends items and requires the combined total to equal the existing payment. Saving receipt detail never creates an additional payment or changes its amount. A stale receipt version requires refreshing and reviewing again. Original raw receipt evidence is preserved; subsequent edits in the normal transaction screen update the normalized items.

## Confirmation and persistence

The authenticated entries endpoint checks Profile ownership, account/category references, limits, currencies and exact receipt totals. The batch commits atomically. A persisted draft identifier prevents duplicate records from simultaneous confirmations or retries; a changed replay is rejected. Uncertain network results lock editing and allow retrying the same draft. Successful confirmation records the source proposal and audit result, invalidates cached summaries and feeds existing learning/recurring detection.

Browser conversation drafts are in memory and restored only after the server verifies the selected Profile. Native drafts remain in the Profile-scoped conversation provider. Demo mode cannot save. New drafts are intentionally not durable across process restarts.

## Mobile voice

The microphone control transcribes into the editable chat input. It never submits a message or confirms a save. Users can finish recording, correct the transcript, send it and review the resulting draft using the same text workflow.

The native bridge uses Apple on-device speech recognition and Android on-device SpeechRecognizer (Android API 31+ with an available recognizer). Microphone/speech permissions and language support are required. Unsupported devices or languages retain text entry. Audio is not automatically sent to a cloud speech service. Recording is bounded to 60 seconds and cancelled when leaving the screen, switching Profile, backgrounding or unmounting. These native module changes require rebuilding the app; an OTA JavaScript update alone is insufficient.

## Verification

- Backend and native TypeScript checks.
- Entry schemas, exact decimal arithmetic, incomplete drafts, context allowlist, intent routing and later receipt edits.
- Mobile API regression checks and native Adviser engine tests, including entry-context forwarding and avoiding phone rephrasing for write drafts.
- Real disposable PostgreSQL tests: concurrent idempotency, changed replay rejection, atomic rollback, ownership/reference isolation, new-account dependencies, receipt reconciliation, raw preservation and optimistic conflicts. The database regression refuses any URL other than the dedicated local test database.
- Browser test of the actual editable batch component: revised a merchant and confirmed two transactions against the disposable database. This is a component/integration fixture, not an end-to-end test of production authentication or live GPT extraction.
- iOS voice module compiled successfully in the simulator workspace; Android Kotlin module and app manifest compiled successfully. iOS and Android JavaScript exports checked.

Physical-device microphone permissions, supported-language behavior, audio interruptions and transcription accuracy still need device QA. Production authentication, live model extraction and full app release builds are not claimed by the fixture/module checks.

Run backend `npm run qa:adviser-entries` and `npm run qa:mobile-api`; native `npm run typecheck`, `npm run test:adviser` and `npm run build:bundles`. The database suite is `npm run qa:adviser-entries:database` with its explicitly guarded disposable PostgreSQL URL. The entry wire contract is mirrored between backend `lib/adviser-entry-types.ts` and native `src/adviser-entry-types.ts`; keep them synchronized.

## Composer attachments (2026-09-08)

All shared web Adviser composers now include a + file picker and show Send when text or an attachment is present. The native composer includes file/library/camera choices and an inline microphone. Native blank/whitespace text shows the microphone; text shows Send; active recording keeps Stop visible until recognition finishes. Attaching a file does not submit the message. Native users type or dictate their instruction before sending.

Up to three PDF, spreadsheet, text/Markdown or image attachments of 3.5 MB each are supported. Extraction reuses Clover's existing PDF/spreadsheet/image text readers. The combined extracted context is limited to 24,000 characters; larger documents are rejected with guidance to use statement import rather than silently truncated. This path reads source content and prepares Adviser drafts; it does not run the statement import worker or automatically save financial records. Complex/large statements should use the existing import workflow.

Original files are retained in private object storage and linked through Profile/actor-scoped audit records. Chat requests carry IDs, not client-supplied extracted text or public URLs. Confirmed entry drafts retain the source IDs. Removing an attachment chip removes it from the active chat context; it does not delete retained source evidence. Metadata stays in memory on clients. Attachments are read on Clover's server and their bounded text is included in the existing cloud Adviser request; these uploads are not processed by the phone summary model. Uploads are rate limited.

Verification includes component browser checks at desktop and mobile widths, format/size/ID validation, mobile API regression tests, and a disposable PostgreSQL test proving extraction, private raw-file storage, ownership isolation and no account or transaction creation from attachment alone. Browser API responses are synthetic; live GPT extraction and physical-device microphone/photo-picker behavior remain release QA tasks.
