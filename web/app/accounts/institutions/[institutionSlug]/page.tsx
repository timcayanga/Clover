"use client";

import { useEffect, useMemo, useState, type CSSProperties, type FormEvent } from "react";
import { useParams, useRouter } from "next/navigation";
import { CloverShell } from "@/components/clover-shell";
import { CloverLoadingScreen } from "@/components/clover-loading-screen";
import { AccountBrandMark } from "@/components/account-brand-mark";
import { getAccountBrand } from "@/lib/account-brand";
import { extractInvestmentInstitutionFromPathSegment, getAccountPath, getInvestmentInstitutionPath } from "@/lib/account-path";
import { formatCurrencyAmount, formatCurrencyCode } from "@/lib/currency-format";
import {
  getInvestmentFieldConfigs,
  getInvestmentSubtypeLabel,
  INVESTMENT_SUBTYPES,
  type InvestmentSubtype,
} from "@/lib/investments";
import { getCachedAccountsWorkspace, persistAccountsWorkspaceCache, applyOptimisticWorkspaceAccountDeletion } from "@/lib/workspace-cache";
import { readSelectedWorkspaceId } from "@/lib/workspace-selection";

type Account = {
  id: string;
  workspaceId: string;
  name: string;
  institution: string | null;
  accountNumber: string | null;
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

type AssetDraft = {
  name: string;
  investmentSubtype: InvestmentSubtype;
  investmentSymbol: string;
  investmentQuantity: string;
  investmentCostBasis: string;
  investmentPrincipal: string;
  investmentStartDate: string;
  investmentMaturityDate: string;
  investmentInterestRate: string;
  investmentMaturityValue: string;
  balance: string;
};

const parseAmount = (value: string | null | undefined) => Number(value ?? 0);

const formatMoney = (value: number, currency: string) => formatCurrencyAmount(value, currency);

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

  const parsed = new Date(`${trimmed}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
};

const getInstitutionDisplayName = (account: Account) =>
  account.institution?.trim() || account.name.trim() || "Investment institution";

const buildAssetDraft = (account: Account): AssetDraft => ({
  name: account.name,
  investmentSubtype: account.investmentSubtype ?? "stock",
  investmentSymbol: account.investmentSymbol ?? "",
  investmentQuantity: account.investmentQuantity ?? "",
  investmentCostBasis: account.investmentCostBasis ?? "",
  investmentPrincipal: account.investmentPrincipal ?? "",
  investmentStartDate: account.investmentStartDate ? account.investmentStartDate.slice(0, 10) : "",
  investmentMaturityDate: account.investmentMaturityDate ? account.investmentMaturityDate.slice(0, 10) : "",
  investmentInterestRate: account.investmentInterestRate ?? "",
  investmentMaturityValue: account.investmentMaturityValue ?? "",
  balance: account.balance ?? "",
});

const syncAccountsWorkspaceCache = (workspaceId: string, nextAccounts: Account[]) => {
  const cachedSnapshot = getCachedAccountsWorkspace(workspaceId);
  if (!cachedSnapshot) {
    return;
  }

  persistAccountsWorkspaceCache(workspaceId, {
    accounts: nextAccounts,
    accountRules: cachedSnapshot.accountRules,
    transactions: cachedSnapshot.transactions,
    statementCheckpoints: cachedSnapshot.statementCheckpoints,
  });
};

export default function InvestmentInstitutionDetailPage() {
  const router = useRouter();
  const params = useParams<{ institutionSlug: string }>();
  const workspaceId = readSelectedWorkspaceId() ?? "";
  const { institution: routeInstitution, currency: routeCurrency } = extractInvestmentInstitutionFromPathSegment(
    params?.institutionSlug ?? ""
  );

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [institutionDraft, setInstitutionDraft] = useState(routeInstitution);
  const [savingInstitution, setSavingInstitution] = useState(false);
  const [editingAssetId, setEditingAssetId] = useState<string | null>(null);
  const [assetDraft, setAssetDraft] = useState<AssetDraft | null>(null);
  const [savingAssetId, setSavingAssetId] = useState<string | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deletingInstitution, setDeletingInstitution] = useState(false);

  const matchesInstitution = (account: Account) =>
    account.type === "investment" &&
    formatCurrencyCode(account.currency) === routeCurrency &&
    getInstitutionDisplayName(account).toLowerCase() === routeInstitution.toLowerCase();

  useEffect(() => {
    document.title = `Clover | ${routeInstitution || "Institution"}`;
  }, [routeInstitution]);

  useEffect(() => {
    let cancelled = false;

    const hydrateFromCache = () => {
      if (!workspaceId) {
        return false;
      }

      const cachedSnapshot = getCachedAccountsWorkspace(workspaceId);
      const cachedAccounts = Array.isArray(cachedSnapshot?.accounts) ? (cachedSnapshot?.accounts as Account[]) : [];
      const nextAccounts = cachedAccounts.filter(matchesInstitution);
      if (nextAccounts.length === 0) {
        return false;
      }

      if (!cancelled) {
        setAccounts(nextAccounts);
        setInstitutionDraft(routeInstitution);
        setLoading(false);
      }

      return true;
    };

    const load = async () => {
      if (!workspaceId) {
        if (!cancelled) {
          setLoading(false);
          setMessage("Select a workspace first.");
        }
        return;
      }

      hydrateFromCache();

      try {
        const response = await fetch(`/api/accounts?workspaceId=${encodeURIComponent(workspaceId)}`);
        if (!response.ok) {
          throw new Error("Unable to load this institution.");
        }

        const payload = await response.json();
        const fetchedAccounts = Array.isArray(payload.accounts) ? (payload.accounts as Account[]) : [];
        const nextAccounts = fetchedAccounts.filter(matchesInstitution);

        if (cancelled) {
          return;
        }

        setAccounts(nextAccounts);
        setInstitutionDraft(routeInstitution);
        setLoading(false);
      } catch (error) {
        if (cancelled) {
          return;
        }

        setLoading(false);
        setMessage(error instanceof Error ? error.message : "Unable to load this institution.");
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [routeCurrency, routeInstitution, workspaceId]);

  const totalValue = useMemo(
    () => accounts.reduce((sum, account) => sum + Math.abs(parseAmount(account.balance)), 0),
    [accounts]
  );

  const institutionBrand = useMemo(
    () =>
      getAccountBrand({
        institution: routeInstitution,
        name: routeInstitution,
        type: "investment",
      }),
    [routeInstitution]
  );

  const editingAsset = useMemo(
    () => accounts.find((account) => account.id === editingAssetId) ?? null,
    [accounts, editingAssetId]
  );

  const editingFieldConfigs = useMemo(
    () => getInvestmentFieldConfigs(assetDraft?.investmentSubtype ?? editingAsset?.investmentSubtype ?? "stock"),
    [assetDraft?.investmentSubtype, editingAsset?.investmentSubtype]
  );

  const openAssetEditor = (account: Account) => {
    setEditingAssetId(account.id);
    setAssetDraft(buildAssetDraft(account));
  };

  const saveInstitution = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextInstitution = institutionDraft.trim();
    if (!workspaceId || !nextInstitution || accounts.length === 0) {
      return;
    }

    setSavingInstitution(true);
    try {
      const responses = await Promise.all(
        accounts.map((account) =>
          fetch(`/api/accounts/${account.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              workspaceId,
              institution: nextInstitution,
            }),
          })
        )
      );

      const failed = responses.find((response) => !response.ok);
      if (failed) {
        throw new Error("Unable to update this institution.");
      }

      const updatedAccounts = await Promise.all(responses.map((response) => response.json().then((payload) => payload.account as Account)));
      setAccounts(updatedAccounts);
      syncAccountsWorkspaceCache(workspaceId, [
        ...((getCachedAccountsWorkspace(workspaceId)?.accounts as Account[] | undefined)?.filter((account) => !matchesInstitution(account)) ?? []),
        ...updatedAccounts,
      ]);
      setMessage(`Institution updated to "${nextInstitution}".`);
      router.replace(
        getInvestmentInstitutionPath({
          institution: nextInstitution,
          currency: routeCurrency,
        })
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to update this institution.");
    } finally {
      setSavingInstitution(false);
    }
  };

  const saveAsset = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!workspaceId || !editingAsset || !assetDraft) {
      return;
    }

    setSavingAssetId(editingAsset.id);
    try {
      const response = await fetch(`/api/accounts/${editingAsset.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId,
          name: assetDraft.name.trim(),
          institution: institutionDraft.trim() || routeInstitution,
          investmentSubtype: assetDraft.investmentSubtype,
          investmentSymbol: assetDraft.investmentSymbol.trim() || null,
          investmentQuantity: parseNullableNumberInput(assetDraft.investmentQuantity),
          investmentCostBasis: parseNullableNumberInput(assetDraft.investmentCostBasis),
          investmentPrincipal: parseNullableNumberInput(assetDraft.investmentPrincipal),
          investmentStartDate: parseNullableDateInput(assetDraft.investmentStartDate),
          investmentMaturityDate: parseNullableDateInput(assetDraft.investmentMaturityDate),
          investmentInterestRate: parseNullableNumberInput(assetDraft.investmentInterestRate),
          investmentMaturityValue: parseNullableNumberInput(assetDraft.investmentMaturityValue),
          balance: assetDraft.balance.trim() ? Number(assetDraft.balance) : 0,
          type: "investment",
          currency: routeCurrency,
        }),
      });

      if (!response.ok) {
        throw new Error("Unable to update this asset.");
      }

      const payload = await response.json();
      const updatedAccount = payload.account as Account;
      const nextAccounts = accounts.map((account) => (account.id === updatedAccount.id ? updatedAccount : account));
      setAccounts(nextAccounts);
      syncAccountsWorkspaceCache(workspaceId, [
        ...((getCachedAccountsWorkspace(workspaceId)?.accounts as Account[] | undefined)?.filter((account) => account.id !== updatedAccount.id) ?? []),
        updatedAccount,
      ]);
      setEditingAssetId(null);
      setAssetDraft(null);
      setMessage(`Updated ${updatedAccount.name}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to update this asset.");
    } finally {
      setSavingAssetId(null);
    }
  };

  const deleteInstitution = async () => {
    if (!workspaceId || accounts.length === 0) {
      return;
    }

    setDeletingInstitution(true);
    try {
      accounts.forEach((account) => applyOptimisticWorkspaceAccountDeletion(workspaceId, account.id));
      const responses = await Promise.all(
        accounts.map((account) =>
          fetch(`/api/accounts/${account.id}`, {
            method: "DELETE",
          })
        )
      );
      const failed = responses.find((response) => !response.ok);
      if (failed) {
        throw new Error("Unable to delete this institution.");
      }
      router.replace("/accounts");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to delete this institution.");
      setDeletingInstitution(false);
    }
  };

  if (loading) {
    return <CloverLoadingScreen label="institution" />;
  }

  return (
    <CloverShell active="accounts" title={routeInstitution || "Institution"} hideCompactBarCopyOnMobile>
      <div className="institution-detail-page">
        <section
          className="institution-detail-hero glass"
          style={
            {
              ["--institution-accent" as string]: institutionBrand.accent,
              ["--institution-accent-soft" as string]: institutionBrand.background,
            } as CSSProperties
          }
        >
          <div className="institution-detail-hero__head">
            <div className="institution-detail-hero__brand">
              <AccountBrandMark accountBrand={institutionBrand} label={routeInstitution} />
              <div>
                <p className="eyebrow">Investment institution</p>
                <h1>{routeInstitution}</h1>
                <span>
                  {accounts.length} asset{accounts.length === 1 ? "" : "s"} · {routeCurrency}
                </span>
              </div>
            </div>
            <button className="button button-secondary button-small" type="button" onClick={() => router.push("/accounts")}>
              Back to Accounts
            </button>
          </div>

          <div className="institution-detail-hero__metrics">
            <article className="institution-detail-metric">
              <span>Total value</span>
              <strong>{formatMoney(totalValue, routeCurrency)}</strong>
            </article>
            <article className="institution-detail-metric">
              <span>Assets</span>
              <strong>{accounts.length}</strong>
            </article>
            <article className="institution-detail-metric">
              <span>Currency</span>
              <strong>{routeCurrency}</strong>
            </article>
          </div>
        </section>

        <section className="institution-detail-panel glass">
          <div className="institution-detail-panel__head">
            <div>
              <p className="eyebrow">Institution</p>
              <h2>Provider details</h2>
            </div>
          </div>
          <form className="institution-detail-form" onSubmit={saveInstitution}>
            <label className="settings-field">
              <span>Institution name</span>
              <input value={institutionDraft} onChange={(event) => setInstitutionDraft(event.target.value)} />
            </label>
            <button className="button button-secondary button-small" type="submit" disabled={savingInstitution}>
              {savingInstitution ? "Saving..." : "Save institution"}
            </button>
          </form>
        </section>

        <section className="institution-detail-panel glass">
          <div className="institution-detail-panel__head">
            <div>
              <p className="eyebrow">Assets</p>
              <h2>Holdings</h2>
            </div>
          </div>

          {accounts.length === 0 ? (
            <p className="institution-detail-empty">No investment assets are linked to this institution in {routeCurrency}.</p>
          ) : (
            <div className="institution-assets-table-wrap">
              <table className="institution-assets-table">
                <thead>
                  <tr>
                    <th>Asset</th>
                    <th>Subtype</th>
                    <th>Reference</th>
                    <th>Units / principal</th>
                    <th>Value</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {accounts.map((account) => (
                    <tr key={account.id}>
                      <td>{account.name}</td>
                      <td>{getInvestmentSubtypeLabel(account.investmentSubtype)}</td>
                      <td>{account.investmentSymbol || "Not set"}</td>
                      <td>{account.investmentQuantity || account.investmentPrincipal || "Not set"}</td>
                      <td>{formatMoney(Math.abs(parseAmount(account.balance)), account.currency)}</td>
                      <td className="institution-assets-table__actions">
                        <button className="button button-secondary button-small" type="button" onClick={() => openAssetEditor(account)}>
                          Edit
                        </button>
                        <button className="button button-secondary button-small" type="button" onClick={() => router.push(getAccountPath(account))}>
                          Open asset
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {editingAsset && assetDraft ? (
          <section className="institution-detail-panel glass">
            <div className="institution-detail-panel__head">
              <div>
                <p className="eyebrow">Edit asset</p>
                <h2>{editingAsset.name}</h2>
              </div>
            </div>
            <form className="institution-asset-editor" onSubmit={saveAsset}>
              <label className="settings-field">
                <span>Asset name</span>
                <input
                  value={assetDraft.name}
                  onChange={(event) => setAssetDraft((current) => (current ? { ...current, name: event.target.value } : current))}
                />
              </label>
              <label className="settings-field">
                <span>Subtype</span>
                <select
                  value={assetDraft.investmentSubtype}
                  onChange={(event) =>
                    setAssetDraft((current) =>
                      current ? { ...current, investmentSubtype: event.target.value as InvestmentSubtype } : current
                    )
                  }
                >
                  {INVESTMENT_SUBTYPES.map((subtype) => (
                    <option key={subtype} value={subtype}>
                      {getInvestmentSubtypeLabel(subtype)}
                    </option>
                  ))}
                </select>
              </label>

              <div className="institution-asset-editor__grid">
                {editingFieldConfigs.map((field) => (
                  <label key={field.key} className="settings-field">
                    <span>{field.label}</span>
                    <input
                      type={field.type === "date" ? "date" : "text"}
                      inputMode={field.inputMode === "decimal" ? "decimal" : undefined}
                      placeholder={field.placeholder}
                      value={assetDraft[field.key as keyof AssetDraft] as string}
                      onChange={(event) =>
                        setAssetDraft((current) =>
                          current ? { ...current, [field.key]: event.target.value } : current
                        )
                      }
                    />
                  </label>
                ))}

                <label className="settings-field">
                  <span>Current value</span>
                  <input
                    inputMode="decimal"
                    value={assetDraft.balance}
                    onChange={(event) => setAssetDraft((current) => (current ? { ...current, balance: event.target.value } : current))}
                  />
                </label>
              </div>

              <div className="institution-asset-editor__actions">
                <button className="button button-secondary button-small" type="button" onClick={() => {
                  setEditingAssetId(null);
                  setAssetDraft(null);
                }}>
                  Cancel
                </button>
                <button className="button button-primary button-small" type="submit" disabled={savingAssetId === editingAsset.id}>
                  {savingAssetId === editingAsset.id ? "Saving..." : "Save asset"}
                </button>
              </div>
            </form>
          </section>
        ) : null}

        <section className="institution-detail-panel glass institution-detail-panel--danger">
          <div className="institution-detail-panel__head">
            <div>
              <p className="eyebrow">Delete institution</p>
              <h2>Remove {routeInstitution}</h2>
            </div>
          </div>
          <p className="institution-detail-delete-copy">
            This will remove the institution and all of its linked investment assets in {routeCurrency}.
          </p>
          {deleteConfirmOpen ? (
            <div className="delete-confirm-card">
              <p>Delete <strong>{routeInstitution}</strong> and all {accounts.length} linked asset{accounts.length === 1 ? "" : "s"}?</p>
              <div className="delete-confirm-card__actions">
                <button className="button button-secondary button-small" type="button" onClick={() => setDeleteConfirmOpen(false)}>
                  Cancel
                </button>
                <button className="button button-danger button-small" type="button" onClick={() => void deleteInstitution()} disabled={deletingInstitution}>
                  {deletingInstitution ? "Deleting..." : "Delete institution"}
                </button>
              </div>
            </div>
          ) : (
            <button className="button button-danger button-small" type="button" onClick={() => setDeleteConfirmOpen(true)}>
              Delete institution
            </button>
          )}
        </section>

        {message ? <p className="page-message">{message}</p> : null}
      </div>
    </CloverShell>
  );
}
