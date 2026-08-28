import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { basename, dirname, extname, join } from "node:path";
import { loadEnvConfig } from "@next/env";
import { prisma } from "@/lib/prisma";
import { resolveFinancialTransactionType } from "@/lib/transaction-directions";

const webRoot = basename(process.cwd()) === "web" ? process.cwd() : join(process.cwd(), "web");
loadEnvConfig(webRoot);

const baseUrl = process.env.CLOVER_IMPORT_REGRESSION_BASE_URL ?? "http://localhost:3001";
const requestOrigin = new URL(baseUrl).origin;
const statementRoot = process.env.CLOVER_STATEMENT_ROOT ?? "/Users/TimCayanga1/Documents/Bank Statements";
const screenshotRoot = process.env.CLOVER_SCREENSHOT_ROOT ?? "/Users/TimCayanga1/Documents/Bank Screenshots";
const receiptRoot = process.env.CLOVER_RECEIPT_ROOT ?? "/Users/TimCayanga1/Documents/Receipt Samples";
const gitRepositoryRoot = (() => {
  try {
    return dirname(
      execFileSync("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], {
        cwd: webRoot,
        encoding: "utf8",
      }).trim()
    );
  } catch {
    return dirname(webRoot);
  }
})();
const passwordFixtureCandidates = [
  process.env.CLOVER_IMPORT_PASSWORD_FIXTURE,
  join(webRoot, "tmp/pdfs/rcbc-password-qa.pdf"),
  join(gitRepositoryRoot, "web/tmp/pdfs/rcbc-password-qa.pdf"),
].filter((candidate): candidate is string => Boolean(candidate));
const passwordFixture = passwordFixtureCandidates.find((candidate) => existsSync(candidate)) ?? passwordFixtureCandidates[0]!;
const maxVisibleMs = Number(process.env.CLOVER_IMPORT_MAX_VISIBLE_MS ?? 20_000);
const maxStatusMs = Number(process.env.CLOVER_IMPORT_MAX_STATUS_MS ?? 3_000);
const caseFilter = process.env.CLOVER_IMPORT_MATRIX_CASE?.trim().toLowerCase() ?? "";
const keepWorkspaces = process.env.CLOVER_IMPORT_MATRIX_KEEP_WORKSPACES === "true";
const forceInlineProcessing = process.env.CLOVER_IMPORT_MATRIX_FORCE_INLINE !== "false";
const regressionUserId = process.env.CLOVER_IMPORT_REGRESSION_USER_ID?.trim() || "local-admin";
const regressionUserEnvironment = process.env.CLOVER_IMPORT_REGRESSION_USER_ENVIRONMENT?.trim() || "local";

type ImportMode = "statement" | "receipt" | "notes";

type MatrixCase = {
  label: string;
  path: string;
  mode: ImportMode;
  fileType: string;
  bankName?: string;
  password?: string;
  expectedPasswordPrompt?: boolean;
  minimumTransactions: number;
  expectedInstitution?: RegExp;
  expectedAccountType?: string;
  expectedMerchant?: RegExp;
  expectedAllMerchants?: RegExp;
  expectedCategory?: string;
  expectedAllTransfers?: boolean;
  minimumTransfers?: number;
  expectedAmount?: number;
  expectedAmounts?: number[];
  exactTransactions?: number;
  expectedAccounts?: number;
  expectedCommitments?: number;
  maximumMs?: number;
};

