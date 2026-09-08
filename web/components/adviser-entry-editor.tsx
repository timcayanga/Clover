"use client";
import { useEffect, useRef, useState } from "react";
import {
  entryAccount,
  entryTransaction,
  entryLine,
  entryIssues,
  lineTotal,
  type EntryDraft,
  type EntryLine,
} from "@/lib/adviser-entry-types";
import { publishWorkspaceDataChange } from "@/lib/workspace-data-sync";
type Options = {
  accounts: { id: string; name: string; currency: string }[];
  categories: { id: string; name: string; type: string }[];
  transactions: {
    id: string;
    name: string;
    amount: string;
    currency: string;
    updatedAt: string;
    receiptItems?: { description: string; amount?: string | null }[];
  }[];
};
export function AdviserEntryEditor({
  draft,
  onChange,
  onSaved,
  onDiscard,
  onLockChange,
}: {
  draft: EntryDraft;
  onChange: (draft: EntryDraft) => void;
  onSaved: () => void;
  onDiscard: () => void;
  onLockChange: (locked: boolean) => void;
}) {
  const [options, setOptions] = useState<Options>({
    accounts: [],
    categories: [],
    transactions: [],
  });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);
  const alive = useRef(true);
  const [uncertain, setUncertain] = useState(false);
  useEffect(() => {
    onLockChange(busy || uncertain);
  }, [busy, uncertain, onLockChange]);
  useEffect(() => {
    alive.current = true;
    const controller = new AbortController();
    fetch(
      `/api/adviser/entries?workspaceId=${encodeURIComponent(draft.workspaceId)}&transactionIds=${encodeURIComponent(draft.receipts.map((row) => row.transactionId).join(","))}`,
      { signal: controller.signal, cache: "no-store" },
    )
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw Error(data.error);
        if (alive.current) setOptions(data);
      })
      .catch((e) => {
        if (alive.current && e.name !== "AbortError")
          setError("Unable to load accounts. Try reopening this draft.");
      });
    return () => {
      alive.current = false;
      controller.abort();
    };
  }, [draft.workspaceId]);
  const change = (next: EntryDraft) => {
    if (!busy && !uncertain) onChange(next);
  };
  const field = (
    label: string,
    value: string,
    update: (value: string) => void,
    type = "text",
  ) => (
    <label>
      {label}
      <input
        aria-label={label}
        type={type}
        value={value}
        onChange={(e) => update(e.target.value)}
      />
    </label>
  );
  const select = (
    label: string,
    value: string,
    values: { id: string; name: string }[],
    update: (value: string) => void,
  ) => (
    <label>
      {label}
      <select
        aria-label={label}
        value={value}
        onChange={(e) => update(e.target.value)}
      >
        <option value="">Choose</option>
        {values.map((option) => (
          <option key={option.id} value={option.id}>
            {option.name}
          </option>
        ))}
      </select>
    </label>
  );
  const lines = (items: EntryLine[], update: (items: EntryLine[]) => void) => (
    <div>
      {items.map((line, index) => (
        <div className="adviser-entry-grid" key={index}>
          {field(`Item ${index + 1}`, line.description, (value) =>
            update(
              items.map((item, i) =>
                i === index ? { ...item, description: value } : item,
              ),
            ),
          )}
          {field("Quantity", line.quantity, (value) =>
            update(
              items.map((item, i) =>
                i === index ? { ...item, quantity: value } : item,
              ),
            ),
          )}
          {field("Unit price", line.unitPrice, (value) =>
            update(
              items.map((item, i) =>
                i === index ? { ...item, unitPrice: value } : item,
              ),
            ),
          )}
          {select(
            "Line type",
            line.kind,
            ["item", "tax", "discount"].map((id) => ({ id, name: id })),
            (value) =>
              update(
                items.map((item, i) =>
                  i === index
                    ? { ...item, kind: value as EntryLine["kind"] }
                    : item,
                ),
              ),
          )}
          <button
            type="button"
            onClick={() => update(items.filter((_, i) => i !== index))}
          >
            Remove item
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => update([...items, entryLine()])}
        disabled={items.length >= 100}
      >
        Add receipt item
      </button>
      {items.length ? (
        <p>
          Item total:{" "}
          {lineTotal(items) === null
            ? "Incomplete"
            : (Number(lineTotal(items)) / 100).toFixed(2)}
        </p>
      ) : null}
    </div>
  );
  const refreshReceipts = async () => {
    if (busy || uncertain) return;
    setBusy(true);
    try {
      const response = await fetch(
        `/api/adviser/entries?workspaceId=${encodeURIComponent(draft.workspaceId)}&transactionIds=${encodeURIComponent(draft.receipts.map((row) => row.transactionId).join(","))}`,
        { cache: "no-store" },
      );
      if (!response.ok) throw Error("Unable to refresh receipt details.");
      const data: Options = await response.json();
      if (alive.current) {
        setOptions(data);
        onChange({
          ...draft,
          receipts: draft.receipts.map((row) => ({
            ...row,
            expectedUpdatedAt:
              data.transactions.find((item) => item.id === row.transactionId)
                ?.updatedAt || "",
          })),
        });
        setError("");
      }
    } catch (e) {
      if (alive.current)
        setError(e instanceof Error ? e.message : "Unable to refresh");
    } finally {
      if (alive.current) setBusy(false);
    }
  };
  const save = async () => {
    if (saving.current) return;
    saving.current = true;
    setBusy(true);
    setError("");
    let rejected = false;
    try {
      const response = await fetch(
        `/api/adviser/entries?workspaceId=${encodeURIComponent(draft.workspaceId)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(draft),
        },
      );
      const payload = await response.json();
      if (!response.ok) {
        rejected = response.status >= 400 && response.status < 500;
        if (alive.current) setUncertain(!rejected);
        throw Error(payload.error || "Unable to save");
      }
      publishWorkspaceDataChange({
        workspaceId: draft.workspaceId,
        affected: [
          "accounts",
          "transactions",
          "investments",
          "home",
          "reports",
          "adviser",
        ],
        source: "adviser",
        path: "/adviser",
        revision: Date.now(),
      });
      if (alive.current) onSaved();
    } catch (e) {
      if (alive.current) {
        setError(e instanceof Error ? e.message : "Unable to save");
        setUncertain(!rejected);
      }
    } finally {
      saving.current = false;
      if (alive.current) setBusy(false);
    }
  };
  return (
    <section
      className="adviser-entry-editor"
      aria-label="Review Adviser entries"
    >
      <h3>Review your entries</h3>
      <p>
        Suggested draft. Check every row before confirming. Nothing is saved
        yet.
      </p>
      <fieldset disabled={busy || uncertain}>
        {draft.accounts.map((account, index) => (
          <div className="adviser-entry-row" key={account.key}>
            <h4>Account {index + 1}</h4>
            <div className="adviser-entry-grid">
              {(["name", "institution", "currency", "balance"] as const).map(
                (key) => (
                  <span key={key}>
                    {field(key, account[key], (value) =>
                      change({
                        ...draft,
                        accounts: draft.accounts.map((row, i) =>
                          i === index ? { ...row, [key]: value } : row,
                        ),
                      }),
                    )}
                  </span>
                ),
              )}
              {select(
                "Account type",
                account.type,
                [
                  "bank",
                  "wallet",
                  "credit_card",
                  "cash",
                  "loan",
                  "other",
                  "investment",
                ].map((id) => ({ id, name: id })),
                (value) =>
                  change({
                    ...draft,
                    accounts: draft.accounts.map((row, i) =>
                      i === index
                        ? { ...row, type: value as typeof account.type }
                        : row,
                    ),
                  }),
              )}
              {account.type === "investment"
                ? (
                    [
                      "investmentSubtype",
                      "investmentSymbol",
                      "investmentQuantity",
                      "investmentCostBasis",
                    ] as const
                  ).map((key) => (
                    <span key={key}>
                      {field(key, account[key], (value) =>
                        change({
                          ...draft,
                          accounts: draft.accounts.map((row, i) =>
                            i === index ? { ...row, [key]: value } : row,
                          ),
                        }),
                      )}
                    </span>
                  ))
                : null}
            </div>
            <button
              type="button"
              onClick={() =>
                change({
                  ...draft,
                  accounts: draft.accounts.filter((_, i) => i !== index),
                })
              }
            >
              Remove account
            </button>
          </div>
        ))}
        {draft.transactions.map((row, index) => {
          const update = (patch: Partial<typeof row>) =>
            change({
              ...draft,
              transactions: draft.transactions.map((item, i) =>
                i === index ? { ...item, ...patch } : item,
              ),
            });
          return (
            <div className="adviser-entry-row" key={row.key}>
              <h4>Transaction {index + 1}</h4>
              <div className="adviser-entry-grid">
                {field("Merchant", row.merchant, (merchant) =>
                  update({ merchant }),
                )}
                {field("Amount", row.amount, (amount) => update({ amount }))}
                {field("Date", row.date, (date) => update({ date }), "date")}
                {field("Currency", row.currency, (currency) =>
                  update({ currency }),
                )}
                {select(
                  "Account",
                  row.accountId,
                  [
                    ...options.accounts,
                    ...draft.accounts.map((account) => ({
                      id: `new:${account.key}`,
                      name: `New: ${account.name}`,
                    })),
                  ],
                  (accountId) => update({ accountId }),
                )}
                {select(
                  "Type",
                  row.type,
                  [
                    { id: "expense", name: "Expense" },
                    { id: "income", name: "Income" },
                  ],
                  (type) =>
                    update({ type: type as typeof row.type, categoryId: "" }),
                )}
                {select(
                  "Category (optional)",
                  row.categoryId,
                  options.categories.filter(
                    (category) => category.type === row.type,
                  ),
                  (categoryId) => update({ categoryId }),
                )}
                {field("Note", row.description, (description) =>
                  update({ description }),
                )}
              </div>
              {lines(row.lines, (lines) => update({ lines }))}
              <button
                type="button"
                onClick={() =>
                  change({
                    ...draft,
                    transactions: draft.transactions.filter(
                      (_, i) => i !== index,
                    ),
                  })
                }
              >
                Remove transaction
              </button>
            </div>
          );
        })}
        {draft.receipts.map((receipt, index) => (
          <div className="adviser-entry-row" key={index}>
            <h4>Append to an existing receipt</h4>
            {select(
              "Recorded payment",
              receipt.transactionId,
              options.transactions.map((row) => ({
                id: row.id,
                name: `${row.name} — ${row.currency} ${row.amount}`,
              })),
              (transactionId) =>
                change({
                  ...draft,
                  receipts: draft.receipts.map((row, i) =>
                    i === index
                      ? {
                          ...row,
                          transactionId,
                          expectedUpdatedAt:
                            options.transactions.find(
                              (t) => t.id === transactionId,
                            )?.updatedAt || "",
                        }
                      : row,
                  ),
                }),
            )}
            {options.transactions
              .find((item) => item.id === receipt.transactionId)
              ?.receiptItems?.map((line, i) => (
                <p key={i}>
                  Existing: {line.description} —{" "}
                  {line.amount || "Amount unavailable"}
                </p>
              ))}
            <p>
              These items are attached to the payment. Its amount will stay
              unchanged.
            </p>
            {lines(receipt.lines, (lines) =>
              change({
                ...draft,
                receipts: draft.receipts.map((row, i) =>
                  i === index ? { ...row, lines } : row,
                ),
              }),
            )}
            <button
              type="button"
              onClick={() =>
                change({
                  ...draft,
                  receipts: draft.receipts.filter((_, i) => i !== index),
                })
              }
            >
              Remove receipt draft
            </button>
          </div>
        ))}
        <div className="adviser-entry-grid">
          <button
            type="button"
            disabled={draft.transactions.length >= 50}
            onClick={() =>
              change({
                ...draft,
                transactions: [
                  ...draft.transactions,
                  entryTransaction(crypto.randomUUID()),
                ],
              })
            }
          >
            Add transaction
          </button>
          <button
            type="button"
            disabled={draft.accounts.length >= 10}
            onClick={() =>
              change({
                ...draft,
                accounts: [
                  ...draft.accounts,
                  entryAccount(crypto.randomUUID()),
                ],
              })
            }
          >
            Add account or investment
          </button>
          <button
            type="button"
            disabled={draft.receipts.length >= 10}
            onClick={() =>
              change({
                ...draft,
                receipts: [
                  ...draft.receipts,
                  {
                    transactionId: "",
                    expectedUpdatedAt: "",
                    lines: [entryLine()],
                  },
                ],
              })
            }
          >
            Add items to recorded receipt
          </button>
        </div>
      </fieldset>
      {draft.receipts.length ? (
        <button
          type="button"
          disabled={busy || uncertain}
          onClick={() => void refreshReceipts()}
        >
          Refresh receipt details
        </button>
      ) : null}
      {entryIssues(draft).length ? (
        <ul>
          {entryIssues(draft).map((issue) => (
            <li key={issue}>{issue}</li>
          ))}
        </ul>
      ) : null}
      {error ? <p role="alert">{error}</p> : null}
      {uncertain ? (
        <p>
          The save result is uncertain. Retry this unchanged draft to check its
          status safely.
        </p>
      ) : null}
      <button
        type="button"
        className="button button-primary"
        disabled={busy || entryIssues(draft).length > 0}
        onClick={() => void save()}
      >
        {busy
          ? "Saving…"
          : uncertain
            ? "Retry this confirmation"
            : "Confirm and save all"}
      </button>
      <button type="button" disabled={busy || uncertain} onClick={onDiscard}>
        Discard draft
      </button>
    </section>
  );
}
