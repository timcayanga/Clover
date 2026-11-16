# Figma parity follow-up — 14 September 2026

Starting staging commit: `94abc614`.
Figma file: `FNnCmCj90szZAnZ6twMPCy`.
References inspected: native Adviser master `1243:505251` desktop Transactions master `1244:511820`, and Accounts desktop master `1243:503144`.

## Verified differences corrected

- Authenticated Accounts retained Connect/Sync bank header controls, a teal Add Account action and a 15% tint override that suppressed the brand palette. The header now follows Figma; cards and mobile rows reuse the existing brand background and contrast-aware foreground. Generic unknown/Other accounts use a bold slate-blue palette.

- Authenticated desktop staging still displayed active filter chips in a row above Transactions. The chips now live inside the filter overlay, with an active-filter count on both desktop and mobile filter buttons.
- Selecting transactions previously inserted a selection strip into the list layout. Selection actions now use the existing header overlay, keeping search visible and table placement stable. Existing explicit deletion confirmation and financial mutation handlers are unchanged.
- Native Adviser used a stack of settings cards and a separate field/voice/action list. It now uses a personalized welcome, full-width rounded suggestions, one upload/text/microphone-or-send composer, and distinct user/Clover bubbles. During a conversation the composer remains beneath the scrolling content and above shared navigation.
- Cloud versus on-device processing remains explicitly visible. Expanded settings retain the existing explanation, mode switch and download management. Sample mode still cannot send questions or financial data.
- The shared voice control retains its previous Quick Add behavior; the chat composer is an optional presentation. Its upload action routes to the actual Upload tab.

## Validation evidence

- Native TypeScript and transaction-filter/mobile-navigation regression checks passed.
- RN-web sample preview inspected at 390×844 and 320×568. At 320px, document scroll width is 320px and all five navigation tabs stay within bounds.
- Prompt selection fills the composer and replaces Speak with Send. Sending in sample mode displays the existing sign-in safeguard. Upload opens the Upload tab with Choose files, Take photo and Photo library.
- Full root `npm run qa:prepush` passed, including native iOS/Android bundles and optimized web build. The publication hook runs this gate again.

## Scope and remaining verification

This is a targeted follow-up, not certification of every Figma state. Native persistent chat history, rich report rendering inside chat, and installed-device keyboard/dictation behavior still need their own implementation or device verification. An RN-web preview and native bundle export do not prove installed iOS/Android visual parity or distribute a new native binary. No confirmed financial records were modified during visual inspection.