const cases: MatrixCase[] = [
  {
    label: "RCBC unlocked SOA",
    path: join(statementRoot, "Actual SOAs/RCBC/Unlocked/eStatement_VISA PLATINUM_DEC 22 2025_1014_unlocked.pdf"),
    mode: "statement",
    fileType: "application/pdf",
    bankName: "RCBC",
    minimumTransactions: 50,
    expectedInstitution: /RCBC/i,
    expectedAccountType: "credit_card",
    minimumTransfers: 1,
  },
  {
    label: "RCBC password prompt",
    path: passwordFixture,
    mode: "statement",
    fileType: "application/pdf",
    bankName: "RCBC",
    expectedPasswordPrompt: true,
    minimumTransactions: 0,
    maximumMs: 10_000,
  },
  {
    label: "RCBC password retry",
    path: passwordFixture,
    mode: "statement",
    fileType: "application/pdf",
    bankName: "RCBC",
    password: "clover-qa",
    minimumTransactions: 50,
    expectedInstitution: /RCBC/i,
    expectedAccountType: "credit_card",
  },
  {
    label: "Security Bank owner-encrypted SOA",
    path: join(statementRoot, "Samples/Security Bank/748042099-Security-Bank-Statement-Gsr.pdf"),
    mode: "statement",
    fileType: "application/pdf",
    bankName: "Security Bank",
    minimumTransactions: 8,
    exactTransactions: 8,
    expectedInstitution: /Security Bank/i,
    expectedAccountType: "bank",
    expectedAllMerchants: /Account Transfer|ATRC|ATRO/i,
    expectedCategory: "Transfers",
    expectedAllTransfers: true,
  },
  {
    label: "HSBC UK same-date SOA",
    path: join(statementRoot, "Actual SOAs/HSBC UK/2026-06-20_Statement.pdf"),
    mode: "statement",
    fileType: "application/pdf",
    bankName: "HSBC",
    minimumTransactions: 8,
    exactTransactions: 8,
    expectedInstitution: /HSBC/i,
    expectedAccountType: "bank",
    expectedMerchant: /Jack'?s Gelato/i,
  },
  {
    label: "Maya bank screenshot",
    path: join(screenshotRoot, "Maya/IMG_1363.PNG"),
    mode: "statement",
    fileType: "image/png",
    bankName: "Maya",
    minimumTransactions: 4,
    expectedInstitution: /Maya/i,
  },
  {
    label: "receipt photo",
    path: join(receiptRoot, "Actual Receipts/2026-05-01 22.01.12.jpg"),
    mode: "receipt",
    fileType: "image/jpeg",
    minimumTransactions: 1,
    expectedMerchant: /Jarandjam/i,
    expectedAmount: 7_782.95,
  },
  {
    label: "handwritten financial record",
    path: join(receiptRoot, "Samples/OR sample bayan.jpg"),
    mode: "receipt",
    fileType: "image/jpeg",
    minimumTransactions: 1,
    expectedMerchant: /Bayan/i,
    expectedAmount: 100,
  },
  {
    label: "digital notes screenshot",
    path: join(receiptRoot, "Samples/apple-notes-math-notes-monthly-total-calculation-iphone.webp"),
    mode: "notes",
    fileType: "image/webp",
    minimumTransactions: 1,
    expectedAmount: 2_344,
  },
  {
    label: "multi-sheet XLSX accounts transactions and receivables",
    path: "/Users/TimCayanga1/Downloads/Net Worth Calculator.xlsx",
    mode: "statement",
    fileType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    minimumTransactions: 814,
    exactTransactions: 814,
    expectedInstitution: /Cash/i,
    expectedAccountType: "cash",
    expectedAccounts: 18,
    expectedCommitments: 12,
  },
  {
    label: "auto-detected receipt photo dropped as statement",
    path: join(receiptRoot, "Actual Receipts/2026-05-01 22.04.59.jpg"),
    mode: "statement",
    fileType: "image/jpeg",
    minimumTransactions: 1,
    expectedAmount: 2_191.64,
  },
  {
    label: "auto-detected digital notes dropped as statement",
    path: join(receiptRoot, "Actual Receipts/2026-05-01 22.06.24.jpg"),
    mode: "statement",
    fileType: "image/jpeg",
    minimumTransactions: 1,
    exactTransactions: 3,
    expectedAmounts: [306.67, 209.67, 226.67],
  },
];

const waitForSettledImport = async (importId: string, timeoutMs: number) => {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const snapshot = await prisma.importFile.findUnique({
      where: { id: importId },
      select: {
        status: true,
        processingPhase: true,
        processingMessage: true,
        confirmedTransactionsCount: true,
      },
    });
    if (snapshot?.status === "done" || snapshot?.status === "failed") return snapshot;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`${importId} did not settle within ${timeoutMs}ms.`);
};

const createWorkspace = async (userId: string, label: string) =>
  prisma.workspace.create({
    data: {
      userId,
      name: `Import matrix - ${label} - ${randomUUID()}`,
      type: "personal",
    },
    select: { id: true },
  });

const postFile = async (workspaceId: string, matrixCase: MatrixCase, importId = randomUUID()) => {
  const bytes = await readFile(matrixCase.path);
  const fileName = basename(matrixCase.path);
  const form = new FormData();
  form.set("workspaceId", workspaceId);
  form.set("fileName", fileName);
  form.set("fileType", matrixCase.fileType);
  form.set("importMode", matrixCase.mode);
  form.set("forceInlineProcessing", String(forceInlineProcessing));
  if (matrixCase.bankName) form.set("bankName", matrixCase.bankName);
  if (matrixCase.password) form.set("password", matrixCase.password);
  form.set("file", new Blob([bytes], { type: matrixCase.fileType }), fileName);

  const startedAt = Date.now();
  const response = await fetch(`${baseUrl}/api/imports/${importId}/process`, {
    method: "POST",
    headers: { Origin: requestOrigin },
    body: form,
  });
  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  return { importId, response, payload, startedAt };
};

