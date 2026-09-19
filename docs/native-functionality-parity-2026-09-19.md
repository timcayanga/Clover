# Native functionality pass — 19 September 2026

## Implemented

- Added a dedicated investment trade ledger for buy, sell, reinvestment, transfer in, and transfer out. Native review, create, edit and delete flows use explicit confirmation. Edits and deletions reverse the previous unit/cost-basis effect before applying the replacement. Trades serialize on the account, reject stale revisions and overselling, and retain an audit revision. Identical create/edit retries are idempotent. Sale proceeds and cost basis are separate inputs. Recording trades does not execute orders, move cash, alter statement snapshots, or mark market valuations as current.
- Kept earlier investment purchases and dividends. Purchase mutations now lock the account so they cannot race the trade ledger. Purchase deletion rejects units or basis already consumed by later activity.
- Added paginated native import preview and confirmation using the existing import worker, duplicate checks, Profile access checks and review flags. Progress uses backend processing milestones, with a Clover gradient; it is not a byte-accurate upload timer.
- Added native Circle resource forms for budgets, goals, commitments, contributions, participants, role/status updates and sharing/unsharing expenses. Added Circle photos and owner-only archival that preserves shared history. Backend roles remain authoritative.
- Added custom native report dates and previous-period/year comparisons, cumulative spending pace, income/spending charts, merchant totals, repeated-merchant observations, distinct category table and an Income → Accounts → Expenses diagram. Pro flows are withheld by the server for non-Pro users. Date windows follow Asia/Manila; transfers are excluded from income and spending.
- Added verified asset-catalog logos with generic fallbacks, native notification destinations for budget/goal/account/Circle details, and a legacy-goal copy flow that preserves the original account goal.

## Validation

- Disposable PostgreSQL integration: tested the actual ledger migration and store for buy/edit/sell/delete, reinvestment and transfers, concurrent writes, duplicate retries, stale revisions, oversell rollback, Profile isolation, audit records and RLS. No user financial records changed.
- Regression coverage includes mobile API authentication/allowlist, report date bounds and leap-day comparisons, transfer exclusion, Pro projection and notification destinations.
- Installed iOS preview loaded the current development bundle through Metro. Fictional sample mode verified Trends charts, custom date filters, asset details, all five trade choices, the Sell cost-basis label and shared bottom navigation. The development bundle has no Clerk publishable-key configuration, so signed-in device writes were not exercised.
- iOS and Android JavaScript bundles compile through the full release gate. Bundle compilation is not signed release-build or physical-device verification.

## Remaining audit work / limits

- The trade ledger intentionally supports one holding per account. Multi-asset statement accounts reject writes; a per-asset position model and reconciliation with dated holding snapshots are still needed. Counterpart transfers are recorded separately, not atomically paired.
- Native asset editing still uses the linked account editor. Imported account activity has no reliable per-asset identifier, so it must not be described as an asset-filtered ledger.
- Native uploads still use the existing small-file transport; resumable larger uploads and real pause/cancel semantics remain. Do not expose fake pause/cancel controls.
- Circle email invitation acceptance, contribution-to-goal/member assignment, richer commitment assignment and visibility choices remain. The new forms cover the existing resource operations but do not claim full Circle parity.
- Native Admin scope remains unresolved. Full signed-in iOS and Android installed-device checks are still required. Existing Android emulator availability does not prove updated UI/runtime behavior.
