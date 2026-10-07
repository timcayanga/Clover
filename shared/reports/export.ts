import { budgetHistoryExplanation, importCoverageLines } from "./history-copy";
import { savingsRate, type ReportView } from "./analysis";
import type { ReportsWorkspace } from "./workspace";
export type ExportCell = string | number;
export type ReportExport = {
  title: string;
  metadata: [string, string][];
  tables: { title: string; headers: string[]; rows: ExportCell[][] }[];
  notes: string[];
};
const money = (n: number) => Math.round(n * 100) / 100;
const names = {
  overview: "Overview",
  spending: "Spending",
  trends: "Trends",
  advanced: "Insights",
};
export function buildReportExport(
  w: ReportsWorkspace,
  section: ReportView["section"],
): ReportExport {
  const v = w.view;
  const resolve = (ids: string[], options: { id: string; name: string }[]) =>
    ids.length
      ? ids.map((id) => options.find((o) => o.id === id)?.name ?? id).join("; ")
      : "All";
  const result: ReportExport = {
    title: `Clover Reports · ${names[section]}`,
    metadata: [
      ["Profile", w.profileName ?? "Profile"],
      ["Period", `${w.period.from} to ${w.period.to}`],
      ["Timezone", w.timeZone],
      ["Currency", v.currency],
      ["Accounts", resolve(v.accounts, w.accounts)],
      ["Categories", v.categories.join("; ") || "All"],
      ["Merchants", v.merchants?.join("; ") || "All"],
      ["Tags", resolve(v.tags ?? [], w.tags ?? [])],
      ["Review", v.review],
      ["Transfers", v.transfers],
      ["Comparison", `${w.period.previousFrom} to ${w.period.previousTo}`],
    ],
    tables: [],
    notes: [],
  };
  if (section === "advanced" && !w.paid) return result;
  for (const r of w.reports) {
    const a = r.analysis;
    const add = (title: string, headers: string[], rows: ExportCell[][]) =>
      result.tables.push({ title: `${title} (${r.currency})`, headers, rows });
    if (section === "overview") {
      add(
        "Summary",
        ["Metric", "Selected period", "Comparison period"],
        [
          ["Income", a.current.income, a.previous.income],
          ["Expenses", a.current.expense, a.previous.expense],
          [
            "Net income",
            money(a.current.income - a.current.expense),
            money(a.previous.income - a.previous.expense),
          ],
          [
            "Savings rate (%)",
            savingsRate(a.current.income, a.current.expense) ?? "N/A",
            savingsRate(a.previous.income, a.previous.expense) ?? "N/A",
          ],
        ],
      );
      add(
        "Estimated money over time",
        ["Date", "Balance"],
        r.balances.map((p) => [p.date, p.balance]),
      );
      add(
        "Dated net worth",
        ["Date", "Net worth"],
        r.netWorth.map((p) => [p.date, p.balance]),
      );
      add(
        "Income sources",
        ["Source", "Income", "Transactions"],
        a.incomeSources.map((p) => [p.name, p.amount, p.count]),
      );
    }
    if (section === "spending") {
      add(
        "Where It Went",
        ["Category", "Spending", "Transactions"],
        a.categories.map((p) => [p.name, p.amount, p.count]),
      );
      add(
        "Merchant analysis",
        ["Merchant", "Spending", "Comparison", "Change", "Transactions"],
        (r.merchantAnalysis ?? []).map((m) => [
          m.name,
          m.amount,
          m.previous,
          m.change,
          m.count,
        ]),
      );
      if (r.recoveries) {
        const recovery = r.recoveries;
        add(
          "Personal cost",
          ["Metric", "Amount"],
          [
            ["Gross spending", recovery.gross],
            ["Linked refunds", recovery.refunds],
            ["Linked reimbursements", recovery.reimbursements],
            ["Personal cost", recovery.personalCost],
            [
              "Received for earlier expenses",
              recovery.receivedForEarlierExpenses,
            ],
          ],
        );
        add(
          "Linked payments",
          [
            "Expense",
            "Expense date",
            "Money received",
            "Received date",
            "Type",
            "Amount",
            "Note",
          ],
          recovery.links.map((l) => [
            l.expenseName,
            l.expenseDate,
            l.incomingName,
            l.receivedDate,
            l.kind,
            l.amount,
            l.issue ?? "",
          ]),
        );
        result.notes.push(...recovery.notes.map((n) => `${r.currency}: ${n}`));
      }
      if (w.paid)
        add(
          "Budget versus actual",
          [
            "Budget",
            "Month",
            "From",
            "To",
            "Target",
            "Spent",
            "Remaining",
            "Over budget",
            "History basis",
          ],
          (r.budgets ?? []).map((b) => [
            b.name,
            b.month,
            b.from,
            b.to,
            b.target,
            b.actual,
            b.remaining,
            b.over,
            b.historyBasis === "recorded" ? "Recorded settings" : "Estimated",
          ]),
        );
    }
    if (section === "trends") {
      for (const [label, summary] of [
        ["Last 7 days", a.weekly],
        ["Month to date", a.monthlySummary],
      ] as const) {
        add(
          label,
          [
            "From",
            "To",
            "Income",
            "Expenses",
            "Comparison income",
            "Comparison expenses",
          ],
          [
            [
              summary.from,
              summary.to,
              summary.current.income,
              summary.current.expense,
              summary.previous.income,
              summary.previous.expense,
            ],
          ],
        );
        add(
          label + " daily activity",
          ["Date", "Income", "Expenses"],
          summary.points.map((p) => [p.date, p.income, p.expense]),
        );
      }
      add(
        "Spending pace",
        ["Date", "Cumulative spending", "Comparison cumulative spending"],
        a.pace.map((p) => [p.date, p.current, p.previous]),
      );
      add(
        "Monthly income and spending",
        ["Month", "Income", "Expenses", "Net income", "Partial month"],
        a.monthly.map((m) => [
          m.month,
          m.income,
          m.expense,
          money(m.income - m.expense),
          m.partial ? "Yes" : "No",
        ]),
      );
      add(
        "Biggest merchants",
        ["Merchant", "Spending", "Transactions"],
        a.merchants.map((m) => [m.name, m.amount, m.count]),
      );
      add(
        "Repeat bill suggestions",
        [
          "Merchant",
          "Amount",
          "Occurrences",
          "Suggested cadence",
          "Suggested next date",
        ],
        a.repeats.map((m) => [
          m.name,
          m.amount,
          m.count,
          m.cadence,
          m.nextDue ?? "Unknown",
        ]),
      );
      if (w.paid) {
        add(
          "Income and expense statement",
          ["Month", "Type", "Category", "Amount"],
          a.statement.flatMap((row) =>
            a.months.map((month, i) => [
              month,
              row.type,
              row.name,
              row.values[i],
            ]),
          ),
        );
        add(
          "Category totals",
          ["Type", "Category", "Total", "Monthly average"],
          a.statement.map((row) => [
            row.type,
            row.name,
            row.total,
            money(row.average),
          ]),
        );
        const selected = v.trendCategories.length
          ? v.trendCategories
          : a.trends.slice(0, 6).map((t) => t.name);
        add(
          "Category trends by month",
          ["Category", "Month", "Spending"],
          a.trends
            .filter((t) => selected.includes(t.name))
            .flatMap((t) =>
              t.points.map((p) => [t.name, p.date.slice(0, 7), p.value]),
            ),
        );
        add(
          "Category trends",
          ["Category", "Selected period", "Comparison", "Change"],
          a.trends
            .filter((t) => selected.includes(t.name))
            .map((t) => [t.name, t.amount, t.previous, t.delta]),
        );
      }
    }
    if (section === "advanced" && w.paid) {
      add(
        "Cash flow",
        ["Account", "Beginning balance", "Income", "Destination", "Amount"],
        r.cashFlow.flatMap((a) =>
          a.flows.map((f) => [
            a.label,
            a.beginningBalance,
            a.incomeAmount,
            f.label,
            f.amount,
          ]),
        ),
      );
      if (r.goal)
        result.notes.push(
          `${r.currency} Goal: ${r.goal.title}. ${r.goal.detail}`,
        );
      if (a.drivers.category)
        result.notes.push(
          `${r.currency} Main category change: ${a.drivers.category.name} ${a.drivers.category.delta}`,
        );
      if (a.drivers.merchant)
        result.notes.push(
          `${r.currency} Main merchant change: ${a.drivers.merchant.name} ${a.drivers.merchant.delta}`,
        );
    }
    if (v.transfers !== "exclude")
      add(
        "Transfer activity",
        ["Recorded entries"],
        [[a.transferActivity.count]],
      );
    if (r.importCoverage?.length)
      add(
        "Statement coverage",
        ["Account", "Details"],
        r.importCoverage.map((c) => [
          c.name,
          importCoverageLines(c).join("; "),
        ]),
      );
    result.notes.push(
      ...(r.coverage?.notes ?? []).map((n) => `${r.currency}: ${n}`),
    );
  }
  if (section === "spending" && w.paid)
    result.notes.push(budgetHistoryExplanation);
  return result;
}
// Keep untrusted names from becoming formulas when opened in spreadsheet applications.
export function reportCsvCell(value: ExportCell) {
  const raw =
    typeof value === "number"
      ? String(Number.isFinite(value) ? value : "")
      : value;
  const safe =
    typeof value === "string" && /^[\s\u0000-\u001f]*[=+@-]/.test(raw)
      ? "'" + raw
      : raw;
  return '"' + safe.replace(/"/g, '""') + '"';
}
export function reportExportCsv(report: ReportExport) {
  const rows: ExportCell[][] = [[report.title], ...report.metadata, []];
  for (const table of report.tables)
    rows.push([table.title], table.headers, ...table.rows, []);
  rows.push(["Notes"], ...report.notes.map((n) => [n]));
  return (
    "\ufeff" + rows.map((row) => row.map(reportCsvCell).join(",")).join("\r\n")
  );
}
const escapeHtml = (s: ExportCell) =>
  String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
export function reportExportHtml(report: ReportExport) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(report.title)}</title><style>@page{size:A4 landscape;margin:14mm}body{font:12px Arial,sans-serif;color:#20313b;margin:24px}h1{font-size:24px;color:#008c9f}h2{font-size:16px;margin-top:26px;break-after:avoid}p{line-height:1.5}table{width:100%;border-collapse:collapse;margin:8px 0 20px;table-layout:fixed}th,td{border-bottom:1px solid #cbd6dd;padding:7px;text-align:left;overflow-wrap:anywhere}th{background:#e9f8f9}thead{display:table-header-group}tr{break-inside:avoid}.metadata{font-size:11px}.notes{font-size:11px;color:#465661}@media print{body{margin:0}}</style></head><body><h1>${escapeHtml(report.title)}</h1><div class="metadata">${report.metadata.map(([k, v]) => `<p><strong>${escapeHtml(k)}:</strong> ${escapeHtml(v)}</p>`).join("")}</div>${report.tables.map((t) => `<h2>${escapeHtml(t.title)}</h2><table><thead><tr>${t.headers.map((h) => `<th>${escapeHtml(h)}</th>`).join("")}</tr></thead><tbody>${t.rows.length ? t.rows.map((row) => `<tr>${row.map((c) => `<td>${escapeHtml(c)}</td>`).join("")}</tr>`).join("") : `<tr><td colspan="${t.headers.length}">No matching activity.</td></tr>`}</tbody></table>`).join("")}<h2>About these figures</h2><div class="notes">${report.notes.map((n) => `<p>${escapeHtml(n)}</p>`).join("")}</div></body></html>`;
}
