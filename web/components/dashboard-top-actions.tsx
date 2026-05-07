"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ImportFilesModal } from "@/components/import-files-modal";
import { AccountBrandMark } from "@/components/account-brand-mark";
import { CurrencySelector } from "@/components/currency-selector";
import { getAccountBrand } from "@/lib/account-brand";
import { getAccountDisplayName } from "@/lib/account-display";
import { getCategoryIconSrc, getCategoryIconTone } from "@/lib/category-icons";
import { formatCurrencyAmount, formatCurrencyCode } from "@/lib/currency-format";

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

type DashboardCategory = {
  id: string;
  name: string;
  type: string;
};

type ManualFormState = {
  accountId: string;
  amount: string;
  currency: string;
  date: string;
  merchantRaw: string;
  categoryId: string;
  type: "debit" | "credit";
  description: string;
  receiptLineItems: Array<{
    description: string;
    amount: string;
  }>;
};

const formatToday = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const createEmptyReceiptLineItem = () => ({
  description: "",
  amount: "",
});

const normalizeName = (value: string | null | undefined) => value?.trim().toLowerCase() ?? "";

const getOtherCategoryId = (categories: DashboardCategory[]) =>
  categories.find((category) => normalizeName(category.name) === "other")?.id ?? "";

function DashboardManualTransactionModal({
  workspaceId,
  accounts,
  onClose,
}: DashboardTopActionsProps & {
  onClose: () => void;
}) {
  const router = useRouter();
  const [categories, setCategories] = useState<DashboardCategory[]>([]);
  const [form, setForm] = useState<ManualFormState>(() => ({
    accountId: accounts[0]?.id ?? "",
    amount: "",
    currency: formatCurrencyCode(accounts[0]?.currency ?? "PHP"),
    date: formatToday(),
    merchantRaw: "",
    categoryId: "",
    type: "debit",
    description: "",
    receiptLineItems: [],
  }));
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [categoryMenuOpen, setCategoryMenuOpen] = useState(false);
  const [manualMoreOpen, setManualMoreOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rootRef = useRef<HTMLElement | null>(null);
  const manualModalStyle = useMemo<CSSProperties>(
    () => ({
      width: "min(420px, calc(100vw - 24px))",
      maxHeight: "calc(100dvh - 24px)",
      overflow: "auto",
    }),
    []
  );

  useLayoutEffect(() => {
    document.body.classList.add("transactions-manual-open");
    document.body.setAttribute("data-clover-page-modal", "true");
    return () => {
      document.body.classList.remove("transactions-manual-open");
      document.body.removeAttribute("data-clover-page-modal");
    };
  }, []);

  useEffect(() => {
    if (!form.accountId && accounts[0]) {
      setForm((current) => ({
        ...current,
        accountId: accounts[0].id,
        currency: formatCurrencyCode(accounts[0].currency),
      }));
    }
  }, [accounts, form.accountId]);

  useEffect(() => {
    const selectedAccount = accounts.find((account) => account.id === form.accountId);
    if (!selectedAccount) {
      return;
    }

    const nextCurrency = formatCurrencyCode(selectedAccount.currency);
    if (form.currency !== nextCurrency) {
      setForm((current) => ({
        ...current,
        currency: nextCurrency,
      }));
    }
  }, [accounts, form.accountId, form.currency]);

  useEffect(() => {
    if (categories.length === 0) {
      return;
    }

    const fallbackCategoryId = getOtherCategoryId(categories) || categories[0]?.id || "";
    if (!form.categoryId) {
      setForm((current) => ({
        ...current,
        categoryId: fallbackCategoryId,
      }));
    }
  }, [categories, form.categoryId]);

  useEffect(() => {
    if (!rootRef.current) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setAccountMenuOpen(false);
        setCategoryMenuOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setAccountMenuOpen(false);
        setCategoryMenuOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  useEffect(() => {
    let active = true;

    const loadCategories = async () => {
      try {
        const response = await fetch(`/api/categories?workspaceId=${encodeURIComponent(workspaceId)}`);
        const payload = (await response.json().catch(() => ({}))) as { categories?: Array<{ id: string; name: string; type: string }>; error?: string };
        if (!response.ok) {
          throw new Error(payload.error ?? "Unable to load categories.");
        }

        if (!active) {
          return;
        }

        setCategories(Array.isArray(payload.categories) ? payload.categories : []);
      } catch {
        if (active) {
          setCategories([]);
        }
      }
    };

    void loadCategories();

    return () => {
      active = false;
    };
  }, [workspaceId]);

  const defaultAccountId = accounts[0]?.id ?? "";
  const selectedAccount =
    accounts.find((account) => account.id === form.accountId) ??
    accounts.find((account) => account.id === defaultAccountId) ??
    null;
  const selectedAccountBrand = getAccountBrand({
    institution: selectedAccount?.institution ?? null,
    name: selectedAccount?.name ?? null,
    type: selectedAccount?.type ?? null,
  });
  const selectedCategory =
    categories.find((category) => category.id === form.categoryId) ??
    categories.find((category) => normalizeName(category.name) === "other") ??
    categories[0] ??
    null;
  const accountCurrencyCodes = useMemo(
    () => Array.from(new Set(accounts.map((account) => formatCurrencyCode(account.currency)).filter(Boolean))),
    [accounts]
  );
  const otherCategoryId = getOtherCategoryId(categories);
  const previewLabel = formatCurrencyAmount(Number(form.amount || 0), form.currency || selectedAccount?.currency || "PHP");

  const handleClose = () => {
    setAccountMenuOpen(false);
    setCategoryMenuOpen(false);
    setManualMoreOpen(false);
    onClose();
  };

  const ensureDefaultAccount = async () => {
    const existingCashAccount = accounts.find(
      (account) => normalizeName(account.type) === "cash" || normalizeName(account.name) === "cash"
    );
    if (existingCashAccount) {
      return existingCashAccount.id;
    }

    const response = await fetch("/api/accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        workspaceId,
        name: "Cash",
        institution: "Cash",
        type: "cash",
        currency: "PHP",
        source: "manual",
      }),
    });

    if (!response.ok) {
      throw new Error("Unable to create a default account for this workspace.");
    }

    const payload = (await response.json().catch(() => ({}))) as { account?: { id?: string; currency?: string } };
    const accountId = payload.account?.id ?? "";
    if (!accountId) {
      throw new Error("Default account was not created.");
    }

    return accountId;
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const submitter = event.nativeEvent instanceof SubmitEvent ? event.nativeEvent.submitter : null;
    const submitMode = submitter instanceof HTMLElement ? submitter.getAttribute("data-submit-mode") : null;
    const keepOpenAfterSave = submitMode === "add-another";
    setIsSaving(true);
    setError(null);

    try {
      const accountId = form.accountId || (await ensureDefaultAccount());
      const account = accounts.find((entry) => entry.id === accountId) ?? null;
      const currency = formatCurrencyCode(form.currency || account?.currency || "PHP");
      const categoryId = form.categoryId || otherCategoryId || null;

      const response = await fetch("/api/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId,
          accountId,
          categoryId,
          date: form.date,
          amount: form.amount,
          currency,
          type: form.type === "credit" ? "income" : "expense",
          merchantRaw: form.merchantRaw,
          merchantClean: null,
          description: form.description.trim() || null,
          receiptLineItems: form.receiptLineItems
            .filter((entry) => entry.description.trim() || entry.amount.trim())
            .map((entry) => ({
              description: entry.description,
              amount: entry.amount,
            })),
          isTransfer: false,
          isExcluded: false,
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error ?? "Unable to create transaction.");
      }

      setError(null);
      if (keepOpenAfterSave) {
        setManualMoreOpen(false);
        setForm((current) => ({
          ...current,
          amount: "",
          merchantRaw: "",
          description: "",
          receiptLineItems: [],
        }));
        setCategoryMenuOpen(false);
        setAccountMenuOpen(false);
        return;
      }

      handleClose();
      router.refresh();
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : "Unable to create transaction.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="modal-backdrop modal-backdrop--centered-mobile" role="presentation" onClick={handleClose}>
      <section
        className="modal-card modal-card--manual glass"
        style={manualModalStyle}
        ref={rootRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="dashboard-manual-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-head">
          <div>
            <p className="eyebrow">Transactions</p>
            <h4 id="dashboard-manual-title">Add transaction</h4>
          </div>
          <button className="icon-button" type="button" onClick={handleClose} aria-label="Close add transaction">
            ×
          </button>
        </div>

        <p className="modal-copy">Add it here and Clover will keep you on the Dashboard.</p>

        <form onSubmit={handleSubmit}>
          <div className="manual-form-layout manual-form-layout--compact">
            <div className="transactions-manual-type-toggle" role="group" aria-label="Transaction type">
              <button
                type="button"
                className={`transactions-manual-type-toggle__button ${form.type === "debit" ? "is-active" : ""}`}
                onClick={() => setForm((current) => ({ ...current, type: "debit" }))}
                aria-pressed={form.type === "debit"}
              >
                <span className="transactions-manual-type-symbol" aria-hidden="true">
                  −
                </span>
                <span>Debit</span>
              </button>
              <button
                type="button"
                className={`transactions-manual-type-toggle__button ${form.type === "credit" ? "is-active" : ""}`}
                onClick={() => setForm((current) => ({ ...current, type: "credit" }))}
                aria-pressed={form.type === "credit"}
              >
                <span className="transactions-manual-type-symbol" aria-hidden="true">
                  +
                </span>
                <span>Credit</span>
              </button>
            </div>

            <div className="transactions-manual-row transactions-manual-row--name">
              <span className="transactions-manual-row-icon transactions-manual-row-icon--category" aria-hidden="true">
                <span className="transaction-category-icon transaction-category-icon--manual" style={getCategoryIconTone(selectedCategory?.name ?? "Other")}>
                  <img src={getCategoryIconSrc(selectedCategory?.name ?? "Other")} alt="" aria-hidden="true" />
                </span>
              </span>
              <label className="transactions-manual-field transactions-manual-field--embedded-label transactions-manual-name-field">
                <span className="transactions-manual-field__label">Name</span>
                <input
                  value={form.merchantRaw}
                  onChange={(event) => setForm((current) => ({ ...current, merchantRaw: event.target.value }))}
                  placeholder="Salary, groceries, rent..."
                  required
                />
              </label>
            </div>

            <div className="transactions-manual-row transactions-manual-row--money">
              <span className="transactions-manual-row-icon transactions-manual-row-icon--account" aria-hidden="true">
                <AccountBrandMark accountBrand={selectedAccountBrand} label={selectedAccount ? getAccountDisplayName(selectedAccount) : "Cash"} />
              </span>
              <label className="transactions-manual-field transactions-manual-field--embedded-label transactions-manual-money-row__currency">
                <span className="transactions-manual-field__label">Currency</span>
                <CurrencySelector
                  value={form.currency}
                  onChange={(value) => setForm((current) => ({ ...current, currency: value }))}
                  options={accountCurrencyCodes}
                  ariaLabel="Select transaction currency"
                  className="transactions-manual-currency"
                  buttonClassName="transactions-manual-currency__button"
                  menuClassName="transactions-manual-currency__menu"
                  optionClassName="transactions-manual-currency__option"
                  menuAlignment="end"
                  portalMenu
                />
              </label>
              <label className="transactions-manual-field transactions-manual-field--embedded-label transactions-manual-money-row__amount">
                <span className="transactions-manual-field__label">Amount</span>
                <input
                  type="number"
                  step="0.01"
                  value={form.amount}
                  onChange={(event) => setForm((current) => ({ ...current, amount: event.target.value }))}
                  placeholder="0.00"
                  required
                />
              </label>
            </div>

            <div className="transactions-manual-field transactions-manual-field--embedded-label">
              <span className="transactions-manual-field__label">Account</span>
              <div className="transactions-manual-picker">
                <div className="transactions-manual-picker__control">
                  <button
                    type="button"
                    className="transactions-manual-picker__button transactions-manual-picker__button--plain"
                    aria-expanded={accountMenuOpen}
                    onClick={() => {
                      setCategoryMenuOpen(false);
                      setAccountMenuOpen((current) => !current);
                    }}
                  >
                    <span className="transactions-manual-picker__text">{selectedAccount ? getAccountDisplayName(selectedAccount) : "Cash"}</span>
                    <span className="transactions-manual-picker__chevron" aria-hidden="true">
                      ▾
                    </span>
                  </button>
                  {accountMenuOpen ? (
                    <div className="transactions-manual-picker__menu" role="listbox" aria-label="Choose account">
                      {accounts.map((account) => (
                        <button
                          key={account.id}
                          type="button"
                          className={`transactions-manual-picker__option ${account.id === form.accountId ? "is-selected" : ""}`}
                          onClick={() => {
                            setForm((current) => ({ ...current, accountId: account.id, currency: formatCurrencyCode(account.currency) }));
                            setAccountMenuOpen(false);
                          }}
                        >
                          <span className="transactions-manual-picker__brand" aria-hidden="true">
                            <AccountBrandMark accountBrand={getAccountBrand(account)} label={getAccountDisplayName(account)} />
                          </span>
                          <span className="transactions-manual-picker__option-text">
                            <strong>{getAccountDisplayName(account)}</strong>
                            <span>{account.institution ?? account.type}</span>
                          </span>
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="transactions-manual-field transactions-manual-field--embedded-label">
              <span className="transactions-manual-field__label">Category</span>
              <div className="transactions-manual-picker">
                <div className="transactions-manual-picker__control">
                  <button
                    type="button"
                    className="transactions-manual-picker__button transactions-manual-picker__button--plain"
                    aria-expanded={categoryMenuOpen}
                    onClick={() => {
                      setAccountMenuOpen(false);
                      setCategoryMenuOpen((current) => !current);
                    }}
                  >
                    <span className="transactions-manual-picker__text">{selectedCategory?.name ?? "Other"}</span>
                    <span className="transactions-manual-picker__chevron" aria-hidden="true">
                      ▾
                    </span>
                  </button>
                  {categoryMenuOpen ? (
                    <div className="transactions-manual-picker__menu" role="listbox" aria-label="Choose category">
                      {categories.map((category) => (
                        <button
                          key={category.id}
                          type="button"
                          className={`transactions-manual-picker__option ${category.id === form.categoryId ? "is-selected" : ""}`}
                          onClick={() => {
                            setForm((current) => ({ ...current, categoryId: category.id }));
                            setCategoryMenuOpen(false);
                          }}
                        >
                          <span className="transactions-manual-picker__category-icon" aria-hidden="true">
                            <span className="transaction-category-icon transaction-category-icon--manual" style={getCategoryIconTone(category.name)}>
                              <img src={getCategoryIconSrc(category.name)} alt="" aria-hidden="true" />
                            </span>
                          </span>
                          <span className="transactions-manual-picker__option-text">
                            <strong>{category.name}</strong>
                            <span>{category.type}</span>
                          </span>
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="transactions-manual-field transactions-manual-field--embedded-label">
              <span className="transactions-manual-field__label">Preview</span>
              <div className="dashboard-manual-modal__preview">{previewLabel}</div>
            </div>

            {error ? <p className="dashboard-manual-modal__error">{error}</p> : null}

            <div className={`transactions-manual-more-row ${manualMoreOpen ? "is-open" : ""}`}>
              <button
                type="button"
                className="transactions-manual-more"
                onClick={() => setManualMoreOpen((current) => !current)}
                aria-expanded={manualMoreOpen}
              >
                <span>{manualMoreOpen ? "Less" : "More"}</span>
                <span className={`transactions-manual-more__chevron ${manualMoreOpen ? "is-open" : ""}`} aria-hidden="true">
                  ▾
                </span>
              </button>
              {!manualMoreOpen ? (
                <div className="manual-form-actions manual-form-actions--closed">
                  <div className="manual-form-actions__right">
                    <button className="transactions-manual-add-another" type="submit" data-submit-mode="add-another" disabled={isSaving}>
                      Add another
                    </button>
                    <button className="button button-primary button-small" type="submit" data-submit-mode="close" disabled={isSaving || !accounts.length}>
                      {isSaving ? "Saving..." : "Add transaction"}
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
            {manualMoreOpen ? (
              <>
                <div className="manual-more-panel manual-more-panel--compact">
                  <label className="transactions-manual-field transactions-manual-field--embedded-label">
                    <span className="transactions-manual-field__label">Notes</span>
                    <textarea
                      value={form.description}
                      onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
                      placeholder="Optional note or review context"
                    />
                  </label>

                  <div className="manual-more-panel__receipt-line-items">
                    <div className="manual-more-panel__section-head">
                      <span>Receipt line items</span>
                    </div>

                    {form.receiptLineItems.length === 0 ? (
                      <p className="field-help field-help--compact">
                        Optional. Add item lines if you want the receipt breakdown to follow the transaction.
                      </p>
                    ) : null}

                    {form.receiptLineItems.length > 0 ? (
                      <div className="manual-receipt-table" role="table" aria-label="Receipt line items">
                        <div className="manual-receipt-table__header" role="row">
                          <span role="columnheader">Item</span>
                          <span role="columnheader">Price</span>
                          <span aria-hidden="true" />
                        </div>

                        {form.receiptLineItems.map((lineItem, index) => (
                          <div key={index} className="manual-receipt-table__row" role="row">
                            <label className="manual-receipt-table__cell" role="cell">
                              <span className="sr-only">Item</span>
                              <input
                                value={lineItem.description}
                                onChange={(event) =>
                                  setForm((current) => ({
                                    ...current,
                                    receiptLineItems: current.receiptLineItems.map((entry, entryIndex) =>
                                      entryIndex === index ? { ...entry, description: event.target.value } : entry
                                    ),
                                  }))
                                }
                                placeholder="Coffee"
                              />
                            </label>
                            <label className="manual-receipt-table__cell manual-receipt-table__cell--price" role="cell">
                              <span className="sr-only">Price</span>
                              <input
                                type="number"
                                step="0.01"
                                value={lineItem.amount}
                                onChange={(event) =>
                                  setForm((current) => ({
                                    ...current,
                                    receiptLineItems: current.receiptLineItems.map((entry, entryIndex) =>
                                      entryIndex === index ? { ...entry, amount: event.target.value } : entry
                                    ),
                                  }))
                                }
                                placeholder="0.00"
                              />
                            </label>
                            <button
                              type="button"
                              className="manual-receipt-table__remove"
                              onClick={() =>
                                setForm((current) => ({
                                  ...current,
                                  receiptLineItems: current.receiptLineItems.filter((_, entryIndex) => entryIndex !== index),
                                }))
                              }
                              aria-label="Remove line item"
                            >
                              ×
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : null}

                    <button
                      type="button"
                      className="manual-receipt-table__add-floater"
                      onClick={() =>
                        setForm((current) => ({
                          ...current,
                          receiptLineItems: [...current.receiptLineItems, createEmptyReceiptLineItem()],
                        }))
                      }
                      aria-label="Add receipt line item"
                    >
                      +
                    </button>
                  </div>
                </div>

                <div className="manual-form-actions manual-form-actions--expanded">
                  <div className="manual-form-actions__right">
                    <button className="transactions-manual-add-another" type="submit" data-submit-mode="add-another" disabled={isSaving}>
                      Add another
                    </button>
                    <button className="button button-primary button-small" type="submit" data-submit-mode="close" disabled={isSaving || !accounts.length}>
                      {isSaving ? "Saving..." : "Add transaction"}
                    </button>
                  </div>
                </div>
              </>
            ) : null}
          </div>
        </form>
      </section>
    </div>
  );
}

export function DashboardTopActions({ workspaceId, accounts }: DashboardTopActionsProps) {
  const router = useRouter();
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  const defaultImportAccountId =
    accounts.find((account) => normalizeName(account.type) !== "cash" && normalizeName(account.type) !== "other" && normalizeName(account.type) !== "investment")?.id ??
    accounts[0]?.id ??
    null;

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

  useLayoutEffect(() => {
    const active = manualOpen || importOpen;
    document.body.classList.toggle("dashboard-modal-open", active);
    document.body.toggleAttribute("data-clover-page-modal", active);

    return () => {
      document.body.classList.remove("dashboard-modal-open");
      document.body.removeAttribute("data-clover-page-modal");
    };
  }, [importOpen, manualOpen]);

  useEffect(() => {
    const manualParam = new URLSearchParams(window.location.search).get("manual");
    const importParam = new URLSearchParams(window.location.search).get("import");

    if (manualParam === "1") {
      setMenuOpen(false);
      setImportOpen(false);
      setManualOpen(true);
      return;
    }

    if (importParam === "1") {
      setMenuOpen(false);
      setManualOpen(false);
      setImportOpen(true);
    }
  }, []);

  useEffect(() => {
    const handleOpenManual = () => {
      setMenuOpen(false);
      setImportOpen(false);
      setManualOpen(true);
    };
    const handleOpenImport = () => {
      setMenuOpen(false);
      setManualOpen(false);
      setImportOpen(true);
    };

    window.addEventListener("clover:open-transaction-add", handleOpenManual);
    window.addEventListener("clover:open-dashboard-import", handleOpenImport);
    return () => {
      window.removeEventListener("clover:open-transaction-add", handleOpenManual);
      window.removeEventListener("clover:open-dashboard-import", handleOpenImport);
    };
  }, []);

  const closeManual = () => {
    setManualOpen(false);
    setMenuOpen(false);
    window.history.replaceState({}, "", "/dashboard");
  };

  const closeImport = () => {
    setImportOpen(false);
    setMenuOpen(false);
    window.history.replaceState({}, "", "/dashboard");
  };

  const openManualAdd = () => {
    setMenuOpen(false);
    setImportOpen(false);
    setManualOpen(true);
  };

  const openImportFiles = () => {
    setMenuOpen(false);
    setManualOpen(false);
    setImportOpen(true);
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
        {menuOpen ? (
          <div className="dashboard-top-actions__menu">
            <button className="dashboard-top-actions__menu-item" type="button" onClick={openManualAdd}>
              Add transaction
            </button>
            <button className="dashboard-top-actions__menu-item" type="button" onClick={openImportFiles}>
              Import files
            </button>
          </div>
        ) : null}
      </div>

      {manualOpen ? (
        <DashboardManualTransactionModal
          workspaceId={workspaceId}
          accounts={accounts}
          onClose={closeManual}
        />
      ) : null}

      <ImportFilesModal
        open={importOpen}
        workspaceId={workspaceId}
        accounts={accounts}
        defaultAccountId={defaultImportAccountId}
        onClose={closeImport}
        onImported={async () => {
          router.refresh();
          closeImport();
        }}
      />
    </>
  );
}
