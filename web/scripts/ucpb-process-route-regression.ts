import { strict as assert } from "node:assert";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { loadEnvConfig } from "@next/env";
import { prisma } from "@/lib/prisma";

const webRoot = basename(process.cwd()) === "web" ? process.cwd() : join(process.cwd(), "web");
loadEnvConfig(webRoot);

const statementRoot = process.env.CLOVER_STATEMENT_ROOT ?? "/Users/TimCayanga1/Documents/Bank Statements";
const baseUrl = process.env.CLOVER_IMPORT_REGRESSION_BASE_URL ?? "http://localhost:3000";
const requestedWorkspaceId = process.env.CLOVER_IMPORT_REGRESSION_WORKSPACE_ID;

const ucpbFiles = [
  {
    relativePath: "Samples/UCPB/Philippines UCPB bank statement of account template in Excel and PDF format.pdf",
    expectedRows: 0,
    expectedStatus: "failed",
    expectedAccountNumber: null,
    expectedEndingBalance: null,
  },
  {
    relativePath: "Samples/UCPB/Philippines UCPB bank statement of account template in Word and PDF format.pdf",
    expectedRows: 51,
    expectedStatus: "done",
    expectedAccountNumber: "2024600000000",
    expectedEndingBalance: 24310,
  },
  {
    relativePath: "Samples/UCPB/Philippines UCPB bank statement.pdf",
    expectedRows: 50,
    expectedStatus: "done",
    expectedAccountNumber: "202460000000",
    expectedEndingBalance: 10106,
  },
] as const;

const isLocalRegressionBaseUrl = (value: string) => {
  try {
    const url = new URL(value);
    return ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
  } catch {
    return false;
  }
};

const ensureLocalRegressionWorkspace = async () => {
  try {
    const user = await prisma.user.upsert({
      where: { clerkUserId: "local-admin" },
      update: {},
      create: {
        clerkUserId: "local-admin",
        email: "local-admin+ucpb-qa@clover.local",
        firstName: "Local",
        lastName: "QA",
        verified: true,
        environment: "local",
        planTier: "pro",
        planTierLocked: true,
      },
      select: { id: true },
    });

    const existingWorkspace = await prisma.workspace.findFirst({
      where: {
        userId: user.id,
        name: "UCPB Import Regression",
      },
      select: { id: true },
    });
    if (existingWorkspace) {
      return existingWorkspace.id;
    }

    const workspace = await prisma.workspace.create({
      data: {
        userId: user.id,
        name: "UCPB Import Regression",
        type: "personal",
      },
      select: { id: true },
    });

    return workspace.id;
  } catch (error) {
    throw new Error(
      "Unable to create the local UCPB QA workspace. Start the local database or set CLOVER_IMPORT_REGRESSION_WORKSPACE_ID.",
      { cause: error }
    );
  }
};

const assertLocalServerReachable = async () => {
  try {
    await fetch(`${baseUrl}/api/health`);
  } catch (error) {
    throw new Error(
      `Unable to reach ${baseUrl}. Start Clover locally with \`npm run dev\` before running qa:ucpb-process.`,
      { cause: error }
    );
  }
};

const readJsonResponse = async (response: Response) => {
  const text = await response.text();
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new Error(`Expected JSON response, got ${response.status}: ${text.slice(0, 500)}`);
  }
};

const getRawPayloadImportId = (value: unknown) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const sourceImportFileId = (value as Record<string, unknown>).sourceImportFileId;
  return typeof sourceImportFileId === "string" ? sourceImportFileId : null;
};

const getRawPayloadBalance = (value: unknown) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const balance = Number((value as Record<string, unknown>).balance ?? NaN);
  return Number.isFinite(balance) ? balance : null;
};

const assertApprox = (actual: unknown, expected: number, message: string) => {
  const value = Number(actual);
  assert.ok(Number.isFinite(value), `${message}: expected finite number, got ${String(actual)}`);
  assert.ok(Math.abs(value - expected) < 0.01, `${message}: expected ${expected}, got ${value}`);
};

