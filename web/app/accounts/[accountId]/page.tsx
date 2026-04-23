"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { CloverShell } from "@/components/clover-shell";
import { AccountBrandMark } from "@/components/account-brand-mark";
import { deriveReconciledBalance } from "@/lib/account-balance";
import { getAccountBrand } from "@/lib/account-brand";

type Account = {
  id: string;
  workspaceId: string;
  name: string;
  institution: string | null;
  type: string;
  currency: string;
  source: string;
  balance: string | null;
  updatedAt: string;
  createdAt: string;
};

type Transaction = {
  id: string;
  accountId: string;
  amount: string;
  type: "income" | "expense" | "transfer";
  date: string;
  merchantRaw: string;
  merchantClean: string | null;
  categoryName: string | null;
  description: string | null;
  isExcluded: boolean;
};

type StatementCheckpoint = {
  id: string;
  statementStartDate: string | null;
  statementEndDate: string | null;
  openingBalance: string | null;
  endingBalance: string | null;
  status: "pending" | "reconciled" | "mismatch";
  mismatchReason: string | null;
  rowCount: number;
  createdAt: string;
  updatedAt: string;
};

const currencyFormatter = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
  minimumFractionDigits: 2,
});

const formatDate = (value: string) =>
  new Date(value).toLocaleDateString("en-PH", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

const parseAmount = (value: string | null | undefined) => Number(value ?? 0);

const formatAccountType = (value: string) =>
  value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());

export default function AccountDetailPage() {
  useEffect(() => {
    document.title = "Clover | Account";
  }, []);

  return <AccountDetailPageContent />;
}

