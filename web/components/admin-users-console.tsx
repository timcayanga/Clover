"use client";

import { useEffect, useMemo, useState } from "react";
import { formatCurrencyAmount } from "@/lib/currency-format";
import type { AdminUserListItem, AdminUserListResponse, AdminUserOverview, AdminUserUpdateInput } from "@/lib/admin-users";
import type { AdminErrorLogListResponse } from "@/lib/admin-error-logs";

type AdminUserDraft = {
  firstName: string;
  lastName: string;
  email: string;
  planTier: "free" | "pro";
  accountLimit: string;
  monthlyUploadLimit: string;
  transactionLimit: string;
};

type DraftMap = Record<string, AdminUserDraft>;

const USERS_PAGE_SIZE = 100;

const EMPTY_DRAFT: AdminUserDraft = {
  firstName: "",
  lastName: "",
  email: "",
  planTier: "free",
  accountLimit: "",
  monthlyUploadLimit: "",
  transactionLimit: "",
};

const EMPTY_OVERVIEW: AdminUserOverview = {
  totalUsers: 0,
  proUsers: 0,
  verifiedUsers: 0,
  lockedUsers: 0,
  totalWorkspaces: 0,
  totalBankAccounts: 0,
  totalTransactionCount: 0,
  totalTransactionVolume: "0",
  totalInvestmentAccounts: 0,
  totalInvestmentValue: "0",
  monthlyUploads: 0,
  failedImports: 0,
  productionErrors7d: 0,
  engagedUsers30d: 0,
  activeUsers7d: 0,
  activeUsersPrev7d: 0,
  imports7d: 0,
  importsPrev7d: 0,
  errors7dTrend: 0,
  errorsPrev7d: 0,
  signups7d: 0,
  signupsPrev7d: 0,
};

const limitToDraftValue = (value: number | null) => (value === null ? "" : String(value));

const initialDraft = (user: AdminUserListItem): AdminUserDraft => ({
  firstName: user.firstName ?? "",
  lastName: user.lastName ?? "",
  email: user.email,
  planTier: user.planTier,
  accountLimit: limitToDraftValue(user.accountLimit),
  monthlyUploadLimit: limitToDraftValue(user.monthlyUploadLimit),
  transactionLimit: limitToDraftValue(user.transactionLimit),
});

export type AdminUsersConsoleProps = {
  initialData?: AdminUserListResponse;
  initialErrorLogData?: AdminErrorLogListResponse;
};

const emptyResponse = (): AdminUserListResponse => ({
  users: [],
  page: 1,
  pageSize: USERS_PAGE_SIZE,
  totalCount: 0,
  totalPages: 1,
  overview: EMPTY_OVERVIEW,
});

