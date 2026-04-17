"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CloverShell } from "@/components/clover-shell";

type Workspace = {
  id: string;
  name: string;
  type: string;
};

type Account = {
  id: string;
  name: string;
  institution: string | null;
  currency: string;
};

type Category = {
  id: string;
  name: string;
  type: "income" | "expense" | "transfer";
};

type Transaction = {
  id: string;
  accountId: string;
  accountName: string;
  categoryId: string | null;
  categoryName: string | null;
  date: string;
  amount: string;
  currency: string;
  type: "income" | "expense" | "transfer";
  merchantRaw: string;
  merchantClean: string | null;
  description?: string | null;
  isTransfer: boolean;
  isExcluded: boolean;
};

type ImportFile = {
  id: string;
  fileName: string;
  status: string;
  uploadedAt: string;
};

type ManualTransactionForm = {
  date: string;
  accountId: string;
  categoryId: string;
  amount: string;
  type: "income" | "expense" | "transfer";
  merchantRaw: string;
  merchantClean: string;
  description: string;
};

const currencyFormatter = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
  minimumFractionDigits: 2,
});

const todayIso = new Date().toISOString().slice(0, 10);

const createEmptyManualForm = (accountId = ""): ManualTransactionForm => ({
  date: todayIso,
  accountId,
  categoryId: "",
  amount: "",
  type: "expense",
  merchantRaw: "",
  merchantClean: "",
  description: "",
});

