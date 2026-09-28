# Marketing full-bleed composition correction — 28 September 2026

## Change
Full-viewport photos behind the header and phone. New scene compositions reserve the left desktop copy column and right phone column; mobile people sit above the reading gradient. Desktop phone width is capped at 23vw, or 18vw in tall desktop windows. All six feature stories retain the same safe photo through their chapters, including their closing chapter.

## Image generation
Generated with the built-in image generation tool from the existing Clover photos. Desktop prompt direction: preserve people, clothes, activity and natural photography; full-bleed 16:9; subjects in the centre, heads below the header, quiet left copy area, empty right phone area; no baked-in gradients, UI or margins. Mobile prompt direction: vertical 9:19; clear top 14% for header, people in upper 55%, lower area for copy; no baked-in gradients or UI. Approved PNGs were encoded as WebP quality 92 without resizing/cropping. Original PNGs remain in the local generated_images archive and marketing-fullbleed-originals-2026-09-28.

Approved assets: understand, adviser and together (desktop/mobile); manage, feature-understand, plan, feature-together, security and pro (desktop); feature-understand and feature-together (mobile). The rejected feature-together draft is not shipped.

## Figma
File FNnCmCj90szZAnZ6twMPCy, page 8:72. Updated all 60 feature photo masters and six landing photo masters. PNG fills are used because uploaded WebP metadata did not render in Figma. Desktop phone layers were scaled together to preserve their screen alignment. Corrected overlapping mobile shared-money caption.

## Visual verification
Desktop 1440×900: six feature hero compositions and landing Accounts, Adviser and shared-money chapters inspected. Mobile 390×844: six feature hero compositions and landing Accounts, Adviser and shared-money chapters inspected. Short mobile 320×568: Understand feature inspected. Tall desktop 1024×900: shared-money chapter inspected after moving the phone above the right subject's lower body. Full photos cover behind header and phone; faces clear of header, phone and reading gradient in these checks. Figma shared-money desktop rendered and inspected after PNG replacement and phone resizing.

Deployment and regression results recorded after staging push.