function AccountDetailPageContent() {
  const router = useRouter();
  const params = useParams<{ accountId: string }>();
  const accountId = params.accountId;

  const [account, setAccount] = useState<Account | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [checkpoints, setCheckpoints] = useState<StatementCheckpoint[]>([]);
  const [message, setMessage] = useState("Loading account history...");

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const accountResponse = await fetch(`/api/accounts/${accountId}`);
        if (!accountResponse.ok) {
          throw new Error("Unable to load this account.");
        }

        const accountPayload = await accountResponse.json();
        const nextAccount = accountPayload.account as Account | undefined;
        if (!nextAccount || cancelled) {
          return;
        }

        setAccount(nextAccount);

        const transactionsResponse = await fetch(`/api/transactions?workspaceId=${encodeURIComponent(nextAccount.workspaceId)}`);
        if (!transactionsResponse.ok) {
          throw new Error("Unable to load account transactions.");
        }

        const transactionsPayload = await transactionsResponse.json();
        const allTransactions = Array.isArray(transactionsPayload.transactions) ? (transactionsPayload.transactions as Transaction[]) : [];
        if (!cancelled) {
          setTransactions(allTransactions.filter((transaction) => transaction.accountId === nextAccount.id));
          setMessage("");
        }

        const checkpointsResponse = await fetch(`/api/accounts/${accountId}/statement-checkpoints`);
        if (checkpointsResponse.ok) {
          const checkpointsPayload = await checkpointsResponse.json();
          if (!cancelled) {
            setCheckpoints(Array.isArray(checkpointsPayload.checkpoints) ? (checkpointsPayload.checkpoints as StatementCheckpoint[]) : []);
          }
        }
      } catch (error) {
        if (!cancelled) {
          setMessage(error instanceof Error ? error.message : "Unable to load this account.");
        }
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [accountId]);

  const openingBalanceEntry = useMemo(
    () => transactions.find((transaction) => transaction.merchantRaw === "Beginning balance") ?? null,
    [transactions]
  );

  const latestCheckpoint = useMemo(
    () => checkpoints[0] ?? null,
    [checkpoints]
  );

  const reconciledBalance = useMemo(
    () =>
      deriveReconciledBalance({
        balance: account?.balance ?? null,
        transactions,
        checkpoints,
      }),
    [account?.balance, checkpoints, transactions]
  );

  const accountBrand = useMemo(
    () =>
      getAccountBrand({
        institution: account?.institution ?? null,
        name: account?.name ?? null,
        type: account?.type ?? null,
      }),
    [account?.institution, account?.name, account?.type]
  );

  const checkpointStatus = useMemo(() => {
    if (!latestCheckpoint) {
      return "No checkpoint yet";
    }

    if (latestCheckpoint.status === "mismatch") {
      return latestCheckpoint.mismatchReason ?? "Mismatch";
    }

    if (latestCheckpoint.status === "reconciled") {
      return "Reconciled";
    }

    return "Pending";
  }, [latestCheckpoint]);

  const checkpointBalance = useMemo(() => parseAmount(latestCheckpoint?.endingBalance), [latestCheckpoint?.endingBalance]);
  const currentBalance = parseAmount(reconciledBalance ?? account?.balance);
  const checkpointGap =
    latestCheckpoint && Number.isFinite(checkpointBalance) && Number.isFinite(currentBalance)
      ? checkpointBalance - currentBalance
      : null;

  const checkpointGapLabel = useMemo(() => {
    if (checkpointGap === null || !latestCheckpoint) {
      return "—";
    }

    if (Math.abs(checkpointGap) < 0.005) {
      return "Matches ledger";
    }

    if (checkpointGap > 0) {
      return `Statement higher by ${currencyFormatter.format(checkpointGap)}`;
    }

    return `Ledger higher by ${currencyFormatter.format(Math.abs(checkpointGap))}`;
  }, [checkpointGap, latestCheckpoint]);

  const visibleTransactions = useMemo(
    () =>
      transactions
        .filter((transaction) => transaction.merchantRaw !== "Beginning balance")
        .sort((left, right) => new Date(right.date).getTime() - new Date(left.date).getTime()),
    [transactions]
  );

  return (
    <CloverShell active="accounts" title={account?.name ?? "Account"} kicker="Account history" subtitle="View the full statement history for a single account." showTopbar={false}>
      <section className="panel">
        <div className="accounts-detail__header">
          <div className="accounts-detail__headline">
            {account ? <AccountBrandMark accountBrand={accountBrand} label={account.name} /> : null}
            <div>
              <p className="eyebrow">Account details</p>
              <h2>{account?.name ?? "Account"}</h2>
              <p className="panel-muted">
                {account ? `${accountBrand.label} · ${formatAccountType(account.type)} · ${account.currency} · ${account.source}` : message}
              </p>
            </div>
          </div>
          <div className="actions">
            <button className="button button-secondary" type="button" onClick={() => router.push("/accounts")}>
              Back to Accounts
            </button>
          </div>
        </div>

        {account ? (
          <div className="accounts-detail__summary">
            <div className="status-card">
              <div className="panel-muted">Current balance</div>
              <strong>{currencyFormatter.format(parseAmount(reconciledBalance ?? account.balance))}</strong>
            </div>
            <div className="status-card">
              <div className="panel-muted">Account type</div>
              <strong>{formatAccountType(account.type)}</strong>
            </div>
            <div className="status-card">
              <div className="panel-muted">Created</div>
              <strong>{formatDate(account.createdAt)}</strong>
            </div>
            <div className="status-card">
              <div className="panel-muted">Updated</div>
              <strong>{formatDate(account.updatedAt)}</strong>
            </div>
          </div>
        ) : null}

        {latestCheckpoint ? (
          <div className="accounts-detail__reconciliation glass" style={{ marginTop: 20 }}>
            <div className="accounts-detail__reconciliation-head">
              <div>
                <p className="eyebrow">Reconciliation</p>
                <h3>Statement checkpoint</h3>
              </div>
              <span
                className={`accounts-summary-chip ${
                  latestCheckpoint.status === "mismatch"
                    ? "is-danger"
                    : latestCheckpoint.status === "reconciled"
                      ? "is-good"
                      : "is-neutral"
                }`}
              >
                {checkpointStatus}
              </span>
            </div>
            <div className="accounts-detail__reconciliation-grid">
              <div className="status-card">
                <div className="panel-muted">Statement date</div>
                <strong>{latestCheckpoint.statementEndDate ? formatDate(latestCheckpoint.statementEndDate) : "Unknown"}</strong>
              </div>
              <div className="status-card">
                <div className="panel-muted">Statement balance</div>
                <strong>{currencyFormatter.format(checkpointBalance)}</strong>
              </div>
              <div className="status-card">
                <div className="panel-muted">Difference</div>
                <strong>{checkpointGapLabel}</strong>
              </div>
            </div>
            <p className="panel-muted" style={{ margin: "12px 0 0" }}>
              {latestCheckpoint.status === "mismatch"
                ? latestCheckpoint.mismatchReason ?? "The statement and account history do not match yet."
                : latestCheckpoint.status === "reconciled"
                  ? "The checkpoint matches the account history and anchors the current balance."
                  : "This checkpoint is waiting for confirmation."}
            </p>
          </div>
        ) : null}

        {openingBalanceEntry ? (
          <div className="status-card" style={{ marginTop: 20 }}>
            <div>
              <div className="panel-muted">Opening balance</div>
              <strong>{formatDate(openingBalanceEntry.date)}</strong>
            </div>
            <strong>{currencyFormatter.format(parseAmount(openingBalanceEntry.amount))}</strong>
          </div>
        ) : null}

        <div style={{ marginTop: 24 }}>
          <h3>All transactions</h3>
          {visibleTransactions.length > 0 ? (
            <div style={{ overflowX: "auto" }}>
              <table className="preview-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Description</th>
                    <th>Category</th>
                    <th>Type</th>
                    <th>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleTransactions.map((transaction) => (
                    <tr key={transaction.id}>
                      <td>{formatDate(transaction.date)}</td>
                      <td>{transaction.merchantClean || transaction.merchantRaw}</td>
                      <td>{transaction.categoryName || "—"}</td>
                      <td>{transaction.type}</td>
                      <td>{currencyFormatter.format(parseAmount(transaction.amount))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="panel-muted">No transactions are linked to this account yet.</p>
          )}
        </div>
      </section>
    </CloverShell>
  );
}
