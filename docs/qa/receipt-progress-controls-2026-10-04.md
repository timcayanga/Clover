# Receipt progress and launch branding

Figma references:
- [Upload progress in context, light](https://www.figma.com/design/FNnCmCj90szZAnZ6twMPCy/Screens?node-id=514-3697)
- [Upload progress in context, dark](https://www.figma.com/design/FNnCmCj90szZAnZ6twMPCy/Screens?node-id=762-395203)
- [iOS gradient launch branding](https://www.figma.com/design/FNnCmCj90szZAnZ6twMPCy/Screens?node-id=1996-111882)

The 24 existing desktop/mobile progress references now show one current-step label, one progress bar, and plain icon controls. The progress overlay has no scrim; the surrounding app remains usable. The launch reference consists of editable original Clover logo/wordmark vector paths. Native launch uses a 1320 × 1104 raster exported from those same vectors, with the approved teal-to-mint gradient wordmark.

Active progress UI omits the filename, percentage text, parser details, and explanatory copy. Icon controls retain accessible labels and 44-point targets. Password prompts and actionable failure/review states remain available when needed. Completion never reports 100% based on transfer completion alone.

Pause/cancel are real controls. Uploads abort/retain their source while paused. After server handoff, the control route records an authorized durable user request, independent of transient progress phases. Workers acknowledge it at safe checkpoints; an in-flight model request may finish first. Resume restarts only acknowledged pauses. Cancellation never deletes confirmed financial records. An unsuccessful control request cannot remove the local import. Status recovery respects paused/cancelled imports.

Focused verification:
- `mobile-offline-regression.ts`: 41/41, including delayed finalize responses after pause/cancel, failed cancellation, explicit resume and source retention.
- `import-progress-ui-regression.tsx`: rendered stage/bar-only content, accessible pause/resume/cancel/dismiss controls, and truthful completion.
- `import-user-control-regression.ts`: durable state, checkpoint acknowledgement, idempotency, resume and confirmed-record protection with isolated persistence.
- `import-upload-handoff-regression.ts` and `receipt-camera-import-regression.ts`: passed after updating obsolete presentation assertions.
- Native and web TypeScript checks passed.
- Figma screenshots inspected for the compact mobile overlay and launch reference; Poppins labels remain editable and no whole-screen raster was used.

Additional native verification: from `mobile/android`, `ANDROID_HOME=/Users/TimCayanga1/Library/Android/sdk ./gradlew :clover-local-ai:compileDebugKotlin --console=plain` passed in 23 seconds. This compiled the Android OCR module and its library dependencies, including the EXIF/downsampling changes; it did not assemble an app, build a store bundle, or upload anything. Dependency deprecation warnings were nonblocking.

Partial receipt failures expose a `Review receipt` action in the web dock, only for the exact partial-draft review message. It opens the receipt editor with focus containment, Escape/close support, safe-area spacing and the bottom navigation hidden. Saving refreshes account/transaction/Home/report data. Active progress stays limited to its step and bar. Regression command: `npm --prefix web run qa:import-upload-handoff`, plus `cd web && ./node_modules/.bin/tsx scripts/receipt-camera-import-regression.ts`.

A new native binary is required for the iOS launch asset. Physical device pause/cancel timing, dynamic text sizing and launch snapshots still need verification in the next build.
