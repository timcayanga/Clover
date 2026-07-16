"use client";

import { useEffect, useState } from "react";

type User = {
  id: string;
  email: string;
  fullName: string;
  planLabel: string;
  verified: boolean;
  dataWipedAt: string | null;
  workspaceCount: number;
  transactionCount: number;
};

type Detail = User & {
  clerkUserId: string;
  firstName: string | null;
  lastName: string | null;
  planTier: "free" | "pro";
  planTierLocked: boolean;
  bankAccountCount: number;
  investmentAccountCount: number;
  monthlyUploads: number;
  attentionLevel: string;
  attentionFlags: string[];
  lastActivityAt: string | null;
  workspaces: Array<{ id: string; name: string; type: string; accountCount: number; transactionCount: number; importCount: number }>;
};

const fetchJson = async <T,>(url: string, init?: RequestInit) => {
  const response = await fetch(url, init);
  const payload = (await response.json().catch(() => null)) as T & { error?: string };
  if (!response.ok) throw new Error(payload?.error || "Request failed.");
  return payload;
};

export function AdminSupportConsole() {
  const [query, setQuery] = useState("");
  const [users, setUsers] = useState<User[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [detail, setDetail] = useState<Detail | null>(null);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [temporaryPassword, setTemporaryPassword] = useState<string | null>(null);
  const [reseed, setReseed] = useState(true);

  const loadUsers = async (search = query) => {
    setBusy("search");
    try {
      const params = new URLSearchParams({ query: search, page: "1", pageSize: "25", planTier: "all", verified: "all", locked: "all" });
      const data = await fetchJson<{ users: User[] }>(`/api/admin/users?${params}`);
      setUsers(data.users);
      if (selectedId && !data.users.some((user) => user.id === selectedId)) setSelectedId("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to load users.");
    } finally {
      setBusy(null);
    }
  };

  useEffect(() => {
    void loadUsers("");
    // The Support directory intentionally loads as soon as the page opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return;
    }
    setBusy("detail");
    void fetchJson<{ detail: Detail }>(`/api/admin/users/${selectedId}/details`)
      .then(({ detail: next }) => {
        setDetail(next);
        setFirstName(next.firstName ?? "");
        setLastName(next.lastName ?? "");
        setEmail(next.email);
        setTemporaryPassword(null);
      })
      .catch((error) => setMessage(error instanceof Error ? error.message : "Unable to load user details."))
      .finally(() => setBusy(null));
  }, [selectedId]);

  const saveInfo = async () => {
    if (!detail) return;
    setBusy("save"); setMessage(null);
    try {
      const { user } = await fetchJson<{ user: User }>(`/api/admin/users/${detail.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ firstName: firstName.trim() || null, lastName: lastName.trim() || null, email: email.trim() }),
      });
      setUsers((current) => current.map((entry) => (entry.id === user.id ? { ...entry, ...user } : entry)));
      setDetail((current) => (current ? { ...current, ...user, firstName: firstName.trim() || null, lastName: lastName.trim() || null } : current));
      setMessage("User information saved.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to save user information."); }
    finally { setBusy(null); }
  };

  const resetPassword = async () => {
    if (!detail) return;
    const confirmation = window.prompt("This signs the user out of other sessions. Type RESET PASSWORD to continue.");
    if (confirmation !== "RESET PASSWORD") {
      if (confirmation !== null) setMessage("Password reset cancelled. The exact confirmation phrase is required.");
      return;
    }
    setBusy("password"); setMessage(null); setTemporaryPassword(null);
    try {
      const result = await fetchJson<{ temporaryPassword: string }>(`/api/admin/support/${detail.id}/reset-password`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirmation: "RESET PASSWORD" }),
      });
      setTemporaryPassword(result.temporaryPassword);
      setMessage("Temporary password created. It will not be shown again after leaving this page.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to reset password."); }
    finally { setBusy(null); }
  };

  const wipeData = async () => {
    if (!detail) return;
    const confirmation = window.prompt(`Wipe all Clover data for ${detail.email}? This cannot be undone. Type WIPE to continue.`);
    if (confirmation !== "WIPE") {
      if (confirmation !== null) setMessage("Data wipe cancelled. The exact confirmation phrase is required.");
      return;
    }
    setBusy("wipe"); setMessage(null); setTemporaryPassword(null);
    try {
      await fetchJson(`/api/admin/support/${detail.id}/wipe-data`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirmation: "WIPE", reseedStarterWorkspace: reseed }),
      });
      setMessage(reseed ? "User data wiped and a fresh starter workspace was created." : "User data wiped.");
      await loadUsers(query);
      setSelectedId(detail.id);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to wipe user data."); }
    finally { setBusy(null); }
  };

  const setAccess = async (verified: boolean) => {
    if (!detail) return;
    setBusy("access"); setMessage(null);
    try {
      const { user } = await fetchJson<{ user: User }>(`/api/admin/users/${detail.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ verified }),
      });
      setUsers((current) => current.map((entry) => (entry.id === user.id ? { ...entry, ...user } : entry)));
      setDetail((current) => (current ? { ...current, ...user } : current));
      setMessage(verified ? "User access restored." : "User blocked.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to update access."); }
    finally { setBusy(null); }
  };

  return (
    <div className="admin-support">
      <section className="admin-support__directory table-panel">
        <div className="admin-users__table-head"><div><p className="eyebrow">Support directory</p><h3>Find a user</h3></div><button className="button button-secondary button-small" type="button" onClick={() => void loadUsers()} disabled={busy === "search"}>{busy === "search" ? "Loading..." : "Refresh"}</button></div>
        <form className="admin-support__search" onSubmit={(event) => { event.preventDefault(); void loadUsers(); }}><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by name, email, or Clerk ID" /><button className="button button-primary button-small" type="submit">Search</button></form>
        <div className="admin-support__user-list">{users.map((user) => <button key={user.id} type="button" className={`admin-support__user${selectedId === user.id ? " is-selected" : ""}`} onClick={() => setSelectedId(user.id)}><span><strong>{user.fullName}</strong><small>{user.email}</small></span><span><strong>{user.planLabel}</strong><small>{user.transactionCount.toLocaleString()} transactions</small></span></button>)}{users.length === 0 ? <p className="panel-muted">No users found.</p> : null}</div>
      </section>

      <section className="admin-support__workspace table-panel">
        {!detail ? <div className="admin-support__empty"><p className="eyebrow">Support workspace</p><h3>Select a user to view account controls.</h3><p className="panel-muted">Profile changes are synced to Clerk and Clover. Financial data is never changed by saving profile information.</p></div> : <>
          <div className="admin-users__table-head"><div><p className="eyebrow">{detail.attentionLevel} attention</p><h3>{detail.fullName}</h3><p className="panel-muted">{detail.email} · {detail.clerkUserId}</p></div><span className={`admin-users__pill ${detail.verified ? "admin-users__pill--success" : "admin-users__pill--warn"}`}>{detail.verified ? "Active" : "Blocked"}</span></div>
          {message ? <p className="admin-users__notice">{message}</p> : null}
          <div className="admin-support__stats"><div><strong>{detail.workspaceCount}</strong><span>Workspaces</span></div><div><strong>{detail.bankAccountCount}</strong><span>Accounts</span></div><div><strong>{detail.transactionCount.toLocaleString()}</strong><span>Transactions</span></div><div><strong>{detail.monthlyUploads}</strong><span>Uploads this month</span></div></div>
          <div className="admin-support__form"><label>First name<input value={firstName} onChange={(event) => setFirstName(event.target.value)} /></label><label>Last name<input value={lastName} onChange={(event) => setLastName(event.target.value)} /></label><label>Email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} /></label></div>
          <div className="admin-support__actions"><button className="button button-primary" type="button" onClick={() => void saveInfo()} disabled={busy !== null}>{busy === "save" ? "Saving..." : "Save user info"}</button><button className="button button-secondary" type="button" onClick={() => void setAccess(!detail.verified)} disabled={busy !== null}>{busy === "access" ? "Updating..." : detail.verified ? "Block access" : "Restore access"}</button><button className="button button-secondary" type="button" onClick={() => void resetPassword()} disabled={busy !== null}>{busy === "password" ? "Resetting..." : "Reset password"}</button></div>
          <div className="admin-support__danger"><div><p className="eyebrow">Destructive action</p><h4>Wipe Clover data</h4><p className="panel-muted">Deletes workspaces, accounts, transactions, imports, split bills, and goals. The Clerk login remains available.</p><label className="admin-support__checkbox"><input type="checkbox" checked={reseed} onChange={(event) => setReseed(event.target.checked)} />Create a blank starter workspace afterward</label></div><button className="button button-danger" type="button" onClick={() => void wipeData()} disabled={busy !== null}>{busy === "wipe" ? "Wiping..." : "Wipe data"}</button></div>
          {temporaryPassword ? <div className="admin-support__password"><strong>Temporary password</strong><code>{temporaryPassword}</code><p>Copy this once and deliver it through an approved secure channel. Clover does not store or recover this value.</p></div> : null}
        </>}
      </section>
    </div>
  );
}
