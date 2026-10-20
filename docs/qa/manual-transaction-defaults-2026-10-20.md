# Manual transaction defaults — October 20, 2026

New drafts only; existing transactions are not migrated or reclassified.

| Type | Name example | Saved name when blank | Default category |
| --- | --- | --- | --- |
| Expense | Lunch | Expense | Other, unless a suggestion or explicit category is selected |
| Income | Salary | Income | Income, unless an explicit non-generic category is selected |
| Transfer | Transfer | Transfer | Transfers |

A blank date uses the client's current local date. A blank amount saves as zero. Zero-value records and paired zero-value transfers remain included in history without changing balances. Invalid dates, malformed decimal amounts, negatives and unavailable accounts still fail validation. Paired transfers continue to require two different same-currency accounts.

Web entry and the shared API, native creation schema, and offline synchronization use the new defaults. Native form and offline-engine source is updated for the next release; no native binary or OTA update is deployed with this work. Older binaries retain their built-in form validation until a subsequent mobile release.

Figma: [Income mobile](https://www.figma.com/design/FNnCmCj90szZAnZ6twMPCy/Screens?node-id=522-4669), [manual mobile master](https://www.figma.com/design/FNnCmCj90szZAnZ6twMPCy/Screens?node-id=1246-531262), and corresponding desktop/dark states. Existing zero-amount validation examples now request an account only.

Verification includes real route creation and offline-sync replay against disposable PostgreSQL, rejection without partial writes, exact zero transfer legs, explicit category preservation, idempotent replay and an immutable existing confirmed transaction. The fixture is part of the required pre-push release gate.