function formatDate(value: string | null) {
  if (!value) {
    return "Not set";
  }

  return new Intl.DateTimeFormat("en-PH", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatMoney(value: string | null) {
  if (!value) {
    return "Not set";
  }

  const amount = Number(value);
  if (!Number.isFinite(amount)) {
    return value;
  }

  return formatCurrencyAmount(amount, "MIXED");
}

function formatTrendValue(current: number, previous: number) {
  const delta = current - previous;
  const percent = previous > 0 ? Math.round((delta / previous) * 100) : null;
  const direction = delta > 0 ? "up" : delta < 0 ? "down" : "flat";

  if (percent === null) {
    return delta === 0 ? "No change" : `${delta > 0 ? "+" : ""}${delta.toLocaleString()}`;
  }

  return `${delta > 0 ? "+" : ""}${percent}% ${direction}`;
}

function parseLimitInput(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const parsed = Number(trimmed);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : undefined;
}

function isDirty(user: AdminUserListItem, draft: AdminUserDraft) {
  return (
    draft.firstName.trim() !== (user.firstName ?? "") ||
    draft.lastName.trim() !== (user.lastName ?? "") ||
    draft.email.trim() !== user.email ||
    draft.planTier !== user.planTier ||
    draft.accountLimit.trim() !== limitToDraftValue(user.accountLimit) ||
    draft.monthlyUploadLimit.trim() !== limitToDraftValue(user.monthlyUploadLimit) ||
    draft.transactionLimit.trim() !== limitToDraftValue(user.transactionLimit)
  );
}

async function patchUser(userId: string, payload: AdminUserUpdateInput) {
  const response = await fetch(`/api/admin/users/${userId}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const result = (await response.json()) as { user?: AdminUserListItem; error?: string };

  if (!response.ok || !result.user) {
    throw new Error(result.error ?? "Unable to update user.");
  }

  return result.user;
}

export function AdminUsersConsole({ initialData, initialErrorLogData }: AdminUsersConsoleProps) {
  const [data, setData] = useState<AdminUserListResponse>(initialData ?? emptyResponse());
  const [errorLogData, setErrorLogData] = useState<AdminErrorLogListResponse>(
    initialErrorLogData ?? {
      logs: [],
      page: 1,
      pageSize: 25,
      totalCount: 0,
      totalPages: 1,
    }
  );
  const [queryInput, setQueryInput] = useState("");
  const [query, setQuery] = useState("");
  const [planFilter, setPlanFilter] = useState<"all" | "free" | "pro">("all");
  const [verifiedFilter, setVerifiedFilter] = useState<"all" | "yes" | "no">("all");
  const [lockedFilter, setLockedFilter] = useState<"all" | "locked" | "unlocked">("all");
  const [savedView, setSavedView] = useState("all");
  const [errorQueryInput, setErrorQueryInput] = useState("");
  const [errorQuery, setErrorQuery] = useState("");
  const [errorPage, setErrorPage] = useState(1);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [errorRefreshNonce, setErrorRefreshNonce] = useState(0);
  const [drafts, setDrafts] = useState<DraftMap>({});
  const [loading, setLoading] = useState(initialData ? false : true);
  const [errorLoading, setErrorLoading] = useState(initialErrorLogData ? false : true);
  const [error, setError] = useState<string | null>(null);
  const [errorLogError, setErrorLogError] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [savingUserId, setSavingUserId] = useState<string | null>(null);
  const [blockingUserId, setBlockingUserId] = useState<string | null>(null);
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setQuery(queryInput.trim());
    }, 300);

    return () => window.clearTimeout(timeout);
  }, [queryInput]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setErrorPage(1);
      setErrorQuery(errorQueryInput.trim());
    }, 300);

    return () => window.clearTimeout(timeout);
  }, [errorQueryInput]);

  useEffect(() => {
    const controller = new AbortController();

    const load = async () => {
      setLoading(true);
      setError(null);

      try {
        const buildParams = (pageNumber: number) => {
          const params = new URLSearchParams({
            page: String(pageNumber),
            pageSize: String(USERS_PAGE_SIZE),
            planTier: planFilter,
            verified: verifiedFilter,
            locked: lockedFilter,
          });

          if (query) {
            params.set("query", query);
          }

          return params;
        };

        const firstResponse = await fetch(`/api/admin/users?${buildParams(1).toString()}`, {
          signal: controller.signal,
        });

        const firstPayload = (await firstResponse.json()) as AdminUserListResponse & { error?: string };

        if (!firstResponse.ok) {
          throw new Error(firstPayload.error ?? "Unable to load users.");
        }

        let allUsers = firstPayload.users;

        if (firstPayload.totalPages > 1) {
          const remainingPages = Array.from({ length: firstPayload.totalPages - 1 }, (_, index) => index + 2);
          const remainingResponses = await Promise.all(
            remainingPages.map(async (pageNumber) => {
              const response = await fetch(`/api/admin/users?${buildParams(pageNumber).toString()}`, {
                signal: controller.signal,
              });

              const payload = (await response.json()) as AdminUserListResponse & { error?: string };

              if (!response.ok) {
                throw new Error(payload.error ?? "Unable to load users.");
              }

              return payload;
            })
          );

          allUsers = [firstPayload, ...remainingResponses].flatMap((payload) => payload.users);
        }

        setData({
          ...firstPayload,
          users: allUsers,
          page: 1,
          pageSize: allUsers.length,
          totalPages: 1,
        });
        setDrafts((current) => {
          const next = { ...current };

          for (const user of allUsers) {
            next[user.id] = next[user.id] && isDirty(user, next[user.id]) ? next[user.id] : initialDraft(user);
          }

          return next;
        });
      } catch (loadError) {
        if (controller.signal.aborted) {
          return;
        }

        setError(loadError instanceof Error ? loadError.message : "Unable to load users.");
        setData(emptyResponse());
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    };

    void load();

    return () => controller.abort();
  }, [query, planFilter, verifiedFilter, lockedFilter, refreshNonce]);

  useEffect(() => {
    const controller = new AbortController();

    const load = async () => {
      setErrorLoading(true);
      setErrorLogError(null);

      try {
        const params = new URLSearchParams({
          page: String(errorPage),
          pageSize: "25",
        });

        if (errorQuery) {
          params.set("query", errorQuery);
        }

        const response = await fetch(`/api/admin/error-logs?${params.toString()}`, {
          signal: controller.signal,
        });

        const payload = (await response.json()) as AdminErrorLogListResponse & { error?: string };

        if (!response.ok) {
          throw new Error(payload.error ?? "Unable to load error logs.");
        }

        setErrorLogData(payload);
      } catch (loadError) {
        if (controller.signal.aborted) {
          return;
        }

        setErrorLogError(loadError instanceof Error ? loadError.message : "Unable to load error logs.");
        setErrorLogData({
          logs: [],
          page: 1,
          pageSize: 25,
          totalCount: 0,
          totalPages: 1,
        });
      } finally {
        if (!controller.signal.aborted) {
          setErrorLoading(false);
        }
      }
    };

    void load();

    return () => controller.abort();
  }, [errorPage, errorQuery, errorRefreshNonce]);

  const updateDraft = (userId: string, patch: Partial<AdminUserDraft>) => {
    setDrafts((current) => ({
      ...current,
      [userId]: {
        ...(current[userId] ?? EMPTY_DRAFT),
        ...patch,
      },
    }));
    setSaveMessage(null);
  };

  const applyUpdatedUser = (updatedUser: AdminUserListItem) => {
    setData((current) => ({
      ...current,
      users: current.users.map((entry) => (entry.id === updatedUser.id ? updatedUser : entry)),
    }));
    setDrafts((current) => ({
      ...current,
      [updatedUser.id]: initialDraft(updatedUser),
    }));
  };

  const saveRow = (user: AdminUserListItem) => {
    const draft = drafts[user.id] ?? initialDraft(user);
    const accountLimit = parseLimitInput(draft.accountLimit);
    const monthlyUploadLimit = parseLimitInput(draft.monthlyUploadLimit);
    const transactionLimit = parseLimitInput(draft.transactionLimit);

    if (accountLimit === undefined || monthlyUploadLimit === undefined || transactionLimit === undefined) {
      setSaveMessage("Limits must be whole numbers or blank for the plan default.");
      return;
    }

    const payload: AdminUserUpdateInput = {
      firstName: draft.firstName.trim() || null,
      lastName: draft.lastName.trim() || null,
      email: draft.email.trim(),
      planTier: draft.planTier,
      accountLimit,
      monthlyUploadLimit,
      transactionLimit,
    };

    setSavingUserId(user.id);
    setSaveMessage(null);

    void (async () => {
      try {
        const updatedUser = await patchUser(user.id, payload);
        applyUpdatedUser(updatedUser);
        setSaveMessage(`Saved ${updatedUser.fullName || updatedUser.email}.`);
      } catch (saveError) {
        setSaveMessage(saveError instanceof Error ? saveError.message : "Unable to save user.");
      } finally {
        setSavingUserId((current) => (current === user.id ? null : current));
      }
    })();
  };

  const blockUser = (user: AdminUserListItem) => {
    setBlockingUserId(user.id);
    setSaveMessage(null);

    void (async () => {
      try {
        const updatedUser = await patchUser(user.id, { verified: false, planTierLocked: true });
        applyUpdatedUser(updatedUser);
        setSaveMessage(`Blocked ${updatedUser.fullName || updatedUser.email}.`);
      } catch (blockError) {
        setSaveMessage(blockError instanceof Error ? blockError.message : "Unable to block user.");
      } finally {
        setBlockingUserId((current) => (current === user.id ? null : current));
      }
    })();
  };

  const deleteUser = (user: AdminUserListItem) => {
    if (!window.confirm(`Delete ${user.fullName || user.email}? This will mark the user as wiped in Clover.`)) {
      return;
    }

    setDeletingUserId(user.id);
    setSaveMessage(null);

    void (async () => {
      try {
        const updatedUser = await patchUser(user.id, {
          verified: false,
          dataWipedAt: new Date().toISOString(),
        });
        applyUpdatedUser(updatedUser);
        setSaveMessage(`Deleted ${updatedUser.fullName || updatedUser.email}.`);
      } catch (deleteError) {
        setSaveMessage(deleteError instanceof Error ? deleteError.message : "Unable to delete user.");
      } finally {
        setDeletingUserId((current) => (current === user.id ? null : current));
      }
    })();
  };

  const exportUsers = () => {
    const params = new URLSearchParams({
      planTier: planFilter,
      verified: verifiedFilter,
      locked: lockedFilter,
    });

    if (query) {
      params.set("query", query);
    }

    window.location.assign(`/api/admin/users/export?${params.toString()}`);
  };

  const applySavedView = (view: string) => {
    setSavedView(view);

    if (view === "all") {
      setPlanFilter("all");
      setVerifiedFilter("all");
      setLockedFilter("all");
      setQueryInput("");
      return;
    }

    if (view === "unverified") {
      setPlanFilter("all");
      setVerifiedFilter("no");
      setLockedFilter("all");
      setQueryInput("");
      return;
    }

    if (view === "locked-pro") {
      setPlanFilter("pro");
      setVerifiedFilter("all");
      setLockedFilter("locked");
      setQueryInput("");
      return;
    }

    if (view === "attention") {
      setPlanFilter("all");
      setVerifiedFilter("all");
      setLockedFilter("all");
      setQueryInput("");
      return;
    }

    if (view === "active-pro") {
      setPlanFilter("pro");
      setVerifiedFilter("yes");
      setLockedFilter("all");
      setQueryInput("");
    }
  };

  const visibleUsers = useMemo(() => {
    if (savedView === "attention") {
      return data.users.filter((user) => user.attentionLevel !== "low");
    }

    return data.users;
  }, [data.users, savedView]);

  return (
    <section className="admin-users">
      <div className="admin-users__hero table-panel">
        <div className="panel-header">
          <div className="admin-users__hero-copy">
            <p className="eyebrow">Internal admin</p>
            <h2>Command center</h2>
            <p className="panel-muted">
              A compact user directory for plan edits, limits, and quick account actions.
            </p>
          </div>
          <div className="admin-users__stats">
            <div className="admin-users__stat">
              <strong>{data.overview.totalUsers}</strong>
              <span>Real users</span>
            </div>
            <div className="admin-users__stat">
              <strong>{data.overview.proUsers}</strong>
              <span>Pro users</span>
            </div>
            <div className="admin-users__stat">
              <strong>{data.overview.verifiedUsers}</strong>
              <span>Verified</span>
            </div>
            <div className="admin-users__stat">
              <strong>{data.overview.totalTransactionCount.toLocaleString()}</strong>
              <span>Transactions</span>
            </div>
            <div className="admin-users__stat">
              <strong>{formatMoney(data.overview.totalTransactionVolume)}</strong>
              <span>Tx volume</span>
            </div>
            <div className="admin-users__stat">
              <strong>{data.overview.productionErrors7d.toLocaleString()}</strong>
              <span>Current deploy errors</span>
            </div>
          </div>
        </div>

        <div className="admin-users__trend-grid">
          <div className="admin-users__trend-card">
            <span>Active users</span>
            <strong>{data.overview.activeUsers7d.toLocaleString()}</strong>
            <small>{formatTrendValue(data.overview.activeUsers7d, data.overview.activeUsersPrev7d)} vs previous 7d</small>
          </div>
          <div className="admin-users__trend-card">
            <span>Imports</span>
            <strong>{data.overview.imports7d.toLocaleString()}</strong>
            <small>{formatTrendValue(data.overview.imports7d, data.overview.importsPrev7d)} vs previous 7d</small>
          </div>
          <div className="admin-users__trend-card">
            <span>Current deploy errors</span>
            <strong>{data.overview.productionErrors7d.toLocaleString()}</strong>
            <small>{formatTrendValue(data.overview.productionErrors7d, data.overview.errorsPrev7d)} vs previous 7d</small>
          </div>
          <div className="admin-users__trend-card">
            <span>New signups</span>
            <strong>{data.overview.signups7d.toLocaleString()}</strong>
            <small>{formatTrendValue(data.overview.signups7d, data.overview.signupsPrev7d)} vs previous 7d</small>
          </div>
        </div>

        <div className="admin-users__toolbar">
          <label className="admin-users__search">
            <span className="sr-only">Search users</span>
            <input
              type="search"
              placeholder="Search by name, email, or Clerk ID"
              value={queryInput}
              onChange={(event) => {
                setSavedView("custom");
                setQueryInput(event.target.value);
              }}
            />
          </label>
          <select className="admin-users__inline-select" value={savedView} onChange={(event) => applySavedView(event.target.value)}>
            <option value="all">Saved views</option>
            <option value="custom">Custom filters</option>
            <option value="attention">Attention review</option>
            <option value="unverified">Unverified users</option>
            <option value="locked-pro">Locked Pro users</option>
            <option value="active-pro">Active Pro users</option>
          </select>
          <select
            className="admin-users__inline-select"
            value={planFilter}
            onChange={(event) => {
              setSavedView("custom");
              setPlanFilter(event.target.value as "all" | "free" | "pro");
            }}
          >
            <option value="all">All plans</option>
            <option value="free">Free</option>
            <option value="pro">Pro</option>
          </select>
          <select
            className="admin-users__inline-select"
            value={verifiedFilter}
            onChange={(event) => {
              setSavedView("custom");
              setVerifiedFilter(event.target.value as "all" | "yes" | "no");
            }}
          >
            <option value="all">All verified</option>
            <option value="yes">Verified</option>
            <option value="no">Unverified</option>
          </select>
          <select
            className="admin-users__inline-select"
            value={lockedFilter}
            onChange={(event) => {
              setSavedView("custom");
              setLockedFilter(event.target.value as "all" | "locked" | "unlocked");
            }}
          >
            <option value="all">All tier states</option>
            <option value="locked">Locked</option>
            <option value="unlocked">Billing synced</option>
          </select>
          <button className="button button-secondary" type="button" onClick={exportUsers}>
            Export CSV
          </button>
          <button className="button button-secondary" type="button" onClick={() => setRefreshNonce((value) => value + 1)}>
            Refresh
          </button>
        </div>
      </div>

      {error ? <div className="admin-users__notice admin-users__notice--error">{error}</div> : null}
      {saveMessage ? <div className="admin-users__notice">{saveMessage}</div> : null}

      <article className="table-panel admin-users__table-panel">
        <div className="admin-users__table-head">
          <div>
            <p className="eyebrow">Directory</p>
            <h3>All users</h3>
          </div>
          <p className="panel-muted">
            Showing {visibleUsers.length} of {data.totalCount}
          </p>
        </div>

        {loading ? <div className="admin-users__loading" role="status">Loading users...</div> : null}

        {!loading && visibleUsers.length === 0 ? (
          <div className="empty-state">
            <strong>No users found.</strong>
            <p>Try a different search term or clear the filter to see the full list.</p>
          </div>
        ) : null}

        {!loading && visibleUsers.length > 0 ? (
          <div className="admin-users__table-wrap admin-users__directory-wrap">
            <table className="admin-users__table admin-users__directory-table">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Plan</th>
                  <th>Limits</th>
                  <th>Status</th>
                  <th>Usage</th>
                  <th>Activity</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {visibleUsers.map((user) => {
                  const draft = drafts[user.id] ?? initialDraft(user);
                  const dirty = isDirty(user, draft);
                  const saving = savingUserId === user.id;
                  const blocking = blockingUserId === user.id;
                  const deleting = deletingUserId === user.id;
                  const busy = saving || blocking || deleting;

                  return (
                    <tr key={user.id} className={dirty ? "is-dirty" : undefined}>
                      <td className="admin-users__user-cell">
                        <strong>{user.fullName || user.email}</strong>
                        <small className="admin-users__cell-note">{user.email}</small>
                        <small className="admin-users__cell-note admin-users__mono">{user.clerkUserId}</small>
                      </td>
                      <td className="admin-users__plan-cell">
                        <select
                          className="admin-users__inline-select"
                          value={draft.planTier}
                          onChange={(event) => updateDraft(user.id, { planTier: event.target.value as "free" | "pro" })}
                          aria-label={`${user.email} plan tier`}
                        >
                          <option value="free">Free</option>
                          <option value="pro">Pro</option>
                        </select>
                        <small className="admin-users__cell-note">
                          {user.planTierLocked ? "Locked manually" : "Billing synced"} · {user.billingSubscription?.status ?? "No billing row"}
                        </small>
                      </td>
                      <td className="admin-users__limits-cell">
                        <input
                          className="admin-users__inline-input"
                          inputMode="numeric"
                          value={draft.accountLimit}
                          onChange={(event) => updateDraft(user.id, { accountLimit: event.target.value })}
                          aria-label={`${user.email} account limit`}
                          placeholder="Accounts"
                        />
                        <input
                          className="admin-users__inline-input"
                          inputMode="numeric"
                          value={draft.monthlyUploadLimit}
                          onChange={(event) => updateDraft(user.id, { monthlyUploadLimit: event.target.value })}
                          aria-label={`${user.email} upload limit`}
                          placeholder="Uploads"
                        />
                        <input
                          className="admin-users__inline-input"
                          inputMode="numeric"
                          value={draft.transactionLimit}
                          onChange={(event) => updateDraft(user.id, { transactionLimit: event.target.value })}
                          aria-label={`${user.email} transaction limit`}
                          placeholder="Rows"
                        />
                      </td>
                      <td className="admin-users__status-cell">
                        <span className={`admin-users__pill admin-users__pill--${user.planTier}`}>{user.planLabel}</span>
                        <span className={`admin-users__pill ${user.verified ? "admin-users__pill--success" : "admin-users__pill--warn"}`}>
                          {user.verified ? "Verified" : "Blocked"}
                        </span>
                        {user.dataWipedAt ? <span className="admin-users__pill admin-users__pill--locked">Deleted</span> : null}
                        {user.attentionLevel !== "low" ? <small className="admin-users__cell-note">{user.attentionFlags[0] ?? "Needs attention"}</small> : null}
                      </td>
                      <td className="admin-users__usage-cell">
                        <strong>
                          {user.workspaceCount} ws · {user.bankAccountCount} acct
                        </strong>
                        <small className="admin-users__cell-note">
                          {user.transactionCount.toLocaleString()} transactions · {user.monthlyUploads} uploads
                        </small>
                      </td>
                      <td className="admin-users__activity-cell">
                        <strong>{formatDate(user.updatedAt)}</strong>
                        <small className="admin-users__cell-note">
                          Renewal: {formatDate(user.renewalAt)} · Volume: {formatMoney(user.transactionVolume)}
                        </small>
                      </td>
                      <td>
                        <div className="admin-users__row-actions">
                          <button
                            className={`button button-small ${dirty ? "button-primary" : "button-secondary"}`}
                            type="button"
                            onClick={() => saveRow(user)}
                            disabled={busy || !dirty}
                          >
                            {saving ? "Saving..." : "Save"}
                          </button>
                          <button
                            className="button button-secondary button-small"
                            type="button"
                            onClick={() => blockUser(user)}
                            disabled={busy || !user.verified}
                          >
                            {blocking ? "Blocking..." : "Block"}
                          </button>
                          <button
                            className="button button-secondary button-small"
                            type="button"
                            onClick={() => deleteUser(user)}
                            disabled={busy || Boolean(user.dataWipedAt)}
                          >
                            {deleting ? "Deleting..." : "Delete"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}

        <article className="admin-users__errors-panel table-panel">
          <div className="admin-users__table-head">
            <div>
              <p className="eyebrow">Production errors</p>
              <h3>Running error log</h3>
            </div>
            <p className="panel-muted">
              {errorLogData.totalCount} captured error{errorLogData.totalCount === 1 ? "" : "s"}
            </p>
          </div>

          <div className="admin-users__toolbar">
            <label className="admin-users__search">
              <span className="sr-only">Search error logs</span>
              <input
                type="search"
                placeholder="Search message, route, build, or user"
                value={errorQueryInput}
                onChange={(event) => setErrorQueryInput(event.target.value)}
              />
            </label>
            <button className="button button-secondary" type="button" onClick={() => setErrorRefreshNonce((value) => value + 1)}>
              Refresh logs
            </button>
          </div>

          {errorLogError ? <div className="admin-users__notice admin-users__notice--error">{errorLogError}</div> : null}

          {errorLoading ? <div className="admin-users__loading" role="status">Loading error logs...</div> : null}

          {!errorLoading && errorLogData.logs.length === 0 ? (
            <div className="empty-state">
              <strong>No error logs yet.</strong>
              <p>When production errors are captured, they will appear here with time, build, and request context.</p>
            </div>
          ) : null}

          {!errorLoading && errorLogData.logs.length > 0 ? (
            <div className="admin-users__table-wrap">
              <table className="admin-users__table">
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Message</th>
                    <th>Build</th>
                    <th>Env</th>
                    <th>Source</th>
                    <th>Route</th>
                    <th>Status</th>
                    <th>User</th>
                    <th>Workspace</th>
                    <th>Details</th>
                  </tr>
                </thead>
                <tbody>
                  {errorLogData.logs.map((log) => (
                    <tr key={log.id}>
                      <td>
                        <small>{formatDate(log.occurredAt)}</small>
                      </td>
                      <td>
                        <strong>{log.message}</strong>
                        {log.name ? <small className="admin-users__cell-note">{log.name}</small> : null}
                      </td>
                      <td>
                        <strong className="admin-users__mono">{log.buildId}</strong>
                        {log.deploymentId ? <small className="admin-users__mono">{log.deploymentId}</small> : null}
                      </td>
                      <td>{log.environment}</td>
                      <td>{log.source}</td>
                      <td>
                        <strong>{log.route ?? "—"}</strong>
                        {log.method ? <small className="admin-users__cell-note">{log.method}</small> : null}
                      </td>
                      <td>{log.statusCode ?? "—"}</td>
                      <td>{log.userId ?? log.clerkUserId ?? "—"}</td>
                      <td>{log.workspaceId ?? "—"}</td>
                      <td>
                        <details className="admin-users__error-details">
                          <summary>View stack</summary>
                          <pre>{log.stack ?? "No stack captured."}</pre>
                        </details>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}

          <div className="admin-users__pager">
            <button
              className="button button-secondary button-small"
              type="button"
              onClick={() => setErrorPage((value) => Math.max(value - 1, 1))}
              disabled={errorPage <= 1 || errorLoading}
            >
              Previous
            </button>
            <span>
              Page {errorLogData.page} of {errorLogData.totalPages}
            </span>
            <button
              className="button button-secondary button-small"
              type="button"
              onClick={() => setErrorPage((value) => Math.min(value + 1, errorLogData.totalPages))}
              disabled={errorPage >= errorLogData.totalPages || errorLoading}
            >
              Next
            </button>
          </div>
        </article>
      </article>
    </section>
  );
}
