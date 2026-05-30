import { readFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { randomUUID } from "node:crypto";
import { strict as assert } from "node:assert";
import { loadEnvConfig } from "@next/env";

const webRoot = basename(process.cwd()) === "web" ? process.cwd() : join(process.cwd(), "web");
loadEnvConfig(webRoot);

const statementRoot = process.env.CLOVER_STATEMENT_ROOT ?? "/Users/TimCayanga1/Documents/Bank Statements";
const baseUrl = process.env.CLOVER_IMPORT_REGRESSION_BASE_URL ?? "http://localhost:3000";
const workspaceId = process.env.CLOVER_IMPORT_REGRESSION_WORKSPACE_ID;

const eastWestFiles = [
  "Samples/EastWest Bank/Philippines EastWest bank statement template in Excel and PDF format.pdf",
  "Samples/EastWest Bank/Philippines Eastwest bank st Word.pdf",
] as const;

const assertEastWestProcessPayload = (fileName: string, payload: Record<string, unknown>) => {
  assert.equal(payload.queued, false, `${fileName} should not remain queued.`);
  assert.equal(payload.processed, true, `${fileName} should be processed inline.`);
  assert.equal(payload.status, "done", `${fileName} should finish with status done.`);
  assert.equal(payload.importedRows, 15, `${fileName} should import 15 rows.`);
  assert.equal(payload.confirmedTransactionsCount, 15, `${fileName} should confirm 15 rows.`);
  assert.equal(payload.visibleImportComplete, true, `${fileName} should be visible to the UI.`);
  assert.ok(payload.accountId, `${fileName} should return an accountId.`);

  const summaries = Array.isArray(payload.accountSummaries) ? payload.accountSummaries : [];
  assert.equal(summaries.length, 1, `${fileName} should return one EastWest account summary.`);
  const summary = summaries[0] as Record<string, unknown>;
  assert.equal(summary.institution, "EastWest Bank", `${fileName} should identify EastWest Bank.`);
  assert.equal(summary.accountNumber, "205050623445", `${fileName} should identify the sample account.`);
  assert.equal(summary.rowsImported, 15, `${fileName} summary should include 15 rows.`);
};

const assertEastWestStatusPayload = (fileName: string, payload: Record<string, unknown>) => {
  assert.equal(payload.confirmedTransactionsCount, 15, `${fileName} status should report 15 confirmed rows.`);
  assert.equal(payload.visibleImportComplete, true, `${fileName} status should be visible to the UI.`);
  assert.equal((payload.importFile as { status?: unknown } | null)?.status, "done", `${fileName} status importFile should be done.`);
  assert.ok((payload.importFile as { accountId?: unknown } | null)?.accountId, `${fileName} status should hydrate importFile.accountId.`);

  const summaries = Array.isArray(payload.accountSummaries) ? payload.accountSummaries : [];
  assert.equal(summaries.length, 1, `${fileName} status should return one account summary.`);
  const summary = summaries[0] as Record<string, unknown>;
  assert.equal(summary.accountNumber, "205050623445", `${fileName} status summary should include account number.`);
  assert.equal(summary.rowsImported, 15, `${fileName} status summary should include 15 rows.`);
};

const assertEastWestAccountTransactionsPayload = (
  fileName: string,
  importId: string,
  payload: Record<string, unknown>
) => {
  const transactions = Array.isArray(payload.transactions) ? payload.transactions : [];
  const importedTransactions = transactions.filter((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      return false;
    }

    const transaction = entry as Record<string, unknown>;
    const rawPayload =
      transaction.rawPayload && typeof transaction.rawPayload === "object" && !Array.isArray(transaction.rawPayload)
        ? (transaction.rawPayload as Record<string, unknown>)
        : null;

    return transaction.importFileId === importId || rawPayload?.sourceImportFileId === importId;
  });

  assert.equal(importedTransactions.length, 15, `${fileName} account transactions should include 15 rows for this import.`);
  for (const transaction of importedTransactions) {
    const record = transaction as Record<string, unknown>;
    assert.equal(record.institution, "EastWest Bank", `${fileName} transaction should carry EastWest institution.`);
    assert.equal(record.accountNumber, "205050623445", `${fileName} transaction should carry account number.`);
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

const main = async () => {
  if (!workspaceId) {
    throw new Error("Set CLOVER_IMPORT_REGRESSION_WORKSPACE_ID to run the EastWest process route regression.");
  }

  for (const relativePath of eastWestFiles) {
    const absolutePath = join(statementRoot, relativePath);
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
    assert.equal(processResponse.ok, true, `${fileName} process route should return 2xx.`);
    assertEastWestProcessPayload(fileName, processPayload);

    const statusResponse = await fetch(`${baseUrl}/api/imports/${importId}/status`);
    const statusPayload = await readJsonResponse(statusResponse);
    assert.equal(statusResponse.ok, true, `${fileName} status route should return 2xx.`);
    assertEastWestStatusPayload(fileName, statusPayload);

    const accountId = (statusPayload.importFile as { accountId?: unknown } | null)?.accountId;
    assert.equal(typeof accountId, "string", `${fileName} status should expose accountId for transaction verification.`);
    const transactionsResponse = await fetch(`${baseUrl}/api/accounts/${accountId}/transactions?pageSize=200`);
    const transactionsPayload = await readJsonResponse(transactionsResponse);
    assert.equal(transactionsResponse.ok, true, `${fileName} account transactions route should return 2xx.`);
    assertEastWestAccountTransactionsPayload(fileName, importId, transactionsPayload);

    console.log(`[PASS] ${fileName}: process, status, and account transactions returned visible EastWest rows.`);
  }
};

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
});
