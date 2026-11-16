# Connect & Platform implementation — September 13, 2026

Reference: Figma file `FNnCmCj90szZAnZ6twMPCy`, page `8:72` (03 — Connect & Platform), and the corresponding Figma task's latest edits.

## Applied changes

- Landing and six feature stories: all 76 desktop/mobile chapter backgrounds use the approved composed photographs, crops, fades and table blur. Public pages remain light-only. Desktop feature headings use the intended two-line layout; obsolete hero document cards and the extra mobile progress strip are removed.
- Phone previews use 14 current Figma screen captures across the relevant 23 instances. Assets are compressed WebP; `assets/connect-platform/source-nodes.json` records their source nodes without temporary download URLs. `web/lib/connect-platform-designs.ts` maps chapters to local assets.
- Web authentication/onboarding: mint ambient background, white inputs, full currency names, white-text primary upload, three mobile upload choices with Clover icons, and separate file/camera/library inputs.
- Web Settings: refreshed cards, compact rounded actions, mobile headings and dark surfaces. Existing account/security/data/review/category/profile functionality remains available.
- Notifications: All, Unread, Needs attention and Activity filters; explicit read and dismiss actions; confirmation before clearing; retry states. Read status is returned by the authenticated web and native APIs.
- Admin: desktop sidebar, horizontal mobile navigation, compact cards and corrected dark backgrounds, using the existing operational pages and permissions.
- Shared iOS/Android code: four-slide welcome with swipe/dots/Next, persistent first-visit state, Explore Clover replay, sign-up and sign-in; native onboarding and default currency selection with direct file/camera/library handoff; Settings for account names, Profile switching, device appearance and regional preferences; a native notification feed with read/dismiss/confirmation.

## Scope boundaries from the design

Figma nodes `1069:51551` and `1069:51552` explicitly distinguish current Admin capabilities from proposals. Assignment/priority, customer replies, bulk retry previews, expiring entitlement adjustments and expanded approval states are not activated by this visual refresh. Existing user editing, access, export/wipe and core-data recovery remain in the Admin website; recovery snapshots exclude raw source files.

Native Settings is not a complete port of every advanced web Settings tool. Security/social/photo management, data tools, review/category configuration and Profile creation/deletion remain web capabilities. Native builds continue to use hosted Clerk authentication and the existing native upload pipeline. Vercel deployment updates the website and native API, not installed app binaries.

## Verification

- 114 public chapter browser checks: 38 chapters at 1440, 390 and 320 pixels, including visible-image loading and horizontal overflow. Repeated after the final public layout changes.
- 44 web setup/Settings/notification checks: desktop/mobile, ten Settings sections in both themes, full currency labels, three upload inputs, notification filters/read state and canceled clear confirmation. Disposable local data and mocked browser API responses; no external messages sent.
- Admin desktop/mobile checks in both themes; final review includes the real Admin layout stylesheet.
- 14 native React Native web-preview checks: welcome navigation, persisted first-visit/replay behavior and appearance settings at 390 and 360 pixels. This is not device or simulator validation.
- 12 isolated database integration checks in `web/scripts/connect-platform-fixture.ts`: authentication, new-user bootstrap, currency validation, starter setup/replay, safe account field projection and updates, regional persistence without currency conversion, notification read/dismiss and foreign-key rejection. Only the dedicated fixture user is created and removed in a local `_qa` database.
- The full `npm run qa:prepush` gate passed: TypeScript, release regression suites, native API checks, iOS/Android Hermes bundles and the optimized Next build. The pre-push hook repeats the gate.

No schema migration or confirmed financial record transformation is introduced. Signed iOS/Android binaries and physical-device camera/authentication tests are separate from the Vercel release.
