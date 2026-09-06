"use client";
import { useCallback, useEffect, useState } from "react";
import styles from "./growth.module.css";
type Data = {
  verified: boolean;
  campaigns: {
    id: string;
    name: string;
    terms: string;
    endsAt: string;
    codes: { code: string }[];
  }[];
  rewards: {
    id: string;
    months: number;
    status: string;
    availableAt: string;
    expiresAt: string | null;
    claimedAt: string | null;
  }[];
  access: {
    planTier: string;
    source: string;
    renewing: boolean;
    paidThrough: string | null;
    accessEndsAt: string | null;
    user: { planTierLocked: boolean };
    subscription: {
      nextBillingTime: string | null;
      currentPeriodEnd: string | null;
    } | null;
  };
};
const date = (v: string | null) =>
  v ? new Date(v).toLocaleString() : "Not scheduled";
export function ReferralAccount({ summary = false }: { summary?: boolean }) {
  const [data, setData] = useState<Data | null>(null),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [accepted, setAccepted] = useState<Record<string, boolean>>({}),
    [incoming, setIncoming] = useState("");
  const load = useCallback(async () => {
    const r = await fetch("/api/referrals", { cache: "no-store" });
    const p = await r.json();
    if (!r.ok) throw new Error(p.error);
    setData(p);
  }, []);
  useEffect(() => {
    setIncoming(
      new URLSearchParams(window.location.search).get("ref")?.slice(0, 64) ??
        "",
    );
    void load().catch((e) => setMessage(e.message));
  }, [load]);
  async function act(action: "code" | "claim", id: string) {
    setBusy(true);
    setMessage("");
    try {
      const r = await fetch("/api/referrals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          id,
          acceptTerms: action === "code" && accepted[id] === true,
        }),
      });
      const p = await r.json();
      if (!r.ok) throw new Error(p.error);
      await load();
      setMessage(
        action === "claim"
          ? "Your Pro reward is activated. Billing has not changed."
          : "Your referral code is ready to share.",
      );
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Unable to update.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className={styles.shell}>
      {message && (
        <p role="status" className={styles.message}>
          {message}
        </p>
      )}
      {!data ? (
        <p>Loading plan access…</p>
      ) : (
        <>
          <section className={styles.card}>
            <h2>Plan & access</h2>
            <p>
              <strong>{data.access.planTier.toUpperCase()}</strong> ·{" "}
              {data.access.source}
            </p>
            <p>
              {data.access.user.planTierLocked
                ? "Your account has an Admin-managed plan override."
                : data.access.renewing
                  ? `Next renewal: ${date(data.access.subscription?.nextBillingTime ?? data.access.subscription?.currentPeriodEnd ?? null)}`
                  : data.access.planTier === "pro"
                    ? `Pro access ends: ${date(data.access.accessEndsAt)}`
                    : "You can keep using Clover for free."}
            </p>
            {data.access.paidThrough && (
              <p>Paid through: {date(data.access.paidThrough)}</p>
            )}
            <a href={summary ? "/referrals" : "/settings/plan"}>
              {summary ? "Refer & Earn →" : "Manage plan →"}
            </a>
          </section>
          {!summary && (
            <>
              {incoming && (
                <section className={styles.card}>
                  <h2>You have a referral code</h2>
                  <p className={styles.code}>{incoming}</p>
                  <p>
                    Enter this code when starting an eligible Pro subscription.
                    Eligibility and campaign terms are checked before checkout.
                  </p>
                  <a
                    href={`/settings/plan?ref=${encodeURIComponent(incoming)}`}
                  >
                    View Pro and use this code →
                  </a>
                </section>
              )}
              <section className={styles.stack}>
                <h2>Refer & Earn</h2>
                <p>
                  Share your code with a friend. Eligible, confirmed first paid
                  purchases earn Pro months after the campaign’s review period.
                </p>
                {!data.campaigns.length && (
                  <p>
                    No referral campaigns are currently open. Any existing
                    rewards remain listed below.
                  </p>
                )}
                {data.campaigns.map((c) => (
                  <article className={styles.card} key={c.id}>
                    <h3>{c.name}</h3>
                    <p>New referrals accepted until {date(c.endsAt)}</p>
                    <details>
                      <summary>Campaign terms</summary>
                      <p className={styles.terms}>{c.terms}</p>
                    </details>
                    {c.codes[0] ? (
                      <>
                        <p className={styles.code}>{c.codes[0].code}</p>
                        <button
                          onClick={() => {
                            void navigator.clipboard
                              .writeText(
                                `${window.location.origin}/referrals?ref=${encodeURIComponent(c.codes[0].code)}`,
                              )
                              .then(() => setMessage("Referral link copied."))
                              .catch(() =>
                                setMessage(
                                  `Share this code: ${c.codes[0].code}`,
                                ),
                              );
                          }}
                        >
                          Copy referral link
                        </button>
                      </>
                    ) : (
                      <>
                        <label
                          className={styles.row}
                          style={{ display: "flex", marginBlock: 12 }}
                        >
                          <input
                            style={{ width: 20, minHeight: 20 }}
                            type="checkbox"
                            checked={accepted[c.id] ?? false}
                            onChange={(e) =>
                              setAccepted({
                                ...accepted,
                                [c.id]: e.target.checked,
                              })
                            }
                          />
                          I have read and accept the campaign terms.
                        </label>
                        <button
                          disabled={busy || !data.verified || !accepted[c.id]}
                          onClick={() => void act("code", c.id)}
                        >
                          Get my referral code
                        </button>
                        {!data.verified && (
                          <p>Verify your email to participate.</p>
                        )}
                      </>
                    )}
                  </article>
                ))}
              </section>
              <section className={styles.card}>
                <h2>Your rewards</h2>
                <p>
                  Active paid subscribers bank rewards. Activating a reward
                  never postpones a charge. After renewal is cancelled, you can
                  activate banked time to start after your paid period. Annual
                  subscribers use the same rule.
                </p>
                <div className={styles.stack}>
                  {data.rewards.length ? (
                    data.rewards.map((r) => {
                      const ready =
                          r.status === "pending" &&
                          new Date(r.availableAt) <= new Date(),
                        expired = Boolean(
                          r.expiresAt &&
                          new Date(r.expiresAt) <= new Date() &&
                          !r.claimedAt,
                        );
                      return (
                        <article key={r.id}>
                          <strong>
                            {r.months} Pro month(s) ·{" "}
                            {expired
                              ? "Expired"
                              : ready
                                ? "Available / banked"
                                : r.status}
                          </strong>
                          <p>
                            Available from {date(r.availableAt)}
                            {r.expiresAt
                              ? ` · Activate by ${date(r.expiresAt)}`
                              : " · No redemption expiry"}
                          </p>
                          {ready && !expired && (
                            <button
                              disabled={
                                busy ||
                                data.access.renewing ||
                                data.access.user.planTierLocked
                              }
                              onClick={() => void act("claim", r.id)}
                            >
                              Activate reward
                            </button>
                          )}
                        </article>
                      );
                    })
                  ) : (
                    <p>No rewards yet.</p>
                  )}
                </div>
              </section>
            </>
          )}
        </>
      )}
    </div>
  );
}
