"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { AdminDataQaListResponse, AdminDataQaSourceFilter } from "@/lib/admin-data-qa";
import { chooseWorkspaceId } from "@/lib/workspace-selection";

const EMPTY_RESPONSE: AdminDataQaListResponse = {
  overview: {
    totalFiles: 0,
    totalRuns: 0,
    averageScore: 0,
    sampleRuns: 0,
    sampleAverageScore: 0,
    criticalRuns: 0,
    slowRuns: 0,
    linkedRuns: 0,
    latestRunAt: null,
    recentFindingCodes: [],
  },
  files: [],
  runs: [],
  page: 1,
  pageSize: 20,
  totalCount: 0,
  totalPages: 1,
};

const SOURCES: Array<{ label: string; value: AdminDataQaSourceFilter }> = [
  { label: "All sources", value: "all" },
  { label: "Import processing", value: "import_processing" },
  { label: "Import confirmation", value: "import_confirmation" },
  { label: "Local training", value: "local_training" },
  { label: "Replay", value: "replay" },
  { label: "Manual", value: "manual" },
];

const DATA_QA_CONFIG_DEFAULTS = {
  clover_output_spec: {
    title: "How Clover should show accounts and transactions",
    body:
      "Accounts:\n- Show the account name clearly.\n- Show the account number when available.\n- Show the current or statement balance.\n- Show account type and institution when known.\n- Prefer real statement layouts from Philippine banks over synthetic examples.\n\nTransactions:\n- Show transactions newest-first unless a statement requires a different order.\n- Show date, merchant/description, amount, and category.\n- Keep the raw description available for traceability.\n- Show normalized merchant names when available, but preserve the raw merchant text in detail views.\n- Keep confirmed values stable unless a user or review workflow changes them.\n- Avoid inventing statement fields that do not appear in real bank statements.",
  },
  qa_instructions: {
    title: "Data QA instructions",
    body:
      "1. Find legitimate Statement of Accounts from real Philippine banks, with a preference for popular banks like BPI, BDO, Metrobank, RCBC, UnionBank, GCash, Maya, Security Bank, and similar institutions.\n2. Do not create synthetic statements or invent bank documents. Only use real uploaded files.\n3. Upload or submit files through the same import/processing flow as production imports.\n4. Re-parse older uploaded statements as safe sample files so the parser can learn from real layouts and improve confidence.\n5. Review the parsed output against the raw file and the intended Clover output shape.\n6. Check bank, account number, account type, account balance, transaction count, and the comprehensive list of transactions.\n7. Mark fields correct when they match, or leave notes for improvement.\n8. Read QA findings and look for parser speed regressions, confidence issues, and UI mismatches.\n9. Save structured field feedback and free-text feedback.\n10. If something is wrong, capture the issue, propose the fix, and rerun the QA flow after the parser or UI is updated.\n11. Keep raw data separate from normalized output and never overwrite confirmed financial data.\n12. Prefer deterministic fixes before AI fallback, and turn repeatable improvements into durable rules or tests.",
  },
} as const;

type DataQaConfigKey = keyof typeof DATA_QA_CONFIG_DEFAULTS;

type DataQaConfigState = {
  key: DataQaConfigKey;
  title: string;
  body: string;
  updatedBy: string | null;
  updatedAt: string | null;
};

const createDefaultConfigState = (key: DataQaConfigKey): DataQaConfigState => ({
  key,
  title: DATA_QA_CONFIG_DEFAULTS[key].title,
  body: DATA_QA_CONFIG_DEFAULTS[key].body,
  updatedBy: null,
  updatedAt: null,
});

function formatDateTime(value: string | null) {
  if (!value) {
    return "Not set";
  }

  return new Intl.DateTimeFormat("en-PH", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatNumber(value: number | null) {
  return value === null ? "—" : value.toLocaleString();
}

function scoreTone(score: number) {
  if (score >= 85) {
    return "admin-users__pill--success";
  }

  if (score >= 65) {
    return "admin-users__pill--sync";
  }

  return "admin-users__pill--warn";
}

function severityTone(severity: string) {
  if (severity === "critical") {
    return "admin-users__pill--warn";
  }

  if (severity === "warning") {
    return "admin-users__pill--sync";
  }

  return "admin-users__pill--success";
}

function statusTone(status: string) {
  if (status === "completed") {
    return "admin-users__pill--success";
  }

  if (status === "failed") {
    return "admin-users__pill--warn";
  }

  if (status === "processing" || status === "queued" || status === "testing") {
    return "admin-users__pill--sync";
  }

  return "admin-users__pill--locked";
}

const readStringField = (value: unknown, key: string) => {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    return typeof record[key] === "string" ? String(record[key]) : null;
  }

  return null;
};

const formatDisplayValue = (value: unknown) => {
  if (value === null || value === undefined || value === "") {
    return "Unknown";
  }

  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value.toLocaleString() : "Unknown";
  }

  return JSON.stringify(value);
};

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
};

const normalizeCellValue = (value: unknown): string => {
  if (value === null || value === undefined || value === "") {
    return "—";
  }

  if (value instanceof Date) {
    return formatDateTime(value.toISOString());
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value.toLocaleString() : "—";
  }

  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }

  if (typeof value === "string") {
    return value;
  }

  if (Array.isArray(value)) {
    return value.length ? value.map((entry) => normalizeCellValue(entry)).join(", ") : "—";
  }

  if (isRecord(value)) {
    return JSON.stringify(value);
  }

  return String(value);
};

const pickRowValue = (row: Record<string, unknown>, keys: string[]) => {
  for (const key of keys) {
    const value = row[key];
    if (value !== undefined && value !== null && value !== "") {
      return value;
    }
  }

  return null;
};

const readRowText = (row: Record<string, unknown>, keys: string[]): string => normalizeCellValue(pickRowValue(row, keys));

const readRowNumber = (row: Record<string, unknown>, keys: string[]) => {
  const value = pickRowValue(row, keys);
  if (typeof value === "number" && Number.isFinite(value)) {
    return value.toLocaleString();
  }

  if (typeof value === "string" && value.trim()) {
    return value;
  }

  return "—";
};

const readMetadataValue = (metadata: unknown, key: string) => {
  if (!isRecord(metadata)) {
    return null;
  }

  return metadata[key] ?? null;
};

const readMetadataText = (metadata: unknown, key: string) => normalizeCellValue(readMetadataValue(metadata, key));

const FIELD_REVIEW_KEYS = ["accountName", "accountNumber", "balance", "transactions"] as const;
type FieldReviewKey = (typeof FIELD_REVIEW_KEYS)[number];

type FieldReviewDraft = Record<
  FieldReviewKey,
  {
    correct: boolean;
    notes: string;
  }
