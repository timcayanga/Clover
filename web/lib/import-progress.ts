import type { ImportImageMode } from "@/lib/import-image-mode";

export const IMPORT_PROGRESS = {
  preparing: 20,
  uploading: 40,
  parsing: 60,
  loadingAccount: 80,
  finalizing: 90,
  done: 100,
} as const;

export const friendlyImportPhaseLabel = (label: string, fileName?: string | null, _importMode?: ImportImageMode | null) => {
  const fileSuffix = fileName ? ` ${fileName}` : "";

  switch (label) {
    case "Preparing file":
      return "Preparing file";
    case "Starting upload":
    case "Uploading the file":
    case "Uploading file":
      return "Uploading file";
    case "File uploaded":
      return "Reading file details";
    case "Password needed":
      return "Password needed";
    case "Waiting for account details":
    case "Waiting for statement identity":
    case "Reading locally":
    case "Reading statement details":
    case "Clover is getting your file ready":
    case "Loading account":
    case "Reading account details":
      return "Reading file details";
    case "Preview ready":
      return "File details ready";
    case "Queued for background processing":
      return "Queued for background processing";
    case "Finalizing in background":
    case "Finalizing import":
      return "Applying names and categories";
    case "Loading transactions":
    case "Parsing in background":
      return "Identifying transactions";
    case "Clover is reading the document":
      return "Reading document";
    case "Import failed":
      return "Import failed";
    case "Done":
      return "Import complete";
    case "Queued":
      return "Queued";
    default:
      return `${label}${fileSuffix}`.trim();
  }
};

export const friendlyImportProgressLabel = (label: string, _fileName?: string | null, _importMode?: ImportImageMode | null) => {
  switch (label) {
    case "Preparing file":
      return "Clover is checking the file";
    case "Starting upload":
      return "Clover is checking the file format";
    case "Clover is getting your file ready":
      return "Clover is checking the file format";
    case "Uploading the file":
    case "Uploading file":
      return "Clover is uploading the file";
    case "File uploaded":
      return "Clover uploaded the file and is reading its details";
    case "Password needed":
      return "This file needs a password before Clover can continue";
    case "Waiting for account details":
      return "Clover is reading the file details";
    case "Waiting for statement identity":
      return "Clover is reading the document layout";
    case "Reading locally":
      return "Clover is scanning the file locally";
    case "Preview ready":
      return "Clover found the file details and is ready to show them";
    case "Queued for background processing":
      return "Clover will finish the remaining work in the background";
    case "Finalizing in background":
    case "Finalizing import":
      return "Clover is applying normalized names, categories, and duplicate checks";
    case "Loading account":
      return "Clover already found the details and is matching them to your workspace";
    case "Loading transactions":
      return "Clover is identifying transactions and assigning categories";
    case "Parsing in background":
      return "Clover is identifying transactions and categories";
    case "Reading account details":
      return "Clover is pulling the file details into preview";
    case "Reading statement details":
      return "Clover is reading the file details";
    case "Identifying transactions":
      return "Clover is identifying transactions";
    case "Saving transactions":
      return "Clover is saving transactions to your workspace";
    case "Trying backup reader":
      return "Clover is trying the backup reader";
    case "Trying backup receipt reader":
      return "Clover is trying the backup receipt reader";
    case "Rechecking file":
      return "Clover is rechecking the file";
    case "Import failed":
      return "Clover couldn't finish the import";
    case "Done":
      return "The file is imported and ready";
    case "Queued":
      return "Clover is waiting to start";
    default:
      return label;
  }
};
