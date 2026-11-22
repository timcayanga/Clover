"use client";
import { previewReceiptFile } from "@/lib/preview-receipt-client";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { supportsReceiptCapture } from "@/lib/receipt-capture-platform";
import { AddEntryMethods } from "./add-entry-methods";
import { requestAiConsent } from "./ai-consent";
import { mergeSplitBillItemSplitMetadata } from "@/lib/split-bill";
import { SplitItemGrid } from "./split-item-grid";
import { readSelectedWorkspaceId } from "@/lib/workspace-selection";
import { containDialogFocus } from "@/lib/dialog-focus";
import type { SplitItem } from "../../shared/split-bill-experience";
import type {
  SplitBillSerializedBill,
  ReceiptPreviewResult,
} from "@/lib/split-bill";
import type {
  SplitBillGroupSummary,
  SplitBillPersonSummary,
} from "@/lib/split-bill-entities";
export type BillEntryContext = {
  circleId?: string;
  group?: Pick<SplitBillGroupSummary, "id" | "name" | "members">;
  person?: string;
  currency?: string;
};
export function SplitBillEntry({
  currentUserName,
  groups = [],
  people = [],
  context = {},
  onClose,
  onSaved,
}: {
  currentUserName: string;
  groups?: SplitBillGroupSummary[];
  people?: SplitBillPersonSummary[];
  context?: BillEntryContext;
  onClose: () => void;
  onSaved: (bill: SplitBillSerializedBill) => void;
}) {
  const [mode, setMode] = useState<"upload" | "manual">(() => supportsReceiptCapture() ? "upload" : "manual"),
    [title, setTitle] = useState(""),
    [amount, setAmount] = useState(""),
    [currency, setCurrency] = useState(context.currency || "PHP"),
    [names, setNames] = useState(
      context.person ||
        context.group?.members
          .map((m) => m.name)
          .filter((n) => n !== currentUserName)
          .join(", ") ||
        "",
    ),
    [groupId, setGroupId] = useState(context.group?.id || ""),
    [date, setDate] = useState(() => {
      const d = new Date();
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    }),
    [notes, setNotes] = useState(""),
    [accountId, setAccountId] = useState(""),
    [categoryId, setCategoryId] = useState(""),
    [items, setItems] = useState<SplitItem[]>([]),
    [receipt, setReceipt] = useState<Record<string, unknown> | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [accounts, setAccounts] = useState<
      { id: string; name: string; currency: string; type: string }[]
    >([]),
    [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const scopedSave = useRef(false);
  const [background, setBackground] = useState(false);
  const [progress, setProgress] = useState(0);
  const dialog = useRef<HTMLElement>(null);
  useEffect(() => {
    if (dialog.current) return containDialogFocus(dialog.current);
  }, [background]);
  const key = useRef(crypto.randomUUID()),
    lock = useRef(false),
    alive = useRef(true);
  const [workspaceId, setWorkspaceId] = useState(readSelectedWorkspaceId);
  const [profiles, setProfiles] = useState<{ id: string; name: string }[]>([]);
  useEffect(() => {
    if (workspaceId) return;
    let active = true;
    void fetch("/api/workspaces")
      .then((r) =>
        r.ok ? r.json() : Promise.reject(Error("Unable to load Profiles.")),
      )
      .then((p) => {
        if (active) {
          setProfiles(p.workspaces ?? []);
          if (p.workspaces?.length === 1) setWorkspaceId(p.workspaces[0].id);
        }
      })
      .catch(() => {
        if (active) setError("Choose your Profile before saving this bill.");
      });
    return () => {
      active = false;
    };
  }, [workspaceId]);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => {
    const close = (e: KeyboardEvent) => {
      if (!background && e.key === "Escape" && !lock.current) {
        e.preventDefault();
        e.stopImmediatePropagation();
        onClose();
      }
    };
    document.addEventListener("keydown", close, true);
    return () => document.removeEventListener("keydown", close, true);
  }, [onClose, background]);
  const loadDetails = () => {
    if (!workspaceId || accounts.length) return;
    void Promise.all([
      fetch(
        `/api/accounts?workspaceId=${encodeURIComponent(workspaceId)}`,
      ).then((r) => (r.ok ? r.json() : { accounts: [], categories: [] })),
      fetch(
        `/api/categories?workspaceId=${encodeURIComponent(workspaceId)}`,
      ).then((r) => (r.ok ? r.json() : { accounts: [], categories: [] })),
    ])
      .then(([a, c]) => {
        if (alive.current) {
          setAccounts(a.accounts ?? []);
          setCategories(c.categories ?? []);
        }
      })
      .catch(() =>
        setError(
          "Account choices could not load. You can still save with the default Cash account.",
        ),
      );
  };
  const upload = async (files: File[]) => {
    const file = files[0];
    if (!file || lock.current) return;
    if (file.size > 25 * 1024 * 1024) {
      setError("Use a file up to 25 MB.");
      return;
    }
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      if (!(await requestAiConsent()))
        throw Error("You can add this bill manually without AI processing.");
      setProgress(0);
      setBackground(true);
      const r = await previewReceiptFile(file, undefined, setProgress);
      const p = await r.json();
      if (!r.ok) throw Error(p.error || "Unable to read receipt.");
      if (!alive.current) return;
      const v = p.preview as ReceiptPreviewResult;
      setTitle(v.merchantName || "Receipt");
      setAmount(String(v.total ?? ""));
      if (v.currency && /^[A-Z]{3}$/.test(v.currency)) setCurrency(v.currency);
      setDate(v.billDate?.slice(0, 10) || "");
      setReceipt({
        sourceType: "receipt",
        receiptStorageKey: p.receiptStorageKey,
        receiptFileName: file.name,
        receiptMimeType: file.type,
        receiptText: v.receiptText,
        receiptConfidence: v.confidence,
      });
      setItems(
        (v.items ?? []).map((i, index) => ({
          id: `receipt-${index}`,
          description: i.description,
          amount: String(i.amount),
          participantIds: [],
        })),
      );
      scopedSave.current = Boolean((context.group || context.person) && p.reliableForScopedSplit && !v.currencyWarning);
      setMode("manual");
    } catch (e) {
      if (alive.current)
        setError(e instanceof Error ? e.message : "Unable to read receipt.");
    } finally {
      lock.current = false;
      if (alive.current) setBusy(false);
    }
  };
  const save = async () => {
    if (lock.current) return;
    if (!workspaceId) {
      setError("Choose a Profile in More Details before saving.");
      return;
    }
    const all = Array.from(
      new Set([
        currentUserName,
        ...names
          .split(/[,\n]/)
          .map((n) => n.trim())
          .filter(Boolean),
      ]),
    );
    if (
      !title.trim() ||
      !/^\d+(\.\d{1,2})?$/.test(amount) ||
      Number(amount) <= 0 ||
      all.length < (context.circleId ? 1 : 2) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      !Number.isFinite(Date.parse(date)) ||
      !/^[A-Z]{3}$/.test(currency)
    ) {
      setError(
        "Add a name, positive amount, date, currency and at least one other person.",
      );
      return;
    }
    if (
      items.length &&
      Math.abs(
        items.reduce((s, i) => s + Number(i.amount), 0) - Number(amount),
      ) > 0.005
    ) {
      setError("Review line items so they match the total.");
      return;
    }
    const participants = all.map((name, index) => ({
      id: crypto.randomUUID(),
      name,
    }));
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const billItems = (
        items.length
          ? items
          : [{ id: "total", description: title, amount, participantIds: [] }]
      ).map((i) => ({
        id: crypto.randomUUID(),
        description: i.description,
        amount: i.amount,
        participantIds: i.participantIds?.length
          ? i.participantIds
              .map((name) => participants.find((p) => p.name === name)?.id)
              .filter((id): id is string => Boolean(id))
          : participants.map((p) => p.id),
        splitMethod: i.splitMethod || "equal",
        allocations: (i.allocations ?? []).map((a) => ({
          participantId:
            participants.find((p) => p.name === a.participantId)?.id || "",
          value: a.value,
        })),
      }));
      const body = {
        rawPayload: mergeSplitBillItemSplitMetadata(null, billItems),
        title: title.trim(),
        total: amount,
        currency,
        billDate: date,
        note: notes || null,
        groupId: groupId || null,
        ...(context.circleId ? {circleId:context.circleId} : {}),
        ...receipt,
        participants,
        items: billItems,
        payments: [{ participantId: participants[0].id, amount }],
        expense: {
          workspaceId,
          accountId: accountId || null,
          categoryId: categoryId || null,
          attemptId: key.current,
        },
      };
      const r = await fetch("/api/split-bills", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const p = await r.json();
      if (!r.ok) throw Error(p.error || "Unable to save bill.");
      if (alive.current) {
        window.dispatchEvent(new Event("clover:transactions-changed"));
        onSaved(p.bill);
        onClose();
      }
    } catch (e) {
      if (alive.current)
        setError(e instanceof Error ? e.message : "Unable to save bill.");
    } finally {
      lock.current = false;
      if (alive.current) setBusy(false);
    }
  };
  useEffect(() => {
    if (scopedSave.current && receipt && !busy) {
      scopedSave.current = false;
      void save();
    }
  }, [receipt, busy]);
  if (background) return createPortal(<button type="button" className="receipt-draft-progress" onClick={() => setBackground(false)}>
    <span role="status">{busy ? (progress === 1 ? "Preparing receipt draft…" : "Uploading receipt…") : error ? "Review upload issue" : "Review receipt draft ›"}</span>
    {busy && <progress max={1} value={progress || undefined} />}
  </button>, document.body);
  return createPortal(
    <div
      className="split-bill-modal direct-bill-backdrop"
      onClick={() => {
        if (!busy) onClose();
      }}
    >
      <section
        ref={dialog}
        className="split-bill-modal__card glass direct-bill-entry"
        role="dialog"
        aria-modal="true"
        aria-label="Add Bill"
        onClick={(e) => e.stopPropagation()}
      >
        <header>
          <h3>Add Bill</h3>
          <button
            type="button"
            className="icon-button"
            aria-label="Close Add Bill"
            disabled={busy}
            onClick={onClose}
          >
            ×
          </button>
        </header>
        {error ? <p role="alert">{error}</p> : null}
        {busy ? (
          <p role="status">
            {mode === "upload" ? "Preparing draft…" : "Saving…"}
          </p>
        ) : null}
          <AddEntryMethods
            key={mode}
            initialMethod={mode}
            kind="split"
            workspaceId={workspaceId || undefined}
            disabled={busy}
            onUploadFiles={(files) => void upload(files)}
            formContext={{
              kind: "split",
              fields: { title, amount, currency, date, people: names },
            }}
            onReviewForm={({ fields: f }) => {
              if (f.title !== undefined) setTitle(f.title);
              if (f.amount !== undefined) setAmount(f.amount);
              if (f.currency !== undefined) setCurrency(f.currency);
              if (f.people !== undefined) setNames(f.people);
            }}
          >
            <label className="settings-field">
              Amount
              <div className="direct-bill-amount">
                <input
                  className="settings-input"
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
                <input
                  aria-label="Currency"
                  className="settings-input"
                  value={currency}
                  maxLength={3}
                  onChange={(e) => {
                    setCurrency(e.target.value.toUpperCase());
                    setAccountId("");
                  }}
                />
              </div>
            </label>
            <label className="settings-field">
              Name
              <input
                className="settings-input"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </label>
            <label className="settings-field">
              Group
              <select
                className="settings-input"
                value={groupId}
                onChange={(e) => {
                  setGroupId(e.target.value);
                  const g = groups.find((g) => g.id === e.target.value);
                  if (g)
                    setNames(
                      g.members
                        .map((m) => m.name)
                        .filter((n) => n !== currentUserName)
                        .join(", "),
                    );
                }}
              >
                <option value="">No group</option>
                {[
                  ...(context.group &&
                  !groups.some((g) => g.id === context.group!.id)
                    ? [context.group]
                    : []),
                  ...groups,
                ].map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="settings-field">
              People
              <input
                className="settings-input"
                value={names}
                list="split-entry-people"
                placeholder="Names separated by commas"
                onChange={(e) => setNames(e.target.value)}
              />
              <datalist id="split-entry-people">
                {people.map((p) => (
                  <option key={p.id} value={p.name} />
                ))}
              </datalist>
            </label>
            <details
              open={Boolean(receipt)}
              onToggle={(e) => {
                if (e.currentTarget.open) loadDetails();
              }}
            >
              <summary>More Details</summary>
              {profiles.length > 1 ? (
                <label className="settings-field">
                  Profile
                  <select
                    className="settings-input"
                    value={workspaceId ?? ""}
                    onChange={(e) => {
                      setWorkspaceId(e.target.value);
                      setAccountId("");
                      setCategoryId("");
                      setAccounts([]);
                      setCategories([]);
                    }}
                  >
                    <option value="">Choose Profile</option>
                    {profiles.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              <label className="settings-field">
                Account
                <select
                  className="settings-input"
                  value={accountId}
                  onChange={(e) => setAccountId(e.target.value)}
                >
                  <option value="">Cash · {currency}</option>
                  {accounts
                    .filter(
                      (a) => a.currency === currency && a.type !== "investment",
                    )
                    .map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                </select>
              </label>
              <label className="settings-field">
                Category
                <select
                  className="settings-input"
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                >
                  <option value="">Other</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="settings-field">
                Date
                <input
                  type="date"
                  className="settings-input"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </label>
              <label className="settings-field">
                Notes
                <textarea
                  className="settings-input"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </label>
              <SplitItemGrid
                people={Array.from(
                  new Set([
                    currentUserName,
                    ...names
                      .split(/[,\n]/)
                      .map((n) => n.trim())
                      .filter(Boolean),
                  ]),
                ).map((name) => ({ id: name, name }))}
                items={items}
                currency={currency}
                onChange={setItems}
              />
            </details>
            <p className="muted">
              You paid · split equally. Saved here and in Transactions.
            </p>
            <button
              className="button button-primary"
              disabled={busy}
              onClick={() => void save()}
            >
              Save Bill
            </button>
          </AddEntryMethods>
      </section>
    </div>,
    document.body,
  );
}
