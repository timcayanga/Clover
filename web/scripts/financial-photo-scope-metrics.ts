import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import backupCaseLabels from "./fixtures/financial-photo-scope/backup-case-labels.json";

type Verdict = "financial" | "non_financial" | "ambiguous";
type Platform = "ios" | "android" | "web" | "server";
type Labels = { language: string; documentType: string; imageQuality: string };
type Observation = Labels & {
  platform: Platform;
  expected: Verdict;
  actual: Verdict | null;
  verdictLatencyMs?: number;
  backupCalls?: number;
  unnecessaryBackupCalls?: number;
};
const verdicts = new Set(["financial", "non_financial", "ambiguous"]);
const dimensions = {
  platform: ["ios", "android", "web", "server"],
  language: [],
  documentType: [],
  imageQuality: [],
} as const;

function measure(rows: Observation[]) {
  const rate = (expected: Verdict, wrong: Verdict) => {
    const labeled = rows.filter(row => row.expected === expected);
    const completed = labeled.filter(row => row.actual !== null);
    const errors = completed.filter(row => row.actual === wrong).length;
    return { errors, evaluated: completed.length, labeled: labeled.length,
      rate: completed.length ? errors / completed.length : null };
  };
  const latencies = rows.flatMap(row => row.actual !== null && row.verdictLatencyMs !== undefined ? [row.verdictLatencyMs] : [])
    .sort((a, b) => a - b);
  const percentile = (p: number) => latencies.length ? latencies[Math.ceil(latencies.length * p) - 1] : null;
  const measuredCalls = rows.filter(row => row.backupCalls !== undefined && row.unnecessaryBackupCalls !== undefined);
  const totalCalls = measuredCalls.reduce((sum, row) => sum + row.backupCalls!, 0);
  const unnecessaryCalls = measuredCalls.reduce((sum, row) => sum + row.unnecessaryBackupCalls!, 0);
  return {
    observations: rows.length,
    verdictLatencyMs: { measured: latencies.length, p50: percentile(.5), p95: percentile(.95) },
    backupCalls: { measured: measuredCalls.length, total: totalCalls, unnecessary: unnecessaryCalls,
      unnecessaryRate: totalCalls ? unnecessaryCalls / totalCalls : null },
    falseRejection: rate("financial", "non_financial"),
    falseAcceptance: rate("non_financial", "financial"),
    ambiguousHardRejection: rate("ambiguous", "non_financial"),
    deferred: rows.filter(row => row.actual === "ambiguous" && row.expected !== "ambiguous").length,
    unavailable: rows.filter(row => row.actual === null).length,
  };
}

export function summarizePhotoScope(rows: Observation[]) {
  const breakdowns = Object.fromEntries((Object.keys(dimensions) as (keyof typeof dimensions)[]).map(dimension => {
    const groups = new Map<string, Observation[]>(dimensions[dimension].map(value => [value, []]));
    for (const row of rows) {
      const value = row[dimension];
      if (!groups.has(value)) groups.set(value, []);
      groups.get(value)!.push(row);
    }
    return [dimension, Object.fromEntries([...groups].map(([value, members]) => [value, measure(members)]))];
  }));
  return { overall: measure(rows), breakdowns };
}

function validateObservation(row: Observation) {
  assert.ok(dimensions.platform.includes(row.platform), "An observed platform is required.");
  assert.ok(verdicts.has(row.expected), "A ground-truth verdict is required.");
  assert.ok(row.actual === null || verdicts.has(row.actual), "An observed verdict or explicit unavailable result is required.");
  for (const key of ["language", "documentType", "imageQuality"] as const) {
    assert.ok(typeof row[key] === "string" && row[key].trim(), `Missing ${key} label`);
  }
  for (const value of [row.verdictLatencyMs, row.backupCalls, row.unnecessaryBackupCalls]) {
    assert.ok(value === undefined || (Number.isFinite(value) && value >= 0), "Invalid scope metric");
  }
  assert.ok((row.unnecessaryBackupCalls ?? 0) <= (row.backupCalls ?? 0), "Unnecessary calls cannot exceed total calls");
  return row;
}

// Replay only the scope decision. Backup extraction for line items and other
// post-verdict work is outside this comparison.
type ReplayObservation = Omit<Observation, "actual"> & {
  model?: string;
  local: { verdict: Verdict; confidence: number; elapsedMs: number };
  backup?: { verdict: Verdict | null; calls: number; elapsedMs: number };
};

function compareRejectionThresholds(rows: ReplayObservation[]) {
  return [0, 94, 95, 96, 97].map(minimumRejectionConfidence => {
    const replay = rows.map(row => {
      const local = row.local;
      assert.ok(verdicts.has(local.verdict) && Number.isFinite(local.confidence) &&
        local.confidence >= 0 && local.confidence <= 100, "Invalid local verdict or confidence");
      assert.ok(Number.isFinite(local.elapsedMs) && local.elapsedMs >= 0, "Invalid local latency");
      assert.ok(!row.backup || (Number.isInteger(row.backup.calls) && row.backup.calls > 0 &&
        Number.isFinite(row.backup.elapsedMs) && row.backup.elapsedMs >= 0), "Invalid backup replay");
      const needsBackup = local.verdict === "ambiguous" ||
        (local.verdict === "non_financial" && local.confidence < minimumRejectionConfidence);
      const backup = needsBackup ? row.backup : undefined;
      const actual = needsBackup ? backup?.verdict ?? null : local.verdict;
      const backupCalls = needsBackup ? backup?.calls : 0;
      return validateObservation({
        ...row, actual, backupCalls,
        verdictLatencyMs: actual === null ? undefined : local.elapsedMs + (backup?.elapsedMs ?? 0),
        // An independent label confirms whether the decisive local verdict
        // already answered the scope question before a backup was sent.
        unnecessaryBackupCalls: backupCalls === undefined ? undefined :
          local.verdict !== "ambiguous" && local.verdict === row.expected ? backupCalls : 0,
      });
    });
    return { minimumRejectionConfidence, ...summarizePhotoScope(replay) };
  });
}

const [, , input, format] = process.argv;
if (input) {
  const rows = JSON.parse(readFileSync(input, "utf8")) as (Observation & { case?: string; elapsedMs?: number })[];
  assert.ok(Array.isArray(rows), "Expected an array of observations.");
  if (format === "--thresholds") {
    const groups = new Map<string, ReplayObservation[]>();
    for (const row of rows as unknown as ReplayObservation[]) {
      const model = row.model ?? "default";
      const samples = groups.get(model) ?? [];
      samples.push(row);
      groups.set(model, samples);
    }
    console.log(JSON.stringify(Object.fromEntries([...groups].map(([model, samples]) =>
      [model, compareRejectionThresholds(samples)])), null, 2));
  } else {
    const observations = rows.map(row => {
      if (format !== "--backup") return validateObservation(row);
      const labels = backupCaseLabels[row.case as keyof typeof backupCaseLabels];
      assert.ok(labels, `Missing labels for backup case ${row.case}`);
      return validateObservation({ ...row, ...labels, platform: "server", verdictLatencyMs: row.verdictLatencyMs ?? row.elapsedMs });
    });
    console.log(JSON.stringify(summarizePhotoScope(observations), null, 2));
  }
}
