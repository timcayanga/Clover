# Page 1 Organize refresh — 12 September 2026

Reference: Figma `FNnCmCj90szZAnZ6twMPCy`, Page `0:1` (01 — Organize). Compared the latest Figma task decisions and exported design contexts against staging commit `e18d72d0`.

## Design changes

- Home: desktop Adviser at the right; mobile navigation menu at the left and Adviser/notifications at the right. Section headings use Poppins Semibold, 16px.
- Accounts: one contextual Adviser beside the desktop title; mobile Adviser/title/Add header. Long section headings reflow before their totals. Existing mobile currency, bank connection, and upload controls remain available under Account tools.
- Account, institution, and asset detail pages: generic page titles retain the account identity inside the content. Edit controls use a white container. Native account details close back to their list.
- Transactions: currency selection is inside Filters. Search, Filter, and Upload use icon controls. Mobile headers use a centered 18px title. Transaction details have Adviser and Close controls.
- Recurring: desktop icon tabs sit beside the title, with Adviser beside Add Recurring; mobile uses the same browser-tab treatment. Calendar controls include the date icon. Existing named/multiple payment events, review-section placement and empty-review removal remain intact.
- Add Transaction: Manual, Ask Clover, and Upload share one rounded segmented control. Selected segments use Clover's gradient and white icon/text.
- Upload: three stacked rows use the exact Figma file/camera/library exports; the security copy sits above password-protected PDF support. Native retains its actual 3.5MB transport limit rather than advertising the Figma sample limit.
- Bottom navigation: rectangular outer container and a squircle account avatar.

The native implementation is shared by iOS and Android. Web uses the existing responsive desktop/mobile implementation and theme tokens. Native fonts and PNGs are bundled locally; PNGs are rasterizations of the exact Figma SVG exports. Poppins licensing is included with the font.

## Reference nodes inspected

Home desktop `50:361`, mobile `50:625`; Account Details `52:244`; Transactions `50:505`; Recurring `439:2142`; Add Transaction `522:4259`; Upload `531:8535`, dark Upload `759:342106`. Page metadata and the Figma task's subsequent refinements were used to identify the final shared-control decisions.

## Verification

- Existing desktop/mobile-web fixture regression: 19 checks passed.
- Existing native UI fixture regression in light/dark modes: 28 checks passed.
- Focused desktop/mobile-web refresh: 10 checks passed, including all three file pickers on both layouts.
- Focused native refresh in light/dark modes: 12 checks passed.
- Fixed defects discovered during verification: mobile web camera/library inputs were not mounted; native method/recurring tabs needed explicit selected-state accessibility attributes; native startup now consistently opens Home.
- Full `npm run qa:prepush`: passed, including regression suite, mobile API checks, iOS/Android exports, and the production Next.js build.
- Existing source checks were updated for the shared upload component, Home’s right-side Adviser, and currency filtering inside Filters. Their interaction behavior was independently checked in the browser.

Browser fixtures use a local isolated QA database. Native browser checks exercise React Native Web in sample mode, not an iOS simulator, Android emulator, or signed store binary. Temporary fixture routes are removed before release. No customer financial records are modified by these checks.
