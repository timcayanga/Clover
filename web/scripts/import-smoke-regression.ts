import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { strict as assert } from "node:assert";

type ImportCase = {
  label: string;
  relativePath: string;
  bankName: string;
  fileType?: string;
};

type WorkspaceRecord = {
  id: string;
  name?: string | null;
};

type ImportStatusPayload = {
  importFile?: {
    id?: string;
    fileName?: string;
    status?: string;
    processingPhase?: string | null;
    processingMessage?: string | null;
    processingAttempt?: number | null;
  };
  parsedRowsCount?: number;
  confirmedTransactionsCount?: number;
  confirmationStatus?: string;
  telemetryPhase?: string | null;
  telemetryLabel?: string | null;
  telemetryMessage?: string | null;
  workflowStage?: string | null;
  canResume?: boolean | null;
  resumeReason?: string | null;
};

const baseUrl = process.env.CLOVER_BASE_URL ?? "http://localhost:3001";
const statementRoot = process.env.CLOVER_STATEMENT_ROOT ?? "/Users/TimCayanga1/Documents/Bank Statements";
const preferredWorkspaceId = process.env.CLOVER_WORKSPACE_ID ?? "";

const cases: ImportCase[] = [
  {
    label: "BPI",
    relativePath: "Samples/BPI/848836638-BPI-BANK-STATEMENT.pdf",
    bankName: "BPI",
  },
  {
    label: "BDO",
    relativePath: "Samples/BDO/648293940-BDO.pdf",
    bankName: "BDO Unibank, Inc.",
  },
  {
    label: "Maya",
    relativePath: "Samples/Maya/916450168-MayaSavings-SoA-6fd6154af7eb46e7afe2c3e43f271677-2025JUL.pdf",
    bankName: "Maya Bank",
  },
  {
    label: "Security Bank",
    relativePath: "Samples/Security Bank/748042099-Security-Bank-Statement-Gsr.pdf",
    bankName: "Security Bank",
  },
  {
    label: "UnionBank",
    relativePath: "Samples/UnionBank/771487697-SOA-Union-Bank.pdf",
    bankName: "UnionBank",
  },
];

const jsonFetch = async <T>(input: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(new URL(input, baseUrl), init);
  const payload = (await response.json().catch(() => ({}))) as T;
  if (!response.ok) {
    throw new Error((payload as { error?: string })?.error || `Request failed: ${response.status}`);
  }
  return payload;
};

const getWorkspaceId = async () => {
  if (preferredWorkspaceId) {
    return preferredWorkspaceId;
  }

  const payload = await jsonFetch<{ workspaces?: WorkspaceRecord[] }>("/api/workspaces");
  const workspace = payload.workspaces?.[0];
  if (!workspace?.id) {
    throw new Error("No workspace found.");
  }

  return workspace.id;
};

const fileNameFromPath = (relativePath: string) => relativePath.split("/").pop() ?? relativePath;

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const uploadStatement = async (workspaceId: string, filePath: string, bankName: string, fileType = "application/pdf") => {
  const fileName = fileNameFromPath(filePath);
  const bytes = await readFile(resolve(statementRoot, filePath));

  const preparePayload = await jsonFetch<{ importFile?: { id?: string } }>("/api/imports", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      workspaceId,
      fileName,
      fileType,
      contentType: fileType,
      skipUpload: false,
      bankName,
    }),
  });

  const importId = preparePayload.importFile?.id;
  assert(importId, `Unable to create import record for ${fileName}`);

  const formData = new FormData();
  formData.append("file", new Blob([bytes], { type: fileType }), fileName);
  formData.append("workspaceId", workspaceId);
  formData.append("fileName", fileName);
  formData.append("fileType", fileType);
  formData.append("bankName", bankName);
  formData.append("allowDuplicateStatement", "true");

  const processResponse = await fetch(new URL(`/api/imports/${importId}/process`, baseUrl), {
    method: "POST",
    body: formData,
  });
  const processPayload = (await processResponse.json().catch(() => ({}))) as Record<string, unknown>;
  if (!processResponse.ok) {
    throw new Error((processPayload.error as string) || `Unable to process ${fileName}`);
  }

  return { importId, fileName, processPayload };
};

