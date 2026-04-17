"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { CloverShell } from "@/components/clover-shell";

type Workspace = {
  id: string;
  name: string;
  type: string;
};

type Account = {
  id: string;
  name: string;
  institution: string | null;
  type: "bank" | "wallet" | "credit_card" | "cash" | "investment" | "other";
  currency: string;
  source: string;
  balance: string | null;
  updatedAt: string;
  createdAt: string;
};

type Transaction = {
  id: string;
  accountId: string;
  amount: string;
  type: "income" | "expense" | "transfer";
  date: string;
  isExcluded: boolean;
};

type AddMode = "manual" | "import";
type ChartMetric = "performance" | "breakdown" | "liabilities";
type ChartRange = "1m" | "3m" | "6m" | "ytd" | "1y" | "lifetime";
type FilterScope = "all" | "assets" | "liabilities";
type FilterSource = "all" | "manual" | "imported";
type SummaryMode = "totals" | "percent";
type ManualAccountKind = "savings" | "checking" | "credit_card" | "cash";

type Point = {
  label: string;
  value: number;
};

const currencyFormatter = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
  minimumFractionDigits: 2,
});

const chartRangeOptions: Array<{ value: ChartRange; label: string }> = [
  { value: "1m", label: "1 month" },
  { value: "3m", label: "3 months" },
  { value: "6m", label: "6 months" },
  { value: "ytd", label: "Year to date" },
  { value: "1y", label: "1 year" },
  { value: "lifetime", label: "Lifetime" },
];

const chartMetricOptions: Array<{ value: ChartMetric; label: string }> = [
  { value: "performance", label: "Net worth performance" },
  { value: "breakdown", label: "Net worth breakdown" },
  { value: "liabilities", label: "Liabilities" },
];

const manualKinds: Array<{ value: ManualAccountKind; label: string; helper: string }> = [
  { value: "savings", label: "Savings", helper: "Manual name and balance" },
  { value: "checking", label: "Checking", helper: "Manual name and balance" },
  { value: "credit_card", label: "Credit Card", helper: "Manual name and balance" },
  { value: "cash", label: "Cash", helper: "Automatically shows up" },
];

const formatDate = (value: string) =>
  new Date(value).toLocaleDateString("en-PH", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

const parseAmount = (value: string | null | undefined) => Number(value ?? 0);

const getAccountDisplayType = (account: Account) => {
  if (account.type === "credit_card") return "Credit Card";
  if (account.type === "cash") return "Cash";
  if (account.type === "investment") return "Investment";
  if (account.type === "wallet") return "Wallet";
  if (account.type === "bank" && account.institution === "Checking") return "Checking";
  if (account.type === "bank" && account.institution === "Savings") return "Savings";
  return "Bank";
};

const getAccountTone = (account: Account) => (account.type === "credit_card" ? "liability" : "asset");

const getAccountKindInstitution = (kind: ManualAccountKind) => {
  if (kind === "savings") return "Savings";
  if (kind === "checking") return "Checking";
  if (kind === "credit_card") return "Credit Card";
  if (kind === "cash") return "Cash";
  return "Savings";
};

const getAccountKindType = (kind: ManualAccountKind): Account["type"] => {
  if (kind === "credit_card") return "credit_card";
  if (kind === "cash") return "cash";
  return "bank";
};

const rangeStartDate = (range: ChartRange) => {
  const date = new Date();
  if (range === "lifetime") {
    date.setFullYear(date.getFullYear() - 2);
    date.setMonth(0, 1);
    return date;
  }
  if (range === "ytd") {
    date.setMonth(0, 1);
    return date;
  }
  if (range === "1y") {
    date.setFullYear(date.getFullYear() - 1);
    return date;
  }
  const months = range === "1m" ? 1 : range === "3m" ? 3 : 6;
  date.setMonth(date.getMonth() - months);
  return date;
};

const buildDayBuckets = (transactions: Transaction[], start: Date) => {
  const buckets = new Map<string, number>();
  for (const transaction of transactions) {
    if (transaction.isExcluded) continue;
    const key = transaction.date.slice(0, 10);
    const amount = parseAmount(transaction.amount);
    const signed = transaction.type === "income" ? amount : transaction.type === "expense" ? -amount : 0;
    buckets.set(key, (buckets.get(key) ?? 0) + signed);
  }

  const dates: string[] = [];
  const cursor = new Date(start);
  cursor.setHours(12, 0, 0, 0);
  const end = new Date();
  end.setHours(12, 0, 0, 0);
  while (cursor <= end) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setDate(cursor.getDate() + 1);
  }

  return dates.map((date) => ({ date, flow: buckets.get(date) ?? 0 }));
};