const verifyTransactions = async (workspaceId: string, importId: string, matrixCase: MatrixCase) => {
  const transactions = await prisma.transaction.findMany({
    where: { workspaceId, importFileId: importId, deletedAt: null },
    include: {
      account: { select: { institution: true, type: true, name: true } },
      category: { select: { name: true } },
    },
    orderBy: [{ date: "asc" }, { createdAt: "asc" }],
  });
  assert.ok(
    transactions.length >= matrixCase.minimumTransactions,
    `${matrixCase.label}: expected at least ${matrixCase.minimumTransactions} transactions, got ${transactions.length}.`
  );
  if (matrixCase.exactTransactions != null) {
    assert.equal(transactions.length, matrixCase.exactTransactions, `${matrixCase.label}: unexpected row count.`);
  }
  assert.ok(transactions.every((row) => Number(row.amount) > 0), `${matrixCase.label}: every transaction needs a positive amount.`);
  assert.ok(transactions.every((row) => row.merchantRaw.trim().length > 0), `${matrixCase.label}: every row needs source text.`);
  assert.ok(
    transactions.every((row) => row.parserConfidence >= 0 && row.parserConfidence <= 100),
    `${matrixCase.label}: parser confidence must remain in range.`
  );

  const rowKeys = transactions.map((row) => row.sourceRowKey).filter((value): value is string => Boolean(value));
  assert.equal(new Set(rowKeys).size, rowKeys.length, `${matrixCase.label}: duplicate source row keys were materialized.`);

  if (matrixCase.expectedInstitution) {
    assert.ok(
      transactions.some((row) => matrixCase.expectedInstitution!.test(row.account.institution ?? row.account.name)),
      `${matrixCase.label}: expected institution/account identity was not preserved.`
    );
  }
  if (matrixCase.expectedAccountType) {
    assert.ok(
      transactions.every((row) => row.account.type === matrixCase.expectedAccountType),
      `${matrixCase.label}: expected account type ${matrixCase.expectedAccountType}.`
    );
  }
  if (matrixCase.expectedMerchant) {
    assert.ok(
      transactions.some((row) => matrixCase.expectedMerchant!.test(row.merchantClean ?? row.merchantRaw)),
      `${matrixCase.label}: expected merchant was not normalized correctly.`
    );
  }
  if (matrixCase.expectedAllMerchants) {
    assert.ok(
      transactions.every((row) => matrixCase.expectedAllMerchants!.test(row.merchantClean ?? row.merchantRaw)),
      `${matrixCase.label}: cached or generic merchant noise replaced deterministic rows.`
    );
  }
  if (matrixCase.expectedCategory) {
    assert.ok(
      transactions.every((row) => row.category?.name === matrixCase.expectedCategory),
      `${matrixCase.label}: expected category ${matrixCase.expectedCategory}.`
    );
  }
  if (matrixCase.expectedAllTransfers) {
    assert.ok(
      transactions.every((row) => row.isTransfer || row.type === "transfer"),
      `${matrixCase.label}: transfer rows must be excluded from spending and income summaries.`
    );
  }
  if (matrixCase.expectedAmount != null) {
    assert.ok(
      transactions.some((row) => Math.abs(Number(row.amount) - matrixCase.expectedAmount!) < 0.01),
      `${matrixCase.label}: expected amount ${matrixCase.expectedAmount} was not found.`
    );
  }
  if (matrixCase.expectedAmounts) {
    for (const expectedAmount of matrixCase.expectedAmounts) {
      assert.ok(
        transactions.some((row) => Math.abs(Number(row.amount) - expectedAmount) < 0.01),
        `${matrixCase.label}: expected amount ${expectedAmount} was not found.`
      );
    }
  }

  const totals = transactions.reduce(
    (summary, row) => {
      const amount = Math.abs(Number(row.amount));
      const type = resolveFinancialTransactionType({
        type: row.type,
        amount: row.amount,
        isTransfer: row.isTransfer,
        categoryName: row.category?.name,
        merchantRaw: row.merchantRaw,
        merchantClean: row.merchantClean,
        description: row.description,
        institution: row.account.institution,
      });
      summary[type === "expense" ? "spending" : type === "transfer" ? "transfers" : "income"] += amount;
      return summary;
    },
    { spending: 0, income: 0, transfers: 0 }
  );
  const { spending, income, transfers } = totals;
  assert.ok(spending > 0 || income > 0 || transfers > 0, `${matrixCase.label}: visible summary values cannot all be zero.`);
  if (matrixCase.minimumTransfers != null) {
    const transferRows = transactions.filter((row) => row.isTransfer || row.type === "transfer").length;
    assert.ok(
      transferRows >= matrixCase.minimumTransfers,
      `${matrixCase.label}: expected at least ${matrixCase.minimumTransfers} transfer rows, got ${transferRows}.`
    );
  }

  const accountIds = new Set(transactions.map((row) => row.accountId));
  assert.equal(accountIds.size, 1, `${matrixCase.label}: one file unexpectedly created transactions across multiple accounts.`);

  return { count: transactions.length, spending, income, transfers };
};

