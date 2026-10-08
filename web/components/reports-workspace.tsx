"use client";
import { PremiumPreview } from "./contextual-upgrade";
import { ReportDirectory } from "./report-directory";
import { ReportOutlook } from "./report-outlook";
import { ReportRecoveries } from "./report-recoveries";
import { ReportCoverageDetails, ReportSpendingDetails } from "./report-details";
import { exportReport } from "@/lib/report-export-client";
import { reportTransactionParams } from "../../shared/reports/drilldown";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import Link from "next/link";
import { ReportsComparisonChart } from "./reports-comparison-chart";
import { CloverShell } from "./clover-shell";
import { AnimatedTabs } from "./animated-tabs";
import { ReportsTabIcon } from "./reports-tabs";
import { ReportsMoneyOverTimeChart } from "./reports-money-over-time-chart";
import { ReportsCashFlowMap } from "./reports-cash-flow-map";
import { AdviserHeaderLink } from "./adviser-header-link";
import { formatCurrencyAmount } from "@/lib/currency-format";
import {
  defaultReportView,
  reportRanges,
  savingsRate,
  validReportDate,
  type ReportView,
} from "../../shared/reports/analysis";
import {
  reportViewParams,
  type ReportsWorkspace,
  type ReportCurrencyData,
  type SavedReport,
} from "../../shared/reports/workspace";
const tabs = [
  ["overview", "Overview"],
  ["spending", "Spending"],
  ["trends", "Trends"],
  ["advanced", "Insights"],
] as const;
const palette = [
  "#00abc0",
  "#35b878",
  "#8771bb",
  "#d8841e",
  "#db5774",
  "#6286b7",
];
const monthLabel = (s: string) =>
  new Intl.DateTimeFormat("en", { month: "short", year: "2-digit" }).format(
    new Date(s + "-01T12:00:00"),
  );
