# Native feedback follow-up · 4 October 2026

This batch addresses the feedback after production iOS 30 / Android 33. It is intended for staging first. Native changes require replacement binaries before they can be exercised in the installed apps.

## Scope and behavior

- Use the supplied Logos V3 cyan-to-teal wordmark in native welcome and splash assets, with the corresponding Figma launch artwork.
- Show signed-out opening slides on each launch, with cropped app previews and Clover mascot poses. Keep login and sign-up directly accessible.
- Keep the authenticated app unavailable until bootstrap has determined whether onboarding is required. Do not briefly mount Home before onboarding.
- After the server confirms account deletion, show a friendly completion screen. Preserve failed-deletion errors and the existing store billing cancellation flow.
- Display compact import step and percentage. Wait for persisted results and the current page refresh before completing the progress display. Keep a useful refresh message if the saved result cannot be reloaded.
- Drive receipt warning icons, filters and detail explanations from actionable server review reasons. A clean, high-confidence pending suggestion does not itself need a warning. Retain known warnings for older downloaded rows until they receive the new projection.
- Center native single-line text vertically, retaining left alignment. Keep multiline inputs top aligned and allow the Transactions search row to grow for larger device text.
- Include resolved bank logos in native transaction account choices. Account-number fields are not added to the API projection.
- Suggest the institution for new account drafts from the established institution and bank-logo catalogue. For example, both “BPI” and “BPI Personal 1234” suggest BPI. Manual edits and explicit clearing take precedence. Existing accounts, cash and automatic stock-issuer guesses are excluded.

## Purchase ownership

The reported Apple test receipt remains attached to the Clover identity used for the original purchase. This is the configured RevenueCat ownership policy. The current demo login is a different identity; a Face ID confirmation does not transfer ownership.

The client now validates its native SDK identity and restore result, explains an ownership conflict accurately, links support, and retains the explanation after Refresh plan status. It does not disclose the other owner's identity or invite another checkout after a known conflict. No entitlement transfer or financial-record change was made.

See [purchase ownership diagnosis and verification](store-purchase-ownership-2026-10-04.md) for the production sandbox allowlist change and its deployment timing.

## Design references

Figma Screens file: `FNnCmCj90szZAnZ6twMPCy`.

- Launch artwork: `1996:111882`.
- Opening slides: `1075:51550`, `1075:51592`, `1075:51641`, `1075:51683`.
- Deletion completion: `2003:552254`.
- Purchase ownership explanation: `2003:552276`.
- Shared input master: `23:26` / value `23:27`.
- Add Account form: `1679:99961`; editable institution: `2001:111882`.

## Validation

The full root `npm run qa:prepush` passed, including production dependency audits, migration and dependency boundaries, release regressions, native typechecking, Android/iOS JavaScript bundles and the optimized web build. An initial run caught the new deletion route missing from the analytics allowlist; that mapping was added before the successful complete rerun.

Focused coverage includes account-name institution inference and overrides, logo projection privacy, store ownership and cancellation, receipt warning explanations, import completion ordering, authentication entry routing, failed-bootstrap sign-out recovery and deletion success/failure. The 46 offline regressions include delayed/rejected account refreshes, superseded requests, replaced focus/filter loaders and partially successful investment quotes.

A disposable browser harness rendered the actual native Field, ManualTransaction, AccountEditor and Welcome components at 390 × 844 with mocked services and the bundled Poppins font. It confirmed vertical alignment, the selected BPI logo, automatic institution suggestions, and preservation of manual overrides, explicit clearing and prefilled institutions. A simulated 2× font scale exercised the search row's growth from 38 to 56 pixels; physical OS font rendering remains unverified. This harness made no real account or transaction writes. Screenshots and the detailed verification note are in `/tmp/clover-input-review/`.

Figma screenshots were visually inspected. See [entry and branding evidence](entry-branding-2026-10-04.md) and [receipt progress checks](receipt-progress-controls-2026-10-04.md).

Physical checks still required in the next binaries: Apple receipt recovery with the owning test login, camera/library import and immediate transaction visibility, native keyboard and large-text input alignment, sign-up-to-onboarding animation, deleted-account completion, and cold-launch splash artwork.