const formatDate = (value: string) =>
  new Date(value).toLocaleDateString("en-PH", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

const downloadTextFile = (filename: string, contents: string, mimeType: string) => {
  const blob = new Blob([contents], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
};

export default function TransactionsPage() {
  const router = useRouter();
  const searchInputRef = useRef<HTMLInputElement>(null);

  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState("");
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [imports, setImports] = useState<ImportFile[]>([]);
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [accountFilter, setAccountFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [message, setMessage] = useState("Select a workspace to review transactions.");
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [downloadMenuOpen, setDownloadMenuOpen] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null);
  const [manualForm, setManualForm] = useState<ManualTransactionForm>(createEmptyManualForm());
  const [isSaving, setIsSaving] = useState(false);

  const workspace = workspaces.find((entry) => entry.id === selectedWorkspaceId) ?? null;

  const loadWorkspaces = async () => {
    const response = await fetch("/api/workspaces");
    if (!response.ok) return;
    const data = await response.json();
    const items = Array.isArray(data.workspaces) ? data.workspaces : [];
    setWorkspaces(items);
    setSelectedWorkspaceId((current) => current || items[0]?.id || "");
  };

  const loadWorkspaceData = async (workspaceId: string) => {
    if (!workspaceId) {
      setAccounts([]);
      setCategories([]);
      setTransactions([]);
      setImports([]);
      return;
    }

    const [accountsResponse, categoriesResponse, transactionsResponse, importResponse] = await Promise.all([
      fetch(`/api/accounts?workspaceId=${encodeURIComponent(workspaceId)}`),
      fetch(`/api/categories?workspaceId=${encodeURIComponent(workspaceId)}`),
      fetch(`/api/transactions?workspaceId=${encodeURIComponent(workspaceId)}`),
      fetch(`/api/imports?workspaceId=${encodeURIComponent(workspaceId)}`),
    ]);

    if (accountsResponse.ok) {
      const payload = await accountsResponse.json();
      setAccounts(Array.isArray(payload.accounts) ? payload.accounts : []);
    }

    if (categoriesResponse.ok) {
      const payload = await categoriesResponse.json();
      setCategories(Array.isArray(payload.categories) ? payload.categories : []);
    }

    if (transactionsResponse.ok) {
      const payload = await transactionsResponse.json();
      setTransactions(Array.isArray(payload.transactions) ? payload.transactions : []);
    }

    if (importResponse.ok) {
      const payload = await importResponse.json();
      setImports(Array.isArray(payload.importFiles) ? payload.importFiles : []);
    }
  };

  useEffect(() => {
    void loadWorkspaces();
  }, []);

  useEffect(() => {
    void loadWorkspaceData(selectedWorkspaceId);
  }, [selectedWorkspaceId]);

  const ensureDefaultAccount = async (workspaceId: string) => {
    if (accounts.length > 0) {
      return accounts[0].id;
    }

    const response = await fetch("/api/accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        workspaceId,
        name: "Imported transactions",
        institution: "Source upload",
        type: "bank",
        currency: "PHP",
        source: "upload",
      }),
    });

    if (!response.ok) {
      throw new Error("Unable to create a default account for this workspace.");
    }

    const data = await response.json();
    const accountId = data.account?.id as string | undefined;

    if (!accountId) {
      throw new Error("Default account was not created.");
    }

    setAccounts([data.account]);
    return accountId;
  };

  const filteredTransactions = useMemo(() => {
    return transactions.filter((transaction) => {
      const term = query.trim().toLowerCase();
      const matchesQuery =
        !term ||
        transaction.merchantRaw.toLowerCase().includes(term) ||
        (transaction.merchantClean ?? "").toLowerCase().includes(term) ||
        (transaction.description ?? "").toLowerCase().includes(term);
      const matchesCategory = categoryFilter === "all" || transaction.categoryId === categoryFilter;
      const matchesAccount = accountFilter === "all" || transaction.accountId === accountFilter;
      const matchesType = typeFilter === "all" || transaction.type === typeFilter;
      return matchesQuery && matchesCategory && matchesAccount && matchesType;
    });
  }, [transactions, query, categoryFilter, accountFilter, typeFilter]);

  const duplicateLookup = useMemo(() => {
    const counts = new Map<string, number>();

    for (const transaction of filteredTransactions) {
      const signature = [
        transaction.date.slice(0, 10),
        Number(transaction.amount).toFixed(2),
        (transaction.merchantClean ?? transaction.merchantRaw).trim().toLowerCase(),
      ].join("|");

      counts.set(signature, (counts.get(signature) ?? 0) + 1);
    }

    return counts;
  }, [filteredTransactions]);

  const totals = useMemo(() => {
    return filteredTransactions.reduce(
      (accumulator, transaction) => {
        const amount = Math.abs(Number(transaction.amount));
        const signature = [
          transaction.date.slice(0, 10),
          Number(transaction.amount).toFixed(2),
          (transaction.merchantClean ?? transaction.merchantRaw).trim().toLowerCase(),
        ].join("|");
        const hasReviewIssue =
          transaction.isExcluded ||
          transaction.isTransfer ||
          !transaction.categoryId ||
          (duplicateLookup.get(signature) ?? 0) > 1;

        if (transaction.isExcluded) {
          if (hasReviewIssue) {
            accumulator.review += 1;
          }
          return accumulator;
        }

        if (transaction.type === "income") {
          accumulator.income += amount;
        } else {
          accumulator.expense += amount;
        }

        if (hasReviewIssue) {
          accumulator.review += 1;
        }

        return accumulator;
      },
      { income: 0, expense: 0, review: 0 }
    );
  }, [filteredTransactions, duplicateLookup]);

  const importSummary = useMemo(() => {
    return imports.reduce(
      (accumulator, file) => {
        if (file.status === "processing") {
          accumulator.processing += 1;
        } else if (file.status === "done") {
          accumulator.done += 1;
        } else if (file.status === "failed") {
          accumulator.failed += 1;
        }
        return accumulator;
      },
      { processing: 0, done: 0, failed: 0 }
    );
  }, [imports]);

  const summaryData = useMemo(() => {
    const topCategories = new Map<string, number>();
    const topAccounts = new Map<string, number>();

    for (const transaction of filteredTransactions) {
      const amount = Math.abs(Number(transaction.amount));
      topCategories.set(transaction.categoryName ?? "Unassigned", (topCategories.get(transaction.categoryName ?? "Unassigned") ?? 0) + amount);
      topAccounts.set(transaction.accountName, (topAccounts.get(transaction.accountName) ?? 0) + amount);
    }

    const topCategory = Array.from(topCategories.entries()).sort((a, b) => b[1] - a[1])[0];
    const topAccount = Array.from(topAccounts.entries()).sort((a, b) => b[1] - a[1])[0];
    const sortedDates = [...filteredTransactions].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    const firstTransaction = sortedDates[0];
    const lastTransaction = sortedDates[sortedDates.length - 1];

    return {
      topCategory,
      topAccount,
      firstTransaction,
      lastTransaction,
    };
  }, [filteredTransactions]);

  const warningReasonFor = (transaction: Transaction) => {
    const signature = [
      transaction.date.slice(0, 10),
      Number(transaction.amount).toFixed(2),
      (transaction.merchantClean ?? transaction.merchantRaw).trim().toLowerCase(),
    ].join("|");

    if (transaction.isExcluded) {
      return "Excluded from totals";
    }

    if (transaction.isTransfer) {
      return "Marked as transfer";
    }

    if (!transaction.categoryId) {
      return "Needs category review";
    }

    if ((duplicateLookup.get(signature) ?? 0) > 1) {
      return "Possible duplicate";
    }

    return null;
  };

  const openManualAdd = async () => {
    setAddMenuOpen(false);

    if (!selectedWorkspaceId) {
      setMessage("Choose a workspace first.");
      return;
    }

    try {
      const accountId = await ensureDefaultAccount(selectedWorkspaceId);
      setManualForm(createEmptyManualForm(accountId));
      setManualOpen(true);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to prepare transaction form.");
    }
  };

  const saveManualTransaction = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!selectedWorkspaceId) {
      setMessage("Choose a workspace first.");
      return;
    }

    setIsSaving(true);
    try {
      const accountId = manualForm.accountId || (await ensureDefaultAccount(selectedWorkspaceId));

      const response = await fetch("/api/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId: selectedWorkspaceId,
          accountId,
          categoryId: manualForm.categoryId || null,
          date: manualForm.date,
          amount: manualForm.amount,
          currency: "PHP",
          type: manualForm.type,
          merchantRaw: manualForm.merchantRaw,
          merchantClean: manualForm.merchantClean.trim() || null,
          description: manualForm.description.trim() || null,
          isTransfer: manualForm.type === "transfer",
          isExcluded: false,
        }),
      });

      if (!response.ok) {
        throw new Error("Unable to create transaction.");
      }

      const payload = await response.json();
      const created = payload.transaction as Transaction;
      setTransactions((current) => [created, ...current]);
      setManualOpen(false);
      setMessage(`Transaction "${created.merchantRaw}" added.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to create transaction.");
    } finally {
      setIsSaving(false);
    }
  };

  const updateTransaction = async (transactionId: string, body: Record<string, unknown>) => {
    const response = await fetch(`/api/transactions/${transactionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error("Unable to update transaction.");
    }

    const payload = await response.json();
    const updated = payload.transaction as Transaction;
    setTransactions((current) => current.map((entry) => (entry.id === updated.id ? updated : entry)));
  };

  const saveView = () => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(
      "clover.transactions.view",
      JSON.stringify({
        workspaceId: selectedWorkspaceId,
        query,
        categoryFilter,
        accountFilter,
        typeFilter,
      })
    );
    setMessage("Current view saved.");
  };

  const downloadCsv = () => {
    const header = ["Name", "Date", "Account", "Category", "Amount", "Type", "Notes", "Warning"];
    const rows = filteredTransactions.map((transaction) => [
      transaction.merchantClean ?? transaction.merchantRaw,
      formatDate(transaction.date),
      transaction.accountName,
      transaction.categoryName ?? "Unassigned",
      transaction.amount,
      transaction.type,
      transaction.description ?? "",
      warningReasonFor(transaction) ?? "",
    ]);

    const csv = [header, ...rows]
      .map((row) =>
        row
          .map((cell) => `"${String(cell).replaceAll("\"", '""')}"`)
          .join(",")
      )
      .join("\n");

    downloadTextFile("clover-transactions.csv", csv, "text/csv;charset=utf-8;");
  };

  const downloadPdf = () => {
    if (typeof window !== "undefined") {
      window.print();
    }
  };

  const netGain = totals.income - totals.expense;
  const hasReviewItems = totals.review > 0;

  return (
    <CloverShell active="transactions" title="Transactions" showTopbar={false}>
      <section className={`transactions-layout ${summaryOpen ? "transactions-layout--summary-open" : ""}`}>
        <div className="glass table-panel table-panel--full transactions-table-panel transactions-main-panel">
          <div className="transactions-topbar">
            <div className="transactions-top-actions">
              <div className="transactions-add-menu" id="transactions-add-menu">
                <button
                  className="button button-primary button-small transactions-action-button transactions-add-menu__toggle"
                  type="button"
                  onClick={() => setAddMenuOpen((current) => !current)}
                  aria-expanded={addMenuOpen}
                >
                  <span className="button-icon" aria-hidden="true">
                    ＋
                  </span>
                  <span>Add</span>
                  <span className="button-icon" aria-hidden="true">
                    ▾
                  </span>
                </button>
                <div className="transactions-add-menu__panel" hidden={!addMenuOpen}>
                  <button className="transactions-add-menu__item" type="button" onClick={openManualAdd}>
                    Add transaction
                  </button>
                  <button className="transactions-add-menu__item" type="button" onClick={() => router.push("/imports")}>
                    Import files
                  </button>
                </div>
              </div>

              <button className="button button-secondary button-small transactions-action-button" type="button" title="Undo">
                <span className="button-icon" aria-hidden="true">
                  ↶
                </span>
                Undo
              </button>
              <button className="button button-secondary button-small transactions-action-button" type="button" title="Redo">
                <span className="button-icon" aria-hidden="true">
                  ↷
                </span>
                Redo
              </button>
            </div>

            <div className="transactions-top-actions transactions-top-actions--right">
              <button
                className="button button-secondary button-small transactions-action-button transactions-search-trigger"
                type="button"
                onClick={() => searchInputRef.current?.focus()}
                title="Search"
              >
                <span className="button-icon" aria-hidden="true">
                  ⌕
                </span>
                <span>Search</span>
              </button>
              <button className="button button-secondary button-small transactions-action-button" type="button" title="Date">
                <span className="button-icon" aria-hidden="true">
                  ⏲
                </span>
                <span>Date</span>
              </button>
              <button className="button button-secondary button-small transactions-action-button" type="button" title="Filters">
                <span className="button-icon" aria-hidden="true">
                  ≡
                </span>
                <span>Filters</span>
              </button>
              <button
                className="button button-secondary button-small transactions-action-button transactions-summary-toggle-button"
                type="button"
                aria-pressed={summaryOpen}
                onClick={() => setSummaryOpen((current) => !current)}
                title="Summary"
              >
                <span className="button-icon" aria-hidden="true">
                  ▣
                </span>
                <span>Summary</span>
              </button>
              <button className="button button-secondary button-small transactions-action-button" type="button" onClick={saveView} title="Save view">
                <span className="button-icon" aria-hidden="true">
                  ⌘
                </span>
                <span>Save View</span>
              </button>
              <div className="transactions-download-menu" id="transactions-download-menu">
                <button
                  className="button button-secondary button-small transactions-action-button transactions-download-menu__toggle"
                  type="button"
                  aria-haspopup="menu"
                  aria-expanded={downloadMenuOpen}
                  onClick={() => setDownloadMenuOpen((current) => !current)}
                  title="Download"
                >
                  <span className="button-icon" aria-hidden="true">
                    ⤓
                  </span>
                  <span>Download</span>
                  <span className="button-icon" aria-hidden="true">
                    ▾
                  </span>
                </button>
                <div className="transactions-download-menu__panel" hidden={!downloadMenuOpen}>
                  <button className="transactions-download-menu__item" type="button" onClick={downloadCsv}>
                    CSV
                  </button>
                  <button className="transactions-download-menu__item" type="button" onClick={downloadPdf}>
                    PDF
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="transactions-filter-strip">
            <div className="transactions-filter-grid">
              <label>
                Workspace
                <select value={selectedWorkspaceId} onChange={(event) => setSelectedWorkspaceId(event.target.value)}>
                  <option value="">Choose workspace</option>
                  {workspaces.map((entry) => (
                    <option key={entry.id} value={entry.id}>
                      {entry.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Search
                <input
                  ref={searchInputRef}
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Merchant, note, or alias"
                />
              </label>
              <label>
                Category
                <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}>
                  <option value="all">All categories</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Account
                <select value={accountFilter} onChange={(event) => setAccountFilter(event.target.value)}>
                  <option value="all">All accounts</option>
                  {accounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Type
                <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}>
                  <option value="all">All types</option>
                  <option value="income">Income</option>
                  <option value="expense">Expense</option>
                  <option value="transfer">Transfer</option>
                </select>
              </label>
            </div>
          </div>

          <div className="transactions-status-line">
            <span className="pill pill-neutral">
              {workspace ? `${workspace.name}` : "No workspace selected"} · {filteredTransactions.length} items shown
            </span>
            <span className="pill pill-neutral">{imports.length} import file{imports.length === 1 ? "" : "s"}</span>
          </div>

          <div className="line-item-header" role="row" aria-label="Transaction columns">
            <button className="line-item-header-cell line-item-header-cell--name" type="button">
              Name
            </button>
            <button className="line-item-header-cell" type="button">
              Date
            </button>
            <button className="line-item-header-cell" type="button">
              Account
            </button>
            <button className="line-item-header-cell" type="button">
              Category
            </button>
            <button className="line-item-header-cell line-item-header-cell--amount" type="button">
              Amount
            </button>
            <span className="line-item-header-cell line-item-header-cell--spacer" aria-hidden="true" />
            <span className="line-item-header-cell line-item-header-cell--spacer" aria-hidden="true" />
          </div>

          <div className="table-wrap transactions-table-wrap">
            {filteredTransactions.length > 0 ? (
              filteredTransactions.map((transaction) => {
                const warningReason = warningReasonFor(transaction);
                const amount = Number(transaction.amount);
                const isPositive = transaction.type === "income";
                return (
                  <div key={transaction.id} className={`line-item ${transaction.isExcluded ? "is-muted" : ""}`}>
                    <div className="transaction-name-cell">
                      <strong className="item-merchant">{transaction.merchantClean || transaction.merchantRaw}</strong>
                      <small className="transaction-subtext">
                        {transaction.description || transaction.merchantClean ? transaction.merchantRaw : transaction.accountName}
                      </small>
                    </div>
                    <div className="transaction-date-cell">{formatDate(transaction.date)}</div>
                    <div className="transaction-account-cell">{transaction.accountName}</div>
                    <div className="transaction-category-cell">
                      <select
                        className="transaction-category-select"
                        value={transaction.categoryId ?? ""}
                        onChange={(event) =>
                          void updateTransaction(transaction.id, {
                            categoryId: event.target.value || null,
                          })
                        }
                      >
                        <option value="">Unassigned</option>
                        {categories.map((category) => (
                          <option key={category.id} value={category.id}>
                            {category.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className={`transaction-amount-cell ${isPositive ? "positive" : "negative"}`}>
                      {currencyFormatter.format(amount)}
                    </div>
                    <div className="transaction-notes-cell">
                      <button
                        type="button"
                        className="button button-secondary button-small transaction-note-button"
                        onClick={() => setSelectedTransaction(transaction)}
                      >
                        Notes
                      </button>
                    </div>
                    <div className="transaction-warning-cell">
                      {warningReason ? (
                        <button
                          type="button"
                          className="warning-chip"
                          title={warningReason}
                          onClick={() => setSelectedTransaction(transaction)}
                        >
                          <span className="warning-mark warning-mark--small" aria-hidden="true" />
                        </button>
                      ) : null}
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="empty-state">No transactions match the current filters.</div>
            )}
          </div>

          <div className="transactions-footer">
            <div className="table-footer__summary">
              <span className="pill pill-neutral">{filteredTransactions.length} transactions</span>
              {hasReviewItems ? (
                <button
                  type="button"
                  className="warning-summary-button"
                  title={`${totals.review} transaction${totals.review === 1 ? "" : "s"} still need review`}
                >
                  <span className="warning-mark warning-mark--small" aria-hidden="true" />
                </button>
              ) : null}
            </div>
            <span className={`pill transactions-net-pill ${netGain >= 0 ? "is-positive" : "is-negative"}`}>
              {netGain >= 0 ? "Net gain" : "Net loss"} {currencyFormatter.format(Math.abs(netGain))}
            </span>
          </div>
        </div>

        <aside className={`transactions-summary-panel glass ${summaryOpen ? "" : "is-hidden"}`} aria-label="Transaction summary">
          <div className="transactions-summary-panel__head">
            <p className="eyebrow">Summary</p>
            <h4>Overview</h4>
          </div>

          <dl className="transactions-summary-list">
            <div>
              <dt>Total transactions</dt>
              <dd>{filteredTransactions.length}</dd>
            </div>
            <div>
              <dt>Income</dt>
              <dd className="positive">{currencyFormatter.format(totals.income)}</dd>
            </div>
            <div>
              <dt>Spending</dt>
              <dd className="negative">{currencyFormatter.format(totals.expense)}</dd>
            </div>
            <div>
              <dt>Net</dt>
              <dd className={netGain >= 0 ? "positive" : "negative"}>{currencyFormatter.format(netGain)}</dd>
            </div>
            <div>
              <dt>Review items</dt>
              <dd>{totals.review}</dd>
            </div>
            <div>
              <dt>Top category</dt>
              <dd>{summaryData.topCategory ? `${summaryData.topCategory[0]} · ${currencyFormatter.format(summaryData.topCategory[1])}` : "—"}</dd>
            </div>
            <div>
              <dt>Top source</dt>
              <dd>{summaryData.topAccount ? `${summaryData.topAccount[0]} · ${currencyFormatter.format(summaryData.topAccount[1])}` : "—"}</dd>
            </div>
            <div>
              <dt>First transaction</dt>
              <dd>{summaryData.firstTransaction ? formatDate(summaryData.firstTransaction.date) : "—"}</dd>
            </div>
            <div>
              <dt>Last transaction</dt>
              <dd>{summaryData.lastTransaction ? formatDate(summaryData.lastTransaction.date) : "—"}</dd>
            </div>
          </dl>

          <button className="transactions-summary-panel__download" type="button" onClick={downloadCsv}>
            Download CSV
          </button>
        </aside>
      </section>

      {manualOpen ? (
        <div className="modal-backdrop" role="presentation" onClick={() => setManualOpen(false)}>
          <section
            className="modal-card modal-card--wide glass"
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-transaction-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-head">
              <div>
                <p className="eyebrow">Transactions</p>
                <h4 id="add-transaction-title">Add transaction</h4>
                <p className="modal-copy">Add a manual transaction or keep it as a quick review note.</p>
              </div>
              <button className="icon-button" type="button" onClick={() => setManualOpen(false)} aria-label="Close add transaction dialog">
                ×
              </button>
            </div>

            <form onSubmit={saveManualTransaction}>
              <div className="form-grid">
                <label>
                  Name
                  <input
                    value={manualForm.merchantRaw}
                    onChange={(event) => setManualForm((current) => ({ ...current, merchantRaw: event.target.value }))}
                    placeholder="Merchant or payee"
                    required
                  />
                </label>
                <label>
                  Date
                  <input
                    type="date"
                    value={manualForm.date}
                    onChange={(event) => setManualForm((current) => ({ ...current, date: event.target.value }))}
                    required
                  />
                </label>
                <label>
                  Account
                  <select
                    value={manualForm.accountId}
                    onChange={(event) => setManualForm((current) => ({ ...current, accountId: event.target.value }))}
                  >
                    <option value="">Choose account</option>
                    {accounts.map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Category
                  <select
                    value={manualForm.categoryId}
                    onChange={(event) => setManualForm((current) => ({ ...current, categoryId: event.target.value }))}
                  >
                    <option value="">Unassigned</option>
                    {categories.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Amount
                  <input
                    type="number"
                    step="0.01"
                    value={manualForm.amount}
                    onChange={(event) => setManualForm((current) => ({ ...current, amount: event.target.value }))}
                    placeholder="0.00"
                    required
                  />
                </label>
                <label>
                  Type
                  <select
                    value={manualForm.type}
                    onChange={(event) =>
                      setManualForm((current) => ({
                        ...current,
                        type: event.target.value as ManualTransactionForm["type"],
                      }))
                    }
                  >
                    <option value="expense">Expense</option>
                    <option value="income">Income</option>
                    <option value="transfer">Transfer</option>
                  </select>
                </label>
                <label className="span-2">
                  Merchant alias
                  <input
                    value={manualForm.merchantClean}
                    onChange={(event) => setManualForm((current) => ({ ...current, merchantClean: event.target.value }))}
                    placeholder="Optional cleaned-up merchant name"
                  />
                </label>
                <label className="span-2">
                  Notes
                  <textarea
                    value={manualForm.description}
                    onChange={(event) => setManualForm((current) => ({ ...current, description: event.target.value }))}
                    placeholder="Optional note or review context"
                  />
                </label>
              </div>

              <div className="form-actions">
                <button className="button button-secondary" type="button" onClick={() => setManualOpen(false)}>
                  Cancel
                </button>
                <button className="button button-primary" type="submit" disabled={isSaving}>
                  {isSaving ? "Saving..." : "Add transaction"}
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}

      {selectedTransaction ? (
        <div className="modal-backdrop" role="presentation" onClick={() => setSelectedTransaction(null)}>
          <section
            className="modal-card modal-card--wide glass"
            role="dialog"
            aria-modal="true"
            aria-labelledby="transaction-notes-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-head">
              <div>
                <p className="eyebrow">Notes</p>
                <h4 id="transaction-notes-title">{selectedTransaction.merchantClean || selectedTransaction.merchantRaw}</h4>
                <p className="modal-copy">Review the transaction details and keep a note for later.</p>
              </div>
              <button className="icon-button" type="button" onClick={() => setSelectedTransaction(null)} aria-label="Close notes dialog">
                ×
              </button>
            </div>

            <div className="transaction-notes-grid">
              <div className="transaction-note-meta">
                <span>Date</span>
                <strong>{formatDate(selectedTransaction.date)}</strong>
              </div>
              <div className="transaction-note-meta">
                <span>Account</span>
                <strong>{selectedTransaction.accountName}</strong>
              </div>
              <div className="transaction-note-meta">
                <span>Category</span>
                <strong>{selectedTransaction.categoryName ?? "Unassigned"}</strong>
              </div>
              <div className="transaction-note-meta">
                <span>Amount</span>
                <strong>{currencyFormatter.format(Number(selectedTransaction.amount))}</strong>
              </div>
            </div>

            <label className="span-2">
              Notes
              <textarea
                value={selectedTransaction.description ?? ""}
                onChange={(event) =>
                  setSelectedTransaction((current) =>
                    current
                      ? {
                          ...current,
                          description: event.target.value,
                        }
                      : current
                  )
                }
                placeholder="Optional context, receipt notes, or review comments"
              />
            </label>

            <div className="form-actions">
              <button className="button button-secondary" type="button" onClick={() => setSelectedTransaction(null)}>
                Close
              </button>
              <button
                className="button button-primary"
                type="button"
                onClick={async () => {
                  await updateTransaction(selectedTransaction.id, {
                    description: selectedTransaction.description ?? null,
                  });
                  setMessage("Notes updated.");
                  setSelectedTransaction(null);
                }}
              >
                Save notes
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </CloverShell>
  );
}
