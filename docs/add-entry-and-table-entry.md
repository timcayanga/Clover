# Shared Add methods and transaction table entry

Creation forms open Manual and offer Ask Clover and Upload without unmounting the manual draft. Accounts, Recurring, Split Bills and investment holdings/trades reuse the existing manual validation and save paths. Upload enters the existing statement/receipt review workflow. A bill does not establish recurrence: users must confirm its schedule in Manual. Payment requests remain separate from Split Bill creation.

Adviser recurring/split/trade suggestions use `prepare_form`: only allowlisted string fields are returned to the manual editor. It cannot save financial records. Users explicitly choose Review in Manual, check the fields and use the destination form's Save button. Account/holding suggestions use the existing editable Adviser entry draft flow.

Transaction Manual offers Single entry or Table entry. Desktop supports TSV paste (including quoted cells), optional currency/tags/notes columns, undo/redo, selected-row duplicate/delete/fill and keyboard navigation. Mobile uses a batch list and row editor. Switching entry methods preserves both drafts for the lifetime of the open flow. Drafts are not persisted in browser local storage.

Batch saves contain up to 50 populated rows. Validation covers strict dates, positive two-decimal amounts, profile-scoped accounts/categories, category type and account currency. Transfers require two different same-currency accounts; converted transfers are not supported in this batch flow. Blank rows are ignored. Possible repeats within the batch or against existing records require review.

`POST /api/transactions/batch` and the authenticated native equivalent share one transaction. A profile owner lock, deterministic audit marker and payload hash make concurrent/retried confirmations idempotent. Transfers create linked in/out rows. A bad row rejects the whole batch; confirmed opening balances are never overwritten. An uncertain network result locks editing and retains the identical request for retry.

Validation: `npm --prefix web run qa:transaction-table`. Database suite `web/scripts/transaction-table-database-regression.ts` refuses to run outside the explicitly named throwaway PostgreSQL database. Full release validation remains `npm run qa:prepush`.
