# Receipt progress and launch branding

Figma references:
- [Upload progress in context, light](https://www.figma.com/design/FNnCmCj90szZAnZ6twMPCy/Screens?node-id=514-3697)
- [Upload progress in context, dark](https://www.figma.com/design/FNnCmCj90szZAnZ6twMPCy/Screens?node-id=762-395203)
- [iOS gradient launch branding](https://www.figma.com/design/FNnCmCj90szZAnZ6twMPCy/Screens?node-id=1996-111882)

The 24 existing desktop/mobile progress references now show one current-step label, one progress bar, and plain icon controls. The progress overlay has no scrim; the surrounding app remains usable. The launch reference consists of editable original Clover logo/wordmark vector paths. Native launch uses a 1320 × 1104 raster exported from those same vectors, with the corrected light-teal/cyan-to-teal gradient matching the supplied `assets/logos/Logos V3/name_color.png`. The previous teal-to-mint treatment was incorrect; the 4 Oct follow-up replaces it in Figma and the iOS launch asset.

Active progress UI omits the filename, parser details, and explanatory copy. The follow-up restores a compact percentage beside the current step as requested. Icon controls retain accessible labels and 44-point targets. Password prompts and actionable failure/review states remain available when needed. Completion never reports 100% based on transfer completion alone.

Pause/cancel are real controls. Uploads abort/retain their source while paused. After server handoff, the control route records an authorized durable user request, independent of transient progress phases. Workers acknowledge it at safe checkpoints; an in-flight model request may finish first. Resume restarts only acknowledged pauses. Cancellation never deletes confirmed financial records. An unsuccessful control request cannot remove the local import. Status recovery respects paused/cancelled imports.

Focused verification:
- `mobile-offline-regression.ts`: 41/41, including delayed finalize responses after pause/cancel, failed cancellation, explicit resume and source retention.
- `import-progress-ui-regression.tsx`: rendered stage/percentage/bar content, accessible pause/resume/cancel/dismiss controls, and truthful completion.
- `import-user-control-regression.ts`: durable state, checkpoint acknowledgement, idempotency, resume and confirmed-record protection with isolated persistence.
- `import-upload-handoff-regression.ts` and `receipt-camera-import-regression.ts`: passed after updating obsolete presentation assertions.
- Native and web TypeScript checks passed.
- Figma screenshots inspected for the compact mobile overlay and launch reference; Poppins labels remain editable and no whole-screen raster was used.

Additional native verification: from `mobile/android`, `ANDROID_HOME=/Users/TimCayanga1/Library/Android/sdk ./gradlew :clover-local-ai:compileDebugKotlin --console=plain` passed in 23 seconds. This compiled the Android OCR module and its library dependencies, including the EXIF/downsampling changes; it did not assemble an app, build a store bundle, or upload anything. Dependency deprecation warnings were nonblocking.

Partial receipt failures expose a `Review receipt` action in the web dock, only for the exact partial-draft review message. It opens the receipt editor with focus containment, Escape/close support, safe-area spacing and the bottom navigation hidden. Saving refreshes account/transaction/Home/report data. Active progress stays limited to its step, percentage and bar. Regression command: `npm --prefix web run qa:import-upload-handoff`, plus `cd web && ./node_modules/.bin/tsx scripts/receipt-camera-import-regression.ts`.

A new native binary is required for the iOS launch asset. Physical device pause/cancel timing, dynamic text sizing and launch snapshots still need verification in the next build.


## Follow-up: native completion and receipt warning parity

- Transactions now registers the focused-screen refresh callback used by import completion. The cache is cleared and the focused page is reloaded once per completed batch before the dock presents 100%. During that refresh it shows 95% and “Updating your page”. Navigating to another page remains available.
- Native completion now consumes `settledImportComplete`, retaining `visibleImportComplete` compatibility with earlier servers. A finished parser status with no persisted visible data cannot complete the dock.
- Native list badges, detail explanations and demo Needs Review filtering use actionable server review reasons. A clean 98%-confidence row in `pending_review` has no warning merely because it is pending. Duplicate/account/currency issues still appear even when extraction confidence is high.
- Receipt default-currency, file-name date and arithmetic validation provenance produce specific explanations. Future receipt transaction payloads preserve validation metadata. Existing confirmed transactions are not changed.
- Both native and web docks show the numeric percentage with the existing step, one bar and plain pause/cancel controls. The Figma agent updated all 24 progress references before UI changes.
- Focused verification passed: web and native TypeScript; mobile API projection; mobile transaction filters; transaction review/cache race; compact progress rendering; 43/43 offline checks, including waiting for the focused refresh and refusing premature completion.
- Physical iPhone/Android upload-to-list rendering remains to be checked with a new binary. This pass does not claim an on-device timing measurement.