const getTransactionApiSnapshot = async (workspaceId: string, summaryMode: "light" | "full") => {
  const startedAt = Date.now();
  const response = await fetch(
    `${baseUrl}/api/transactions?workspaceId=${encodeURIComponent(workspaceId)}&page=1&pageSize=1&summaryMode=${summaryMode}`
  );
  const payload = (await response.json().catch(() => ({}))) as {
    totalCount?: number;
    summary?: { income?: number; spending?: number; transfers?: number };
  };
  assert.equal(response.ok, true, `${summaryMode} transaction API failed: ${JSON.stringify(payload)}`);
  return {
    elapsedMs: Date.now() - startedAt,
    totalCount: Number(payload.totalCount ?? 0),
    income: Number(payload.summary?.income ?? 0),
    spending: Number(payload.summary?.spending ?? 0),
    transfers: Number(payload.summary?.transfers ?? 0),
  };
};

const verifyVisibleStatusHandoff = async (importId: string, expectedTransactions: number, label: string) => {
  const startedAt = Date.now();
  const response = await fetch(`${baseUrl}/api/imports/${importId}/status`, { cache: "no-store" });
  const payload = (await response.json().catch(() => ({}))) as {
    visibleImportComplete?: boolean;
    confirmedTransactionsCount?: number;
    importFile?: { status?: string };
  };
  const elapsedMs = Date.now() - startedAt;
  assert.equal(response.ok, true, `${label}: status API failed: ${JSON.stringify(payload)}`);
  assert.equal(payload.visibleImportComplete, true, `${label}: status API did not publish visible transactions.`);
  assert.equal(payload.importFile?.status, "done", `${label}: status API did not report a completed import.`);
  assert.ok(
    Number(payload.confirmedTransactionsCount ?? 0) >= expectedTransactions,
    `${label}: status API reported fewer confirmed rows than the transaction table.`
  );
  assert.ok(elapsedMs <= maxStatusMs, `${label}: status handoff took ${elapsedMs}ms; expected at most ${maxStatusMs}ms.`);
  return elapsedMs;
};

const assertClose = (actual: number, expected: number, label: string) =>
  assert.ok(Math.abs(actual - expected) < 0.01, `${label}: expected ${expected}, got ${actual}.`);

const verifyDownstreamStability = async (
  workspaceId: string,
  quality: { count: number; spending: number; income: number; transfers: number },
  label: string
) => {
  const lightSnapshots = [];
  for (let index = 0; index < 3; index += 1) {
    lightSnapshots.push(await getTransactionApiSnapshot(workspaceId, "light"));
    if (index < 2) await new Promise((resolve) => setTimeout(resolve, 400));
  }
  const full = await getTransactionApiSnapshot(workspaceId, "full");

  for (const snapshot of [...lightSnapshots, full]) {
    assert.equal(snapshot.totalCount, quality.count, `${label}: API and persisted row counts diverged.`);
    assertClose(snapshot.income, quality.income, `${label} income`);
    assertClose(snapshot.spending, quality.spending, `${label} spending`);
    assertClose(snapshot.transfers, quality.transfers, `${label} transfers`);
  }
  assert.deepEqual(
    lightSnapshots.map(({ totalCount, income, spending, transfers }) => ({
      totalCount,
      income: Number(income.toFixed(2)),
      spending: Number(spending.toFixed(2)),
      transfers: Number(transfers.toFixed(2)),
    })),
    Array.from({ length: 3 }, () => ({
      totalCount: quality.count,
      income: Number(quality.income.toFixed(2)),
      spending: Number(quality.spending.toFixed(2)),
      transfers: Number(quality.transfers.toFixed(2)),
    })),
    `${label}: summary cards fluctuated after the import settled.`
  );

  return {
    lightApiMs: Math.max(...lightSnapshots.map((snapshot) => snapshot.elapsedMs)),
    fullApiMs: full.elapsedMs,
  };
};