const main = async () => {
  const workspaceId =
    requestedWorkspaceId ??
    (isLocalRegressionBaseUrl(baseUrl)
      ? (await assertLocalServerReachable(), await ensureLocalRegressionWorkspace())
      : null);
  if (!workspaceId) {
    throw new Error("Set CLOVER_IMPORT_REGRESSION_WORKSPACE_ID to run the UCPB process route regression against non-local URLs.");
  }

  for (const check of ucpbFiles) {
    const absolutePath = join(statementRoot, check.relativePath);
    const fileName = basename(absolutePath);
    const importId = randomUUID();
    const bytes = await readFile(absolutePath);
    const formData = new FormData();
    formData.set("workspaceId", workspaceId);
    formData.set("fileName", fileName);
    formData.set("fileType", "application/pdf");
    formData.set("importMode", "statement");
    formData.set("allowDuplicateStatement", "true");
    formData.set("file", new Blob([bytes], { type: "application/pdf" }), fileName);

    const processResponse = await fetch(`${baseUrl}/api/imports/${importId}/process`, {
      method: "POST",
      body: formData,
    });
    const processPayload = await readJsonResponse(processResponse);

    if (check.expectedRows === 0) {
      assert.equal(processResponse.ok, false, `${fileName} should fail closed.`);
      assert.equal(processResponse.status, 400, `${fileName} should return a readable validation failure.`);
      assert.match(String(processPayload.error ?? ""), /unable|parse|read/i, `${fileName} should explain the file was not readable.`);
      console.log(`[PASS] ${fileName}: unreadable sample failed closed.`);
      continue;
    }

    assert.equal(processResponse.ok, true, `${fileName} process route should return 2xx: ${JSON.stringify(processPayload)}`);
    assert.equal(processPayload.queued, false, `${fileName} should process inline.`);
    assert.equal(processPayload.processed, true, `${fileName} should be processed.`);
    assert.equal(processPayload.status, check.expectedStatus, `${fileName} should finish with expected status.`);
    assert.equal(processPayload.importedRows, check.expectedRows, `${fileName} should import expected rows.`);
    assert.equal(processPayload.confirmedTransactionsCount, check.expectedRows, `${fileName} should confirm expected rows.`);
    assert.equal(processPayload.visibleImportComplete, true, `${fileName} should be visible to the UI.`);

    const summaries = Array.isArray(processPayload.accountSummaries) ? processPayload.accountSummaries : [];
    assert.equal(summaries.length, 1, `${fileName} should return one UCPB account summary.`);
    const summary = summaries[0] as Record<string, unknown>;
    assert.equal(summary.institution, "UCPB", `${fileName} summary institution should match.`);
    assert.equal(summary.accountNumber, check.expectedAccountNumber, `${fileName} summary account number should match.`);
    assert.equal(summary.rowsImported, check.expectedRows, `${fileName} summary should include expected rows.`);
    assertApprox(summary.balance, check.expectedEndingBalance, `${fileName} summary balance should match.`);

    const statusResponse = await fetch(`${baseUrl}/api/imports/${importId}/status`);
    const statusPayload = await readJsonResponse(statusResponse);
    assert.equal(statusResponse.ok, true, `${fileName} status route should return 2xx: ${JSON.stringify(statusPayload)}`);
    assert.equal(statusPayload.confirmedTransactionsCount, check.expectedRows, `${fileName} status should report confirmed rows.`);
    assert.equal(statusPayload.visibleImportComplete, true, `${fileName} status should be visible to the UI.`);
    const accountId = (statusPayload.importFile as { accountId?: unknown } | null)?.accountId;
    assert.equal(typeof accountId, "string", `${fileName} status should expose accountId.`);

    const transactionsResponse = await fetch(`${baseUrl}/api/accounts/${accountId}/transactions?pageSize=200`);
    const transactionsPayload = await readJsonResponse(transactionsResponse);
    assert.equal(transactionsResponse.ok, true, `${fileName} transactions route should return 2xx: ${JSON.stringify(transactionsPayload)}`);
    const transactions = Array.isArray(transactionsPayload.transactions) ? transactionsPayload.transactions : [];
    const importedTransactions = transactions.filter((entry) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
        return false;
      }
      const transaction = entry as Record<string, unknown>;
      return transaction.importFileId === importId || getRawPayloadImportId(transaction.rawPayload) === importId;
    });

    assert.equal(importedTransactions.length, check.expectedRows, `${fileName} account transactions should include expected rows.`);
    assert.ok(importedTransactions.every((entry) => (entry as Record<string, unknown>).institution === "UCPB"), `${fileName} should carry UCPB institution.`);
    assert.ok(importedTransactions.every((entry) => (entry as Record<string, unknown>).accountNumber === check.expectedAccountNumber), `${fileName} should carry account number.`);
    assert.equal((importedTransactions[0] as Record<string, unknown>).date, "2021-12-01", `${fileName} first transaction date should match.`);
    assert.equal((importedTransactions.at(-1) as Record<string, unknown>).date, "2021-12-29", `${fileName} last transaction date should match.`);
    assertApprox(getRawPayloadBalance((importedTransactions.at(-1) as Record<string, unknown>).rawPayload), check.expectedEndingBalance, `${fileName} last transaction balance should match.`);

    console.log(`[PASS] ${fileName}: process, status, and account transactions returned visible UCPB rows.`);
  }
};

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.stack ?? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect().catch(() => null);
    process.exit(process.exitCode ?? 0);
  });
