export type ImportErrorStage =
  | "validation"
  | "password"
  | "upload"
  | "process"
  | "confirm"
  | "background"
  | "monitor"
  | "unknown";

export type ImportErrorCategory =
  | "Validation"
  | "Password"
  | "Upload"
  | "Parsing"
  | "Saving"
  | "Background sync"
  | "Finalizing"
  | "Unknown";

export type ImportErrorHttpClass = "400 client-side error" | "500 server-side error" | "504 timeout" | "unknown";

export type ImportErrorSpec = {
  code: string;
  stage: ImportErrorStage;
  category: ImportErrorCategory;
  httpClass: ImportErrorHttpClass;
  title: string;
  message: string;
  nextSteps: string[];
  resumable: boolean;
};

const RESUMABLE_ERROR_CODES = new Set(["I-104", "I-105", "I-106", "I-107"]);

const SPEC_BY_STAGE: Record<
  ImportErrorStage,
  {
    code: string;
    category: ImportErrorCategory;
    httpClass: ImportErrorHttpClass;
    title: string;
    message: string;
    nextSteps: string[];
    resumable: boolean;
  }
> = {
  validation: {
    code: "I-101",
    category: "Validation",
    httpClass: "400 client-side error",
    title: "File needs a clearer scan",
    message: "Clover could not read this statement clearly enough to continue.",
    nextSteps: [
      "Re-upload a clearer PDF, CSV, or image file.",
      "If the statement is a scan, try the original PDF instead of a screenshot.",
      "If Clover still misses rows, add the missing transactions manually in Transactions.",
    ],
    resumable: false,
  },
  password: {
    code: "I-102",
    category: "Password",
    httpClass: "400 client-side error",
    title: "Password required",
    message: "Clover needs the file password before it can read this statement.",
    nextSteps: [
      "Enter the statement password and try again.",
      "If the password keeps failing, re-download the original statement and upload it again.",
      "You can always add missing transactions manually in Transactions.",
    ],
    resumable: false,
  },
  upload: {
    code: "I-103",
    category: "Upload",
    httpClass: "500 server-side error",
    title: "Upload failed",
    message: "Clover could not upload the file to finish processing it.",
    nextSteps: [
      "Try the upload again with the original PDF or CSV.",
      "If the connection is unstable, upload one file at a time.",
      "If the file still fails, add the transactions manually in Transactions.",
    ],
    resumable: false,
  },
  process: {
    code: "I-104",
    category: "Parsing",
    httpClass: "500 server-side error",
    title: "Parsing issue",
    message: "Clover could not finish reading the statement.",
    nextSteps: [
      "Click Resume import if Clover shows it, or upload the original file again.",
      "If Clover still stalls, add the missing transactions manually in Transactions.",
      "If the statement looks off after import, check Review before confirming anything.",
    ],
    resumable: true,
  },
  confirm: {
    code: "I-105",
    category: "Saving",
    httpClass: "500 server-side error",
    title: "Saving issue",
    message: "Clover parsed the file but could not finish saving the import.",
    nextSteps: [
      "Click Resume import if Clover shows it, or upload the original file again.",
      "If Clover still stalls, add the missing transactions manually in Transactions.",
      "If the statement looks off after import, check Review before confirming anything.",
    ],
    resumable: true,
  },
  background: {
    code: "I-106",
    category: "Background sync",
    httpClass: "500 server-side error",
    title: "Background sync stalled",
    message: "Clover parsed the file, but the background reconciliation took too long.",
    nextSteps: [
      "Click Resume import if Clover shows it, or stay on the import screen a little longer.",
      "If the parsed rows already look right, open the account and continue manually from there.",
      "If anything is still missing, add the transactions manually in Transactions and verify totals in Review.",
    ],
    resumable: true,
  },
  monitor: {
    code: "I-107",
    category: "Finalizing",
    httpClass: "504 timeout",
    title: "Import still finalizing",
    message: "Clover read the account details, but the import needed more time to finish saving.",
    nextSteps: [
      "Click Resume import if Clover shows it, or stay on the import screen a little longer while Clover finishes.",
      "If the account details already look right, open the account and continue with any missing rows manually.",
      "If the transactions still do not appear, add the missing entries in Transactions and use Review to verify the totals.",
    ],
    resumable: true,
  },
  unknown: {
    code: "I-199",
    category: "Unknown",
    httpClass: "500 server-side error",
    title: "Import issue",
    message: "Clover hit an unexpected problem while finishing this file.",
    nextSteps: [
      "Re-upload the original PDF or CSV.",
      "If Clover still stalls, add the missing transactions manually in Transactions.",
      "If the statement looks off after import, check Review before confirming anything.",
    ],
    resumable: false,
  },
};

const STAGE_BY_CODE: Record<string, ImportErrorStage> = {
  "I-101": "validation",
  "I-102": "password",
  "I-103": "upload",
  "I-104": "process",
  "I-105": "confirm",
  "I-106": "background",
  "I-107": "monitor",
  "I-199": "unknown",
};

const normalizeCode = (value?: string | null) => (value ?? "").trim().toUpperCase();

const sanitizeReasonForUser = (reason?: string | null) => {
  const value = reason?.trim();
  if (!value) {
    return null;
  }

  if (
    /prisma|transaction api|createMany|expired transaction|invocation|query cannot be executed|timeout for this transaction|interactive transaction/i.test(
      value
    )
  ) {
    return "Clover hit a temporary saving timeout.";
  }

  return value;
};

export const getImportErrorStageFromCode = (code?: string | null): ImportErrorStage => {
  const normalized = normalizeCode(code);
  return STAGE_BY_CODE[normalized] ?? "unknown";
};

export const getImportErrorSpec = (stage: ImportErrorStage, fileName?: string | null, reason?: string | null): ImportErrorSpec => {
  const spec = SPEC_BY_STAGE[stage];
  const fileLabel = fileName ? `${fileName}` : "This file";
  const safeReason = sanitizeReasonForUser(reason);
  const messageParts = [
    spec.message,
    safeReason,
  ].filter((part): part is string => Boolean(part));

  return {
    ...spec,
    stage,
    message: `${fileLabel}: ${messageParts.join(" ")}`,
  };
};

export const getImportErrorSpecForCode = (code?: string | null): ImportErrorSpec => {
  const stage = getImportErrorStageFromCode(code);
  return {
    ...SPEC_BY_STAGE[stage],
    stage,
  };
};

export const getImportErrorNextSteps = (code?: string | null) => {
  return getImportErrorSpecForCode(code).nextSteps;
};

export const isResumableImportErrorCode = (code?: string | null) => {
  const normalized = normalizeCode(code);
  return RESUMABLE_ERROR_CODES.has(normalized);
};