const verifyDuplicateReplay = async (workspaceId: string, matrixCase: MatrixCase, expectedCount: number) => {
  const accountCountBefore = await prisma.account.count({ where: { workspaceId } });
  const replay = await postFile(workspaceId, matrixCase);
  assert.equal(replay.response.ok, true, `${matrixCase.label} replay: ${JSON.stringify(replay.payload)}`);
  const settled = await waitForSettledImport(replay.importId, maxVisibleMs);
  const elapsedMs = Date.now() - replay.startedAt;
  assert.equal(settled.status, "done", `${matrixCase.label} replay did not complete.`);
  assert.ok(elapsedMs <= maxVisibleMs, `${matrixCase.label} replay took ${elapsedMs}ms.`);
  const [transactionCountAfter, replayRows, accountCountAfter] = await Promise.all([
    prisma.transaction.count({ where: { workspaceId, deletedAt: null } }),
    prisma.transaction.count({ where: { workspaceId, importFileId: replay.importId, deletedAt: null } }),
    prisma.account.count({ where: { workspaceId } }),
  ]);
  assert.equal(transactionCountAfter, expectedCount, `${matrixCase.label}: replay duplicated persisted transactions.`);
  assert.equal(replayRows, 0, `${matrixCase.label}: replay materialized ${replayRows} duplicate rows.`);
  assert.equal(accountCountAfter, accountCountBefore, `${matrixCase.label}: replay created a duplicate account.`);
  return elapsedMs;
};

