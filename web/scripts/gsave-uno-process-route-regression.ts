import { strict as assert } from "node:assert";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { loadEnvConfig } from "@next/env";
import { prisma } from "@/lib/prisma";

const webRoot = basename(process.cwd()) === "web" ? process.cwd() : join(process.cwd(), "web");
loadEnvConfig(webRoot);

const screenshotRoot = process.env.CLOVER_SCREENSHOT_ROOT ?? "/Users/TimCayanga1/Documents/Bank Screenshots";
const baseUrl = process.env.CLOVER_IMPORT_REGRESSION_BASE_URL ?? "http://localhost:3000";
const requestedWorkspaceId = process.env.CLOVER_IMPORT_REGRESSION_WORKSPACE_ID;

const gsaveFiles = [
  "GSave/IMG_1407.PNG",
  "GSave/IMG_1408.PNG",
  "GSave/IMG_1409.PNG",
  "GSave/IMG_1411.PNG",
  "GSave/IMG_1413.PNG",
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
        email: "local-admin+gsave-uno-qa@clover.local",
        firstName: "Local",
        lastName: "QA",
        verified: true,
        environment: "local",
        planTier: "pro",
        planTierLocked: true,
      },
      select: { id: true },
    });

    const workspace = await prisma.workspace.create({
      data: {
        userId: user.id,
        name: `GSave UNO Import Regression ${new Date().toISOString()}`,
        type: "personal",
      },
      select: { id: true },
    });

    return workspace.id;
  } catch (error) {
    throw new Error(
      "Unable to create the local GSave / UNO QA workspace. Start the local database or set CLOVER_IMPORT_REGRESSION_WORKSPACE_ID.",
      { cause: error }
    );
  }
};

