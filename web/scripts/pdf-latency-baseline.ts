// Local, read-only extraction benchmark and cohort rollup for timing traces.
// Run from web/ with local PDF/OCR dependencies installed. Set
// CLOVER_PDF_BENCH_CASE to comma-separated fixture IDs to run selected cases.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

type Fixture = {
  id: string; institution: string; source?: string; sourceDirectory?: string; sha256: string;
  pages: number; tags: string[]; passwordRequired: boolean;
};
type Outcome = "reached" | "password_required" | "review_required" | "failed" | "abandoned";
type Sample = {
  id: string; fixture: string; pages: number; pdfType: string; platform: string; network: string;
  processing: "cold" | "warm" | "not_applicable"; boundary: string; outcome: Outcome; ms: number;
  evidence?: { clientSurface?: string; pagesVerified?: number; rowsVerified?: number; balancesVerified?: boolean };
  pdfClass?: PdfClass;
};
const firstRow = "upload_start_to_first_visible_row";
const fullStatement = "upload_start_to_verified_statement";
const milestones = [firstRow, fullStatement] as const;
type Milestone = typeof milestones[number];
const budgetByClass = {
  text_layer:       { firstRow: 8_000,  full: 15_000, firstAdditionalPage: 300,  fullAdditionalPage: 500 },
  scanned:          { firstRow: 18_000, full: 35_000, firstAdditionalPage: 900,  fullAdditionalPage: 2_500 },
  hybrid:           { firstRow: 14_000, full: 30_000, firstAdditionalPage: 700,  fullAdditionalPage: 1_800 },
  multi_account:    { firstRow: 14_000, full: 30_000, firstAdditionalPage: 700,  fullAdditionalPage: 1_800 },
  password_unlocked:{ firstRow: 16_000, full: 32_000, firstAdditionalPage: 700,  fullAdditionalPage: 1_800 },
} as const;
type PdfClass = keyof typeof budgetByClass;
const minAttempts = 20;
const minReachRate = 0.95;

const script = fileURLToPath(import.meta.url);
const manifest = new URL("./fixtures/original-pdf-statements/manifest.json", import.meta.url);
const root = process.env.CLOVER_STATEMENT_SAMPLES_ROOT ?? join(homedir(), "Documents", "Bank Statements");
const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

async function resolveFixture(fixture: Fixture) {
  if (fixture.source) return join(root, fixture.source);
  assert(fixture.sourceDirectory);
  const directory = join(root, fixture.sourceDirectory);
  for (const name of await readdir(directory)) {
    if (!name.toLowerCase().endsWith(".pdf")) continue;
    const path = join(directory, name);
    if (sha256(await readFile(path)) === fixture.sha256) return path;
  }
  throw new Error(`Missing original for ${fixture.id}`);
}

async function sampleFixture(path: string, fixture: Fixture, run: string) {
  globalThis.fetch = async () => { throw new Error("The local PDF benchmark prohibits provider requests"); };
  const original = await readFile(path);
  assert.equal(sha256(original), fixture.sha256, `Source changed for ${fixture.id}`);
  let reader: typeof import("../lib/import-file-text.server") | undefined;
  const samples: Sample[] = [];
  try {
    for (const processing of ["cold", "warm"] as const) {
      // Fresh buffer and direct reader on every run. Warm reuses the loaded
      // runtime and OCR workers, without reading a persisted import/text cache.
      const sourceBytes = Uint8Array.from(original);
      const file = new File([sourceBytes], `${fixture.institution}.pdf`, { type: "application/pdf" });
      const startedAt = performance.now();
      let outcome: Outcome = "reached";
      try {
        reader ??= await import("../lib/import-file-text.server");
        const result = await reader.readUploadedFileText(file, undefined, { importMode: "statement", sourceBytes });
        if (!result.trim() || fixture.passwordRequired) outcome = "failed";
      } catch (error) {
        outcome = reader?.isPdfPasswordError(error) && fixture.passwordRequired ? "password_required" : "failed";
      }
      samples.push({
        id: `${fixture.id}:${run}:${processing}`, fixture: fixture.id, pages: fixture.pages,
        pdfType: fixture.tags[0], platform: "local_server", network: "in_process", processing,
        boundary: fixture.passwordRequired ? "reader_start_to_password_gate" : "reader_start_to_text",
        outcome, ms: performance.now() - startedAt,
      });
    }
  } finally {
    await reader?.shutdownImportOcrWorkers();
  }
  console.log("PDF_LATENCY_SAMPLE", JSON.stringify(samples));
}

