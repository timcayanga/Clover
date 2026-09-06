"use client";
import { useCallback, useEffect, useState } from "react";
import { campaignRulesSchema } from "@/lib/growth-rules";
import type { z } from "zod";
import styles from "./growth.module.css";
type Rules = z.infer<typeof campaignRulesSchema>;
type Campaign = {
  id: string;
  name: string;
  status: string;
  startsAt: string;
  endsAt: string;
  rules: Rules;
  terms: string;
  publishedAt: string | null;
};
type Reward = {
  id: string;
  campaignId: string;
  referrerId: string;
  referredId: string;
  months: number;
  status: string;
  availableAt: string;
  reason: string | null;
};
type Data = {
  campaigns: Campaign[];
  rewards: Reward[];
  counts: {
    campaignId: string;
    status: string;
    _count: number;
    _sum: { months: number | null };
  }[];
  checkouts: { campaignId: string; _count: number }[];
  history?: {
    id: string;
    actorId: string;
    action: string;
    reason: string;
    createdAt: string;
  }[];
};
const local = (v: string) => {
  const d = new Date(v);
  return new Date(+d - d.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
};
const fresh = () => ({
  name: "Refer a friend to Clover Pro",
  startsAt: new Date().toISOString(),
  endsAt: new Date(Date.now() + 90 * 86400000).toISOString(),
  rules: campaignRulesSchema.parse({}),
  terms:
    "Refer a different, verified Clover user who makes their first paid Pro purchase using your code. Earn one calendar month of Pro after a 14-day review period. Monthly and annual purchases qualify. Self-referrals are not allowed. Refunds, reversals, and disputes can invalidate rewards. Rewards for active paid subscribers are banked and do not change provider charges. Campaign and per-person limits apply. Review and finalize these terms before publishing.",
});
export function AdminCampaigns() {
  const [data, setData] = useState<Data>({
      campaigns: [],
      rewards: [],
      counts: [],
      checkouts: [],
    }),
    [draft, setDraft] = useState(fresh),
    [id, setId] = useState(""),
    [reason, setReason] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [country, setCountry] = useState("PH"),
    [interval, setInterval] = useState("monthly");
  const load = useCallback(async () => {
    const r = await fetch("/api/admin/campaigns", { cache: "no-store" });
    const p = await r.json();
    if (!r.ok) throw new Error(p.error);
    setData(p);
  }, []);
  useEffect(() => {
    void load().catch((e) => setMessage(e.message));
  }, [load]);
  async function action(payload: Record<string, unknown>) {
    setBusy(true);
    setMessage("");
    try {
      const r = await fetch("/api/admin/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason, ...payload }),
      });
      const p = await r.json();
      if (!r.ok) throw new Error(p.error);
      setMessage(
        payload.action === "preview"
          ? p.result
          : "Saved. Existing attributed referrals keep their original rules and terms.",
      );
      if (payload.action !== "preview") {
        await load();
        if (payload.action === "save") setId(p.result.id);
      }
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Unable to save.");
    } finally {
      setBusy(false);
    }
  }
  const rule = (key: keyof Rules, value: unknown) =>
    setDraft((d) => ({ ...d, rules: { ...d.rules, [key]: value } }));
  const published = Boolean(
    data.campaigns.find((c) => c.id === id)?.publishedAt,
  );
  return (
    <div className={styles.shell}>
      <p>
        Admin manages production campaigns. Create referral campaigns, review
        eligibility, and manage earned Pro time. Campaigns start as drafts.
        Published rules and terms are immutable; duplicate a campaign to change
        them.
      </p>
      {message && (
        <p role="status" className={styles.message}>
          {message}
        </p>
      )}
      <section className={styles.card}>
        <h2>
          {id
            ? published
              ? "Published campaign"
              : "Edit draft"
            : "New campaign"}
        </h2>
        <form
          className={styles.stack}
          onSubmit={(e) => {
            e.preventDefault();
            void action({
              action: "save",
              id: id || undefined,
              campaign: draft,
            });
          }}
        >
          <label>
            Name
            <input
              value={draft.name}
              disabled={published}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              required
              maxLength={100}
            />
          </label>
          <div className={styles.grid}>
            <label>
              Starts (your local timezone)
              <input
                type="datetime-local"
                disabled={published}
                value={local(draft.startsAt)}
                required
                onChange={(e) => {
                  if (e.target.value)
                    setDraft({
                      ...draft,
                      startsAt: new Date(e.target.value).toISOString(),
                    });
                }}
              />
            </label>
            <label>
              Ends (your local timezone)
              <input
                type="datetime-local"
                disabled={published}
                value={local(draft.endsAt)}
                required
                onChange={(e) => {
                  if (e.target.value)
                    setDraft({
                      ...draft,
                      endsAt: new Date(e.target.value).toISOString(),
                    });
                }}
              />
            </label>
          </div>
          <div className={styles.grid}>
            {(
              [
                ["months", "Pro months per referral", 1, 12],
                ["holdDays", "Payment review period (days)", 0, 90],
                ["purchaseDays", "Checkout purchase window (days)", 1, 90],
                ["maxPerReferrer", "Rewards per referrer", 1, 1000],
                ["maxRewards", "Total campaign rewards", 1, 100000],
              ] as const
            ).map(([key, label, min, max]) => (
              <label key={key}>
                {label}
                <input
                  type="number"
                  value={draft.rules[key]}
                  disabled={published}
                  min={min}
                  max={max}
                  required
                  onChange={(e) => rule(key, Number(e.target.value))}
                />
              </label>
            ))}
            <label>
              Reward redemption expiry (days; blank = no expiry)
              <input
                type="number"
                min={1}
                max={730}
                disabled={published}
                value={draft.rules.redemptionDays ?? ""}
                onChange={(e) =>
                  rule(
                    "redemptionDays",
                    e.target.value ? Number(e.target.value) : null,
                  )
                }
              />
            </label>
            <label>
              Eligible billing intervals
              <select
                disabled={published}
                value={
                  draft.rules.intervals.length === 2
                    ? "both"
                    : draft.rules.intervals[0]
                }
                onChange={(e) =>
                  rule(
                    "intervals",
                    e.target.value === "both"
                      ? ["monthly", "annual"]
                      : [e.target.value],
                  )
                }
              >
                <option value="both">Monthly and annual</option>
                <option value="monthly">Monthly only</option>
                <option value="annual">Annual only</option>
              </select>
            </label>
            <label>
              Countries (ISO codes, comma-separated; blank = global)
              <input
                disabled={published}
                value={draft.rules.countries.join(",")}
                onChange={(e) =>
                  rule(
                    "countries",
                    e.target.value
                      .toUpperCase()
                      .split(",")
                      .map((x) => x.trim()),
                  )
                }
                onBlur={() =>
                  rule("countries", draft.rules.countries.filter(Boolean))
                }
                placeholder="PH,US"
              />
            </label>
          </div>
          <p className={styles.note}>
            Fixed safeguards: verified accounts, first paid purchase only, no
            self-referrals, one reward per referred customer, and verified
            positive payments. Referral rewards stack as calendar months. Active
            subscribers bank rewards; billing is never postponed automatically.
          </p>
          <label>
            Campaign terms
            <textarea
              disabled={published}
              value={draft.terms}
              minLength={40}
              maxLength={12000}
              required
              onChange={(e) => setDraft({ ...draft, terms: e.target.value })}
            />
          </label>
          <p className={styles.note}>
            Draft wording is a starting point. Make sure these terms match your
            selected settings and have been reviewed before activation.
          </p>
          <label>
            Reason for this change
            <input
              value={reason}
              minLength={5}
              maxLength={1000}
              required
              onChange={(e) => setReason(e.target.value)}
              placeholder="Launch promotion, schedule change, review decision…"
            />
          </label>
          <div className={styles.row}>
            <button className={styles.primary} disabled={busy || published}>
              Save draft
            </button>
            <button
              type="button"
              onClick={() => {
                setId("");
                setDraft(fresh());
                setReason("");
              }}
            >
              New campaign
            </button>
            {id && (
              <button
                type="button"
                onClick={() => {
                  setId("");
                  setDraft({ ...draft, name: `${draft.name} — next version` });
                  setMessage(
                    "New draft version. Save it to issue a new campaign and codes; existing referrals retain the old terms.",
                  );
                }}
              >
                Duplicate as new version
              </button>
            )}
          </div>
        </form>
      </section>
      <section className={styles.card}>
        <h2>Preview eligibility</h2>
        <div className={styles.row}>
          <label>
            Country
            <input
              maxLength={2}
              value={country}
              onChange={(e) => setCountry(e.target.value.toUpperCase())}
            />
          </label>
          <label>
            Billing interval
            <select
              value={interval}
              onChange={(e) => setInterval(e.target.value)}
            >
              <option value="monthly">Monthly</option>
              <option value="annual">Annual</option>
            </select>
          </label>
          <button
            disabled={busy}
            onClick={() =>
              void action({
                action: "preview",
                campaign: draft,
                country,
                interval,
                reason: "Preview campaign eligibility",
              })
            }
          >
            Test current rules
          </button>
        </div>
      </section>
      <section className={styles.stack}>
        <h2>Campaigns</h2>
        {!data.campaigns.length && (
          <p>
            No campaigns yet. Nothing is live until you publish a saved draft.
          </p>
        )}
        {data.campaigns.map((c) => (
          <article className={styles.card} key={c.id}>
            <h3>{c.name}</h3>
            <p>
              {c.status} · {new Date(c.startsAt).toLocaleDateString()}–
              {new Date(c.endsAt).toLocaleDateString()}
            </p>
            <div className={styles.metrics}>
              <div>
                <strong>
                  {data.checkouts.find((x) => x.campaignId === c.id)?._count ??
                    0}
                </strong>
                Attributed checkouts
              </div>
              <div>
                <strong>
                  {data.counts
                    .filter((x) => x.campaignId === c.id)
                    .reduce((n, x) => n + x._count, 0)}
                </strong>
                Qualified / flagged referrals
              </div>
              <div>
                <strong>
                  {data.counts
                    .filter(
                      (x) => x.campaignId === c.id && x.status !== "revoked",
                    )
                    .reduce((n, x) => n + (x._sum.months ?? 0), 0)}
                </strong>
                Pro months awarded / pending
              </div>
            </div>
            <div className={styles.row}>
              <button
                onClick={() => {
                  setId(c.id);
                  setDraft({
                    name: c.name,
                    startsAt: c.startsAt,
                    endsAt: c.endsAt,
                    rules: c.rules,
                    terms: c.terms,
                  });
                  setMessage("Campaign selected in the editor above.");
                }}
              >
                View / edit
              </button>
              {["scheduled", "active", "paused", "ended"].map((status) => (
                <button
                  key={status}
                  disabled={busy || c.status === status || c.status === "ended"}
                  onClick={() => {
                    if (
                      window.confirm(
                        `Set ${c.name} to ${status}? Published rules and terms cannot be edited afterward.`,
                      )
                    )
                      void action({ action: "status", id: c.id, status });
                  }}
                >
                  {status}
                </button>
              ))}
            </div>
          </article>
        ))}
      </section>
      <section className={styles.card}>
        <h2>Recent rewards & review queue</h2>
        <p className={styles.note}>
          Latest 100 rewards. Use the reason field above for review decisions.
          Revoking a claimed reward also revokes its complimentary grant; it
          does not refund or cancel billing.
        </p>
        <div className={styles.stack}>
          {data.rewards.map((r) => (
            <article key={r.id}>
              <strong>
                {r.months} Pro month(s) · {r.status}
              </strong>
              <p>
                Referrer:{" "}
                <a href={`/admin/users/${r.referrerId}/plan`}>{r.referrerId}</a>{" "}
                · Referred customer:{" "}
                <a href={`/admin/users/${r.referredId}/plan`}>{r.referredId}</a>
              </p>
              <p>
                Available: {new Date(r.availableAt).toLocaleString()}{" "}
                {r.reason && `· ${r.reason}`}
              </p>
              {r.status === "review" && (
                <div className={styles.row}>
                  <button
                    disabled={busy}
                    onClick={() =>
                      void action({
                        action: "review",
                        id: r.id,
                        decision: "release",
                      })
                    }
                  >
                    Release after review
                  </button>
                  <button
                    disabled={busy}
                    className={styles.danger}
                    onClick={() => {
                      if (
                        window.confirm(
                          "Revoke this reward and any linked grant?",
                        )
                      )
                        void action({
                          action: "review",
                          id: r.id,
                          decision: "revoke",
                        });
                    }}
                  >
                    Revoke reward
                  </button>
                </div>
              )}
            </article>
          ))}
        </div>
      </section>
      <section className={styles.card}>
        <h2>Campaign & reward audit history</h2>
        <div className={styles.history}>
          {data.history?.map((h) => (
            <p key={h.id}>
              {new Date(h.createdAt).toLocaleString()} · {h.actorId} ·{" "}
              {h.action}
              <br />
              {h.reason}
            </p>
          ))}
        </div>
      </section>
    </div>
  );
}
