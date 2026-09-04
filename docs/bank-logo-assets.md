# Bank logo library

The September 3, 2026 update adds 94 supplied regional logo files to the 82 existing bank/generic picker choices (176 total). The additional files cover China, Hong Kong, Indonesia, Malaysia, the Netherlands, the Philippines (Atome), Singapore, Thailand, the UK and Vietnam. The supplied US directory is empty.

- Canonical originals live in `assets/banks/`. The user's original directory and filenames are preserved, including extensionless ABN AMRO (JPEG) and Airwallex (PNG) inputs.
- `web/lib/bank-logo-catalog.json` maps each added source to a label, region, aliases and content hash. The catalog adapter serves a stable pathname with a hash-based cache version, and saved built-in selections resolve to the latest version.
- `web/scripts/sync-public-assets.ts` creates sequentially decoded, maximum-128px WebP copies at build time, including browser-safe outputs for extensionless sources. Original inputs total 4,893,818 bytes; optimized outputs total 290,896 bytes (about 94% smaller).
- Generic icons from `1 generic` are also copied to their existing public URLs so saved generic selections remain valid.
- The picker includes country labels and lazy-loaded images. Automatic matching uses the supplied institution first and explicit regional wording when present. It does not infer a user's location. Existing custom logo overrides remain authoritative.
- Logo availability does not imply a dedicated statement parser or new financial-data integration for that institution. This change affects presentation and institution suggestions only.

## Updating

Add the original image, add/update its catalog entry, and regenerate its SHA-256 first-ten-character filename suffix when the image content changes. Run `npx tsx scripts/sync-public-assets.ts` from `web/`, then `npm run qa:account-logo`. The regression validates output existence, image format/dimensions, unique choice IDs, cache fingerprints, regional/alias recognition, legacy generic choices and custom override safety. It is included in the full pre-push release gate through `qa:account-card-gallery`.

## Verification and deployment

The full `npm run qa:prepush` passed, including typecheck, release regressions and the optimized build. Live browser verification counted 176 choices and 176 successfully decoded images, with no failed logo images. Airwallex returned HTTP 200 and `image/webp`. No account records were changed. Three pre-deployment browser message-channel errors were present in the tab log; no logo-loading errors occurred in the published picker.

- URL: https://staging.clover.ph
- Deployment: https://clover-7pqg3wjrt-timcayangas-projects.vercel.app
- Target: preview/staging; production unchanged
- Status: READY; health check confirms `dpl_6RS7tn5wMop4kQmdvBnjefhGxQmU`
- Commit: worktree snapshot on `b29962ce`, including uncommitted fixes
- Framework: Next.js 15.5.22
- Build/deployment duration: approximately 3 minutes