const outcomes: Outcome[] = ["reached", "password_required", "review_required", "failed", "abandoned"];
function summarize(samples: Sample[]) {
  const ids = new Set<string>();
  const groups = new Map<string, Sample[]>();
  for (const sample of samples) {
    const metricId = JSON.stringify([sample.id, sample.boundary]);
    assert(!ids.has(metricId), "Duplicate sample for a timing boundary");
    ids.add(metricId);
    assert([sample.id, sample.fixture, sample.pdfType, sample.platform, sample.network, sample.boundary]
      .every(value => typeof value === "string" && value.length > 0));
    assert(Number.isInteger(sample.pages) && sample.pages >= 1 && Number.isFinite(sample.ms) && sample.ms >= 0);
    assert(["cold", "warm", "not_applicable"].includes(sample.processing));
    assert(outcomes.includes(sample.outcome));
    const key = JSON.stringify([sample.pages, sample.pdfType, sample.platform, sample.network, sample.processing, sample.boundary]);
    const group = groups.get(key) ?? [];
    group.push(sample);
    groups.set(key, group);
  }
  return [...groups.values()].map(group => {
    const [{ pages, pdfType, platform, network, processing, boundary }] = group;
    const counts = Object.fromEntries(outcomes.map(outcome => [outcome, group.filter(row => row.outcome === outcome).length]));
    const achieved = boundary === "reader_start_to_password_gate" ? "password_required" : "reached";
    const durations = group.filter(row => row.outcome === achieved).map(row => row.ms).sort((a, b) => a - b);
    const percentile = (q: number) => durations.length
      ? Math.round(durations[Math.ceil(q * durations.length) - 1]) : null;
    return {
      pages, pdfType, platform, network, processing, boundary,
      fixtures: new Set(group.map(row => row.fixture)).size, attempts: group.length, outcomes: counts,
      p50Ms: percentile(0.5), p90Ms: percentile(0.9), provisional: durations.length < 20,
    };
  });
}

function checkBudgets(samples: Sample[]) {
  summarize(samples); // Validate numeric values, outcomes and duplicate sample IDs.
  assert(samples.length > 0, "Provide paired end-to-end samples");
  const attempts = new Map<string, Partial<Record<Milestone, Sample>>>();
  for (const sample of samples) {
    assert(sample.boundary === firstRow || sample.boundary === fullStatement, "Extraction and server-save timings cannot satisfy a display budget");
    assert(sample.pdfClass && Object.hasOwn(budgetByClass, sample.pdfClass), "An explicit budgeted PDF class is required");
    if (sample.outcome === "reached") {
      if (sample.boundary === firstRow) {
        assert(["ios", "android", "mobile_web", "desktop_web"].includes(sample.platform) &&
          sample.evidence?.clientSurface === sample.platform, "First row requires matching client viewport evidence");
      } else {
        assert(sample.evidence?.pagesVerified === sample.pages &&
          Number.isSafeInteger(sample.evidence?.rowsVerified) && Number(sample.evidence?.rowsVerified) > 0 &&
          sample.evidence?.balancesVerified === true, "Full completion requires verified page, row and reconciliation evidence");
      }
    }
    const pair = attempts.get(sample.id) ?? {};
    pair[sample.boundary] = sample;
    attempts.set(sample.id, pair);
  }

  for (const pair of attempts.values()) {
    const first = pair[firstRow], full = pair[fullStatement];
    assert(first && full, "Every attempted upload needs separate first-row and full-completion outcomes");
    for (const key of ["fixture", "pages", "pdfClass", "pdfType", "platform", "network", "processing"] as const) {
      assert.equal(first[key], full[key], `Paired samples disagree on ${key}`);
    }
    // A complete server statement can precede the first rendered row when
    // polling or navigation delays the client. Do not force an ordering.
  }

  const cohorts = summarize(samples.map(sample => ({ ...sample, pdfType: sample.pdfClass! })));
  return cohorts.map(cohort => {
    const budget = budgetByClass[cohort.pdfType as PdfClass];
    const visible = cohort.boundary === firstRow;
    const p90BudgetMs = (visible ? budget.firstRow : budget.full) +
      (cohort.pages - 1) * (visible ? budget.firstAdditionalPage : budget.fullAdditionalPage);
    const reachRate = cohort.outcomes.reached / cohort.attempts;
    const withinBudget = cohort.p90Ms !== null && cohort.p90Ms <= p90BudgetMs && reachRate >= minReachRate;
    return {
      ...cohort, p90BudgetMs, reachRate, minReachRate, minAttempts,
      status: cohort.attempts < minAttempts ? "insufficient_samples" : withinBudget ? "pass" : "fail",
    };
  });
}