>;

const createEmptyFieldReviewDraft = (): FieldReviewDraft => ({
  accountName: { correct: false, notes: "" },
  accountNumber: { correct: false, notes: "" },
  balance: { correct: false, notes: "" },
  transactions: { correct: false, notes: "" },
});

const buildFieldReviewDraft = (value: unknown): FieldReviewDraft => {
  const draft = createEmptyFieldReviewDraft();

  if (!isRecord(value)) {
    return draft;
  }

  for (const key of FIELD_REVIEW_KEYS) {
    const entry = value[key];
    if (!isRecord(entry)) {
      continue;
    }

    draft[key] = {
      correct: Boolean(entry.correct),
      notes: typeof entry.notes === "string" ? entry.notes : "",
    };
  }

  return draft;
};

type AdminDataQaRunDetail = {
  id: string;
  workspaceId: string;
  workspaceName: string;
  importFileId: string | null;
  source: string;
  stage: string | null;
  status: string;
  parserVersion: string | null;
  score: number;
  findingCount: number;
  criticalCount: number;
  parserDurationMs: number | null;
  totalDurationMs: number | null;
  feedbackPayload: unknown;
  manualFeedback: string | null;
  manualFeedbackUpdatedAt: string | null;
  manualFeedbackAuthorId: string | null;
  fieldReviewPayload: unknown;
  fieldReviewUpdatedAt: string | null;
  fieldReviewAuthorId: string | null;
  createdAt: string;
  updatedAt: string;
  findings: Array<{
    id: string;
    code: string;
    severity: string;
    field: string | null;
    message: string;
    observedValue: unknown;
    expectedValue: unknown;
    suggestion: string | null;
    confidence: number;
    metadata: unknown;
    createdAt: string;
    transactionId: string | null;
  }>;
  importFile: null | {
    id: string;
    workspaceId: string;
    accountId: string | null;
    fileName: string;
    fileType: string;
    storageKey: string;
    status: string;
    parsedRowsCount: number;
    confirmedTransactionsCount: number;
    uploadedAt: string;
    createdAt: string;
    updatedAt: string;
    account: null | {
      id: string;
      name: string;
      institution: string | null;
      type: string;
      balance: string | null;
    };
  };
  statementCheckpoint: null | {
    id: string;
    statementStartDate: string | null;
    statementEndDate: string | null;
    openingBalance: string | null;
    endingBalance: string | null;
    status: string;
    mismatchReason: string | null;
    sourceMetadata: unknown;
    rowCount: number;
  };
  parsedRows: Array<Record<string, unknown>>;
  rawFilePreview: string | null;
};