const buildSamplePoints = (flow: Array<{ date: string; flow: number }>, endValue: number) => {
  const totalFlow = flow.reduce((sum, entry) => sum + entry.flow, 0);
  let running = endValue - totalFlow;
  return flow.map((entry) => {
    running += entry.flow;
    return {
      label: formatDate(entry.date),
      value: running,
    };
  });
};

const makeSvgPath = (points: Point[], width: number, height: number, padding = 16) => {
  if (points.length === 0) return "";
  const values = points.map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;
  return points
    .map((point, index) => {
      const x = padding + (points.length === 1 ? innerWidth / 2 : (innerWidth * index) / (points.length - 1));
      const normalized = (point.value - min) / span;
      const y = padding + innerHeight - normalized * innerHeight;
      return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");
};

function ActionIcon({
  name,
}: {
  name: "plus" | "filters" | "refresh" | "calendar" | "chart" | "save" | "download" | "chevron-down";
}) {
  const common = {
    width: 14,
    height: 14,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };

  switch (name) {
    case "plus":
      return (
        <svg {...common}>
          <path d="M12 5v14" />
          <path d="M5 12h14" />
        </svg>
      );
    case "filters":
      return (
        <svg {...common}>
          <path d="M4 6h16" />
          <path d="M7 12h10" />
          <path d="M10 18h4" />
        </svg>
      );
    case "refresh":
      return (
        <svg {...common}>
          <path d="M20 12a8 8 0 1 1-2.34-5.66" />
          <path d="M20 4v6h-6" />
        </svg>
      );
    case "calendar":
      return (
        <svg {...common}>
          <rect x="4" y="5" width="16" height="15" rx="2" />
          <path d="M8 3v4" />
          <path d="M16 3v4" />
          <path d="M4 9h16" />
        </svg>
      );
    case "chart":
      return (
        <svg {...common}>
          <path d="M4 19h16" />
          <path d="M6 16V9" />
          <path d="M11 16V5" />
          <path d="M16 16v-7" />
        </svg>
      );
    case "save":
      return (
        <svg {...common}>
          <path d="M5 5h11l3 3v11H5z" />
          <path d="M8 5v6h8V5" />
          <path d="M8 19v-6h8v6" />
        </svg>
      );
    case "download":
      return (
        <svg {...common}>
          <path d="M12 3v10" />
          <path d="m8 9 4 4 4-4" />
          <path d="M5 19h14" />
        </svg>
      );
    case "chevron-down":
      return (
        <svg {...common}>
          <path d="m6 9 6 6 6-6" />
        </svg>
      );
    default:
      return null;
  }
}

export default function AccountsPage() {
  const filtersRef = useRef<HTMLDivElement>(null);
  const addRef = useRef<HTMLDivElement>(null);

  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState("");
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [message, setMessage] = useState("Select a workspace to review accounts.");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [addMode, setAddMode] = useState<AddMode>("manual");
  const [chartMetric, setChartMetric] = useState<ChartMetric>("performance");
  const [chartRange, setChartRange] = useState<ChartRange>("1m");
  const [summaryMode, setSummaryMode] = useState<SummaryMode>("totals");
  const [filterScope, setFilterScope] = useState<FilterScope>("all");
  const [filterSource, setFilterSource] = useState<FilterSource>("all");
  const [hideZero, setHideZero] = useState(false);
  const [manualKind, setManualKind] = useState<ManualAccountKind>("savings");
  const [manualName, setManualName] = useState("");
  const [manualBalance, setManualBalance] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const selectedWorkspace = useMemo(
    () => workspaces.find((workspace) => workspace.id === selectedWorkspaceId) ?? null,
    [selectedWorkspaceId, workspaces]
  );

  const loadWorkspaces = async () => {
    const response = await fetch("/api/workspaces");
    if (!response.ok) {
      setMessage("Unable to load workspaces.");
      return;
    }

    const data = await response.json();
    const items = Array.isArray(data.workspaces) ? data.workspaces : [];
    setWorkspaces(items);
    setSelectedWorkspaceId((current) => current || items[0]?.id || "");
  };

  const loadWorkspaceData = async (workspaceId: string) => {
    if (!workspaceId) {
      setAccounts([]);
      setTransactions([]);
      return;
    }

    const [accountsResponse, transactionsResponse] = await Promise.all([
      fetch(`/api/accounts?workspaceId=${encodeURIComponent(workspaceId)}`),
      fetch(`/api/transactions?workspaceId=${encodeURIComponent(workspaceId)}`),
    ]);

    if (accountsResponse.ok) {
      const payload = await accountsResponse.json();
      setAccounts(Array.isArray(payload.accounts) ? payload.accounts : []);
    }

    if (transactionsResponse.ok) {
      const payload = await transactionsResponse.json();
      setTransactions(Array.isArray(payload.transactions) ? payload.transactions : []);
    }
  };

  useEffect(() => {
    void loadWorkspaces();
  }, []);

  useEffect(() => {
    void loadWorkspaceData(selectedWorkspaceId);
  }, [selectedWorkspaceId]);

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (filtersRef.current?.contains(target) || addRef.current?.contains(target)) return;
      setFiltersOpen(false);
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setFiltersOpen(false);
        setAddOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  const filteredAccounts = useMemo(() => {
    return accounts.filter((account) => {
      const value = parseAmount(account.balance);
      const isLiability = account.type === "credit_card";
      const isManual = account.source === "manual";

      if (filterScope === "assets" && isLiability) return false;
      if (filterScope === "liabilities" && !isLiability) return false;
      if (filterSource === "manual" && !isManual) return false;
      if (filterSource === "imported" && isManual) return false;
      if (hideZero && Math.abs(value) < 0.01) return false;
      return true;
    });
  }, [accounts, filterScope, filterSource, hideZero]);

  const totals = useMemo(() => {
    return filteredAccounts.reduce(
      (accumulator, account) => {
        const rawValue = parseAmount(account.balance);
        const isLiability = account.type === "credit_card";
        const signedValue = isLiability ? -Math.abs(rawValue) : rawValue;
        if (signedValue >= 0) {
          accumulator.assets += signedValue;
        } else {
          accumulator.liabilities += Math.abs(signedValue);
        }
        accumulator.netWorth += signedValue;
        return accumulator;
      },
      { assets: 0, liabilities: 0, netWorth: 0 }
    );
  }, [filteredAccounts]);

  const oneMonthAgo = useMemo(() => {
    const date = new Date();
    date.setDate(date.getDate() - 30);
    return date;
  }, []);

  const recentTransactions = useMemo(
    () =>
      transactions
        .filter((transaction) => !transaction.isExcluded)
        .filter((transaction) => new Date(transaction.date) >= oneMonthAgo),
    [transactions, oneMonthAgo]
  );

  const netFlow = useMemo(() => {
    return recentTransactions.reduce((sum, transaction) => {
      const amount = parseAmount(transaction.amount);
      if (transaction.type === "income") return sum + amount;
      if (transaction.type === "expense") return sum - amount;
      return sum;
    }, 0);
  }, [recentTransactions]);

  const rangeStart = useMemo(() => rangeStartDate(chartRange), [chartRange]);

  const chartFlow = useMemo(() => buildDayBuckets(transactions, rangeStart), [transactions, rangeStart]);
  const performancePoints = useMemo(
    () => buildSamplePoints(chartFlow, totals.netWorth),
    [chartFlow, totals.netWorth]
  );
  const performancePath = useMemo(() => makeSvgPath(performancePoints, 820, 220), [performancePoints]);
  const liabilityPoints = useMemo<Point[]>(() => {
    const values = chartFlow.map((entry, index) => ({
      label: entry.date,
      value: Math.max(totals.liabilities - index * 500, 0),
    }));
    return values.length > 0 ? values : [{ label: "Liabilities", value: totals.liabilities }];
  }, [chartFlow, totals.liabilities]);
  const liabilityPath = useMemo(() => makeSvgPath(liabilityPoints, 820, 220), [liabilityPoints]);

  const accountGroups = useMemo(() => {
    const groups = [
      {
        title: "Cash",
        tone: "cash",
        rows: filteredAccounts.filter((account) => account.type === "cash"),
      },
      {
        title: "Banks & savings",
        tone: "assets",
        rows: filteredAccounts.filter((account) => account.type === "bank" || account.type === "wallet" || account.type === "investment"),
      },
      {
        title: "Credit cards",
        tone: "liability",
        rows: filteredAccounts.filter((account) => account.type === "credit_card"),
      },
      {
        title: "Imported & other",
        tone: "neutral",
        rows: filteredAccounts.filter((account) => account.type === "other"),
      },
    ];

    return groups
      .map((group) => ({
        ...group,
        total: group.rows.reduce((sum, account) => sum + (account.type === "credit_card" ? -Math.abs(parseAmount(account.balance)) : parseAmount(account.balance)), 0),
      }))
      .filter((group) => group.rows.length > 0);
  }, [filteredAccounts]);

  const visibleCount = filteredAccounts.length;
  const currentRangeLabel = chartRangeOptions.find((option) => option.value === chartRange)?.label ?? "1 month";
  const currentMetricLabel = chartMetricOptions.find((option) => option.value === chartMetric)?.label ?? "Net worth performance";

  const refreshAll = async () => {
    if (!selectedWorkspaceId) return;
    await loadWorkspaceData(selectedWorkspaceId);
    setMessage(`Workspace "${selectedWorkspace?.name ?? "selected"}" refreshed.`);
  };

  const createManualAccount = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedWorkspaceId) {
      setMessage("Select a workspace first.");
      return;
    }

    const name = manualName.trim();
    if (!name) {
      setMessage("Account name is required.");
      return;
    }

    const hasCashAccount = accounts.some((account) => account.type === "cash");
    if (manualKind === "cash" && hasCashAccount) {
      setMessage("Cash already appears automatically in this workspace. Rename the existing Cash account instead.");
      return;
    }

    setIsSaving(true);
    try {
      const response = await fetch("/api/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId: selectedWorkspaceId,
          name,
          institution: getAccountKindInstitution(manualKind),
          type: getAccountKindType(manualKind),
          currency: "PHP",
          source: "manual",
          balance: manualBalance ? Number(manualBalance) : 0,
        }),
      });

      if (!response.ok) {
        throw new Error("Unable to create account.");
      }

      const data = await response.json();
      if (data.account) {
        setAccounts((current) => [data.account, ...current]);
      }
      setManualName("");
      setManualBalance("");
      setAddOpen(false);
      setMessage(`Account "${name}" created.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to create account.");
    } finally {
      setIsSaving(false);
    }
  };

  const exportCsv = () => {
    const rows = [
      ["Name", "Type", "Amount", "Last updated", "Source"],
      ...filteredAccounts.map((account) => [
        account.name,
        getAccountDisplayType(account),
        currencyFormatter.format(parseAmount(account.balance)),
        formatDate(account.updatedAt),
        account.source,
      ]),
    ];
    const csv = rows.map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${selectedWorkspace?.name ?? "accounts"}-summary.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const exportPdf = () => {
    const report = window.open("", "_blank", "width=980,height=780");
    if (!report) return;
    report.document.write(`
      <html>
        <head>
          <title>${selectedWorkspace?.name ?? "Accounts"} summary</title>
          <style>
            body { font-family: Inter, Arial, sans-serif; padding: 32px; color: #111; }
            h1 { margin: 0 0 10px; }
            .muted { color: #66727b; }
            table { width: 100%; border-collapse: collapse; margin-top: 18px; }
            th, td { text-align: left; border-bottom: 1px solid #e2e8ec; padding: 10px 8px; }
          </style>
        </head>
        <body>
          <h1>${selectedWorkspace?.name ?? "Accounts"} summary</h1>
          <p class="muted">Net worth ${currencyFormatter.format(totals.netWorth)} · Assets ${currencyFormatter.format(totals.assets)} · Liabilities ${currencyFormatter.format(totals.liabilities)}</p>
          <table>
            <thead>
              <tr><th>Name</th><th>Type</th><th>Amount</th><th>Last updated</th></tr>
            </thead>
            <tbody>
              ${filteredAccounts
                .map(
                  (account) => `
                    <tr>
                      <td>${account.name}</td>
                      <td>${getAccountDisplayType(account)}</td>
                      <td>${currencyFormatter.format(parseAmount(account.balance))}</td>
                      <td>${formatDate(account.updatedAt)}</td>
                    </tr>`
                )
                .join("")}
            </tbody>
          </table>
          <script>window.print();</script>
        </body>
      </html>
    `);
    report.document.close();
  };

  const chartTitle = chartMetric === "performance" ? "Net worth performance" : chartMetric === "breakdown" ? "Net worth breakdown" : "Liabilities";
  const chartSubtitle =
    chartMetric === "performance"
      ? `${currentRangeLabel} trend from imported and manual accounts.`
      : chartMetric === "breakdown"
        ? "Assets versus liabilities drawn from the current workspace balances."
        : "Liability pressure from credit-card balances and related activity.";

  return (
    <CloverShell
      active="accounts"
      title="Accounts"
      showTopbar={false}
    >
      <div className="accounts-page">
        <div className="accounts-page__actions">
          <div className="accounts-toolbar-filters" ref={filtersRef}>
            <button className="button button-secondary button-small pill-link accounts-toolbar-button" type="button" onClick={() => setFiltersOpen((current) => !current)}>
              <ActionIcon name="filters" />
              <span>Filters</span>
            </button>
            {filtersOpen ? (
              <div className="accounts-toolbar-popover glass">
                <label>
                  View
                  <select value={filterScope} onChange={(event) => setFilterScope(event.target.value as FilterScope)}>
                    <option value="all">All accounts</option>
                    <option value="assets">Assets only</option>
                    <option value="liabilities">Liabilities only</option>
                  </select>
                </label>
                <label>
                  Source
                  <select value={filterSource} onChange={(event) => setFilterSource(event.target.value as FilterSource)}>
                    <option value="all">All sources</option>
                    <option value="manual">Manual</option>
                    <option value="imported">Imported</option>
                  </select>
                </label>
                <label className="toggle-row">
                  <span>Hide zero balance</span>
                  <input type="checkbox" checked={hideZero} onChange={(event) => setHideZero(event.target.checked)} />
                </label>
              </div>
            ) : null}
          </div>
          <button className="button button-secondary button-small pill-link accounts-toolbar-button" type="button" onClick={() => void refreshAll()}>
            <ActionIcon name="refresh" />
            <span>Refresh all</span>
          </button>
          <button
            className="button button-primary button-small accounts-toolbar-add"
            type="button"
            onClick={() => {
              setAddMode("manual");
              setAddOpen(true);
            }}
          >
            <ActionIcon name="plus" />
            <span>Add account</span>
          </button>
        </div>

        <section className="accounts-hero glass">
          <div className="accounts-hero__copy">
            <p className="eyebrow">Net worth</p>
            <div className="accounts-hero__value-row">
              <strong>{currencyFormatter.format(totals.netWorth)}</strong>
              <span className={`accounts-hero__delta ${netFlow >= 0 ? "positive" : "negative"}`}>
                {netFlow >= 0 ? "↑" : "↓"} {currencyFormatter.format(Math.abs(netFlow))}
              </span>
              <span className="accounts-hero__meta">1 month change</span>
            </div>
          </div>
          <div className="accounts-hero__controls">
            <label>
              View
              <select value={chartMetric} onChange={(event) => setChartMetric(event.target.value as ChartMetric)}>
                {chartMetricOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Date range
              <select value={chartRange} onChange={(event) => setChartRange(event.target.value as ChartRange)}>
                {chartRangeOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="accounts-chart-card">
            <div className="accounts-chart-card__head">
              <div>
                <p className="eyebrow">Chart</p>
                <h3>{chartTitle}</h3>
                <p>{chartSubtitle}</p>
              </div>
              <div className="accounts-chart-card__pill">{selectedWorkspace?.name ?? "Workspace"}</div>
            </div>
            {chartMetric === "performance" ? (
              <svg className="accounts-chart" viewBox="0 0 820 220" role="img" aria-label={chartTitle}>
                <defs>
                  <linearGradient id="accountsFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="rgba(3,168,192,0.26)" />
                    <stop offset="100%" stopColor="rgba(3,168,192,0.03)" />
                  </linearGradient>
                </defs>
                {[0, 1, 2, 3].map((line) => (
                  <line key={line} x1="16" y1={28 + line * 48} x2="804" y2={28 + line * 48} stroke="rgba(13, 22, 29, 0.06)" />
                ))}
                <path d={`${performancePath} L 804 204 L 16 204 Z`} fill="url(#accountsFill)" />
                <path d={performancePath} fill="none" stroke="#03a8c0" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            ) : chartMetric === "breakdown" ? (
              <div className="accounts-breakdown">
                <div className="accounts-breakdown__bars">
                  <div className="accounts-breakdown__bar accounts-breakdown__bar--assets" style={{ height: `${Math.max((totals.assets / Math.max(totals.netWorth || 1, 1)) * 100, 30)}%` }} />
                  <div className="accounts-breakdown__bar accounts-breakdown__bar--liabilities" style={{ height: `${Math.max((totals.liabilities / Math.max(totals.assets + totals.liabilities || 1, 1)) * 100, 16)}%` }} />
                </div>
                <div className="accounts-breakdown__legend">
                  <div>
                    <span className="dot dot--teal" />
                    Assets {currencyFormatter.format(totals.assets)}
                  </div>
                  <div>
                    <span className="dot dot--rose" />
                    Liabilities {currencyFormatter.format(totals.liabilities)}
                  </div>
                </div>
              </div>
            ) : (
              <svg className="accounts-chart" viewBox="0 0 820 220" role="img" aria-label={chartTitle}>
                {[0, 1, 2, 3].map((line) => (
                  <line key={line} x1="16" y1={28 + line * 48} x2="804" y2={28 + line * 48} stroke="rgba(13, 22, 29, 0.06)" />
                ))}
                <path d={liabilityPath} fill="none" stroke="#cf4f66" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
            <div className="accounts-chart-card__footer">
              <span className="pill pill-neutral">Assets {currencyFormatter.format(totals.assets)}</span>
              <span className="pill pill-neutral">Liabilities {currencyFormatter.format(totals.liabilities)}</span>
              <span className="pill pill-neutral">Net worth {currencyFormatter.format(totals.netWorth)}</span>
            </div>
          </div>
        </section>

        <section className="accounts-main-grid">
          <div className="accounts-list-column">
            <div className="accounts-list-head">
              <div>
                <p className="eyebrow">Accounts</p>
                <h4>{visibleCount} visible account{visibleCount === 1 ? "" : "s"}</h4>
              </div>
              <p>{selectedWorkspace?.name ?? "Workspace"} · source-aware balances and imported snapshots</p>
            </div>

            <div className="accounts-sections">
              {accountGroups.length > 0 ? (
                accountGroups.map((group) => (
                  <article key={group.title} className="accounts-group glass">
                    <div className="accounts-group__head">
                      <div>
                        <h5>{group.title}</h5>
                        <p>
                          {group.rows.length} account{group.rows.length === 1 ? "" : "s"} ·{" "}
                          {currencyFormatter.format(group.total)}
                        </p>
                      </div>
                      <span className={`accounts-group__tone accounts-group__tone--${group.tone}`}>{group.title}</span>
                    </div>

                    <div className="accounts-table" role="table" aria-label={`${group.title} accounts`}>
                      <div className="accounts-table__header" role="row">
                        <span role="columnheader">Name</span>
                        <span role="columnheader">Type</span>
                        <span role="columnheader">Amount</span>
                        <span role="columnheader">Last updated</span>
                      </div>
                      {group.rows.map((account) => {
                        const value = parseAmount(account.balance);
                        const isLiability = account.type === "credit_card";
                        return (
                          <div key={account.id} className="accounts-table__row" role="row">
                            <div className="accounts-table__cell accounts-table__cell--name" role="cell">
                              <strong>{account.name}</strong>
                              <span>
                                {account.institution ?? "No institution"} ·{" "}
                                <span className="accounts-source">{account.source === "manual" ? "Manual" : "Imported"}</span>
                              </span>
                            </div>
                            <div className="accounts-table__cell" role="cell">
                              <span className={`accounts-type-tag ${getAccountTone(account) === "liability" ? "is-liability" : ""}`}>
                                {getAccountDisplayType(account)}
                              </span>
                            </div>
                            <div className={`accounts-table__cell accounts-table__cell--amount ${isLiability ? "is-liability" : "is-asset"}`} role="cell">
                              {currencyFormatter.format(isLiability ? -Math.abs(value) : value)}
                            </div>
                            <div className="accounts-table__cell" role="cell">
                              {formatDate(account.updatedAt)}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </article>
                ))
              ) : (
                <div className="empty-state">No accounts match the current filters.</div>
              )}
            </div>
          </div>

          <aside className="accounts-summary-column glass">
            <div className="accounts-summary-column__head">
              <div>
                <p className="eyebrow">Summary</p>
                <h4>Assets vs liabilities</h4>
              </div>
              <div className="accounts-summary-tabs">
                <button
                  type="button"
                  className={summaryMode === "totals" ? "is-active" : ""}
                  onClick={() => setSummaryMode("totals")}
                >
                  Totals
                </button>
                <button
                  type="button"
                  className={summaryMode === "percent" ? "is-active" : ""}
                  onClick={() => setSummaryMode("percent")}
                >
                  Percent
                </button>
              </div>
            </div>

            {summaryMode === "totals" ? (
              <div className="accounts-summary-list">
                <div className="accounts-summary-item">
                  <span>Assets</span>
                  <strong>{currencyFormatter.format(totals.assets)}</strong>
                </div>
                <div className="accounts-summary-bar">
                  <span style={{ width: `${Math.max((totals.assets / Math.max(totals.assets + totals.liabilities, 1)) * 100, 12)}%` }} />
                </div>
                <div className="accounts-summary-item">
                  <span>Liabilities</span>
                  <strong>{currencyFormatter.format(totals.liabilities)}</strong>
                </div>
                <div className="accounts-summary-bar accounts-summary-bar--liability">
                  <span style={{ width: `${Math.max((totals.liabilities / Math.max(totals.assets + totals.liabilities, 1)) * 100, 12)}%` }} />
                </div>
              </div>
            ) : (
              <div className="accounts-summary-list">
                <div className="accounts-summary-item">
                  <span>Assets share</span>
                  <strong>{Math.round((totals.assets / Math.max(totals.assets + totals.liabilities, 1)) * 100)}%</strong>
                </div>
                <div className="accounts-summary-item">
                  <span>Liabilities share</span>
                  <strong>{Math.round((totals.liabilities / Math.max(totals.assets + totals.liabilities, 1)) * 100)}%</strong>
                </div>
                <div className="accounts-summary-item">
                  <span>Net worth</span>
                  <strong>{currencyFormatter.format(totals.netWorth)}</strong>
                </div>
              </div>
            )}

            <div className="accounts-summary-actions">
              <button className="button button-secondary button-small accounts-summary-download" type="button" onClick={exportCsv}>
                <ActionIcon name="download" />
                <span>Download CSV</span>
              </button>
              <button className="button button-secondary button-small accounts-summary-download" type="button" onClick={exportPdf}>
                <ActionIcon name="download" />
                <span>Download PDF</span>
              </button>
            </div>
          </aside>
        </section>

        <div className="accounts-status-bar">
          <span className="pill pill-neutral">{selectedWorkspace?.name ?? "No workspace selected"}</span>
          <span className="pill pill-neutral">{currentMetricLabel}</span>
          <span className="pill pill-neutral">{currentRangeLabel}</span>
          <span className="pill pill-neutral">{message}</span>
        </div>
      </div>

      {addOpen ? (
        <div className="modal-backdrop" role="presentation" onClick={() => setAddOpen(false)}>
          <section
            className="modal-card modal-card--wide accounts-add-modal glass"
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-account-title"
            ref={addRef}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-head">
              <div>
                <p className="eyebrow">Accounts</p>
                <h4 id="add-account-title">Add an account</h4>
                <p className="modal-copy">Manual balances or imported statement history. Cash is included automatically.</p>
              </div>
              <button className="icon-button" type="button" onClick={() => setAddOpen(false)} aria-label="Close add account">
                ×
              </button>
            </div>

            <div className="accounts-add-tabs">
              <button type="button" className={addMode === "manual" ? "is-active" : ""} onClick={() => setAddMode("manual")}>
                Manual account
              </button>
              <button type="button" className={addMode === "import" ? "is-active" : ""} onClick={() => setAddMode("import")}>
                Import from statements
              </button>
            </div>

            <div className="accounts-add-grid">
              {addMode === "manual" ? (
                <div className="accounts-add-column">
                  <div className="accounts-kind-grid">
                    {manualKinds.map((kind) => (
                    <button
                      key={kind.value}
                      type="button"
                      className={`accounts-kind-card ${manualKind === kind.value ? "is-active" : ""} ${kind.value === "cash" ? "is-cash" : ""}`}
                      onClick={() => setManualKind(kind.value)}
                      >
                        <strong>{kind.label}</strong>
                        <span>{kind.helper}</span>
                      </button>
                    ))}
                  </div>

                  <form className="accounts-manual-form" onSubmit={createManualAccount}>
                    <label>
                      Name
                      <input value={manualName} onChange={(event) => setManualName(event.target.value)} placeholder="Example: BDO Savings" />
                    </label>
                    <label>
                      Balance
                      <input
                        value={manualBalance}
                        onChange={(event) => setManualBalance(event.target.value)}
                        inputMode="decimal"
                        placeholder="0.00"
                      />
                    </label>
                    <button
                      className="button button-primary"
                      type="submit"
                      disabled={isSaving || (manualKind === "cash" && accounts.some((account) => account.type === "cash"))}
                    >
                      {isSaving ? "Saving..." : "Create account"}
                    </button>
                    {manualKind === "cash" && accounts.some((account) => account.type === "cash") ? (
                      <p className="modal-copy">Cash already appears automatically in this workspace.</p>
                    ) : null}
                  </form>
                </div>
              ) : (
                <div className="accounts-import-column">
                  <article className="accounts-import-card">
                    <p className="eyebrow">Import</p>
                    <h5>Import transaction history</h5>
                    <p>
                      PDF and CSV imports can auto-populate the bank name, account label, and line items. If the account is
                      not recognized, we can label it as <strong>-</strong> until it’s assigned.
                    </p>
                    <Link className="button button-secondary button-small" href="/imports">
                      Import transactions
                    </Link>
                  </article>

                  <article className="accounts-import-card">
                    <p className="eyebrow">Import</p>
                    <h5>Import balance history</h5>
                    <p>Map historical balances to the correct account after upload so the net worth chart stays aligned.</p>
                    <Link className="button button-secondary button-small" href="/imports">
                      Import balances
                    </Link>
                  </article>

                  <article className="accounts-import-card accounts-import-card--stacked">
                    <p className="eyebrow">Imported accounts</p>
                    <h5>Multiple accounts in one file</h5>
                    <p>If a statement contains several accounts, we can disambiguate them with the last four digits and file source.</p>
                  </article>
                </div>
              )}
            </div>
          </section>
        </div>
      ) : null}
    </CloverShell>
  );
}
