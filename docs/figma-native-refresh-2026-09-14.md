# Figma refresh — 14 September 2026

Compared Screens `FNnCmCj90szZAnZ6twMPCy` with the source for iOS build 1 and Android version 2. The original store builds did not include the newer changes below. The Figma task was still updating store screenshot artwork; this release targets the live Screens UI, not the Apps & Social Media carousel.

References: Accounts mobile `50:660`; account-type icons `1166:51839` and components `1166:477504`–`1166:477543`; Reports donut desktop `572:27391` and mobile `572:27596`; Split Bills group `974:444435`, payment card `975:444443`, bills list `973:444445`; shared mobile navigation in the Accounts reference.

Changes: exact exported generic account-type icons in source assets and native bundles; compact native account rows with type icons and asset/liability colors; consistent account-card typography; centered Reports donut and wrapping chart controls; native donut view; Split Bills group photos, Clover gradients, payment-card styling and bill navigation; native shared navigation sizing and accessible labels. Existing user photos remain preferred. Default group imagery is a Figma stock illustration, not a claim about membership. New app icon uses the user-supplied dark-background logo in both themes.

Native payment QR images remain the user's actual uploaded QR, with a white quiet zone. No sample QR is used. Unknown bill categories retain the neutral fallback. No financial calculation, confirmation, or settlement mutation is introduced by these visual updates.

Integration includes the separate staging Split Bills commit `fd10b294`; its category projection and row actions must be preserved. Build and test results are reported after integration. Browser previews do not constitute installed-device QA, live store purchase testing, or permission testing.
