"use client";
import { useCallback, useEffect, useState } from "react";
import { addCalendarMonths } from "@/lib/pro-access-rules";
import { planName, type CloverPlanTier } from "../../shared/plan-catalog";
import styles from "./growth.module.css";

type Grant = {
  planTier: CloverPlanTier;
  id: string;
  startsAt: string;
  endsAt: string;
  revokedAt: string | null;
  source: string;
  reason: string;
};
type Access = {
  switchCampaign?: {status:string;activatedAt:string|null;expiresAt:string|null;claimBy:string|null}|null;
  planTier: CloverPlanTier;
  source: string;
  renewing: boolean;
  paidThrough: string | null;
  accessEndsAt: string | null;
  user: { email: string; planTierLocked: boolean };
  subscription: {
    provider: string;
    status: string;
    nextBillingTime: string | null;
    currentPeriodEnd: string | null;
    cancelledAt: string | null;
  } | null;
  storeSubscription: { store: string | null; productId: string | null; expiresAt: string | null; renewing: boolean; sandbox: boolean } | null;
  allowances: { accounts: number | null; profiles: number; budgets: number; goals: number; circles: number; linkedBanks: number; monthlyTokens: number; dailyTokens: number };
  accountLimitOverride: number | null;
  tokens: { monthly: { used: number; limit: number | null }; rolling24h: { used: number; limit: number | null } };
  grants: Grant[];
  history: {
    id: string;
    actorId: string;
    action: string;
    reason: string;
    createdAt: string;
  }[];
};
const dateText = (v: string | null) => (v ? new Date(v).toLocaleString() : "—");
const localInput = (date: Date) =>
  new Date(+date - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);

