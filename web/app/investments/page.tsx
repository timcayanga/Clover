"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CloverShell } from "@/components/clover-shell";
import { CloverLoadingScreen } from "@/components/clover-loading-screen";
import { AccountBrandMark } from "@/components/account-brand-mark";
import { getAccountBrand } from "@/lib/account-brand";
import { readSelectedWorkspaceId } from "@/lib/workspace-selection";
import { chooseWorkspaceId, persistSelectedWorkspaceId } from "@/lib/workspace-selection";
import { getCachedAccountsWorkspace } from "@/lib/workspace-cache";
import { getInvestmentSubtypeLabel } from "@/lib/investments";

type Workspace = {
  id: string;
  name: string;
  type: string;
};

type Account = {
  id: string;
  name: string;
  institution: string | null;
  investmentSubtype: string | null;
  investmentSymbol: string | null;
  investmentQuantity: string | null;
  investmentCostBasis: string | null;
  investmentPrincipal: string | null;
  investmentStartDate: string | null;
  investmentMaturityDate: string | null;
  investmentInterestRate: string | null;
  investmentMaturityValue: string | null;
  type: string;
  currency: string;
  source: string;
  balance: string | null;
  updatedAt: string;
  createdAt: string;
};

const currencyFormatter = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
  minimumFractionDigits: 2,
});

const parseAmount = (value: string | null | undefined) => Number(value ?? 0);

