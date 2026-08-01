import type { DetectedStatementMetadata } from "@/lib/import-parser";

export const isTrustedMetadataOnlyWiseStatement = (params: {
  fileName: string;
  fileType: string;
  importMode: string;
  rowCount: number;
  metadata: DetectedStatementMetadata;
}) => {
  const { metadata } = params;
  const institutionIdentity = String(metadata.institution ?? "").trim();
  const currency = String(metadata.currency ?? "").trim().toUpperCase();

  return (
    params.importMode === "statement" &&
    params.rowCount === 0 &&
    (params.fileType === "application/pdf" || /\.pdf$/i.test(params.fileName)) &&
    /\bwise\b/i.test(institutionIdentity) &&
    /^[A-Z]{3}$/.test(currency) &&
    typeof metadata.endingBalance === "number" &&
    Number.isFinite(metadata.endingBalance) &&
    Number(metadata.confidence ?? 0) >= 80
  );
};