const pollImport = async (importId: string, fileName: string) => {
  const startedAt = Date.now();
  const transitions: string[] = [];
  let resumed = false;
  let readySeenAt: number | null = null;

  while (Date.now() - startedAt < 150_000) {
    const payload = await jsonFetch<ImportStatusPayload>(`/api/imports/${importId}/status`);
    const phase = payload.telemetryPhase ?? payload.importFile?.processingPhase ?? "unknown";
    const status = payload.importFile?.status ?? "unknown";
    const confirmationStatus = payload.confirmationStatus ?? "unknown";
    const parsedRowsCount = payload.parsedRowsCount ?? 0;
    const confirmedTransactionsCount = payload.confirmedTransactionsCount ?? 0;
    const workflowStage = payload.workflowStage ?? "unknown";
    const fingerprint = `${status}:${phase}:${workflowStage}:${confirmationStatus}:${parsedRowsCount}:${confirmedTransactionsCount}`;
    if (transitions[transitions.length - 1] !== fingerprint) {
      transitions.push(fingerprint);
      console.log(`[${fileName}] status=${status} phase=${phase} workflow=${workflowStage} confirmation=${confirmationStatus} parsed=${parsedRowsCount} confirmed=${confirmedTransactionsCount}`);
      if (payload.telemetryMessage) {
        console.log(`  message: ${payload.telemetryMessage}`);
      }
    }

    const isTerminalReady =
      status === "done" ||
      phase === "complete" ||
      confirmationStatus === "confirmed" ||
      (status === "processing" && confirmationStatus === "staged" && parsedRowsCount > 0);

    if (status === "failed") {
      throw new Error(`${fileName} fell back to failed while polling.`);
    }

    if (isTerminalReady) {
      readySeenAt ??= Date.now();

      if (status === "done" || confirmationStatus === "confirmed" || phase === "complete") {
        return { payload, transitions, resumed, elapsedMs: Date.now() - startedAt };
      }

      if (Date.now() - readySeenAt >= 20_000) {
        return { payload, transitions, resumed, elapsedMs: Date.now() - startedAt };
      }
    }

    if (!resumed && status === "failed" && payload.canResume) {
      const resumeResponse = await fetch(new URL(`/api/imports/${importId}/resume`, baseUrl), {
        method: "POST",
      });
      const resumePayload = await resumeResponse.json().catch(() => ({}));
      if (!resumeResponse.ok) {
        throw new Error((resumePayload as { error?: string })?.error || `Unable to resume ${fileName}`);
      }
      resumed = true;
      console.log(`[${fileName}] resume queued: ${(resumePayload as { telemetryLabel?: string })?.telemetryLabel ?? "yes"}`);
    }

    await delay(3000);
  }

  throw new Error(`Timed out waiting for import completion for ${fileName}`);
};

const main = async () => {
  const workspaceId = await getWorkspaceId();
  console.log(`Using workspace ${workspaceId}`);

  const results: Array<{ label: string; fileName: string; importId: string; elapsedMs: number; resumed: boolean }> = [];

  for (const testCase of cases) {
    const { importId, fileName, processPayload } = await uploadStatement(
      workspaceId,
      testCase.relativePath,
      testCase.bankName,
      testCase.fileType ?? "application/pdf"
    );
    console.log(`[${testCase.label}] process response: ${JSON.stringify(processPayload)}`);

    const { payload, resumed, elapsedMs } = await pollImport(importId, fileName);
    assert(payload.parsedRowsCount && payload.parsedRowsCount > 0, `${testCase.label} did not parse rows.`);
    assert(
      payload.importFile?.status === "done" || payload.telemetryPhase === "complete" || payload.confirmationStatus === "confirmed",
      `${testCase.label} did not reach a stable ready state.`
    );

    results.push({
      label: testCase.label,
      fileName,
      importId,
      elapsedMs,
      resumed,
    });
  }

  console.log("");
  console.log("Import smoke regression summary:");
  for (const result of results) {
    console.log(
      `- ${result.label}: ${result.fileName} | ${result.importId} | ${Math.round(result.elapsedMs / 1000)}s | resumed=${result.resumed}`
    );
  }
};

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
