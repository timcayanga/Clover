import { printSnapshot } from "./print-snapshot";
import {
  buildReportExport,
  reportExportCsv,
  reportExportHtml,
} from "../../shared/reports/export";
import type { ReportsWorkspace } from "../../shared/reports/workspace";
import type { ReportView } from "../../shared/reports/analysis";
export async function exportReport(
  workspace: ReportsWorkspace,
  section: ReportView["section"],
  format: "csv" | "pdf",
) {
  const report = buildReportExport(workspace, section);
  if (format === "pdf") return printSnapshot(reportExportHtml(report));
  const url = URL.createObjectURL(
    new Blob([reportExportCsv(report)], { type: "text/csv;charset=utf-8" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = `Clover-${section}-${workspace.period.from}-${workspace.period.to}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