export function AdminPlanAccess({ userId }: { userId: string }) {
  const [data, setData] = useState<Access | null>(null),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const [grantTier, setGrantTier] = useState<"pro" | "premium">("pro");
  const [grantId, setGrantId] = useState(""),
    [startsAt, setStart] = useState(() => localInput(new Date())),
    [endsAt, setEnd] = useState(() =>
      localInput(addCalendarMonths(new Date(), 1)),
    ),
    [reason, setReason] = useState("");
  const load = useCallback(async () => {
    const r = await fetch(
      `/api/admin/users/${encodeURIComponent(userId)}/plan`,
      { cache: "no-store" },
    );
    const p = await r.json();
    if (!r.ok) throw new Error(p.error);
    setData(p);
  }, [userId]);
  useEffect(() => {
    void load().catch((e) => setMessage(e.message));
  }, [load]);
  async function save(action: "grant" | "edit" | "revoke" | "unlock") {
    if (!reason.trim()) {
      setMessage("Please provide a reason for the audit history.");
      return;
    }
    if (
      (action === "revoke" || action === "unlock") &&
      !window.confirm(
        action === "unlock"
          ? "Return this account to billing and dated grants? This can change their current access, but does not cancel billing."
          : "Revoke this complimentary grant? Paid access is not affected.",
      )
    )
      return;
    setBusy(true);
    setMessage("");
    try {
      const r = await fetch(
        `/api/admin/users/${encodeURIComponent(userId)}/plan`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action,
            grantId: grantId || undefined,
            planTier: grantTier,
            startsAt: new Date(startsAt).toISOString(),
            endsAt: new Date(endsAt).toISOString(),
            reason,
          }),
        },
      );
      const p = await r.json();
      if (!r.ok) throw new Error(p.error);
      await load();
      setMessage(
        "Access updated. Provider billing dates and charges were not changed.",
      );
      setGrantId("");
      setReason("");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Unable to save.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className={styles.shell}>
      <a href="/admin/users">← Users</a>
      {message && (
        <p className={styles.message} role="status">
          {message}
        </p>
      )}
      {!data ? (
        <p>Loading plan and access…</p>
      ) : (
        <>
          <section className={styles.card}>
            <h2>{data.user.email}</h2>
            <dl>
              <dt>Current access</dt>
              <dd>
                {planName(data.planTier)} · {data.source}
              </dd>
              {data.switchCampaign ? <><dt>Switch to Clover campaign</dt><dd>{data.switchCampaign.status} · {data.switchCampaign.activatedAt ? "Redeemed" : "Not redeemed"} · Reward ends {dateText(data.switchCampaign.expiresAt)} · <a href="/admin/campaigns">View application</a></dd></> : null}
              <dt>Subscription</dt>
              <dd>{data.subscription?.status ?? "No paid subscription"}</dd>
              <dt>Native subscription</dt>
              <dd>{data.storeSubscription ? `${data.storeSubscription.store ?? "Store"} · ${data.storeSubscription.productId ?? "No active product"} · ${data.storeSubscription.sandbox ? "Sandbox" : "Production"} · Paid through ${dateText(data.storeSubscription.expiresAt)}` : "No native subscription"}</dd>
              <dt>Verified paid through</dt>
              <dd>{dateText(data.paidThrough)}</dd>
              <dt>{data.accessEndsAt ? "Current tier access ends" : data.renewing ? "Next renewal" : "Current tier access ends"}</dt>
              <dd>
                {data.accessEndsAt ? dateText(data.accessEndsAt) : data.renewing
                  ? dateText(
                      data.subscription?.nextBillingTime ??
                        data.subscription?.currentPeriodEnd ??
                        null,
                    )
                  : data.user.planTierLocked
                    ? "Manual override — no expiry"
                    : dateText(data.accessEndsAt)}
              </dd>
              <dt>Cancellation recorded</dt>
              <dd>{dateText(data.subscription?.cancelledAt ?? null)}</dd>
              <dt>Web billing provider</dt>
              <dd>{data.subscription ? `${data.subscription.provider} · ${data.subscription.status}` : "None"}</dd>
            </dl>
            <p className={styles.note}>
              Billing dates are read-only. Complimentary grants never postpone
              or cancel a provider charge. Unknown paid-through dates are shown
              as unknown, not inferred.
            </p>
          </section>
          <section className={styles.card}>
            <h2>Effective allowances</h2>
            <p>{data.allowances.accounts ?? "Unlimited"} accounts · {data.allowances.profiles} Profiles · {data.allowances.linkedBanks} linked banks · {data.allowances.budgets} budgets · {data.allowances.goals} goals · {data.allowances.circles} Circles</p>
            <p>Monthly AI tokens: {data.tokens.monthly.used.toLocaleString()} / {data.tokens.monthly.limit?.toLocaleString() ?? "Unlimited"}</p>
            <p>Rolling 24-hour AI tokens: {data.tokens.rolling24h.used.toLocaleString()} / {data.tokens.rolling24h.limit?.toLocaleString() ?? "Unlimited"}</p>
            <p>Account limit override: {data.accountLimitOverride === null ? "None — follows plan" : data.accountLimitOverride}. Existing financial records are preserved when limits decrease.</p>
          </section>
          <section className={styles.card}>
            <h2>
              {grantId
                ? "Edit complimentary access"
                : "Grant complimentary access"}
            </h2>
            <form
              className={styles.stack}
              onSubmit={(e) => {
                e.preventDefault();
                void save(grantId ? "edit" : "grant");
              }}
            >
              <label>Plan<select value={grantTier} onChange={e => setGrantTier(e.target.value as "pro" | "premium")}><option value="pro">Plus</option><option value="premium">Pro</option></select></label>
              <div className={styles.grid}>
                <label>
                  Starts at
                  <input
                    type="datetime-local"
                    value={startsAt}
                    onChange={(e) => setStart(e.target.value)}
                    required
                  />
                </label>
                <label>
                  Ends at
                  <input
                    type="datetime-local"
                    value={endsAt}
                    onChange={(e) => setEnd(e.target.value)}
                    required
                  />
                </label>
              </div>
              <div className={styles.row}>
                <button
                  type="button"
                  disabled={!startsAt}
                  onClick={() =>
                    setEnd(localInput(addCalendarMonths(new Date(startsAt), 1)))
                  }
                >
                  One calendar month
                </button>
                <span className={styles.note}>
                  Dates use your browser’s local timezone; the exact instants
                  are saved in UTC.
                </span>
              </div>
              <label>
                Reason
                <input
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  minLength={5}
                  maxLength={1000}
                  required
                  placeholder="Referral adjustment, complimentary trial, support resolution…"
                />
              </label>
              <p>
                Preview: complimentary {planName(grantTier)} from {dateText(startsAt)} until{" "}
                {dateText(endsAt)}. Billing stays unchanged.
              </p>
              {data.user.planTierLocked && (
                <p className={styles.message}>
                  This account has a manual override. A grant does not replace
                  that override; release it explicitly to use dated access.
                </p>
              )}
              <div className={styles.row}>
                <button className={styles.primary} disabled={busy}>
                  Save grant
                </button>
                {grantId && (
                  <>
                    <button
                      type="button"
                      className={styles.danger}
                      disabled={busy}
                      onClick={() => void save("revoke")}
                    >
                      Revoke grant
                    </button>
                    <button type="button" onClick={() => setGrantId("")}>
                      Cancel edit
                    </button>
                  </>
                )}
                {data.user.planTierLocked && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void save("unlock")}
                  >
                    Release manual override
                  </button>
                )}
              </div>
            </form>
          </section>
          <section className={styles.card}>
            <h2>Access grants</h2>
            <div className={styles.stack}>
              {data.grants.length ? (
                data.grants.map((g) => (
                  <article key={g.id}>
                    <strong>
                      {planName(g.planTier)} · {g.source} ·{" "}
                      {g.revokedAt
                        ? "Revoked"
                        : new Date(g.endsAt) <= new Date()
                          ? "Expired"
                          : new Date(g.startsAt) > new Date()
                            ? "Scheduled"
                            : "Active"}
                    </strong>
                    <p>
                      {dateText(g.startsAt)} → {dateText(g.endsAt)}
                    </p>
                    <p>{g.reason}</p>
                    {!g.revokedAt && (
                      <button
                        disabled={busy}
                        onClick={() => {
                          setGrantId(g.id);
                          setGrantTier(g.planTier === "premium" ? "premium" : "pro");
                          setStart(localInput(new Date(g.startsAt)));
                          setEnd(localInput(new Date(g.endsAt)));
                          setReason("");
                          setMessage(
                            "Grant selected. Set dates and a reason in the editor above.",
                          );
                        }}
                      >
                        Edit dates / revoke
                      </button>
                    )}
                  </article>
                ))
              ) : (
                <p>No complimentary grants.</p>
              )}
            </div>
          </section>
          <section className={styles.card}>
            <h2>Audit history</h2>
            <div className={styles.history}>
              {data.history.map((h) => (
                <p key={h.id}>
                  {dateText(h.createdAt)} · {h.actorId} · {h.action}
                  <br />
                  {h.reason}
                </p>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
