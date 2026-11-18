# Mobile 1.1.6 discrepancy corrections

Figma: https://www.figma.com/design/FNnCmCj90szZAnZ6twMPCy?node-id=2497-43

Native source prepared without creating mobile binaries:
- Subtabs reserve 44 px in loading and loaded states; selected labels remain one line.
- Account menu shows the installed version, with Expo configuration fallback.
- Contextual chat has one bottom composer, emoji suggestions immediately above it, and no nested draggable screen or navigation.
- Add chat places the larger composer after messages and removes the explanatory subtitles.
- Transaction filters include category, account and type marks, institution groups, and exclude investment holdings.
- Selection toolbar includes Edit, Add To and Delete. The Edit sheet changes only explicitly selected fields through existing audited edits. Retry skips already saved rows.
- Selected Add icons explicitly tint white. Manual and upload source icons share Clover colors.
- Upload source limit is 25 MiB. Existing chunk transport and image optimization remain bounded.
- Recent imports use compact rows with uploaded date, account, saved transaction count and proper-case status. The history query is read-only and limited to 10 source files.

Web/server release applies upload source limits, icons, concise copy, picker filtering and import history metadata. Installed native layouts require a future app update; this deployment does not alter installed 1.1.6 screens.

Validation: mobile and web TypeScript checks; rendered subtab states; empty/replied embedded chat keyboard/dock layout; explicit bulk-edit payloads, partial failure and resume; native actual-byte upload validation; transaction filter semantics; 69 offline checks. No personal financial records were modified during verification.

The pre-existing broad import-upload-handoff source-pattern suite fails on password flow assertions that no longer match the deployed baseline. Focused upload byte/limit checks pass; no unrelated password behavior was changed for this release.