function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="report-card glass report-v2-panel">
      <h2>{title}</h2>
      {children}
    </section>
  );
}
function Multi({
  label,
  values,
  options,
  onChange,
}: {
  label: string;
  values: string[];
  options: { id: string; name: string }[];
  onChange: (v: string[]) => void;
}) {
  const [search, setSearch] = useState("");
  return (
    <details>
      <summary>
        {label}
        <span>{values.length ? `${values.length} selected` : "All"}</span>
      </summary>
      <button
        type="button"
        className="report-text-action"
        onClick={() => onChange([])}
      >
        Select all
      </button>
      {options.length > 100 ? (
        <p className="muted">Showing up to 100 matches. Search to find more.</p>
      ) : null}
      {options.length > 12 ? (
        <input
          aria-label={`Search ${label}`}
          placeholder={`Search ${label.toLowerCase()}`}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      ) : null}
      {options
        .filter((o) => o.name.toLowerCase().includes(search.toLowerCase()))
        .slice(0, 100)
        .map((o) => (
          <label key={o.id}>
            <input
              type="checkbox"
              checked={values.includes(o.id)}
              onChange={() => {
                const current = values;
                const next = current.includes(o.id)
                  ? current.filter((x) => x !== o.id)
                  : [...current, o.id];
                onChange(next.slice(0, 100));
              }}
            />
            {o.name}
          </label>
        ))}
    </details>
  );
}
export function ReportsWorkspaceView({
  initial,
}: {
  initial: ReportsWorkspace;
}) {
  const [data, setData] = useState(initial),
    [view, setView] = useState(initial.view),
    [draft, setDraft] = useState(initial.view),
    [filters, setFilters] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [savedOpen, setSavedOpen] = useState(false),
    [saved, setSaved] = useState<SavedReport[]>([]),
    [selected, setSelected] = useState<SavedReport | null>(null),
    [name, setName] = useState(""),
    [saving, setSaving] = useState(false),
    [saveError, setSaveError] = useState("");
  const [exporting, setExporting] = useState(false);
  const sequence = useRef(0);
  async function download(format: "csv" | "pdf") {
    setExporting(true);
    setError("");
    try {
      await exportReport(
        {
          ...data,
          view: { ...data.view, trendCategories: view.trendCategories },
        },
        view.section,
        format,
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setExporting(false);
    }
  }
  const api = `/api/reports/workspace?workspaceId=${encodeURIComponent(data.workspaceId)}`;
  async function apply(next: ReportView) {
    const seq = ++sequence.current;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`${api}&${reportViewParams(next)}`, {
        cache: "no-store",
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      if (seq !== sequence.current) return false;
      setData(result);
      setView({
        ...result.view,
        section: next.section,
        chart: next.chart,
        trendCategories: next.trendCategories,
      });
      setDraft(result.view);
      setFilters(false);
      window.history.replaceState(
        null,
        "",
        `/reports?${reportViewParams(next)}`,
      );
      return true;
    } catch (e) {
      if (seq === sequence.current) setError((e as Error).message);
      return false;
    } finally {
      if (seq === sequence.current) setBusy(false);
    }
  }
  const savedUrl = `/api/reports/saved?workspaceId=${encodeURIComponent(data.workspaceId)}`;
  const reloadSaved = useCallback(async () => {
    try {
      const r = await fetch(savedUrl, { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      setSaved(j.reports);
    } catch (e) {
      setSaveError((e as Error).message);
    }
  }, [savedUrl]);
  useEffect(() => {
    if (savedOpen) void reloadSaved();
  }, [savedOpen, reloadSaved]);
  async function save(
    action: "create" | "update" | "delete",
    target = selected,
  ) {
    setSaving(true);
    setSaveError("");
    try {
      const body =
        action === "delete"
          ? { action, id: target?.id, revision: target?.revision }
          : {
              action,
              name,
              view,
              ...(action === "update"
                ? { id: target?.id, revision: target?.revision }
                : {}),
            };
      const r = await fetch(savedUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      setSelected(null);
      setName("");
      await reloadSaved();
    } catch (e) {
      setSaveError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }
  const change = (key: keyof ReportView, value: ReportView[keyof ReportView]) =>
    setDraft((d) => ({ ...d, [key]: value }));
  const tabBar = (
    <AnimatedTabs
      className="reports-top-tabs mobile-icon-tabs"
      activeKey={view.section}
      onChange={(section) =>
        setView((v) => ({ ...v, section: section as ReportView["section"] }))
      }
      tabs={tabs.map(([key, label]) => ({
        key,
        label,
        icon: <ReportsTabIcon section={key} />,
        badge: key === "advanced" ? "Plus" : null,
      }))}
    />
  );
  return (
    <CloverShell
      active="reports"
      title="Reports"
      titleAddon={tabBar}
      mobileSubheader={tabBar}
      mobileLeadingAction={<AdviserHeaderLink />}
      mobileTrailingAction={
        <button
          className="button button-secondary"
          onClick={() => {
            setDraft(view);
            setFilters(!filters);
          }}
          aria-expanded={filters}
        >
          Filters
        </button>
      }
      actions={
        <>
          <AdviserHeaderLink />
          <button
            className="button button-secondary"
            onClick={() => {
              setDraft(view);
              setFilters(!filters);
            }}
            aria-expanded={filters}
          >
            Filters
          </button>
        </>
      }
    >
      <div className="report-v2">
        <div className="report-v2-toolbar">
          <p>
            {data.period.from} to {data.period.to} · {data.timeZone}
          </p>
          <button
            className="report-text-action"
            onClick={() => setSavedOpen(!savedOpen)}
            aria-expanded={savedOpen}
          >
            Saved reports
          </button>
          <button
            className="report-text-action"
            disabled={busy || exporting}
            onClick={() => void download("csv")}
          >
            Export CSV
          </button>
          <button
            className="report-text-action"
            disabled={busy || exporting}
            onClick={() => void download("pdf")}
          >
            {exporting ? "Preparing export…" : "Print / PDF"}
          </button>
        </div>
        {filters ? (
          <Panel title="Filter reports">
            <div className="report-v2-filter">
              <label>
                Period
                <select
                  value={draft.range}
                  onChange={(e) => change("range", e.target.value)}
                >
                  {reportRanges.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </label>
              {draft.range === "custom" ? (
                <>
                  <label>
                    From
                    <input
                      type="date"
                      max={data.today}
                      value={draft.from}
                      onChange={(e) => change("from", e.target.value)}
                    />
                  </label>
                  <label>
                    To
                    <input
                      type="date"
                      max={data.today}
                      value={draft.to}
                      onChange={(e) => change("to", e.target.value)}
                    />
                  </label>
                </>
              ) : null}
              <Multi
                label="Merchants"
                values={draft.merchants ?? []}
                options={(data.merchants ?? []).map((name) => ({
                  id: name,
                  name,
                }))}
                onChange={(value) => change("merchants", value)}
              />
              <Multi
                label="Tags (match any)"
                values={draft.tags ?? []}
                options={data.tags ?? []}
                onChange={(value) => change("tags", value)}
              />
              <label>
                Currency
                <select
                  value={draft.currency}
                  onChange={(e) => change("currency", e.target.value)}
                >
                  <option value="ALL">All currencies</option>
                  {data.currencies.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </label>
              <label>
                Compare with
                <select
                  value={draft.compare}
                  onChange={(e) => change("compare", e.target.value)}
                >
                  <option value="previous">Previous period</option>
                  <option value="year">Previous year</option>
                </select>
              </label>
              <Multi
                label="Accounts"
                options={data.accounts}
                values={draft.accounts}
                onChange={(v) => change("accounts", v)}
              />
              <Multi
                label="Categories"
                options={[
                  { id: "Uncategorized", name: "Uncategorized" },
                  ...data.categories.map((c) => ({ id: c.name, name: c.name })),
                ]}
                values={draft.categories}
                onChange={(v) => change("categories", v)}
              />
              <label>
                Review status
                <select
                  value={draft.review}
                  onChange={(e) => change("review", e.target.value)}
                >
                  <option value="all">All transactions</option>
                  <option value="confirmed">Confirmed or edited</option>
                  <option value="pending">Needs review</option>
                </select>
              </label>
              <label>
                Transfers
                <select
                  value={draft.transfers}
                  onChange={(e) => change("transfers", e.target.value)}
                >
                  <option value="exclude">Excluded</option>
                  <option value="include">Include in activity</option>
                  <option value="only">Transfers only</option>
                </select>
              </label>
            </div>
            <p className="muted">
              Category and review filters apply to transaction reports. Balance
              charts retain all account movements. Transfers never count as
              income or expenses.
            </p>
            <div className="report-v2-actions">
              <button
                className="button button-secondary"
                onClick={() =>
                  setDraft({
                    ...defaultReportView,
                    section: view.section,
                    currency: data.view.currency,
                  })
                }
              >
                Reset
              </button>
              <button
                className="button button-primary"
                disabled={
                  busy ||
                  (draft.range === "custom" &&
                    (!validReportDate(draft.from) ||
                      !validReportDate(draft.to) ||
                      draft.from > draft.to ||
                      draft.to > data.today))
                }
                onClick={() => void apply(draft)}
              >
                Apply filters
              </button>
              <button
                className="report-text-action"
                onClick={() => setFilters(false)}
              >
                Cancel
              </button>
            </div>
          </Panel>
        ) : null}
        {savedOpen ? (
          <Panel title="Saved reports">
            <p>
              Saved in this Profile. Figures refresh each time you open a
              report.
            </p>
            {saveError ? <p role="alert">{saveError}</p> : null}
            {!data.paid ? (
              <p>
                Save and open custom reports with{" "}
                <Link href="/pricing">Clover Plus or Pro</Link>.
              </p>
            ) : (
              <>
                <label className="report-v2-name">
                  Report name
                  <input
                    maxLength={80}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Household spending"
                  />
                </label>
                <div className="report-v2-actions">
                  <button
                    className="button button-primary"
                    disabled={saving || busy || !name.trim()}
                    onClick={() => void save(selected ? "update" : "create")}
                  >
                    {selected ? "Save changes" : "Save current view"}
                  </button>
                  {selected ? (
                    <button
                      className="report-text-action"
                      onClick={() => {
                        setSelected(null);
                        setName("");
                      }}
                    >
                      Cancel editing
                    </button>
                  ) : null}
                </div>
              </>
            )}
            {saved.length ? (
              saved.map((r) => (
                <div className="report-v2-saved-row" key={r.id}>
                  <button
                    className="report-text-action"
                    disabled={!data.paid || busy}
                    onClick={() => {
                      void apply(r.view);
                      setSavedOpen(false);
                      setSelected(null);
                    }}
                  >
                    {r.name}
                    <small>
                      {
                        reportRanges.find((x) => x.value === r.view.range)
                          ?.label
                      }{" "}
                      · {r.view.currency || "Default currency"}
                    </small>
                  </button>
                  <button
                    className="report-text-action"
                    disabled={!data.paid || saving || busy}
                    onClick={async () => {
                      await apply(r.view);
                      setSelected(r);
                      setName(r.name);
                    }}
                  >
                    Edit
                  </button>
                  <button
                    className="report-text-action report-danger"
                    disabled={saving}
                    onClick={() => {
                      if (
                        window.confirm(
                          `Delete saved report “${r.name}”? Your transactions will not change.`,
                        )
                      )
                        void save("delete", r);
                    }}
                  >
                    Delete
                  </button>
                </div>
              ))
            ) : (
              <p className="muted">No saved reports yet.</p>
            )}
          </Panel>
        ) : null}
        {error ? (
          <p role="alert">
            {error} <button onClick={() => void apply(view)}>Try again</button>
          </p>
        ) : null}
        {busy ? <p role="status">Updating reports…</p> : null}
        <div aria-busy={busy}>
          <ReportDirectory scope={JSON.stringify(view)}>
            {data.reports.map((report) => (
              <ReportPanels
                key={report.currency}
                report={report}
                workspace={data}
                view={view}
                setView={setView}
                onChanged={() => apply(view)}
              />
            ))}
          </ReportDirectory>
        </div>
      </div>
    </CloverShell>
  );
}
export function ReportPanels({
  report: r,
  workspace: w,
  view,
  setView,
  onChanged,
}: {
  report: ReportCurrencyData;
  workspace: ReportsWorkspace;
  view: ReportView;
  setView: (f: (v: ReportView) => ReportView) => void;
  onChanged?: () => void | Promise<unknown>;
}) {
  const a = r.analysis,
    c = r.currency,
    money = (n: number) => formatCurrencyAmount(n, c),
    net = a.current.income - a.current.expense;
  const href = (extra: Record<string, string> = {}) =>
    `/transactions?${reportTransactionParams(view, c, a.from, a.to, w.categories, extra)}`;
  const categoryHref = (name: string, type = "expense", month?: string) =>
    href({
      category: name,
      type,
      ...(month
        ? {
            customStart: [a.from, month + "-01"].sort().at(-1)!,
            customEnd: [
              a.to,
              new Date(
                Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5)), 0),
              )
                .toISOString()
                .slice(0, 10),
            ].sort()[0],
          }
        : {}),
    });
  const list = (
    items: { name: string; amount: number; count?: number }[],
    kind: "category" | "merchant",
    type = "expense",
  ) => (
    <div className="report-v2-list">
      {items.length ? (
        items.map((x) => (
          <Link
            key={x.name}
            href={
              kind === "category"
                ? categoryHref(x.name)
                : href({ merchant: x.name, type })
            }
          >
            <span>
              {x.name}
              {x.count !== undefined ? (
                <small>{x.count} transactions</small>
              ) : null}
            </span>
            <strong>{money(x.amount)}</strong>
          </Link>
        ))
      ) : (
        <p className="muted">No activity in this period.</p>
      )}
    </div>
  );
  return (
    <div className="report-v2-currency" data-report-currency={c}>
      {w.view.currency === "ALL" ? <h2>{c}</h2> : null}
      <ReportCoverageDetails
        report={r}
        href={href({ reviewFilter: "pending" })}
      />
      {view.transfers !== "exclude" ? (
        <Panel title="Transfer activity">
          <p>
            {a.transferActivity.count} recorded transfer entries. These do not
            count as income or spending.
          </p>
          <Link href={href({ types: "transfer" })}>Open transfers</Link>
        </Panel>
      ) : null}
      {view.section === "overview" ? (
        <>
          <div className="report-v2-summary">
            {[
              ["Income", a.current.income, a.previous.income],
              ["Expenses", a.current.expense, a.previous.expense],
              ["Net income", net, a.previous.income - a.previous.expense],
            ].map(([label, value, previous]) => (
              <Panel key={String(label)} title={String(label)}>
                <strong>{money(Number(value))}</strong>
                <p>
                  {money(Number(value) - Number(previous))} vs comparison period
                </p>
              </Panel>
            ))}
            <Panel title="Savings rate">
              <strong>
                {savingsRate(a.current.income, a.current.expense)?.toFixed(1) ??
                  "N/A"}
                {a.current.income > 0 ? "%" : ""}
              </strong>
              <p>
                {a.current.income > 0
                  ? "Income left after spending"
                  : "Record income to calculate a rate."}
              </p>
            </Panel>
          </div>
          <Panel title="Money over time">
            <ReportsMoneyOverTimeChart currency={c} points={r.balances} />
            <p>
              Estimated from current balances and recorded account movements.{" "}
              {r.knownAccounts} of {r.accountCount} accounts have known
              balances.
            </p>
            <Link href="/accounts">View balance details</Link>
          </Panel>
          <Panel title="Net worth over time">
            <ReportsMoneyOverTimeChart
              title="Net worth"
              currency={c}
              points={r.netWorth}
            />
            <p>
              Assets minus liabilities. Only complete dated account history is
              shown.
            </p>
          </Panel>
          <Panel title="Income sources">
            {list(a.incomeSources, "merchant", "income")}
          </Panel>
        </>
      ) : null}
      {view.section === "spending" ? (
        <>
          <Panel title="Where It Went">
            <p>
              Income {money(a.current.income)} · Spending{" "}
              {money(a.current.expense)}
            </p>
            {list(a.categories, "category")}
            <p>
              {net >= 0
                ? "Income left after spending"
                : "Spending above income"}
              : {money(Math.abs(net))}
            </p>
          </Panel>
          <Panel title="Spending Mix">
            <div className="report-v2-actions">
              {(["Donut", "Bars", "Table"] as const).map((mode) => (
                <button
                  aria-pressed={view.chart === mode}
                  className="button button-secondary"
                  key={mode}
                  onClick={() => setView((v) => ({ ...v, chart: mode }))}
                >
                  {mode}
                </button>
              ))}
            </div>
            {view.chart === "Donut" && a.current.expense > 0 ? (
              <div
                className="report-v2-donut"
                role="img"
                aria-label={`Spending ${money(a.current.expense)}. Category details below.`}
                style={{
                  background: `conic-gradient(${a.categories
                    .map((x, i) => {
                      const start =
                        (a.categories
                          .slice(0, i)
                          .reduce((n, c) => n + c.amount, 0) /
                          a.current.expense) *
                        100;
                      return `${palette[i % palette.length]} ${start}% ${start + (x.amount / a.current.expense) * 100}%`;
                    })
                    .join(",")})`,
                }}
              >
                <span>{money(a.current.expense)}</span>
              </div>
            ) : null}
            {view.chart === "Table" ? (
              <div className="report-v2-table">
                <table>
                  <thead>
                    <tr>
                      <th>Category</th>
                      <th>Amount</th>
                      <th>Share</th>
                      <th>Transactions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {a.categories.map((x) => (
                      <tr key={x.name}>
                        <th>
                          <Link href={categoryHref(x.name)}>{x.name}</Link>
                        </th>
                        <td>{money(x.amount)}</td>
                        <td>
                          {(
                            (x.amount / Math.max(1, a.current.expense)) *
                            100
                          ).toFixed(1)}
                          %
                        </td>
                        <td>{x.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
            {view.chart !== "Table"
              ? a.categories.map((x) => (
                  <div key={x.name} className="report-v2-category">
                    <Link href={categoryHref(x.name)}>{x.name}</Link>
                    <strong>
                      {money(x.amount)} ·{" "}
                      {(
                        (x.amount / Math.max(1, a.current.expense)) *
                        100
                      ).toFixed(1)}
                      %
                    </strong>
                    {view.chart === "Bars" ? (
                      <progress value={x.amount} max={a.current.expense} />
                    ) : null}
                  </div>
                ))
              : null}
            {!a.categories.length ? <p>No spending in this period.</p> : null}
          </Panel>
          {r.recoveries ? (
            <ReportRecoveries
              key={w.workspaceId + r.currency}
              report={r.recoveries}
              currency={r.currency}
              workspaceId={w.workspaceId}
              onChanged={onChanged}
            />
          ) : null}
          <ReportSpendingDetails report={r} workspace={w} view={view} />
        </>
      ) : null}
      {view.section === "trends" ? (
        <>
          <ReportOutlook
            key={JSON.stringify(view)}
            report={r}
            section="trends"
          />
          <Panel title="Spending Pace">
            <ReportsComparisonChart
              currency={c}
              series={[
                {
                  name: "Selected period",
                  color: palette[0],
                  points: a.pace.map((p) => ({
                    date: p.date,
                    value: p.current,
                  })),
                },
                {
                  name: "Comparison period",
                  color: palette[2],
                  points: a.pace.map((p) => ({
                    date: p.date,
                    value: p.previous,
                  })),
                },
              ]}
            />
            <p>
              Cumulative spending at the same elapsed day:{" "}
              {money(a.current.expense)} vs {money(a.previous.expense)}.
            </p>
            <p>
              Daily average:{" "}
              {money(a.current.expense / Math.max(1, a.days.length))}.
            </p>
            <Link href={href()}>Open transactions</Link> ·{" "}
            <Link
              href={`/adviser?prompt=${encodeURIComponent(`Explain my spending changes in ${c} from ${a.from} to ${a.to}, compared with ${a.previousFrom} to ${a.previousTo}.`)}`}
            >
              Ask Clover
            </Link>
          </Panel>
          <Panel title="Income and Spending">
            <ReportsComparisonChart
              currency={c}
              series={[
                {
                  name: "Income",
                  color: palette[1],
                  points: a.days.map((p) => ({
                    date: p.date,
                    value: p.income,
                  })),
                },
                {
                  name: "Spending",
                  color: palette[0],
                  points: a.days.map((p) => ({
                    date: p.date,
                    value: p.expense,
                  })),
                },
              ]}
            />
          </Panel>
          {(
            [
              ["Weekly Summary", a.weekly],
              ["Monthly Summary", a.monthlySummary],
            ] as const
          ).map(([title, s]) => (
            <Panel key={title} title={title}>
              <ReportsComparisonChart
                currency={c}
                series={[
                  {
                    name: "Income",
                    color: palette[1],
                    points: s.points.map((p) => ({
                      date: p.date,
                      value: p.income,
                    })),
                  },
                  {
                    name: "Spending",
                    color: palette[0],
                    points: s.points.map((p) => ({
                      date: p.date,
                      value: p.expense,
                    })),
                  },
                ]}
              />
              <p>
                {s.from} to {s.to}
                {title === "Monthly Summary"
                  ? " · Same elapsed days of the previous month"
                  : " · Previous 7 days"}
              </p>
              <p>
                Income {money(s.current.income)} · Spending{" "}
                {money(s.current.expense)}
              </p>
              <strong>Net {money(s.current.income - s.current.expense)}</strong>
              <p>
                Change in net:{" "}
                {money(
                  s.current.income -
                    s.current.expense -
                    s.previous.income +
                    s.previous.expense,
                )}
              </p>
              <Link href={href({ customStart: s.from, customEnd: s.to })}>
                Open transactions
              </Link>
            </Panel>
          ))}
          <Panel title="Repeat Bills">
            <p>
              Detected repeat payments. Confirm their schedule in Recurring.
            </p>
            {a.repeats.map((x) => (
              <div className="report-v2-category" key={x.name}>
                <Link href={href({ merchant: x.name, type: "expense" })}>
                  {x.name}
                </Link>
                <span>
                  {money(x.amount)} · {x.count} payments
                </span>
                <small>
                  {x.cadence}
                  {x.nextDue ? ` · Suggested next date ${x.nextDue}` : ""}
                </small>
              </div>
            ))}
            {!a.repeats.length ? (
              <p>No repeated payments in this period.</p>
            ) : null}
            <Link href="/recurring">Review recurring payments</Link>
          </Panel>
          <Panel title="Biggest Merchants">
            {list(a.merchants, "merchant")}
          </Panel>
          {w.paid ? (
            <>
              <Panel title="Income and expense statement">
                <p>
                  {c} · Monthly totals and averages across the selected period.
                  * Partial month; averages include partial months. Tap an
                  amount to open its transactions.
                </p>
                <div
                  className="report-v2-table"
                  tabIndex={0}
                  role="region"
                  aria-label="Income and expense statement, scroll horizontally"
                >
                  <table>
                    <thead>
                      <tr>
                        <th>Category</th>
                        {a.monthly.map((x) => (
                          <th key={x.month}>
                            {monthLabel(x.month)}
                            {x.partial ? "*" : ""}
                          </th>
                        ))}
                        <th>Total</th>
                        <th>Monthly average</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(["income", "expense"] as const).map((type) => (
                        <StatementRows
                          key={type}
                          type={type}
                          report={r}
                          money={money}
                          link={categoryHref}
                        />
                      ))}
                      <tr className="report-v2-total">
                        <th>Net income</th>
                        {a.monthly.map((x) => (
                          <td key={x.month}>{money(x.income - x.expense)}</td>
                        ))}
                        <td>{money(net)}</td>
                        <td>{money(net / a.months.length)}</td>
                      </tr>
                      <tr>
                        <th>Savings rate</th>
                        {a.monthly.map((x) => (
                          <td key={x.month}>
                            {x.income > 0
                              ? `${savingsRate(x.income, x.expense)!.toFixed(1)}%`
                              : "N/A"}
                          </td>
                        ))}
                        <td>
                          {a.current.income > 0
                            ? `${savingsRate(a.current.income, a.current.expense)!.toFixed(1)}%`
                            : "N/A"}
                        </td>
                        <td>—</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </Panel>
              <Panel title="Category trends">
                <p>
                  Select up to six categories. Compare monthly spending, totals,
                  averages, and the selected comparison period.
                </p>
                <div className="report-v2-actions">
                  {a.trends.map((t) => (
                    <label key={t.name}>
                      <input
                        type="checkbox"
                        checked={
                          view.trendCategories.length
                            ? view.trendCategories.includes(t.name)
                            : a.trends
                                .slice(0, 3)
                                .some((c) => c.name === t.name)
                        }
                        onChange={() =>
                          setView((v) => {
                            const current = v.trendCategories.length
                              ? v.trendCategories
                              : a.trends.slice(0, 3).map((x) => x.name);
                            return {
                              ...v,
                              trendCategories: current.includes(t.name)
                                ? current.length === 1
                                  ? ["__none__"]
                                  : current.filter((x) => x !== t.name)
                                : [...current, t.name].slice(-6),
                            };
                          })
                        }
                      />
                      {t.name}
                    </label>
                  ))}
                </div>
                <ReportsComparisonChart
                  currency={c}
                  series={a.trends
                    .filter((t) =>
                      (view.trendCategories.length
                        ? view.trendCategories
                        : a.trends.slice(0, 3).map((x) => x.name)
                      ).includes(t.name),
                    )
                    .map((t, i) => ({
                      name: t.name,
                      color: palette[i % palette.length],
                      points: t.points,
                    }))}
                />
                {a.trends
                  .filter((t) =>
                    (view.trendCategories.length
                      ? view.trendCategories
                      : a.trends.slice(0, 3).map((x) => x.name)
                    ).includes(t.name),
                  )
                  .map((t) => (
                    <div key={t.name}>
                      <h3>
                        <Link href={categoryHref(t.name)}>{t.name}</Link>
                      </h3>

                      <p>
                        Total {money(t.amount)} · Monthly average{" "}
                        {money(t.average)} ·{" "}
                        {t.change === null
                          ? "No prior spending baseline"
                          : `${t.change.toFixed(1)}% vs comparison period`}
                      </p>
                    </div>
                  ))}
                {!a.trends.length ? <p>No spending to compare yet.</p> : null}
              </Panel>
            </>
          ) : (
            <PremiumPreview context="trends" />
          )}
        </>
      ) : null}
      {view.section === "advanced" ? (
        w.paid ? (
          <>
            <ReportOutlook
              key={JSON.stringify(view)}
              report={r}
              section="advanced"
            />
            <Panel title="Cash Flow">
              <ReportsCashFlowMap
                currency={c}
                accounts={r.cashFlow}
                destinations={[
                  ...a.categories.map((x, i) => ({
                    key: x.name,
                    label: x.name,
                    color: palette[i % palette.length],
                  })),
                  { key: "__remaining__", label: "Unspent", color: "#7d91aa" },
                ]}
              />
            </Panel>
            <Panel title="Main Drivers">
              <p>
                {a.drivers.category
                  ? `${a.drivers.category.name}: ${money(a.drivers.category.delta)} change in spending.`
                  : "No category change to explain yet."}
              </p>
              <p>
                {a.drivers.merchant
                  ? `${a.drivers.merchant.name}: ${money(a.drivers.merchant.delta)} more than the comparison period.`
                  : "No merchant increase detected."}
              </p>
              <p>Detected repeat costs: {money(a.drivers.recurringTotal)}</p>
            </Panel>
            <Panel title="Next Steps">
              <p>{a.reviewCount} transactions need review.</p>
              <Link href={href({ reviewFilter: "pending" })}>
                Review transactions
              </Link>{" "}
              ·{" "}
              <Link
                href={`/adviser?prompt=${encodeURIComponent(`Explain my ${c} report for ${a.from} to ${a.to}.`)}`}
              >
                Ask Clover
              </Link>
            </Panel>
            <Panel title="Goal Check">
              {r.goal ? (
                <>
                  <h3>{r.goal.title}</h3>
                  {r.goal.progress !== null ? (
                    <p>{Math.round(r.goal.progress)}% progress</p>
                  ) : null}
                  <p>{r.goal.detail}</p>
                </>
              ) : (
                <p>Set a goal in this currency to see your progress.</p>
              )}
              <Link href="/goals">Open goals</Link>
            </Panel>
          </>
        ) : (
          <PremiumPreview context="insights" />
        )
      ) : null}
    </div>
  );
}
function StatementRows({
  type,
  report,
  money,
  link,
}: {
  type: "income" | "expense";
  report: ReportCurrencyData;
  money: (n: number) => string;
  link: (n: string, type: string, month?: string) => string;
}) {
  const a = report.analysis;
  return (
    <>
      <tr className="report-v2-total">
        <th>{type === "income" ? "Income" : "Expenses"}</th>
        {a.monthly.map((x) => (
          <td key={x.month}>{money(x[type])}</td>
        ))}
        <td>{money(a.current[type])}</td>
        <td>{money(a.current[type] / a.months.length)}</td>
      </tr>
      {a.statement
        .filter((r) => r.type === type)
        .map((row) => (
          <tr key={row.name}>
            <th>{row.name}</th>
            {row.values.map((v, i) => (
              <td key={a.months[i]}>
                <Link href={link(row.name, type, a.months[i])}>{money(v)}</Link>
              </td>
            ))}
            <td>{money(row.total)}</td>
            <td>{money(row.average)}</td>
          </tr>
        ))}
    </>
  );
}