export function AdminDataQaConsole() {
  const [data, setData] = useState<AdminDataQaListResponse>(EMPTY_RESPONSE);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [queryInput, setQueryInput] = useState("");
  const [query, setQuery] = useState("");
  const [source, setSource] = useState<AdminDataQaSourceFilter>("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [refreshToken, setRefreshToken] = useState(0);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [selectedRun, setSelectedRun] = useState<AdminDataQaRunDetail | null>(null);
  const [selectedRunLoading, setSelectedRunLoading] = useState(false);
  const [selectedRunError, setSelectedRunError] = useState<string | null>(null);
  const [manualFeedbackDraft, setManualFeedbackDraft] = useState("");
  const [manualFeedbackSaving, setManualFeedbackSaving] = useState(false);
  const [manualFeedbackStatus, setManualFeedbackStatus] = useState<string | null>(null);
  const [fieldReviewDraft, setFieldReviewDraft] = useState<FieldReviewDraft>(() => createEmptyFieldReviewDraft());
  const [fieldReviewSaving, setFieldReviewSaving] = useState(false);
  const [fieldReviewStatus, setFieldReviewStatus] = useState<string | null>(null);
  const [workspaces, setWorkspaces] = useState<Array<{ id: string; name: string }>>([]);
  const [workspacesLoading, setWorkspacesLoading] = useState(false);
  const [workspacesError, setWorkspacesError] = useState<string | null>(null);
  const [uploadWorkspaceId, setUploadWorkspaceId] = useState("");
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [sampleCorpusSaving, setSampleCorpusSaving] = useState(false);
  const [sampleCorpusStatus, setSampleCorpusStatus] = useState<string | null>(null);
  const [rerunningFileId, setRerunningFileId] = useState<string | null>(null);
  const [rerunStatusByFileId, setRerunStatusByFileId] = useState<Record<string, string | null>>({});
  const [dataQaConfig, setDataQaConfig] = useState<Record<DataQaConfigKey, DataQaConfigState>>({
    clover_output_spec: createDefaultConfigState("clover_output_spec"),
    qa_instructions: createDefaultConfigState("qa_instructions"),
  });
  const [dataQaConfigLoading, setDataQaConfigLoading] = useState(false);
  const [dataQaConfigSaving, setDataQaConfigSaving] = useState(false);
  const [dataQaConfigError, setDataQaConfigError] = useState<string | null>(null);
  const [dataQaConfigStatus, setDataQaConfigStatus] = useState<string | null>(null);
  const uploadInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const params = new URLSearchParams({
          page: String(page),
          pageSize: String(pageSize),
        });

        if (query.trim()) {
          params.set("query", query.trim());
        }

        if (source !== "all") {
          params.set("source", source);
        }

        const response = await fetch(`/api/admin/data-qa?${params.toString()}`, {
          cache: "no-store",
        });

        if (!response.ok) {
          const payload = await response.json().catch(() => ({}));
          throw new Error(payload.error || "Unable to load Data QA runs.");
        }

        const payload = (await response.json()) as AdminDataQaListResponse;

        if (!cancelled) {
          setData(payload);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Unable to load Data QA runs.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [page, pageSize, query, refreshToken, source]);

  useEffect(() => {
    let cancelled = false;

    async function loadWorkspaces() {
      setWorkspacesLoading(true);
      setWorkspacesError(null);

      try {
        const response = await fetch("/api/workspaces", {
          cache: "no-store",
        });

        if (!response.ok) {
          const payload = await response.json().catch(() => ({}));
          throw new Error(payload.error || "Unable to load workspaces.");
        }

        const payload = (await response.json()) as {
          workspaces?: Array<{ id: string; name: string }>;
        };

        if (cancelled) {
          return;
        }

        const nextWorkspaces = payload.workspaces ?? [];
        setWorkspaces(nextWorkspaces);
        setUploadWorkspaceId((current) => chooseWorkspaceId(nextWorkspaces, current));
      } catch (loadError) {
        if (!cancelled) {
          setWorkspacesError(loadError instanceof Error ? loadError.message : "Unable to load workspaces.");
        }
      } finally {
        if (!cancelled) {
          setWorkspacesLoading(false);
        }
      }
    }

    void loadWorkspaces();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadConfig() {
      setDataQaConfigLoading(true);
      setDataQaConfigError(null);

      try {
        const response = await fetch("/api/admin/data-qa/config", { cache: "no-store" });
        if (!response.ok) {
          const payload = await response.json().catch(() => ({}));
          throw new Error(payload.error || "Unable to load Data QA instructions.");
        }

        const payload = (await response.json()) as {
          configs?: Array<{ key: DataQaConfigKey; title: string; body: string; updatedBy: string | null; updatedAt: string | null }>;
        };

        if (cancelled) {
          return;
        }

        setDataQaConfig((current) => {
          const next = { ...current };
          for (const config of payload.configs ?? []) {
            next[config.key] = {
              key: config.key,
              title: config.title,
              body: config.body,
              updatedBy: config.updatedBy,
              updatedAt: config.updatedAt,
            };
          }
          return next;
        });
      } catch (loadError) {
        if (!cancelled) {
          setDataQaConfigError(loadError instanceof Error ? loadError.message : "Unable to load Data QA instructions.");
        }
      } finally {
        if (!cancelled) {
          setDataQaConfigLoading(false);
        }
      }
    }

    void loadConfig();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const params = new URLSearchParams(window.location.search);
    const runFromUrl = params.get("run");
    if (runFromUrl && runFromUrl !== selectedRunId) {
      setSelectedRunId(runFromUrl);
    }
  }, [selectedRunId]);

  useEffect(() => {
    if (!selectedRunId) {
      return;
    }

    let cancelled = false;

    async function loadSelectedRun() {
      setSelectedRunLoading(true);
      setSelectedRunError(null);

      try {
        const response = await fetch(`/api/admin/data-qa/${selectedRunId}`, {
          cache: "no-store",
        });

        if (!response.ok) {
          const payload = await response.json().catch(() => ({}));
          throw new Error(payload.error || "Unable to load run details.");
        }

        const payload = (await response.json()) as { run: AdminDataQaRunDetail };
        if (!cancelled) {
          setSelectedRun(payload.run);
          setManualFeedbackDraft(payload.run.manualFeedback ?? "");
          setFieldReviewDraft(buildFieldReviewDraft(payload.run.fieldReviewPayload));
          setManualFeedbackStatus(null);
          setFieldReviewStatus(null);
        }
      } catch (loadError) {
        if (!cancelled) {
          setSelectedRun(null);
          setSelectedRunError(loadError instanceof Error ? loadError.message : "Unable to load run details.");
        }
      } finally {
        if (!cancelled) {
          setSelectedRunLoading(false);
        }
      }
    }

    void loadSelectedRun();

    return () => {
      cancelled = true;
    };
  }, [selectedRunId, refreshToken]);

  const handleSelectRun = (runId: string) => {
    setSelectedRunId(runId);
    setSelectedRunError(null);
    setManualFeedbackStatus(null);
    setFieldReviewStatus(null);

    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      params.set("run", runId);
      window.history.replaceState(null, "", `${window.location.pathname}?${params.toString()}`);
    }
  };

  const saveManualFeedback = async () => {
    if (!selectedRunId) {
      return;
    }

    setManualFeedbackSaving(true);
    setManualFeedbackStatus(null);

    try {
      const response = await fetch(`/api/admin/data-qa/${selectedRunId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          manualFeedback: manualFeedbackDraft.trim(),
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || "Unable to save feedback.");
      }

      const payload = (await response.json()) as { run?: { manualFeedback?: string | null; manualFeedbackUpdatedAt?: string | null } };
      setManualFeedbackDraft(payload.run?.manualFeedback ?? manualFeedbackDraft);
      setManualFeedbackStatus("Saved.");
      setRefreshToken((current) => current + 1);
    } catch (saveError) {
      setManualFeedbackStatus(saveError instanceof Error ? saveError.message : "Unable to save feedback.");
    } finally {
      setManualFeedbackSaving(false);
    }
  };

  const saveFieldReview = async () => {
    if (!selectedRunId) {
      return;
    }

    setFieldReviewSaving(true);
    setFieldReviewStatus(null);

    try {
      const response = await fetch(`/api/admin/data-qa/${selectedRunId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          fieldReviewPayload: fieldReviewDraft,
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || "Unable to save field review.");
      }

      const payload = (await response.json()) as { run?: { fieldReviewUpdatedAt?: string | null } };
      setFieldReviewStatus("Saved.");
      if (payload.run?.fieldReviewUpdatedAt) {
        setRefreshToken((current) => current + 1);
      }
    } catch (saveError) {
      setFieldReviewStatus(saveError instanceof Error ? saveError.message : "Unable to save field review.");
    } finally {
      setFieldReviewSaving(false);
    }
  };

  const saveDataQaConfig = async () => {
    setDataQaConfigSaving(true);
    setDataQaConfigError(null);
    setDataQaConfigStatus(null);

    try {
      const response = await fetch("/api/admin/data-qa/config", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          clover_output_spec: dataQaConfig.clover_output_spec.body,
          qa_instructions: dataQaConfig.qa_instructions.body,
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || "Unable to save Data QA instructions.");
      }

      const payload = (await response.json()) as {
        configs?: Array<{ key: DataQaConfigKey; title: string; body: string; updatedBy: string | null; updatedAt: string | null }>;
      };

      if (payload.configs) {
        setDataQaConfig((current) => {
          const next = { ...current };
          for (const config of payload.configs ?? []) {
            next[config.key] = {
              key: config.key,
              title: config.title,
              body: config.body,
              updatedBy: config.updatedBy,
              updatedAt: config.updatedAt,
            };
          }
          return next;
        });
      }

      setDataQaConfigStatus("Saved.");
    } catch (saveError) {
      setDataQaConfigError(saveError instanceof Error ? saveError.message : "Unable to save Data QA instructions.");
    } finally {
      setDataQaConfigSaving(false);
    }
  };

  const rerunFile = async (file: {
    id: string;
    importFileId: string | null;
    latestRunId: string | null;
    importFileName: string | null;
  }) => {
    const targetImportId = file.importFileId ?? file.id;
    const rerunEndpoint = file.latestRunId ? `/api/admin/data-qa/${file.latestRunId}` : `/api/imports/${targetImportId}/qa`;
    const rerunBody = file.latestRunId ? {} : { source: "replay" };

    setRerunningFileId(file.id);
    setRerunStatusByFileId((current) => ({
      ...current,
      [file.id]: file.latestRunId
        ? `Re-running ${file.importFileName ?? "file"} with the latest QA feedback and learned fixes...`
        : `Starting the first QA scan for ${file.importFileName ?? "file"}...`,
    }));

    try {
      const response = await fetch(rerunEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(rerunBody),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || "Unable to rerun this file.");
      }

      const payload = await response.json().catch(() => ({}));
      const nextRunId = payload?.runId ?? payload?.run?.id ?? null;
      setRerunStatusByFileId((current) => ({
        ...current,
        [file.id]: nextRunId
          ? `Rerun started. Latest run ${nextRunId} is now learning from the previous feedback.`
          : "Rerun started. Refreshing status...",
      }));
      setRefreshToken((current) => current + 1);
    } catch (error) {
      setRerunStatusByFileId((current) => ({
        ...current,
        [file.id]: error instanceof Error ? error.message : "Unable to rerun this file.",
      }));
    } finally {
      setRerunningFileId(null);
      window.setTimeout(() => {
        setRerunStatusByFileId((current) => {
          if (!current[file.id]) {
            return current;
          }
          const next = { ...current };
          delete next[file.id];
          return next;
        });
      }, 7000);
    }
  };

  const submitFilesForQa = async () => {
    if (!uploadFiles.length) {
      setUploadError("Choose at least one file to scan.");
      return;
    }

    if (!uploadWorkspaceId) {
      setUploadError("Choose a workspace first.");
      return;
    }

    setUploadBusy(true);
    setUploadError(null);
    setUploadStatus(null);

    try {
      let skippedCount = 0;
      const skippedMessages: string[] = [];

      const describeSkip = (fileName: string, reason: unknown) => {
        const message = reason instanceof Error ? reason.message : typeof reason === "string" ? reason : "";
        if (/unable to process import|unable to parse this file|no parsed rows available|specified key does not exist|import parsing failed in the background|unable to confirm this import|timed out waiting for trusted statement identity/i.test(message)) {
          return `Skipped ${fileName}: file is unreadable or could not be processed.`;
        }
        return `Skipped ${fileName}: ${message || "file could not be processed."}`;
      };

      for (let index = 0; index < uploadFiles.length; index += 1) {
        const file = uploadFiles[index];
        try {
          setUploadStatus(`Scanning ${index + 1} of ${uploadFiles.length}: ${file.name}`);

          const prepareResponse = await fetch("/api/imports", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              workspaceId: uploadWorkspaceId,
              fileName: file.name,
              fileType: file.type || "unknown",
              contentType: file.type || "application/octet-stream",
              skipUpload: false,
            }),
          });

          if (!prepareResponse.ok) {
            const payload = await prepareResponse.json().catch(() => ({}));
            throw new Error(payload.error || `Unable to prepare ${file.name}.`);
          }

          const preparePayload = (await prepareResponse.json()) as { importFile?: { id: string } };
          const importId = preparePayload.importFile?.id;

          if (!importId) {
            throw new Error(`Unable to start import for ${file.name}.`);
          }

          const formData = new FormData();
          formData.append("file", file);
          formData.append("workspaceId", uploadWorkspaceId);
          formData.append("fileName", file.name);
          formData.append("fileType", file.type || "unknown");
          formData.append("qaMode", "true");

          const processResponse = await fetch(`/api/imports/${importId}/process`, {
            method: "POST",
            body: formData,
          });

          if (!processResponse.ok) {
            const payload = await processResponse.json().catch(() => ({}));
            throw new Error(payload.error || `Unable to scan ${file.name}.`);
          }

          const processPayload = await processResponse.json().catch(() => ({}));
          if (processPayload?.queued) {
            setUploadStatus(`Queued ${file.name} for background QA processing.`);
          } else if (processPayload?.processed) {
            setUploadStatus(`Scanned ${file.name} and recorded the latest QA run.`);
          }
          setRefreshToken((current) => current + 1);
        } catch (fileError) {
          skippedCount += 1;
          skippedMessages.push(describeSkip(file.name, fileError));
          setUploadStatus(skippedMessages[skippedMessages.length - 1]);
          continue;
        }
      }

      if (skippedCount > 0) {
        setUploadStatus(`Submitted ${uploadFiles.length - skippedCount} file(s) for QA scan. Skipped ${skippedCount} unreadable file(s).`);
      } else {
        setUploadStatus(`Submitted ${uploadFiles.length} file(s) for QA scan.`);
      }
      setUploadFiles([]);
      if (uploadInputRef.current) {
        uploadInputRef.current.value = "";
      }
      setRefreshToken((current) => current + 1);
    } catch (submitError) {
      setUploadError(submitError instanceof Error ? submitError.message : "Unable to submit files for QA.");
    } finally {
      setUploadBusy(false);
    }
  };

  const reparseSampleCorpus = async () => {
    setSampleCorpusSaving(true);
    setSampleCorpusStatus(null);

    try {
      const response = await fetch("/api/admin/data-qa/sample-corpus", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          limit: 5,
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || "Unable to re-parse sample corpus.");
      }

      const payload = (await response.json()) as {
        processed?: Array<{ importFileId: string; fileName: string; source: string; imported: number; duplicate: boolean }>;
      };

      setSampleCorpusStatus(
        `Re-parsed ${payload.processed?.length ?? 0} prior upload${(payload.processed?.length ?? 0) === 1 ? "" : "s"} as safe samples.`
      );
      setRefreshToken((current) => current + 1);
    } catch (error) {
      setSampleCorpusStatus(error instanceof Error ? error.message : "Unable to re-parse sample corpus.");
    } finally {
      setSampleCorpusSaving(false);
    }
  };

  const pagerLabel = useMemo(() => {
    if (!data.totalCount) {
      return "No files";
    }

    const start = (data.page - 1) * data.pageSize + 1;
    const end = Math.min(data.totalCount, data.page * data.pageSize);
    return `${start.toLocaleString()} - ${end.toLocaleString()} of ${data.totalCount.toLocaleString()}`;
  }, [data.page, data.pageSize, data.totalCount]);

  const parsedRowCount = selectedRun?.parsedRows?.length ?? 0;
  const fileRows = data.files ?? data.runs ?? [];
  const hasActiveUploads = useMemo(
    () => fileRows.some((file) => file.latestStatus === "processing" || file.latestStatus === "queued"),
    [fileRows]
  );
  const hasRecoverableFailures = useMemo(
    () => fileRows.some((file) => file.latestStatus === "failed" && file.runCount === 0),
    [fileRows]
  );

  useEffect(() => {
    if (!hasActiveUploads && !hasRecoverableFailures) {
      return;
    }

    const interval = window.setInterval(() => {
      setRefreshToken((current) => current + 1);
    }, 5000);

    return () => {
      window.clearInterval(interval);
    };
  }, [hasActiveUploads, hasRecoverableFailures]);

  const fieldReviewItems = useMemo(
    () => [
      {
        key: "accountName" as const,
        label: "Account name",
        value:
          selectedRun?.statementCheckpoint?.sourceMetadata &&
          readMetadataText(selectedRun.statementCheckpoint.sourceMetadata, "accountName") !== "—"
            ? readMetadataText(selectedRun.statementCheckpoint.sourceMetadata, "accountName")
            : selectedRun?.importFile?.account?.name ?? "Unknown",
      },
      {
        key: "accountNumber" as const,
        label: "Account number",
        value:
          selectedRun?.statementCheckpoint?.sourceMetadata &&
          readMetadataText(selectedRun.statementCheckpoint.sourceMetadata, "accountNumber") !== "—"
            ? readMetadataText(selectedRun.statementCheckpoint.sourceMetadata, "accountNumber")
            : "Unknown",
      },
      {
        key: "balance" as const,
        label: "Balance",
        value: selectedRun?.statementCheckpoint?.endingBalance ?? selectedRun?.importFile?.account?.balance ?? "Unknown",
      },
      {
        key: "transactions" as const,
        label: "Transactions",
        value: `${parsedRowCount.toLocaleString()} parsed row${parsedRowCount === 1 ? "" : "s"}`,
      },
    ],
    [parsedRowCount, selectedRun]
  );

  return (
    <section className="admin-users">
      <div className="admin-users__hero table-panel">
        <div className="admin-users__hero-copy">
          <p className="section-kicker">Operational QA</p>
          <h2>Data QA runs</h2>
          <p className="panel-muted">
            Track parser quality, speed regressions, and feedback coverage across imported statements and local training
            runs.
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 16 }}>
            <Link className="button button-secondary button-small" href="/admin">
              Back to admin
            </Link>
            <button
              className="button button-primary button-small"
              type="button"
              onClick={() => setRefreshToken((current) => current + 1)}
            >
              Refresh
            </button>
          </div>
        </div>
        <div className="admin-users__stats">
          <div className="admin-users__stat">
            <strong>{formatNumber(data.overview.totalFiles)}</strong>
            <span>Total files</span>
          </div>
          <div className="admin-users__stat">
            <strong>{formatNumber(data.overview.totalRuns)}</strong>
            <span>Total runs</span>
          </div>
          <div className="admin-users__stat">
            <strong>{formatNumber(data.overview.averageScore)}</strong>
            <span>Average score</span>
          </div>
          <div className="admin-users__stat">
            <strong>{formatNumber(data.overview.sampleAverageScore)}</strong>
            <span>Sample confidence</span>
          </div>
          <div className="admin-users__stat">
            <strong>{formatNumber(data.overview.sampleRuns)}</strong>
            <span>Sample runs</span>
          </div>
          <div className="admin-users__stat">
            <strong>{formatNumber(data.overview.criticalRuns)}</strong>
            <span>Critical runs</span>
          </div>
          <div className="admin-users__stat">
            <strong>{formatNumber(data.overview.slowRuns)}</strong>
            <span>Slow runs</span>
          </div>
          <div className="admin-users__stat">
            <strong>{formatNumber(data.overview.linkedRuns)}</strong>
            <span>Linked imports</span>
          </div>
          <div className="admin-users__stat">
            <strong>{formatDateTime(data.overview.latestRunAt)}</strong>
            <span>Latest run</span>
          </div>
        </div>
      </div>

      <section className="table-panel admin-users__detail-panel admin-data-qa__config-panel">
        <div className="admin-users__table-head">
          <div>
            <p className="section-kicker">QA guidance</p>
            <h3>Editable output and instruction blocks</h3>
            <p className="panel-muted">
              Update these any time you want Clover to present parsed statements differently or to change how the QA
              loop should behave.
            </p>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
            <button
              className="button button-secondary button-small"
              type="button"
              onClick={() => setDataQaConfig((current) => ({
                clover_output_spec: createDefaultConfigState("clover_output_spec"),
                qa_instructions: createDefaultConfigState("qa_instructions"),
              }))}
            >
              Reset to defaults
            </button>
            <button
              className="button button-primary button-small"
              type="button"
              onClick={() => void saveDataQaConfig()}
              disabled={dataQaConfigSaving}
            >
              {dataQaConfigSaving ? "Saving..." : "Save guidance"}
            </button>
          </div>
        </div>

        {dataQaConfigLoading ? <div className="admin-users__loading">Loading QA guidance...</div> : null}
        {dataQaConfigError ? <div className="admin-users__notice admin-users__notice--error">{dataQaConfigError}</div> : null}
        {dataQaConfigStatus ? <div className="admin-users__notice">{dataQaConfigStatus}</div> : null}

        <div className="admin-data-qa__guidance-grid">
          {(Object.keys(DATA_QA_CONFIG_DEFAULTS) as DataQaConfigKey[]).map((key) => {
            const config = dataQaConfig[key];
            return (
              <section className="admin-data-qa__guidance-card" key={key}>
                <div className="admin-data-qa__guidance-head">
                  <div>
                    <p className="section-kicker">{config.title}</p>
                    <h4>{key === "clover_output_spec" ? "Final output spec" : "Operating instructions"}</h4>
                  </div>
                  {config.updatedAt ? <span>Updated {formatDateTime(config.updatedAt)}</span> : <span>Using defaults</span>}
                </div>

                <textarea
                  className="admin-data-qa__guidance-textarea"
                  rows={10}
                  value={config.body}
                  onChange={(event) => {
                    const body = event.target.value;
                    setDataQaConfig((current) => ({
                      ...current,
                      [key]: {
                        ...current[key],
                        body,
                      },
                    }));
                    setDataQaConfigStatus(null);
                  }}
                />

                <div className="admin-data-qa__guidance-preview">
                  <span>Preview</span>
                  <pre>{config.body}</pre>
                </div>
              </section>
            );
          })}
        </div>
      </section>

      <section className="table-panel admin-users__detail-panel admin-data-qa__submit-panel">
        <div className="admin-users__table-head">
          <div>
            <p className="section-kicker">Scan queue</p>
            <h3>Submit files to QA</h3>
            <p className="panel-muted">
              Upload statements, PDFs, CSVs, receipts, or other files here and they will run through the same
              parsing and QA flow as production imports.
            </p>
          </div>
          <button
            className="button button-secondary button-small"
            type="button"
            onClick={() => setRefreshToken((current) => current + 1)}
            disabled={uploadBusy}
          >
            Refresh runs
          </button>
        </div>

        <div className="accounts-import-toolbar">
          <div
            className="accounts-import-dropzone"
            role="presentation"
            onDragOver={(event) => {
              event.preventDefault();
            }}
            onDrop={(event) => {
              event.preventDefault();
              const nextFiles = Array.from(event.dataTransfer.files ?? []);
              if (nextFiles.length > 0) {
                setUploadFiles(nextFiles);
                setUploadError(null);
                setUploadStatus(`${nextFiles.length} file(s) ready to scan.`);
              }
            }}
          >
            <input
              ref={uploadInputRef}
              className="hidden-file-input"
              type="file"
              accept=".csv,.tsv,.pdf,.png,.jpg,.jpeg,.webp,.xlsx,.xls,.txt"
              multiple
              onChange={(event) => {
                const nextFiles = Array.from(event.target.files ?? []);
                setUploadFiles(nextFiles);
                setUploadError(null);
                setUploadStatus(nextFiles.length ? `${nextFiles.length} file(s) ready to scan.` : null);
              }}
            />
            <strong>Drop files here or browse</strong>
            <span>
              Files are sent through the import processor, stored with the selected workspace, and scored by the QA
              loop.
            </span>
            <button
              className="button button-primary"
              type="button"
              onClick={() => uploadInputRef.current?.click()}
              disabled={uploadBusy}
            >
              {uploadBusy ? "Scanning..." : "Choose files"}
            </button>
          </div>

          <div className="accounts-import-target">
            <label className="admin-users__search">
              <span>Workspace scope</span>
              <select
                className="admin-users__inline-select"
                value={uploadWorkspaceId}
                onChange={(event) => setUploadWorkspaceId(event.target.value)}
                disabled={workspacesLoading}
              >
                <option value="">{workspacesLoading ? "Loading workspaces..." : "Select workspace"}</option>
                {workspaces.map((workspace) => (
                  <option key={workspace.id} value={workspace.id}>
                    {workspace.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="accounts-import-target__hint">
              This only scopes the uploaded files to a workspace record. The parsing rules, QA logic, and learned
              feedback still apply across local, staging, and production because they live in the shared Data Engine.
              The QA run will appear below once processing completes.
            </div>
            {uploadWorkspaceId && workspaces.length === 1 ? (
              <div className="accounts-import-target__hint">Only one workspace is available here, so it is already selected for you.</div>
            ) : null}
            <button
              className="button button-primary"
              type="button"
              onClick={() => void submitFilesForQa()}
              disabled={uploadBusy || !uploadFiles.length || !uploadWorkspaceId}
            >
              {uploadBusy ? "Submitting..." : `Scan ${uploadFiles.length ? `${uploadFiles.length} file${uploadFiles.length === 1 ? "" : "s"}` : "files"}`}
            </button>
          </div>
        </div>

        {workspacesError ? <div className="admin-users__notice admin-users__notice--error">{workspacesError}</div> : null}
        {uploadError ? <div className="admin-users__notice admin-users__notice--error">{uploadError}</div> : null}
        {uploadStatus ? <div className="admin-users__notice">{uploadStatus}</div> : null}
        {uploadFiles.length > 0 ? (
          <div className="admin-data-qa__selected-files">
            {uploadFiles.map((file) => (
              <div className="admin-data-qa__selected-file" key={`${file.name}-${file.size}-${file.lastModified}`}>
                <strong>{file.name}</strong>
                <span>
                  {file.type || "unknown type"} · {(file.size / 1024).toFixed(1)} KB
                </span>
              </div>
            ))}
          </div>
          ) : null}
      </section>

      <section className="table-panel admin-users__detail-panel admin-data-qa__sample-panel">
        <div className="admin-users__table-head">
          <div>
            <p className="section-kicker">Sample corpus</p>
            <h3>Re-parse prior uploads as safe samples</h3>
            <p className="panel-muted">
              Use older uploaded statements as sample files so Clover can learn from real-world layouts and raise the
              confidence of future parses.
            </p>
          </div>
          <button
            className="button button-primary button-small"
            type="button"
            onClick={() => void reparseSampleCorpus()}
            disabled={sampleCorpusSaving}
          >
            {sampleCorpusSaving ? "Re-parsing..." : "Re-parse recent uploads"}
          </button>
        </div>
        {sampleCorpusStatus ? <div className="admin-users__notice">{sampleCorpusStatus}</div> : null}
        <div className="admin-data-qa__sample-grid">
          <div className="admin-data-qa__sample-card">
            <span>What it does</span>
            <strong>Runs the parser again on recent completed uploads</strong>
            <small>This reinforces the Data Engine with real statement layouts rather than synthetic examples.</small>
          </div>
          <div className="admin-data-qa__sample-card">
            <span>Confidence signal</span>
            <strong>{formatNumber(data.overview.sampleAverageScore)}</strong>
            <small>Average score across sample-style runs.</small>
          </div>
        </div>
      </section>

      <div className="admin-users__trend-grid">
        {data.overview.recentFindingCodes.length > 0 ? (
          data.overview.recentFindingCodes.map((entry) => (
            <div className="admin-users__trend-card" key={entry.code}>
              <span>{entry.code}</span>
              <strong>{entry.count.toLocaleString()}</strong>
              <small>{entry.criticalCount.toLocaleString()} critical</small>
            </div>
          ))
        ) : (
          <div className="admin-users__trend-card">
            <span>Recent findings</span>
            <strong>None yet</strong>
            <small>No QA findings matched this view.</small>
          </div>
        )}
      </div>

      <div className="admin-users__toolbar">
        <label className="admin-users__search">
          <span>Search</span>
          <input
            value={queryInput}
            onChange={(event) => setQueryInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                setPage(1);
                setQuery(queryInput);
              }
            }}
            placeholder="Workspace, file, source, finding code"
          />
        </label>
        <button
          className="button button-secondary button-small"
          type="button"
          onClick={() => {
            setPage(1);
            setQuery(queryInput);
          }}
        >
          Apply
        </button>
        <select
          className="admin-users__inline-select"
          value={source}
          onChange={(event) => {
            setPage(1);
            setSource(event.target.value as AdminDataQaSourceFilter);
          }}
        >
          {SOURCES.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <select
          className="admin-users__inline-select"
          value={pageSize}
          onChange={(event) => {
            setPage(1);
            setPageSize(Number(event.target.value));
          }}
        >
          {[10, 20, 50].map((value) => (
            <option key={value} value={value}>
              {value} per page
            </option>
          ))}
        </select>
      </div>

      {error ? <div className="admin-users__notice admin-users__notice--error">{error}</div> : null}

      <article className="table-panel admin-users__table-panel">
        <div className="admin-users__table-head">
          <div>
            <p className="section-kicker">Recent files</p>
            <h3>Imported statement QA</h3>
          </div>
          <p className="panel-muted">{pagerLabel}</p>
        </div>

        {loading ? <div className="admin-users__loading" role="status">Loading Data QA runs...</div> : null}

        {!loading && fileRows.length === 0 ? (
          <div className="admin-users__notice">No Data QA files matched the current filters.</div>
        ) : null}

      {fileRows.length > 0 ? (
          <div className="admin-data-qa__runs">
            {fileRows.map((run) => {
              const detailHref = run.importFileId
                ? `/admin/data-qa/file/${run.importFileId}`
                : run.latestRunId
                  ? `/admin/data-qa/${run.latestRunId}`
                  : null;

              return (
                <div
                  className={`admin-data-qa__run ${selectedRunId === run.latestRunId ? "is-selected" : ""}`}
                  key={run.id}
                >
                  <div className="admin-data-qa__run-summary">
                    <button
                      className="admin-data-qa__run-title-button"
                      type="button"
                      onClick={() => {
                        if (run.latestRunId) {
                          handleSelectRun(run.latestRunId);
                        }
                      }}
                      disabled={!run.latestRunId}
                    >
                      <div className="admin-data-qa__run-title">
                        <strong>{run.workspaceName}</strong>
                        <span>{run.importFileName ?? run.importFileId ?? "Unknown file"}</span>
                      </div>
                    </button>
                    <div className="admin-data-qa__run-actions">
                      <button
                        className="admin-data-qa__run-link admin-data-qa__run-link-button"
                        type="button"
                        onClick={() => void rerunFile(run)}
                        disabled={rerunningFileId === run.id}
                      >
                        {rerunningFileId === run.id ? "Rerunning..." : run.latestRunId ? "Rerun with context" : "Scan file"}
                      </button>
                      {detailHref ? (
                        <Link className="admin-data-qa__run-link" href={detailHref}>
                          Open file
                        </Link>
                      ) : (
                        <span className="admin-users__pill admin-users__pill--locked">No QA run yet</span>
                      )}
                    </div>
                  </div>
                  <div className="admin-data-qa__run-meta">
                    <span className={`admin-users__pill ${statusTone(run.trainingStatus)}`}>
                      {run.trainingStatus.replace(/_/g, " ")}
                    </span>
                    <span className={`admin-users__pill ${scoreTone(run.latestScore ?? 0)}`}>
                      Latest score {run.latestScore ?? "—"}
                    </span>
                    <span className="admin-users__pill admin-users__pill--sync">{run.runCount} runs</span>
                    <span className="admin-users__pill admin-users__pill--locked">{run.findingCount} findings</span>
                    <span className="admin-users__pill admin-users__pill--locked">{run.latestSource}</span>
                    <span className="admin-users__pill admin-users__pill--warn">{run.criticalCount} critical</span>
                  </div>
                  <div className="admin-data-qa__run-kpis">
                    <span>Latest {formatDateTime(run.latestRunAt)}</span>
                    <span>Parser {run.parserVersion ?? "Unknown"}</span>
                    <span>Total {formatNumber(run.totalDurationMs)} ms</span>
                    <span>Rows {formatNumber(run.rowCount)}</span>
                  </div>
                  {rerunStatusByFileId[run.id] ? (
                    <div className="admin-data-qa__run-status">{rerunStatusByFileId[run.id]}</div>
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : null}

        {selectedRunId ? (
          <section className="admin-data-qa__detail">
            {selectedRunLoading ? <div className="admin-users__loading">Loading run details...</div> : null}
            {selectedRunError ? <div className="admin-users__notice admin-users__notice--error">{selectedRunError}</div> : null}

            {selectedRun ? (
              <>
                <div className="admin-users__table-head">
                  <div>
                    <p className="section-kicker">Run detail</p>
                    <h3>{selectedRun.importFile?.fileName ?? "Imported statement"}</h3>
                  </div>
                  <button className="button button-secondary button-small" type="button" onClick={() => setSelectedRunId(null)}>
                    Close
                  </button>
                </div>

                <div className="admin-users__detail-grid">
                  <div className="admin-users__detail-card">
                    <span>Account name</span>
                    <strong>
                      {readMetadataText(selectedRun.statementCheckpoint?.sourceMetadata, "accountName") !== "—"
                        ? readMetadataText(selectedRun.statementCheckpoint?.sourceMetadata, "accountName")
                        : selectedRun.importFile?.account?.name ?? "Unknown"}
                    </strong>
                  </div>
                  <div className="admin-users__detail-card">
                    <span>Account number</span>
                    <strong>
                      {readMetadataText(selectedRun.statementCheckpoint?.sourceMetadata, "accountNumber")}
                    </strong>
                  </div>
                  <div className="admin-users__detail-card">
                    <span>Statement balance</span>
                    <strong>
                      {selectedRun.statementCheckpoint?.endingBalance ??
                      selectedRun.importFile?.account?.balance ??
                      "Unknown"}
                    </strong>
                  </div>
                  <div className="admin-users__detail-card">
                    <span>Uploaded file</span>
                    <strong>{selectedRun.importFile?.fileName ?? selectedRun.importFile?.fileType ?? "Unknown"}</strong>
                  </div>
                </div>

                <div className="admin-users__detail-sections">
                  <section className="admin-users__detail-section admin-users__detail-section--wide">
                    <h4>Uploaded file preview</h4>
                    {selectedRun.rawFilePreview ? (
                      <pre className="admin-data-qa__preview">{selectedRun.rawFilePreview}</pre>
                    ) : (
                      <div className="admin-users__detail-empty">No preview text was captured for this file.</div>
                    )}
                  </section>

                  <section className="admin-users__detail-section">
                    <h4>Statement metadata</h4>
                    {selectedRun.statementCheckpoint ? (
                      <ul className="admin-users__detail-list">
                        <li>
                          <span>Statement period</span>
                          <strong>
                            {selectedRun.statementCheckpoint.statementStartDate ?? "Unknown"} to{" "}
                            {selectedRun.statementCheckpoint.statementEndDate ?? "Unknown"}
                          </strong>
                        </li>
                        <li>
                          <span>Opening balance</span>
                          <strong>{selectedRun.statementCheckpoint.openingBalance ?? "Unknown"}</strong>
                        </li>
                        <li>
                          <span>Ending balance</span>
                          <strong>{selectedRun.statementCheckpoint.endingBalance ?? "Unknown"}</strong>
                        </li>
                        <li>
                          <span>Parse status</span>
                          <strong>{selectedRun.statementCheckpoint.status}</strong>
                          {selectedRun.statementCheckpoint.mismatchReason ? (
                            <small>{selectedRun.statementCheckpoint.mismatchReason}</small>
                          ) : null}
                        </li>
                        <li>
                          <span>Source metadata</span>
                          <small>{formatDisplayValue(selectedRun.statementCheckpoint.sourceMetadata)}</small>
                        </li>
                      </ul>
                    ) : (
                      <div className="admin-users__detail-empty">No statement checkpoint was stored for this import.</div>
                    )}
                  </section>

                  <section className="admin-users__detail-section">
                    <h4>Parsed transactions</h4>
                    {(selectedRun.parsedRows?.length ?? 0) > 0 ? (
                      <div className="admin-data-qa__parsed-list">
                        {selectedRun.parsedRows.slice(0, 25).map((row, index) => (
                          <details className="admin-data-qa__parsed-row" key={`row-${index}`}>
                            <summary>
                              <strong>Row {index + 1}</strong>
                              <span>{readRowText(row, ["date", "transactionDate", "postedDate", "statementDate"])}</span>
                              <span>{readRowText(row, ["merchantClean", "merchantRaw", "description", "name"])}</span>
                              <span>{readRowNumber(row, ["amount"])}</span>
                            </summary>
                            <div className="admin-data-qa__parsed-row-grid">
                              <div>
                                <span>Category</span>
                                <strong>{readRowText(row, ["categoryName", "category", "normalizedCategory"])}</strong>
                              </div>
                              <div>
                                <span>Balance</span>
                                <strong>{readRowText(row, ["balance", "runningBalance", "endingBalance"])}</strong>
                              </div>
                              <div>
                                <span>Type</span>
                                <strong>{readRowText(row, ["type"])}</strong>
                              </div>
                              <div className="admin-data-qa__parsed-row-raw">
                                <span>Raw row</span>
                                <pre>{JSON.stringify(row, null, 2)}</pre>
                              </div>
                            </div>
                          </details>
                        ))}
                      </div>
                    ) : (
                      <div className="admin-users__detail-empty">No parsed transactions were found for this import.</div>
                    )}
                  </section>

                  <section className="admin-users__detail-section">
                    <h4>QA findings</h4>
                    {(selectedRun.findings?.length ?? 0) > 0 ? (
                      <div className="admin-data-qa__finding-list">
                        {selectedRun.findings.map((finding) => (
                          <div className="admin-data-qa__finding" key={finding.id}>
                            <div className="admin-data-qa__finding-head">
                              <span className={`admin-users__pill ${severityTone(finding.severity)}`}>{finding.severity}</span>
                              <strong>{finding.code}</strong>
                              {finding.field ? <small>{finding.field}</small> : null}
                            </div>
                            <p>{finding.message}</p>
                            {finding.suggestion ? <small>Suggestion: {finding.suggestion}</small> : null}
                            <small>Confidence {finding.confidence}</small>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="admin-users__detail-empty">This run did not produce any findings.</div>
                    )}
                  </section>

                  <section className="admin-users__detail-section admin-users__detail-section--wide">
                    <h4>Field review</h4>
                    <p className="panel-muted">
                      Review each parsed field on its own. Check the box when it looks right, or leave notes when a
                      field should be improved.
                    </p>
                    <div className="admin-data-qa__field-review-grid">
                      {fieldReviewItems.map((item) => {
                        const draft = fieldReviewDraft[item.key];

                        return (
                          <div className="admin-data-qa__field-review-card" key={item.key}>
                            <div className="admin-data-qa__field-review-head">
                              <div>
                                <span>{item.label}</span>
                                <strong>{item.value}</strong>
                              </div>
                              <label className="admin-data-qa__field-review-check">
                                <input
                                  type="checkbox"
                                  checked={draft.correct}
                                  onChange={(event) => {
                                    const checked = event.target.checked;
                                    setFieldReviewDraft((current) => ({
                                      ...current,
                                      [item.key]: {
                                        ...current[item.key],
                                        correct: checked,
                                      },
                                    }));
                                    setFieldReviewStatus(null);
                                  }}
                                />
                                Correct
                              </label>
                            </div>
                            <textarea
                              className="admin-data-qa__field-review-notes"
                              placeholder={`Optional note about ${item.label.toLowerCase()}`}
                              rows={3}
                              value={draft.notes}
                              onChange={(event) => {
                                const notes = event.target.value;
                                setFieldReviewDraft((current) => ({
                                  ...current,
                                  [item.key]: {
                                    ...current[item.key],
                                    notes,
                                  },
                                }));
                                setFieldReviewStatus(null);
                              }}
                            />
                          </div>
                        );
                      })}
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
                      <button
                        className="button button-primary button-small"
                        type="button"
                        onClick={() => void saveFieldReview()}
                        disabled={fieldReviewSaving}
                      >
                        {fieldReviewSaving ? "Saving..." : "Save field review"}
                      </button>
                      {fieldReviewStatus ? <span className="panel-muted">{fieldReviewStatus}</span> : null}
                      {selectedRun.fieldReviewUpdatedAt ? (
                        <span className="panel-muted">Last updated {formatDateTime(selectedRun.fieldReviewUpdatedAt)}</span>
                      ) : null}
                    </div>
                  </section>

                  <section className="admin-users__detail-section admin-users__detail-section--wide">
                    <h4>Manual feedback</h4>
                    <p className="panel-muted">
                      Add notes for the QA loop here. This is saved back to the selected run and can be used as training
                      guidance for future parser improvements.
                    </p>
                    <textarea
                      className="admin-data-qa__feedback"
                      value={manualFeedbackDraft}
                      onChange={(event) => {
                        setManualFeedbackDraft(event.target.value);
                        setManualFeedbackStatus(null);
                      }}
                      placeholder="Write what was parsed incorrectly, what should change, and any parser guidance."
                      rows={8}
                    />
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
                      <button
                        className="button button-primary button-small"
                        type="button"
                        onClick={() => void saveManualFeedback()}
                        disabled={manualFeedbackSaving}
                      >
                        {manualFeedbackSaving ? "Saving..." : "Save feedback"}
                      </button>
                      {manualFeedbackStatus ? <span className="panel-muted">{manualFeedbackStatus}</span> : null}
                      {selectedRun.manualFeedbackUpdatedAt ? (
                        <span className="panel-muted">Last updated {formatDateTime(selectedRun.manualFeedbackUpdatedAt)}</span>
                      ) : null}
                    </div>
                  </section>
                </div>
              </>
            ) : null}
          </section>
        ) : null}

        <div className="admin-users__pager">
          <button
            className="button button-secondary button-small"
            type="button"
            onClick={() => setPage((current) => Math.max(1, current - 1))}
            disabled={page <= 1 || loading}
          >
            Previous
          </button>
          <span>
            Page {data.page} of {data.totalPages}
          </span>
          <button
            className="button button-secondary button-small"
            type="button"
            onClick={() => setPage((current) => Math.min(data.totalPages, current + 1))}
            disabled={page >= data.totalPages || loading}
          >
            Next
          </button>
        </div>
      </article>
    </section>
  );
}
