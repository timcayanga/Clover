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
const chinaBankFile = "Samples/China Bank/860976948-CHINA-BANK-STATEMENT.pdf";

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
        email: "local-admin+chinabank-qa@clover.local",
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
        name: "China Bank Import Regression",
      },
      select: { id: true },
    });
    if (existingWorkspace) {
      return existingWorkspace.id;
    }

    const workspace = await prisma.workspace.create({
      data: {
        userId: user.id,
        name: "China Bank Import Regression",
        type: "personal",
      },
      select: { id: true },
    });

    return workspace.id;
  } catch (error) {
    throw new Error(
      "Unable to create the local China Bank QA workspace. Start the local database or set CLOVER_IMPORT_REGRESSION_WORKSPACE_ID.",
      { cause: error }
    );
  }
};

const assertLocalServerReachable = async () => {
  try {
    await fetch(`${baseUrl}/api/health`);
  } catch (error) {
    throw new Error(
      `Unable to reach ${baseUrl}. Start Clover locally with \`npm run dev\` before running qa:chinabank-process.`,
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

const main = async () => {
  const workspaceId =
    requestedWorkspaceId ??
    (isLocalRegressionBaseUrl(baseUrl)
      ? (await assertLocalServerReachable(), await ensureLocalRegressionWorkspace())
      : null);
  if (!workspaceId) {
    throw new Error(
      "Set CLOVER_IMPORT_REGRESSION_WORKSPACE_ID to run the China Bank process route regression against non-local URLs."
    );
  }

  const absolutePath = join(statementRoot, chinaBankFile);
  const fileName = basename(absolutePath);
  const importId = randomUUID();
  const bytes = await readFile(absolutePath);
  const formData = new FormData();
  formData.set("workspaceId", workspaceId);
  formData.set("fileName", fileName);
  formData.set("fileType", "application/pdf");
  formData.set("importMode", "statement");
  formData.set("allowDuplicateStatement", "true");
  formData.set("forceInlineProcessing", "true");
  formData.set("file", new Blob([bytes], { type: "application/pdf" }), fileName);

  const processResponse = await fetch(`${baseUrl}/api/imports/${importId}/process`, {
    method: "POST",
    body: formData,
  });
  const processPayload = await readJsonResponse(processResponse);
  assert.equal(processResponse.ok, true, `China Bank process route should return 2xx: ${JSON.stringify(processPayload)}`);
  assert.equal(processPayload.queued, false, "China Bank should process inline.");
  assert.equal(processPayload.processed, true, "China Bank should be processed.");
  assert.equal(processPayload.status, "done", "China Bank should finish with status done.");
  assert.equal(processPayload.importedRows, 104, "China Bank should import 104 rows.");
  assert.equal(processPayload.confirmedTransactionsCount, 104, "China Bank should confirm 104 rows.");
  assert.equal(processPayload.visibleImportComplete, true, "China Bank should be visible to the UI.");

  const summaries = Array.isArray(processPayload.accountSummaries) ? processPayload.accountSummaries : [];
  assert.equal(summaries.length, 1, "China Bank should return one account summary.");
  const summary = summaries[0] as Record<string, unknown>;
  assert.equal(summary.institution, "China Bank", "China Bank summary institution should match.");
  assert.equal(summary.accountNumber, "1407-00-00679-0", "China Bank summary account number should match.");
  assert.equal(typeof summary.accountName, "string", "China Bank summary should expose an account display name.");
  assert.ok(String(summary.accountName).trim().length > 0, "China Bank summary account display name should not be empty.");
  assert.equal(summary.rowsImported, 104, "China Bank summary should include 104 rows.");

  const statusResponse = await fetch(`${baseUrl}/api/imports/${importId}/status`);
  const statusPayload = await readJsonResponse(statusResponse);
  assert.equal(statusResponse.ok, true, `China Bank status route should return 2xx: ${JSON.stringify(statusPayload)}`);
  assert.equal(statusPayload.confirmedTransactionsCount, 104, "China Bank status should report 104 confirmed rows.");
  assert.equal(statusPayload.visibleImportComplete, true, "China Bank status should be visible to the UI.");
  const accountId = (statusPayload.importFile as { accountId?: unknown } | null)?.accountId;
  assert.equal(typeof accountId, "string", "China Bank status should expose accountId.");

  const transactionsResponse = await fetch(`${baseUrl}/api/accounts/${accountId}/transactions?pageSize=200`);
  const transactionsPayload = await readJsonResponse(transactionsResponse);
  assert.equal(transactionsResponse.ok, true, `China Bank transactions route should return 2xx: ${JSON.stringify(transactionsPayload)}`);
  const transactions = Array.isArray(transactionsPayload.transactions) ? transactionsPayload.transactions : [];
  const importedTransactions = transactions.filter((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      return false;
    }
    const transaction = entry as Record<string, unknown>;
    return transaction.importFileId === importId || getRawPayloadImportId(transaction.rawPayload) === importId;
  });

  assert.equal(importedTransactions.length, 104, "China Bank account transactions should include 104 rows for this import.");

  const counts = importedTransactions.reduce<Record<string, number>>((next, entry) => {
    const row = entry as Record<string, unknown>;
    const key = `${row.type}:${row.categoryName}`;
    next[key] = (next[key] ?? 0) + 1;
    next[String(row.merchantRaw ?? "missing")] = (next[String(row.merchantRaw ?? "missing")] ?? 0) + 1;
    return next;
  }, {});
  assert.equal(counts["expense:Financial"], 42, "China Bank should expose 42 financial debit rows.");
  assert.equal(counts["expense:Cash & ATM"], 16, "China Bank should expose 16 cash withdrawal rows.");
  assert.equal(counts["income:Income"], 45, "China Bank should expose 45 income rows.");
  assert.equal(counts["income:Financial"], 1, "China Bank should expose one financial credit memo row.");
  assert.equal(counts["Cash Deposit"], 42, "China Bank should expose 42 cash deposits.");
  assert.equal(counts["Inclearing Check"], 40, "China Bank should expose 40 inclearing checks.");
  assert.equal(counts["Encashment"], 17, "China Bank should expose 17 encashments.");

  const firstCreditMemo = importedTransactions.find((entry) => (entry as Record<string, unknown>).merchantRaw === "Credit Memo") as Record<string, unknown> | undefined;
  assert.ok(firstCreditMemo, "China Bank should expose Credit Memo row.");
  assert.equal(firstCreditMemo.amount, "68820", "China Bank Credit Memo amount should match.");
  assert.equal(firstCreditMemo.type, "income", "China Bank Credit Memo should be an income-direction row.");
  assert.equal(firstCreditMemo.categoryName, "Financial", "China Bank Credit Memo category should be Financial.");

  console.log(`[PASS] ${fileName}: process, status, and account transactions returned 104 visible China Bank rows.`);
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
