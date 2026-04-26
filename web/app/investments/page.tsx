"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { CloverLoadingScreen } from "@/components/clover-loading-screen";
import { CloverShell } from "@/components/clover-shell";
import { AccountBrandMark } from "@/components/account-brand-mark";
import { getAccountBrand } from "@/lib/account-brand";
import {
  chooseWorkspaceId,
  persistSelectedWorkspaceId,
  readSelectedWorkspaceId,
} from "@/lib/workspace-selection";
import { getCachedAccountsWorkspace } from "@/lib/workspace-cache";
import {
  getInvestmentFieldConfigs,
  getInvestmentSubtypeDescription,
  getInvestmentSubtypeLabel,
  INVESTMENT_SUBTYPES,
  isFixedIncomeInvestmentSubtype,
  isMarketInvestmentSubtype,
  type InvestmentSubtype,
} from "@/lib/investments";

type Workspace = {
  id: string;
  name: string;
  type: string;
};

type Account = {
  id: string;
  name: string;
  institution: string | null;
  investmentSubtype: InvestmentSubtype | null;
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

const parseNullableNumberInput = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
};

const parseNullableDateInput = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
};

const formatDate = (value: string) =>
  new Date(value).toLocaleDateString("en-PH", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

const formatInvestmentFieldValue = (field: { key: string; inputMode?: "text" | "decimal"; type?: "text" | "date" }, value: string) => {
  if (!value) {
    return "Not set";
  }

  if (field.type === "date") {
    return formatDate(value);
  }

  return value;
};

const getInvestmentHighlights = (account: Account) => {
  const subtype = account.investmentSubtype;

  if (isMarketInvestmentSubtype(subtype)) {
    return [
      account.investmentSymbol ? `Symbol ${account.investmentSymbol}` : "Symbol not set",
      account.investmentQuantity ? `Units ${account.investmentQuantity}` : "Units not set",
    ];
  }

  if (isFixedIncomeInvestmentSubtype(subtype)) {
    return [
      account.investmentPrincipal ? `Principal ${currencyFormatter.format(parseAmount(account.investmentPrincipal))}` : "Principal not set",
      account.investmentMaturityDate ? `Maturity ${formatDate(account.investmentMaturityDate)}` : "Maturity date not set",
    ];
  }

  return [
    account.investmentSymbol ? `Reference ${account.investmentSymbol}` : "Reference not set",
    account.investmentCostBasis ? `Purchase value ${currencyFormatter.format(parseAmount(account.investmentCostBasis))}` : "Purchase value not set",
  ];
};

type InvestmentGroup = {
  key: string;
  subtype: InvestmentSubtype | null;
  label: string;
  description: string;
  accounts: Account[];
  currentValue: number;
  purchaseValue: number;
  gainLoss: number;
};

export default function InvestmentsPage() {
  const initialWorkspaceId = readSelectedWorkspaceId();
  const initialCachedWorkspace = getCachedAccountsWorkspace(initialWorkspaceId);

  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState(initialWorkspaceId);
  const [accounts, setAccounts] = useState<Account[]>(() => (initialCachedWorkspace?.accounts as Account[]) ?? []);
  const [loading, setLoading] = useState(!initialCachedWorkspace);
  const [hasLoaded, setHasLoaded] = useState(Boolean(initialCachedWorkspace));
  const [message, setMessage] = useState("Select a workspace to review investments.");
  const [addOpen, setAddOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [manualName, setManualName] = useState("");
  const [manualInstitution, setManualInstitution] = useState("");
  const [manualInvestmentSubtype, setManualInvestmentSubtype] = useState<InvestmentSubtype>("stock");
  const [manualInvestmentSymbol, setManualInvestmentSymbol] = useState("");
  const [manualInvestmentQuantity, setManualInvestmentQuantity] = useState("");
  const [manualInvestmentCostBasis, setManualInvestmentCostBasis] = useState("");
  const [manualInvestmentPrincipal, setManualInvestmentPrincipal] = useState("");
  const [manualInvestmentStartDate, setManualInvestmentStartDate] = useState("");
  const [manualInvestmentMaturityDate, setManualInvestmentMaturityDate] = useState("");
  const [manualInvestmentInterestRate, setManualInvestmentInterestRate] = useState("");
  const [manualInvestmentMaturityValue, setManualInvestmentMaturityValue] = useState("");
  const [manualBalance, setManualBalance] = useState("");

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

  const selectedWorkspace = useMemo(
    () => workspaces.find((workspace) => workspace.id === selectedWorkspaceId) ?? null,
    [selectedWorkspaceId, workspaces]
  );

  const investmentAccounts = useMemo(
    () => accounts.filter((account) => account.type === "investment"),
    [accounts]
  );

  const totals = useMemo(() => {
    return investmentAccounts.reduce(
      (accumulator, account) => {
        const currentValue = parseNullableAmount(account.balance);
        const purchaseValue = parseNullableAmount(account.investmentCostBasis ?? account.investmentPrincipal);
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

  const investmentGroups = useMemo<InvestmentGroup[]>(() => {
    const groupMap = new Map<string, Account[]>();

    for (const account of investmentAccounts) {
      const key = account.investmentSubtype ?? "__unclassified__";
      const bucket = groupMap.get(key) ?? [];
      bucket.push(account);
      groupMap.set(key, bucket);
    }

    const orderedKeys = [...INVESTMENT_SUBTYPES, null].map((subtype) => subtype ?? "__unclassified__");

    return orderedKeys
      .map((key) => {
        const rows = groupMap.get(key) ?? [];
        if (rows.length === 0) {
          return null;
        }

        const subtype = key === "__unclassified__" ? null : (key as InvestmentSubtype);
        const currentValue = rows.reduce((sum, account) => sum + parseAmount(account.balance), 0);
        const purchaseValue = rows.reduce((sum, account) => {
          const baseValue = parseNullableAmount(account.investmentCostBasis ?? account.investmentPrincipal);
          return sum + (baseValue ?? 0);
        }, 0);
        const gainLoss = rows.reduce((sum, account) => {
          const current = parseNullableAmount(account.balance);
          const purchase = parseNullableAmount(account.investmentCostBasis ?? account.investmentPrincipal);
          if (current === null || purchase === null) {
            return sum;
          }

          return sum + (current - purchase);
        }, 0);

        return {
          key,
          subtype,
          label: subtype ? getInvestmentSubtypeLabel(subtype) : "Unclassified investments",
          description:
            subtype === null
              ? "Add a subtype later to unlock tailored tracking."
              : getInvestmentSubtypeDescription(subtype),
          accounts: rows.slice().sort((left, right) => parseAmount(right.balance) - parseAmount(left.balance)),
          currentValue,
          purchaseValue,
          gainLoss,
        };
      })
      .filter((group): group is InvestmentGroup => group !== null);
  }, [investmentAccounts]);

  const manualInvestmentFieldConfigs = useMemo(
    () => getInvestmentFieldConfigs(manualInvestmentSubtype),
    [manualInvestmentSubtype]
  );

  const manualAccountBrand = useMemo(
    () =>
      getAccountBrand({
        institution: manualInstitution,
        name: manualName,
        type: "investment",
      }),
    [manualInstitution, manualName]
  );

  const getManualInvestmentFieldValue = (key: string) => {
    if (key === "investmentSymbol") return manualInvestmentSymbol;
    if (key === "investmentQuantity") return manualInvestmentQuantity;
    if (key === "investmentCostBasis") return manualInvestmentCostBasis;
    if (key === "investmentPrincipal") return manualInvestmentPrincipal;
    if (key === "investmentStartDate") return manualInvestmentStartDate;
    if (key === "investmentMaturityDate") return manualInvestmentMaturityDate;
    if (key === "investmentInterestRate") return manualInvestmentInterestRate;
    if (key === "investmentMaturityValue") return manualInvestmentMaturityValue;
    return "";
  };

  const createManualInvestment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedWorkspaceId) {
      setMessage("Select a workspace first.");
      return;
    }

    const name = manualName.trim();
    if (!name) {
      setMessage("Investment name is required.");
      return;
    }

    setIsSaving(true);
    try {
      const manualIsMarket = isMarketInvestmentSubtype(manualInvestmentSubtype);
      const manualIsFixedIncome = isFixedIncomeInvestmentSubtype(manualInvestmentSubtype);
      const response = await fetch("/api/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId: selectedWorkspaceId,
          name,
          institution: manualInstitution.trim() || null,
          investmentSubtype: manualInvestmentSubtype,
          investmentSymbol:
            manualIsMarket || manualInvestmentSubtype === "other" ? manualInvestmentSymbol.trim() || null : null,
          investmentQuantity: manualIsMarket ? parseNullableNumberInput(manualInvestmentQuantity) : null,
          investmentCostBasis:
            manualIsMarket || manualInvestmentSubtype === "other"
              ? parseNullableNumberInput(manualInvestmentCostBasis)
              : null,
          investmentPrincipal: manualIsFixedIncome ? parseNullableNumberInput(manualInvestmentPrincipal) : null,
          investmentStartDate: manualIsFixedIncome ? parseNullableDateInput(manualInvestmentStartDate) : null,
          investmentMaturityDate: manualIsFixedIncome ? parseNullableDateInput(manualInvestmentMaturityDate) : null,
          investmentInterestRate: manualIsFixedIncome ? parseNullableNumberInput(manualInvestmentInterestRate) : null,
          investmentMaturityValue: manualIsFixedIncome ? parseNullableNumberInput(manualInvestmentMaturityValue) : null,
          type: "investment",
          currency: "PHP",
          source: "manual",
          balance: manualBalance ? Number(manualBalance) : 0,
        }),
      });

      if (!response.ok) {
        throw new Error("Unable to create investment.");
      }

      const payload = await response.json();
      if (payload.account) {
        setAccounts((current) => [payload.account as Account, ...current]);
      }

      setManualName("");
      setManualInstitution("");
      setManualInvestmentSubtype("stock");
      setManualInvestmentSymbol("");
      setManualInvestmentQuantity("");
      setManualInvestmentCostBasis("");
      setManualInvestmentPrincipal("");
      setManualInvestmentStartDate("");
      setManualInvestmentMaturityDate("");
      setManualInvestmentInterestRate("");
      setManualInvestmentMaturityValue("");
      setManualBalance("");
      setAddOpen(false);
      setMessage(`Investment "${name}" created.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to create investment.");
    } finally {
      setIsSaving(false);
    }
  };

  const addInvestmentActions = (
    <>
      <button
        className="button button-primary button-small"
        type="button"
        onClick={() => setAddOpen(true)}
        disabled={!selectedWorkspaceId}
      >
        Add investment
      </button>
      <Link className="button button-secondary button-small" href="/accounts">
        View accounts
      </Link>
    </>
  );

  if (!hasLoaded) {
    return <CloverLoadingScreen label="investments" />;
  }

  return (
    <CloverShell
      active="investments"
      title="Investments"
      kicker="Investments"
      subtitle="Create market holdings, time deposits, and bonds here. Investment accounts added anywhere in Accounts will also appear here automatically."
      actions={addInvestmentActions}
    >
      <div className="accounts-page">
        <section className="accounts-overview-grid">
          <article className="accounts-overview-card glass">
            <p className="eyebrow">Current value</p>
            <strong>{currencyFormatter.format(totals.currentValue)}</strong>
            <span>Estimated value across every investment account</span>
          </article>
          <article className="accounts-overview-card glass">
            <p className="eyebrow">Purchase value</p>
            <strong>{currencyFormatter.format(totals.purchaseValue)}</strong>
            <span>Cost basis or principal where available</span>
          </article>
          <article className="accounts-overview-card glass">
            <p className="eyebrow">Gain / loss</p>
            <strong>{currencyFormatter.format(totals.gainLoss)}</strong>
            <span>Current value minus purchase value</span>
          </article>
          <article className="accounts-overview-card glass">
            <p className="eyebrow">Holdings</p>
            <strong>{investmentAccounts.length}</strong>
            <span>Investment accounts in this workspace</span>
          </article>
        </section>

        <div className="panel-muted" style={{ marginTop: 16 }}>
          {selectedWorkspace
            ? `${selectedWorkspace.name} is selected. Investments created from the Accounts page and investments added here are centralized in the same list.`
            : "Select a workspace to review investments."}
        </div>

        {loading ? <p className="panel-muted" style={{ marginTop: 12 }}>{message}</p> : null}
        {!loading && message !== "Select a workspace to review investments." ? (
          <p className="panel-muted" style={{ marginTop: 12 }}>{message}</p>
        ) : null}

        <section className="accounts-sections" style={{ marginTop: 20 }}>
          {investmentGroups.length > 0 ? (
            investmentGroups.map((group) => (
              <article key={group.key} className="accounts-group glass">
                <div className="accounts-group__head">
                  <div>
                    <h5>{group.label}</h5>
                    <p>
                      {group.accounts.length} account{group.accounts.length === 1 ? "" : "s"} ·{" "}
                      {currencyFormatter.format(group.currentValue)}
                    </p>
                  </div>
                  <span className="accounts-group__tone accounts-group__tone--neutral">{group.description}</span>
                </div>

                <div className="accounts-card-grid">
                  {group.accounts.map((account) => {
                    const accountBrand = getAccountBrand({
                      institution: account.institution ?? null,
                      name: account.name,
                      type: account.type,
                    });
                    const currentValue = parseNullableAmount(account.balance);
                    const purchaseValue = parseNullableAmount(account.investmentCostBasis ?? account.investmentPrincipal);
                    const gainLoss =
                      currentValue === null || purchaseValue === null ? null : currentValue - purchaseValue;
                    const highlights = getInvestmentHighlights(account);

                    return (
                      <article key={account.id} className="accounts-account-card glass">
                        <div className="accounts-account-card__head">
                          <div className="accounts-account-card__brand">
                            <AccountBrandMark accountBrand={accountBrand} label={account.name} />
                            <div>
                              <strong>{account.name}</strong>
                              <span>
                                {accountBrand.label}
                                {account.institution && account.institution !== accountBrand.label ? ` · ${account.institution}` : ""}
                              </span>
                            </div>
                          </div>
                          <Link className="button button-secondary button-small" href={`/accounts/${account.id}`}>
                            Open account
                          </Link>
                        </div>

                        <div className="accounts-account-card__body">
                          <div className="accounts-account-card__balance-row">
                            <div className="accounts-account-card__amount is-asset">
                              {currentValue === null ? "Not set" : currencyFormatter.format(currentValue)}
                            </div>
                            <div className="accounts-account-card__balance-meta">
                              <span className="accounts-account-card__balance-pill is-neutral">
                                {account.investmentSubtype ? getInvestmentSubtypeLabel(account.investmentSubtype) : "Unclassified"}
                              </span>
                            </div>
                          </div>

                          <div className="accounts-account-card__investment-meta">
                            <span>
                              {purchaseValue === null
                                ? "Purchase value not set"
                                : `${account.investmentCostBasis ? "Purchase value" : "Principal"} ${currencyFormatter.format(purchaseValue)}`}
                            </span>
                            <span>
                              {gainLoss === null
                                ? "Gain/Loss not set"
                                : `${gainLoss >= 0 ? "Gain" : "Loss"} ${currencyFormatter.format(Math.abs(gainLoss))}`}
                            </span>
                          </div>

                          <div className="accounts-account-card__investment-meta">
                            <span>{highlights[0]}</span>
                            <span>{highlights[1]}</span>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </article>
            ))
          ) : (
            <div className="empty-state">
              <strong>No investments yet.</strong>
              <p>
                Add an investment here, or create an Investment account from Accounts. Every account with type
                <code>investment</code> will show up on this page automatically.
              </p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 16 }}>
                <button className="button button-primary button-small" type="button" onClick={() => setAddOpen(true)} disabled={!selectedWorkspaceId}>
                  Add investment
                </button>
                <Link className="button button-secondary button-small" href="/accounts">
                  Open Accounts
                </Link>
              </div>
            </div>
          )}
        </section>
      </div>

      {addOpen ? (
        <div className="modal-backdrop" role="presentation" onClick={() => setAddOpen(false)}>
          <section
            className="modal-card modal-card--wide accounts-add-modal glass"
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-investment-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-head">
              <div>
                <p className="eyebrow">Investments</p>
                <h4 id="add-investment-title">Add an investment</h4>
                <p className="modal-copy">
                  Track a market holding, fixed income product, or another investment account in one place.
                </p>
              </div>
              <button className="icon-button" type="button" onClick={() => setAddOpen(false)} aria-label="Close add investment">
                ×
              </button>
            </div>

            <div className="accounts-add-grid">
              <form className="accounts-manual-form" onSubmit={createManualInvestment}>
                <label>
                  Name
                  <input value={manualName} onChange={(event) => setManualName(event.target.value)} placeholder="Example: COL UITF Growth Fund" />
                </label>
                <label>
                  Institution
                  <input
                    value={manualInstitution}
                    onChange={(event) => setManualInstitution(event.target.value)}
                    placeholder="Example: COL Financial"
                  />
                </label>
                <label>
                  Investment subtype
                  <select value={manualInvestmentSubtype} onChange={(event) => setManualInvestmentSubtype(event.target.value as InvestmentSubtype)}>
                    {INVESTMENT_SUBTYPES.map((subtype) => (
                      <option key={subtype} value={subtype}>
                        {getInvestmentSubtypeLabel(subtype)}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Current value / balance
                  <input
                    value={manualBalance}
                    onChange={(event) => setManualBalance(event.target.value)}
                    inputMode="decimal"
                    placeholder="0.00"
                  />
                </label>

                {manualInvestmentSubtype ? (
                  <div className="accounts-investment-fields">
                    {manualInvestmentFieldConfigs.map((field) => {
                      const value = getManualInvestmentFieldValue(field.key);
                      const onChange =
                        field.key === "investmentSymbol"
                          ? setManualInvestmentSymbol
                          : field.key === "investmentQuantity"
                            ? setManualInvestmentQuantity
                            : field.key === "investmentCostBasis"
                              ? setManualInvestmentCostBasis
                              : field.key === "investmentPrincipal"
                                ? setManualInvestmentPrincipal
                                : field.key === "investmentStartDate"
                                  ? setManualInvestmentStartDate
                                  : field.key === "investmentMaturityDate"
                                    ? setManualInvestmentMaturityDate
                                    : field.key === "investmentInterestRate"
                                      ? setManualInvestmentInterestRate
                                      : field.key === "investmentMaturityValue"
                                        ? setManualInvestmentMaturityValue
                                        : setManualInvestmentSymbol;

                      return (
                        <label key={field.key}>
                          {field.label}
                          <input
                            value={value}
                            onChange={(event) => onChange(event.target.value)}
                            placeholder={field.placeholder}
                            inputMode={field.inputMode}
                            type={field.type}
                          />
                        </label>
                      );
                    })}
                  </div>
                ) : null}

                <button className="button button-primary" type="submit" disabled={isSaving || !selectedWorkspaceId}>
                  {isSaving ? "Saving..." : "Create investment"}
                </button>
              </form>

              <aside className="accounts-add-preview glass" aria-label="Investment preview">
                <div className="accounts-add-preview__head">
                  <p className="eyebrow">Live preview</p>
                  <AccountBrandMark accountBrand={manualAccountBrand} label={manualName || manualInstitution || "Investment"} />
                </div>
                <strong>{manualName || "Investment name"}</strong>
                <p>
                  {manualAccountBrand.label}
                  {manualInvestmentSubtype ? ` · ${getInvestmentSubtypeLabel(manualInvestmentSubtype)}` : ""}
                  {manualInstitution.trim() ? ` · ${manualInstitution.trim()}` : ""}
                </p>
                <div className="accounts-add-preview__investment">
                  <span>
                    Current value <strong>{manualBalance.trim() || "Not set"}</strong>
                  </span>
                  {manualInvestmentFieldConfigs.map((field) => (
                    <span key={field.key}>
                      {field.label} <strong>{formatInvestmentFieldValue(field, getManualInvestmentFieldValue(field.key).trim())}</strong>
                    </span>
                  ))}
                </div>
                <span>
                  {manualInvestmentSubtype
                    ? getInvestmentSubtypeDescription(manualInvestmentSubtype)
                    : "Choose a subtype to tailor the fields Clover asks for."}
                </span>
              </aside>
            </div>
          </section>
        </div>
      ) : null}
    </CloverShell>
  );
}
