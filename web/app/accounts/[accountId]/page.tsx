"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { CloverShell } from "@/components/clover-shell";
import { deriveReconciledBalance } from "@/lib/account-balance";
import { useOnboardingAccess } from "@/lib/use-onboarding-access";

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

export default function AccountDetailPage() {
  const onboardingStatus = useOnboardingAccess();

  useEffect(() => {
    document.title = "Clover | Account";
  }, []);

  if (onboardingStatus !== "ready") {
    return (
      <CloverShell
        active="accounts"
        title="Checking your setup..."
        kicker="One moment"
        subtitle="We’re confirming your onboarding status before opening this account."
        showTopbar={false}
      >
        <section className="empty-state">Checking your setup...</section>
      </CloverShell>
    );
  }

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
          <div>
            <p className="eyebrow">Account details</p>
            <h2>{account?.name ?? "Account"}</h2>
            <p className="panel-muted">
              {account ? `${account.institution ?? "No institution"} · ${account.currency} · ${account.source}` : message}
            </p>
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
          <div className="status-card" style={{ marginTop: 20 }}>
            <div>
              <div className="panel-muted">Latest statement checkpoint</div>
              <strong>
                {latestCheckpoint.statementEndDate ? formatDate(latestCheckpoint.statementEndDate) : "Unknown date"}
              </strong>
              <p className="panel-muted" style={{ margin: 0 }}>
                {latestCheckpoint.status === "mismatch" ? latestCheckpoint.mismatchReason ?? "Mismatch detected" : latestCheckpoint.status}
              </p>
            </div>
            <strong>{currencyFormatter.format(parseAmount(latestCheckpoint.endingBalance))}</strong>
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