const parseNullableAmount = (value: string | null | undefined) => {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const formatDate = (value: string) =>
  new Date(value).toLocaleDateString("en-PH", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

export default function InvestmentsPage() {
  const initialWorkspaceId = readSelectedWorkspaceId();
  const initialCachedWorkspace = getCachedAccountsWorkspace(initialWorkspaceId);

  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState(initialWorkspaceId);
  const [accounts, setAccounts] = useState<Account[]>(
    () => (initialCachedWorkspace?.accounts as Account[]) ?? []
  );
  const [loading, setLoading] = useState(!initialCachedWorkspace);
  const [hasLoaded, setHasLoaded] = useState(Boolean(initialCachedWorkspace));
  const [message] = useState("Select a workspace to review investments.");

  useEffect(() => {
    document.title = "Clover | Investments";
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadWorkspaces = async () => {
      const response = await fetch("/api/workspaces");
      if (!response.ok || cancelled) {
        return;
      }

      const payload = await response.json();
      const items = Array.isArray(payload.workspaces) ? (payload.workspaces as Workspace[]) : [];
      setWorkspaces(items);
      setSelectedWorkspaceId((current) => chooseWorkspaceId(items, current));
    };

    void loadWorkspaces();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadAccounts = async () => {
      if (!selectedWorkspaceId) {
        setAccounts([]);
        setLoading(false);
        setHasLoaded(true);
        return;
      }

      setLoading(true);
      const response = await fetch(`/api/accounts?workspaceId=${encodeURIComponent(selectedWorkspaceId)}`);
      if (!response.ok || cancelled) {
        setLoading(false);
        setHasLoaded(true);
        return;
      }

      const payload = await response.json();
      const nextAccounts = Array.isArray(payload.accounts) ? (payload.accounts as Account[]) : [];
      setAccounts(nextAccounts);
      setLoading(false);
      setHasLoaded(true);
      persistSelectedWorkspaceId(selectedWorkspaceId);
    };

    void loadAccounts();

    return () => {
      cancelled = true;
    };
  }, [selectedWorkspaceId]);

  const investmentAccounts = useMemo(
    () => accounts.filter((account) => account.type === "investment"),
    [accounts]
  );

  const totals = useMemo(() => {
    return investmentAccounts.reduce(
      (accumulator, account) => {
        const currentValue = parseNullableAmount(account.balance);
        const purchaseValue = parseNullableAmount(account.investmentCostBasis);
        if (currentValue !== null) {
          accumulator.currentValue += currentValue;
        }
        if (purchaseValue !== null) {
          accumulator.purchaseValue += purchaseValue;
        }
        if (currentValue !== null && purchaseValue !== null) {
          accumulator.gainLoss += currentValue - purchaseValue;
        }
        return accumulator;
      },
      { currentValue: 0, purchaseValue: 0, gainLoss: 0 }
    );
  }, [investmentAccounts]);

  const selectedWorkspace = useMemo(
    () => workspaces.find((workspace) => workspace.id === selectedWorkspaceId) ?? null,
    [selectedWorkspaceId, workspaces]
  );

  if (!hasLoaded) {
    return <CloverLoadingScreen label="investments" />;
  }

  return (
    <CloverShell
      active="investments"
      title="Investments"
      kicker="Investments"
      subtitle="Track market holdings, time deposits, bonds, and platform-based investments in one place."
    >
      <section className="panel">
        <div className="accounts-page__headline">
          <div>
            <p className="eyebrow">Portfolio</p>
            <h2>{selectedWorkspace?.name ?? "Investments"}</h2>
            <p className="panel-muted">
              {investmentAccounts.length} investment{investmentAccounts.length === 1 ? "" : "s"} across{" "}
              {selectedWorkspace ? "the selected workspace" : "your workspace"}
            </p>
          </div>
          <div className="actions">
            <Link className="button button-secondary" href="/accounts">
              Back to Accounts
            </Link>
          </div>
        </div>

        {loading ? <p className="panel-muted">{message}</p> : null}

        <div className="accounts-overview-grid" style={{ marginTop: 20 }}>
          <article className="accounts-overview-card glass">
            <span>Current value</span>
            <strong>{currencyFormatter.format(totals.currentValue)}</strong>
            <p>Estimated value across investment holdings</p>
          </article>
          <article className="accounts-overview-card glass">
            <span>Purchase value</span>
            <strong>{currencyFormatter.format(totals.purchaseValue)}</strong>
            <p>Historical cost basis or principal</p>
          </article>
          <article className="accounts-overview-card glass">
            <span>Gain / loss</span>
            <strong>{currencyFormatter.format(totals.gainLoss)}</strong>
            <p>Current value minus purchase value</p>
          </article>
          <article className="accounts-overview-card glass">
            <span>Holdings</span>
            <strong>{investmentAccounts.length}</strong>
            <p>Tracked investment accounts</p>
          </article>
        </div>

        <div className="accounts-sections" style={{ marginTop: 20 }}>
          {investmentAccounts.length > 0 ? (
            investmentAccounts
              .slice()
              .sort((left, right) => parseAmount(right.balance) - parseAmount(left.balance))
              .map((account) => {
                const accountBrand = getAccountBrand({
                  institution: account.institution ?? null,
                  name: account.name,
                  type: account.type,
                });
                const currentValue = parseNullableAmount(account.balance);
                const purchaseValue = parseNullableAmount(account.investmentCostBasis);
                const gainLoss =
                  currentValue === null || purchaseValue === null ? null : currentValue - purchaseValue;

                return (
                  <article key={account.id} className="accounts-group glass">
                    <div className="accounts-group__head">
                      <div>
                        <h3>{account.name}</h3>
                        <p>
                          {getInvestmentSubtypeLabel(account.investmentSubtype)}
                          {account.institution ? ` · ${account.institution}` : ""}
                        </p>
                      </div>
                      <Link className="button button-secondary button-small" href={`/accounts/${account.id}`}>
                        Open account
                      </Link>
                    </div>

                    <div className="accounts-card-grid">
                      <div className="accounts-account-card glass" style={{ ["--brand-accent" as string]: accountBrand.accent, ["--brand-soft" as string]: accountBrand.background }}>
                        <div className="accounts-account-card__head">
                          <div className="accounts-account-card__brand">
                            <AccountBrandMark accountBrand={accountBrand} label={account.name} />
                            <div>
                              <strong>{account.name}</strong>
                              <span>{accountBrand.label}</span>
                            </div>
                          </div>
                        </div>
                        <div className="accounts-account-card__body">
                          <div className="accounts-account-card__balance-row">
                            <div className="accounts-account-card__amount is-asset">
                              {currentValue === null ? "Not set" : currencyFormatter.format(currentValue)}
                            </div>
                            <div className="accounts-account-card__balance-meta">
                              <span className="accounts-account-card__balance-pill is-neutral">Tracked</span>
                            </div>
                          </div>
                          <div className="accounts-account-card__investment-meta">
                            <span>Purchase value {purchaseValue === null ? "Not set" : currencyFormatter.format(purchaseValue)}</span>
                            <span>
                              {gainLoss === null
                                ? "Gain/Loss Not set"
                                : `${gainLoss >= 0 ? "Gain" : "Loss"} ${currencyFormatter.format(Math.abs(gainLoss))}`}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </article>
                );
              })
          ) : (
            <div className="empty-state">
              <strong>No investments yet.</strong>
              <p>Create an investment account from the Accounts page to start tracking holdings, time deposits, and fixed income products here.</p>
            </div>
          )}
        </div>
      </section>
    </CloverShell>
  );
}
