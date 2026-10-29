"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { AnimatedTabs } from "./animated-tabs";
import {
  CircleTabIcon,
  CircleEmpty,
  CircleOverviewReports,
  CirclePlanningCard,
  CircleActivityIcon,
} from "./circle-presentation";
import { createCircleAvatarDataUrl } from "@/lib/circle-photo";
import { CategoryBrandMark } from "./category-brand-mark";
import { readSelectedWorkspaceId } from "@/lib/workspace-selection";
import type { CircleSummary, CircleExpenseSummary } from "@/lib/circles";
import { formatCurrencyAmount as money } from "@/lib/currency-format";
import { getCurrencyCatalogCodes } from "@/lib/currencies";
import { getNavigationIconSrc } from "@/lib/navigation-icons";
import { readRegionalPreferences } from "@/lib/regional-preferences";
import { SplitItemGrid } from "./split-item-grid";
import {
  properLabel,
  suggestCircleDate,
  currencyTotals,
} from "../../shared/circle-experience";
import { displayDate, parseDisplayDate } from "../../shared/localized-date";
import {
  splitItemTotals,
  type SplitItem,
} from "../../shared/split-bill-experience";
type Row = {
  id: string;
  merchantRaw: string;
  merchantClean?: string | null;
  amount: string;
  currency: string;
  date: string;
  categoryName?: string | null;
  type: string;
  merchantLogoUrl?: string | null;
};
type Form = {
  action: string;
  id?: string;
  name?: string;
  title?: string;
  displayName?: string;
  avatarUrl?: string | null;
  viewOnly?: boolean;
  targetAmount?: number;
  amount?: number | null;
  currency?: string;
  cadence?: string;
  recurrence?: string;
  targetDate?: string | null;
  nextDueDate?: string | null;
  assignedMemberId?: string | null;
  assignedMemberIds?: string[];
  isActive?: boolean;
  status?: string;
  role?: string;
  isOwner?: boolean;
  startsAt?: string | null;
  endsAt?: string | null;
};
export function CircleDetailWorkspace({
  circle,
  onChanged,
}: {
  circle: CircleSummary;
  onChanged: () => Promise<void>;
}) {
  const [tab, setTab] = useState("Overview"),
    [form, setForm] = useState<Form | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [query, setQuery] = useState(""),
    [page, setPage] = useState(1),
    [rows, setRows] = useState<Row[]>([]),
    [total, setTotal] = useState(0),
    [currency, setCurrency] = useState(circle.currency),
    [cadence, setCadence] = useState("monthly"),
    [date, setDate] = useState(suggestCircleDate("monthly")),
    [assigned, setAssigned] = useState<string[]>([]),
    [format, setFormat] = useState("MM/DD/YYYY"),
    [customExpense, setCustomExpense] = useState<string | null>(null),
    [photo, setPhoto] = useState<string | null | undefined>(),
    [photoBusy, setPhotoBusy] = useState(false);
  const sentinel = useRef<HTMLDivElement>(null),
    lock = useRef(false),
    loadingRows = useRef(false);
  const canEdit = circle.role !== "participant",
    members = circle.members.filter((m) => m.status === "active"),
    people = members.map((m) => ({
      id: m.id,
      name: m.isMe ? "Me" : m.displayName,
      avatarUrl: m.avatarUrl,
    }));
  const [listRevision, setListRevision] = useState(0);
  useEffect(() => {
    const refresh = () => {
      setPage(1);
      setListRevision((n) => n + 1);
    };
    window.addEventListener("clover:transaction-created", refresh);
    return () =>
      window.removeEventListener("clover:transaction-created", refresh);
  }, []);
  useEffect(() => setFormat(readRegionalPreferences().dateFormat), []);
  useEffect(() => {
    if (form?.action !== "share_transaction") return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      loadingRows.current = true;
      void fetch(
        `/api/transactions?workspaceId=${encodeURIComponent(readSelectedWorkspaceId() ?? "")}&query=${encodeURIComponent(query)}&page=${page}&pageSize=30&summaryMode=rows&types=expense`,
        { signal: controller.signal },
      )
        .then(async (r) => {
          const d = await r.json();
          if (!r.ok) throw new Error(d.error ?? "Unable to load transactions.");
          setRows((old) =>
            page === 1
              ? d.transactions
              : [...old, ...d.transactions].filter(
                  (x, i, a) => a.findIndex((y) => y.id === x.id) === i,
                ),
          );
          setTotal(d.totalCount);
        })
        .catch((e) => {
          if (!controller.signal.aborted) setError(e.message);
        })
        .finally(() => {
          loadingRows.current = false;
        });
    }, 180);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [form?.action, query, page, listRevision]);
  useEffect(() => {
    if (!sentinel.current || page * 30 >= total) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!loadingRows.current && entries.some((e) => e.isIntersecting))
          setPage((n) => n + 1);
      },
      { rootMargin: "150px" },
    );
    observer.observe(sentinel.current);
    return () => observer.disconnect();
  }, [page, total, rows]);
  const run = async (body: unknown, close = true) => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const r = await fetch(`/api/circles/${circle.id}/resources`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Unable to save.");
      await onChanged();
      if (close) setForm(null);
    } catch (e) {
      setError((e as Error).message);
      throw e;
    } finally {
      setBusy(false);
      lock.current = false;
    }
  };
  const open = (f: Form) => {
    setForm(f);
    setPhoto(undefined);
    setError("");
    setCurrency(f.currency ?? circle.currency);
    setCadence(f.cadence ?? f.recurrence ?? "monthly");
    setDate(
      (f.targetDate ?? f.nextDueDate)?.slice(0, 10) ??
        suggestCircleDate(
          f.action.includes("goal")
            ? "quarterly"
            : f.action.includes("contribution")
              ? "once"
              : (f.recurrence ?? "monthly"),
        ),
    );
    setAssigned(
      f.assignedMemberIds ??
        (f.assignedMemberId ? [f.assignedMemberId] : members.map((m) => m.id)),
    );
  };
  const save = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!form) return;
    const fd = new FormData(e.currentTarget),
      action = form.action;
    const name = String(fd.get("name") ?? "").trim(),
      amount = Number(fd.get("amount"));
    const base = { action, ...(form.id ? { id: form.id } : {}) };
    let body: Record<string, unknown> = { ...base };
    if (action.includes("member") || action === "add_participant")
      body = {
        ...base,
        displayName: name,
        ...(photo !== undefined ? { avatarUrl: photo } : {}),
        role: fd.get("role") ?? form.role ?? "participant",
      };
    else if (action === "invite") {
      void fetch(`/api/circles/${circle.id}/invitations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: fd.get("email"),
          role: fd.get("role") ?? "member",
        }),
      })
        .then(async (r) => {
          if (!r.ok)
            throw new Error((await r.json()).error ?? "Unable to invite.");
          setForm(null);
          await onChanged();
        })
        .catch((e) => setError(e.message));
      return;
    } else if (action === "add_contribution")
      body = {
        ...base,
        amount,
        currency,
        memberId: fd.get("memberId") || null,
        contributionDate: date ? parseDisplayDate(date, format) : undefined,
        note: fd.get("note"),
      };
    else if (action.includes("commitment") && !assigned.length) {
      setError("Choose at least one person.");
      return;
    } else if (action.includes("commitment"))
      body = {
        ...base,
        title: name,
        amount,
        currency,
        recurrence: cadence,
        nextDueDate: date ? parseDisplayDate(date, format) : null,
        assignedMemberIds: assigned,
        isActive: form.isActive ?? true,
      };
    else
      body = {
        ...base,
        name,
        targetAmount: amount,
        currency,
        ...(action.includes("budget")
          ? {
              cadence,
              startsAt:
                cadence === "once"
                  ? parseDisplayDate(
                      String(fd.get("startsAt") || suggestCircleDate("once")),
                      format,
                    )
                  : null,
              endsAt:
                cadence === "once"
                  ? parseDisplayDate(
                      String(
                        fd.get("endsAt") || suggestCircleDate("quarterly"),
                      ),
                      format,
                    )
                  : null,
            }
          : {
              targetDate: date ? parseDisplayDate(date, format) : null,
              status: form.status ?? "active",
            }),
      };
    void run(body).catch(() => {});
  };
  const menu = (label: string, click: () => void) => (
    <button
      type="button"
      className="circle-text-action"
      aria-label={label}
      onClick={click}
    >
      •••
    </button>
  );
  const textAction = (label: string, click: () => void) => (
    <button type="button" className="circle-text-action" onClick={click}>
      {label}
    </button>
  );
  const avatar = (name: string, url?: string | null) => (
    <span className="circles-avatar">
      {url ? (
        <img
          src={url}
          alt=""
          style={{
            width: "100%",
            height: "100%",
            borderRadius: "50%",
            objectFit: "cover",
          }}
        />
      ) : (
        name.slice(0, 1)
      )}
    </span>
  );
  const tabs = [
    "Overview",
    "Expenses",
    "Budgets",
    "Goals",
    "Recurring",
    "Contributions",
    "Activity",
    "People",
  ];
  return (
    <div className="circles-panel-stack circle-detail">
      <AnimatedTabs
        className="circles-section-tabs circle-product-tabs"
        activeKey={tab}
        onChange={(key) => {
          setTab(key);
          setForm(null);
        }}
        tabs={tabs.map((t) => ({
          key: t,
          label: t,
          icon: <CircleTabIcon name={t} />,
        }))}
      />
      {error ? <p role="alert">{error}</p> : null}
      {form && form.action !== "share_transaction" ? (
        <section className="panel glass">
          <button
            type="button"
            className="circle-text-action"
            onClick={() => setForm(null)}
          >
            ‹ Back to {tab}
          </button>
          <h3>
            {form.viewOnly
              ? `${tab} Details`
              : form.action === "update_member"
                ? "Person Profile"
                : properLabel(form.action.replace("commitment", "recurring"))}
          </h3>
          <form
            className="circles-inline-form"
            key={form.action + form.id}
            onSubmit={(e) => {
              try {
                save(e);
              } catch (error) {
                setError((error as Error).message);
              }
            }}
          >
            <fieldset className="circle-form-fields" disabled={form.viewOnly}>
              {form.action === "update_member" ? (
                <div className="circle-person-photo">
                  {avatar(
                    form.displayName ?? "Person",
                    photo === undefined ? form.avatarUrl : photo,
                  )}
                  {circle.role === "organizer" ? (
                    <>
                      <label className="circle-text-action">
                        Change Photo
                        <input
                          type="file"
                          accept="image/*"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              setPhotoBusy(true);
                              void createCircleAvatarDataUrl(file)
                                .then(setPhoto)
                                .catch((e) => setError(e.message))
                                .finally(() => setPhotoBusy(false));
                            }
                          }}
                        />
                      </label>
                      <button
                        type="button"
                        className="circle-text-action"
                        onClick={() => setPhoto(null)}
                      >
                        Use Default Photo
                      </button>
                    </>
                  ) : null}
                </div>
              ) : null}
              {!["add_contribution", "invite"].includes(form.action) ? (
                <label>
                  Name
                  <input
                    name="name"
                    disabled={
                      form.action === "update_member" &&
                      circle.role !== "organizer"
                    }
                    required
                    maxLength={120}
                    defaultValue={
                      form.name ?? form.title ?? form.displayName ?? ""
                    }
                  />
                </label>
              ) : null}
              {form.action === "invite" ? (
                <label>
                  Email
                  <input type="email" required name="email" />
                </label>
              ) : null}
              {form.action.includes("member") ||
              form.action === "add_participant" ||
              form.action === "invite" ? (
                !form.isOwner ? (
                  <label>
                    Member Type
                    <select
                      name="role"
                      disabled={
                        form.action === "update_member" &&
                        circle.role !== "organizer"
                      }
                      defaultValue={form.role ?? "member"}
                    >
                      {["participant", "member", "organizer"].map((r) => (
                        <option key={r} value={r}>
                          {properLabel(r)}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null
              ) : (
                <>
                  <label>
                    Currency
                    <select
                      value={currency}
                      onChange={(e) => setCurrency(e.target.value)}
                    >
                      {getCurrencyCatalogCodes().map((c) => (
                        <option key={c}>{c}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Amount
                    <input
                      name="amount"
                      type="number"
                      step="0.01"
                      min="0.01"
                      required
                      defaultValue={form.targetAmount ?? form.amount ?? ""}
                    />
                  </label>
                </>
              )}
              {form.action.includes("budget") ||
              form.action.includes("commitment") ? (
                <label>
                  Time Period
                  <select
                    value={cadence}
                    onChange={(e) => {
                      setCadence(e.target.value);
                      setDate(suggestCircleDate(e.target.value));
                    }}
                  >
                    {[
                      "once",
                      "weekly",
                      "biweekly",
                      "monthly",
                      "quarterly",
                      "annual",
                    ].map((c) => (
                      <option key={c} value={c}>
                        {c === "once" ? "One-Time" : properLabel(c)}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              {form.action.includes("budget") && cadence === "once" ? (
                <>
                  <label>
                    Start Date
                    <input
                      name="startsAt"
                      type="text"
                      placeholder={format}
                      defaultValue={displayDate(
                        form.startsAt?.slice(0, 10) ??
                          suggestCircleDate("once"),
                        format,
                      )}
                    />
                  </label>
                  <label>
                    End Date
                    <input
                      name="endsAt"
                      type="text"
                      placeholder={format}
                      defaultValue={displayDate(
                        form.endsAt?.slice(0, 10) ??
                          suggestCircleDate("quarterly"),
                        format,
                      )}
                    />
                  </label>
                </>
              ) : null}
              {form.action.includes("goal") ||
              form.action.includes("commitment") ||
              form.action === "add_contribution" ? (
                <label>
                  {form.action.includes("goal")
                    ? "Time Period · Target Date"
                    : form.action === "add_contribution"
                      ? "Contribution Date"
                      : "Time Period · Next Due Date"}
                  <input
                    aria-label={`Date (${format})`}
                    type="text"
                    placeholder={format}
                    value={displayDate(date, format)}
                    onChange={(e) => {
                      const value = e.target.value;
                      try {
                        setDate(
                          parseDisplayDate(value, format)?.slice(0, 10) ?? "",
                        );
                      } catch {
                        setDate(value);
                      }
                    }}
                  />
                </label>
              ) : null}
              {form.action.includes("commitment") ? (
                <fieldset>
                  <legend>Assigned To</legend>
                  {members.map((m) => (
                    <label key={m.id}>
                      <input
                        type="checkbox"
                        checked={assigned.includes(m.id)}
                        onChange={(e) =>
                          setAssigned((old) =>
                            e.target.checked
                              ? [...old, m.id]
                              : old.filter((id) => id !== m.id),
                          )
                        }
                      />
                      {avatar(m.displayName, m.avatarUrl)}
                      {m.isMe ? "Me" : m.displayName}
                    </label>
                  ))}
                </fieldset>
              ) : null}
              {form.action === "add_contribution" ? (
                <>
                  <fieldset>
                    <legend>Contributed By</legend>
                    {members
                      .filter((m) => circle.role === "organizer" || m.isMe)
                      .map((m) => (
                        <label
                          key={m.id}
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 8,
                            marginRight: 16,
                          }}
                        >
                          <input
                            type="radio"
                            name="memberId"
                            value={m.id}
                            defaultChecked={
                              m.isMe ||
                              (!members.some((x) => x.isMe) &&
                                m.id === members[0]?.id)
                            }
                          />
                          {avatar(m.displayName, m.avatarUrl)}
                          {m.isMe ? "Me" : m.displayName}
                        </label>
                      ))}
                  </fieldset>
                  <label>
                    Note (Optional)
                    <input name="note" />
                  </label>
                </>
              ) : null}
              {!form.viewOnly ? (
                <button
                  type="submit"
                  className="button button-primary"
                  disabled={
                    busy ||
                    photoBusy ||
                    (form.action === "update_member" &&
                      circle.role !== "organizer")
                  }
                >
                  Save
                </button>
              ) : null}
            </fieldset>
          </form>
        </section>
      ) : null}
      {!form || form.action === "share_transaction" ? (
        <>
          {tab === "Overview" ? (
            <>
              <div className="circles-metric-grid circle-summary-grid">
                {[
                  {
                    title: "Shared Expenses",
                    totals: circle.expenseCurrencyTotals ?? {
                      [circle.currency]: circle.expenseTotalThisMonth,
                    },
                  },
                  {
                    title: "Contributions",
                    totals: circle.contributionCurrencyTotals ?? {
                      [circle.currency]: circle.contributionTotalThisMonth,
                    },
                  },
                ].map((metric) => (
                  <article
                    className="accounts-overview-card summary-aligned-card panel glass"
                    key={metric.title}
                  >
                    <p className="eyebrow">{metric.title}</p>
                    {Object.entries(metric.totals).map(([c, n]) => (
                      <strong
                        key={c}
                        className="accounts-overview-card__amount is-good"
                      >
                        {money(n, c)}
                      </strong>
                    ))}
                  </article>
                ))}
              </div>
              <CircleOverviewReports circle={circle} onNavigate={setTab} />
              {circle.isOwner ? (
                <button
                  className="button button-danger"
                  type="button"
                  onClick={() => {
                    if (
                      window.confirm(
                        "Archive this Circle? Shared history and personal transactions are preserved.",
                      )
                    )
                      void fetch(`/api/circles/${circle.id}/archive`, {
                        method: "POST",
                      })
                        .then((r) => {
                          if (!r.ok) throw new Error("Unable to archive.");
                          return onChanged();
                        })
                        .catch((e) => setError(e.message));
                  }}
                >
                  Archive Circle
                </button>
              ) : null}
            </>
          ) : null}
          {tab === "People" ? (
            <>
              <section className="circle-ledger circle-rows circle-people-ledger">
                <div className="circle-ledger-head">
                  <span />
                  <span>Name</span>
                  <span>Member Type</span>
                  <span />
                </div>
                {circle.members.map((m) => (
                  <article key={m.id}>
                    {avatar(m.displayName, m.avatarUrl)}
                    <div className="circle-rows__body">
                      <span>{m.isMe ? "Me" : m.displayName}</span>
                      <small>{properLabel(m.role)}</small>
                    </div>
                    {menu(`View ${m.displayName}`, () =>
                      open({ ...m, action: "update_member" }),
                    )}
                  </article>
                ))}
                {circle.role === "organizer"
                  ? textAction("+ Add Person", () =>
                      open({ action: "add_participant" }),
                    )
                  : null}
              </section>
              {circle.role === "organizer" ? (
                <button
                  className="button button-primary"
                  onClick={() => open({ action: "invite" })}
                >
                  Invite People
                </button>
              ) : null}
            </>
          ) : null}
          {tab === "Expenses" ? (
            <>
              {form?.action === "share_transaction" ? (
                <section className="panel glass">
                  <button
                    type="button"
                    className="button button-primary"
                    onClick={() =>
                      window.dispatchEvent(
                        new CustomEvent("clover:open-quick-transaction", {
                          detail: { type: "expense" },
                        }),
                      )
                    }
                  >
                    + Add Transaction
                  </button>
                  <label>
                    Search Transactions
                    <input
                      value={query}
                      onChange={(e) => {
                        setQuery(e.target.value);
                        setPage(1);
                        setRows([]);
                        setTotal(0);
                      }}
                    />
                  </label>
                  <div className="circle-rows">
                    {rows
                      .filter((r) => r.type === "expense")
                      .map((r) => (
                        <article key={r.id}>
                          {r.merchantLogoUrl ? (
                            avatar(
                              r.merchantClean ?? r.merchantRaw,
                              r.merchantLogoUrl,
                            )
                          ) : (
                            <CategoryBrandMark
                              categoryName={r.categoryName ?? "Other"}
                              size={32}
                            />
                          )}
                          <div className="circle-rows__body">
                            <strong>{r.merchantClean ?? r.merchantRaw}</strong>
                            <small>{displayDate(r.date, format)}</small>
                          </div>
                          <span className="circle-rows__amount">
                            {money(r.amount, r.currency)}
                          </span>
                          <button
                            type="button"
                            className="circle-text-action"
                            disabled={
                              busy ||
                              circle.expenses.some(
                                (e) => e.transactionId === r.id,
                              )
                            }
                            aria-label={`Share ${r.merchantClean ?? r.merchantRaw}`}
                            onClick={() =>
                              void run(
                                {
                                  action: "share_transaction",
                                  transactionId: r.id,
                                  visibility: "item",
                                },
                                false,
                              ).catch(() => {})
                            }
                          >
                            {circle.expenses.some(
                              (e) => e.transactionId === r.id,
                            )
                              ? "✓"
                              : "+"}
                          </button>
                        </article>
                      ))}
                    <div ref={sentinel} />
                  </div>
                </section>
              ) : null}
              <section className="circle-ledger circle-expense-ledger">
                <div className="circle-ledger-head">
                  <span />
                  <span>Name</span>
                  <span>Date</span>
                  <span>Amount</span>
                  <span />
                </div>
                {circle.expenses.map((e) => (
                  <Expense
                    key={e.id}
                    expense={e}
                    people={people}
                    editable={canEdit && e.canEditSplit !== false}
                    format={format}
                    expanded={customExpense === e.id}
                    onExpand={() =>
                      setCustomExpense(customExpense === e.id ? null : e.id)
                    }
                    onSave={(items) =>
                      run(
                        { action: "update_expense_split", id: e.id, items },
                        false,
                      )
                    }
                    onRemove={() =>
                      void run(
                        { action: "unshare_transaction", id: e.id },
                        false,
                      ).catch(() => {})
                    }
                  />
                ))}
                {!circle.expenses.length ? (
                  <CircleEmpty title="No shared expenses yet" />
                ) : null}
              </section>
              {canEdit
                ? textAction("+ Share Transaction", () => {
                    open({ action: "share_transaction" });
                    setRows([]);
                    setPage(1);
                  })
                : null}
              {canEdit && circle.expenses.length > 0
                ? [
                    ...new Set(
                      circle.expenses
                        .filter(
                          (e) =>
                            e.kind === "shared_transaction" &&
                            e.visibility !== "summary",
                        )
                        .map((e) => e.currency),
                    ),
                  ].map((c) => (
                    <WholeSplit
                      key={
                        c +
                        JSON.stringify(
                          circle.expenses
                            .filter((e) => e.currency === c)
                            .map((e) => [e.id, e.amount, e.splitItems]),
                        )
                      }
                      currency={c}
                      onCustom={setCustomExpense}
                      expenses={circle.expenses.filter(
                        (e) =>
                          e.kind === "shared_transaction" &&
                          e.visibility !== "summary" &&
                          e.canEditSplit !== false &&
                          e.currency === c,
                      )}
                      people={people}
                      onSave={async (items) => {
                        for (const item of items)
                          await run(
                            {
                              action: "update_expense_split",
                              id: item.id,
                              items: [item],
                            },
                            false,
                          );
                      }}
                    />
                  ))
                : null}
            </>
          ) : null}
          {tab === "Budgets" || tab === "Goals" ? (
            <>
              {!(tab === "Budgets" ? circle.budgets : circle.goals).length ? (
                <CircleEmpty
                  title={
                    tab === "Budgets"
                      ? "No shared budgets yet"
                      : "No shared goals yet"
                  }
                  pose={tab === "Budgets" ? "budget" : "savings"}
                />
              ) : null}
              <div className="collection-card-grid">
                {(tab === "Budgets" ? circle.budgets : circle.goals).map(
                  (e) => (
                    <CirclePlanningCard
                      key={e.id}
                      item={e}
                      kind={tab === "Budgets" ? "budget" : "goal"}
                      onOpen={() =>
                        open({
                          ...e,
                          action:
                            tab === "Budgets" ? "update_budget" : "update_goal",
                          viewOnly: !canEdit,
                        })
                      }
                      onEdit={
                        canEdit
                          ? () =>
                              open({
                                ...e,
                                action:
                                  tab === "Budgets"
                                    ? "update_budget"
                                    : "update_goal",
                              })
                          : undefined
                      }
                    />
                  ),
                )}
              </div>
              {canEdit
                ? textAction(
                    tab === "Budgets" ? "+ Add Budget" : "+ Add Goal",
                    () =>
                      open({
                        action:
                          tab === "Budgets" ? "create_budget" : "create_goal",
                      }),
                  )
                : null}
            </>
          ) : null}
          {tab === "Recurring" ? (
            <>
              {!circle.commitments.length ? (
                <CircleEmpty
                  title="No shared recurring payments yet"
                  pose="calendar"
                />
              ) : null}
              <div className="circle-ledger">
                {circle.commitments.map((e) => (
                  <section key={e.id} className="circle-recurring-row">
                    <img
                      src={getNavigationIconSrc("recurring")}
                      width={30}
                      height={30}
                      alt=""
                    />
                    <div>
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                        }}
                      >
                        <h3>{e.title}</h3>
                        {canEdit
                          ? menu("Edit Recurring", () =>
                              open({ ...e, action: "update_commitment" }),
                            )
                          : null}
                      </div>
                      <p>
                        {money(e.amount ?? 0, e.currency)} ·{" "}
                        {properLabel(e.recurrence)}
                      </p>
                      <p>
                        {(e.assignedMemberIds?.length
                          ? members
                              .filter((m) =>
                                e.assignedMemberIds!.includes(m.id),
                              )
                              .map((m) => (m.isMe ? "Me" : m.displayName))
                          : [e.assignedMemberName ?? "Everyone"]
                        ).join(", ")}
                      </p>
                      <p>
                        Next Due ·{" "}
                        {e.nextDueDate
                          ? displayDate(e.nextDueDate, format)
                          : "Choose a Date"}
                      </p>
                    </div>
                  </section>
                ))}
              </div>
              {canEdit
                ? textAction("+ Add Recurring", () =>
                    open({ action: "create_commitment" }),
                  )
                : null}
            </>
          ) : null}
          {tab === "Contributions" ? (
            <>
              {!circle.contributions.length ? (
                <CircleEmpty title="No contributions yet" pose="savings" />
              ) : null}
              <section className="circle-ledger circle-rows circle-contrib-ledger">
                <div className="circle-ledger-head">
                  <span />
                  <span>Name</span>
                  <span>Date</span>
                  <span>Amount</span>
                </div>
                {circle.contributions.map((e) => (
                  <article key={e.id}>
                    {avatar(
                      e.memberName ?? "Me",
                      members.find((m) => m.id === e.memberId)?.avatarUrl,
                    )}
                    <div className="circle-rows__body">
                      <span>{e.memberName ?? "Me"}</span>
                      <small>{displayDate(e.contributionDate, format)}</small>
                    </div>
                    <span>{money(e.amount, e.currency)}</span>
                  </article>
                ))}
              </section>
              {canEdit
                ? textAction("+ Add Contribution", () =>
                    open({ action: "add_contribution" }),
                  )
                : null}
            </>
          ) : null}
          {tab === "Activity" ? (
            <section className="circle-ledger circle-rows">
              {!circle.activities.length ? (
                <CircleEmpty title="No Circle activity yet" />
              ) : null}
              {circle.activities.map((e) => (
                <article key={e.id}>
                  <CircleActivityIcon action={e.action} />
                  <div className="circle-rows__body">
                    <span>{e.summary}</span>
                    <small>{displayDate(e.createdAt, format)}</small>
                  </div>
                </article>
              ))}
            </section>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
function Expense({
  expense: e,
  people,
  editable,
  format,
  onSave,
  onRemove,
  expanded,
  onExpand,
}: {
  expense: CircleExpenseSummary;
  people: { id: string; name: string; avatarUrl?: string | null }[];
  editable: boolean;
  format: string;
  onSave: (items: SplitItem[]) => Promise<void>;
  onRemove: () => void;
  expanded: boolean;
  onExpand: () => void;
}) {
  const [error, setError] = useState("");
  const detailRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (expanded)
      detailRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [expanded]);
  const initial = e.splitItems?.length
    ? e.splitItems
    : e.lineItems?.length
      ? e.lineItems.map((i) => ({
          description: i.description,
          amount: i.amount ?? "0",
          participantIds: people.map((p) => p.id),
        }))
      : [
          {
            description: e.title,
            amount: String(e.amount),
            participantIds: people.map((p) => p.id),
          },
        ];
  const sum = initial.reduce((n, i) => n + Number(i.amount), 0);
  const [items, setItems] = useState<SplitItem[]>(() =>
    sum < e.amount
      ? [
          ...initial,
          {
            description: "Other Charges",
            amount: String(Math.round((e.amount - sum) * 100) / 100),
            participantIds: people.map((p) => p.id),
          },
        ]
      : initial,
  );
  return (
    <article ref={detailRef} className="circle-expense-entry">
      <div className="circle-ledger__row">
        <CategoryBrandMark categoryName={e.categoryName ?? "Other"} size={32} />
        <div className="circle-expense-body">
          {e.kind === "split_bill" ? (
            <Link href={e.href}>{e.title}</Link>
          ) : (
            <button className="circle-text-action" onClick={onExpand}>
              {e.title}
            </button>
          )}
          <small style={{ display: "block" }}>
            {displayDate(e.date, format)}
          </small>
        </div>
        <span
          className="circle-ledger__amount"
          style={{ whiteSpace: "nowrap" }}
        >
          {money(e.amount, e.currency)}
        </span>
        {editable &&
        e.canUnshare !== false &&
        e.kind === "shared_transaction" ? (
          <button
            className="circle-text-action"
            aria-label={`Remove ${e.title} From Circle`}
            onClick={onRemove}
          >
            ×
          </button>
        ) : null}
      </div>
      {expanded && e.visibility !== "summary" ? (
        <section
          className="circle-expense-detail"
          aria-label={`Transaction Details · ${e.title}`}
        >
          <header className="circle-report__head">
            <h3>Transaction Details · {e.title}</h3>
            <button
              type="button"
              className="circle-text-action"
              onClick={onExpand}
            >
              Close
            </button>
          </header>
          <h4>Line Items & Custom Split</h4>
          <SplitItemGrid
            fixedItems
            people={people}
            items={items}
            currency={e.currency}
            onChange={editable ? setItems : undefined}
          />
          {editable ? (
            <button
              className="button button-primary"
              onClick={() =>
                void onSave(items).catch((e) => setError(e.message))
              }
            >
              Save
            </button>
          ) : null}
          {error ? <p role="alert">{error}</p> : null}
        </section>
      ) : null}
    </article>
  );
}
function WholeSplit({
  expenses,
  people,
  currency,
  onSave,
  onCustom,
}: {
  onCustom: (id: string) => void;
  expenses: CircleExpenseSummary[];
  people: { id: string; name: string; avatarUrl?: string | null }[];
  currency: string;
  onSave: (items: SplitItem[]) => Promise<void>;
}) {
  const [items, setItems] = useState<SplitItem[]>(() =>
      expenses.map((e) => {
        if (e.splitItems?.length) {
          const totals = splitItemTotals(people, e.splitItems);
          return {
            id: e.id,
            description: e.title,
            amount: String(e.amount),
            participantIds: people
              .filter((p) => totals[p.id] > 0)
              .map((p) => p.id),
            splitMethod: "exact" as const,
            allocations: people
              .filter((p) => totals[p.id] > 0)
              .map((p) => ({
                participantId: p.id,
                value: String(totals[p.id]),
              })),
          };
        }
        return {
          id: e.id,
          description: e.title,
          amount: String(e.amount),
          participantIds: people.map((p) => p.id),
        };
      }),
    ),
    [busy, setBusy] = useState(false),
    [method, setMethod] = useState("transactions"),
    [error, setError] = useState("");
  return (
    <section className="circle-split-together">
      <h3>Split Together · {currency}</h3>
      {method === "custom" ? (
        <div className="circle-ledger">
          {expenses.map((e) => (
            <button
              key={e.id}
              className="circle-text-action"
              onClick={() => onCustom(e.id)}
            >
              Custom Split · {e.title} ›
            </button>
          ))}
        </div>
      ) : (
        <>
          <SplitItemGrid
            fixedItems
            people={people}
            items={items}
            currency={currency}
            onChange={setItems}
          />
          <button
            className="button button-primary"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              void onSave(items)
                .catch((e) => setError(e.message))
                .finally(() => setBusy(false));
            }}
          >
            Save
          </button>
        </>
      )}
      <label className="circle-split-method">
        Split By
        <select value={method} onChange={(e) => setMethod(e.target.value)}>
          <option value="transactions">Per Transaction</option>
          <option value="custom">Custom Line Items</option>
        </select>
      </label>
      {error ? <p role="alert">{error}</p> : null}
    </section>
  );
}
