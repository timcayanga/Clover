# Native and Admin parity completion

Requested after staging commit `7d67cc86`. Work in `.worktrees/qa-staging-release`; preserve the unrelated main checkout. Deploy completed changes to staging after the full release gate.

## Implemented scope (verification limits below)

- [x] Native custom Clerk sign-in/sign-up, verification, password reset, social sign-in.
- [x] Native account photo, linked accounts, password and active sessions.
- [x] Native Profile creation, rename and safe removal.
- [x] Native Display, Data/export/deletion, Review, Categories, notification preferences and regional controls matching Figma.
- [x] Native onboarding step layout and welcome illustrations match Figma.
- [x] Native plan purchase/restore/manage integration preparation and server verification; live store flows remain disabled pending setup.
- [x] Notification details navigate inside the app where a native destination exists.
- [x] Admin assignment, priority and work queue.
- [x] Admin customer replies, preview, delivery outcome and conversation history.
- [x] Admin bulk retry preview, eligibility/conflict checks and partial outcomes.
- [x] Admin temporary Pro grants/revocation/expiry using existing `ProAccessGrant` and `getProAccess`.
- [x] Admin roles, permission enforcement and approval states.
- [ ] Complete live account/store and Android visual verification (see measured results and limits below).

## Approved decisions and external dependencies

- Store apps/products are not created yet. User requested integration preparation and setup steps; live purchase/restore verification depends on later store setup. Current preview identifier is `ph.clover.preview`.
- Admin policy approved: Owner/Admin/Support/Read-only; temporary grants do not change billing; retry only failed imports without confirmed transactions; a different Owner must approve destructive actions.

Implementation and fixture tests must not send customer messages or mutate live confirmed financial data. Existing Admin reads target production even from staging; use isolated local QA fixtures.

## References

Figma file `FNnCmCj90szZAnZ6twMPCy`, page `8:72`.
Settings section `674:65252`, authentication `663:62769`, enhanced Admin `731:251238`. Proposal annotations `1069:51549`–`1069:51555`.
Existing reusable services: `web/lib/pro-access.ts`, `web/lib/admin-support.ts`, `web/lib/contact-inquiries.ts`, `web/app/api/workspaces`, `web/app/api/categories`, `web/app/api/settings`.

## Implementation and verification — September 13, 2026

Implementation and pre-deployment verification for this release. Consult the task release result and Vercel for the deployed commit/status.

- Native custom authentication, additional verification and sensitive-action reverification; password/session management, photo, connected accounts and safe disconnect.
- Native Profile/category management, safe empty-Profile removal, CSV/PDF export, deletion confirmations, shared preferences, onboarding, notification destinations and store preparation.
- Shared preferences are enforced for notification delivery, learning and Adviser context. Web Settings can save the same values. Mandatory low-confidence review and sign-out cache clearing cannot be disabled.
- Admin role enforcement, staff audit, different-Owner approvals, request-bound one-use execution, changed-data checks and recovery snapshot access.
- Support assignment/priority/snooze/work queue, internal notes, reply preview/idempotency/uncertain-delivery handling, newest conversation entries and older-history pagination.
- Bulk retry preview/one-use execution/worker conflict protection. Eligibility is stricter than the approved minimum: any existing transaction prevents retry, preserving confirmed records.
- RevenueCat adapter and server-verified ledger are prepared. Store sales default to disabled; see `mobile-store-setup.md`.

Completed checks:

| Suite | Result | Scope |
|---|---|---|
| Connect & Platform fixture | 26/26 pass | Isolated local database; ownership, persistence, privacy enforcement, exports, safe deletion, routing |
| Admin fixture | 17/17 pass | Roles, approval execution/recovery, grants/expiry/revocation, support, 205-message pagination, retry conflicts; mocked SMTP/queue |
| Store preparation fixture | 8/8 pass | Server verification rules and mocked provider/webhook responses; no real store purchase |
| Native sample Settings preview | 9/9 pass | RN-web navigation and shared bottom navigation; reviewed dark-mode screenshots; not installed-device proof |
| Installed iOS Release | Build + launch + 9 Settings sections pass | iPhone 17 Pro simulator, iOS 26.5; sample mode; Review/Data screenshots inspected |
| Android Release | Build, install and process startup pass | Java 17; Pixel 10 API 36.1 ARM64; no captured AndroidRuntime/ReactNativeJS errors; visual navigation unverified |
| Admin local UI | 4 screens + assignment/preview pass | Security, Approvals, Work queue, Import operations; desktop and mobile screenshots; disposable local case; no email sent |
| Full `npm run qa:prepush` | Pass | Web/API regressions, TypeScript, Expo compatibility, iOS/Android Hermes exports, Next production build |

iOS Release compiled, installed and launched successfully; all nine Settings sections retained shared navigation. Android Release compiled with Java 17, installed and started on Pixel 10 API 36.1; no runtime/JavaScript errors were captured. Android visual navigation remains unverified: the UI controller could not attach to the standalone emulator, and Android Studio hit an internal TransactionGuard error opening the generated project. The preview builds have no native Clerk public key configured, so account-dependent actions were not exercised.
The Admin UI harness temporarily omitted Clerk middleware from ignored local build output; it was restored after the check. This UI result does not prove authentication. Permission tests ran separately through the isolated API fixture.
No actual Clerk MFA/social reauthentication, camera/photo permission flow, or live
purchase/restore has been marked passed by the sample preview.

## Operational dependencies and limits

- Five additive migrations are required: Admin membership, approvals, support history, store access and shared preferences. Their local QA application was verified. Staging deployment uses the existing migration hook; verify its build result before treating the release as live.
- The updated import worker must be deployed by its normal worker-service process (see `admin-import-worker-setup.md`). Vercel web deployment alone does not update a persistent worker. Bulk retry refuses execution while its guarded worker is offline.
- Approval previews detect changes to the tracked financial collections; they do not freeze all user activity. Restore snapshots cover Clover's existing core restore payload, not every raw import or planning record. A core snapshot is not a full account backup.
- Store app IDs/products and RevenueCat configuration remain external setup work. No store listing, signed release submission, or purchase was created.
- No real customer email was sent and no live confirmed financial record was altered by these fixtures.
