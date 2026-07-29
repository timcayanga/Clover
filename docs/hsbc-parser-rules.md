# HSBC UK Parser Rules

## Scope

These rules cover HSBC UK mobile screenshots and HSBC UK current-account PDF statements using GBP.

## Deterministic Rules

- Detect `Online Bonus Saver`, `Global Money Account`, `Bank A/C`, or known HSBC screenshot evidence as HSBC.
- Keep the sort code and eight-digit account number separate from transaction descriptions; store the eight-digit account number as the account identifier.
- Treat product overview balances as account snapshot markers, not transactions. A missing Global Money currency balance remains unknown rather than being converted to zero.
- Parse `ADDED GROSS INT` and `GROSS INTEREST` as positive GBP income in the `Interest` category.
- Parse `GLOBAL MONEY` credits as positive GBP transfers in the `Transfers` category.
- Preserve transaction codes such as `INT` and `GPC028LV2Z` in the raw payload.
- Accept both `Friday, 01 May 2026` and `May 01 2026` date layouts.
- Deduplicate overlapping mobile screenshots using date, amount, account, description, and the HSBC screenshot source key.

## PDF Statement Rules

- Detect the HSBC UK statement layout from `HSBC UK Bank plc`, `Your Statement`, and `Your Bank Account details` together.
- Accept OCR-spaced labels such as `Pay m e nt`, `Ope ning Balance`, and `Clos ing Balance`; transaction extraction must rely on the dated ledger rows rather than exact header spelling.
- Carry the last visible `DD Mon YY` date across following transaction-code rows because HSBC omits repeated dates for same-day transactions.
- Start a new transaction at each HSBC code such as `VIS`, `VMS`, `BP`, `CR`, `DR`, `TFR`, `FPI`, `SO`, or `DD`; retain following merchant/location lines until the next code or balance anchor.
- Treat `BALANCE BROUGHT FORWARD` and `BALANCE CARRIED FORWARD` as reconciliation anchors, not transactions.
- The last two monetary values in a transaction block are the account impact and running balance. Use the running-balance movement to determine money in versus money out when PDF column spacing is lost.
- Preserve HSBC transaction codes such as `VIS` and the original grouped source lines in `rawPayload`.
- Remove routing/reference prefixes such as `INT'L <digits>` from the normalized merchant while retaining them in the audit payload.
- Treat `VIS`, `VMS`, and contactless markers such as `)))` as card purchases. They may use a known expense category or `Other`, but must not become transfers merely because a truncated merchant descriptor resembles a person's name.
- Normalize fixed-width UK descriptors through `web/lib/uk-merchant-corpus.ts`. Payment-facilitator prefixes such as `Zettle`, `Square`, and `SumUp` should resolve to the underlying merchant only when the combined merchant and location evidence is specific.
- Reapply the UK merchant corpus after enrichment and in optimistic previews. A card code such as `VIS`, `VMS`, or `)))` must never inherit `Transfers` from a later generic categorization pass.
- Keep `BP`, `TFR`, and `FPI` in the `Transfers` category, but preserve their ledger direction as income or expense. Promote them to the transfer type only when Clover finds the matching opposite movement in another account owned by the same workspace.
- Reconcile parsed rows from opening balance through the final running or carried-forward balance before treating the deterministic parse as high confidence.

## Review Rules

- Product overview snapshots remain reviewable because they are balance evidence, not ledger activity.
- Do not infer balances for collapsed Global Money currency sections.
- Never treat the displayed interest rate or savings-goal copy as a transaction.
