# Entry, branding and account deletion follow-up

The supplied `assets/logos/Logos V3/name_color.png` is the source for the signed-out wordmark. The high-resolution native launch asset keeps the established vector lettering and now matches its light cyan-to-teal direction. It replaces the previous teal-to-mint direction.

In Figma file `FNnCmCj90szZAnZ6twMPCy`, the opening screens `1075:51550`, `1075:51592`, `1075:51641`, and `1075:51683` now pair cropped app previews with existing Clover mascot poses. The launch screen is `1996:111882`; the corrected editable wordmark is `2001:596327`. Account deletion completion is `2003:552254`. Restore-purchase ownership guidance is `2003:552276`.

Signed-out native launches show the opening pages. After authentication, protected app routes remain unavailable until bootstrap determines whether onboarding is required. The authentication screen remains in place while that decision resolves, and errors expose both Retry and Sign out. Restored sessions retain the launch image until bootstrap resolves. This prevents the Home screen from appearing briefly before onboarding.

Successful account deletion opens a friendly confirmation with the reassuring mascot, on both native and web. Native completion has scrollable content and top/bottom safe-area padding. It remains available if local sign-out cleanup needs a retry. No completion is shown for failed deletion, and normal sign-out still prompts for unsynced local work.

Verification: native auth callback/nonce tests, onboarding behavior and persistence checks, launch routing regression, analytics coverage, and the new executable `account-deletion-flow-check.mjs` and `auth-entry-recovery-check.mjs` pass. The new checks are included in `mobile`'s `check:auth`. Figma PNG exports were visually inspected for wordmark, four opening screens, and deletion completion. Final physical-device animation and launch verification requires a future native binary; no binary was built for this task.

Final visual follow-up: the fourth opening preview crops its legacy top bar by 64px at 342px design width, matching Figma artwork `1793:565385` within `1075:51687`. At a 390px screen width the preview is 326px wide and shifts up 61.01px; 396 design pixels of content remain below the crop, exceeding the 330px viewport. The first three slides retain zero crop. This is a view transform, with no modification to the screenshot raster.
