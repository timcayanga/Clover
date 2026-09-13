"use client";
import { useEffect, useState } from "react";
import {
  adminRoles,
  canAdmin,
  type AdminRole,
  type AdminPermission,
} from "@/lib/admin-permissions";
type Member = { clerkUserId: string; role: AdminRole; active: boolean };
type History = {
  id: string;
  actorId: string;
  targetId: string;
  after: { role: string; active: boolean };
  createdAt: string;
};
export function AdminSecurityConsole({ role }: { role: AdminRole }) {
  const [tab, setTab] = useState("permissions");
  const [members, setMembers] = useState<Member[]>([]);
  const [history, setHistory] = useState<History[]>([]);
  const [target, setTarget] = useState("");
  const [nextRole, setNextRole] = useState<AdminRole>("read_only");
  const [active, setActive] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (role !== "owner") return;
    let current = true;
    void fetch("/api/admin/members")
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        if (current) {
          setMembers(data.members);
          setHistory(data.history);
        }
      })
      .catch((e) => {
        if (current) setError(e.message);
      });
    return () => {
      current = false;
    };
  }, [role, revision]);
  const save = async () => {
    if (busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/admin/members", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clerkUserId: target.trim(),
          role: nextRole,
          active,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setMessage("Staff access updated and recorded in change history.");
      setRevision((v) => v + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to save access.");
    } finally {
      setBusy(false);
    }
  };
  const capabilities: [AdminPermission, string][] = [
    ["read", "View Admin records"],
    ["support", "Support notes and replies"],
    ["operate", "Imports, content and operations"],
    ["entitlements", "Temporary Pro grants"],
    ["security", "Account access and recovery"],
    ["destructive", "Destructive data actions (different Owner approval)"],
    ["manage_staff", "Manage team access"],
  ];
  return (
    <div className="admin-governance">
      <p>
        Your role: <strong>{role.replace("_", " ")}</strong>
      </p>
      <div className="admin-governance__tabs">
        {[
          "permissions",
          ...(role === "owner" ? ["members", "history"] : []),
        ].map((item) => (
          <button
            key={item}
            type="button"
            aria-pressed={tab === item}
            onClick={() => setTab(item)}
          >
            {item === "members"
              ? "Assigned members"
              : item === "history"
                ? "Change history"
                : "Permissions"}
          </button>
        ))}
      </div>
      {tab === "permissions" ? (
        <section className="admin-governance__card">
          <h2>Role permissions</h2>
          <div className="admin-governance__table">
            <table>
              <thead>
                <tr>
                  <th>Capability</th>
                  {adminRoles.map((r) => (
                    <th key={r}>{r.replace("_", " ")}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {capabilities.map(([key, label]) => (
                  <tr key={key}>
                    <th>{label}</th>
                    {adminRoles.map((r) => (
                      <td key={r}>{canAdmin(r, key) ? "Allowed" : "No"}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p>
            A requester cannot approve their own destructive action. Staff
            cannot change their own access.
          </p>
        </section>
      ) : null}
      {tab === "members" ? (
        <>
          <section className="admin-governance__card">
            <h2>Assigned members</h2>
            <p>
              Configured Admin identities retain Owner access until explicitly
              assigned or disabled here.
            </p>
            {members.map((member) => (
              <button
                key={member.clerkUserId}
                type="button"
                onClick={() => {
                  setTarget(member.clerkUserId);
                  setNextRole(member.role);
                  setActive(member.active);
                }}
              >
                {member.clerkUserId} · {member.role} ·{" "}
                {member.active ? "Active" : "Disabled"}
              </button>
            ))}
          </section>
          <form
            className="admin-governance__card"
            onSubmit={(event) => {
              event.preventDefault();
              void save();
            }}
          >
            <h2>Change staff access</h2>
            <label>
              Clerk user ID
              <input
                required
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                disabled={busy}
                placeholder="user_…"
              />
            </label>
            <label>
              Role
              <select
                value={nextRole}
                disabled={busy}
                onChange={(e) => setNextRole(e.target.value as AdminRole)}
              >
                {adminRoles.map((r) => (
                  <option key={r} value={r}>
                    {r.replace("_", " ")}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <input
                type="checkbox"
                checked={active}
                disabled={busy}
                onChange={(e) => setActive(e.target.checked)}
              />
              Active staff access
            </label>
            <p>
              Preview: {target || "Selected identity"} will have{" "}
              {active ? nextRole.replace("_", " ") : "no Admin"} access.
            </p>
            <button disabled={busy || !target.trim()}>
              {busy ? "Saving…" : "Save access"}
            </button>
          </form>
        </>
      ) : null}
      {tab === "history" ? (
        <section className="admin-governance__card">
          <h2>Change history</h2>
          {history.map((item) => (
            <p key={item.id}>
              {new Date(item.createdAt).toLocaleString()} · {item.actorId}{" "}
              changed {item.targetId} to {item.after.role},{" "}
              {item.after.active ? "active" : "disabled"}.
            </p>
          ))}
          {!history.length ? <p>No staff access changes recorded.</p> : null}
        </section>
      ) : null}
      {error ? <p role="alert">{error}</p> : null}
      {message ? <p role="status">{message}</p> : null}
    </div>
  );
}