const assertLocalServerReachable = async () => {
  try {
    await fetch(`${baseUrl}/api/health`);
  } catch (error) {
    throw new Error(
      `Unable to reach ${baseUrl}. Start Clover locally with \`npm run dev\` before running qa:gsave-uno-process.`,
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

const main = async () => {
  const workspaceId =
    requestedWorkspaceId ??
    (isLocalRegressionBaseUrl(baseUrl)
      ? (await assertLocalServerReachable(), await ensureLocalRegressionWorkspace())
      : null);
  if (!workspaceId) {
    throw new Error(
      "Set CLOVER_IMPORT_REGRESSION_WORKSPACE_ID to run the GSave / UNO process route regression against non-local URLs."
    );
  }

  for (const relativePath of gsaveFiles) {
    const absolutePath = join(screenshotRoot, relativePath);
    const fileName = basename(absolutePath);
    const importId = randomUUID();
    const bytes = await readFile(absolutePath);
    const formData = new FormData();
    formData.set("workspaceId", workspaceId);
    formData.set("fileName", fileName);
    formData.set("fileType", "image/png");
    formData.set("importMode", "statement");
    formData.set("allowDuplicateStatement", "true");
    formData.set("file", new Blob([bytes], { type: "image/png" }), fileName);

    const processResponse = await fetch(`${baseUrl}/api/imports/${importId}/process`, {
      method: "POST",
      body: formData,
    });
    const processPayload = await readJsonResponse(processResponse);
    assert.equal(processResponse.ok, true, `${fileName} process route should return 2xx: ${JSON.stringify(processPayload)}`);
    assert.equal(processPayload.processed, true, `${fileName} should process successfully.`);
    assert.ok(
      Array.isArray(processPayload.accountSummaries) && processPayload.accountSummaries.length > 0,
      `${fileName} should publish visible account summaries.`
    );

    const statusResponse = await fetch(`${baseUrl}/api/imports/${importId}/status`);
    const statusPayload = await readJsonResponse(statusResponse);
    assert.equal(statusResponse.ok, true, `${fileName} status route should return 2xx: ${JSON.stringify(statusPayload)}`);
    assert.ok(
      Array.isArray(statusPayload.accountSummaries) && statusPayload.accountSummaries.length > 0,
      `${fileName} status should retain account summaries.`
    );
  }

  const accountsResponse = await fetch(`${baseUrl}/api/accounts?workspaceId=${encodeURIComponent(workspaceId)}`);
  const accountsPayload = await readJsonResponse(accountsResponse);
  assert.equal(accountsResponse.ok, true, `Accounts route should return 2xx: ${JSON.stringify(accountsPayload)}`);
  const accounts = Array.isArray(accountsPayload.accounts) ? accountsPayload.accounts : [];

  const gsaveAccounts = accounts.filter((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      return false;
    }
    const account = entry as Record<string, unknown>;
    return account.source === "upload" && account.institution === "GSave";
  }) as Array<Record<string, unknown>>;

  assert.equal(gsaveAccounts.length, 5, "GSave / UNO import should resolve to exactly five linked uploaded accounts.");

  const cimbAccount = gsaveAccounts.find((account) => account.name === "GSave CIMB 6972");
  const unoReadyAccount = gsaveAccounts.find((account) => account.name === "GSave #UNOready 4132");
  assert.ok(cimbAccount, "GSave should include the CIMB savings card account.");
  assert.ok(unoReadyAccount, "GSave should include the #UNOready savings account.");

  const unoBoostAccounts = gsaveAccounts
    .filter((account) => account.type === "investment")
    .sort((left, right) => String(left.name ?? "").localeCompare(String(right.name ?? "")));
  assert.equal(unoBoostAccounts.length, 3, "GSave should include exactly three #UNOboost investment accounts.");

  const expectedByName = new Map([
    [
      "GSave #UNOboost 1330",
      {
        accountNumber: "40001000551330",
        balance: "100000",
        investmentPrincipal: "100000",
        investmentInterestRate: "6",
        investmentMaturityValue: "106000",
        investmentMaturityDate: "2026-10-07",
      },
    ],
    [
      "GSave #UNOboost 2023",
      {
        accountNumber: "40007384712023",
        balance: "100000",
        investmentPrincipal: "100000",
        investmentInterestRate: "5.75",
        investmentMaturityValue: "105750",
        investmentMaturityDate: "2026-12-29",
      },
    ],
    [
      "GSave #UNOboost 4217",
      {
        accountNumber: "40007366884217",
        balance: "100000",
        investmentPrincipal: "100000",
        investmentInterestRate: "6",
        investmentMaturityValue: "106000",
        investmentMaturityDate: "2026-10-11",
      },
    ],
  ]);

  for (const account of unoBoostAccounts) {
    const expected = expectedByName.get(String(account.name ?? ""));
    assert.ok(expected, `Unexpected GSave investment account ${String(account.name ?? "")}`);
    assert.equal(account.investmentSubtype, "time_deposit", `${String(account.name)} should be tagged as a time deposit.`);
    assert.equal(account.accountNumber, expected.accountNumber, `${String(account.name)} should retain its full account number.`);
    assert.equal(account.balance, expected.balance, `${String(account.name)} should retain its current balance.`);
    assert.equal(account.investmentPrincipal, expected.investmentPrincipal, `${String(account.name)} principal should match.`);
    assert.equal(account.investmentInterestRate, expected.investmentInterestRate, `${String(account.name)} interest rate should match.`);
    assert.equal(account.investmentMaturityValue, expected.investmentMaturityValue, `${String(account.name)} maturity value should match.`);
    assert.equal(
      String(account.investmentMaturityDate ?? "").slice(0, 10),
      expected.investmentMaturityDate,
      `${String(account.name)} maturity date should match.`
    );

    const accountId = String(account.id ?? "");
    assert.ok(accountId, `${String(account.name)} should expose an account id.`);
    const detailResponse = await fetch(`${baseUrl}/api/accounts/${accountId}`);
    const detailPayload = await readJsonResponse(detailResponse);
    assert.equal(detailResponse.ok, true, `Account detail route should return 2xx for ${String(account.name)}.`);
    const detailAccount =
      detailPayload.account && typeof detailPayload.account === "object" && !Array.isArray(detailPayload.account)
        ? (detailPayload.account as Record<string, unknown>)
        : null;
    assert.ok(detailAccount, `${String(account.name)} detail route should return account payload.`);
    assert.equal(detailAccount?.investmentSubtype, "time_deposit", `${String(account.name)} detail subtype should match.`);
    assert.equal(detailAccount?.investmentPrincipal, expected.investmentPrincipal, `${String(account.name)} detail principal should match.`);
    assert.equal(detailAccount?.investmentInterestRate, expected.investmentInterestRate, `${String(account.name)} detail interest should match.`);
    assert.equal(detailAccount?.investmentMaturityValue, expected.investmentMaturityValue, `${String(account.name)} detail maturity value should match.`);
  }

  console.log("[PASS] GSave / UNO screenshots resolve to five linked uploaded accounts with enriched time-deposit details.");
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
