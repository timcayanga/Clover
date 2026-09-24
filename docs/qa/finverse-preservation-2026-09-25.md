# Connected-account preservation — 25 September 2026

Figma: https://www.figma.com/design/FNnCmCj90szZAnZ6twMPCy/Screens?node-id=1573-99309

Implemented existing-account identity matching, full-number retrieval with masked fallback, bank snapshot balance projection, cross-connection/repeated-sync deduplication, one-to-one statement overlap matching, excluded review for uncertain overlaps, monthly retained account slots and Unlink in desktop/mobile web and shared iOS/Android UI. Figma includes the reuse state, Unlink actions and confirmation variants for all four platforms.

Verification:
- Finverse regression covers account reuse without changing stored balance, repeated/concurrent sync, confirmed metadata preservation, repeated same-amount payments, deleted transaction tombstones, pending transactions, masked-number ambiguity, monthly reset/clamping, retained quota, same-account reconnection at full quota, scoped/idempotent unlink and preserved account/history.
- Mobile balance test verifies a ₱45,000 bank snapshot outranks ledger replay without changing the stored opening balance.
- Controlled browser fixture using the actual web component: 390px and 1280px have no horizontal overflow; cancel keeps the link; confirmed fixture unlink returns to Connect; full allowance disables a new account but permits a reserved existing account.
- No real bank authorization, sync, unlink or account merge was performed during verification. The available staging browser Profile shows a different Metrobank balance from the reported ₱73k/₱45k example, so no existing financial records were repaired or merged.
- Native source is shared by iOS and Android; the release gate checks native types and produces both bundles. Installed app previews require the next native build/update.

The bank allowance uses the subscription approval anniversary, with current billing-period start / store expiry anniversary as fallbacks where necessary. The optional reset-date question received no answer during implementation, so monthly subscription anniversaries were the stated default.
