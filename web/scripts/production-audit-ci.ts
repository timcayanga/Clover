import { execFile } from "node:child_process";
import { appendFile } from "node:fs/promises";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const maximumAttempts = 3;
const retryableAuditFailure = /(?:EAI_AGAIN|ECONNRESET|ECONNREFUSED|ENETUNREACH|ETIMEDOUT|ENOAUDIT|audit endpoint returned an error|socket hang up|network timeout)/i;

type AuditReport = {
  error?: { code?: string; summary?: string; detail?: string };
  metadata?: { vulnerabilities?: { high?: number; critical?: number } };
};

const addStepSummary = async (message: string) => {
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (summaryPath) await appendFile(summaryPath, `${message}\n`, "utf8");
};

const runAudit = async () => {
  try {
    const result = await execFileAsync(
      process.platform === "win32" ? "npm.cmd" : "npm",
      ["audit", "--omit=dev", "--audit-level=high", "--json", "--fetch-retries=1", "--fetch-timeout=45000"],
      { cwd: process.cwd(), encoding: "utf8", maxBuffer: 8 * 1024 * 1024, timeout: 90_000 },
    );
    return { exitCode: 0, stdout: result.stdout, stderr: result.stderr, timedOut: false };
  } catch (error) {
    const failure = error as Error & { code?: string | number; killed?: boolean; stdout?: string; stderr?: string };
    return {
      exitCode: typeof failure.code === "number" ? failure.code : 1,
      stdout: failure.stdout ?? "",
      stderr: `${failure.stderr ?? ""}\n${failure.message}`,
      timedOut: failure.killed === true || failure.code === "ETIMEDOUT",
    };
  }
};

const parseReport = (stdout: string): AuditReport | null => {
  try {
    return JSON.parse(stdout) as AuditReport;
  } catch {
    return null;
  }
};

const main = async () => {
  for (let attempt = 1; attempt <= maximumAttempts; attempt += 1) {
    const result = await runAudit();
    const report = parseReport(result.stdout);
    const high = report?.metadata?.vulnerabilities?.high ?? 0;
    const critical = report?.metadata?.vulnerabilities?.critical ?? 0;

    if (high > 0 || critical > 0) {
      console.error(result.stdout);
      throw new Error(`Production dependency audit found ${high} high and ${critical} critical advisories.`);
    }

    if (result.exitCode === 0 && report?.metadata?.vulnerabilities) {
      console.log("Production dependency audit passed with no high or critical advisories.");
      return;
    }

    const diagnostic = `${report?.error?.code ?? ""} ${report?.error?.summary ?? ""} ${report?.error?.detail ?? ""} ${result.stderr}`;
    const transient = result.timedOut || retryableAuditFailure.test(diagnostic);
    if (!transient) {
      if (result.stdout) console.error(result.stdout);
      if (result.stderr) console.error(result.stderr);
      throw new Error(`Production dependency audit failed unexpectedly with exit code ${result.exitCode}.`);
    }

    console.warn(`Production dependency audit service was unavailable (attempt ${attempt}/${maximumAttempts}).`);
  }

  const warning = "⚠️ npm's advisory service was unavailable after three bounded attempts. The quality gate continued because this was an external service failure, not a reported dependency vulnerability.";
  console.warn(warning);
  await addStepSummary(warning);
};

void main();
