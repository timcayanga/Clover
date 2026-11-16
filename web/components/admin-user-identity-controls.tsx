"use client";
import { useEffect, useRef, useState } from "react";
export function AdminUserIdentityControls({
  onChange,
}: {
  onChange: () => void;
}) {
  const [config, setConfig] = useState<{
    environment: string;
    canOperate: boolean;
    webhookConfigured: boolean;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const requestId = useRef("");
  const running = useRef(false);
  useEffect(() => {
    let live = true;
    fetch("/api/admin/users/sync")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (live) setConfig(data);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  const run = async (create: boolean) => {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setMessage("");
    try {
      if (create) {
        requestId.current ||= crypto.randomUUID();
        const response = await fetch("/api/admin/users", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email,
            firstName,
            lastName,
            requestId: requestId.current,
          }),
        });
        const result = await response.json();
        if (!response.ok)
          throw new Error(
            result.error ??
              "Creation failed. Retry with the same details to recover an incomplete request.",
          );
        requestId.current = "";
        setEmail("");
        setFirstName("");
        setLastName("");
        setOpen(false);
        setMessage("User created in Clerk and Clover. No invitation was sent.");
      } else {
        let offset: number | null = 0,
          synced = 0,
          errors = 0;
        do {
          const response: Response = await fetch("/api/admin/users/sync", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ offset }),
          });
          const result: {
            synced: number;
            errors: unknown[];
            nextOffset: number | null;
            error?: string;
          } = await response.json();
          if (!response.ok) throw new Error(result.error ?? "Sync failed.");
          synced += result.synced;
          errors += result.errors.length;
          offset = result.nextOffset;
          setMessage(
            `Synced ${synced} users. ${errors} issues.${offset === null ? "" : " Continuing…"}`,
          );
        } while (offset !== null);
        if (errors)
          setMessage(
            `Synced ${synced} users; ${errors} issues need attention. Check identity/email conflicts or pending deletions and retry.`,
          );
      }
      onChange();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Unable to manage Clerk users.",
      );
    } finally {
      setBusy(false);
      running.current = false;
    }
  };
  return (
    <section
      className="admin-governance__card"
      aria-label="Clerk user management"
    >
      <h3>
        Clerk users
        {config
          ? ` · ${config.environment === "staging" ? "Development / staging" : "Production"}`
          : ""}
      </h3>
      {config && !config.webhookConfigured ? (
        <p>
          Automatic Clerk sync needs its webhook signing secret. Use Sync from
          Clerk to import existing users.
        </p>
      ) : null}
      {config?.canOperate ? (
        <>
          <p>
            Sync imports existing users and resumes previously requested
            permanent deletions.
          </p>
          <button
            className="button button-secondary"
            disabled={busy}
            onClick={() => void run(false)}
          >
            {busy ? "Working…" : "Sync from Clerk"}
          </button>{" "}
          <button
            className="button button-primary"
            disabled={busy}
            onClick={() => setOpen(!open)}
          >
            Create user
          </button>
          {open ? (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void run(true);
              }}
            >
              <p>
                Create a Free user in this Clerk instance. Clerk treats the
                supplied email as verified; confirm it belongs to the intended
                person. No password or invitation email is sent.
              </p>
              <label>
                Email{" "}
                <input
                  type="email"
                  required
                  value={email}
                  disabled={busy}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    requestId.current = "";
                  }}
                />
              </label>{" "}
              <label>
                First name{" "}
                <input
                  maxLength={80}
                  value={firstName}
                  disabled={busy}
                  onChange={(e) => {
                    setFirstName(e.target.value);
                    requestId.current = "";
                  }}
                />
              </label>{" "}
              <label>
                Last name{" "}
                <input
                  maxLength={80}
                  value={lastName}
                  disabled={busy}
                  onChange={(e) => {
                    setLastName(e.target.value);
                    requestId.current = "";
                  }}
                />
              </label>{" "}
              <button className="button button-primary" disabled={busy}>
                Create in Clerk and Clover
              </button>
            </form>
          ) : null}
        </>
      ) : null}
      {message ? <p role="status">{message}</p> : null}
    </section>
  );
}
