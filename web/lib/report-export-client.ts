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
  if (format === "csv") {
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
    return;
  }
  const frame = document.createElement("iframe");
  frame.title = "Clover report PDF";
  frame.style.cssText =
    "position:fixed;width:0;height:0;border:0;left:-10000px";
  const loaded = new Promise<void>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("Unable to prepare this report. Please retry.")),
      10000,
    );
    frame.onload = () => {
      clearTimeout(timer);
      resolve();
    };
    frame.onerror = () => {
      clearTimeout(timer);
      reject(new Error("Unable to prepare this report."));
    };
  });
  frame.srcdoc = reportExportHtml(report);
  document.body.appendChild(frame);
  try {
    await loaded;
    const target = frame.contentWindow;
    if (!target) throw new Error("Printing is unavailable.");
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, 120000);
      target.addEventListener(
        "afterprint",
        () => {
          clearTimeout(timer);
          resolve();
        },
        { once: true },
      );
      target.focus();
      target.print();
    });
  } finally {
    frame.remove();
  }
}
