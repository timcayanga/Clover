import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { File, Paths } from "expo-file-system";
import { removeUploadCopy } from "./upload";
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
  if (!(await Sharing.isAvailableAsync()))
    throw new Error("File sharing is unavailable on this device.");
  const report = buildReportExport(workspace, section);
  let uri = "";
  try {
    if (format === "pdf")
      uri = (
        await Print.printToFileAsync({
          html: reportExportHtml(report),
          width: 842,
          height: 595,
        })
      ).uri;
    else {
      const file = new File(Paths.cache, `Clover-${section}-${Date.now()}.csv`);
      file.create();
      uri = file.uri;
      file.write(reportExportCsv(report));
    }
    await Sharing.shareAsync(uri, {
      mimeType: format === "pdf" ? "application/pdf" : "text/csv",
      UTI:
        format === "pdf"
          ? "com.adobe.pdf"
          : "public.comma-separated-values-text",
      dialogTitle: "Save Clover report",
    });
  } finally {
    if (uri) removeUploadCopy(uri);
  }
}
