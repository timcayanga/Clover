"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { formatCurrencyAmount } from "@/lib/currency-format";

type DashboardTopActionsProps = {
  workspaceId: string;
  accounts: Array<{
    id: string;
    name: string;
    institution: string | null;
    type: string;
    currency: string;
  }>;
};

type ManualFormState = {
  accountId: string;
  amount: string;
  currency: string;
  date: string;
  merchantRaw: string;
  type: "expense" | "income";
};

const formatToday = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

function DashboardManualTransactionModal({
  workspaceId,
  accounts,
  onClose,
}: DashboardTopActionsProps & { onClose: () => void }) {
  const router = useRouter();
  const defaultAccountId = accounts[0]?.id ?? "";
  const [form, setForm] = useState<ManualFormState>(() => ({
    accountId: defaultAccountId,
    amount: "",
    currency: accounts[0]?.currency ?? "PHP",
    date: formatToday(),
    merchantRaw: "",
    type: "expense",
  }));
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    document.body.classList.add("transactions-manual-open");
    return () => {
      document.body.classList.remove("transactions-manual-open");
    };
  }, []);

  useEffect(() => {
    if (!form.accountId && defaultAccountId) {
      setForm((current) => ({
        ...current,
        accountId: defaultAccountId,
        currency: accounts.find((account) => account.id === defaultAccountId)?.currency ?? current.currency,
      }));
    }
  }, [accounts, defaultAccountId, form.accountId]);

  useEffect(() => {
    const selectedAccount = accounts.find((account) => account.id === form.accountId);
    if (!selectedAccount) {
      return;
    }

    setForm((current) =>
      current.currency === selectedAccount.currency
        ? current
        : {
            ...current,
            currency: selectedAccount.currency,
          }
    );
  }, [accounts, form.accountId]);

  const selectedAccount = useMemo(
    () => accounts.find((account) => account.id === form.accountId) ?? accounts[0] ?? null,
    [accounts, form.accountId]
  );

  const currencyLabel = selectedAccount?.currency ?? form.currency;
  const amountLabel = form.amount ? formatCurrencyAmount(Number(form.amount || 0), currencyLabel) : formatCurrencyAmount(0, currencyLabel);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSaving(true);
    setError(null);

    try {
      const response = await fetch("/api/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId,
          accountId: form.accountId,
          categoryId: null,
          date: form.date,
          amount: form.amount,
          currency: currencyLabel,
          type: form.type,
          merchantRaw: form.merchantRaw,
          merchantClean: null,
          description: null,
          isTransfer: false,
          isExcluded: false,
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error ?? "Unable to create transaction.");
      }

      onClose();
      router.refresh();
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : "Unable to create transaction.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="modal-backdrop dashboard-manual-modal__backdrop" role="presentation" onClick={onClose}>
      <section
        className="modal-card modal-card--manual dashboard-manual-modal glass"
        role="dialog"
        aria-modal="true"
        aria-labelledby="dashboard-manual-modal-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-head dashboard-manual-modal__head">
          <div>
            <p className="eyebrow">Add transaction</p>
            <h4 id="dashboard-manual-modal-title">Log a transaction</h4>
          </div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Close add transaction">
            ×
          </button>
        </div>

        <p className="dashboard-manual-modal__copy">
          Add it here and Clover will keep you on the Dashboard.
        </p>

        <form className="dashboard-manual-modal__form" onSubmit={handleSubmit}>
          <label className="dashboard-manual-modal__field">
            <span>Name</span>
            <input
              value={form.merchantRaw}
              onChange={(event) => setForm((current) => ({ ...current, merchantRaw: event.target.value }))}
              placeholder="Salary, groceries, rent..."
              required
            />
          </label>

          <div className="dashboard-manual-modal__row">
            <label className="dashboard-manual-modal__field">
              <span>Date</span>
              <input
                type="date"
                value={form.date}
                onChange={(event) => setForm((current) => ({ ...current, date: event.target.value }))}
                required
              />
            </label>

            <label className="dashboard-manual-modal__field">
              <span>Type</span>
              <select
                value={form.type}
                onChange={(event) => setForm((current) => ({ ...current, type: event.target.value as ManualFormState["type"] }))}
              >
                <option value="expense">Expense</option>
                <option value="income">Income</option>
              </select>
            </label>
          </div>

          <div className="dashboard-manual-modal__row">
            <label className="dashboard-manual-modal__field">
              <span>Account</span>
              <select
                value={form.accountId}
                onChange={(event) => setForm((current) => ({ ...current, accountId: event.target.value }))}
                required
              >
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="dashboard-manual-modal__field">
              <span>Amount</span>
              <input
                inputMode="decimal"
                value={form.amount}
                onChange={(event) => setForm((current) => ({ ...current, amount: event.target.value }))}
                placeholder="0.00"
                required
              />
            </label>
          </div>

          <label className="dashboard-manual-modal__field">
            <span>Preview</span>
            <div className="dashboard-manual-modal__preview">{amountLabel || "₱0.00"}</div>
          </label>

          {error ? <p className="dashboard-manual-modal__error">{error}</p> : null}

          <div className="dashboard-manual-modal__actions">
            <button className="button button-secondary button-small" type="button" onClick={onClose}>
              Cancel
            </button>
            <button className="button button-primary button-small" type="submit" disabled={isSaving || !accounts.length}>
              {isSaving ? "Saving..." : "Add transaction"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

export function DashboardTopActions({ workspaceId, accounts }: DashboardTopActionsProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  const manualOpen = searchParams?.get("manual") === "1";

  useEffect(() => {
    if (!menuOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (!menuRef.current || menuRef.current.contains(event.target as Node)) {
        return;
      }
      setMenuOpen(false);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [menuOpen]);

  useEffect(() => {
    const handleOpenManual = () => {
      router.replace("/dashboard?manual=1");
    };

    window.addEventListener("clover:open-transaction-add", handleOpenManual);
    return () => {
      window.removeEventListener("clover:open-transaction-add", handleOpenManual);
    };
  }, [router]);

  const openManualAdd = () => {
    setMenuOpen(false);
    router.replace("/dashboard?manual=1");
  };

  const openImportFiles = () => {
    setMenuOpen(false);
    router.replace("/dashboard?import=1");
  };

  return (
    <>
      <div className="dashboard-top-actions" ref={menuRef}>
        <button
          className="button button-primary button-small dashboard-top-actions__toggle"
          type="button"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((current) => !current)}
        >
          <span className="dashboard-top-actions__toggle-icon" aria-hidden="true">
            +
          </span>
          <span>Add transaction</span>
          <span className="dashboard-top-actions__toggle-chevron" aria-hidden="true">
            ▾
          </span>
        </button>
        <div className="dashboard-top-actions__menu" hidden={!menuOpen}>
          <button className="dashboard-top-actions__menu-item" type="button" onClick={openManualAdd}>
            Add transaction
          </button>
          <button className="dashboard-top-actions__menu-item" type="button" onClick={openImportFiles}>
            Import files
          </button>
        </div>
      </div>

      {manualOpen ? <DashboardManualTransactionModal workspaceId={workspaceId} accounts={accounts} onClose={() => router.replace("/dashboard")} /> : null}
    </>
  );
}
