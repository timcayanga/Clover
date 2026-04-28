"use client";

import { useEffect, useMemo, useState } from "react";
import type {
  AdminUserDetail,
  AdminUserListItem,
  AdminUserListResponse,
  AdminUserOverview,
  AdminUserUpdateInput,
} from "@/lib/admin-users";
import type { AdminErrorLogListResponse } from "@/lib/admin-error-logs";

type AdminUserDraft = {
  firstName: string;
  lastName: string;
  email: string;
  planTier: "free" | "pro";
  accountLimit: string;
  monthlyUploadLimit: string;
  transactionLimit: string;
  financialExperience: "beginner" | "comfortable" | "advanced" | "";
  primaryGoal: string;
  goalTargetAmount: string;
  goalTargetSource: string;
  onboardingCompletedAt: string;
  dataWipedAt: string;
};

type DraftMap = Record<string, AdminUserDraft>;

const EMPTY_DRAFT: AdminUserDraft = {
  firstName: "",
  lastName: "",
  email: "",
  planTier: "free",
  accountLimit: "",
  monthlyUploadLimit: "",
  transactionLimit: "",
  financialExperience: "",
  primaryGoal: "",
  goalTargetAmount: "",
  goalTargetSource: "",
  onboardingCompletedAt: "",
  dataWipedAt: "",
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

const initialDraft = (user: AdminUserListItem): AdminUserDraft => ({
  firstName: user.firstName ?? "",
  lastName: user.lastName ?? "",
  email: user.email,
  planTier: user.planTier,
  accountLimit: String(user.accountLimit),
  monthlyUploadLimit: String(user.monthlyUploadLimit),
  transactionLimit: user.transactionLimit === null ? "" : String(user.transactionLimit),
  financialExperience: user.financialExperience ?? "",
  primaryGoal: user.primaryGoal ?? "",
  goalTargetAmount: user.goalTargetAmount ?? "",
  goalTargetSource: user.goalTargetSource ?? "",
  onboardingCompletedAt: toDatetimeLocalValue(user.onboardingCompletedAt),
  dataWipedAt: toDatetimeLocalValue(user.dataWipedAt),
});

const emptyResponse = (): AdminUserListResponse => ({
  users: [],
  page: 1,
  pageSize: 25,
  totalCount: 0,
  totalPages: 1,
  overview: EMPTY_OVERVIEW,
});

const emptyDetail = (): AdminUserDetail => ({
  id: "",
  clerkUserId: "",
  email: "",
  fullName: "",
  planTier: "free",
  planTierLocked: false,
  planLabel: "Free",
  verified: false,
  workspaceCount: 0,
  bankAccountCount: 0,
  transactionCount: 0,
  activeAccountCount: 0,
  investmentAccountCount: 0,
  investmentValue: "0",
  transactionVolume: "0",
  monthlyUploads: 0,
  renewalAt: null,
  createdAt: "",
  updatedAt: "",
  lastActivityAt: null,
  recentErrorCount: 0,
  attentionLevel: "low",
  attentionFlags: [],
  recentTransactions: [],
  recentImports: [],
  recentGoals: [],
  recentErrors: [],
  recentAuditLogs: [],
  workspaces: [],
});

function toDatetimeLocalValue(value: string | null) {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const offsetMinutes = date.getTimezoneOffset();
  const adjusted = new Date(date.getTime() - offsetMinutes * 60_000);
  return adjusted.toISOString().slice(0, 16);
}

function formatDate(value: string | null) {
  if (!value) {
    return "Not set";
  }

  return new Intl.DateTimeFormat("en-PH", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatPlanDate(value: string | null) {
  if (!value) {
    return "Not set";
  }

  return new Intl.DateTimeFormat("en-PH", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatLimitDisplay(value: number | null) {
  return value === null ? "Unlimited" : value.toLocaleString();
}

function parseLimitInput(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const parsed = Number(trimmed);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : undefined;
}

function formatMoney(value: string | null) {
  if (!value) {
    return "Not set";
  }

  const amount = Number(value);
  if (!Number.isFinite(amount)) {
    return value;
  }

  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 2,
  }).format(amount);
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

function attentionTone(level: "low" | "medium" | "high") {
  if (level === "high") {
    return "admin-users__pill--warn";
  }

  if (level === "medium") {
    return "admin-users__pill--sync";
  }

  return "admin-users__pill--success";
}

function normalizeDraft(user: AdminUserListItem): AdminUserDraft {
  return initialDraft(user);
}

function isDirty(user: AdminUserListItem, draft: AdminUserDraft) {
  return (
    draft.firstName.trim() !== (user.firstName ?? "") ||
    draft.lastName.trim() !== (user.lastName ?? "") ||
    draft.email.trim() !== user.email ||
    draft.planTier !== user.planTier ||
    draft.accountLimit.trim() !== String(user.accountLimit) ||
    draft.monthlyUploadLimit.trim() !== String(user.monthlyUploadLimit) ||
    draft.transactionLimit.trim() !== (user.transactionLimit === null ? "" : String(user.transactionLimit)) ||
    draft.financialExperience !== (user.financialExperience ?? "") ||
    draft.primaryGoal.trim() !== (user.primaryGoal ?? "") ||
    draft.goalTargetAmount.trim() !== (user.goalTargetAmount ?? "") ||
    draft.goalTargetSource.trim() !== (user.goalTargetSource ?? "") ||
    draft.onboardingCompletedAt !== toDatetimeLocalValue(user.onboardingCompletedAt) ||
    draft.dataWipedAt !== toDatetimeLocalValue(user.dataWipedAt)
  );
}

export function AdminUsersConsole() {
  const [data, setData] = useState<AdminUserListResponse>(emptyResponse());
  const [errorLogData, setErrorLogData] = useState<AdminErrorLogListResponse>({
    logs: [],
    page: 1,
    pageSize: 25,
    totalCount: 0,
    totalPages: 1,
  });
  const [queryInput, setQueryInput] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
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
  const [loading, setLoading] = useState(true);
  const [errorLoading, setErrorLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [errorLogError, setErrorLogError] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [savingUserId, setSavingUserId] = useState<string | null>(null);
  const [unlockingUserId, setUnlockingUserId] = useState<string | null>(null);
  const [selectedUserIds, setSelectedUserIds] = useState<Record<string, boolean>>({});
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [selectedUser, setSelectedUser] = useState<AdminUserDetail | null>(null);
  const [selectedUserLoading, setSelectedUserLoading] = useState(false);
  const [selectedUserError, setSelectedUserError] = useState<string | null>(null);
  const [reconcilingUserId, setReconcilingUserId] = useState<string | null>(null);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setPage(1);
      setQuery(queryInput.trim());
    }, 300);

    return () => window.clearTimeout(timeout);
  }, [queryInput]);

  useEffect(() => {
    setPage(1);
  }, [planFilter, verifiedFilter, lockedFilter]);

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
        const params = new URLSearchParams({
          page: String(page),
          pageSize: "25",
          planTier: planFilter,
          verified: verifiedFilter,
          locked: lockedFilter,
        });

        if (query) {
          params.set("query", query);
        }

        const response = await fetch(`/api/admin/users?${params.toString()}`, {
          signal: controller.signal,
        });

        const payload = (await response.json()) as AdminUserListResponse & { error?: string };

        if (!response.ok) {
          throw new Error(payload.error ?? "Unable to load users.");
        }

        setData(payload);
        setDrafts((current) => {
          const next = { ...current };

          for (const user of payload.users) {
            if (!next[user.id]) {
              next[user.id] = initialDraft(user);
            }
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
  }, [page, query, planFilter, verifiedFilter, lockedFilter, refreshNonce]);

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

  useEffect(() => {
    if (!selectedUserId) {
      setSelectedUser(null);
      setSelectedUserError(null);
      setSelectedUserLoading(false);
      return;
    }

    const controller = new AbortController();

    const load = async () => {
      setSelectedUserLoading(true);
      setSelectedUserError(null);

      try {
        const response = await fetch(`/api/admin/users/${selectedUserId}/details`, {
          signal: controller.signal,
        });

        const payload = (await response.json()) as { detail?: AdminUserDetail; error?: string };

        if (!response.ok || !payload.detail) {
          throw new Error(payload.error ?? "Unable to load user details.");
        }

        setSelectedUser(payload.detail);
      } catch (loadError) {
        if (controller.signal.aborted) {
          return;
        }

        setSelectedUserError(loadError instanceof Error ? loadError.message : "Unable to load user details.");
        setSelectedUser(null);
      } finally {
        if (!controller.signal.aborted) {
          setSelectedUserLoading(false);
        }
      }
    };

    void load();

    return () => controller.abort();
  }, [selectedUserId, refreshNonce]);

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

  const saveRow = (user: AdminUserListItem) => {
    const draft = drafts[user.id] ?? initialDraft(user);

    const payload: AdminUserUpdateInput = {};
    const firstName = draft.firstName.trim();
    const lastName = draft.lastName.trim();
    const email = draft.email.trim();
    const accountLimit = parseLimitInput(draft.accountLimit);
    const monthlyUploadLimit = parseLimitInput(draft.monthlyUploadLimit);
    const transactionLimit = parseLimitInput(draft.transactionLimit);
    const primaryGoal = draft.primaryGoal.trim();
    const goalTargetSource = draft.goalTargetSource.trim();
    const goalTargetAmount = draft.goalTargetAmount.trim();

    if (accountLimit === undefined || monthlyUploadLimit === undefined || transactionLimit === undefined) {
      setSaveMessage("Limits must be whole numbers or blank for the plan default.");
      return;
    }

    payload.firstName = firstName || null;
    payload.lastName = lastName || null;
    payload.email = email;
    payload.planTier = draft.planTier;
    payload.accountLimit = accountLimit;
    payload.monthlyUploadLimit = monthlyUploadLimit;
    payload.transactionLimit = transactionLimit;
    payload.financialExperience = draft.financialExperience || null;
    payload.primaryGoal = primaryGoal || null;
    payload.goalTargetAmount = goalTargetAmount || null;
    payload.goalTargetSource = goalTargetSource || null;
    payload.onboardingCompletedAt = draft.onboardingCompletedAt || null;
    payload.dataWipedAt = draft.dataWipedAt || null;

    setSavingUserId(user.id);
    setSaveMessage(null);

    void (async () => {
      try {
        const response = await fetch(`/api/admin/users/${user.id}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        });

        const result = (await response.json()) as { user?: AdminUserListItem; error?: string };

        if (!response.ok || !result.user) {
          throw new Error(result.error ?? "Unable to save user.");
        }

        setData((current) => ({
          ...current,
          users: current.users.map((entry) => (entry.id === result.user?.id ? result.user! : entry)),
        }));
        setDrafts((current) => ({
          ...current,
          [result.user!.id]: normalizeDraft(result.user!),
        }));
        setRefreshNonce((value) => value + 1);
        setSaveMessage(`Saved ${result.user.fullName || result.user.email}.`);
      } catch (saveError) {
        setSaveMessage(saveError instanceof Error ? saveError.message : "Unable to save user.");
      } finally {
        setSavingUserId((current) => (current === user.id ? null : current));
      }
    })();
  };

  const unlockTier = (user: AdminUserListItem) => {
    setUnlockingUserId(user.id);
    setSaveMessage(null);

    void (async () => {
      try {
        const response = await fetch(`/api/admin/users/${user.id}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ planTierLocked: false }),
        });

        const result = (await response.json()) as { user?: AdminUserListItem; error?: string };

        if (!response.ok || !result.user) {
          throw new Error(result.error ?? "Unable to unlock tier.");
        }

        setData((current) => ({
          ...current,
          users: current.users.map((entry) => (entry.id === result.user?.id ? result.user! : entry)),
        }));
        setDrafts((current) => ({
          ...current,
          [result.user!.id]: normalizeDraft(result.user!),
        }));
        setRefreshNonce((value) => value + 1);
        setSaveMessage(`Unlocked tier for ${result.user.fullName || result.user.email}.`);
      } catch (unlockError) {
        setSaveMessage(unlockError instanceof Error ? unlockError.message : "Unable to unlock tier.");
      } finally {
        setUnlockingUserId((current) => (current === user.id ? null : current));
      }
    })();
  };

  const reconcileUser = (userId: string) => {
    setReconcilingUserId(userId);
    setSaveMessage(null);

    void (async () => {
      try {
        const response = await fetch(`/api/admin/users/${userId}/reconcile`, {
          method: "POST",
        });

        const result = (await response.json()) as { detail?: AdminUserDetail; error?: string };

        if (!response.ok || !result.detail) {
          throw new Error(result.error ?? "Unable to reconcile user.");
        }

        setRefreshNonce((value) => value + 1);
        if (selectedUserId === userId) {
          setSelectedUser(result.detail);
        }
        setSaveMessage(`Reconciled billing state for ${result.detail.fullName || result.detail.email}.`);
      } catch (reconcileError) {
        setSaveMessage(reconcileError instanceof Error ? reconcileError.message : "Unable to reconcile user.");
      } finally {
        setReconcilingUserId((current) => (current === userId ? null : current));
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

  const openUserDetails = (userId: string) => {
    setSelectedUserIds({});
    setSelectedUserId(userId);
  };

  const clearSelectedUsers = () => {
    setSelectedUserIds({});
  };

  const toggleSelectedUser = (userId: string) => {
    setSelectedUserIds((current) => ({
      ...current,
      [userId]: !current[userId],
    }));
  };

  const selectedUserIdList = Object.entries(selectedUserIds)
    .filter(([, value]) => value)
    .map(([userId]) => userId);

  const updateManyUsers = async (payload: AdminUserUpdateInput) => {
    const targets = selectedUserIdList.length > 0 ? selectedUserIdList : selectedListUser ? [selectedListUser.id] : [];
    if (targets.length === 0) {
      setSaveMessage("Select at least one user first.");
      return;
    }

    setSaveMessage(null);
    try {
      for (const userId of targets) {
        const response = await fetch(`/api/admin/users/${userId}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          const result = (await response.json()) as { error?: string };
          throw new Error(result.error ?? "Unable to update user.");
        }
      }

      setRefreshNonce((value) => value + 1);
      setSaveMessage(`Updated ${targets.length} user${targets.length === 1 ? "" : "s"}.`);
      clearSelectedUsers();
    } catch (updateError) {
      setSaveMessage(updateError instanceof Error ? updateError.message : "Unable to update users.");
    }
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

  const selectVisibleUsers = () => {
    setSelectedUserIds((current) => {
      const next = { ...current };
      for (const user of visibleUsers) {
        next[user.id] = true;
      }
      return next;
    });
  };

  const reconcileSelectedUsers = async () => {
    if (selectedUserIdList.length === 0) {
      setSaveMessage("Select at least one user first.");
      return;
    }

    setSaveMessage(null);
    try {
      for (const userId of selectedUserIdList) {
        const response = await fetch(`/api/admin/users/${userId}/reconcile`, {
          method: "POST",
        });

        if (!response.ok) {
          const result = (await response.json()) as { error?: string };
          throw new Error(result.error ?? "Unable to reconcile user.");
        }
      }

      setRefreshNonce((value) => value + 1);
      setSaveMessage(`Reconciled ${selectedUserIdList.length} user${selectedUserIdList.length === 1 ? "" : "s"}.`);
      clearSelectedUsers();
    } catch (reconcileError) {
      setSaveMessage(reconcileError instanceof Error ? reconcileError.message : "Unable to reconcile users.");
    }
  };

  const revertRow = (user: AdminUserListItem) => {
    setDrafts((current) => ({
      ...current,
      [user.id]: initialDraft(user),
    }));
    setSaveMessage(null);
  };

  const visibleUsers = useMemo(() => {
    if (savedView === "attention") {
      return data.users.filter((user) => user.attentionLevel !== "low");
    }

    return data.users;
  }, [data.users, savedView]);
  const selectedListUser = useMemo(
    () => data.users.find((entry) => entry.id === selectedUserId) ?? null,
    [data.users, selectedUserId]
  );

  return (
    <section className="admin-users">
      <div className="admin-users__hero table-panel">
        <div className="panel-header">
          <div className="admin-users__hero-copy">
            <p className="eyebrow">Internal admin</p>
            <h2>Command center</h2>
            <p className="panel-muted">
              Inline editing for the fields you use most often, with analytics, alerts, and user drill-downs layered around it.
            </p>
          </div>
          <div className="admin-users__stats">
            <div className="admin-users__stat">
              <strong>{data.overview.totalUsers}</strong>
              <span>Users</span>
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
              <strong>{formatMoney(data.overview.totalInvestmentValue)}</strong>
              <span>Investment value</span>
            </div>
            <div className="admin-users__stat">
              <strong>{data.overview.productionErrors7d.toLocaleString()}</strong>
              <span>Prod errors 7d</span>
            </div>
            <div className="admin-users__stat">
              <strong>{data.overview.engagedUsers30d.toLocaleString()}</strong>
              <span>Engaged 30d</span>
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
            <span>Production errors</span>
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
          <button className="button button-secondary" type="button" onClick={selectVisibleUsers}>
            Select page
          </button>
          <button className="button button-secondary" type="button" onClick={clearSelectedUsers}>
            Clear selection
          </button>
          <button className="button button-secondary" type="button" onClick={() => updateManyUsers({ verified: true })}>
            Mark verified
          </button>
          <button className="button button-secondary" type="button" onClick={() => updateManyUsers({ verified: false })}>
            Mark unverified
          </button>
          <button className="button button-secondary" type="button" onClick={() => updateManyUsers({ onboardingCompletedAt: null })}>
            Reset onboarding
          </button>
          <button className="button button-secondary" type="button" onClick={reconcileSelectedUsers}>
            Reconcile billing
          </button>
          <button className="button button-secondary" type="button" onClick={() => setRefreshNonce((value) => value + 1)}>
            Refresh
          </button>
          <span className="panel-muted">
            {selectedUserIdList.length > 0 ? `${selectedUserIdList.length} selected` : "No users selected"}
          </span>
        </div>
      </div>

      {error ? <div className="admin-users__notice admin-users__notice--error">{error}</div> : null}
      {saveMessage ? <div className="admin-users__notice">{saveMessage}</div> : null}

      {selectedUserId ? (
        <article className="table-panel admin-users__detail-panel">
          <div className="admin-users__table-head">
            <div>
              <p className="eyebrow">User drill-down</p>
              <h3>{selectedUser?.fullName || selectedUser?.email || "Loading user..."}</h3>
              <p className="panel-muted">{selectedUser?.email || selectedUserId}</p>
            </div>
            <div className="admin-users__row-actions">
              {selectedUser ? (
                <>
                  <button
                    className="button button-secondary button-small"
                    type="button"
                    onClick={() => reconcileUser(selectedUser.id)}
                    disabled={reconcilingUserId === selectedUser.id}
                  >
                    {reconcilingUserId === selectedUser.id ? "Reconciling..." : "Reconcile billing"}
                  </button>
                  <button
                    className="button button-secondary button-small"
                    type="button"
                    onClick={() => updateManyUsers({ verified: !selectedUser.verified })}
                  >
                    {selectedUser.verified ? "Unverify" : "Verify"}
                  </button>
                  <button
                    className="button button-secondary button-small"
                    type="button"
                    onClick={() => updateManyUsers({ onboardingCompletedAt: null })}
                  >
                    Reset onboarding
                  </button>
                  <button
                    className="button button-secondary button-small"
                    type="button"
                    onClick={() => {
                      if (!selectedListUser) {
                        return;
                      }

                      unlockTier(selectedListUser);
                    }}
                    disabled={!selectedUser?.planTierLocked || unlockingUserId === selectedUser.id}
                  >
                    {unlockingUserId === selectedUser?.id ? "Unlocking..." : "Unlock tier"}
                  </button>
                  <button className="button button-secondary button-small" type="button" onClick={() => setSelectedUserId(null)}>
                    Close
                  </button>
                </>
              ) : null}
            </div>
          </div>

          {selectedUserLoading ? <div className="admin-users__loading" role="status">Loading user details...</div> : null}
          {selectedUserError ? <div className="admin-users__notice admin-users__notice--error">{selectedUserError}</div> : null}

          {selectedUser ? (
            <div className="admin-users__detail">
              <div className="admin-users__detail-grid">
                <div className="admin-users__detail-card">
                  <span>Plan</span>
                  <strong>{selectedUser.planLabel}</strong>
                  <small>{selectedUser.planTierLocked ? "Locked" : "Billing synced"}</small>
                </div>
                <div className="admin-users__detail-card">
                  <span>Renewal</span>
                  <strong>{formatPlanDate(selectedUser.renewalAt)}</strong>
                  <small>{selectedUser.renewalAt ? "Next billing date" : "No billing row"}</small>
                </div>
                <div className="admin-users__detail-card">
                  <span>Transactions</span>
                  <strong>{selectedUser.transactionCount.toLocaleString()}</strong>
                  <small>{formatMoney(selectedUser.transactionVolume)} volume</small>
                </div>
                <div className="admin-users__detail-card">
                  <span>Investments</span>
                  <strong>{selectedUser.investmentAccountCount.toLocaleString()}</strong>
                  <small>{formatMoney(selectedUser.investmentValue)} value</small>
                </div>
                <div className="admin-users__detail-card">
                  <span>Workspaces</span>
                  <strong>{selectedUser.workspaceCount.toLocaleString()}</strong>
                  <small>{selectedUser.bankAccountCount} bank accounts</small>
                </div>
                <div className="admin-users__detail-card">
                  <span>Uploads</span>
                  <strong>{selectedUser.monthlyUploads.toLocaleString()}</strong>
                  <small>This month</small>
                </div>
                <div className="admin-users__detail-card">
                  <span>Attention</span>
                  <strong>{selectedUser.attentionLevel.toUpperCase()}</strong>
                  <small>{selectedUser.attentionFlags.length > 0 ? selectedUser.attentionFlags.join(" · ") : "No active flags"}</small>
                </div>
              </div>

              <div className="admin-users__detail-sections">
                <section className="admin-users__detail-section">
                  <h4>Recent transactions</h4>
                  <ul className="admin-users__detail-list">
                    {selectedUser.recentTransactions.length > 0 ? (
                      selectedUser.recentTransactions.map((entry) => (
                        <li key={entry.id}>
                          <strong>{entry.merchant}</strong>
                          <span>
                            {formatDate(entry.date)} · {entry.accountName} · {entry.workspaceName}
                          </span>
                          <small>
                            {formatMoney(entry.amount)} · {entry.type}
                            {entry.isTransfer ? " · movement" : ""}
                            {entry.isExcluded ? " · excluded" : ""}
                          </small>
                        </li>
                      ))
                    ) : (
                      <li className="admin-users__detail-empty">No transactions yet.</li>
                    )}
                  </ul>
                </section>

                <section className="admin-users__detail-section">
                  <h4>Recent imports</h4>
                  <ul className="admin-users__detail-list">
                    {selectedUser.recentImports.length > 0 ? (
                      selectedUser.recentImports.map((entry) => (
                        <li key={entry.id}>
                          <strong>{entry.fileName}</strong>
                          <span>
                            {formatDate(entry.uploadedAt)} · {entry.workspaceName}
                          </span>
                          <small>
                            {entry.status} · {entry.parsedRowsCount} parsed · {entry.confirmedTransactionsCount} confirmed
                          </small>
                        </li>
                      ))
                    ) : (
                      <li className="admin-users__detail-empty">No imports yet.</li>
                    )}
                  </ul>
                </section>

                <section className="admin-users__detail-section">
                  <h4>Recent goals</h4>
                  <ul className="admin-users__detail-list">
                    {selectedUser.recentGoals.length > 0 ? (
                      selectedUser.recentGoals.map((entry) => (
                        <li key={entry.id}>
                          <strong>{entry.primaryGoal ?? "Goal update"}</strong>
                          <span>{formatDate(entry.createdAt)}</span>
                          <small>
                            {entry.targetAmount ? formatMoney(entry.targetAmount) : "No target"} · {entry.source ?? "No source"}
                          </small>
                        </li>
                      ))
                    ) : (
                      <li className="admin-users__detail-empty">No goals yet.</li>
                    )}
                  </ul>
                </section>

                <section className="admin-users__detail-section">
                  <h4>Recent errors</h4>
                  <ul className="admin-users__detail-list">
                    {selectedUser.recentErrors.length > 0 ? (
                      selectedUser.recentErrors.map((entry) => (
                        <li key={entry.id}>
                          <strong>{entry.message}</strong>
                          <span>
                            {formatDate(entry.occurredAt)} · {entry.route ?? "No route"}
                          </span>
                          <small className="admin-users__mono">{entry.buildId}</small>
                        </li>
                      ))
                    ) : (
                      <li className="admin-users__detail-empty">No user-linked errors.</li>
                    )}
                  </ul>
                </section>

                <section className="admin-users__detail-section">
                  <h4>Workspace activity</h4>
                  <ul className="admin-users__detail-list">
                    {selectedUser.workspaces.length > 0 ? (
                      selectedUser.workspaces.map((workspace) => (
                        <li key={workspace.id}>
                          <strong>{workspace.name}</strong>
                          <span>
                            {workspace.type} · {formatDate(workspace.updatedAt)}
                          </span>
                          <small>
                            {workspace.accountCount} accounts · {workspace.transactionCount} transactions · {workspace.importCount} imports
                          </small>
                        </li>
                      ))
                    ) : (
                      <li className="admin-users__detail-empty">No workspaces yet.</li>
                    )}
                  </ul>
                </section>

                <section className="admin-users__detail-section">
                  <h4>Audit log</h4>
                  <ul className="admin-users__detail-list">
                    {selectedUser.recentAuditLogs.length > 0 ? (
                      selectedUser.recentAuditLogs.map((entry) => (
                        <li key={entry.id}>
                          <strong>
                            {entry.action} · {entry.entity}
                          </strong>
                          <span>
                            {formatDate(entry.createdAt)} · {entry.workspaceName}
                          </span>
                          <small>{entry.entityId ?? "No entity id"}</small>
                        </li>
                      ))
                    ) : (
                      <li className="admin-users__detail-empty">No audit records yet.</li>
                    )}
                  </ul>
                </section>
              </div>
            </div>
          ) : null}
        </article>
      ) : null}

      <article className="table-panel admin-users__table-panel">
        <div className="admin-users__table-head">
          <div>
            <p className="eyebrow">Directory</p>
            <h3>All users</h3>
          </div>
          <p className="panel-muted">
            Showing {data.users.length} of {data.totalCount}
          </p>
        </div>

        {loading ? <div className="admin-users__loading" role="status">Loading users...</div> : null}

        {!loading && data.users.length === 0 ? (
          <div className="empty-state">
            <strong>No users found.</strong>
            <p>Try a different search term or clear the filter to see the full list.</p>
          </div>
        ) : null}

        {!loading && data.users.length > 0 ? (
          <div className="admin-users__table-wrap">
            <table className="admin-users__table">
              <thead>
                <tr>
                  <th>First name</th>
                  <th>Last name</th>
                  <th>Email</th>
                  <th>Tier</th>
                  <th>Account limit</th>
                  <th>Upload limit</th>
                  <th>Transaction rows</th>
                  <th>Renewal</th>
                  <th>Financial exp</th>
                  <th>Primary goal</th>
                  <th>Goal target</th>
                  <th>Goal source</th>
                  <th>Onboarding</th>
                  <th>Data wiped</th>
                  <th>Verified</th>
                  <th>Clerk ID</th>
                  <th>Workspaces</th>
                  <th>Bank accounts</th>
                  <th>Transactions</th>
                  <th>Active accounts</th>
                  <th>Investments</th>
                  <th>Investment value</th>
                  <th>Tx volume</th>
                  <th>Monthly uploads</th>
                  <th>Billing</th>
                  <th>Created</th>
                  <th>Updated</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {visibleUsers.map((user) => {
                  const draft = drafts[user.id] ?? initialDraft(user);
                  const dirty = isDirty(user, draft);
                  const saving = savingUserId === user.id;

                  return (
                    <tr key={user.id} className={`${dirty ? "is-dirty" : ""} ${selectedUserId === user.id ? "is-selected" : ""}`}>
                      <td>
                        <input
                          className="admin-users__inline-input"
                          value={draft.firstName}
                          onChange={(event) => updateDraft(user.id, { firstName: event.target.value })}
                          aria-label={`${user.email} first name`}
                        />
                      </td>
                      <td>
                        <input
                          className="admin-users__inline-input"
                          value={draft.lastName}
                          onChange={(event) => updateDraft(user.id, { lastName: event.target.value })}
                          aria-label={`${user.email} last name`}
                        />
                      </td>
                      <td>
                        <input
                          className="admin-users__inline-input"
                          type="email"
                          value={draft.email}
                          onChange={(event) => updateDraft(user.id, { email: event.target.value })}
                          aria-label={`${user.email} email`}
                        />
                      </td>
                      <td>
                        <div className="admin-users__tier-stack">
                          <select
                            className="admin-users__inline-select"
                            value={draft.planTier}
                            onChange={(event) => updateDraft(user.id, { planTier: event.target.value as "free" | "pro" })}
                            aria-label={`${user.email} plan tier`}
                          >
                            <option value="free">Free</option>
                            <option value="pro">Pro</option>
                          </select>
                          <div className="admin-users__tier-badges">
                            {user.planTierLocked ? (
                              <>
                                <span className="admin-users__pill admin-users__pill--locked">Locked</span>
                                <small className="admin-users__tier-note">Manual override active</small>
                              </>
                            ) : (
                              <>
                                <span className="admin-users__pill admin-users__pill--sync">Billing</span>
                                <small className="admin-users__tier-note">Syncs with billing</small>
                              </>
                            )}
                            <small className="admin-users__tier-note">{user.planLabel}</small>
                          </div>
                        </div>
                      </td>
                      <td>
                        <input
                          className="admin-users__inline-input"
                          inputMode="numeric"
                          value={draft.accountLimit}
                          onChange={(event) => updateDraft(user.id, { accountLimit: event.target.value })}
                          aria-label={`${user.email} account limit`}
                        />
                      </td>
                      <td>
                        <input
                          className="admin-users__inline-input"
                          inputMode="numeric"
                          value={draft.monthlyUploadLimit}
                          onChange={(event) => updateDraft(user.id, { monthlyUploadLimit: event.target.value })}
                          aria-label={`${user.email} monthly upload limit`}
                        />
                      </td>
                      <td>
                        <input
                          className="admin-users__inline-input"
                          inputMode="numeric"
                          value={draft.transactionLimit}
                          onChange={(event) => updateDraft(user.id, { transactionLimit: event.target.value })}
                          aria-label={`${user.email} transaction limit`}
                        />
                      </td>
                      <td>
                        <div className="admin-users__status-stack">
                          <strong>{formatPlanDate(user.renewalAt)}</strong>
                          <small>{user.billingSubscription ? `${user.billingSubscription.status} · ${user.billingSubscription.interval ?? "no interval"}` : "No billing row"}</small>
                        </div>
                      </td>
                      <td>
                        <select
                          className="admin-users__inline-select"
                          value={draft.financialExperience}
                          onChange={(event) =>
                            updateDraft(user.id, {
                              financialExperience: event.target.value as AdminUserDraft["financialExperience"],
                            })
                          }
                          aria-label={`${user.email} financial experience`}
                        >
                          <option value="">Not set</option>
                          <option value="beginner">Beginner</option>
                          <option value="comfortable">Comfortable</option>
                          <option value="advanced">Advanced</option>
                        </select>
                      </td>
                      <td>
                        <input
                          className="admin-users__inline-input"
                          value={draft.primaryGoal}
                          onChange={(event) => updateDraft(user.id, { primaryGoal: event.target.value })}
                          aria-label={`${user.email} primary goal`}
                        />
                      </td>
                      <td>
                        <input
                          className="admin-users__inline-input"
                          inputMode="decimal"
                          value={draft.goalTargetAmount}
                          onChange={(event) => updateDraft(user.id, { goalTargetAmount: event.target.value })}
                          aria-label={`${user.email} goal target amount`}
                        />
                      </td>
                      <td>
                        <input
                          className="admin-users__inline-input"
                          value={draft.goalTargetSource}
                          onChange={(event) => updateDraft(user.id, { goalTargetSource: event.target.value })}
                          aria-label={`${user.email} goal target source`}
                        />
                      </td>
                      <td>
                        <input
                          className="admin-users__inline-input"
                          type="datetime-local"
                          value={draft.onboardingCompletedAt}
                          onChange={(event) => updateDraft(user.id, { onboardingCompletedAt: event.target.value })}
                          aria-label={`${user.email} onboarding completed at`}
                        />
                      </td>
                      <td>
                        <input
                          className="admin-users__inline-input"
                          type="datetime-local"
                          value={draft.dataWipedAt}
                          onChange={(event) => updateDraft(user.id, { dataWipedAt: event.target.value })}
                          aria-label={`${user.email} data wiped at`}
                        />
                      </td>
                      <td>
                        <span className={`admin-users__pill ${user.verified ? "admin-users__pill--success" : "admin-users__pill--warn"}`}>
                          {user.verified ? "Verified" : "Unverified"}
                        </span>
                        <div className="admin-users__status-stack">
                          <small className={`admin-users__pill ${attentionTone(user.attentionLevel)}`}>{user.attentionLevel} attention</small>
                          <small>{user.attentionFlags.length > 0 ? user.attentionFlags[0] : "No active flags"}</small>
                        </div>
                      </td>
                      <td>
                        <span className="admin-users__mono">{user.clerkUserId}</span>
                      </td>
                      <td>{user.workspaceCount}</td>
                      <td>{user.bankAccountCount}</td>
                      <td>{user.transactionCount}</td>
                      <td>{user.activeAccountCount}</td>
                      <td>{user.investmentAccountCount}</td>
                      <td>
                        <strong className="admin-users__currency">{formatMoney(user.investmentValue)}</strong>
                      </td>
                      <td>
                        <strong className="admin-users__currency">{formatMoney(user.transactionVolume)}</strong>
                      </td>
                      <td>{user.monthlyUploads}</td>
                      <td>
                        <div className="admin-users__status-stack">
                          {user.billingSubscription ? (
                            <>
                              <span className={`admin-users__pill admin-users__pill--${user.billingSubscription.planTier}`}>
                                {user.planLabel}
                              </span>
                              <small>
                                {user.billingSubscription.status} · {user.billingSubscription.interval ?? "no interval"}
                              </small>
                            </>
                          ) : (
                            <small>No billing row</small>
                          )}
                        </div>
                      </td>
                      <td>
                        <small>{formatDate(user.createdAt)}</small>
                      </td>
                      <td>
                        <small>{formatDate(user.updatedAt)}</small>
                      </td>
                      <td>
                        <div className="admin-users__row-actions">
                          <button
                            className={`button button-small ${dirty ? "button-primary" : "button-secondary"}`}
                            type="button"
                            onClick={() => saveRow(user)}
                            disabled={saving || unlockingUserId === user.id || !dirty}
                          >
                            {saving ? "Saving..." : dirty ? "Save" : "Saved"}
                          </button>
                          <button
                            className="button button-secondary button-small"
                            type="button"
                            onClick={() => unlockTier(user)}
                            disabled={saving || unlockingUserId === user.id || !user.planTierLocked}
                          >
                            {unlockingUserId === user.id ? "Unlocking..." : "Unlock"}
                          </button>
                          <button
                            className="button button-secondary button-small"
                            type="button"
                            onClick={() => revertRow(user)}
                            disabled={saving || unlockingUserId === user.id || !dirty}
                          >
                            Revert
                          </button>
                          <button
                            className="button button-secondary button-small"
                            type="button"
                            onClick={() => openUserDetails(user.id)}
                          >
                            Open
                          </button>
                          <button
                            className="button button-secondary button-small"
                            type="button"
                            onClick={() => toggleSelectedUser(user.id)}
                          >
                            {selectedUserIds[user.id] ? "Selected" : "Select"}
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
                        <div className="admin-users__status-stack">
                          <strong>{log.message}</strong>
                          {log.name ? <small>{log.name}</small> : null}
                        </div>
                      </td>
                      <td>
                        <div className="admin-users__status-stack">
                          <strong className="admin-users__mono">{log.buildId}</strong>
                          {log.deploymentId ? <small className="admin-users__mono">{log.deploymentId}</small> : null}
                        </div>
                      </td>
                      <td>{log.environment}</td>
                      <td>{log.source}</td>
                      <td>
                        <div className="admin-users__status-stack">
                          <strong>{log.route ?? "—"}</strong>
                          {log.method ? <small>{log.method}</small> : null}
                        </div>
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

        <div className="admin-users__pager">
          <button className="button button-secondary button-small" type="button" onClick={() => setPage((value) => Math.max(value - 1, 1))} disabled={page <= 1 || loading}>
            Previous
          </button>
          <span>
            Page {data.page} of {data.totalPages}
          </span>
          <button
            className="button button-secondary button-small"
            type="button"
            onClick={() => setPage((value) => Math.min(value + 1, data.totalPages))}
            disabled={page >= data.totalPages || loading}
          >
            Next
          </button>
        </div>
      </article>
    </section>
  );
}
