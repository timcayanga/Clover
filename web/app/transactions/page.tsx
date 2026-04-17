"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

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
  isTransfer: boolean;
  isExcluded: boolean;
};

type ImportFile = {
  id: string;
  fileName: string;
  status: string;
  uploadedAt: string;
};

const currencyFormatter = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
  minimumFractionDigits: 2,
});

export default function TransactionsPage() {
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

  const filteredTransactions = useMemo(() => {
    return transactions.filter((transaction) => {
      const matchesQuery =
        !query ||
        transaction.merchantRaw.toLowerCase().includes(query.toLowerCase()) ||
        (transaction.merchantClean ?? "").toLowerCase().includes(query.toLowerCase());
      const matchesCategory = categoryFilter === "all" || transaction.categoryId === categoryFilter;
      const matchesAccount = accountFilter === "all" || transaction.accountId === accountFilter;
      const matchesType = typeFilter === "all" || transaction.type === typeFilter;
      return matchesQuery && matchesCategory && matchesAccount && matchesType;
    });
  }, [transactions, query, categoryFilter, accountFilter, typeFilter]);

  const totals = useMemo(() => {
    return filteredTransactions.reduce(
      (accumulator, transaction) => {
        const amount = Number(transaction.amount);
        if (transaction.isExcluded) {
          accumulator.excluded += amount;
          return accumulator;
        }

        if (transaction.type === "income") {
          accumulator.income += amount;
        } else {
          accumulator.expense += amount;
        }
        return accumulator;
      },
      { income: 0, expense: 0, excluded: 0 }
    );
  }, [filteredTransactions]);

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

  const workspace = workspaces.find((entry) => entry.id === selectedWorkspaceId) ?? null;

  return (
    <main className="page dashboard">
      <header className="nav">
        <div className="brand">
          <div className="brand-mark">CL</div>
          <div>
            <div>Transactions</div>
            <small className="panel-muted">PostgreSQL-backed review and edits</small>
          </div>
        </div>
        <div className="actions">
          <Link className="button button-secondary" href="/imports">
            Imports
          </Link>
          <Link className="button button-secondary" href="/">
            Home
          </Link>
        </div>
      </header>

      <section className="panel">
        <h2>Transaction review</h2>
        <p className="panel-muted">{message}</p>

        <div className="actions" style={{ marginTop: 20, alignItems: "end" }}>
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
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Merchant or note" />
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
      </section>

      <section className="dashboard-grid" style={{ marginTop: 18 }}>
        <article className="panel third">
          <h3>Income</h3>
          <p className="panel-muted">{currencyFormatter.format(totals.income)}</p>
        </article>
        <article className="panel third">
          <h3>Spending</h3>
          <p className="panel-muted">{currencyFormatter.format(totals.expense)}</p>
        </article>
        <article className="panel third">
          <h3>Excluded</h3>
          <p className="panel-muted">{currencyFormatter.format(totals.excluded)}</p>
        </article>
      </section>

      <section className="panel" style={{ marginTop: 18 }}>
        <div className="panel-header">
          <div>
            <h3>Workspace snapshot</h3>
            <p className="panel-muted">Real counts and import states for the selected workspace.</p>
          </div>
          <span className="status status--done">{filteredTransactions.length} visible</span>
        </div>

        <div className="dashboard-grid" style={{ marginTop: 18 }}>
          <article className="metric compact third">
            <span>Accounts</span>
            <strong>{accounts.length}</strong>
          </article>
          <article className="metric compact third">
            <span>Imports</span>
            <strong>{imports.length}</strong>
          </article>
          <article className="metric compact third">
            <span>Queued / processing</span>
            <strong>{importSummary.processing}</strong>
          </article>
        </div>

        <div className="list-stack" style={{ marginTop: 18 }}>
          {imports.slice(0, 4).map((file) => (
            <div key={file.id} className="list-row">
              <div>
                <strong>{file.fileName}</strong>
                <div className="panel-muted">{new Date(file.uploadedAt).toLocaleDateString()}</div>
              </div>
              <span className={`status status--${file.status}`}>{file.status}</span>
            </div>
          ))}
          {imports.length === 0 ? <p className="panel-muted">No imports yet.</p> : null}
        </div>
      </section>

      <section className="panel" style={{ marginTop: 18 }}>
        <div className="panel-muted" style={{ marginBottom: 16 }}>
          {workspace ? `Showing ${workspace.name}` : "No workspace selected"} · {filteredTransactions.length} rows
        </div>

        <div style={{ overflowX: "auto" }}>
          <table className="transactions-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Merchant</th>
                <th>Account</th>
                <th>Category</th>
                <th>Amount</th>
                <th>Type</th>
                <th>Flags</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredTransactions.map((transaction) => (
                <tr key={transaction.id} className={transaction.isExcluded ? "is-muted" : ""}>
                  <td>{transaction.date.slice(0, 10)}</td>
                  <td>
                    <div>{transaction.merchantClean || transaction.merchantRaw}</div>
                    <small className="panel-muted">{transaction.merchantClean ? transaction.merchantRaw : ""}</small>
                  </td>
                  <td>{transaction.accountName}</td>
                  <td>
                    <select
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
                  </td>
                  <td>{currencyFormatter.format(Number(transaction.amount))}</td>
                  <td>{transaction.type}</td>
                  <td>
                    <label style={{ display: "block" }}>
                      <input
                        type="checkbox"
                        checked={transaction.isExcluded}
                        onChange={(event) =>
                          void updateTransaction(transaction.id, {
                            isExcluded: event.target.checked,
                          })
                        }
                      />
                      Excluded
                    </label>
                    <label style={{ display: "block" }}>
                      <input
                        type="checkbox"
                        checked={transaction.isTransfer}
                        onChange={(event) =>
                          void updateTransaction(transaction.id, {
                            isTransfer: event.target.checked,
                          })
                        }
                      />
                      Transfer
                    </label>
                  </td>
                  <td>
                    <button
                      type="button"
                      className="button button-secondary"
                      onClick={() =>
                        void updateTransaction(transaction.id, {
                          merchantClean: transaction.merchantRaw,
                        })
                      }
                    >
                      Clean name
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