async function main() {
  const [command, value, encodedFixture, run] = process.argv.slice(2);
  if (command === "--child") {
    await sampleFixture(value, JSON.parse(encodedFixture), run);
    return;
  }
  if (command === "--summarize" || command === "--check-budgets") {
    const args = process.argv.slice(3);
    const requireAllClasses = command === "--check-budgets" && args.includes("--require-all-classes");
    const paths = args.filter(arg => !(requireAllClasses && arg === "--require-all-classes"));
    assert(paths.length > 0, "Provide at least one results JSON file");
    const samples = await Promise.all(paths.map(async path => {
      const input = JSON.parse(await readFile(path, "utf8"));
      return Array.isArray(input) ? input : input.samples;
    }));
    if (command === "--summarize") {
      console.log(JSON.stringify(summarize(samples.flat()), null, 2));
      return;
    }
    const cohorts = checkBudgets(samples.flat());
    const unmeasuredClasses = Object.keys(budgetByClass).filter(pdfClass => !cohorts.some(cohort => cohort.pdfType === pdfClass));
    console.log(JSON.stringify({ cohorts, unmeasuredClasses }, null, 2));
    if (cohorts.some(cohort => cohort.status !== "pass") || (requireAllClasses && unmeasuredClasses.length > 0)) process.exitCode = 1;
    return;
  }
  assert(command === undefined || command === "--runs", "Use --runs N, --summarize results.json, or --check-budgets results.json");
  const runs = value ? Number(value) : 10;
  assert(Number.isSafeInteger(runs) && runs > 0);
  const { cases } = JSON.parse(await readFile(manifest, "utf8")) as { cases: Fixture[] };
  const selected = process.env.CLOVER_PDF_BENCH_CASE?.split(",");
  const fixtures = selected ? cases.filter(fixture => selected.includes(fixture.id)) : cases;
  assert(fixtures.length, "No matching PDF benchmark fixture");
  const inputs = await Promise.all(fixtures.map(async fixture => ({ fixture, path: await resolveFixture(fixture) })));
  const execute = promisify(execFile);
  const samples: Sample[] = [];
  for (let i = 0; i < runs; i++) {
    for (const { fixture, path } of inputs) {
      try {
        const { stdout } = await execute(process.execPath, [...process.execArgv, script, "--child", path, JSON.stringify(fixture), String(i)], {
          timeout: 300_000, maxBuffer: 1_048_576,
        });
        const result = stdout.split("\n").find(line => line.startsWith("PDF_LATENCY_SAMPLE "));
        assert(result, `No timing returned for ${fixture.id}`);
        samples.push(...JSON.parse(result.slice("PDF_LATENCY_SAMPLE ".length)));
      } catch {
        throw new Error(`Local timing process failed for ${fixture.id} on run ${i + 1}`);
      }
    }
    console.error(`Finished PDF timing run ${i + 1}/${runs}`);
  }
  console.log(JSON.stringify({
    version: 1, runtime: { node: process.version, platform: process.platform, arch: process.arch },
    samples, cohorts: summarize(samples),
  }, null, 2));
}

void main().catch(error => {
  console.error(error instanceof Error ? error.message : "PDF baseline failed");
  process.exitCode = 1;
});