const waitForPostVisibleJobs = async (workspaceIds: string[], timeoutMs = 20_000) => {
  // Deferred QA, training, and finalization work starts 5-10 seconds after the
  // import becomes visible. Let those callbacks begin before checking the
  // durable enrichment queue; otherwise cleanup can delete their workspace
  // during the delay and manufacture foreign-key failures in the server log.
  const deferredWorkGraceMs = Number(process.env.CLOVER_IMPORT_POST_VISIBLE_GRACE_MS ?? 12_000);
  await new Promise((resolve) => setTimeout(resolve, deferredWorkGraceMs));
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const activeJobs = await prisma.importEnrichmentJob.count({
      where: {
        workspaceId: { in: workspaceIds },
        status: { in: ["queued", "running", "retrying"] },
      },
    });
    if (activeJobs === 0) {
      await new Promise((resolve) => setTimeout(resolve, 1_000));
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
};

const main = async () => {
  const health = await fetch(`${baseUrl}/api/health`).catch(() => null);
  assert.equal(health?.ok, true, `Start Clover locally at ${baseUrl} before running this regression.`);

  const user = await prisma.user.upsert({
    where: { clerkUserId: regressionUserId },
    update: { planTier: "pro", planTierLocked: true },
    create: {
      clerkUserId: regressionUserId,
      email: `${regressionUserId}+file-matrix@clover.local`,
      verified: true,
      environment: regressionUserEnvironment,
      planTier: "pro",
      planTierLocked: true,
    },
    select: { id: true },
  });

  const workspaces: string[] = [];
  const results: Array<Record<string, unknown>> = [];
  try {
    const selectedCases = caseFilter ? cases.filter((matrixCase) => matrixCase.label.toLowerCase().includes(caseFilter)) : cases;
    assert.ok(selectedCases.length > 0, `No import matrix case matched ${caseFilter}.`);
    for (const matrixCase of selectedCases) {
      assert.ok(extname(matrixCase.path), `${matrixCase.label}: fixture path must have an extension.`);
      assert.ok(
        existsSync(matrixCase.path),
        `${matrixCase.label}: fixture not found at ${matrixCase.path}. Checked password fixture candidates: ${passwordFixtureCandidates.join(", ")}`
      );
      const workspace = await createWorkspace(user.id, matrixCase.label);
      workspaces.push(workspace.id);
      const posted = await postFile(workspace.id, matrixCase);

      if (matrixCase.expectedPasswordPrompt) {
        const elapsedMs = Date.now() - posted.startedAt;
        assert.equal(posted.response.status, 422, `${matrixCase.label}: encrypted PDF must request a password.`);
        assert.equal(posted.payload.code, "IMPORT_PASSWORD_REQUIRED", `${matrixCase.label}: wrong password error code.`);
        assert.ok(elapsedMs <= (matrixCase.maximumMs ?? 10_000), `${matrixCase.label}: prompt took ${elapsedMs}ms.`);
        const saved = await prisma.importFile.findUnique({ where: { id: posted.importId } });
        assert.equal(saved?.processingPhase, "password_required", `${matrixCase.label}: password-required state was not persisted.`);
        results.push({ label: matrixCase.label, elapsedMs, status: "password_required", transactions: 0 });
        console.log(`[PASS] ${matrixCase.label}: password requested in ${elapsedMs}ms.`);
        continue;
      }

      assert.equal(posted.response.ok, true, `${matrixCase.label}: ${JSON.stringify(posted.payload)}`);
      const settled = await waitForSettledImport(posted.importId, maxVisibleMs);
      const elapsedMs = Date.now() - posted.startedAt;
      assert.equal(settled.status, "done", `${matrixCase.label}: ${settled.processingMessage ?? settled.processingPhase}`);
      assert.ok(elapsedMs <= maxVisibleMs, `${matrixCase.label}: transactions took ${elapsedMs}ms to become visible.`);
      let quality;
      try {
        quality = await verifyTransactions(workspace.id, posted.importId, matrixCase);
      } catch (error) {
        const diagnostics = await prisma.importFile.findUnique({
          where: { id: posted.importId },
          include: {
            documentImport: true,
            parsedRows: { take: 8 },
            transactions: { take: 8 },
          },
        });
        console.error(JSON.stringify({ label: matrixCase.label, elapsedMs, diagnostics }, null, 2));
        throw error;
      }
      if (matrixCase.expectedAccounts != null) {
        assert.equal(
          await prisma.account.count({ where: { workspaceId: workspace.id } }),
          matrixCase.expectedAccounts,
          `${matrixCase.label}: unexpected account count.`
        );
      }
      if (matrixCase.expectedCommitments != null) {
        assert.equal(
          await prisma.financialCommitment.count({
            where: {
              workspaceId: workspace.id,
              source: "structured_workbook_receivable",
            },
          }),
          matrixCase.expectedCommitments,
          `${matrixCase.label}: itemized receivables were not published to Recurring.`
        );
      }
      let downstream;
      const statusApiMs = await verifyVisibleStatusHandoff(posted.importId, quality.count, matrixCase.label);
      try {
        downstream = await verifyDownstreamStability(workspace.id, quality, matrixCase.label);
      } catch (error) {
        const [rows, light, full] = await Promise.all([
          prisma.transaction.findMany({
            where: { workspaceId: workspace.id, deletedAt: null },
            select: {
              amount: true,
              type: true,
              isTransfer: true,
              merchantRaw: true,
              category: { select: { name: true } },
              account: { select: { institution: true, type: true } },
            },
          }),
          getTransactionApiSnapshot(workspace.id, "light"),
          getTransactionApiSnapshot(workspace.id, "full"),
        ]);
        console.error(JSON.stringify({ label: matrixCase.label, quality, rows, light, full }, null, 2));
        throw error;
      }
      const duplicateReplayMs = await verifyDuplicateReplay(workspace.id, matrixCase, quality.count);
      results.push({ label: matrixCase.label, elapsedMs, status: settled.status, ...quality, statusApiMs, ...downstream, duplicateReplayMs });
      console.log(`[PASS] ${matrixCase.label}: ${quality.count} transactions visible in ${elapsedMs}ms; status ${statusApiMs}ms; API stable; replay deduped in ${duplicateReplayMs}ms.`);
    }

    console.log(JSON.stringify(results, null, 2));
    console.log(`[PASS] ${results.length} real-file import paths met quality checks and the ${maxVisibleMs}ms visibility ceiling.`);
  } finally {
    if (keepWorkspaces) {
      console.log(`[QA] Preserved workspaces: ${workspaces.join(", ")}`);
    } else {
      // Post-visible learning and QA are deliberately delayed so user-facing reads get database priority.
      await waitForPostVisibleJobs(workspaces);
      await new Promise((resolve) => setTimeout(resolve, 500));
      for (const workspaceId of workspaces) {
        await prisma.workspace.delete({ where: { id: workspaceId } }).catch(() => null);
      }
    }
    await prisma.$disconnect();
  }
};

main().catch(async (error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  await prisma.$disconnect().catch(() => null);
  process.exitCode = 1;
});
